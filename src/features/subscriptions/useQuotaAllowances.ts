import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { formatAllowanceHint } from './allowanceCopy';
import { QUOTA_ALLOWANCES_KEY } from './queryKeys';
import { fetchQuotaAllowances, type QuotaAllowance } from './quotaApi';
import type { QuotaFeature } from './quota';

// Re-exported so existing import sites keep working; `queryKeys.ts` owns it.
export { QUOTA_ALLOWANCES_KEY };

export function useQuotaAllowances() {
  return useQuery({
    queryKey: QUOTA_ALLOWANCES_KEY,
    queryFn: fetchQuotaAllowances,
    staleTime: 60_000,
  });
}

/**
 * Short warning for a trigger control ("2 left"), or null while the allowance is
 * comfortable. Deliberately silent above the threshold — a countdown on every
 * button is noise, and the point is only to remove the surprise.
 */
export function useAllowanceHint(feature: QuotaFeature): string | null {
  const { data } = useQuotaAllowances();
  const allowance = data?.allowances.find((item) => item.feature === feature);
  if (!allowance) return null;

  const resetPassed = allowance.resetsAt ? new Date(allowance.resetsAt) <= new Date() : false;
  return formatAllowanceHint(resetPassed ? allowance.limit : allowance.remaining);
}

export function useAllowanceFor(feature: QuotaFeature): QuotaAllowance | null {
  const { data } = useQuotaAllowances();
  return data?.allowances.find((item) => item.feature === feature) ?? null;
}

/** Refresh allowances after an action that consumed one. */
export function useRefreshQuotaAllowances() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUOTA_ALLOWANCES_KEY });
  }, [queryClient]);
}
