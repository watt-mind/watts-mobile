import { localDateKey } from '@/src/features/today/weekGlance';

import { humanizeBlockType } from './formatPlanCopy';
import type {
  ActivePlanApi,
  ActivePlanShell,
  PlanBlockApi,
  PlanBlockShell,
  PlanWeekApi,
  PlanWeekShell,
} from './types';

function dateKey(value: string | Date | null | undefined): string | null {
  return localDateKey(value);
}

function currentDateKey(): string {
  return localDateKey(new Date()) ?? '';
}

export function mapPlanBlock(block: PlanBlockApi, index: number): PlanBlockShell {
  return {
    id: block.id,
    order: typeof block.order === 'number' ? block.order : index,
    name: (block.name && String(block.name).trim()) || `Block ${index + 1}`,
    type: block.type ? String(block.type) : 'BASE',
    primaryFocus: block.primaryFocus ? String(block.primaryFocus) : null,
    durationWeeks:
      typeof block.durationWeeks === 'number' && block.durationWeeks > 0
        ? block.durationWeeks
        : Math.max(1, block.weeks?.length ?? 1),
    startDateKey: dateKey(block.startDate),
    recoveryWeekIndex:
      typeof block.recoveryWeekIndex === 'number' && block.recoveryWeekIndex > 0
        ? block.recoveryWeekIndex
        : null,
  };
}

export function mapPlanWeek(week: PlanWeekApi, blockId: string): PlanWeekShell {
  return {
    id: week.id,
    blockId,
    weekNumber: typeof week.weekNumber === 'number' ? week.weekNumber : 0,
    startDateKey: dateKey(week.startDate),
    endDateKey: dateKey(week.endDate),
    focusLabel:
      (week.focusLabel && String(week.focusLabel).trim()) ||
      (week.focus && String(week.focus).trim()) ||
      null,
    volumeTargetMinutes:
      typeof week.volumeTargetMinutes === 'number' ? week.volumeTargetMinutes : null,
    tssTarget: typeof week.tssTarget === 'number' ? week.tssTarget : null,
    isRecovery: Boolean(week.isRecovery),
    explanation: week.explanation ? String(week.explanation) : null,
  };
}

function weekContainsDate(week: PlanWeekShell, key: string): boolean {
  if (!week.startDateKey) return false;
  const end = week.endDateKey ?? week.startDateKey;
  return key >= week.startDateKey && key <= end;
}

/** Flatten block weeks in season order. */
export function flattenPlanWeeks(blocks: PlanBlockApi[]): PlanWeekShell[] {
  const weeks: PlanWeekShell[] = [];
  for (const block of blocks) {
    for (const week of block.weeks ?? []) {
      if (!week?.id) continue;
      weeks.push(mapPlanWeek(week, block.id));
    }
  }
  return weeks;
}

/** Pick the week containing today; else nearest upcoming; else last past week. */
export function selectCurrentWeek(
  blocks: PlanBlockApi[],
  nowKey: string = currentDateKey(),
): PlanWeekShell | null {
  const weeks = flattenPlanWeeks(blocks);
  if (weeks.length === 0) return null;

  const containing = weeks.find((w) => weekContainsDate(w, nowKey));
  if (containing) return containing;

  const upcoming = weeks
    .filter((w) => w.startDateKey && w.startDateKey > nowKey)
    .sort((a, b) => (a.startDateKey ?? '').localeCompare(b.startDateKey ?? ''));
  if (upcoming[0]) return upcoming[0];

  return weeks[weeks.length - 1] ?? null;
}

/**
 * Index of the week to treat as "current": prefer the plan's own `currentWeek`
 * (id match), but fall back to whichever week's date range actually contains
 * today. A plan that ended weeks ago has no `currentWeek`, and without this
 * fallback the view (and the "This week" jump affordance) silently defaults
 * to the plan's last historical week instead of reflecting today's date.
 *
 * Returns `-1` when no week matches; callers clamp that themselves (CW-285).
 */
