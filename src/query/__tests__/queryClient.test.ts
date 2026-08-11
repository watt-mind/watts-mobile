import { describe, expect, it } from 'vitest';

import { APP_QUERY_DEFAULTS, createAppQueryClient } from '../queryClient';

describe('app query client defaults', () => {
  it('uses offlineFirst for queries and mutations', () => {
    // 'online' pauses fetches whenever NetInfo cannot reach the public internet,
    // and a paused promise never settles — self-hosted LAN/VPN instances and
    // captive portals would hang the app instead of erroring. (CW-466)
    expect(APP_QUERY_DEFAULTS.queries?.networkMode).toBe('offlineFirst');
    expect(APP_QUERY_DEFAULTS.mutations?.networkMode).toBe('offlineFirst');
  });

  it('applies those defaults to a constructed client', () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.networkMode).toBe('offlineFirst');
    expect(defaults.mutations?.networkMode).toBe('offlineFirst');
  });

  it('keeps the persisted-cache lifetime and reconnect refetch', () => {
    const defaults = createAppQueryClient().getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(1000 * 60 * 60 * 24 * 7);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
    expect(defaults.queries?.staleTime).toBe(30_000);
  });
});
