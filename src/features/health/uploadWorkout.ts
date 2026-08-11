import { File, Paths } from 'expo-file-system';

import { apiFetch } from '@/src/api/client';

import { buildMinimalFit, fitFilename } from './buildMinimalFit';
import type { PlatformWorkoutSession } from './types';

export type UploadWorkoutResult = {
  remoteWorkoutId?: string;
  duplicate?: boolean;
  queued: boolean;
};

export async function uploadPlatformWorkout(
  session: PlatformWorkoutSession,
): Promise<UploadWorkoutResult> {
  const fitBytes = buildMinimalFit(session);
  const filename = fitFilename(session);
  const cacheFile = new File(Paths.cache, filename);

  try {
    if (cacheFile.exists) {
      cacheFile.delete();
    }
    cacheFile.create();
    cacheFile.write(fitBytes);

    const form = new FormData();
    // Expo's fetch serializes FormData itself and rejects RN-style `{uri}` parts;
    // the expo-file-system File implements the Blob interface it expects.
    form.append('file', cacheFile, filename);
    form.append(
      'metadata',
      JSON.stringify({
        source: session.platform,
        platform: session.platform,
        platformSessionId: session.platformSessionId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        sportType: session.sportType,
      }),
    );
    if (session.title) {
      form.append('name', session.title);
    }

    const response = await apiFetch('/api/workouts/upload-fit', {
      method: 'POST',
      body: form,
    });
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      statusMessage?: string;
      results?: {
        duplicates?: number;
        processed?: number;
        failed?: number;
        errors?: string[];
        items?: { workoutId?: string; state?: string }[];
      };
      data?: { id?: string };
      id?: string;
    } | null;

    if (!response.ok || body?.success === false || (body?.results?.failed ?? 0) > 0) {
      const detail = body?.results?.errors?.filter(Boolean).join('; ');
      throw new Error(
        detail ||
          body?.message ||
          body?.statusMessage ||
          `Workout sync failed (${response.status})`,
      );
    }

    const accepted = (body?.results?.processed ?? 0) + (body?.results?.duplicates ?? 0) > 0;
    if (!accepted) throw new Error(body?.message || 'Workout upload was not accepted');
    const duplicate = (body?.results?.duplicates ?? 0) > 0;
    const remoteWorkoutId =
      body?.results?.items?.find((item) => item.workoutId)?.workoutId ?? body?.data?.id ?? body?.id;
    return { remoteWorkoutId, duplicate, queued: !remoteWorkoutId };
  } finally {
    try {
      if (cacheFile.exists) cacheFile.delete();
    } catch {
      // Cache cleanup is best-effort and must not change upload outcome.
    }
  }
}
