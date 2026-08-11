import { describe, expect, it } from 'vitest';

import {
  applyAssistantTextDelta,
  approvalPreviewLine,
  extractPendingApprovals,
  hasActiveTurn,
  humanizeToolName,
  hydrateCoachMessages,
  isActionToolName,
  mergeLoadedMessages,
  messageCompletedAction,
  messageImageParts,
  messageText,
  nutritionToolSummaries,
  resolveToolDomain,
  toolInProgressSummaries,
  toolOutcomeSummaries,
  transformStoredMessage,
} from '../mapMessages';
import type { CoachUIMessage } from '../types';

describe('mapMessages', () => {
  it('hydrates user/assistant messages and drops tool rows', () => {
    const hydrated = hydrateCoachMessages([
      {
        id: 'u1',
        role: 'user',
        content: 'Hello',
        createdAt: '2026-07-19T10:00:00.000Z',
      },
      {
        id: 't1',
        role: 'tool',
        content: 'tool output',
        createdAt: '2026-07-19T10:00:01.000Z',
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hi there',
        parts: [{ type: 'text', text: 'Hi there' }],
        metadata: { turnStatus: 'COMPLETED', turnId: 'turn-1' },
        createdAt: '2026-07-19T10:00:02.000Z',
      },
    ]);

    expect(hydrated).toHaveLength(2);
    expect(hydrated[0]?.role).toBe('user');
    expect(messageText(hydrated[1])).toBe('Hi there');
  });

  it('applies assistant text deltas without losing prior text', () => {
    const initial: CoachUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hello',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { turnId: 'turn-1', turnStatus: 'STREAMING' },
      },
    ];

    const next = applyAssistantTextDelta(initial, {
      messageId: 'a1',
      turnId: 'turn-1',
      textDelta: ' world',
      status: 'STREAMING',
    });

    expect(messageText(next[0])).toBe('Hello world');
    expect(hasActiveTurn(next)).toBe(true);
  });

  it('drops a stale text delta that would revive a completed message', () => {
    const initial: CoachUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'All done.',
        parts: [{ type: 'text', text: 'All done.' }],
        metadata: { turnId: 'turn-1', turnStatus: 'COMPLETED' },
      },
    ];

    const next = applyAssistantTextDelta(initial, {
      messageId: 'a1',
      turnId: 'turn-1',
      textDelta: ' stray',
      status: 'STREAMING',
    });

    expect(messageText(next[0])).toBe('All done.');
    expect(next[0]?.metadata?.turnStatus).toBe('COMPLETED');
    expect(hasActiveTurn(next)).toBe(false);
  });

  it('drops a stale text delta with no status onto a completed message', () => {
    const initial: CoachUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'All done.',
        parts: [{ type: 'text', text: 'All done.' }],
        metadata: { turnId: 'turn-1', turnStatus: 'COMPLETED' },
      },
    ];

    const next = applyAssistantTextDelta(initial, {
      messageId: 'a1',
      turnId: 'turn-1',
      textDelta: ' stray',
    });

    expect(messageText(next[0])).toBe('All done.');
    expect(next[0]?.metadata?.turnStatus).toBe('COMPLETED');
    expect(hasActiveTurn(next)).toBe(false);
  });

  it('still applies a delta that carries its own terminal status', () => {
    const initial: CoachUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'All done',
        parts: [{ type: 'text', text: 'All done' }],
        metadata: { turnId: 'turn-1', turnStatus: 'COMPLETED' },
      },
    ];

    const next = applyAssistantTextDelta(initial, {
      messageId: 'a1',
      turnId: 'turn-1',
      textDelta: '.',
      status: 'COMPLETED',
    });

    expect(messageText(next[0])).toBe('All done.');
    expect(next[0]?.metadata?.turnStatus).toBe('COMPLETED');
    expect(hasActiveTurn(next)).toBe(false);
  });

  it('still appends an active delta to a streaming message', () => {
    const initial: CoachUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Nearly',
        parts: [{ type: 'text', text: 'Nearly' }],
        metadata: { turnId: 'turn-1', turnStatus: 'STREAMING' },
      },
    ];

    const next = applyAssistantTextDelta(initial, {
      messageId: 'a1',
      turnId: 'turn-1',
      textDelta: ' there',
      status: 'STREAMING',
    });

    expect(messageText(next[0])).toBe('Nearly there');
    expect(next[0]?.metadata?.turnStatus).toBe('STREAMING');
    expect(hasActiveTurn(next)).toBe(true);
  });

  it('still appends a new realtime draft when the delta targets an unknown message', () => {
    const initial: CoachUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'All done.',
        parts: [{ type: 'text', text: 'All done.' }],
        metadata: { turnId: 'turn-1', turnStatus: 'COMPLETED' },
      },
    ];

    const next = applyAssistantTextDelta(initial, {
      messageId: 'a2',
      turnId: 'turn-2',
      textDelta: 'Next',
    });

    expect(next).toHaveLength(2);
    expect(messageText(next[1])).toBe('Next');
    expect(next[1]?.metadata?.turnStatus).toBe('STREAMING');
    expect(next[1]?.metadata?.isRealtimeDraft).toBe(true);
  });

  it('does not regress terminal turn status when merging a stale active upsert', () => {
    const existing = transformStoredMessage({
      id: 'a1',
      role: 'assistant',
      content: 'Done',
      metadata: { turnId: 'turn-1', turnStatus: 'COMPLETED' },
    });
    const incoming = transformStoredMessage({
      id: 'a1',
      role: 'assistant',
      content: 'Done',
      metadata: { turnId: 'turn-1', turnStatus: 'STREAMING' },
    });

    const merged = mergeLoadedMessages([existing], [incoming]);
    expect(merged[0]?.metadata?.turnStatus).toBe('COMPLETED');
  });

  it('preserves image file parts and synthesizes tool approvals', () => {
    const message = transformStoredMessage({
      id: 'a1',
      role: 'assistant',
      content: 'Looks like oatmeal',
      parts: [
        { type: 'text', text: 'Looks like oatmeal' },
        {
          type: 'file',
          url: 'https://example.com/meal.jpg',
          mediaType: 'image/jpeg',
          filename: 'meal.jpg',
        },
      ],
      metadata: {
        pendingApprovals: [
          { toolCallId: 'call-1', toolName: 'log_nutrition_meal', args: { name: 'Oatmeal' } },
        ],
      },
    });

    expect(messageImageParts(message)).toHaveLength(1);
    expect(extractPendingApprovals(message)[0]?.toolCallId).toBe('call-1');
  });

  it('summarizes completed nutrition tool parts', () => {
    const message: CoachUIMessage = {
      id: 'a2',
      role: 'assistant',
      parts: [
        {
          type: 'tool-log_nutrition_meal',
          state: 'output-available',
          toolCallId: 'call-2',
          output: { ok: true },
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    expect(nutritionToolSummaries(message)[0]).toMatch(/Meal logged/i);
    expect(toolOutcomeSummaries(message)[0]?.status).toBe('success');
    expect(toolOutcomeSummaries(message)[0]?.domain).toBe('nutrition');
  });

  it('summarizes recovery and wellness tool successes', () => {
    const message: CoachUIMessage = {
      id: 'a3',
      role: 'assistant',
      parts: [
        {
          type: 'tool-record_wellness_event',
          state: 'output-available',
          toolCallId: 'call-3',
          output: { ok: true },
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-get_wellness_metrics',
          state: 'result',
          toolCallId: 'call-4',
          result: { count: 1 },
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    const outcomes = toolOutcomeSummaries(message);
    expect(outcomes.find((o) => o.toolName === 'record_wellness_event')?.message).toMatch(
      /Recovery event logged/i,
    );
    expect(outcomes.find((o) => o.toolName === 'get_wellness_metrics')?.message).toMatch(
      /recovery metrics/i,
    );
    expect(outcomes.find((o) => o.toolName === 'record_wellness_event')?.domain).toBe('wellness');
  });

  it('uses curated copy for companion planned / recommendation / activity tools', () => {
    const message: CoachUIMessage = {
      id: 'a4',
      role: 'assistant',
      parts: [
        {
          type: 'tool-create_planned_workout',
          state: 'output-available',
          toolCallId: 'call-5',
          output: { id: 'pw-1' },
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-recommend_workout',
          state: 'output-available',
          toolCallId: 'call-5b',
          output: { ok: true },
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-get_recent_workouts',
          state: 'output-available',
          toolCallId: 'call-5c',
          output: { count: 3 },
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-get_nutrition_log',
          state: 'output-available',
          toolCallId: 'call-5d',
          output: { meals: [] },
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    const outcomes = toolOutcomeSummaries(message);
    expect(outcomes.find((o) => o.toolName === 'create_planned_workout')).toMatchObject({
      message: expect.stringMatching(/Planned session created/i),
      domain: 'planning',
    });
    expect(outcomes.find((o) => o.toolName === 'recommend_workout')).toMatchObject({
      message: expect.stringMatching(/recommendation ready/i),
      domain: 'planning',
    });
    expect(outcomes.find((o) => o.toolName === 'get_recent_workouts')).toMatchObject({
      message: expect.stringMatching(/recent workouts/i),
      domain: 'workouts',
    });
    expect(outcomes.find((o) => o.toolName === 'get_nutrition_log')).toMatchObject({
      message: expect.stringMatching(/nutrition log/i),
      domain: 'nutrition',
    });
  });

  it('uses a generic success fallback for unknown tools', () => {
    const message: CoachUIMessage = {
      id: 'a4b',
      role: 'assistant',
      parts: [
        {
          type: 'tool-perform_calculation',
          state: 'output-available',
          toolCallId: 'call-5e',
          output: { value: 42 },
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    const outcome = toolOutcomeSummaries(message)[0];
    expect(outcome?.status).toBe('success');
    expect(outcome?.message).toMatch(/Coach updated Perform Calculation/i);
    expect(outcome?.domain).toBe('other');
    expect(humanizeToolName('create_planned_workout')).toBe('Create Planned Workout');
  });

  it('surfaces failed and denied tool states', () => {
    const message: CoachUIMessage = {
      id: 'a5',
      role: 'assistant',
      parts: [
        {
          type: 'tool-log_nutrition_meal',
          state: 'output-error',
          toolCallId: 'call-6',
          errorText: 'quota',
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-record_wellness_event',
          state: 'output-denied',
          toolCallId: 'call-7',
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    const outcomes = toolOutcomeSummaries(message);
    expect(outcomes.find((o) => o.toolName === 'log_nutrition_meal')).toMatchObject({
      status: 'failure',
      message: expect.stringMatching(/Couldn't complete/i),
    });
    expect(outcomes.find((o) => o.toolName === 'record_wellness_event')).toMatchObject({
      status: 'denied',
      message: expect.stringMatching(/was not applied/i),
    });
  });

  it('maps tool names into domain buckets', () => {
    expect(resolveToolDomain('log_hydration_intake')).toBe('nutrition');
    expect(resolveToolDomain('get_wellness_events')).toBe('wellness');
    expect(resolveToolDomain('reschedule_planned_workout')).toBe('planning');
    expect(resolveToolDomain('list_pending_recommendations')).toBe('planning');
    expect(resolveToolDomain('get_workout_details')).toBe('workouts');
    expect(resolveToolDomain('perform_calculation')).toBe('other');
  });

  it('summarizes in-progress tool parts and clears when terminal', () => {
    const running: CoachUIMessage = {
      id: 'a6',
      role: 'assistant',
      parts: [
        {
          type: 'tool-create_planned_workout',
          state: 'call',
          toolCallId: 'call-8',
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-get_recent_workouts',
          state: 'input-streaming',
          toolCallId: 'call-9',
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    const progress = toolInProgressSummaries(running);
    expect(progress).toHaveLength(2);
    expect(progress.find((p) => p.toolName === 'create_planned_workout')).toMatchObject({
      label: expect.stringMatching(/Create Planned Workout/i),
      domain: 'planning',
    });
    expect(toolOutcomeSummaries(running)).toHaveLength(0);

    const done: CoachUIMessage = {
      ...running,
      parts: [
        {
          type: 'tool-create_planned_workout',
          state: 'output-available',
          toolCallId: 'call-8',
          output: { id: 'pw-1' },
        } as unknown as CoachUIMessage['parts'][number],
        {
          type: 'tool-get_recent_workouts',
          state: 'input-streaming',
          toolCallId: 'call-9',
        } as unknown as CoachUIMessage['parts'][number],
      ],
    };
    expect(toolInProgressSummaries(done).map((p) => p.id)).toEqual(['call-9']);
    expect(toolOutcomeSummaries(done).map((o) => o.id)).toEqual(['call-8']);
  });

  it('builds approval preview from common args', () => {
    expect(approvalPreviewLine({ title: 'Threshold intervals', date: '2026-07-21' })).toBe(
      'Threshold intervals',
    );
    expect(approvalPreviewLine({ name: 'Oatmeal' })).toBe('Oatmeal');
    expect(approvalPreviewLine({ date: '2026-07-21' })).toBe('2026-07-21');
    expect(approvalPreviewLine({ sport: 'bike' })).toBeNull();
    expect(approvalPreviewLine(null)).toBeNull();
  });

  it('treats write verbs as actions and reads as non-actions', () => {
    for (const name of [
      'log_nutrition_meal',
      'create_planned_workout',
      'update_wellness_event',
      'delete_hydration',
      'patch_nutrition_items',
      'record_wellness_event',
      'reschedule_planned_workout',
      'recommend_workout',
      'tool-log_hydration_intake',
    ]) {
      expect(isActionToolName(name)).toBe(true);
    }

    for (const name of [
      'get_nutrition_log',
      'get_planned_workouts',
      'list_pending_recommendations',
      'search_workouts',
      'some_unknown_tool',
    ]) {
      expect(isActionToolName(name)).toBe(false);
    }
  });

  it('flags only messages whose write tool succeeded', () => {
    const base: CoachUIMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [],
      content: '',
      createdAt: new Date(),
    };

    const withPart = (part: unknown): CoachUIMessage => ({
      ...base,
      parts: [part as CoachUIMessage['parts'][number]],
    });

    expect(
      messageCompletedAction(
        withPart({
          type: 'tool-log_nutrition_meal',
          state: 'output-available',
          toolCallId: 'c1',
          output: { id: 'm-1' },
        }),
      ),
    ).toBe(true);

    // Read-only lookup succeeded — no reward.
    expect(
      messageCompletedAction(
        withPart({
          type: 'tool-get_planned_workouts',
          state: 'output-available',
          toolCallId: 'c2',
          output: { items: [] },
        }),
      ),
    ).toBe(false);

    // Write tool that errored — no reward.
    expect(
      messageCompletedAction(
        withPart({
          type: 'tool-create_planned_workout',
          state: 'output-error',
          toolCallId: 'c3',
          errorText: 'nope',
        }),
      ),
    ).toBe(false);

    expect(messageCompletedAction(base)).toBe(false);
  });
});
