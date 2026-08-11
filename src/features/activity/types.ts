import type { StructureChartBlock } from './structureIntensity';

export type { StructureChartBlock };

export type WorkoutAnalysisStatus =
  'NOT_STARTED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;

/** Raw workout row from `GET /api/workouts`. */
export type WorkoutListItemApi = {
  id: string;
  title?: string | null;
  date?: string | Date | null;
  type?: string | null;
  durationSec?: number | null;
  tss?: number | null;
  trainingLoad?: number | null;
  aiAnalysisStatus?: WorkoutAnalysisStatus | null;
  streams?: { id?: string } | null;
  source?: string | null;
  summaryPolyline?: string | null;
};

/** Raw planned row from `GET /api/planned-workouts`. */
export type PlannedListItemApi = {
  id: string;
  title?: string | null;
  date?: string | Date | null;
  type?: string | null;
  description?: string | null;
  durationSec?: number | null;
  tss?: number | null;
  trainingWeekId?: string | null;
  /** Present on Prisma list rows even when OpenAPI omits it. */
  structuredWorkout?: unknown;
};

export type PlanAdherenceApi = {
  plannedWorkoutId?: string | null;
  overallScore?: number | null;
  summary?: string | null;
  analysisStatus?: string | null;
};

export type WorkoutExerciseSetApi = {
  reps?: number | null;
  weight?: number | null;
  weightUnit?: string | null;
  rpe?: number | null;
  durationSec?: number | null;
  order?: number | null;
};

export type WorkoutExerciseApi = {
  notes?: string | null;
  order?: number | null;
  exercise?: { title?: string | null; name?: string | null } | null;
  sets?: WorkoutExerciseSetApi[] | null;
};

/** Raw workout detail from `GET /api/workouts/:id` (streams optional). */
export type WorkoutSummaryApi = WorkoutListItemApi & {
  description?: string | null;
  distanceMeters?: number | null;
  averageWatts?: number | null;
  normalizedPower?: number | null;
  averageHr?: number | null;
  elevationGain?: number | null;
  /** Intensity factor on the workout row (not `intensityFactor`). */
  intensity?: number | null;
  averageCadence?: number | null;
  calories?: number | null;
  maxHr?: number | null;
  maxWatts?: number | null;
  variabilityIndex?: number | null;
  efficiencyFactor?: number | null;
  plannedWorkoutId?: string | null;
  planAdherence?: PlanAdherenceApi | null;
  exercises?: WorkoutExerciseApi[] | null;
  aiAnalysis?: string | null;
  aiAnalysisJson?: unknown;
  aiAnalyzedAt?: string | Date | null;
  overallScore?: number | null;
  technicalScore?: number | null;
  effortScore?: number | null;
  pacingScore?: number | null;
  executionScore?: number | null;
};

export type LinkedCompletedWorkoutApi = {
  id: string;
  title?: string | null;
  date?: string | Date | null;
  type?: string | null;
};

/** Raw planned detail from `GET /api/planned-workouts/:id`. */
export type PlannedDetailApi = PlannedListItemApi & {
  structuredWorkout?: unknown;
  completionStatus?: string | null;
  syncStatus?: string | null;
  /** Planned intensity factor (Prisma `workIntensity`, not `intensityFactor`). */
  workIntensity?: number | null;
  fuelingStrategy?: string | null;
  completedWorkouts?: LinkedCompletedWorkoutApi[] | null;
};

export type FuelingPlanApi = {
  windows?: unknown;
  dailyTotals?: {
    calories?: number | null;
    carbs?: number | null;
    protein?: number | null;
    fat?: number | null;
    fuelState?: number | null;
  } | null;
  notes?: string[] | null;
};

export type FuelingPrepApi = {
  workoutId?: string;
  fuelingPlan?: FuelingPlanApi | null;
};

export type ActivityRowStatus = {
  /** Short label for list rows */
  label: string;
  /** Stable key for tests / styling */
  kind: 'ready' | 'processing' | 'failed' | 'uploaded' | 'unknown';
};

export type ActivityListItem = {
  id: string;
  title: string;
  date: string | null;
  type: string | null;
  durationSec: number | null;
  tss: number | null;
  trainingLoad: number | null;
  status: ActivityRowStatus;
  summaryPolyline?: string | null;
};

export type SummaryMetric = {
  key: string;
  label: string;
  value: string;
};

