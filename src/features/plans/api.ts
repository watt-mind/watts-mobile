import { apiFetch } from '@/src/api/client';
import { ApiError } from '@/src/api/errors';

import { pollUntilDone, type JobPollOptions } from './jobPoller';
import type {
  ActivePlanApi,
  ActivePlanResponse,
  BlockCreateInput,
  BlockPatchInput,
  PlanAdaptationType,
  PlanInitializeInput,
  PlanInitializeResult,
  PlannedWorkoutPreview,
  ReplanBlockInput,
  WeekTuneInput,
} from './types';

const PLAN_JOB_FAILURE = new Set([
  'FAILURE',
  'FAILED',
  'CANCELED',
  'CANCELLED',
  'TIMED_OUT',
  'ABORTED',
  'CRASHED',
  'SYSTEM_FAILURE',
]);

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && ('message' in body || 'statusMessage' in body)) {
    return String(
      (body as { message?: string; statusMessage?: string }).message ||
        (body as { statusMessage?: string }).statusMessage ||
        fallback,
    );
  }
  return fallback;
}

export type AvailabilitySlot = {
  name: string;
  startTime: string;
  duration: number;
  activityTypes: string[];
  gymAccess?: boolean;
  bikeAccess?: boolean;
  indoorOnly?: boolean;
};

export type AvailabilityDay = {
  dayOfWeek: number;
  morning?: boolean;
  afternoon?: boolean;
  evening?: boolean;
  /** Required for week gen — empty slots are treated as rest days on the server. */
  slots?: AvailabilitySlot[];
};

export async function saveAvailability(days: AvailabilityDay[]): Promise<void> {
  const response = await apiFetch('/api/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availability: days }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to save availability (${response.status})`),
      response.status,
      body,
    );
  }
}

export async function initializePlan(input: PlanInitializeInput): Promise<PlanInitializeResult> {
  const response = await apiFetch('/api/plans/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to initialize plan (${response.status})`),
      response.status,
      body,
    );
  }
  return (await response.json()) as PlanInitializeResult;
}

async function fetchPlan(planId: string): Promise<PlanInitializeResult> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}`);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to refresh plan preview (${response.status})`),
      response.status,
      body,
    );
  }
  const plan = (await response.json()) as NonNullable<PlanInitializeResult['plan']>;
  return { planId, plan };
}

async function requestWeekPreview(blockId: string, weekId: string): Promise<void> {
  const response = await apiFetch('/api/plans/generate-ai-week', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockId, weekId }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to generate plan preview (${response.status})`),
      response.status,
      body,
    );
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Generate the draft's first real training week and poll until its workouts are persisted. */
export async function generateFirstWeekPreview(
  initialized: PlanInitializeResult,
  options: { timeoutMs?: number; pollMs?: number; signal?: AbortSignal } = {},
): Promise<PlannedWorkoutPreview[]> {
  const existing = extractFirstWeekPreview(initialized);
  if (existing.length > 0) return existing;

  const blockId = initialized.plan?.blocks?.[0]?.id;
  const weekId = initialized.plan?.blocks?.[0]?.weeks?.[0]?.id;
  if (!blockId || !weekId) {
    throw new ApiError('The draft plan did not include a previewable first week', 422);
  }

  await requestWeekPreview(blockId, weekId);

  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollMs = options.pollMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    await delay(pollMs, options.signal);
    const refreshed = await fetchPlan(initialized.planId);
    const preview = extractFirstWeekPreview(refreshed);
    if (preview.length > 0) return preview;
  }

  throw new ApiError('Plan preview is still generating — try again shortly', 408);
}

export async function activatePlan(planId: string, startDate?: string): Promise<void> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(startDate ? { startDate } : {}),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to activate plan (${response.status})`),
      response.status,
      body,
    );
  }
}

export async function fetchUpcomingPlanned(limit = 7): Promise<PlannedWorkoutPreview[]> {
  const response = await apiFetch(`/api/planned-workouts?limit=${limit}`);
  if (!response.ok) return [];
  const json = await response.json();
  if (Array.isArray(json)) return json as PlannedWorkoutPreview[];
  if (
    json &&
    typeof json === 'object' &&
    Array.isArray((json as { workouts?: unknown }).workouts)
  ) {
    return (json as { workouts: PlannedWorkoutPreview[] }).workouts;
  }
  if (json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)) {
    return (json as { items: PlannedWorkoutPreview[] }).items;
  }
  return [];
}

export function extractFirstWeekPreview(result: PlanInitializeResult): PlannedWorkoutPreview[] {
  const weeks = result.plan?.blocks?.[0]?.weeks ?? [];
  const first = weeks[0];
  if (!first?.workouts?.length) return [];
  return first.workouts.map((w) => ({
    id: w.id,
    title: w.title,
    type: w.type,
    date: w.date,
    duration: w.duration ?? (w.durationSec ? Math.round(w.durationSec / 60) : null),
  }));
}

