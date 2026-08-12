import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchSubscriptionSummary, reconcileSubscription } from './api';
import {
  SUBSCRIPTION_OFFERINGS_KEY,
  SUBSCRIPTION_SUMMARY_KEY,
  subscriptionReconcileInvalidationKeys,
} from './queryKeys';
import { fetchStorePackages } from './revenueCat';

// Re-exported so existing import sites keep working; `queryKeys.ts` owns them.
export { SUBSCRIPTION_OFFERINGS_KEY, SUBSCRIPTION_SUMMARY_KEY };

export function useSubscriptionSummary() {
  return useQuery({
    queryKey: SUBSCRIPTION_SUMMARY_KEY,
    queryFn: fetchSubscriptionSummary,
    staleTime: 15_000,
  });
}

export function useStoreOfferings(enabled: boolean) {
  return useQuery({
    queryKey: SUBSCRIPTION_OFFERINGS_KEY,
    queryFn: fetchStorePackages,
    enabled,
    staleTime: 60_000,
  });
}

export function useReconcileSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reconcileSubscription,
    onSuccess: async (summary) => {
      queryClient.setQueryData(SUBSCRIPTION_SUMMARY_KEY, summary);
      await Promise.all(
        subscriptionReconcileInvalidationKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
