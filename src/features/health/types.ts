export type HealthPlatform = 'healthkit' | 'health_connect';

export type SyncLedgerStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'needs_sync';

export type SyncLedgerKind = 'wellness' | 'workout';

export type SyncLedgerItem = {
  id: string;
  kind: SyncLedgerKind;
  platform: HealthPlatform;
  title: string;
  localDate?: string;
  startedAt?: string;
  status: SyncLedgerStatus;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  remoteWorkoutId?: string;
  /**
   * The server reported this workout as a duplicate but returned no workout id
   * (it already has the data, just not under an id we can record). Treated as
   * converged so the item stops re-uploading every pass — see CW-463.
   */
  serverDuplicateNoId?: boolean;
  /** Stable hash of last-uploaded content; used to skip unchanged re-pushes. */
  contentFingerprint?: string;
  attemptCount: number;
};

export type HealthSyncPreferences = {
  /** Master toggle — wellness auto sync. Default false. */
  syncEnabled: boolean;
  /** Nested workouts toggle. Default true when master first enabled. */
  syncWorkouts: boolean;
  /** ISO timestamp of last successful sync item (any kind). */
  lastSuccessAt?: string;
  /** Whether workouts default has been applied after first master enable. */
  workoutsDefaultApplied?: boolean;
};

/** Per-source, per-kind watermark for incremental reads. */
export type SyncWatermark = {
  source: HealthPlatform;
  kind: SyncLedgerKind;
  /** ISO timestamp of the newest data successfully read/pushed. */
  lastReadThrough: string;
};

/** Objective daily sample from a platform reader (one local calendar day). */
export type DailyWellnessSample = {
  date: string;
  platform: HealthPlatform;
  sleepSecs?: number;
  sleepHours?: number;
  sleepDeepSecs?: number;
  sleepRemSecs?: number;
  sleepLightSecs?: number;
  sleepAwakeSecs?: number;
  restingHr?: number;
  /** RMSSD-like HRV (ms) — Health Connect */
  hrv?: number;
  /** SDNN HRV (ms) — HealthKit */
  hrvSdnn?: number;
  weight?: number;
  bodyFat?: number;
  spO2?: number;
  respiration?: number;
  vo2max?: number;
  steps?: number;
  /** Daily activity-ring distance in meters (not workout-only). */
  distanceMeters?: number;
  /** Apple Exercise Time / summed exercise-session minutes. */
  exerciseMinutes?: number;
  /** Floors / flights climbed. */
  floors?: number;
  restingCaloriesBurned?: number;
  activeCaloriesBurned?: number;
  totalCaloriesBurned?: number;
};

export type HealthWellnessUploadPayload = {
  date: string;
  sleepSecs?: number;
  sleepHours?: number;
  sleepDeepSecs?: number;
  sleepRemSecs?: number;
  sleepLightSecs?: number;
  sleepAwakeSecs?: number;
  restingHr?: number;
  hrv?: number;
  hrvSdnn?: number;
  weight?: number;
  bodyFat?: number;
  spO2?: number;
  respiration?: number;
  vo2max?: number;
  steps?: number;
  distanceMeters?: number;
  exerciseMinutes?: number;
  floors?: number;
  restingCaloriesBurned?: number;
  activeCaloriesBurned?: number;
  totalCaloriesBurned?: number;
  rawJson?: Record<string, unknown>;
};

/** A single heart-rate reading within a workout. */
export type WorkoutHeartRateSample = {
  /** ISO timestamp */
  t: string;
  bpm: number;
};

export type WorkoutPowerSample = {
  t: string;
  watts: number;
};

export type WorkoutCadenceSample = {
  t: string;
  /** rpm (cycling) or steps/min (running) */
  rpm: number;
};

export type WorkoutSpeedSample = {
  t: string;
  /** meters per second */
  mps: number;
};

export type WorkoutRoutePoint = {
  t: string;
  lat: number;
  lon: number;
  altitudeMeters?: number;
};

export type WorkoutLap = {
  startedAt: string;
  endedAt: string;
  distanceMeters?: number;
};

export type PlatformWorkoutSession = {
  platformSessionId: string;
  platform: HealthPlatform;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  sportType?: string;
  title?: string;
  activeCalories?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  /** Time-ordered streams for the session, when readable. */
  heartRateSamples?: WorkoutHeartRateSample[];
  powerSamples?: WorkoutPowerSample[];
  cadenceSamples?: WorkoutCadenceSample[];
  speedSamples?: WorkoutSpeedSample[];
  routePoints?: WorkoutRoutePoint[];
  laps?: WorkoutLap[];
};

export type RemoteWorkoutMatchCandidate = {
  id: string;
  externalId?: string | null;
  source?: string | null;
  date: string | null;
  type: string | null;
  durationSec: number | null;
};

/** Optional bounded read window for platform readers. */
export type HealthReadWindow = {
  /** Inclusive lower bound (defaults to lookback start). */
  from?: Date;
  /** Lookback length when `from` is omitted. */
  lookbackDays?: number;
};

export const LOOKBACK_DAYS = 14;
/** Overlap before watermark to catch late-arriving / edited samples. */
export const WATERMARK_OVERLAP_MS = 6 * 60 * 60 * 1000;
export const WELLNESS_LEDGER_MAX = 90;
export const WORKOUT_LEDGER_MAX = 100;
export const WORKOUT_MATCH_TOLERANCE_MS = 5 * 60 * 1000;
export const MAX_STREAM_SAMPLES = 1200;
export const MAX_ROUTE_SAMPLES = 1200;