export async function fetchActivePlan(): Promise<ActivePlanResponse> {
  const response = await apiFetch('/api/plans/active');
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to load active plan (${response.status})`),
      response.status,
      body,
    );
  }
  return (await response.json()) as ActivePlanResponse;
}

export async function fetchPlanDetail(planId: string): Promise<ActivePlanApi> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}`);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to load plan (${response.status})`),
      response.status,
      body,
    );
  }
  return (await response.json()) as ActivePlanApi;
}

export async function adaptPlan(
  planId: string,
  adaptationType: PlanAdaptationType,
  options: JobPollOptions = {},
): Promise<{ jobId?: string }> {
  const response = await apiFetch('/api/plans/adapt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, adaptationType }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to adapt plan (${response.status})`),
      response.status,
      body,
    );
  }
  const result = (await response.json()) as { jobId?: string };
  if (result.jobId) await waitForPlanJob(result.jobId, options);
  return result;
}

export async function abandonPlan(
  planId: string,
): Promise<{ success?: boolean; deletedWorkouts?: number }> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}/abandon`, {
    method: 'POST',
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to abandon plan (${response.status})`),
      response.status,
      body,
    );
  }
  return (await response.json()) as { success?: boolean; deletedWorkouts?: number };
}

export async function replanStructure(
  planId: string,
  blocks: ReplanBlockInput[],
): Promise<unknown> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}/replan-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to replan structure (${response.status})`),
      response.status,
      body,
    );
  }
  return response.json();
}

export async function patchPlanWeek(weekId: string, input: WeekTuneInput): Promise<unknown> {
  const response = await apiFetch(`/api/plans/weeks/${encodeURIComponent(weekId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to update week (${response.status})`),
      response.status,
      body,
    );
  }
  return response.json();
}

export async function createPlanBlock(planId: string, input: BlockCreateInput): Promise<unknown> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to add block (${response.status})`),
      response.status,
      body,
    );
  }
  return response.json();
}

export async function patchPlanBlock(
  planId: string,
  blockId: string,
  input: BlockPatchInput,
): Promise<unknown> {
  const response = await apiFetch(
    `/api/plans/${encodeURIComponent(planId)}/blocks/${encodeURIComponent(blockId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to update block (${response.status})`),
      response.status,
      body,
    );
  }
  return response.json();
}

export async function deletePlanBlock(planId: string, blockId: string): Promise<void> {
  const response = await apiFetch(
    `/api/plans/${encodeURIComponent(planId)}/blocks/${encodeURIComponent(blockId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to delete block (${response.status})`),
      response.status,
      body,
    );
  }
}

export async function reorderPlanBlocks(
  planId: string,
  blocks: { id: string; order: number }[],
): Promise<void> {
  const response = await apiFetch(`/api/plans/${encodeURIComponent(planId)}/blocks/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to reorder blocks (${response.status})`),
      response.status,
      body,
    );
  }
}

export async function generateAiWeek(
  blockId: string,
  weekId: string,
  instructions?: string,
  options: JobPollOptions = {},
): Promise<{ jobId?: string }> {
  const response = await apiFetch('/api/plans/generate-ai-week', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockId,
      weekId,
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
    }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to generate week (${response.status})`),
      response.status,
      body,
    );
  }
  const result = (await response.json()) as { jobId?: string };
  if (result.jobId) await waitForPlanJob(result.jobId, options);
  return result;
}

export async function generateTrainingBlock(
  blockId: string,
  options: JobPollOptions = {},
): Promise<{ jobId?: string }> {
  const response = await apiFetch('/api/plans/generate-block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockId }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to generate block (${response.status})`),
      response.status,
      body,
    );
  }
  const result = (await response.json()) as { jobId?: string };
  if (result.jobId) await waitForPlanJob(result.jobId, options);
  return result;
}