export function findCurrentWeekIndex(
  shell: Pick<ActivePlanShell, 'weeks' | 'currentWeek'> | null | undefined,
  todayKey: string = currentDateKey(),
): number {
  if (!shell) return -1;
  const byId = shell.weeks.findIndex((w) => w.id === shell.currentWeek?.id);
  if (byId >= 0) return byId;
  if (!todayKey) return -1;
  return shell.weeks.findIndex((w) => weekContainsDate(w, todayKey));
}

export function mapActivePlanShell(
  plan: ActivePlanApi | null | undefined,
  options: { hasUsableData?: boolean } = {},
): ActivePlanShell | null {
  if (!plan?.id) return null;
  const blocks = (plan.blocks ?? []).map((b, i) => mapPlanBlock(b, i));
  const weeks = flattenPlanWeeks(plan.blocks ?? []);
  const currentWeek = selectCurrentWeek(plan.blocks ?? []);
  const currentBlock =
    blocks.find((b) => b.id === plan.currentBlockId) ??
    blocks.find((b) => b.id === currentWeek?.blockId) ??
    blocks[0] ??
    null;

  const title =
    (plan.name && String(plan.name).trim()) ||
    (plan.goal?.title && String(plan.goal.title).trim()) ||
    'Training plan';

  const typeLabel = humanizeBlockType(currentBlock?.type);
  const phaseParts = [
    currentBlock?.name,
    typeLabel && typeLabel !== currentBlock?.name ? typeLabel : null,
  ].filter(Boolean);

  return {
    id: plan.id,
    title,
    strategy: plan.strategy ? String(plan.strategy) : null,
    startDateKey: dateKey(plan.startDate),
    targetDateKey: dateKey(plan.targetDate),
    currentPhaseLabel: phaseParts.length ? phaseParts.join(' · ') : null,
    coachNotes: plan.coachNotes ? String(plan.coachNotes).trim() : null,
    blocks,
    weeks,
    currentWeek,
    provisionalHint: options.hasUsableData === false,
  };
}

/** Filter planned list items to the shell week date range (inclusive). */
export function filterPlannedToWeek<T extends { date?: string | null }>(
  items: T[],
  week: PlanWeekShell | null,
): T[] {
  if (!week?.startDateKey) return [];
  const end = week.endDateKey ?? week.startDateKey;
  return items.filter((item) => {
    const key = localDateKey(item.date);
    return Boolean(key && key >= week.startDateKey! && key <= end);
  });
}

export function weekDateKeys(week: PlanWeekShell | null): string[] {
  if (!week?.startDateKey) return [];
  const start = week.startDateKey;
  const end = week.endDateKey ?? start;
  const keys: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  while (cursor <= endDate && keys.length < 14) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Percent along the season bar for “today”, or null if outside the plan. */
export function seasonTodayPercent(
  blocks: PlanBlockShell[],
  weeks: PlanWeekShell[],
  todayKey: string,
): number | null {
  if (blocks.length === 0 || !todayKey) return null;
  const total = blocks.reduce((sum, b) => sum + Math.max(1, b.durationWeeks), 0);
  if (total <= 0) return null;

  const containing = weeks.find(
    (w) =>
      w.startDateKey && todayKey >= w.startDateKey && todayKey <= (w.endDateKey ?? w.startDateKey),
  );
  // Outside the plan: no needle / “Today” legend (clamping to 0/100 looked like a ghost mark).
  if (!containing) return null;

  let elapsed = 0;
  for (const block of blocks) {
    if (block.id === containing.blockId) {
      const weekNum = Math.max(1, containing.weekNumber || 1);
      elapsed += weekNum - 0.5;
      break;
    }
    elapsed += Math.max(1, block.durationWeeks);
  }
  return Math.max(0, Math.min(100, (elapsed / total) * 100));
}
