import { describe, expect, it } from 'vitest';

import { ApiError } from '@/src/api/errors';

import { classifyApprovalFailure, filterSubmittedApprovals } from '../toolApproval';

const COPY = { rejected: 'Tool approval failed', unknown: 'Lost connection while confirming' };

describe('classifyApprovalFailure (CW-494a)', () => {
  it('treats a 4xx as a definite rejection the user may act on again', () => {
    const result = classifyApprovalFailure(new ApiError('Approval expired', 409), COPY);
    expect(result.resubmittable).toBe(true);
    expect(result.message).toBe('Approval expired');
  });

  // The double-logging case: the server executed the nutrition write and then
  // the connection dropped mid-stream. Offering "try again" here logs the meal
  // twice, so an unknown outcome is never resubmittable.
  it('never invites a retry after a dropped connection', () => {
    const result = classifyApprovalFailure(new TypeError('Network request failed'), COPY);
    expect(result.resubmittable).toBe(false);
    expect(result.message).toBe(COPY.unknown);
  });

  it('never invites a retry on a 5xx — the write may already have landed', () => {
    expect(classifyApprovalFailure(new ApiError('Boom', 500), COPY).resubmittable).toBe(false);
    expect(classifyApprovalFailure(new ApiError('Bad gateway', 502), COPY).resubmittable).toBe(
      false,
    );
  });

  it('treats timeout/rate-limit statuses as unknown, not rejection', () => {
    expect(classifyApprovalFailure(new ApiError('Timeout', 408), COPY).resubmittable).toBe(false);
    expect(classifyApprovalFailure(new ApiError('Slow down', 429), COPY).resubmittable).toBe(false);
  });

  it('reads a status off a plain error-shaped object', () => {
    expect(classifyApprovalFailure({ status: 400, message: 'Bad' }, COPY).resubmittable).toBe(true);
  });

  it('falls back to the rejected copy when a 4xx carries no message', () => {
    expect(classifyApprovalFailure({ status: 422 }, COPY).message).toBe(COPY.rejected);
  });
});

describe('filterSubmittedApprovals', () => {
  const approvals = [{ toolCallId: 'call-1' }, { toolCallId: 'call-2' }];

  it('hides approvals already submitted so the card cannot be tapped twice', () => {
    expect(filterSubmittedApprovals(approvals, ['call-1'])).toEqual([{ toolCallId: 'call-2' }]);
  });

  it('returns the list untouched when nothing was submitted', () => {
    expect(filterSubmittedApprovals(approvals, [])).toBe(approvals);
  });
});
