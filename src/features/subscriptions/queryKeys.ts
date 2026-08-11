/**
 * Query keys for the subscription feature, kept in one pure module so the
 * reconcile fan-out is testable without mounting React Query.
 *
 * The bug this guards against: the reconcile success handler used to invalidate
 * `['entitlements']`, a key no query in the app ever used, while the key that
 * actually feeds the allowance UI (`QUOTA_ALLOWANCES_KEY`) was left alone. An
 * athlete who upgraded at a quota wall kept seeing "None left" for up to the
 * 60s `staleTime` — indistinguishable from a failed purchase.
 */

/** A React Query key as this feature writes them: a tuple of string segments. */
export type SubscriptionQueryKey = readonly string[];

export const SUBSCRIPTION_SUMMARY_KEY = ['subscription', 'summary'] as const;
export const SUBSCRIPTION_OFFERINGS_KEY = ['subscription', 'offerings'] as const;
export const QUOTA_ALLOWANCES_KEY = ['subscription', 'allowances'] as const;

/** Owned by the dashboard feature; invalidated here because tier gates its content. */
const TODAY_KEY = ['today'] as const;
/** Owned by the profile feature; carries the tier badge. */
const PROFILE_KEY = ['profile'] as const;

/**
 * Every query whose data can change when the server confirms a subscription
 * purchase or restore. Invalidated by `useReconcileSubscription`'s `onSuccess`.
 */
export function subscriptionReconcileInvalidationKeys(): readonly SubscriptionQueryKey[] {
  return [TODAY_KEY, PROFILE_KEY, QUOTA_ALLOWANCES_KEY];
}
