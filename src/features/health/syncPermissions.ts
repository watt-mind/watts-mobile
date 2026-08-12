import { Platform } from 'react-native';
// Type-only: erased at runtime, so this module stays importable without the
// native HealthKit module (Android / tests). It exists to make a mistyped
// identifier a compile error instead of a silently-dropped read — the native
// bridge only warns and skips identifiers it cannot resolve.
import type {
  ObjectTypeIdentifier,
  SampleTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
// Same trick for Health Connect: type-only, so this stays importable on iOS and
// in tests. `Permission['recordType']` is the exact set the native bridge can map
// to a permission, which is what makes an unmappable entry (notably a *read* on
// ExerciseRoute) a compile error instead of a runtime InvalidRecordType that
// aborts the whole permission request.
import type {
  BackgroundAccessPermission,
  Permission,
  RecordType,
} from 'react-native-health-connect';

/** HealthKit types for wellness + workout sync (read-only). */
export const HEALTHKIT_SYNC_READ_TYPES = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierDistanceWheelchair',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierFlightsClimbed',
  'HKQuantityTypeIdentifierCyclingPower',
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierCyclingCadence',
  'HKQuantityTypeIdentifierRunningSpeed',
  'HKQuantityTypeIdentifierCyclingSpeed',
  'HKWorkoutTypeIdentifier',
  'HKWorkoutRouteTypeIdentifier',
] as const satisfies readonly ObjectTypeIdentifier[];

/** Types registered for HealthKit background delivery when sync is on. */
export const HEALTHKIT_BACKGROUND_DELIVERY_TYPES = [
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierDistanceWheelchair',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierFlightsClimbed',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierCyclingPower',
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierCyclingCadence',
  'HKQuantityTypeIdentifierRunningSpeed',
  'HKQuantityTypeIdentifierCyclingSpeed',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const satisfies readonly SampleTypeIdentifier[];

/** Health Connect record types for wellness + workout sync. */
export const HEALTH_CONNECT_SYNC_PERMISSIONS = [
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'BodyFat' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'RespiratoryRate' },
  { accessType: 'read', recordType: 'Vo2Max' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'FloorsClimbed' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'BasalMetabolicRate' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Power' },
  { accessType: 'read', recordType: 'Speed' },
  { accessType: 'read', recordType: 'CyclingPedalingCadence' },
  { accessType: 'read', recordType: 'StepsCadence' },
  // NOTE: no `{ read, ExerciseRoute }` entry. react-native-health-connect only
  // special-cases the *write* route permission; a read entry falls through to
  // `reactRecordTypeToClassMap`, which has no `ExerciseRoute` key, and the native
  // `parsePermissions` throws InvalidRecordType. That throw aborts the whole
  // request, so a single bad entry silently kills every Health Connect prompt.
  // READ_EXERCISE_ROUTES stays declared in app.json; the athlete grants it from
  // the Health Connect settings screen (see `openHealthSettings`), and until then
  // `ExerciseSession.exerciseRoute` simply comes back empty.
  // Change-driven / background reads (best-effort; ignored if unsupported).
  { accessType: 'read', recordType: 'BackgroundAccessPermission' },
] as const satisfies readonly (Permission | BackgroundAccessPermission)[];

/**
 * Requested but never required to enable sync — declining these degrades the
 * data set (no background wake) rather than blocking sync.
 */
const OPTIONAL_HEALTH_CONNECT_RECORD_TYPES: readonly string[] = ['BackgroundAccessPermission'];

type HealthConnectPermissionLike = { accessType?: string; recordType?: string };

/** Real record types in the read set — everything except the pseudo permission entries. */
export const HEALTH_CONNECT_CHANGE_RECORD_TYPES: readonly RecordType[] =
  HEALTH_CONNECT_SYNC_PERMISSIONS.filter(
    (permission) =>
      permission.accessType === 'read' &&
      !OPTIONAL_HEALTH_CONNECT_RECORD_TYPES.includes(permission.recordType),
  ).map((permission) => permission.recordType as RecordType);

/**
 * Narrow the change-notification record types to those actually granted.
 *
 * `getChanges` is all-or-nothing: it throws for the whole request if any single
 * requested type is not granted (CW-479). The athlete can revoke an individual
 * type from the Health Connect settings screen at any time, so asking for the
 * full set unconditionally means one revocation kills change-driven sync
 * entirely — and, via the 15-minute foreground poll, re-reports the failure
 * every 15 minutes. Intersecting first degrades to "fewer change triggers".
 */
export function grantedHealthConnectChangeRecordTypes(
  granted: readonly HealthConnectPermissionLike[],
): RecordType[] {
  const readable = new Set(granted.filter((p) => p.accessType === 'read').map((p) => p.recordType));
  return HEALTH_CONNECT_CHANGE_RECORD_TYPES.filter((recordType) => readable.has(recordType));
}

/** Background access is best-effort; the remaining record reads are required. */
export function hasRequiredHealthConnectPermissions(
  granted: readonly HealthConnectPermissionLike[],
): boolean {
  const keys = new Set(granted.map((p) => `${p.accessType}:${p.recordType}`));
  return HEALTH_CONNECT_SYNC_PERMISSIONS.filter(
    (permission) => !OPTIONAL_HEALTH_CONNECT_RECORD_TYPES.includes(permission.recordType),
  ).every((permission) => keys.has(`${permission.accessType}:${permission.recordType}`));
}

/**
 * Why a permission request did not end in usable access.
 *
 * `denied` is Android-only on purpose: Health Connect reports which permissions
 * were granted, HealthKit does not. Collapsing an iOS *exception* into the same
 * bucket as a denial is what made a failing HealthKit call surface as "Health
 * permissions are required to enable sync", hiding the real error in a
 * `console.warn` (CW-571).
 */
export type HealthPermissionFailure =
  /** The platform health store is not usable on this device. */
  | { ok: false; reason: 'unavailable' }
  /** The store reported that required permissions are missing (Android only). */
  | { ok: false; reason: 'denied' }
  /** The request threw. `message` is the underlying error, for display. */
  | { ok: false; reason: 'error'; message: string };

/**
 * Outcome of a permission request.
 *
 * `ok: true` means the request *completed* — on iOS that is all HealthKit will
 * ever tell us, so it deliberately does not imply anything was granted.
 */
export type HealthPermissionRequestResult = { ok: true } | HealthPermissionFailure;

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === 'string' && err ? err : 'Unknown error';
}

