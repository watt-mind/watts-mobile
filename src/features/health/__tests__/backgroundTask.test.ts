import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordBackgroundSyncFailure } from '../backgroundTask';
import { _resetSyncLedgerForTests, loadSyncLedger, saveLedgerItem } from '../ledger';
import { completeLedgerSuccess, seedNeedsSync, wellnessLedgerId } from '../ledgerHelpers';
import { localDateYmd } from '@/src/lib/date';
import { _resetSyncDiagnosticsForTests, loadSyncDiagnostic } from '../syncDiagnostics';

vi.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => store[key] ?? null),
      setItem: vi.fn(async (key: string, val: string) => {
        store[key] = val;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete store[key];
      }),
      clear: vi.fn(async () => {
        store = {};
      }),
    },
  };
});

describe('backgroundTask error reporting', () => {
  beforeEach(() => {
    _resetSyncLedgerForTests();
    _resetSyncDiagnosticsForTests();
  });

  it('records a pass-level failure in the diagnostic slot with its scope', async () => {
    const errorReason = 'Permission denied reading HealthKit wellness samples';
    await recordBackgroundSyncFailure(errorReason, 'sync_pass');

    const diagnostic = await loadSyncDiagnostic();
    expect(diagnostic?.scope).toBe('sync_pass');
    expect(diagnostic?.message).toBe(errorReason);
    expect(diagnostic?.at).toBeTruthy();
  });

  it('defaults to the background_task scope', async () => {
    await recordBackgroundSyncFailure('Background health sync task exception');

    const diagnostic = await loadSyncDiagnostic();
    expect(diagnostic?.scope).toBe('background_task');
  });

  // CW-461: an unrelated pass/platform failure must never land on the wellness
  // ledger entry for today — that entry describes today's wellness upload only.
  it('does not touch the wellness ledger entry for today', async () => {
    const today = localDateYmd(new Date());
    const id = wellnessLedgerId(today);
    await saveLedgerItem(
      completeLedgerSuccess(
        seedNeedsSync('wellness', {
          id,
          kind: 'wellness',
          platform: 'health_connect',
          title: today,
          localDate: today,
        }),
      ),
    );

    await recordBackgroundSyncFailure(
      'Health Connect changes drain error: token expired',
      'health_connect_changes',
    );

    const ledger = await loadSyncLedger();
    const item = ledger.find((i) => i.id === id);
    expect(item?.status).toBe('synced');
    expect(item?.lastError).toBeUndefined();
  });

  it('keeps the failure visible without seeding a failed ledger row', async () => {
    await recordBackgroundSyncFailure(
      'Health Connect changes drain error: boom',
      'health_connect_changes',
    );

    const ledger = await loadSyncLedger();
    expect(ledger.filter((i) => i.status === 'failed')).toHaveLength(0);
    expect((await loadSyncDiagnostic())?.message).toContain('boom');
  });
});
