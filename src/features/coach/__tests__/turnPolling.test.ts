import { describe, expect, it } from 'vitest';

import {
  countAssistantMessages,
  hasFreshAssistantReply,
  shouldClearAwaitingTurnStart,
  shouldPollTurn,
  shouldStopTurnPolling,
  type TurnPollingSignals,
} from '../turnPolling';
import type { CoachUIMessage } from '../types';

const NOW = 1_700_000_000_000;

function signals(overrides: Partial<TurnPollingSignals> = {}): TurnPollingSignals {
  return {
    roomId: 'room-1',
    hasActiveTurn: false,
    awaitingTurnStart: false,
    assistantCount: 0,
    assistantBaseline: 0,
    pollGraceUntil: 0,
    now: NOW,
    ...overrides,
  };
}

function message(role: 'user' | 'assistant', id: string): CoachUIMessage {
  return { id, role, parts: [], content: '', createdAt: new Date(NOW) } as CoachUIMessage;
}

describe('countAssistantMessages', () => {
  it('counts only assistant rows', () => {
    expect(countAssistantMessages([])).toBe(0);
    expect(
      countAssistantMessages([
        message('user', 'u1'),
        message('assistant', 'a1'),
        message('user', 'u2'),
        message('assistant', 'a2'),
      ]),
    ).toBe(2);
  });
});

describe('shouldPollTurn', () => {
  it('never polls without a room', () => {
    expect(shouldPollTurn(signals({ roomId: null, awaitingTurnStart: true }))).toBe(false);
  });

  it('polls while a turn is active', () => {
    expect(shouldPollTurn(signals({ hasActiveTurn: true }))).toBe(true);
  });

  it('polls while a send is awaiting its turn start', () => {
    expect(shouldPollTurn(signals({ awaitingTurnStart: true }))).toBe(true);
  });

  // CW-488 regression: this is the exact state right after send() in an
  // ongoing chat — the previous assistant turn is COMPLETED, an assistant
  // message exists, the ref-synced awaiting flag has not landed yet, and the
  // grace window was armed microseconds ago. The old predicate short-circuited
  // on `hasAssistant ||` and refused to start the timer, so the reply never
  // arrived on a WebSocket-less network.
  it('polls inside the grace window even when the chat already has an assistant reply', () => {
    expect(
      shouldPollTurn(
        signals({
          hasActiveTurn: false,
          awaitingTurnStart: false,
          assistantCount: 3,
          assistantBaseline: 3,
          pollGraceUntil: NOW + 15_000,
        }),
      ),
    ).toBe(true);
  });

  it('stops once a new assistant reply lands inside the grace window', () => {
    expect(
      shouldPollTurn(
        signals({
          assistantCount: 4,
          assistantBaseline: 3,
          pollGraceUntil: NOW + 15_000,
        }),
      ),
    ).toBe(false);
  });

  it('stops when the grace window has expired and nothing is in flight', () => {
    expect(shouldPollTurn(signals({ pollGraceUntil: NOW - 1 }))).toBe(false);
    expect(shouldPollTurn(signals({ pollGraceUntil: NOW }))).toBe(false);
  });

  it('keeps polling a first-ever turn that has produced no assistant message yet', () => {
    expect(
      shouldPollTurn(
        signals({ assistantCount: 0, assistantBaseline: 0, pollGraceUntil: NOW + 5_000 }),
      ),
    ).toBe(true);
  });

  it('does not poll a freshly opened idle room', () => {
    expect(shouldPollTurn(signals({ assistantCount: 2, assistantBaseline: 0 }))).toBe(false);
  });

  it('shouldStopTurnPolling is the exact inverse', () => {
    const cases: TurnPollingSignals[] = [
      signals({ hasActiveTurn: true }),
      signals({ awaitingTurnStart: true }),
      signals({ pollGraceUntil: NOW + 1_000 }),
      signals({ pollGraceUntil: NOW - 1_000 }),
      signals({ roomId: null }),
    ];
    for (const state of cases) {
      expect(shouldStopTurnPolling(state)).toBe(!shouldPollTurn(state));
    }
  });
});

describe('hasFreshAssistantReply', () => {
  it('requires strictly more assistants than the armed baseline', () => {
    expect(hasFreshAssistantReply({ assistantCount: 1, assistantBaseline: 1 })).toBe(false);
    expect(hasFreshAssistantReply({ assistantCount: 2, assistantBaseline: 1 })).toBe(true);
    // A transient shrink (hidden/removed row) must not read as "reply landed".
    expect(hasFreshAssistantReply({ assistantCount: 0, assistantBaseline: 1 })).toBe(false);
  });
});

describe('shouldClearAwaitingTurnStart', () => {
  // CW-488 compounding bug: the old check was
  // `transformed.some(m => m.role === 'assistant' || isActiveTurnStatus(...))`
  // over the whole thread, so a background load in an ongoing chat cleared the
  // flag while the new turn had not started.
  it('does not clear on a load that only contains the previous, completed reply', () => {
    expect(
      shouldClearAwaitingTurnStart({
        hasActiveTurn: false,
        assistantCount: 2,
        assistantBaseline: 2,
      }),
    ).toBe(false);
  });

  it('clears once the new turn is active', () => {
    expect(
      shouldClearAwaitingTurnStart({
        hasActiveTurn: true,
        assistantCount: 2,
        assistantBaseline: 2,
      }),
    ).toBe(true);
  });

  it('clears once a new assistant message exists', () => {
    expect(
      shouldClearAwaitingTurnStart({
        hasActiveTurn: false,
        assistantCount: 3,
        assistantBaseline: 2,
      }),
    ).toBe(true);
  });
});
