/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack, useLocalSearchParams, router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { HeroStatTiles, type HeroStat } from '@/src/components/HeroStatTiles';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { DetailSkeleton } from '@/src/components/Skeleton';
import { SportIcon } from '@/src/components/SportIcon';
import { StructureProfile } from '@/src/features/activity/charts/StructureProfile';
import {
  buildStructureChartBlocks,
  formatActivityDate,
  formatDuration,
  mapPlannedStructure,
  plannedWorkoutWebPath,
  refsFromAthlete,
  zoneIndexFromBandName,
  stepIntensity,
} from '@/src/features/activity/mapActivity';
import {
  useCompletePlannedWorkout,
  usePlannedDetailQuery,
  usePlannedFuelingQuery,
  useSkipPlannedWorkout,
} from '@/src/features/activity/useActivity';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';
import { openPlannedSessionDiscuss } from '@/src/features/coach/openSessionDiscuss';
import { PlanSessionEditorSheet } from '@/src/features/plans/PlanSessionEditorSheet';
import { useDeletePlannedWorkoutMutation } from '@/src/features/plans/usePlans';
import { isNutritionTrackingEnabled } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { useOfflineCached } from '@/src/hooks/useOfflineCached';
import { humanizeWorkoutType } from '@/src/lib/humanizeWorkoutType';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { localDateKey } from '@/src/lib/date';
import { zoneColor, Colors } from '@/src/theme/colors';

function plannedHeroStats(data: {
  durationSec: number | null;
  tss: number | null;
  workIntensityLabel: string | null;
}): HeroStat[] {
  const stats: HeroStat[] = [];
  const duration = formatDuration(data.durationSec);
  if (duration) stats.push({ label: 'Duration', value: duration });
  if (data.tss != null && Number.isFinite(data.tss)) {
    stats.push({ label: 'TSS', value: String(Math.round(data.tss)) });
  }
  if (data.workIntensityLabel) {
    const ifValue = data.workIntensityLabel.replace(/^IF\s+/i, '').trim();
    stats.push({ label: 'IF', value: ifValue || data.workIntensityLabel });
  }
  return stats.slice(0, 3);
}

