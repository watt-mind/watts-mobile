import { describe, expect, it } from 'vitest';

import {
  QUOTA_ALLOWANCES_KEY,
  SUBSCRIPTION_OFFERINGS_KEY,
  SUBSCRIPTION_SUMMARY_KEY,
  subscriptionReconcileInvalidationKeys,
} from '../queryKeys';

describe('subscriptionReconcileInvalidationKeys', () => {
  it('invalidates the allowances query so the quota card refetches after an upgrade', () => {
    expect(subscriptionReconcileInvalidationKeys()).toContainEqual(QUOTA_ALLOWANCES_KEY);
  });

  it('no longer invalidates the dead entitlements key', () => {
    const keys = subscriptionReconcileInvalidationKeys();
    expect(keys.some((key) => key[0] === 'entitlements')).toBe(false);
  });

  it('still invalidates the tier-dependent today and profile queries', () => {
    const keys = subscriptionReconcileInvalidationKeys();
    expect(keys).toContainEqual(['today']);
    expect(keys).toContainEqual(['profile']);
  });

  it('leaves the summary key out — reconcile writes it directly via setQueryData', () => {
    expect(subscriptionReconcileInvalidationKeys()).not.toContainEqual(SUBSCRIPTION_SUMMARY_KEY);
  });

  it('keeps the feature query keys distinct', () => {
    const keys = [SUBSCRIPTION_SUMMARY_KEY, SUBSCRIPTION_OFFERINGS_KEY, QUOTA_ALLOWANCES_KEY].map(
      (key) => key.join('/'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