/**
 * Request the full Health Sync read set (wellness + workouts).
 * Used by Connect and when enabling Sync to Coach Watts / Sync workouts.
 */
export async function requestHealthSyncPermissionsResult(): Promise<HealthPermissionRequestResult> {
  try {
    if (Platform.OS === 'ios') {
      const HK = await import('@kingstinct/react-native-healthkit');
      const available = await HK.isHealthDataAvailable();
      if (!available) return { ok: false, reason: 'unavailable' };
      // The resolved value only reports that the request was processed, never
      // whether reads were granted — see `healthKitAccess.ts`. A denial is
      // indistinguishable from a grant here, so anything short of a throw is a
      // completed request.
      await HK.requestAuthorization({ toRead: HEALTHKIT_SYNC_READ_TYPES });
      return { ok: true };
    }

    if (Platform.OS === 'android') {
      const HC = await import('react-native-health-connect');
      const status = await HC.getSdkStatus();
      if (status !== HC.SdkAvailabilityStatus.SDK_AVAILABLE) {
        return { ok: false, reason: 'unavailable' };
      }
      await HC.initialize();
      const granted = await HC.requestPermission([...HEALTH_CONNECT_SYNC_PERMISSIONS]);
      return Array.isArray(granted) && hasRequiredHealthConnectPermissions(granted)
        ? { ok: true }
        : { ok: false, reason: 'denied' };
    }
  } catch (err) {
    console.warn('[HealthSync] permission request failed', err);
    return { ok: false, reason: 'error', message: errorMessage(err) };
  }
  return { ok: false, reason: 'unavailable' };
}

/** Boolean form for callers that only branch on success. */
export async function requestHealthSyncPermissions(): Promise<boolean> {
  return (await requestHealthSyncPermissionsResult()).ok;
}

/**
 * What to tell the athlete when a permission request could not be completed.
 *
 * Pure so the wording is testable off-device; `platformOS` is a plain string
 * rather than a `Platform.OS` read for the same reason. Only genuine failures
 * reach here — an iOS denial never does, because HealthKit does not report one.
 */
export function healthPermissionFailureMessage(
  failure: HealthPermissionFailure,
  platformOS: string,
): string {
  const store = platformOS === 'ios' ? 'Apple Health' : 'Health Connect';
  switch (failure.reason) {
    case 'unavailable':
      return `${store} is not available on this device.`;
    case 'denied':
      return `${store} permissions are required to enable sync. Grant the missing data types and try again.`;
    case 'error':
      // Surfacing the underlying error matters: this used to be reported as a
      // permissions problem, which sent people to a settings screen that could
      // not fix it (CW-571).
      return `${store} could not be reached: ${failure.message}`;
  }
}
