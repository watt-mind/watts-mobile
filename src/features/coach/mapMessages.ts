import { displayAthleteText } from './seedContext';
import {
  ACTIVE_TURN_STATUSES,
  ACTIVITY_TOOL_NAMES,
  NUTRITION_TOOL_NAMES,
  PLANNED_TOOL_NAMES,
  RECOMMENDATION_TOOL_NAMES,
  RECOVERY_TOOL_NAMES,
  TERMINAL_TURN_STATUSES,
  WELLNESS_TOOL_NAMES,
  type CoachUIMessage,
  type PendingChatApproval,
  type StoredChatMessage,
  type ToolDomain,
  type ToolInProgressSummary,
  type ToolOutcomeStatus,
  type ToolOutcomeSummary,
} from './types';

export function isActiveTurnStatus(status: string | null | undefined): boolean {
  return ACTIVE_TURN_STATUSES.includes(status as (typeof ACTIVE_TURN_STATUSES)[number]);
}

export function isTerminalTurnStatus(status: string | null | undefined): boolean {
  return TERMINAL_TURN_STATUSES.includes(status as (typeof TERMINAL_TURN_STATUSES)[number]);
}

export function messageText(
  message: CoachUIMessage | StoredChatMessage | null | undefined,
): string {
  if (!message) return '';
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content;
  }
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map((part) => {
      if (part && typeof part === 'object' && 'type' in part && part.type === 'text') {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

/** Athlete-facing text: strips chat seed context from user bubbles. */
export function displayMessageText(
  message: CoachUIMessage | StoredChatMessage | null | undefined,
): string {
  const raw = messageText(message);
  if (!message || message.role !== 'user') return raw;
  return displayAthleteText(raw);
}

export function messageImageParts(
  message: CoachUIMessage | StoredChatMessage | null | undefined,
): { url: string; mediaType?: string; filename?: string }[] {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const images: { url: string; mediaType?: string; filename?: string }[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const typed = part as {
      type?: string;
      url?: string;
      mediaType?: string;
      filename?: string;
    };
    if (typed.type !== 'file' || !typed.url) continue;
    const mediaType = typed.mediaType || '';
    if (mediaType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(typed.url)) {
      images.push({
        url: typed.url,
        mediaType: typed.mediaType,
        filename: typed.filename,
      });
    }
  }
  return images;
}

function synthesizeApprovalParts(
  existingParts: CoachUIMessage['parts'],
  pendingApprovals: PendingChatApproval[] | undefined,
): CoachUIMessage['parts'] {
  if (!pendingApprovals?.length) return existingParts;
  const parts = Array.isArray(existingParts) ? [...existingParts] : [];
  const existingIds = new Set(
    parts
      .map((part) => {
        if (!part || typeof part !== 'object') return null;
        const typed = part as {
          type?: string;
          approvalId?: string;
          toolCallId?: string;
          approval?: { id?: string };
          state?: string;
        };
        if (
          typed.type === 'tool-approval-request' ||
          (typeof typed.type === 'string' &&
            typed.type.startsWith('tool-') &&
            typed.state === 'approval-requested')
        ) {
          return typed.approvalId || typed.approval?.id || typed.toolCallId || null;
        }
        return null;
      })
      .filter(Boolean),
  );

  for (const approval of pendingApprovals) {
    if (!approval?.toolCallId || existingIds.has(approval.toolCallId)) continue;
    parts.push({
      type: 'tool-approval-request',
      approvalId: approval.toolCallId,
      toolCall: {
        toolName: approval.toolName,
        args: approval.args,
      },
    } as unknown as CoachUIMessage['parts'][number]);
  }
  return parts;
}

export function transformStoredMessage(msg: StoredChatMessage): CoachUIMessage {
  const keptParts: CoachUIMessage['parts'] = [];
  if (Array.isArray(msg.parts)) {
    for (const part of msg.parts) {
      if (!part?.type) continue;
      if (part.type === 'text' && typeof part.text === 'string') {
        keptParts.push({ type: 'text', text: part.text });
        continue;
      }
      if (part.type === 'file' && typeof (part as { url?: unknown }).url === 'string') {
        keptParts.push(part as CoachUIMessage['parts'][number]);
        continue;
      }
      if (
        part.type === 'tool-approval-request' ||
        (typeof part.type === 'string' && part.type.startsWith('tool-'))
      ) {
        keptParts.push(part as CoachUIMessage['parts'][number]);
      }
    }
  }
  if (keptParts.length === 0 && msg.content) {
    keptParts.push({ type: 'text', text: msg.content });
  }

  const parts = synthesizeApprovalParts(
    keptParts,
    msg.metadata?.pendingApprovals as PendingChatApproval[] | undefined,
  );

  const role: CoachUIMessage['role'] =
    msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'user';

  return {
    id: msg.id,
    role,
    content: msg.content,
    parts,
    createdAt: new Date(msg.createdAt || msg.metadata?.createdAt || Date.now()),
    updatedAt: msg.updatedAt || msg.metadata?.updatedAt || null,
    metadata: { ...(msg.metadata || {}) },
  };
}

/** Keep user/assistant rows for `useChat`; drop tool/system noise except via synthesized parts. */
export function hydrateCoachMessages(stored: StoredChatMessage[]): CoachUIMessage[] {
  return stored
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map(transformStoredMessage);
}

export function getLatestAssistantMessage(
  messages: CoachUIMessage[],
  options: { includeHidden?: boolean } = {},
): CoachUIMessage | undefined {
  return [...messages]
    .reverse()
    .find(
      (message) =>
        message?.role === 'assistant' &&
        !message?.metadata?.syntheticTyping &&
        (options.includeHidden !== false || !shouldHideAssistantBubble(message)),
    );
}

export function shouldHideAssistantBubble(message: CoachUIMessage): boolean {
  if (message.metadata?.hiddenBecauseEmptyFailure) return true;
  const hasImages = messageImageParts(message).length > 0;
  const hasApprovals = extractPendingApprovals(message).length > 0;
  const hasToolOutcomes = toolOutcomeSummaries(message).length > 0;
  const hasInProgress = toolInProgressSummaries(message).length > 0;
  if (
    message.metadata?.hideUntilContent &&
    !messageText(message).trim() &&
    !hasImages &&
    !hasApprovals &&
    !hasToolOutcomes &&
    !hasInProgress
  ) {
    return true;
  }
  return false;
}

export function hasActiveTurn(messages: CoachUIMessage[]): boolean {
  return isActiveTurnStatus(
    getLatestAssistantMessage(messages, { includeHidden: true })?.metadata?.turnStatus,
  );
}

export function extractPendingApprovals(message: CoachUIMessage): PendingChatApproval[] {
  const fromMeta = Array.isArray(message.metadata?.pendingApprovals)
    ? (message.metadata.pendingApprovals as PendingChatApproval[])
    : [];
  const fromParts: PendingChatApproval[] = [];
  for (const part of message.parts || []) {
    if (!part || typeof part !== 'object') continue;
    const typed = part as {
      type?: string;
      approvalId?: string;
      toolCallId?: string;
      state?: string;
      toolCall?: { toolName?: string; args?: unknown };
      approval?: { id?: string };
      input?: unknown;
    };
    if (typed.type === 'tool-approval-request' && typed.approvalId) {
      fromParts.push({
        toolCallId: typed.approvalId,
        toolName: typed.toolCall?.toolName || 'tool',
        args: typed.toolCall?.args,
      });
      continue;
    }
    if (
      typeof typed.type === 'string' &&
      typed.type.startsWith('tool-') &&
      typed.state === 'approval-requested'
    ) {
      const id = typed.approval?.id || typed.toolCallId;
      if (!id) continue;
      fromParts.push({
        toolCallId: id,
        toolName: typed.type.replace(/^tool-/, '') || 'tool',
        args: typed.input,
      });
    }
  }

  const byId = new Map<string, PendingChatApproval>();
  for (const item of [...fromMeta, ...fromParts]) {
    if (item?.toolCallId) byId.set(item.toolCallId, item);
  }
  return [...byId.values()];
}

export function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/^tool-/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveToolDomain(toolName: string): ToolDomain {
  if (NUTRITION_TOOL_NAMES.has(toolName)) return 'nutrition';
  if (RECOVERY_TOOL_NAMES.has(toolName) || WELLNESS_TOOL_NAMES.has(toolName)) return 'wellness';
  if (RECOMMENDATION_TOOL_NAMES.has(toolName) || PLANNED_TOOL_NAMES.has(toolName)) {
    return 'planning';
  }
  if (ACTIVITY_TOOL_NAMES.has(toolName)) return 'workouts';
  return 'other';
}

/**
 * Verbs that mean the coach changed something rather than just looked it up.
 * Allowlist, not a read-blocklist: an unrecognised tool stays silent, so a new
 * read tool can never start buzzing the user on its own.
 */
const ACTION_TOOL_PREFIXES = [
  'create_',
  'update_',
  'delete_',
  'log_',
  'patch_',
  'record_',
  'reschedule_',
  'recommend_',
];

/** True when the tool writes data — `get_`/`list_`/`search_` reads are not actions. */
export function isActionToolName(toolName: string): boolean {
  const name = toolName.replace(/^tool-/, '');
  return ACTION_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** True when the message reports a write tool that actually succeeded. */
export function messageCompletedAction(message: CoachUIMessage): boolean {
  return toolOutcomeSummaries(message).some(
    (outcome) => outcome.status === 'success' && isActionToolName(outcome.toolName),
  );
}

/** One-line approval preview from common arg keys (`title` | `name` | `date`). */
export function approvalPreviewLine(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const record = args as Record<string, unknown>;
  for (const key of ['title', 'name', 'date'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function resolveToolPartName(part: { type?: string; toolName?: string }): string | null {
  if (typeof part.toolName === 'string' && part.toolName.trim()) return part.toolName;
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    const name = part.type.slice('tool-'.length);
    if (name && name !== 'approval-request' && name !== 'approval-response') return name;
  }
  return null;
}

function isInProgressToolState(state: string): boolean {
  return (
    state === 'input-streaming' ||
    state === 'input-available' ||
    state === 'partial-call' ||
    state === 'call'
  );
}

function resolveToolPartStatus(part: {
  state?: string;
  output?: unknown;
  result?: unknown;
  error?: unknown;
  errorText?: unknown;
}): ToolOutcomeStatus | null {
  const state = String(part.state || '');
  if (state === 'approval-requested' || isInProgressToolState(state)) {
    return null;
  }
  if (state === 'output-denied' || state === 'denied' || state === 'approval-denied') {
    return 'denied';
  }
  if (state === 'error' || state === 'output-error' || state === 'failed') {
    return 'failure';
  }
  const output = part.output ?? part.result;
  if (
    output &&
    typeof output === 'object' &&
    (('error' in output && (output as { error?: unknown }).error) ||
      (output as { success?: unknown }).success === false)
  ) {
    return 'failure';
  }
  if (part.error != null || (typeof part.errorText === 'string' && part.errorText.trim())) {
    return 'failure';
  }
  const completed =
    !state ||
    ['output-available', 'result', 'completed', 'success'].includes(state) ||
    part.output != null ||
    part.result != null;
  return completed ? 'success' : null;
}

function curatedSuccessCopy(toolName: string): string | null {
  if (toolName === 'log_nutrition_meal') return 'Meal logged to your nutrition diary.';
  if (toolName === 'log_hydration_intake') return 'Hydration updated.';
  if (toolName === 'get_nutrition_log') return 'Checked your nutrition log.';
  if (toolName === 'get_daily_fueling_status') return 'Checked your fueling status.';
  if (NUTRITION_TOOL_NAMES.has(toolName)) return 'Nutrition log updated.';
  if (toolName === 'record_wellness_event') return 'Recovery event logged.';
  if (toolName === 'update_wellness_event') return 'Recovery event updated.';
  if (toolName === 'delete_wellness_event') return 'Recovery event removed.';
  if (RECOVERY_TOOL_NAMES.has(toolName)) return 'Recovery context updated.';
  if (toolName === 'get_wellness_metrics') return 'Checked your recovery metrics.';
  if (toolName === 'get_wellness_events') return 'Checked your recovery events.';
  if (WELLNESS_TOOL_NAMES.has(toolName)) return 'Wellness check saved.';
  if (toolName === 'recommend_workout') return 'Workout recommendation ready.';
  if (toolName === 'get_recommendation_details') return 'Checked recommendation details.';
  if (toolName === 'list_pending_recommendations') return 'Checked pending recommendations.';
  if (RECOMMENDATION_TOOL_NAMES.has(toolName)) return 'Recommendation updated.';
  if (toolName === 'create_planned_workout') return 'Planned session created.';
  if (toolName === 'update_planned_workout') return 'Planned session updated.';
  if (toolName === 'reschedule_planned_workout') return 'Planned session moved.';
  if (toolName === 'get_planned_workouts') return 'Checked your planned sessions.';
  if (toolName === 'get_planned_workout_details') return 'Checked planned session details.';
  if (PLANNED_TOOL_NAMES.has(toolName)) return 'Training plan updated.';
  if (toolName === 'get_recent_workouts') return 'Checked your recent workouts.';
  if (toolName === 'search_workouts') return 'Searched your workouts.';
  if (toolName === 'get_workout_details') return 'Checked workout details.';
  if (ACTIVITY_TOOL_NAMES.has(toolName)) return 'Workout history updated.';
  return null;
}

function outcomeMessage(toolName: string, status: ToolOutcomeStatus): string {
  const label = humanizeToolName(toolName);
  if (status === 'denied') {
    return `${label} was not applied.`;
  }
  if (status === 'failure') {
    return `Couldn't complete ${label}. Try again in chat or use Log.`;
  }
  return curatedSuccessCopy(toolName) || `Coach updated ${label}.`;
}

/**
 * Compact in-thread tool outcomes for curated companion domains + generic fallback.
 * Part shapes mirror coach-wattz web chat (`output-available` / `output-error` / `output-denied`).
 */
export function toolOutcomeSummaries(message: CoachUIMessage): ToolOutcomeSummary[] {
  const summaries: ToolOutcomeSummary[] = [];
  const seen = new Set<string>();

  for (const [index, part] of (message.parts || []).entries()) {
    if (!part || typeof part !== 'object') continue;
    const typed = part as {
      type?: string;
      state?: string;
      toolName?: string;
      toolCallId?: string;
      output?: unknown;
      result?: unknown;
      error?: unknown;
      errorText?: unknown;
    };
    if (typed.type === 'tool-approval-request' || typed.type === 'tool-approval-response') {
      continue;
    }
    const toolName = resolveToolPartName(typed);
    if (!toolName) continue;
    const status = resolveToolPartStatus(typed);
    if (!status) continue;

    const id = typed.toolCallId || `${toolName}-${index}-${status}`;
    if (seen.has(id)) continue;
    seen.add(id);
    summaries.push({
      id,
      toolName,
      status,
      message: outcomeMessage(toolName, status),
      domain: resolveToolDomain(toolName),
    });
  }
  return summaries;
}

/**
 * Non-terminal tool parts shown as in-progress chips. Excludes ids that already
 * have a terminal outcome summary on the same message.
 */
export function toolInProgressSummaries(message: CoachUIMessage): ToolInProgressSummary[] {
  const terminalIds = new Set(toolOutcomeSummaries(message).map((outcome) => outcome.id));
  const summaries: ToolInProgressSummary[] = [];
  const seen = new Set<string>();

  for (const [index, part] of (message.parts || []).entries()) {
    if (!part || typeof part !== 'object') continue;
    const typed = part as {
      type?: string;
      state?: string;
      toolName?: string;
      toolCallId?: string;
    };
    if (typed.type === 'tool-approval-request' || typed.type === 'tool-approval-response') {
      continue;
    }
    const toolName = resolveToolPartName(typed);
    if (!toolName) continue;
    if (!isInProgressToolState(String(typed.state || ''))) continue;

    const id = typed.toolCallId || `${toolName}-${index}-progress`;
    if (terminalIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    summaries.push({
      id,
      toolName,
      label: `${humanizeToolName(toolName)}…`,
      domain: resolveToolDomain(toolName),
    });
  }
  return summaries;
}

/** @deprecated Prefer `toolOutcomeSummaries` — kept for nutrition-only call sites/tests. */
export function nutritionToolSummaries(message: CoachUIMessage): string[] {
  return toolOutcomeSummaries(message)
    .filter((outcome) => outcome.status === 'success' && NUTRITION_TOOL_NAMES.has(outcome.toolName))
    .map((outcome) => outcome.message);
}

export function mergeRealtimeMessage(
  existingMessage: CoachUIMessage,
  incomingMessage: CoachUIMessage,
): CoachUIMessage {
  const existingStatus = existingMessage?.metadata?.turnStatus;
  const incomingStatus = incomingMessage?.metadata?.turnStatus;
  const existingParts = Array.isArray(existingMessage?.parts) ? existingMessage.parts : [];
  const incomingParts = Array.isArray(incomingMessage?.parts) ? incomingMessage.parts : [];
  const existingNonTextParts = existingParts.filter((part) => part?.type !== 'text');
  const incomingHasNonTextParts = incomingParts.some((part) => part?.type !== 'text');

  let nextIncoming = incomingMessage;

  if (!incomingHasNonTextParts && existingNonTextParts.length > 0) {
    const incomingTextPart = incomingParts.find((part) => part?.type === 'text');
    nextIncoming = {
      ...incomingMessage,
      parts: [
        ...existingNonTextParts,
        ...(incomingTextPart
          ? [incomingTextPart]
          : typeof incomingMessage?.content === 'string'
            ? [{ type: 'text' as const, text: incomingMessage.content }]
            : []),
      ],
      metadata: {
        ...(existingMessage?.metadata || {}),
        ...(incomingMessage?.metadata || {}),
      },
    };
  }

  if (isTerminalTurnStatus(existingStatus) && isActiveTurnStatus(incomingStatus)) {
    return {
      ...nextIncoming,
      content:
        typeof existingMessage?.content === 'string' && existingMessage.content.trim()
          ? existingMessage.content
          : nextIncoming.content,
      parts:
        Array.isArray(existingMessage?.parts) && existingMessage.parts.length > 0
          ? existingMessage.parts
          : nextIncoming.parts,
      metadata: {
        ...(nextIncoming?.metadata || {}),
        ...(existingMessage?.metadata || {}),
        turnStatus: existingStatus,
      },
    };
  }

  const existingText =
    typeof existingMessage?.content === 'string' ? existingMessage.content.trim() : '';
  const incomingText = typeof nextIncoming?.content === 'string' ? nextIncoming.content.trim() : '';
  const existingIsStreaming =
    isActiveTurnStatus(String(existingStatus || '')) ||
    Boolean(existingMessage?.metadata?.isRealtimeDraft);

  if (
    existingIsStreaming &&
    existingText.length > incomingText.length &&
    nextIncoming?.role === 'assistant'
  ) {
    const existingTextPart = existingParts.find((part) => part?.type === 'text');
    return {
      ...nextIncoming,
      content: existingMessage.content,
      parts: [
        ...existingNonTextParts,
        existingTextPart || { type: 'text' as const, text: String(existingMessage.content || '') },
      ],
      metadata: {
        ...(nextIncoming?.metadata || {}),
        ...(existingMessage?.metadata || {}),
        turnStatus: existingStatus || incomingStatus,
      },
    };
  }

  return nextIncoming;
}

function messageTimeMs(message: CoachUIMessage | undefined | null): number | null {
  const raw = message?.createdAt;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Fold a server load into the live message list.
 *
 * Union by id rather than replace. A background/poll load that lands mid-send
 * used to wipe every local-only row — the ai-sdk optimistic user bubble before
 * the server has persisted it, the in-flight SSE assistant message, a realtime
 * draft from `applyAssistantTextDelta` — so the athlete's own message vanished
 * and reappeared moments later (CW-494c). Local rows are kept only while they
 * are newer than everything the server returned, and only when the server has
 * not already returned the same message under a different id.
 */
export function mergeLoadedMessages(
  existingMessages: CoachUIMessage[],
  loadedMessages: CoachUIMessage[],
): CoachUIMessage[] {
  const existingById = new Map(existingMessages.map((message) => [message?.id, message]));

  const merged = loadedMessages.map((loadedMessage) => {
    const existingMessage = existingById.get(loadedMessage?.id);
    if (!existingMessage) return loadedMessage;
    return mergeRealtimeMessage(existingMessage, loadedMessage);
  });

  const loadedIds = new Set(loadedMessages.map((message) => message?.id));
  let newestLoadedAt = 0;
  const loadedRoleTexts = new Set<string>();
  for (const message of loadedMessages) {
    const time = messageTimeMs(message);
    if (time !== null && time > newestLoadedAt) newestLoadedAt = time;
    const text = messageText(message).trim();
    if (text) loadedRoleTexts.add(`${message?.role}:${text}`);
  }

  const localOnly = existingMessages.filter((message) => {
    if (!message || loadedIds.has(message.id)) return false;
    // No timestamp means it was just created client-side — treat it as newest.
    const time = messageTimeMs(message);
    if (time !== null && time < newestLoadedAt) return false;
    // The server may persist an optimistic message under its own id; dropping
    // it here avoids a duplicate bubble that would never resolve itself.
    const text = messageText(message).trim();
    if (text && loadedRoleTexts.has(`${message.role}:${text}`)) return false;
    return true;
  });

  return localOnly.length > 0 ? [...merged, ...localOnly] : merged;
}

export function applyAssistantTextDelta(
  messages: CoachUIMessage[],
  event: {
    messageId: string;
    turnId: string;
    textDelta: string;
    status?: string;
  },
): CoachUIMessage[] {
  if (!event.textDelta) return messages;

  const existingIndex = messages.findIndex((entry) => entry?.id === event.messageId);

  if (existingIndex >= 0) {
    const existingMessage = messages[existingIndex];
    const existingParts = Array.isArray(existingMessage?.parts) ? existingMessage.parts : [];
    const nonTextParts = existingParts.filter((part) => part?.type !== 'text');
    const nextText = `${typeof existingMessage?.content === 'string' ? existingMessage.content : ''}${event.textDelta}`;
    const nextMessages = [...messages];
    nextMessages[existingIndex] = {
      ...existingMessage,
      content: nextText,
      parts: [...nonTextParts, { type: 'text' as const, text: nextText }],
      metadata: {
        ...(existingMessage?.metadata || {}),
        turnId: event.turnId,
        turnStatus: event.status || 'STREAMING',
      },
    };
    return nextMessages;
  }

  return [
    ...messages,
    {
      id: event.messageId,
      role: 'assistant',
      content: event.textDelta,
      parts: [{ type: 'text' as const, text: event.textDelta }],
      createdAt: new Date(),
      metadata: {
        turnId: event.turnId,
        turnStatus: event.status || 'STREAMING',
        isDraft: true,
        isRealtimeDraft: true,
      },
    },
  ];
}

export function upsertChatMessage(
  messages: CoachUIMessage[],
  message: StoredChatMessage,
): CoachUIMessage[] {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return messages;
  }
  const transformed = transformStoredMessage(message);
  const existingIndex = messages.findIndex((entry) => entry?.id === transformed.id);

  if (existingIndex >= 0) {
    const next = [...messages];
    next[existingIndex] = mergeRealtimeMessage(messages[existingIndex], transformed);
    return next;
  }

  return [...messages, transformed].sort(
    (left, right) =>
      new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime(),
  );
}

export function visibleCoachMessages(messages: CoachUIMessage[]): CoachUIMessage[] {
  return messages.filter((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return false;
    if (message.role === 'assistant' && shouldHideAssistantBubble(message)) return false;
    return true;
  });
}
