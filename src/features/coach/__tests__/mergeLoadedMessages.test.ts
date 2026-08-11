import { describe, expect, it } from 'vitest';

import { mergeLoadedMessages } from '../mapMessages';
import type { CoachUIMessage } from '../types';

function message(
  id: string,
  role: 'user' | 'assistant',
  text: string,
  createdAt?: string,
): CoachUIMessage {
  return {
    id,
    role,
    content: text,
    parts: [{ type: 'text', text }],
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
  } as CoachUIMessage;
}

const T0 = '2026-07-19T10:00:00.000Z';
const T1 = '2026-07-19T10:00:05.000Z';
const T2 = '2026-07-19T10:00:09.000Z';

describe('mergeLoadedMessages (CW-494c)', () => {
  // The failing case: a silent poll/realtime reload lands between the
  // optimistic user message and the server persisting it. The old
  // implementation returned exactly the server rows, so the athlete's own
  // bubble disappeared mid-stream.
  it('keeps an optimistic user message the server has not persisted yet', () => {
    const local = [
      message('u1', 'user', 'How was my ride?', T0),
      message('a1', 'assistant', 'Solid session.', T1),
      message('local-user-2', 'user', 'And my sleep?', T2),
    ];
    const loaded = [
      message('u1', 'user', 'How was my ride?', T0),
      message('a1', 'assistant', 'Solid session.', T1),
    ];

    const merged = mergeLoadedMessages(local, loaded);

    expect(merged.map((m) => m.id)).toEqual(['u1', 'a1', 'local-user-2']);
  });

  it('keeps an in-flight realtime assistant draft that has no server row yet', () => {
    const draft = {
      ...message('draft-1', 'assistant', 'Let me check', T2),
      metadata: { isRealtimeDraft: true, turnStatus: 'STREAMING' },
    } as CoachUIMessage;
    const local = [message('u1', 'user', 'Hi', T0), draft];
    const loaded = [message('u1', 'user', 'Hi', T0)];

    const merged = mergeLoadedMessages(local, loaded);

    expect(merged.map((m) => m.id)).toEqual(['u1', 'draft-1']);
    expect(merged[1]?.metadata?.isRealtimeDraft).toBe(true);
  });

  it('keeps a local message that has no timestamp at all', () => {
    const local = [message('u1', 'user', 'Hi', T0), message('optimistic', 'user', 'Second')];
    const loaded = [message('u1', 'user', 'Hi', T0)];

    expect(mergeLoadedMessages(local, loaded).map((m) => m.id)).toEqual(['u1', 'optimistic']);
  });

  it('drops a local-only message that predates the newest loaded row', () => {
    // Older local rows the server no longer returns were genuinely removed —
    // the union must not resurrect them.
    const local = [message('stale', 'assistant', 'Deleted reply', T0)];
    const loaded = [message('a1', 'assistant', 'Current reply', T2)];

    expect(mergeLoadedMessages(local, loaded).map((m) => m.id)).toEqual(['a1']);
  });

  it('drops an optimistic message the server persisted under a different id', () => {
    const local = [message('local-abc', 'user', 'And my sleep?', T1)];
    const loaded = [message('server-1', 'user', 'And my sleep?', T2)];

    expect(mergeLoadedMessages(local, loaded).map((m) => m.id)).toEqual(['server-1']);
  });

  it('still merges streamed text into a matched server row', () => {
    const local = [
      {
        ...message('a1', 'assistant', 'Long streamed answer', T1),
        metadata: { turnStatus: 'STREAMING' },
      } as CoachUIMessage,
    ];
    const loaded = [message('a1', 'assistant', 'Long', T1)];

    const merged = mergeLoadedMessages(local, loaded);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe('Long streamed answer');
  });

  it('returns the server list unchanged when nothing is local-only', () => {
    const loaded = [message('u1', 'user', 'Hi', T0), message('a1', 'assistant', 'Hello', T1)];
    expect(mergeLoadedMessages([], loaded).map((m) => m.id)).toEqual(['u1', 'a1']);
  });
});
