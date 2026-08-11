import { apiFetch } from '@/src/api/client';

import { localDateYmd } from '@/src/lib/date';
import { pickTodayWellness } from './mapLogForm';
import type { WellnessDay, WellnessUploadPayload } from './types';

export async function fetchTodayWellness(): Promise<WellnessDay | null> {
  const response = await apiFetch('/api/wellness');
  if (!response.ok) {
    throw new Error(`Failed to load wellness (${response.status})`);
  }
  const rows = (await response.json()) as unknown[];
  return pickTodayWellness(rows, localDateYmd());
}

export async function saveWellnessCheckin(payload: WellnessUploadPayload): Promise<void> {
  const response = await apiFetch('/api/wellness', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Save failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; statusMessage?: string };
      message = body.message || body.statusMessage || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}
