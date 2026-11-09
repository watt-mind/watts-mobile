import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { hapticLight, hapticSuccess } from '@/src/lib/haptics';

import { activeStoreProductIds, hasActiveWebSubscription, summaryQueryState } from './adapters';
import { trackPaywallEvent } from './analytics';
import { createPurchaseLock, withPurchaseLock, type PurchaseLock } from './purchaseLock';
import { purchaseStorePackage, restoreStorePurchases } from './revenueCat';
import type { PlanChangeKind, StorePackage } from './types';
import { useReconcileSubscription, useSubscriptionSummary } from './useSubscriptions';

export type PurchaseFeedback = { type: 'success' | 'error' | 'info'; text: string } | null;

function confirmDoubleBilling(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'You already have a web subscription',
      'Your Coach Watts access is already billed on coachwatts.com. Subscribing here creates a second subscription — you would be charged twice until you cancel the web one.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Subscribe anyway', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Purchase/restore state shared by the billing screen and the contextual
 * paywall, so both behave identically (guards, haptics, reconcile, analytics).
 */
export function usePurchaseFlow(source: string) {
  const summary = useSubscriptionSummary();
  const reconcile = useReconcileSubscription();

  const [operation, setOperation] = useState<string | null>(null);
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PurchaseFeedback>(null);

  // Scoped to this hook instance rather than the module: a lock that somehow
  // leaked (a confirmation promise that never settles) would then block
  // purchasing only until the screen remounts, instead of for the whole app
  // session. Two paywall surfaces are never tappable at the same time.
  const lockRef = useRef<PurchaseLock | null>(null);
  if (lockRef.current === null) lockRef.current = createPurchaseLock();
  const lock = lockRef.current;

  const confirmWithServer = useCallback(
    async (successMessage: string) => {
      setOperation('Confirming with Coach Watts…');
      try {
        await reconcile.mutateAsync();
        hapticSuccess();
        setFeedback({ type: 'success', text: successMessage });
      } catch {
        setFeedback({
          type: 'info',
          text: 'The store completed the action, but Coach Watts is still confirming it. Pull down to refresh shortly.',
        });
      } finally {
        setOperation(null);
        setBusyPackageId(null);
      }
    },
    [reconcile],
  );

  const purchase = useCallback(
    // The whole body runs under the lock, taken synchronously on entry: a
    // second tap — this plan's CTA or another's — that lands before React has
    // repainted the CTAs as busy is dropped instead of starting a second
    // concurrent charge. `withPurchaseLock` releases on every exit path.
    async (item: StorePackage, kind: PlanChangeKind) => {
      await withPurchaseLock(lock, item.id, async () => {
        if (kind === 'current') return;

        // Belt-and-suspenders: the UI should already hide the plan chooser until
        // the summary settles, but never let a purchase through without it —
        // buying blind risks a double web+store charge or a stacked Play sub.
        if (summaryQueryState(summary) !== 'ready') {
          setFeedback({
            type: 'error',
            text: 'We could not confirm your current subscription status. Pull down to refresh and try again.',
          });
          return;
        }

        // Busy state goes up before the confirmation alert, not after it: while
        // that alert is pending the CTAs must already be disabled.
        setFeedback(null);
        setBusyPackageId(item.id);
        hapticLight();
        setOperation(`Opening ${item.tier === 'PRO' ? 'Pro' : 'Supporter'} checkout…`);

        // Stacking a store purchase on top of web billing charges twice.
        if (hasActiveWebSubscription(summary.data)) {
          const proceed = await confirmDoubleBilling();
          if (!proceed) {
            trackPaywallEvent('purchase_cancelled', { source, reason: 'web_subscription_guard' });
            // Clear the busy state we put up for the alert, so declining does
            // not leave every CTA stuck disabled.
            setOperation(null);
            setBusyPackageId(null);
            return;
          }
        }

        trackPaywallEvent('purchase_started', {
          source,
          tier: item.tier,
          period: item.period,
          kind,
        });

        try {
          // Google Play replaces rather than stacks only when told what to replace.
          const replaces =
            kind === 'upgrade' || kind === 'downgrade' || kind === 'switch-period'
              ? (activeStoreProductIds(summary.data)[0] ?? null)
              : null;
          const outcome = await purchaseStorePackage(item, replaces);

          if (outcome === 'cancelled') {
            trackPaywallEvent('purchase_cancelled', { source, tier: item.tier });
            setFeedback({ type: 'info', text: 'Purchase canceled. Nothing was charged.' });
          } else if (outcome === 'pending') {
            setFeedback({
              type: 'info',
              text: 'Payment is pending. Access will update after the store confirms it.',
            });
          } else {
            trackPaywallEvent('purchase_completed', {
              source,
              tier: item.tier,
              period: item.period,
            });
            await confirmWithServer(
              'Subscription confirmed! Your Coach Watts access is up to date.',
            );
          }
        } catch (error) {
          trackPaywallEvent('purchase_failed', { source, tier: item.tier });
          setFeedback({
            type: 'error',
            text: friendlyError(error, 'Purchase could not be completed'),
          });
        } finally {
          setOperation(null);
          setBusyPackageId(null);
        }
      });
    },
    [confirmWithServer, lock, source, summary],
  );

  const restore = useCallback(async () => {
    setFeedback(null);
    hapticLight();
    setOperation('Restoring purchases…');
    trackPaywallEvent('restore_started', { source });
    try {
      const found = await restoreStorePurchases();
      if (!found) {
        const entitledElsewhere = summary.data?.tier && summary.data.tier !== 'FREE';
        setFeedback({
          type: 'info',
          text: entitledElsewhere
            ? 'No App Store or Google Play purchases were found for this store account. Your Coach Watts access is active through another provider — nothing to restore.'
            : 'No restorable purchases were found for this store account. Make sure you are signed into the Apple ID or Google Play account used for the purchase.',
        });
        return;
      }
      trackPaywallEvent('restore_completed', { source });
      await confirmWithServer('Purchases restored and linked to this Coach Watts account.');
    } catch (error) {
      setFeedback({ type: 'error', text: friendlyError(error, 'Purchases could not be restored') });
    } finally {
      setOperation(null);
    }
  }, [confirmWithServer, source, summary.data]);

  return {
    summary,
    operation,
    busyPackageId,
    feedback,
    setFeedback,
    purchase,
    restore,
    isRestoring: operation === 'Restoring purchases…',
  };
}
