/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { Button } from '@/src/components/Button';
import { ListSkeleton } from '@/src/components/Skeleton';
import { useNutritionGroceryQuery } from '@/src/features/nutrition/useNutrition';
import { formatWeekRangeLabel } from '@/src/features/plans/formatPlanCopy';
import { weekRangeFromOffset } from '@/src/lib/date';
import { mapGroceryItems } from '@/src/features/plans/mapNutritionPlan';
import { APP_HREFS } from '@/src/linking/appHrefs';

export default function PlanGroceryScreen() {
  const params = useLocalSearchParams<{ start?: string; end?: string }>();
  const fallback = weekRangeFromOffset(0);
  const start = typeof params.start === 'string' ? params.start : fallback.start;
  const end = typeof params.end === 'string' ? params.end : fallback.end;
  const grocery = useNutritionGroceryQuery(start, end);
  const items = useMemo(() => mapGroceryItems(grocery.data), [grocery.data]);
  const rangeLabel = formatWeekRangeLabel(start, end) ?? `${start} – ${end}`;

  const [manualRefreshing, setManualRefreshing] = useState(false);
  const handleRefresh = async () => {
    setManualRefreshing(true);
    try {
      await grocery.refetch();
    } finally {
      setManualRefreshing(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Grocery list', headerShown: true }} />
      {grocery.isLoading && !grocery.data ? (
        <ListSkeleton rows={6} />
      ) : (
        <ScrollView
          className="flex-1 bg-surface"
          contentContainerClassName="px-6 pb-12 pt-4"
          refreshControl={
            <RefreshControl refreshing={manualRefreshing} onRefresh={() => void handleRefresh()} />
          }
        >
          <Text className="mb-4 text-sm text-text-muted">
            {rangeLabel} · ingredients from planned (non-skipped) meals
          </Text>

          {grocery.isError ? (
            <View className="rounded-xl border border-danger/40 bg-tint-error p-4">
              <Text className="text-base text-danger">
                {friendlyError(grocery.error, 'Failed to load grocery list')}
              </Text>
              <Pressable className="mt-3" hitSlop={8} onPress={() => void grocery.refetch()}>
                <Text className="text-sm font-semibold text-brand">Retry</Text>
              </Pressable>
            </View>
          ) : items.length === 0 ? (
            <View className="gap-3" testID="plan-grocery-empty">
              <Text className="text-sm text-text-muted">
                No grocery items yet. Generate a meal plan on the Nutrition tab, then come back.
              </Text>
              <Button
                label="Back to Plan"
                onPress={() => router.replace(APP_HREFS.plan as never)}
              />
            </View>
          ) : (
            items.map((item, i) => (
              <View key={`${item.ingredient}-${i}`} className="border-b border-border/80 py-3">
                <Text className="text-base font-medium text-text-primary">{item.ingredient}</Text>
                <Text className="mt-1 text-sm text-text-muted">
                  {[item.quantity != null ? String(item.quantity) : null, item.unit, item.category]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {item.sourceLabels.length ? (
                  <Text className="mt-1 text-xs text-text-muted">
                    {item.sourceLabels.slice(0, 3).join(' · ')}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </>
  );
}
