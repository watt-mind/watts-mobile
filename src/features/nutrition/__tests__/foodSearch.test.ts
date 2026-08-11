import { apiFetch } from '@/src/api/client';
import { describe, expect, it, vi } from 'vitest';
import {
  lookupFoodBarcode,
  normalizeFoodItemResult,
  searchFoodDatabase,
  type FoodItemResult,
} from '../api';
import {
  defaultPortionGrams,
  foodItemKey,
  parseGrams,
  portionPresets,
  scalePortion,
} from '../portionMath';

vi.mock('@/src/api/client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

describe('Food Database API Client', () => {
  it('searchFoodDatabase handles array response', async () => {
    const mockItems: FoodItemResult[] = [
      {
        name: 'Oatmeal',
        brand: 'Quaker',
        nutrients_per_100g: {
          calories_kcal: 389,
          protein_g: 16.9,
          carbs_g: 66.3,
          fat_g: 6.9,
        },
      },
    ];

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockItems,
    } as Response);

    const result = await searchFoodDatabase('Oatmeal');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/nutrition/search?q=Oatmeal&limit=20');
    expect(result).toEqual(mockItems);
  });

  it('searchFoodDatabase handles wrapped { items: [...] } response', async () => {
    const mockItems: FoodItemResult[] = [
      {
        name: 'Banana',
        nutrients_per_100g: {
          calories_kcal: 89,
          protein_g: 1.1,
          carbs_g: 22.8,
          fat_g: 0.3,
        },
      },
    ];

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: mockItems }),
    } as Response);

    const result = await searchFoodDatabase('Banana');
    expect(result).toEqual(mockItems);
  });

  it('lookupFoodBarcode parses found barcode and returns null on 404', async () => {
    const mockItem: FoodItemResult = {
      name: 'Greek Yogurt',
      brand: 'Chobani',
      barcode: '07394820',
      nutrients_per_100g: {
        calories_kcal: 59,
        protein_g: 10,
        carbs_g: 3.6,
        fat_g: 0.4,
      },
    };

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ item: mockItem }),
    } as Response);

    const found = await lookupFoodBarcode('07394820');
    expect(found).toEqual(mockItem);

    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    } as Response);

    const notFound = await lookupFoodBarcode('99999999');
    expect(notFound).toBeNull();
  });

  it('lookupFoodBarcode returns null for a bare/empty 200 envelope instead of a fake item', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const bareEnvelope = await lookupFoodBarcode('11111111');
    expect(bareEnvelope).toBeNull();

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const emptyObject = await lookupFoodBarcode('22222222');
    expect(emptyObject).toBeNull();
  });

  describe('normalizeFoodItemResult', () => {
    it('normalizes Open Food Facts items with nutriments object', () => {
      const raw = {
        product_name: 'Nutella',
        brands: 'Ferrero',
        code: '3017620422003',
        nutriments: {
          'energy-kcal_100g': 539,
          carbohydrates_100g: 57.5,
          proteins_100g: 6.3,
          fat_100g: 30.9,
          sugars_100g: 56.3,
        },
      };
      const normalized = normalizeFoodItemResult(raw);
      expect(normalized.name).toBe('Nutella');
      expect(normalized.brand).toBe('Ferrero');
      expect(normalized.barcode).toBe('3017620422003');
      expect(normalized.nutrients_per_100g).toEqual({
        calories_kcal: 539,
        protein_g: 6.3,
        carbs_g: 57.5,
        fat_g: 30.9,
        sugar_g: 56.3,
      });
    });

    it('normalizes USDA and generic items with nutrients object and string values', () => {
      const raw = {
        name: 'Oats',
        nutrients: {
          calories: '389',
          protein: '16.9',
          carbs: '66.3',
          fat: '6.9',
          fiber: '10.6',
        },
      };
      const normalized = normalizeFoodItemResult(raw);
      expect(normalized.nutrients_per_100g).toEqual({
        calories_kcal: 389,
        protein_g: 16.9,
        carbs_g: 66.3,
        fat_g: 6.9,
        fiber_g: 10.6,
      });
    });

    it('converts energy (kJ) to kcal when energy-kcal is absent', () => {
      const raw = {
        product_name: 'Protein Bar',
        nutriments: {
          energy_100g: 2000,
          proteins_100g: 20,
          carbohydrates_100g: 40,
          fat_100g: 10,
        },
      };
      const normalized = normalizeFoodItemResult(raw);
      // Math.round(2000 / 4.184) = 478
      expect(normalized.nutrients_per_100g.calories_kcal).toBe(478);
    });

    it('prefers explicit kcal over kJ when both are present', () => {
      const raw = {
        product_name: 'Energy Bar',
        nutriments: {
          'energy-kcal_100g': 500,
          energy_100g: 2092,
          proteins_100g: 10,
          carbohydrates_100g: 60,
          fat_100g: 15,
        },
      };
      const normalized = normalizeFoodItemResult(raw);
      expect(normalized.nutrients_per_100g.calories_kcal).toBe(500);
    });

    it('derives calories from macros when calories is missing or 0', () => {
      const raw = {
        name: 'Custom Mix',
        macros: {
          protein: 20,
          carbs: 50,
          fat: 10,
        },
      };
      const normalized = normalizeFoodItemResult(raw);
      // 20*4 + 50*4 + 10*9 = 80 + 200 + 90 = 370
      expect(normalized.nutrients_per_100g.calories_kcal).toBe(370);
    });
  });
});

