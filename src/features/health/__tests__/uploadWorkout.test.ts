import { installFormDataPatch } from 'expo/src/winter/FormData';
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformWorkoutSession } from '../types';

const apiFetchMock = vi.fn();

vi.mock('@/src/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const FIT_BYTES = new Uint8Array([0x0e, 0x10, 0x2a, 0x00]);

vi.mock('../buildMinimalFit', () => ({
  buildMinimalFit: () => FIT_BYTES,
  fitFilename: () => 'workout-test.fit',
}));

// Mirrors the expo-file-system File surface uploadWorkout relies on: the
// Blob-like interface expo's fetch serializer accepts (bytes() + name).
class FakeFile {
  name: string;
  exists = false;
  private contents: Uint8Array | null = null;

  constructor(_dir: unknown, name: string) {
    this.name = name;
  }

  get uri() {
    return `file:///cache/${this.name}`;
  }

  create() {
    this.exists = true;
  }

  write(bytes: Uint8Array) {
    this.contents = bytes;
  }

  delete() {
    this.exists = false;
    this.contents = null;
  }

  async bytes(): Promise<Uint8Array> {
    if (!this.contents) throw new Error('file has no contents');
    return this.contents;
  }
}

vi.mock('expo-file-system', () => ({
  File: FakeFile,
  Paths: { cache: '/cache' },
}));

// On-device, expo's winter runtime patches React Native's FormData (which
// stores parts in `_parts`) — recreate that exact global here so append()
// behaves as it does in the app, not as Node's undici FormData.
class RNFormDataBase {
  _parts: [string, unknown][] = [];
  getParts() {
    return this._parts;
  }
}
const originalFormData = globalThis.FormData;
globalThis.FormData = installFormDataPatch(
  RNFormDataBase as unknown as typeof FormData,
) as unknown as typeof FormData;

afterAll(() => {
  globalThis.FormData = originalFormData;
});

const session: PlatformWorkoutSession = {
  platform: 'healthkit',
  platformSessionId: 'hk-123',
  startedAt: '2026-08-01T11:19:00.000Z',
  endedAt: '2026-08-01T12:07:00.000Z',
  sportType: 'strength',
} as PlatformWorkoutSession;

describe('uploadPlatformWorkout', () => {
  let serialized: Uint8Array;

  beforeEach(() => {
    // Serialize inside the fetch mock: on-device expo fetch does this during
    // the request, before uploadWorkout's finally block deletes the cache file.
    apiFetchMock.mockImplementation(async (_url: string, init: { body: FormData }) => {
      serialized = (await convertFormDataAsync(init.body)).body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          results: { processed: 1, items: [{ workoutId: 'w1' }] },
        }),
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a FormData body that expo fetch can serialize', async () => {
    const { uploadPlatformWorkout } = await import('../uploadWorkout');
    await uploadPlatformWorkout(session);

    // Serialized by the exact converter expo's fetch runs on-device. The
    // previous RN-style {uri} part made it throw
    // 'Unsupported FormDataPart implementation'.
    const text = new TextDecoder().decode(serialized);

    expect(text).toContain('name="file"');
    expect(text).toContain('filename="workout-test.fit"');
    expect(text).toContain('name="metadata"');
    expect(text).toContain('"platformSessionId":"hk-123"');
  });

  it('serialized body contains the FIT payload bytes', async () => {
    const { uploadPlatformWorkout } = await import('../uploadWorkout');
    await uploadPlatformWorkout(session);

    const body = serialized;
    const needle = FIT_BYTES;
    let found = false;
    outer: for (let i = 0; i <= body.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (body[i + j] !== needle[j]) continue outer;
      }
      found = true;
      break;
    }
    expect(found).toBe(true);
  });
});
