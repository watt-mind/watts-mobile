/* eslint-disable import/first -- vi.mock factories must be declared before the modules under test are imported. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => true },
}));

vi.mock('@/src/auth/tokenStorage', () => ({
  loadTokens: vi.fn(async () => ({ accessToken: 'token-123' })),
}));

vi.mock('../syncPreferences', () => ({
  loadHealthSyncPreferences: vi.fn(async () => ({
    syncEnabled: true,
    syncWorkouts: false,
    workoutsDefaultApplied: true,
  })),
  markHealthSyncSuccess: vi.fn(async () => {}),
}));

vi.mock('../fetchRemoteWorkouts', () => ({
  fetchRemoteWorkoutsForMatch: vi.fn(async () => [] as unknown[]),
}));

const uploadWellnessPayload = vi.fn(async () => {});
vi.mock('../uploadWellness', () => ({
  uploadWellnessPayload: (...args: unknown[]) =>
    uploadWellnessPayload(...(args as Parameters<typeof uploadWellnessPayload>)),
}));

vi.mock('../uploadWorkout', () => ({
  uploadPlatformWorkout: vi.fn(async () => ({ queued: false, remoteWorkoutId: 'r1' })),
}));

type ReadWindowArg = { lookbackDays?: number; from?: Date } | undefined;
const readPlatformWellness = vi.fn(async (_window?: ReadWindowArg) => [] as unknown[]);
vi.mock('../readers', () => ({
  readPlatformWellness: (...args: Parameters<typeof readPlatformWellness>) =>
    readPlatformWellness(...args),
  readPlatformWorkouts: vi.fn(async () => [] as unknown[]),
}));

import { _resetSyncLedgerForTests, getLedgerItem } from '../ledger';
import { wellnessLedgerId } from '../ledgerHelpers';
import { localDateYmd } from '../mapToWellnessPayload';
import { runHealthSyncPass } from '../orchestrator';
import { _resetWatermarksForTests } from '../watermarks';

const today = localDateYmd();
const todayId = wellnessLedgerId(today);

/**
 * CW-478: today's wellness sample re-uploads on every pass, so `attemptCount`
 * used to accumulate without bound while the item was healthy. Once it passed
 * MAX_AUTO_SYNC_ATTEMPTS (5), the first transient failure wedged the item: the
 * backoff refused every later automatic retry, and the unresolved failure pinned
 * the watermark so each pass re-read the whole lookback window.
 */
describe('wellness auto-retry backoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSyncLedgerForTests();
    _resetWatermarksForTests();
    uploadWellnessPayload.mockResolvedValue(undefined);
    readPlatformWellness.mockResolvedValue([
      { date: today, platform: 'healthkit', steps: 5000, restingHr: 48 },
    ]);
  });

  it('auto-retries after a failure that follows a long run of successes', async () => {
    // Well past MAX_AUTO_SYNC_ATTEMPTS worth of healthy passes.
    for (let i = 0; i < 8; i++) {
      await runHealthSyncPass({ force: true });
    }
    const healthy = await getLedgerItem(todayId);
    expect(healthy?.status).toBe('synced');
    expect(healthy?.attemptCount).toBe(0);

    // One transient upload failure.
    uploadWellnessPayload.mockRejectedValueOnce(new Error('network down'));
    const failedPass = await runHealthSyncPass();
    expect(failedPass.wellnessFailed).toBe(1);
    expect((await getLedgerItem(todayId))?.status).toBe('failed');

    // The next pass must pick it up again without a manual retry.
    uploadWellnessPayload.mockResolvedValue(undefined);
    const recoveryPass = await runHealthSyncPass();
    expect(recoveryPass.wellnessSynced).toBe(1);
    expect(recoveryPass.wellnessFailed).toBe(0);
    expect((await getLedgerItem(todayId))?.status).toBe('synced');
  });

  it('still stops auto-retrying after MAX_AUTO_SYNC_ATTEMPTS consecutive failures', async () => {
    uploadWellnessPayload.mockRejectedValue(new Error('server down'));

    for (let i = 0; i < 5; i++) {
      await runHealthSyncPass();
    }
    const exhausted = await getLedgerItem(todayId);
    expect(exhausted?.status).toBe('failed');
    expect(exhausted?.attemptCount).toBe(5);

    // Sixth pass: backed off, so no further upload is attempted.
    uploadWellnessPayload.mockClear();
    await runHealthSyncPass();
    expect(uploadWellnessPayload).not.toHaveBeenCalled();

    // A manual/forced sync still overrides the backoff.
    uploadWellnessPayload.mockResolvedValue(undefined);
    const forced = await runHealthSyncPass({ force: true });
    expect(forced.wellnessSynced).toBe(1);
    expect((await getLedgerItem(todayId))?.attemptCount).toBe(0);
  });
});
