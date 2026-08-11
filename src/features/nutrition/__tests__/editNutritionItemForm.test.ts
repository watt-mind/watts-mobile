import { describe, expect, it } from 'vitest';

import {
  EDIT_ITEM_INVALID_NUMBER,
  EDIT_ITEM_NAME_REQUIRED,
  EDIT_ITEM_NEGATIVE,
  parseEditNutritionItemForm,
} from '../editNutritionItemForm';

const base = { name: 'Greek yogurt', calories: '120', protein: '20', carbs: '8', fat: '3' };

describe('parseEditNutritionItemForm (CW-484)', () => {
  it('parses dot decimals', () => {
    const result = parseEditNutritionItemForm({ ...base, protein: '27.5' });
    expect(result).toEqual({
      ok: true,
      value: { name: 'Greek yogurt', calories: 120, protein: 27.5, carbs: 8, fat: 3 },
    });
  });

  it('parses comma decimals instead of writing ZERO grams', () => {
    const result = parseEditNutritionItemForm({ ...base, protein: '27,5' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.protein).toBe(27.5);
  });

  it('accepts comma decimals in every macro field', () => {
    const result = parseEditNutritionItemForm({
      name: 'Meal',
      calories: '512,4',
      protein: '27,5',
      carbs: '60,25',
      fat: '12,1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        name: 'Meal',
        calories: 512, // calories are whole kcal
        protein: 27.5,
        carbs: 60.25,
        fat: 12.1,
      });
    }
  });

  it('rejects unparseable input rather than zeroing it', () => {
    const result = parseEditNutritionItemForm({ ...base, protein: 'twenty' });
    expect(result).toEqual({ ok: false, error: EDIT_ITEM_INVALID_NUMBER });
  });

  it('treats a cleared field as an explicit zero', () => {
    const result = parseEditNutritionItemForm({ ...base, fat: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fat).toBe(0);
  });

  it('requires a name', () => {
    expect(parseEditNutritionItemForm({ ...base, name: '   ' })).toEqual({
      ok: false,
      error: EDIT_ITEM_NAME_REQUIRED,
    });
  });

  it('trims the name', () => {
    const result = parseEditNutritionItemForm({ ...base, name: '  Oats  ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('Oats');
  });

  it('rejects negative values', () => {
    expect(parseEditNutritionItemForm({ ...base, carbs: '-1' })).toEqual({
      ok: false,
      error: EDIT_ITEM_NEGATIVE,
    });
    expect(parseEditNutritionItemForm({ ...base, calories: '-0,5' })).toEqual({
      ok: false,
      error: EDIT_ITEM_NEGATIVE,
    });
  });

  it('rounds calories to whole kcal', () => {
    const result = parseEditNutritionItemForm({ ...base, calories: '120,6' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.calories).toBe(121);
  });
});
