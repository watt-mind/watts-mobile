import type { PhotoNutritionEstimate } from '@/src/features/nutrition/api';
import { localDateYmd } from '@/src/lib/date';

export type LogMealSheetMode = 'compose' | 'analyzing' | 'review' | 'logged';

export type EstimateConfidence = NonNullable<PhotoNutritionEstimate['confidence']>;

export function confidenceLabel(confidence: EstimateConfidence | undefined): string | null {
  if (confidence === 'HIGH') return 'High confidence';
  if (confidence === 'MEDIUM') return 'Medium confidence — check portions';
  if (confidence === 'LOW') return 'Rough estimate — check portions';
  return null;
}

export function loggedMealTitle(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `Logged · ${trimmed}` : 'Logged';
}

export function saveMealDateLabel(selectedDateYmd: string, now = new Date()): string {
  const today = localDateYmd(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (selectedDateYmd === today) return 'Today';
  if (selectedDateYmd === localDateYmd(yesterday)) return 'Yesterday';
  return selectedDateYmd;
}

export function loggedMealContributions(values: {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}): { label: string; value: string }[] {
  const format = (value: string, suffix: string): string | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return `+${Math.round(parsed * 10) / 10}${suffix}`;
  };

  return [
    { label: 'Energy', value: format(values.calories, ' kcal') },
    { label: 'Protein', value: format(values.protein, 'g') },
    { label: 'Carbs', value: format(values.carbs, 'g') },
    { label: 'Fat', value: format(values.fat, 'g') },
  ].filter((item): item is { label: string; value: string } => item.value != null);
}
