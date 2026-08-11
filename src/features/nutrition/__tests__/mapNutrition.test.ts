import { describe, expect, it } from 'vitest';

import {
  apiMealTypeToMealSlot,
  canExplainMetric,
  emptyNutritionDay,
  emptyQuickLogForm,
  formatMacroGrams,
  formatWindowTime,
  fuelStateLabel,
  goalProgressPct,
  localDateYmd,
  mapNutritionLoggedItems,
  mealSlotToApiMealType,
  nutritionWebPath,
  pickNextFuelingWindow,
  pickTodayNutrition,
  quickLogHasContent,
  removeItemFromDay,
  roundMacro,
  QUICK_LOG_INVALID_NUMBER,
  QUICK_LOG_NEGATIVE,
  quickLogInvalidFields,
  quickLogNegativeFields,
  quickLogValidationError,
  toMealHistoryEntry,
  toNutritionUploadPayload,
} from '../mapNutrition';
import { EDIT_ITEM_INVALID_NUMBER, EDIT_ITEM_NEGATIVE } from '../editNutritionItemForm';

describe('pickTodayNutrition', () => {
  it('maps today’s macros and water from list payload', () => {
    const today = '2026-07-19';
    const result = pickTodayNutrition(
      {
        success: true,
        nutrition: [
          {
            id: 'n1',
            date: today,
            calories: 1840,
            protein: 120.5,
            carbs: 200,
            fat: 55,
            waterMl: 1500,
          },
          { id: 'n0', date: '2026-07-18', calories: 900 },
        ],
      },
      today,
    );

    expect(result.id).toBe('n1');
    expect(result.calories).toBe(1840);
    expect(result.protein).toBe(120.5);
    expect(result.waterMl).toBe(1500);
    expect(result.isEmpty).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.notes).toBeNull();
  });

  it('flattens meal buckets into items and keeps notes', () => {
    const today = '2026-07-19';
    const result = pickTodayNutrition(
      {
        nutrition: [
          {
            id: 'n1',
            date: today,
            calories: 500,
            protein: 40,
            carbs: 50,
            fat: 10,
            waterMl: 0,
            notes: 'Felt good',
            breakfast: [{ id: 'i1', name: 'Oats', calories: 300, protein: 20, carbs: 40, fat: 5 }],
            lunch: [],
            dinner: [{ name: 'Legacy soup', calories: 200, protein: 20, carbs: 10, fat: 5 }],
            snacks: [{ id: 'i3', name: 'Apple', calories: 80, protein: 0, carbs: 20, fat: 0 }],
          },
        ],
      },
      today,
    );

    expect(result.notes).toBe('Felt good');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      id: 'i1',
      name: 'Oats',
      mealType: 'breakfast',
      calories: 300,
    });
    expect(result.items[1]).toMatchObject({
      id: null,
      name: 'Legacy soup',
      mealType: 'dinner',
    });
    expect(result.items[2]).toMatchObject({ id: 'i3', mealType: 'snacks' });
  });

  it('returns empty day when no row for today', () => {
    const today = '2026-07-19';
    const result = pickTodayNutrition(
      { nutrition: [{ id: 'n0', date: '2026-07-18', calories: 900 }] },
      today,
    );
    expect(result.isEmpty).toBe(true);
    expect(result.date).toBe(today);
    expect(result.calories).toBe(0);
    expect(result.hasGoals).toBe(false);
    expect(result.caloriesGoal).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.notes).toBeNull();
  });

  it('maps canonical goals and fluid target from the fueling plan', () => {
    const today = '2026-07-20';
    const result = pickTodayNutrition(
      {
        nutrition: [
          {
            id: 'n2',
            date: today,
            calories: 350,
            protein: 0,
            carbs: 0,
            fat: 0,
            waterMl: 500,
            caloriesGoal: 1840.4,
            proteinGoal: 153,
            carbsGoal: 287,
            fatGoal: 96,
            fuelingPlan: { dailyTotals: { fluid: 2000.6, carbs: 287 } },
          },
        ],
      },
      today,
    );

    expect(result.caloriesGoal).toBe(1840);
    expect(result.proteinGoal).toBe(153);
    expect(result.carbsGoal).toBe(287);
    expect(result.fatGoal).toBe(96);
    expect(result.fluidGoalMl).toBe(2001);
    expect(result.hasGoals).toBe(true);
  });

  it('treats missing or zero goals as null', () => {
    const today = '2026-07-20';
    const result = pickTodayNutrition(
      {
        nutrition: [{ id: 'n3', date: today, calories: 100, caloriesGoal: 0, fuelingPlan: null }],
      },
      today,
    );
    expect(result.caloriesGoal).toBeNull();
    expect(result.fluidGoalMl).toBeNull();
    expect(result.hasGoals).toBe(false);
  });

  it('maps fuelState from the fueling plan', () => {
    const today = '2026-07-20';
    const result = pickTodayNutrition(
      {
        nutrition: [
          {
            id: 'n4',
            date: today,
            calories: 100,
            fuelingPlan: { dailyTotals: { fuelState: 3 } },
          },
        ],
      },
      today,
    );
    expect(result.fuelState).toBe(3);
    expect(fuelStateLabel(3)).toBe('Performance day');
    expect(fuelStateLabel(2)).toBe('Steady day');
    expect(fuelStateLabel(1)).toBe('Eco day');
  });

  it('treats an out-of-range fuelState as null', () => {
    const today = '2026-07-20';
    const result = pickTodayNutrition(
      {
        nutrition: [
          { id: 'n5', date: today, calories: 100, fuelingPlan: { dailyTotals: { fuelState: 7 } } },
        ],
      },
      today,
    );
    expect(result.fuelState).toBeNull();
  });

  it('retains fueling-plan analysis fields for explain sheets', () => {
    const today = '2026-07-22';
    const result = pickTodayNutrition(
      {
        nutrition: [
          {
            id: 'n6',
            date: today,
            calories: 0,
            caloriesGoal: 3392,
            fuelingPlan: {
              dailyTotals: {
                fluid: 3000,
                fuelState: 2,
                baseCalories: 2300,
                baseCaloriesMode: 'MANUAL_NON_EXERCISE',
                activityCalories: 696,
                adjustmentCalories: -599,
                workoutCalories: [
                  { title: 'Full-Body Strength Session', calories: 412, sourceType: 'estimated' },
                ],
              },
              windows: [
                { type: 'PRE_WORKOUT', targetCarbs: 40, targetProtein: 10, targetFat: 0 },
                { type: 'DAILY_BASE', targetCarbs: 200, targetProtein: 80, targetFat: 50 },
              ],
            },
          },
        ],
      },
      today,
    );

    expect(result.fuelingPlan).not.toBeNull();
    expect(result.fuelingPlan?.dailyTotals.baseCalories).toBe(2300);
    expect(result.fuelingPlan?.dailyTotals.baseCaloriesMode).toBe('MANUAL_NON_EXERCISE');
    expect(result.fuelingPlan?.dailyTotals.workoutCalories).toEqual([
      { title: 'Full-Body Strength Session', calories: 412, sourceType: 'estimated' },
    ]);
    expect(result.fuelingPlan?.windows).toHaveLength(2);
    expect(canExplainMetric(result, 'Calories')).toBe(true);
    expect(canExplainMetric(result, 'Carbs')).toBe(true);
  });

  it('leaves fuelingPlan null and blocks explain when there is no plan or goal', () => {
    const today = '2026-07-22';
    const result = pickTodayNutrition(
      { nutrition: [{ id: 'n7', date: today, calories: 100, fuelingPlan: null }] },
      today,
    );
    expect(result.fuelingPlan).toBeNull();
    expect(canExplainMetric(result, 'Calories')).toBe(false);
    expect(canExplainMetric(result, 'Fat')).toBe(false);
  });
});

