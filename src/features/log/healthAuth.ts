import { Linking, Platform } from 'react-native';

import { resolveHealthKitAccess } from '@/src/features/health/healthKitAccess';
import {
  hasRequiredHealthConnectPermissions,
  HEALTHKIT_SYNC_READ_TYPES,
  requestHealthSyncPermissions,
} from '@/src/features/health/syncPermissions';

export type HealthAuthStatus =
  | 'loading'
  | 'not_available'
  | 'should_request'
  | 'unnecessary' // iOS: requested, but whether reads were granted is unknowable (CW-571)
  | 'connected' // Android: required reads granted. iOS: a probe read returned data
  | 'partially_connected' // Android: some reads granted, but not the full sync set
  | 'not_connected'; // Android: no permissions granted

export interface HealthStatusResult {
  status: HealthAuthStatus;
  details?: {
    sleepGranted?: boolean;
    weightGranted?: boolean;
    workoutsGranted?: boolean;
    heartGranted?: boolean;
    caloriesGranted?: boolean;
    stepsGranted?: boolean;
    sdkStatus?: number;
  };
}

function hasRead(
  granted: readonly { recordType?: string; accessType?: string }[],
  recordType: string,
): boolean {
  return granted.some((p) => p.recordType === recordType && p.accessType === 'read');
}

/** How far back the read probe looks for any sample at all. */
const PROBE_LOOKBACK_DAYS = 90;

/**
 * Types the probe tries, cheapest and most-populated first.
 *
 * Any one hit proves reads work, so this stops at the first sample rather than
 * querying the full sync set.
 */
const PROBE_QUANTITY_TYPES = [
  { identifier: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
  { identifier: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min' },
  { identifier: 'HKQuantityTypeIdentifierBodyMass', unit: 'kg' },
] as const;

/**
 * Best-effort check that HealthKit reads actually return something (CW-571).
 *
 * This exists because HealthKit will not tell us whether read access was
 * granted, so the only positive evidence available is a read that comes back
 * with data. It can only ever *upgrade* the reported status: a throw or an
 * empty store both return `false`, which leaves the athlete on the honest
 * "requested, unverified" state rather than a fabricated denial.
 */
async function probeHealthKitReadAccess(
  HK: typeof import('@kingstinct/react-native-healthkit'),
): Promise<boolean> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - PROBE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  for (const { identifier, unit } of PROBE_QUANTITY_TYPES) {
    try {
      const samples = await HK.queryQuantitySamples(identifier, {
        limit: 1,
        ascending: false,
        unit,
        filter: { date: { startDate, endDate } },
      });
      if (samples && samples.length > 0) return true;
    } catch {
      // A single unreadable type says nothing about the rest — keep probing.
    }
  }
  return false;
}

async function getHealthKitAuthStatus(): Promise<HealthStatusResult> {
  try {
    const HK = await import('@kingstinct/react-native-healthkit');
    const available = await HK.isHealthDataAvailable();
    if (!available) {
      return { status: 'not_available' };
    }

    const { AuthorizationRequestStatus } = await import('@kingstinct/react-native-healthkit');

    // Full Health Sync read set — same types requested on Connect.
    const requestStatus = await HK.getRequestStatusForAuthorization({
      toRead: HEALTHKIT_SYNC_READ_TYPES,
    });

    if (requestStatus === AuthorizationRequestStatus.shouldRequest) {
      return {
        status: resolveHealthKitAccess({ requestStatus: 'should_request', probeFoundData: false }),
      };
    }

    // `.unnecessary` means "already granted **or** denied" — it is not evidence
    // of access, so only a real read can promote this to connected (CW-571).
    if (requestStatus === AuthorizationRequestStatus.unnecessary) {
      return {
        status: resolveHealthKitAccess({
          requestStatus: 'already_requested',
          probeFoundData: await probeHealthKitReadAccess(HK),
        }),
      };
    }

    return {
      status: resolveHealthKitAccess({ requestStatus: 'should_request', probeFoundData: false }),
    };
  } catch (err) {
    console.warn('[HealthKit] Error checking auth status:', err);
    return { status: 'not_available' };
  }
}

async function getHealthConnectAuthStatus(): Promise<HealthStatusResult> {
  try {
    const HC = await import('react-native-health-connect');
    const status = await HC.getSdkStatus();
    if (status !== 3) {
      // 3 = SDK_AVAILABLE
      return { status: 'not_available', details: { sdkStatus: status } };
    }

    await HC.initialize();
    const granted = await HC.getGrantedPermissions();

    const details = {
      sleepGranted: hasRead(granted, 'SleepSession'),
      weightGranted: hasRead(granted, 'Weight'),
      workoutsGranted: hasRead(granted, 'ExerciseSession'),
      heartGranted: hasRead(granted, 'HeartRate') || hasRead(granted, 'RestingHeartRate'),
      caloriesGranted:
        hasRead(granted, 'ActiveCaloriesBurned') || hasRead(granted, 'TotalCaloriesBurned'),
      stepsGranted: hasRead(granted, 'Steps'),
    };

    if (hasRequiredHealthConnectPermissions(granted)) {
      return { status: 'connected', details };
    }

    const anyGranted = Object.values(details).some(Boolean);
    if (anyGranted) {
      return { status: 'partially_connected', details };
    }

    return { status: 'not_connected', details };
  } catch (err) {
    console.warn('[HealthConnect] Error checking auth status:', err);
    return { status: 'not_available' };
  }
}

/**
 * Checks the current device permission / authorization status for Health data.
 */
export async function getHealthAuthStatus(): Promise<HealthStatusResult> {
  if (Platform.OS === 'ios') {
    return await getHealthKitAuthStatus();
  }
  if (Platform.OS === 'android') {
    return await getHealthConnectAuthStatus();
  }
  return { status: 'not_available' };
}

/**
 * Prompt the user for the full Health Sync read set (wellness + workouts).
 */
export async function requestHealthAuth(): Promise<boolean> {
  return requestHealthSyncPermissions();
}

/**
 * Revokes all Health Connect permissions on Android.
 */
export async function disconnectHealth(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const HC = await import('react-native-health-connect');
    await HC.revokeAllPermissions();
    return true;
  } catch (err) {
    console.warn('[HealthConnect] Error disconnecting:', err);
    return false;
  }
}

/**
 * Opens the platform health settings surface so the athlete can fix denials.
 * Android → Health Connect settings; iOS → Apple Health (read grants are edited there).
 */
export async function openHealthSettings(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const HC = await import('react-native-health-connect');
      await HC.openHealthConnectSettings();
      return true;
    } catch (err) {
      console.warn('[HealthConnect] Error opening settings:', err);
      return false;
    }
  }

  if (Platform.OS === 'ios') {
    try {
      // Health app deep link; falls back to failing closed if the scheme is unavailable.
      await Linking.openURL('x-apple-health://');
      return true;
    } catch (err) {
      console.warn('[HealthKit] Error opening Apple Health:', err);
      return false;
    }
  }

  return false;
}
