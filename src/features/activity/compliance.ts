import { localDateKey } from '@/src/lib/date';

import type { ActivityListItem, PlannedListItem } from './types';

export type ComplianceMark = 'done' | 'modified' | 'missed' | 'none';

export type ComplianceBadge = {
  mark: ComplianceMark;
  /** Short glyph for list rows */
  glyph: string;
  /** Accessible label */
  label: string;
  /** Tailwind text color class */
  colorClass: string;
};

const BADGE: Record<ComplianceMark, ComplianceBadge> = {
  done: {
    mark: 'done',
    glyph: '✓',
    label: 'Done as planned',
    colorClass: 'text-green-400',
  },
  modified: {
    mark: 'modified',
    glyph: '~',
    label: 'Modified vs plan',
    colorClass: 'text-modify',
  },
  missed: {
    mark: 'missed',
    glyph: '–',
    label: 'Missed planned session',
    colorClass: 'text-text-muted',
  },
  none: {
    mark: 'none',
    glyph: '',
    label: '',
    colorClass: 'text-text-muted',
  },
};

function normalizeType(type: string | null | undefined): string {
  return (type ?? '').trim().toLowerCase();
}

/**
 * Heuristic: same local day + matching sport type.
 * Duration within 25% → done; same day+type but outside that band → modified.
 */
function pairQuality(
  activity: ActivityListItem,
  planned: PlannedListItem,
): 'done' | 'modified' | null {
  const aKey = localDateKey(activity.date);
  const pKey = localDateKey(planned.date);
  if (!aKey || !pKey || aKey !== pKey) return null;
  if (normalizeType(activity.type) !== normalizeType(planned.type)) return null;

  const aDur = activity.durationSec;
  const pDur = planned.durationSec;
  if (aDur == null || pDur == null || pDur <= 0) {
    // Type+day match without duration — treat as done (completed the day's plan type).
    return 'done';
  }
  const ratio = aDur / pDur;
  if (ratio >= 0.75 && ratio <= 1.25) return 'done';
  return 'modified';
}

export type ComplianceIndex = {
  /** activity id → mark for recent/completed rows */
  forActivity: Map<string, ComplianceMark>;
  /** planned id → mark for upcoming/past-planned rows */
  forPlanned: Map<string, ComplianceMark>;
};

/**
 * Pair completed workouts with planned ones (same day + type).
 * Each activity and planned row is paired at most once (greedy by date order).
 */
export function buildComplianceIndex(
  activities: ActivityListItem[] | undefined,
  planned: PlannedListItem[] | undefined,
  now = new Date(),
): ComplianceIndex {
  const forActivity = new Map<string, ComplianceMark>();
  const forPlanned = new Map<string, ComplianceMark>();

  const acts = [...(activities ?? [])].sort((a, b) =>
    String(a.date ?? '').localeCompare(String(b.date ?? '')),
  );
  const plans = [...(planned ?? [])];
  const usedPlans = new Set<string>();
  const usedActs = new Set<string>();

  for (const activity of acts) {
    let best: { planned: PlannedListItem; quality: 'done' | 'modified' } | null = null;
    for (const p of plans) {
      if (usedPlans.has(p.id)) continue;
      const quality = pairQuality(activity, p);
      if (!quality) continue;
      // Prefer exact "done" over "modified".
      if (!best || (quality === 'done' && best.quality === 'modified')) {
        best = { planned: p, quality };
        if (quality === 'done') break;
      }
    }
    if (best) {
      forActivity.set(activity.id, best.quality);
      forPlanned.set(best.planned.id, best.quality);
      usedPlans.add(best.planned.id);
      usedActs.add(activity.id);
    }
  }

  const todayKey = localDateKey(now)!;
  for (const p of plans) {
    if (forPlanned.has(p.id)) continue;
    const key = localDateKey(p.date);
    if (!key) continue;
    // Past planned with no paired activity → missed.
    if (key < todayKey) {
      forPlanned.set(p.id, 'missed');
    }
  }

  return { forActivity, forPlanned };
}

export function complianceBadge(mark: ComplianceMark | undefined): ComplianceBadge {
  return BADGE[mark ?? 'none'];
}
