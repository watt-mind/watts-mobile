import { localDateYmd } from '@/src/lib/date';
import { sportLabel } from './sportTypes';
import type { PlatformWorkoutSession, RemoteWorkoutMatchCandidate } from './types';
import { WORKOUT_MATCH_TOLERANCE_MS } from './types';

const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|[+-]00:?00)?)?$/;
/** Max duration difference accepted when only a calendar date is available. */
const DATE_ONLY_DURATION_TOLERANCE_S = 10 * 60;

export function platformWorkoutExternalId(session: PlatformWorkoutSession): string {
  // Keep this identical to the API's Workout.externalId construction/column bound.
  return `health_${session.platform}_${session.platformSessionId}`.slice(0, 500);
}

function normalizedSport(value?: string | null): string | null {
  if (!value) return null;
  const sport = value.toLowerCase().replace(/[^a-z]/g, '');
  if (/^(ride|riding|bike|biking|cycling)$/.test(sport)) return 'cycling';
  if (/^(run|running|trailrun|trailrunning)$/.test(sport)) return 'running';
  if (/^(swim|swimming)$/.test(sport)) return 'swimming';
  if (/^(walk|walking|hike|hiking)$/.test(sport)) return 'walking';
  return sport;
}

/**
 * Heuristic presence match: start time within tolerance and optional duration
 * closeness. Date-only remote dates fall back to same-local-day + duration.
 */
export function matchRemoteWorkout(
  session: PlatformWorkoutSession,
  remotes: RemoteWorkoutMatchCandidate[],
): RemoteWorkoutMatchCandidate | null {
  const startMs = new Date(session.startedAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const sessionYmd = localDateYmd(new Date(startMs));
  // Remote date-only values are frequently midnight-UTC normalized, so an
  // evening workout west of UTC (or an early-morning one east of it) lands on a
  // different calendar day than the local one. Accept either (CW-464).
  const sessionUtcYmd = new Date(startMs).toISOString().slice(0, 10);
  const sessionSport = normalizedSport(session.sportType);
  const exactExternalId = platformWorkoutExternalId(session);

  const exact = remotes.find((remote) => remote.externalId === exactExternalId);
  if (exact) return exact;

  let best: { remote: RemoteWorkoutMatchCandidate; score: number } | null = null;

  for (const remote of remotes) {
    if (!remote.date) continue;
    const remoteSport = normalizedSport(remote.type);
    if (sessionSport && remoteSport && sessionSport !== remoteSport) continue;

    let score: number;
    const dateOnlyMatch = DATE_ONLY_RE.exec(remote.date);
    if (dateOnlyMatch) {
      // No time component (or midnight-UTC normalized) — match on calendar
      // day taken directly from the date string, requiring duration
      // agreement when both sides have one so same-day workouts don't collide.
      if (dateOnlyMatch[1] !== sessionYmd && dateOnlyMatch[1] !== sessionUtcYmd) continue;
      if (session.durationSec == null || remote.durationSec == null) continue;
      const durDelta =
        session.durationSec != null &&
        remote.durationSec != null &&
        Number.isFinite(remote.durationSec)
          ? Math.abs(session.durationSec - remote.durationSec)
          : null;
      if (durDelta != null && durDelta > DATE_ONLY_DURATION_TOLERANCE_S) continue;
      // Rank below any timestamp match of equal duration closeness.
      score = WORKOUT_MATCH_TOLERANCE_MS + (durDelta ?? DATE_ONLY_DURATION_TOLERANCE_S) * 10;
    } else {
      const remoteMs = new Date(remote.date).getTime();
      if (!Number.isFinite(remoteMs)) continue;
      const delta = Math.abs(remoteMs - startMs);
      if (delta > WORKOUT_MATCH_TOLERANCE_MS) continue;

      score = delta;
      if (
        session.durationSec != null &&
        remote.durationSec != null &&
        Number.isFinite(remote.durationSec)
      ) {
        const durDelta = Math.abs(session.durationSec - remote.durationSec);
        // Prefer closer duration when starts are similar
        score += durDelta * 10;
      }
    }

    if (!best || score < best.score) {
      best = { remote, score };
    }
  }

  return best?.remote ?? null;
}

export function workoutHistoryTitle(session: PlatformWorkoutSession): string {
  const when = new Date(session.startedAt);
  const timeLabel = Number.isFinite(when.getTime())
    ? when.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : session.startedAt;
  const mins = session.durationSec != null ? Math.round(session.durationSec / 60) : null;
  const dur = mins != null && mins > 0 ? ` · ${mins} min` : '';
  const name = session.title ?? sportLabel(session.sportType) ?? 'Workout';
  return `${name}${dur} · ${timeLabel}`;
}