export async function generateWorkoutStructure(
  plannedWorkoutId: string,
  options: JobPollOptions = {},
): Promise<{ jobId?: string }> {
  const response = await apiFetch(
    `/api/workouts/planned/${encodeURIComponent(plannedWorkoutId)}/generate-structure`,
    { method: 'POST' },
  );
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to generate structure (${response.status})`),
      response.status,
      body,
    );
  }
  const result = (await response.json()) as { jobId?: string; taskId?: string };
  const jobId = result.jobId ?? result.taskId;
  if (jobId) await waitForPlanJob(jobId, options);
  return { jobId };
}

/** Client-side batch (web PlanDashboard pattern) — generate structure for many sessions. */
export async function generateWeekStructures(
  plannedWorkoutIds: string[],
  onProgress?: (done: number, total: number) => void,
  options: { signal?: AbortSignal } = {},
): Promise<{ succeeded: number; failed: number }> {
  const ids = plannedWorkoutIds.filter(Boolean);
  const total = ids.length;
  if (total === 0) return { succeeded: 0, failed: 0 };
  const batchSize = 3;
  let done = 0;
  let succeeded = 0;
  let failed = 0;
  let firstError: Error | null = null;

  for (let i = 0; i < ids.length; i += batchSize) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((id) => generateWorkoutStructure(id, { signal: options.signal })),
    );
    for (const result of results) {
      done += 1;
      onProgress?.(done, total);
      if (result.status === 'rejected') {
        failed += 1;
        if (!firstError) {
          firstError =
            result.reason instanceof Error
              ? result.reason
              : new Error('Failed to generate structure');
        }
      } else {
        succeeded += 1;
      }
    }
  }

  // Always finish the batch so partial successes can refresh; surface failure after.
  if (failed > 0) {
    if (succeeded === 0 && firstError) throw firstError;
    throw new Error(
      `Generated structure for ${succeeded} of ${total} sessions${
        firstError?.message ? ` — ${firstError.message}` : ''
      }`,
    );
  }
  return { succeeded, failed };
}

export type PlannedWorkoutWriteInput = {
  date: string;
  title: string;
  type: string;
  durationSec: number;
  tss?: number | null;
  description?: string | null;
  trainingWeekId?: string;
};

export type PlannedWorkoutPatchInput = {
  date?: string;
  title?: string;
  type?: string;
  durationSec?: number;
  tss?: number | null;
  description?: string | null;
};

/** Create a planned workout (Bearer workout:write). Defaults to athlete-managed on server. */
export async function createPlannedWorkout(input: PlannedWorkoutWriteInput): Promise<unknown> {
  const response = await apiFetch('/api/planned-workouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: input.date,
      title: input.title,
      type: input.type,
      durationSec: input.durationSec,
      ...(input.tss != null ? { tss: input.tss } : {}),
      ...(input.description != null ? { description: input.description } : {}),
      ...(input.trainingWeekId ? { trainingWeekId: input.trainingWeekId } : {}),
    }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to create workout (${response.status})`),
      response.status,
      body,
    );
  }
  return response.json();
}

/**
 * Patch planned workout fields (content edits re-tag managedBy to USER on server).
 *
 * The body is sparse on purpose: every key present is written server-side, and a `null`
 * value CLEARS that field. Callers must therefore only include fields the athlete actually
 * saw and changed — never fill absent context with defaults or `null` (CW-486). Keys whose
 * value is `undefined` are dropped here so a partially-built input cannot clobber data.
 */
export async function patchPlannedWorkout(
  plannedWorkoutId: string,
  input: PlannedWorkoutPatchInput,
): Promise<unknown> {
  const body = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as PlannedWorkoutPatchInput;
  const response = await apiFetch(`/api/planned-workouts/${encodeURIComponent(plannedWorkoutId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to update workout (${response.status})`),
      response.status,
      body,
    );
  }
  return response.json();
}

/** Hard-delete a planned workout (not soft-deletable — no honest undo). */
export async function deletePlannedWorkout(plannedWorkoutId: string): Promise<void> {
  const response = await apiFetch(`/api/planned-workouts/${encodeURIComponent(plannedWorkoutId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to delete workout (${response.status})`),
      response.status,
      body,
    );
  }
}

/** Move a planned workout by patching its date (YYYY-MM-DD or ISO). */
export async function movePlannedWorkout(plannedWorkoutId: string, date: string): Promise<void> {
  await patchPlannedWorkout(plannedWorkoutId, { date });
}

export async function fetchPlanJobStatus(
  jobId: string,
): Promise<{ status?: string; completed?: boolean }> {
  const response = await apiFetch(`/api/plans/status?jobId=${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(
      errorMessage(body, `Failed to check plan job (${response.status})`),
      response.status,
      body,
    );
  }
  return (await response.json()) as { status?: string; completed?: boolean };
}

/** Poll Trigger.dev plan jobs until terminal success (or throw on failure/timeout). */
export async function waitForPlanJob(jobId: string, options: JobPollOptions = {}): Promise<void> {
  await pollUntilDone(async () => {
    const status = await fetchPlanJobStatus(jobId);
    if (!status.completed) return { done: false };
    const code = (status.status ?? '').toUpperCase();
    if (PLAN_JOB_FAILURE.has(code)) {
      throw new ApiError(
        code === 'TIMED_OUT'
          ? 'Plan job timed out — try again shortly'
          : 'Plan job failed — try again',
        500,
        status,
      );
    }
    return { done: true, value: undefined };
  }, options);
}
