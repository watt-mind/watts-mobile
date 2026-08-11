/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Spinner } from '@/src/components/Spinner';
import { friendlyError } from '@/src/api/errors';
import { AppSymbol } from '@/src/components/AppSymbol';
import { localDateYmd } from '@/src/features/nutrition/mapNutrition';
import { hydrationPresetVolumes } from '@/src/features/nutrition/mapNutritionSettings';
import { DEFAULT_QUICK_ADD_VOLUMES } from '@/src/features/nutrition/nutritionSettingsTypes';
import { useQuickAddHydration } from '@/src/features/nutrition/useNutrition';
import { useNutritionSettingsQuery } from '@/src/features/nutrition/useNutritionSettings';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { NutritionAccents } from '@/src/theme/nutritionAccents';

function formatVolumeLabel(ml: number): string {
  if (ml >= 1000 && ml % 1000 === 0) return `${ml / 1000} L`;
  return `${ml} ml`;
}

interface HydrationQuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
  currentWaterMl?: number;
  targetWaterMl?: number | null;
}

export function HydrationQuickAddSheet({
  visible,
  onClose,
  currentWaterMl = 0,
  targetWaterMl,
}: HydrationQuickAddSheetProps) {
  const hydrationMutation = useQuickAddHydration();
  const { data: settings } = useNutritionSettingsQuery({ enabled: visible });

  const presets = useMemo(() => {
    const volumes = hydrationPresetVolumes(settings?.quickAddVolumes, DEFAULT_QUICK_ADD_VOLUMES);
    return volumes.map((ml) => ({
      ml,
      label: formatVolumeLabel(ml),
      sub: `Add ${formatVolumeLabel(ml)}`,
    }));
  }, [settings?.quickAddVolumes]);

  const [lastAddedMl, setLastAddedMl] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (volumeMl: number) => {
    hapticLight();
    setError(null);
    try {
      await hydrationMutation.mutateAsync({ date: localDateYmd(), volumeMl });
      hapticSuccess();
      setLastAddedMl(volumeMl);
      setTimeout(() => {
        setLastAddedMl(null);
        onClose();
      }, 1200);
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Hydration failed'));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-surface px-6 pb-10 pt-4">
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border-strong" />

          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <AppSymbol
                sf="drop.fill"
                size={20}
                tintColor={NutritionAccents.hydration}
                fallback="ml"
              />
              <Text className="text-lg font-semibold text-text-primary">Add water</Text>
            </View>
            <Pressable hitSlop={8} onPress={onClose} className="p-1 active:opacity-70">
              <Text className="text-base font-semibold text-text-muted">Close</Text>
            </Pressable>
          </View>

          {targetWaterMl != null ? (
            <Text className="mb-4 text-xs text-text-muted">
              Current: {(currentWaterMl / 1000).toFixed(1)} L / {(targetWaterMl / 1000).toFixed(1)}{' '}
              L goal
            </Text>
          ) : (
            <Text className="mb-4 text-xs text-text-muted">
              {"Select volume to add to today's hydration total"}
            </Text>
          )}

          <View className="gap-2.5">
            {presets.map((p, index) => (
              <Pressable
                key={`${p.ml}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Add ${p.label}`}
                className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 active:opacity-80"
                onPress={() => void handleAdd(p.ml)}
                disabled={hydrationMutation.isPending}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-medium text-text-primary">+{p.label}</Text>
                  <Text className="text-xs text-text-muted">{p.sub}</Text>
                </View>
                <Text className="text-sm font-semibold text-hydration">Add</Text>
              </Pressable>
            ))}
          </View>

          {hydrationMutation.isPending ? <Spinner className="mt-4" /> : null}
          {error ? <Text className="mt-3 text-xs text-danger">{error}</Text> : null}
          {lastAddedMl ? (
            <View className="mt-4 rounded-xl border border-success/40 bg-tint-success p-3">
              <Text className="text-center text-xs font-bold text-success">
                {`✓ Added ${lastAddedMl} ml to today's total`}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
