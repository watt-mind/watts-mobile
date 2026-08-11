import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

/**
 * App-wide TanStack defaults.
 *
 * `networkMode: 'offlineFirst'` is deliberate. Athletes run self-hosted Coach
 * Watts instances on a LAN or VPN, and NetInfo's public-internet probe cannot
 * vouch for those (captive portals report the same). Under the default 'online'
 * mode TanStack pauses every fetch whenever `onlineManager` says offline, and a
 * paused promise never settles — `invalidateQueries`/`mutateAsync` simply hang,
 * which is how the activation wizard became a dead end. Attempt the request and
 * let it fail loudly instead.
 *
 * Nothing relies on the pausing behaviour: code that needs the connectivity
 * signal reads `onlineManager.isOnline()` directly (health orchestrator,
 * offline wellness queue, OfflineBanner via useOfflineCached).
 */
export const APP_QUERY_DEFAULTS: DefaultOptions = {
  queries: {
    retry: 1,
    staleTime: 30_000,
    refetchOnReconnect: true,
    // Keep cached field reads readable offline between launches.
    gcTime: 1000 * 60 * 60 * 24 * 7,
    networkMode: 'offlineFirst',
  },
  mutations: {
    networkMode: 'offlineFirst',
  },
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS });
}
