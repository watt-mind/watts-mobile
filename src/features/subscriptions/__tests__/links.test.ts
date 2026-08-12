import { describe, expect, it, vi } from 'vitest';

import { BILLING_SUPPORT_EMAIL, openExternalUrl, storeManagementUrl } from '../links';

const MAILTO = `mailto:${BILLING_SUPPORT_EMAIL}?subject=Billing%20Support`;

describe('storeManagementUrl', () => {
  it('falls back to the store-owned management pages', () => {
    expect(storeManagementUrl('APPLE', null)).toBe('https://apps.apple.com/account/subscriptions');
    expect(storeManagementUrl('GOOGLE', null)).toBe(
      'https://play.google.com/store/account/subscriptions',
    );
    expect(storeManagementUrl('STRIPE', 'https://example.com/billing')).toBeNull();
  });
});

describe('openExternalUrl', () => {
  it('reports success and never pre-checks support when openURL resolves', async () => {
    const openURL = vi.fn().mockResolvedValue(true);

    await expect(openExternalUrl(MAILTO, openURL)).resolves.toEqual({ ok: true });
    expect(openURL).toHaveBeenCalledWith(MAILTO);
  });

  it('surfaces the mail fallback only when openURL actually rejects', async () => {
    const openURL = vi.fn().mockRejectedValue(new Error('no activity found'));

    const result = await openExternalUrl(MAILTO, openURL);

    expect(result).toEqual({
      ok: false,
      message: `No mail app is set up on this device. Email us at ${BILLING_SUPPORT_EMAIL}.`,
    });
  });

  it('surfaces the browser fallback for non-mailto failures', async () => {
    const openURL = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await openExternalUrl('https://example.com/plans', openURL);

    expect(result).toEqual({
      ok: false,
      message: 'Could not open the link. Visit https://example.com/plans in your browser.',
    });
  });

  it('opens https links that resolve', async () => {
    const openURL = vi.fn().mockResolvedValue(undefined);

    await expect(openExternalUrl('https://example.com/plans', openURL)).resolves.toEqual({
      ok: true,
    });
  });
});