export type AnalysisPhase = 'ready' | 'analyzing' | 'failed' | 'quota' | 'not_started' | 'unknown';

export type AnalysisScore = {
  key: string;
  label: string;
  value: number;
};

export type AnalysisSection = {
  title: string;
  statusLabel: string | null;
  points: string[];
};

export type AnalysisRecommendation = {
  title: string;
  description: string;
  priority: string | null;
};

export type ActivityAnalysis = {
  phase: AnalysisPhase;
  statusLabel: string;
  scores: AnalysisScore[];
  executiveSummary: string | null;
  sections: AnalysisSection[];
  recommendations: AnalysisRecommendation[];
  strengths: string[];
  weaknesses: string[];
  markdownFallback: string | null;
  analyzedAt: string | null;
  /** True when there is athlete-facing body content beyond status. */
  hasContent: boolean;
};

export type PlanAdherenceGlance = {
  plannedWorkoutId: string | null;
  overallScore: number | null;
  summary: string | null;
  /** ready | pending | failed | unknown */
  phase: 'ready' | 'pending' | 'failed' | 'unknown';
  statusLabel: string | null;
};

export type CompletedExercise = {
  name: string;
  prescription: string | null;
};

export type ActivitySummary = ActivityListItem & {
  description: string | null;
  loadLabel: string | null;
  /** Present metrics only — empty when none available. */
  metrics: SummaryMetric[];
  analysis: ActivityAnalysis;
  plannedWorkoutId: string | null;
  planAdherence: PlanAdherenceGlance | null;
  exercises: CompletedExercise[];
};

export type PlannedListItem = {
  id: string;
  title: string;
  date: string | null;
  type: string | null;
  durationSec: number | null;
  tss: number | null;
  /**
   * Coach description when the list payload carried one. Optional because list rows may omit
   * it — editors must treat `undefined` as "unknown", never as "clear it" (CW-486).
   */
  description?: string | null;
  /** Compact endurance silhouette when list payload includes structuredWorkout. */
  structureChartBlocks?: StructureChartBlock[];
};

export type PlannedStructureStep = {
  name: string;
  durationSec: number | null;
  intensityLabel: string | null;
  /** Cadence target ("90 rpm", "85–95 rpm") shown after intensity (CW-302). */
  cadenceLabel?: string | null;
  /** Strength block title / warmup-cooldown cue — not an exercise row. */
  isSection?: boolean;
  /** Target-aware zone hint for step rail color when resolvable. */
  zoneIndex?: number | null;
};

export type PlannedZoneBand = {
  name: string;
  rangeLabel: string;
};

export type PlannedZoneSummary = {
  channelLabel: string;
  bands: PlannedZoneBand[];
};

export type LinkedCompletedWorkout = {
  id: string;
  title: string;
  date: string | null;
  type: string | null;
};

export type PlannedDetail = PlannedListItem & {
  description: string | null;
  structureSteps: PlannedStructureStep[];
  /** True when structure was mapped from strength `blocks` / `exercises`. */
  structureIsStrength: boolean;
  /** Endurance silhouette blocks (may be empty). Rebuilt with athlete FTP when available. */
  structureChartBlocks: StructureChartBlock[];
  /** Raw structuredWorkout for re-resolving chart intensity with athlete thresholds. */
  structureSource: unknown | null;
  workIntensityLabel: string | null;
  completionLabel: string | null;
  /** Raw uppercased completion status when known. */
  completionStatus: string | null;
  syncLabel: string | null;
  coachInstructions: string | null;
  zoneSummary: PlannedZoneSummary | null;
  fuelingStrategy: string | null;
  linkedCompleted: LinkedCompletedWorkout | null;
  /** True when Complete/Skip are still available. */
  complianceActionable: boolean;
};

export type FuelingPrepGlance = {
  carbsLabel: string | null;
  caloriesLabel: string | null;
  fuelStateLabel: string | null;
  strategyLabel: string | null;
  note: string | null;
};

export const RECENT_ACTIVITY_LIMIT = 10;
export const UPCOMING_PLANNED_LIMIT = 20;
export const UPCOMING_WINDOW_DAYS = 14;

/** Athlete activity glance — wider than Today list defaults. */
export const ACTIVITY_GLANCE_WORKOUT_PAGE_SIZE = 50;
export const ACTIVITY_GLANCE_WORKOUT_MAX_PAGES = 4;
export const ACTIVITY_GLANCE_PLANNED_LIMIT = 100;
