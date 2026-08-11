import { apiFetch } from '@/src/api/client';
import type { WeightUnits } from '@/src/features/profile/types';

import { mapWellnessOverview } from './mapWellnessOverview';
import type { WellnessOverview } from './types';

export async function fetchWellnessOverview(
  date: string,
  weightUnits: WeightUnits = 'Kilograms',
): Promise<WellnessOverview | null> {
  const response = await apiFetch(`/api/wellness/${encodeURIComponent(date)}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to load wellness (${response.status})`);
  }
  const text = await response.text();
  if (!text || text === 'null') return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Invalid wellness response');
  }
  if (json == null) return null;
  return mapWellnessOverview(json, { weightUnits });
}