export default function PlannedWorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { instanceUrl } = useAuth();
  const { data, isLoading, isError, error, dataUpdatedAt, refetch } = usePlannedDetailQuery(id);
  const profileQuery = useAthleteProfileQuery();
  const nutritionOn = isNutritionTrackingEnabled(profileQuery.data);
  const fuelingQuery = usePlannedFuelingQuery(id, {
    strategy: data?.fuelingStrategy,
    enabled: nutritionOn && Boolean(data),
  });
  const completeMutation = useCompletePlannedWorkout(id);
  const skipMutation = useSkipPlannedWorkout(id);
  const deleteMutation = useDeletePlannedWorkoutMutation();
  const { showCachedOffline, lastUpdatedLabel } = useOfflineCached({
    data,
    isError,
    dataUpdatedAt,
  });
  const [zonesExpanded, setZonesExpanded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const openWeb = async () => {
    const path = id ? plannedWorkoutWebPath(id) : '/';
    await openInstanceWeb(instanceUrl, path);
  };

  const statusLine = data
    ? [data.completionLabel, data.syncLabel].filter(Boolean).join(' · ')
    : null;

  const busy = completeMutation.isPending || skipMutation.isPending || deleteMutation.isPending;

  const athleteRefs = useMemo(
    () =>
      refsFromAthlete({
        ftp: profileQuery.data?.ftp,
        lthr: profileQuery.data?.lthr,
        maxHr: profileQuery.data?.maxHr,
      }),
    [profileQuery.data?.ftp, profileQuery.data?.lthr, profileQuery.data?.maxHr],
  );

  const chartBlocks = useMemo(() => {
    if (!data || data.structureIsStrength) return [];
    if (data.structureSource) {
      return buildStructureChartBlocks(data.structureSource, athleteRefs);
    }
    return data.structureChartBlocks;
  }, [data, athleteRefs]);

  const structureSteps = useMemo(() => {
    if (!data) return [];
    if (data.structureIsStrength || !data.structureSource) return data.structureSteps;
    return mapPlannedStructure(data.structureSource, athleteRefs).steps;
  }, [data, athleteRefs]);

  const onComplete = () => {
    Alert.alert('Mark complete?', 'This marks the planned session as completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () => {
          setActionError(null);
          completeMutation.mutate(undefined, {
            onError: (err) => setActionError(friendlyError(err, 'Failed to complete workout')),
          });
        },
      },
    ]);
  };

  const onSkip = () => {
    Alert.alert('Skip this workout?', 'This marks the planned session as skipped.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: () => {
          setActionError(null);
          skipMutation.mutate(undefined, {
            onError: (err) => setActionError(friendlyError(err, 'Failed to skip workout')),
          });
        },
      },
    ]);
  };

  const onDelete = () => {
    if (!data) return;
    Alert.alert(
      'Delete session?',
      `"${data.title}" will be removed from your plan. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setActionError(null);
            deleteMutation.mutate(data.id, {
              onSuccess: () => {
                if (router.canGoBack()) router.back();
                else router.replace(APP_HREFS.plan as Href);
              },
              onError: (err) => setActionError(friendlyError(err, 'Failed to delete workout')),
            });
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Workout', headerShown: true }} />
      {isLoading && !data ? (
        <DetailSkeleton />
      ) : isError && !data ? (
        <View className="flex-1 bg-surface px-6 pt-6">
          <View className="rounded-xl border border-danger/40 bg-tint-error p-4">
            <Text className="text-base text-danger">
              {friendlyError(error, 'Failed to load workout')}
            </Text>
            <Pressable className="mt-3" hitSlop={8} onPress={() => void refetch()}>
              <Text className="text-sm font-semibold text-brand">Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : data ? (
        <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pb-10 pt-4">
          <OfflineBanner visible={showCachedOffline} lastUpdatedLabel={lastUpdatedLabel} />
          <View className="flex-row items-center gap-3">
            <SportIcon type={data.type} size={18} />
            <Text className="min-w-0 flex-1 text-2xl font-semibold text-text-primary">
              {data.title}
            </Text>
          </View>
          <Text className="mt-2 text-sm text-text-muted">
            {[formatActivityDate(data.date), humanizeWorkoutType(data.type)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <HeroStatTiles stats={plannedHeroStats(data)} />
          {statusLine ? <Text className="mt-3 text-sm text-text-muted">{statusLine}</Text> : null}

          {data.complianceActionable ? (
            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <Button
                  label="Complete"
                  onPress={onComplete}
                  loading={completeMutation.isPending}
                  disabled={busy}
                />
              </View>
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label="Skip"
                  onPress={onSkip}
                  loading={skipMutation.isPending}
                  disabled={busy}
                />
              </View>
            </View>
          ) : null}
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <Button
                variant="secondary"
                label="Edit"
                testID="planned-detail-edit"
                onPress={() => setEditorOpen(true)}
                disabled={busy}
              />
            </View>
            <View className="flex-1">
              <Button
                variant="danger"
                label="Delete"
                testID="planned-detail-delete"
                onPress={onDelete}
                loading={deleteMutation.isPending}
                disabled={busy}
              />
            </View>
          </View>
          {actionError ? (
            <Text className="mt-3 text-sm text-danger" testID="planned-detail-action-error">
              {actionError}
            </Text>
          ) : null}

          {data.linkedCompleted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View completed activity"
              className="mt-4 rounded-xl border border-border bg-card/60 px-4 py-3 active:opacity-80"
              onPress={() =>
                router.push(APP_HREFS.activityDetail(data.linkedCompleted!.id) as Href)
              }
            >
              <Text className="text-xs uppercase tracking-wide text-text-muted">
                Completed activity
              </Text>
              <Text className="mt-1 text-base font-medium text-text-body">
                {data.linkedCompleted.title}
              </Text>
              <Text className="mt-1 text-sm text-brand">View activity →</Text>
            </Pressable>
          ) : null}

          {data.coachInstructions ? (
            <View className="mt-6">
              <Text className="text-xs uppercase tracking-wide text-text-muted">Coach cues</Text>
              <Text className="mt-2 text-base leading-6 text-text-body">
                {data.coachInstructions}
              </Text>
            </View>
          ) : null}

          {fuelingQuery.data ? (
            <View className="mt-6">
              <Text className="text-xs uppercase tracking-wide text-text-muted">Fueling prep</Text>
              <View className="mt-2 flex-row flex-wrap">
                {[
                  fuelingQuery.data.fuelStateLabel,
                  fuelingQuery.data.carbsLabel,
                  fuelingQuery.data.caloriesLabel,
                  fuelingQuery.data.strategyLabel,
                ]
                  .filter(Boolean)
                  .map((label) => (
                    <Text key={label!} className="mb-1 mr-3 text-sm text-text-body">
                      {label}
                    </Text>
                  ))}
              </View>
              {fuelingQuery.data.note ? (
                <Text className="mt-1 text-sm leading-5 text-text-muted">
                  {fuelingQuery.data.note}
                </Text>
              ) : null}
            </View>
          ) : null}

          {structureSteps.length > 0 ? (
            <View className="mt-6">
              <Text className="text-xs uppercase tracking-wide text-text-muted">
                {data.structureIsStrength ? 'Exercises' : 'Structure'}
              </Text>
              {!data.structureIsStrength ? <StructureProfile blocks={chartBlocks} /> : null}
              {structureSteps.map((step, index) => {
                const meta = [
                  formatDuration(step.durationSec),
                  step.intensityLabel,
                  step.cadenceLabel,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const intensity = stepIntensity(step);
                const zoneIndex = step.zoneIndex ?? intensity.zoneIndex;
                const color = zoneIndex != null ? zoneColor(zoneIndex) : Colors.zoneNeutral;
                const isSectionCue = Boolean(step.isSection);
                return (
                  <View
                    key={`${step.name}-${index}`}
                    className="mt-3 flex-row items-stretch gap-3 border-b border-border pb-3"
                  >
                    {!isSectionCue ? (
                      <View className="w-1 rounded-full" style={{ backgroundColor: color }} />
                    ) : null}
                    <View className="flex-1">
                      <Text
                        className={
                          isSectionCue
                            ? 'text-xs uppercase tracking-wide text-text-muted'
                            : 'text-base text-text-body'
                        }
                      >
                        {step.name}
                      </Text>
                      {meta ? <Text className="mt-1 text-sm text-text-muted">{meta}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {data.zoneSummary ? (
            <View className="mt-6">
              {structureSteps.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: zonesExpanded }}
                  accessibilityLabel={`Zones · ${data.zoneSummary.channelLabel}`}
                  onPress={() => setZonesExpanded((v) => !v)}
                  className="flex-row items-center justify-between py-1 active:opacity-80"
                  hitSlop={8}
                >
                  <Text className="text-xs uppercase tracking-wide text-text-muted">
                    Zones · {data.zoneSummary.channelLabel}
                  </Text>
                  <Text className="text-xs font-semibold text-brand">
                    {zonesExpanded ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              ) : (
                <Text className="text-xs uppercase tracking-wide text-text-muted">
                  Zones · {data.zoneSummary.channelLabel}
                </Text>
              )}
              {(structureSteps.length === 0 || zonesExpanded) &&
                data.zoneSummary.bands.map((band, index) => {
                  const color = zoneColor(zoneIndexFromBandName(band.name, index));
                  return (
                    <View
                      key={`${band.name}-${band.rangeLabel}`}
                      className="mt-3 flex-row items-center justify-between border-b border-border pb-3"
                    >
                      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
                        <View
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: color }}
                          accessibilityLabel={`${band.name} color`}
                        />
                        <Text className="text-base text-text-body">{band.name}</Text>
                      </View>
                      <Text className="text-sm text-text-muted">{band.rangeLabel}</Text>
                    </View>
                  );
                })}
            </View>
          ) : null}

          {data.description ? (
            <Text className="mt-6 text-base leading-6 text-text-body">{data.description}</Text>
          ) : structureSteps.length === 0 && !data.coachInstructions ? (
            <Text className="mt-6 text-sm text-text-muted">
              No structure summary here. Open Coach Watts for full details.
            </Text>
          ) : null}

          <Button
            className="mt-8"
            label="Discuss with Coach"
            onPress={() => openPlannedSessionDiscuss(data)}
          />
          <Button
            variant="secondary"
            className="mt-3"
            label="Open in Coach Watts"
            onPress={() => void openWeb()}
          />
        </ScrollView>
      ) : null}

      {data ? (
        <PlanSessionEditorSheet
          visible={editorOpen}
          onClose={() => setEditorOpen(false)}
          context={{
            mode: 'edit',
            plannedId: data.id,
            dateKey: localDateKey(data.date) ?? '',
            title: data.title,
            type: data.type,
            durationSec: data.durationSec,
            tss: data.tss,
            description: data.description,
          }}
        />
      ) : null}
    </>
  );
}
