/**
 * Pure parsing/validation for the "Edit item" nutrition sheet (CW-484).
 *
 * Lives outside the component so it can be tested: the sheet is a thin caller.
 *
 * The previous inline logic was `Number(protein) || 0`, which on a comma-decimal
 * keyboard turned "27,5" into NaN and then wrote ZERO grams to the server —
 * the day's protein total dropped instead of rising. A failed parse is now an
 * explicit validation error, never a silent zero.
 */

import { parseDecimal } from '@/src/lib/parseDecimal';

export type EditNutritionItemFormValues = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

export type ParsedEditNutritionItem = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type EditNutritionItemParseResult =
  { ok: true; value: ParsedEditNutritionItem } | { ok: false; error: string };

export const EDIT_ITEM_NAME_REQUIRED = 'Enter a name for this item.';
export const EDIT_ITEM_INVALID_NUMBER =
  'Enter valid numbers for calories and macros (e.g. 27.5 or 27,5).';
export const EDIT_ITEM_NEGATIVE = 'Calories and macros cannot be negative.';

/**
 * A cleared field means zero for this sheet (every field is prefilled from the
 * logged item, so blanking one is a deliberate "no macros here").
 * Unparseable text is rejected — it is NOT the same as zero.
 */
function parseMacroField(value: string): number | null {
  if (!value.trim()) return 0;
  return parseDecimal(value);
}

export function parseEditNutritionItemForm(
  values: EditNutritionItemFormValues,
): EditNutritionItemParseResult {
  const name = values.name.trim();
  if (!name) return { ok: false, error: EDIT_ITEM_NAME_REQUIRED };

  const calories = parseMacroField(values.calories);
  const protein = parseMacroField(values.protein);
  const carbs = parseMacroField(values.carbs);
  const fat = parseMacroField(values.fat);

  if (calories == null || protein == null || carbs == null || fat == null) {
    return { ok: false, error: EDIT_ITEM_INVALID_NUMBER };
  }
  if (calories < 0 || protein < 0 || carbs < 0 || fat < 0) {
    return { ok: false, error: EDIT_ITEM_NEGATIVE };
  }

  return {
    ok: true,
    value: { name, calories: Math.round(calories), protein, carbs, fat },
  };
}
