import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onlineManager } from '@tanstack/react-query';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { saveWellnessCheckin } from '../api';
import {
  MAX_PENDING_WELLNESS_CHECKINS,
  clearPendingWellnessCheckin,
  enqueueWellnessCheckin,
  flushPendingWellnessCheckin,
  loadPendingWellnessCheckin,
  loadPendingWellnessCheckins,
} from '../offlineWellnessQueue';

const LEGACY_QUEUE_KEY = 'watts.offline.wellnessCheckin.v1';

vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    onlineManager: {
      isOnline: vi.fn(() => true),
      subscribe: vi.fn(() => () => {}),
    },
  };
});

vi.mock('../api', () => ({
  saveWellnessCheckin: vi.fn(async () => undefined),
}));

describe('offlineWellnessQueue', () => {
  beforeEach(async () => {
    await clearPendingWellnessCheckin();
    vi.mocked(saveWellnessCheckin).mockClear();
    vi.mocked(onlineManager.isOnline).mockReturnValue(true);
  });

  it('enqueues and loads a pending check-in', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 4 });
    const pending = await loadPendingWellnessCheckin();
    expect(pending?.payload).toEqual({ date: '2026-07-20', mood: 4 });
    expect(pending?.queuedAt).toEqual(expect.any(Number));
  });

  it('flushes when online and clears the queue', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', sleepHours: 7.5 });
    const synced = await flushPendingWellnessCheckin();
    expect(synced).toBe(true);
    expect(saveWellnessCheckin).toHaveBeenCalledWith({ date: '2026-07-20', sleepHours: 7.5 });
    expect(await loadPendingWellnessCheckin()).toBeNull();
  });

  it('skips flush while offline', async () => {
    vi.mocked(onlineManager.isOnline).mockReturnValue(false);
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 3 });
    expect(await flushPendingWellnessCheckin()).toBe(false);
    expect(saveWellnessCheckin).not.toHaveBeenCalled();
    expect(await loadPendingWellnessCheckin()).not.toBeNull();
  });

  it('does not drop a newer check-in queued while a flush is in flight', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 2 });

    // Simulate the athlete saving a new check-in while the POST for the
    // first one is still in flight: swap the "in-flight" payload into
    // storage for a newer one mid-flush, before clear-if-unchanged runs.
    vi.mocked(saveWellnessCheckin).mockImplementationOnce(async () => {
      await enqueueWellnessCheckin({ date: '2026-07-21', mood: 5 });
    });

    const synced = await flushPendingWellnessCheckin();
    expect(synced).toBe(true);

    // The newer, queued-during-flush check-in must survive the flush's clear.
    const remaining = await loadPendingWellnessCheckin();
    expect(remaining?.payload).toEqual({ date: '2026-07-21', mood: 5 });
  });

  it('queues check-ins for several dates and flushes them all', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 2 });
    await enqueueWellnessCheckin({ date: '2026-07-21', mood: 3 });
    await enqueueWellnessCheckin({ date: '2026-07-22', mood: 4 });

    expect((await loadPendingWellnessCheckins()).map((entry) => entry.payload.date)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
    ]);

    expect(await flushPendingWellnessCheckin()).toBe(true);
    expect(saveWellnessCheckin).toHaveBeenCalledTimes(3);
    expect(vi.mocked(saveWellnessCheckin).mock.calls.map(([payload]) => payload.date)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
    ]);
    expect(await loadPendingWellnessCheckins()).toEqual([]);
  });

  it('replaces an earlier check-in for the same date instead of duplicating it', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 2 });
    await enqueueWellnessCheckin({ date: '2026-07-21', mood: 3 });
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 5, sleepHours: 8 });

    const pending = await loadPendingWellnessCheckins();
    expect(pending).toHaveLength(2);
    expect(pending.find((entry) => entry.payload.date === '2026-07-20')?.payload).toEqual({
      date: '2026-07-20',
      mood: 5,
      sleepHours: 8,
    });
  });

  it('keeps un-synced check-ins when the flush fails part-way through', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 2 });
    await enqueueWellnessCheckin({ date: '2026-07-21', mood: 3 });
    await enqueueWellnessCheckin({ date: '2026-07-22', mood: 4 });

    vi.mocked(saveWellnessCheckin)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('Network request failed');
      });

    expect(await flushPendingWellnessCheckin()).toBe(true);

    const remaining = await loadPendingWellnessCheckins();
    expect(remaining.map((entry) => entry.payload.date)).toEqual(['2026-07-21', '2026-07-22']);
  });

  it('rethrows and keeps everything queued when nothing could be synced', async () => {
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 2 });
    vi.mocked(saveWellnessCheckin).mockImplementationOnce(async () => {
      throw new Error('Network request failed');
    });

    await expect(flushPendingWellnessCheckin()).rejects.toThrow('Network request failed');
    expect(await loadPendingWellnessCheckins()).toHaveLength(1);
  });

  it('migrates a legacy single-slot check-in left over from an older build', async () => {
    await AsyncStorage.setItem(
      LEGACY_QUEUE_KEY,
      JSON.stringify({ payload: { date: '2026-07-19', mood: 1 }, queuedAt: 1 }),
    );

    // A newer build queues its own entry; the legacy one must survive.
    await enqueueWellnessCheckin({ date: '2026-07-20', mood: 4 });

    expect((await loadPendingWellnessCheckins()).map((entry) => entry.payload.date)).toEqual([
      '2026-07-19',
      '2026-07-20',
    ]);
    // Legacy slot is consumed, so it cannot be resurrected on a later read.
    expect(await AsyncStorage.getItem(LEGACY_QUEUE_KEY)).toBeNull();

    expect(await flushPendingWellnessCheckin()).toBe(true);
    expect(saveWellnessCheckin).toHaveBeenCalledWith({ date: '2026-07-19', mood: 1 });
    expect(await loadPendingWellnessCheckins()).toEqual([]);
  });

  it('caps the queue and drops the oldest entries first', async () => {
    for (let index = 0; index < MAX_PENDING_WELLNESS_CHECKINS + 3; index += 1) {
      await enqueueWellnessCheckin({
        date: `2026-07-${String(index + 1).padStart(2, '0')}`,
        mood: 3,
      });
    }

    const pending = await loadPendingWellnessCheckins();
    expect(pending).toHaveLength(MAX_PENDING_WELLNESS_CHECKINS);
    expect(pending[0].payload.date).toBe('2026-07-04');
  });

  it('clears both the current and legacy storage slots', async () => {
    await AsyncStorage.setItem(
      LEGACY_QUEUE_KEY,
      JSON.stringify({ payload: { date: '2026-07-19', mood: 1 }, queuedAt: 1 }),
    );
    await clearPendingWellnessCheckin();

    expect(await AsyncStorage.getItem(LEGACY_QUEUE_KEY)).toBeNull();
    expect(await loadPendingWellnessCheckins()).toEqual([]);
  });
});
