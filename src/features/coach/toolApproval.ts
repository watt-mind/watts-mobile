import { ApiError } from '@/src/api/errors';

/**
 * What a failed tool-approval submission means for the user.
 *
 * A tool approval executes a *write* on the server (logging a meal, saving a
 * check-in). The approval request is a full agent turn streamed over SSE, so a
 * connection that drops mid-turn is indistinguishable from success on the
 * client — the server may already have performed the write. Inviting the
 * athlete to approve again in that state double-logs the meal (CW-494a), so a
 * lost response is never presented as a retryable failure.
 */
export type ApprovalFailure = {
  /**
   * True only when the server answered and refused — the tool definitely did
   * not run, so the approval card can safely come back.
   */
  resubmittable: boolean;
  message: string;
};

/** 4xx (except 408/429, which are retries of an unknown-outcome request). */
function isDefiniteRejection(status: number): boolean {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

/**
 * Classify an approval submission failure.
 *
 * @param rejectedMessage copy for "the server said no" (actionable).
 * @param unknownMessage copy for "we lost the response" (must NOT invite a
 * second approval — polling reveals whether the action landed).
 */
export function classifyApprovalFailure(
  error: unknown,
  copy: { rejected: string; unknown: string },
): ApprovalFailure {
  const status = errorStatus(error);
  if (status !== undefined && isDefiniteRejection(status)) {
    const message = error instanceof Error && error.message ? error.message : copy.rejected;
    return { resubmittable: true, message };
  }
  return { resubmittable: false, message: copy.unknown };
}

/**
 * Approvals already submitted this session are hidden from the bubble, so the
 * card cannot be tapped twice while the turn runs.
 */
export function filterSubmittedApprovals<T extends { toolCallId: string }>(
  approvals: T[],
  submittedIds: readonly string[],
): T[] {
  if (submittedIds.length === 0) return approvals;
  const submitted = new Set(submittedIds);
  return approvals.filter((approval) => !submitted.has(approval.toolCallId));
}
