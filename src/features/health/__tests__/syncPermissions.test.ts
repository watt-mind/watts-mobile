import { describe, expect, it, vi } from 'vitest';
import {
  grantedHealthConnectChangeRecordTypes,
  hasRequiredHealthConnectPermissions,
  HEALTH_CONNECT_CHANGE_RECORD_TYPES,
  HEALTH_CONNECT_SYNC_PERMISSIONS,
} from '../syncPermissions';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const OPTIONAL = ['BackgroundAccessPermission'];

describe('hasRequiredHealthConnectPermissions', () => {
  const dataPermissions = HEALTH_CONNECT_SYNC_PERMISSIONS.filter(
    (permission) => !OPTIONAL.includes(permission.recordType),
  );

  it('accepts all data permissions without the optional ones', () => {
    expect(hasRequiredHealthConnectPermissions(dataPermissions)).toBe(true);
  });

  it('rejects a partial grant', () => {
    expect(hasRequiredHealthConnectPermissions(dataPermissions.slice(1))).toBe(false);
  });

  it('does not require background access — declining it must not block sync', () => {
    const withoutBackground = HEALTH_CONNECT_SYNC_PERMISSIONS.filter(
      (permission) => permission.recordType !== 'BackgroundAccessPermission',
    );
    expect(hasRequiredHealthConnectPermissions(withoutBackground)).toBe(true);
  });
});

// CW-479: getChanges throws for the whole request if any requested type is not
// granted, so the list must be intersected with the real grants first.
describe('grantedHealthConnectChangeRecordTypes', () => {
  const allGranted = HEALTH_CONNECT_SYNC_PERMISSIONS.map((permission) => ({ ...permission }));

  it('returns the full record set when everything is granted', () => {
    expect(grantedHealthConnectChangeRecordTypes(allGranted)).toEqual([
      ...HEALTH_CONNECT_CHANGE_RECORD_TYPES,
    ]);
  });

  it('never includes the pseudo BackgroundAccessPermission entry', () => {
    expect(HEALTH_CONNECT_CHANGE_RECORD_TYPES).not.toContain('BackgroundAccessPermission');
    expect(grantedHealthConnectChangeRecordTypes(allGranted)).not.toContain(
      'BackgroundAccessPermission',
    );
  });

  it('drops a revoked type and keeps the rest', () => {
    const withoutSleep = allGranted.filter(
      (permission) => permission.recordType !== 'SleepSession',
    );
    const result = grantedHealthConnectChangeRecordTypes(withoutSleep);
    expect(result).not.toContain('SleepSession');
    expect(result).toContain('Steps');
    expect(result.length).toBe(HEALTH_CONNECT_CHANGE_RECORD_TYPES.length - 1);
  });

  it('ignores write grants — only reads carry change notifications', () => {
    expect(
      grantedHealthConnectChangeRecordTypes([{ accessType: 'write', recordType: 'Steps' }]),
    ).toEqual([]);
  });

  it('returns nothing when all permissions are revoked', () => {
    expect(grantedHealthConnectChangeRecordTypes([])).toEqual([]);
  });
});

describe('HEALTH_CONNECT_SYNC_PERMISSIONS', () => {
  it('never requests read access to ExerciseRoute', () => {
    // Only the *write* route permission is special-cased natively; a read entry
    // throws InvalidRecordType and takes every other permission down with it, so
    // a single bad entry means no Health Connect prompt at all.
    //
    // The real guard is the `satisfies readonly (Permission | BackgroundAccessPermission)[]`
    // on the list itself, which makes this a compile error. This case just keeps
    // the incident documented — and catches a re-introduced `as` cast, which is
    // how it got past the compiler the first time.
    const requested: readonly { accessType: string; recordType: string }[] =
      HEALTH_CONNECT_SYNC_PERMISSIONS;
    expect(requested.some((permission) => permission.recordType === 'ExerciseRoute')).toBe(false);
  });
});
