import type { CoachUIMessage } from './types';

/**
 * Decision logic for the reply-polling fallback.
 *
 * Polling is the only way a reply arrives when the WebSocket cannot connect
 * (blocked `wss:`, a self-hosted instance without `/api/websocket`, captive
 * wifi). The hook owns the timers; every "should we still be polling?" call
 * routes through here so the sequencing is testable without a fake transport.
 */

export type TurnPollingSignals = {
  roomId: string | null;
  /** The newest assistant message is in a non-terminal turn status. */
  hasActiveTurn: boolean;
  /** A send/approval/resume happened and no turn has been observed yet. */
  awaitingTurnStart: boolean;
  /** Assistant messages currently in the thread. */
  assistantCount: number;
  /** Assistant count captured when the current grace window was armed. */
  assistantBaseline: number;
  /** Epoch ms until which polling is forced (0 when no window is armed). */
  pollGraceUntil: number;
  now: number;
};

/** Count assistant messages — the baseline unit for "did a new reply land?". */
export function countAssistantMessages(messages: CoachUIMessage[]): number {
  return messages.reduce(
    (total, message) => (message?.role === 'assistant' ? total + 1 : total),
    0,
  );
}

/**
 * True once an assistant message exists that was not there when the grace
 * window was armed.
 *
 * `hasAssistant` on its own is NOT evidence that the reply we are waiting for
 * arrived: every chat past its first exchange already has one. Treating it as
 * evidence is what killed the fallback in ongoing chats (CW-488).
 */
export function hasFreshAssistantReply(
  signals: Pick<TurnPollingSignals, 'assistantCount' | 'assistantBaseline'>,
): boolean {
  return signals.assistantCount > signals.assistantBaseline;
}

/**
 * Should the turn poll timer be running?
 *
 * An active turn or a pending turn start always polls. Otherwise the grace
 * window is authoritative: while it is open we keep polling unless a *new*
 * assistant reply has already landed (which ends the wait early and keeps the
 * per-turn request count where it was before CW-488).
 */
export function shouldPollTurn(signals: TurnPollingSignals): boolean {
  if (!signals.roomId) return false;
  if (signals.hasActiveTurn) return true;
  if (signals.awaitingTurnStart) return true;
  if (signals.now < signals.pollGraceUntil && !hasFreshAssistantReply(signals)) return true;
  return false;
}

/** Inverse of {@link shouldPollTurn}, for the stop check inside a poll tick. */
export function shouldStopTurnPolling(signals: TurnPollingSignals): boolean {
  return !shouldPollTurn(signals);
}

/**
 * Should a completed message load clear `awaitingTurnStart`?
 *
 * Scoped to the turn we are waiting for. The old check asked whether the whole
 * thread contained any assistant message, which is unconditionally true in an
 * ongoing chat — so the first background load after a send cleared the flag
 * before the new turn had started, and the poll then stopped itself (CW-488).
 */
export function shouldClearAwaitingTurnStart(signals: {
  hasActiveTurn: boolean;
  assistantCount: number;
  assistantBaseline: number;
}): boolean {
  if (signals.hasActiveTurn) return true;
  return hasFreshAssistantReply(signals);
}
