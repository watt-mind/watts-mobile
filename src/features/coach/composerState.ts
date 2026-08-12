import type { QuotaInfo } from '@/src/features/subscriptions/quota';

/** The two pieces of feedback the composer shows under the message list. */
export type ComposerFeedback = {
  sendError: string | null;
  sendQuota: QuotaInfo | null;
};

/**
 * Feedback state to apply when a new send starts.
 *
 * Both the failure text AND the quota card belong to the *previous* attempt.
 * The quota card used to survive a successful send (only a room switch cleared
 * it), so an athlete who upgraded or waited out the reset kept staring at
 * "you've hit your limit" while the coach replied above it (CW-494d).
 */
export function feedbackOnSendStart(): ComposerFeedback {
  return { sendError: null, sendQuota: null };
}