describe('portionMath', () => {
  const per100g = { calories_kcal: 400, protein_g: 20, carbs_g: 50, fat_g: 10 };

  it('scales nutrients by gram weight', () => {
    expect(scalePortion(per100g, 150)).toEqual({
      calories: 600,
      protein: 30,
      carbs: 75,
      fat: 15,
      fiber: 0,
    });
    expect(scalePortion(per100g, 50)).toEqual({
      calories: 200,
      protein: 10,
      carbs: 25,
      fat: 5,
      fiber: 0,
    });
  });

  it('rounds calories to whole kcal and macros to 0.1 g', () => {
    const odd = { calories_kcal: 389, protein_g: 16.9, carbs_g: 66.3, fat_g: 6.9 };
    expect(scalePortion(odd, 37)).toEqual({
      calories: 144,
      protein: 6.3,
      carbs: 24.5,
      fat: 2.6,
      fiber: 0,
    });
  });

  it('scales optional fiber only when present', () => {
    expect(scalePortion({ ...per100g, fiber_g: 5 }, 200).fiber).toBe(10);
    expect(scalePortion(per100g, 200).fiber).toBe(0);
  });

  it('returns a zeroed portion for missing nutrients or non-positive grams', () => {
    const zero = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    expect(scalePortion(per100g, 0)).toEqual(zero);
    expect(scalePortion(per100g, -10)).toEqual(zero);
    expect(scalePortion(per100g, NaN)).toEqual(zero);
    expect(scalePortion(undefined, 100)).toEqual(zero);
  });

  it('parseGrams rejects blank and non-positive input', () => {
    expect(parseGrams('250')).toBe(250);
    expect(parseGrams('12.5')).toBe(12.5);
    expect(parseGrams('')).toBe(0);
    expect(parseGrams('abc')).toBe(0);
    expect(parseGrams('-5')).toBe(0);
    expect(parseGrams('0')).toBe(0);
  });

  it('parseGrams accepts comma decimals (CW-484)', () => {
    expect(parseGrams('0,5')).toBe(0.5);
    expect(parseGrams('12,5')).toBe(12.5);
    expect(parseGrams('1 234,5')).toBe(1234.5);
    expect(parseGrams('12,5g')).toBe(0);
  });

  it('defaults the portion to the serving size, falling back to 100 g', () => {
    expect(defaultPortionGrams({ serving_size_g: 30 })).toBe(30);
    expect(defaultPortionGrams({ serving_size_g: 0 })).toBe(100);
    expect(defaultPortionGrams({})).toBe(100);
    expect(defaultPortionGrams(null)).toBe(100);
  });

  it('appends the serving size as a preset without duplicating a standard one', () => {
    expect(portionPresets({ serving_size_g: 30 })).toEqual([50, 100, 150, 200, 30]);
    // A 100 g serving must not produce a second chip with the same React key.
    expect(portionPresets({ serving_size_g: 100 })).toEqual([50, 100, 150, 200]);
    expect(portionPresets(null)).toEqual([50, 100, 150, 200]);
  });

  it('keys items by barcode, falling back to brand + name', () => {
    const base: FoodItemResult = { name: 'Oats', nutrients_per_100g: per100g };
    expect(foodItemKey({ ...base, barcode: '123' })).toBe('123');
    expect(foodItemKey({ ...base, brand: 'Quaker' })).toBe('Quaker|Oats');
    expect(foodItemKey(base)).toBe('|Oats');
    expect(foodItemKey(null)).toBeNull();
    // Different foods must not share a key, or portion state leaks between them.
    expect(foodItemKey({ ...base, brand: 'A' })).not.toBe(foodItemKey({ ...base, brand: 'B' }));
  });
});