describe('pickNextFuelingWindow', () => {
  const now = new Date('2026-07-20T12:00:00.000Z');

  it('picks the earliest window that has not ended yet', () => {
    const result = pickNextFuelingWindow(
      {
        windows: [
          {
            type: 'PRE_WORKOUT',
            startTime: '2026-07-20T09:00:00.000Z',
            endTime: '2026-07-20T09:30:00.000Z',
            targetCarbs: 20,
            targetProtein: 5,
          },
          {
            type: 'DAILY_BASE',
            slotName: 'Dinner',
            startTime: '2026-07-20T18:00:00.000Z',
            endTime: '2026-07-20T19:00:00.000Z',
            targetCarbs: 72.4,
            targetProtein: 38,
          },
          {
            type: 'POST_WORKOUT',
            startTime: '2026-07-20T20:00:00.000Z',
            endTime: '2026-07-20T21:00:00.000Z',
            targetCarbs: 40,
            targetProtein: 25,
          },
        ],
      },
      now,
    );

    expect(result?.label).toBe('Dinner');
    expect(result?.targetCarbs).toBe(72);
    expect(result?.targetProtein).toBe(38);
    expect(formatWindowTime(result!.startTime)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('falls back to a type label when slotName is absent', () => {
    const result = pickNextFuelingWindow(
      {
        windows: [
          {
            type: 'POST_WORKOUT',
            startTime: '2026-07-20T20:00:00.000Z',
            endTime: '2026-07-20T21:00:00.000Z',
            targetCarbs: 40,
            targetProtein: 25,
          },
        ],
      },
      now,
    );
    expect(result?.label).toBe('Post-workout');
  });

  it('returns null when there are no future windows', () => {
    const result = pickNextFuelingWindow(
      {
        windows: [
          {
            type: 'DAILY_BASE',
            startTime: '2026-07-20T06:00:00.000Z',
            endTime: '2026-07-20T07:00:00.000Z',
            targetCarbs: 10,
            targetProtein: 5,
          },
        ],
      },
      now,
    );
    expect(result).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(pickNextFuelingWindow(null)).toBeNull();
    expect(pickNextFuelingWindow({})).toBeNull();
    expect(pickNextFuelingWindow({ windows: 'nope' })).toBeNull();
  });
});

describe('toNutritionUploadPayload', () => {
  it('builds POST item with meal and macros', () => {
    const loggedAt = new Date('2026-07-19T08:30:00.000Z');
    const payload = toNutritionUploadPayload(
      {
        meal: 'BREAKFAST',
        name: '  Oats  ',
        calories: '320',
        protein: '18',
        carbs: '45.5',
        fat: '8',
      },
      '2026-07-19',
      loggedAt,
    );

    expect(payload.date).toBe('2026-07-19');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: 'Oats',
      meal: 'BREAKFAST',
      calories: 320,
      protein: 18,
      carbs: 45.5,
      fat: 8,
      logged_at: '2026-07-19T08:30:00.000Z',
    });
  });

  it('requires content via quickLogHasContent', () => {
    expect(quickLogHasContent(emptyQuickLogForm())).toBe(false);
    expect(quickLogHasContent({ ...emptyQuickLogForm(), calories: '100' })).toBe(true);
  });
});

describe('helpers', () => {
  it('computes clamped goal progress', () => {
    expect(goalProgressPct(0, 200)).toBe(0);
    expect(goalProgressPct(50, 200)).toBe(25);
    expect(goalProgressPct(300, 200)).toBe(100);
    expect(goalProgressPct(50, null)).toBeNull();
    expect(goalProgressPct(50, 0)).toBeNull();
  });

  it('formats macros and web path', () => {
    expect(formatMacroGrams(12)).toBe('12');
    expect(formatMacroGrams(12.5)).toBe('12.5');
    expect(formatMacroGrams(28.000000000000004)).toBe('28');
    expect(formatMacroGrams(28.600000000000002)).toBe('28.6');
    expect(formatMacroGrams(28.6666)).toBe('28.7');
    expect(roundMacro(28.600000000000002)).toBe(28.6);
    expect(nutritionWebPath()).toBe('/nutrition');
    expect(localDateYmd(new Date('2026-07-19T15:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('maps meal slots to API meal types', () => {
    expect(mealSlotToApiMealType('BREAKFAST')).toBe('breakfast');
    expect(mealSlotToApiMealType('SNACK')).toBe('snacks');
    expect(mealSlotToApiMealType('OTHER')).toBe('snacks');
    expect(apiMealTypeToMealSlot('dinner')).toBe('DINNER');
  });
});

describe('mapNutritionLoggedItems', () => {
  it('preserves slot order breakfast → lunch → dinner → snacks', () => {
    const items = mapNutritionLoggedItems({
      snacks: [{ id: 's1', name: 'Snack', calories: 100 }],
      breakfast: [{ id: 'b1', name: 'Eggs', calories: 200 }],
      dinner: [{ id: 'd1', name: 'Fish', calories: 400 }],
      lunch: [{ id: 'l1', name: 'Rice', calories: 300 }],
    });
    expect(items.map((i) => i.id)).toEqual(['b1', 'l1', 'd1', 's1']);
  });
});

describe('removeItemFromDay', () => {
  it('removes the target item and leaves others (optimistic delete)', () => {
    const day = {
      ...emptyNutritionDay('2026-07-19'),
      isEmpty: false,
      calories: 500,
      waterMl: 0,
      items: [
        {
          id: 'keep',
          name: 'Keep',
          calories: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
          mealType: 'breakfast' as const,
          loggedAt: null,
        },
        {
          id: 'gone',
          name: 'Gone',
          calories: 300,
          protein: 20,
          carbs: 30,
          fat: 10,
          mealType: 'lunch' as const,
          loggedAt: null,
        },
      ],
    };
    const next = removeItemFromDay(day, 'gone');
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).toBe('keep');
    expect(next.isEmpty).toBe(false);
  });

  it('marks empty when last item is removed and no water', () => {
    const day = {
      ...emptyNutritionDay('2026-07-19'),
      isEmpty: false,
      items: [
        {
          id: 'only',
          name: 'Only',
          calories: 100,
          protein: 0,
          carbs: 0,
          fat: 0,
          mealType: 'snacks' as const,
          loggedAt: null,
        },
      ],
    };
    const next = removeItemFromDay(day, 'only');
    expect(next.items).toEqual([]);
    expect(next.isEmpty).toBe(true);
  });

  it('rollback restores prior snapshot when delete fails', () => {
    const previous = {
      ...emptyNutritionDay('2026-07-19'),
      isEmpty: false,
      items: [
        {
          id: 'a',
          name: 'A',
          calories: 100,
          protein: 0,
          carbs: 0,
          fat: 0,
          mealType: 'lunch' as const,
          loggedAt: null,
        },
      ],
    };
    const optimistic = removeItemFromDay(previous, 'a');
    expect(optimistic.items).toEqual([]);
    // onError path: restore previous reference
    expect(previous.items).toHaveLength(1);
    expect(previous.items[0]?.id).toBe('a');
  });
});

describe('quick-log comma-decimal input (CW-484)', () => {
  it('keeps macros typed with a comma decimal', () => {
    const payload = toNutritionUploadPayload(
      {
        meal: 'SNACK',
        name: 'Banana',
        calories: '105',
        protein: '1,3',
        carbs: '27,5',
        fat: '0,4',
      },
      '2026-01-05',
      new Date('2026-01-05T10:00:00.000Z'),
    );
    const item = payload.items[0]!;
    expect(item.calories).toBe(105);
    expect(item.protein).toBe(1.3);
    expect(item.carbs).toBe(27.5);
    expect(item.fat).toBe(0.4);
  });

  it('flags filled-but-unparseable quick-log fields', () => {
    expect(
      quickLogInvalidFields({
        meal: 'SNACK',
        name: 'x',
        calories: '105',
        protein: '1,3',
        carbs: '',
        fat: 'lots',
      }),
    ).toEqual(['fat']);
    expect(
      quickLogInvalidFields({
        meal: 'SNACK',
        name: 'x',
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
      }),
    ).toEqual([]);
  });

  it('does not report comma decimals as invalid or negative', () => {
    const form = {
      meal: 'SNACK' as const,
      name: 'Banana',
      calories: '105',
      protein: '1,3',
      carbs: '27,5',
      fat: '0,4',
    };
    expect(quickLogInvalidFields(form)).toEqual([]);
    expect(quickLogNegativeFields(form)).toEqual([]);
    expect(quickLogValidationError(form)).toBeNull();
  });
});

describe('quick-log negative guard (CW-349)', () => {
  it('never emits a negative macro in the upload payload', () => {
    const payload = toNutritionUploadPayload(
      {
        meal: 'SNACK',
        name: 'Bad entry',
        calories: '-500',
        protein: '-10',
        carbs: '-2,5',
        fat: '-0.4',
      },
      '2026-01-05',
      new Date('2026-01-05T10:00:00.000Z'),
    );
    const item = payload.items[0]!;
    expect(item.calories).toBeGreaterThanOrEqual(0);
    expect(item.protein).toBeGreaterThanOrEqual(0);
    expect(item.carbs).toBeGreaterThanOrEqual(0);
    expect(item.fat).toBeGreaterThanOrEqual(0);
  });

  it('still emits valid positive macros unchanged', () => {
    const payload = toNutritionUploadPayload(
      { meal: 'SNACK', name: 'Oats', calories: '320', protein: '18', carbs: '45,5', fat: '8' },
      '2026-01-05',
      new Date('2026-01-05T10:00:00.000Z'),
    );
    expect(payload.items[0]).toMatchObject({ calories: 320, protein: 18, carbs: 45.5, fat: 8 });
  });

  it('flags each negative field independently', () => {
    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
      expect(quickLogNegativeFields({ ...emptyQuickLogForm(), [key]: '-1' })).toEqual([key]);
    }
    expect(
      quickLogNegativeFields({
        meal: 'SNACK',
        name: 'x',
        calories: '-500',
        protein: '10',
        carbs: '',
        fat: '-0,5',
      }),
    ).toEqual(['calories', 'fat']);
  });

  it('returns no negative fields for a valid or empty form', () => {
    expect(quickLogNegativeFields(emptyQuickLogForm())).toEqual([]);
    expect(
      quickLogNegativeFields({
        meal: 'SNACK',
        name: 'Oats',
        calories: '320',
        protein: '18',
        carbs: '45,5',
        fat: '0',
      }),
    ).toEqual([]);
  });

  it('distinguishes unparseable from negative, mirroring the edit sheet wording', () => {
    expect(QUICK_LOG_INVALID_NUMBER).toBe(EDIT_ITEM_INVALID_NUMBER);
    expect(QUICK_LOG_NEGATIVE).toBe(EDIT_ITEM_NEGATIVE);

    expect(quickLogValidationError({ ...emptyQuickLogForm(), fat: 'lots' })).toBe(
      QUICK_LOG_INVALID_NUMBER,
    );
    expect(quickLogValidationError({ ...emptyQuickLogForm(), calories: '-500' })).toBe(
      QUICK_LOG_NEGATIVE,
    );
    // Unparseable wins when both are present — it is the more fundamental problem.
    expect(quickLogValidationError({ ...emptyQuickLogForm(), calories: '-500', fat: 'lots' })).toBe(
      QUICK_LOG_INVALID_NUMBER,
    );
    expect(quickLogValidationError({ ...emptyQuickLogForm(), name: 'Oats' })).toBeNull();
  });

  it('leaves quickLogHasContent behaviour unchanged for blank optional macros', () => {
    const nameOnly = { ...emptyQuickLogForm(), name: 'Oats' };
    expect(quickLogHasContent(nameOnly)).toBe(true);
    expect(quickLogInvalidFields(nameOnly)).toEqual([]);
    expect(quickLogNegativeFields(nameOnly)).toEqual([]);
    expect(quickLogValidationError(nameOnly)).toBeNull();
    expect(quickLogHasContent(emptyQuickLogForm())).toBe(false);
  });
});

describe('toMealHistoryEntry', () => {
  it('keeps comma-decimal macros instead of dropping them (CW-519)', () => {
    // The decimal-pad keyboard on a comma-decimal device emits ',' as its only
    // separator, so raw Number('27,5') was NaN and the macro vanished from the
    // saved history entry while the upload itself was correct.
    const entry = toMealHistoryEntry({
      ...emptyQuickLogForm(),
      name: 'Oats',
      calories: '320',
      protein: '27,5',
      carbs: '45,25',
      fat: '8,5',
    });

    expect(entry).toEqual({
      name: 'Oats',
      calories: 320,
      protein: 27.5,
      carbs: 45.25,
      fat: 8.5,
    });
  });

  it('accepts grouped thousands in either convention', () => {
    expect(
      toMealHistoryEntry({ ...emptyQuickLogForm(), name: 'Feast', calories: '1 234,5' }).calories,
    ).toBe(1234.5);
    expect(
      toMealHistoryEntry({ ...emptyQuickLogForm(), name: 'Feast', calories: '1.234,56' }).calories,
    ).toBe(1234.56);
    expect(
      toMealHistoryEntry({ ...emptyQuickLogForm(), name: 'Feast', calories: '1,234.56' }).calories,
    ).toBe(1234.56);
  });

  it('still parses dot decimals and plain integers', () => {
    const entry = toMealHistoryEntry({
      ...emptyQuickLogForm(),
      name: 'Oats',
      calories: '320',
      protein: '18.5',
      carbs: '45',
      fat: '8.25',
    });

    expect(entry).toEqual({
      name: 'Oats',
      calories: 320,
      protein: 18.5,
      carbs: 45,
      fat: 8.25,
    });
  });

  it('preserves the > 0 rule: zero, negative, blank and unparseable are omitted', () => {
    const entry = toMealHistoryEntry({
      ...emptyQuickLogForm(),
      name: 'Oats',
      calories: '0',
      protein: '-5',
      carbs: '',
      fat: 'abc',
    });

    expect(entry).toEqual({ name: 'Oats' });
    expect(entry.calories).toBeUndefined();
    expect(entry.protein).toBeUndefined();
    expect(entry.carbs).toBeUndefined();
    expect(entry.fat).toBeUndefined();
  });

  it('passes the name through untouched for saveMealToHistory to trim', () => {
    expect(toMealHistoryEntry({ ...emptyQuickLogForm(), name: '  Oats  ' }).name).toBe('  Oats  ');
  });
});
