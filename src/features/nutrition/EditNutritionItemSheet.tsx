/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Spinner } from '@/src/components/Spinner';
import { friendlyError } from '@/src/api/errors';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

import { parseEditNutritionItemForm } from './editNutritionItemForm';
import { apiMealTypeToMealSlot, mealSlotToApiMealType } from './mapNutrition';
import type { ApiMealType, MealSlot, NutritionLoggedItem } from './types';
import { MEAL_OPTIONS } from './types';
import { usePatchNutritionItem } from './useNutrition';

type Props = {
  visible: boolean;
  nutritionId: string;
  date: string;
  item: NutritionLoggedItem | null;
  onClose: () => void;
};

const EDIT_MEAL_OPTIONS = MEAL_OPTIONS.filter((o) => o.value !== 'OTHER');

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
  testID?: string;
}) {
  const theme = useThemeColors();
  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs text-text-muted">{label}</Text>
      <TextInput
        testID={testID}
        className="rounded-xl border border-border-strong bg-card px-3 py-2.5 text-base text-text-primary"
        placeholderTextColor={theme.textMuted}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function EditForm({
  item,
  nutritionId,
  date,
  onClose,
}: {
  item: NutritionLoggedItem;
  nutritionId: string;
  date: string;
  onClose: () => void;
}) {
  const patchItem = usePatchNutritionItem();

  const [name, setName] = useState(item.name);
  const [calories, setCalories] = useState(String(item.calories));
  const [protein, setProtein] = useState(String(item.protein));
  const [carbs, setCarbs] = useState(String(item.carbs));
  const [fat, setFat] = useState(String(item.fat));
  const [meal, setMeal] = useState<MealSlot>(apiMealTypeToMealSlot(item.mealType));
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (!item.id) return;
    const parsed = parseEditNutritionItemForm({ name, calories, protein, carbs, fat });
    if (!parsed.ok) {
      hapticError();
      setError(parsed.error);
      return;
    }
    const { name: trimmed, calories: cal, protein: pro, carbs: carb, fat: f } = parsed.value;
    const mealType: ApiMealType = mealSlotToApiMealType(meal);

    setError(null);
    try {
      await patchItem.mutateAsync({
        nutritionId,
        date,
        payload: {
          action: 'update',
          mealType,
          item: {
            id: item.id,
            name: trimmed,
            calories: cal,
            protein: pro,
            carbs: carb,
            fat: f,
            ...(item.amount != null ? { amount: item.amount } : {}),
            ...(item.unit ? { unit: item.unit } : {}),
            ...(item.loggedAt ? { logged_at: item.loggedAt } : {}),
          },
        },
      });
      hapticSuccess();
      onClose();
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Could not update this item'));
    }
  };

  return (
    <>
      <Text className="mb-1 text-lg font-semibold text-text-primary">Edit item</Text>
      <Text className="mb-2 text-sm text-text-muted">
        Changes update day totals from the server.
      </Text>

      <Text className="mb-1 mt-2 text-xs text-text-muted">Meal slot</Text>
      <View className="flex-row flex-wrap gap-2" testID="nutrition-edit-meal-slot">
        {EDIT_MEAL_OPTIONS.map((option) => {
          const selected = meal === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              className={`rounded-xl border px-3 py-2 ${
                selected ? 'border-brand bg-brand/10' : 'border-border bg-card'
              }`}
              onPress={() => {
                hapticLight();
                setMeal(option.value);
              }}
            >
              <Text
                className={`text-xs font-semibold ${selected ? 'text-brand' : 'text-text-muted'}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Meal or food name"
        testID="nutrition-edit-name"
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Field
            label="Calories"
            value={calories}
            onChangeText={setCalories}
            keyboardType="decimal-pad"
            testID="nutrition-edit-calories"
          />
        </View>
        <View className="flex-1">
          <Field
            label="Protein (g)"
            value={protein}
            onChangeText={setProtein}
            keyboardType="decimal-pad"
            testID="nutrition-edit-protein"
          />
        </View>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Field
            label="Carbs (g)"
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="decimal-pad"
            testID="nutrition-edit-carbs"
          />
        </View>
        <View className="flex-1">
          <Field
            label="Fat (g)"
            value={fat}
            onChangeText={setFat}
            keyboardType="decimal-pad"
            testID="nutrition-edit-fat"
          />
        </View>
      </View>

      {error ? (
        <Text className="mt-3 text-xs text-danger" testID="nutrition-edit-error">
          {error}
        </Text>
      ) : null}

      {patchItem.isPending ? <Spinner className="mt-3" /> : null}

      <Button
        className="mt-4"
        label="Save"
        testID="nutrition-edit-save"
        loading={patchItem.isPending}
        onPress={() => void onSave()}
      />
      <View className="mt-2">
        <Button label="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </>
  );
}

export function EditNutritionItemSheet({ visible, nutritionId, date, item, onClose }: Props) {
  return (
    <BottomSheet
      visible={visible && item != null}
      onClose={onClose}
      keyboard
      testID="nutrition-edit-item-sheet"
    >
      {item ? (
        <EditForm
          key={item.id ?? item.name}
          item={item}
          nutritionId={nutritionId}
          date={date}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}
