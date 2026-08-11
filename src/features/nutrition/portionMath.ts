import { parseDecimal } from '@/src/lib/parseDecimal';

import type { FoodItemResult } from './api';

export interface ScaledPortion {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

type Per100g = FoodItemResult['nutrients_per_100g'];

const EMPTY_PORTION: ScaledPortion = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/** Macros are shown to 0.1 g; calories to whole kcal. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Scale per-100g nutrients to an arbitrary gram weight. */
export function scalePortion(per100g: Per100g | undefined, grams: number): ScaledPortion {
  if (!per100g || !Number.isFinite(grams) || grams <= 0) return { ...EMPTY_PORTION };
  const factor = grams / 100;
  return {
    calories: Math.round((per100g.calories_kcal ?? 0) * factor),
    protein: round1((per100g.protein_g ?? 0) * factor),
    carbs: round1((per100g.carbs_g ?? 0) * factor),
    fat: round1((per100g.fat_g ?? 0) * factor),
    fiber: per100g.fiber_g ? round1(per100g.fiber_g * factor) : 0,
  };
}

/**
 * Parse the grams text field. Blank, unparseable or non-positive input reads as 0,
 * which the portion UI treats as "nothing selected" (the log button stays disabled)
 * — it is never sent to the server as a real weight.
 *
 * Comma decimals are accepted (CW-484): `parseFloat("0,5")` returned 0, so a
 * half-portion scaled to a 0 kcal item.
 */
export function parseGrams(input: string): number {
  const parsed = parseDecimal(input);
  return parsed == null || parsed <= 0 ? 0 : parsed;
}

/** An item's default portion: its own serving size when known, otherwise 100 g. */
export function defaultPortionGrams(item: Pick<FoodItemResult, 'serving_size_g'> | null): number {
  const serving = item?.serving_size_g;
  return serving && serving > 0 ? serving : 100;
}

/**
 * Preset chips for the portion picker. The item's serving size is appended last, and
 * dropped when it duplicates a standard preset — otherwise the list renders two chips
 * with the same React key.
 */
export function portionPresets(item: Pick<FoodItemResult, 'serving_size_g'> | null): number[] {
  const serving = item?.serving_size_g;
  const all = [50, 100, 150, 200, ...(serving && serving > 0 ? [serving] : [])];
  return Array.from(new Set(all));
}

/**
 * Stable identity for a search result, used to reset portion state when the user picks a
 * different food. Results have no id, so fall back to brand + name.
 */
export function foodItemKey(item: FoodItemResult | null): string | null {
  if (!item) return null;
  return item.barcode ?? `${item.brand ?? ''}|${item.name}`;
}

/** Display label for the item's serving, e.g. "30g serving". */
export function servingDescription(item: FoodItemResult): string {
  if (item.serving_description) return item.serving_description;
  return item.serving_size_g ? `${item.serving_size_g}g serving` : '100g serving';
}
