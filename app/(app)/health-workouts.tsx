/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useQuery } from '@tanstack/react-query';
import { Stack, type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { Button } from '@/src/components/Button';
import { ListSkeleton } from '@/src/components/Skeleton';
import { Spinner } from '@/src/components/Spinner';
import { formatLedgerStatusLabel } from '@/src/features/health/ledgerHelpers';
import {
  syncUnsyncedWorkouts,
  syncWorkoutByPlatformSessionId,
} from '@/src/features/health/orchestrator';
import {
  isUnsyncedRecentStatus,
  type RecentWorkoutRow,
} from '@/src/features/health/recentWorkoutRows';
import { resolveRecentWorkoutAction } from '@/src/features/health/recentWorkoutActions';
import { listRecentPlatformWorkoutsWithStatus } from '@/src/features/health/recentWorkouts';
import type { SyncLedgerStatus } from '@/src/features/health/types';
import { useHealthSyncPreferences } from '@/src/features/health/useHealthSyncPreferences';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

const RECENT_WORKOUTS_QUERY_KEY = ['health', 'recent-workouts'] as const;

function statusColor(status: SyncLedgerStatus): string {
  switch (status) {
    case 'synced':
      return 'text-success';
    case 'failed':
      return 'text-danger';
    case 'needs_sync':
      return 'text-modify';
    case 'pending':
      return 'text-modify';
    case 'syncing':
      return 'text-brand';
    default:
      return 'text-text-muted';
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function HealthRecentWorkoutsScreen() {
  const theme = useThemeColors();
  const { preferences } = useHealthSyncPreferences();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const workoutsQuery = useQuery({
    queryKey: RECENT_WORKOUTS_QUERY_KEY,
    queryFn: () => listRecentPlatformWorkoutsWithStatus(),
  });

  const rows = useMemo(() => workoutsQuery.data ?? [], [workoutsQuery.data]);
  const loading = workoutsQuery.isLoading && !workoutsQuery.data;
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const handleRefresh = async () => {
    setManualRefreshing(true);
    try {
      await workoutsQuery.refetch();
    } finally {
      setManualRefreshing(false);
    }
  };
  const loadError =
    workoutsQuery.isError && !workoutsQuery.data
      ? workoutsQuery.error instanceof Error
        ? workoutsQuery.error.message
        : 'Could not load workouts'
      : null;

  const uploadAction = resolveRecentWorkoutAction(preferences);
  const uploadsEnabled = uploadAction.kind === 'upload';
  const platformLabel = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

  /**
   * Send the athlete to the switch that unblocks uploading.
   *
   * The upload controls call this instead of rendering `disabled`, which
   * produced a completely silent tap — no haptic, no spinner, no message
   * (CW-573).
   */
  const handleEnableSync = (reason: string) => {
    hapticLight();
    setActionError(reason);
    router.push(APP_HREFS.settingsHealth as Href);
  };

  const unsyncedCount = useMemo(
    () => rows.filter((row) => isUnsyncedRecentStatus(row.status)).length,
    [rows],
  );

  const handleSyncOne = async (row: RecentWorkoutRow, force: boolean) => {
    if (!uploadsEnabled) {
      setActionError(
        !preferences.syncEnabled
          ? 'Enable Sync to Coach Watts first'
          : 'Enable Sync workouts first',
      );
      hapticError();
      return;
    }
    hapticLight();
    setBusyId(row.platformSessionId);
    setActionError(null);
    try {
      await syncWorkoutByPlatformSessionId(row.platformSessionId, { force });
      await workoutsQuery.refetch();
      hapticSuccess();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Sync failed');
      hapticError();
      await workoutsQuery.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncAll = async () => {
    if (!uploadsEnabled) {
      setActionError(
        !preferences.syncEnabled
          ? 'Enable Sync to Coach Watts first'
          : 'Enable Sync workouts first',
      );
      hapticError();
      return;
    }
    hapticLight();
    setSyncingAll(true);
    setActionError(null);
    try {
      const result = await syncUnsyncedWorkouts();
      await workoutsQuery.refetch();
      if (result.failed > 0) {
        setActionError('Some workouts could not be synced');
        hapticError();
      } else {
        hapticSuccess();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Sync all failed');
      hapticError();
      await workoutsQuery.refetch();
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Recent workouts', headerShown: true }} />
      <SafeAreaView edges={{ bottom: true }} style={{ flex: 1, backgroundColor: theme.surface }}>
        <View className="px-6 pb-2 pt-4">
          <Text className="text-sm leading-5 text-text-muted">
            Workouts on this phone from {platformLabel}, and whether they are in Coach Watts.
          </Text>
          {!uploadsEnabled ? (
            <Pressable
              onPress={() => {
                hapticLight();
                router.push(APP_HREFS.settingsHealth as Href);
              }}
              className="mt-3 rounded-xl border border-modify/40 bg-modify/10 px-3 py-3"
            >
              <Text className="leading-4.5 text-xs text-modify">
                {!preferences.syncEnabled
                  ? 'Sync to Coach Watts is off. You can browse workouts here; turn sync on to upload.'
                  : 'Sync workouts is off. Turn it on in Health Sync to upload from this list.'}
              </Text>
            </Pressable>
          ) : null}
          {unsyncedCount > 0 ? (
            <View className="mt-3">
              {uploadAction.kind === 'upload' ? (
                <Button
                  label={`Sync all (${unsyncedCount})`}
                  onPress={() => void handleSyncAll()}
                  loading={syncingAll}
                  variant="secondary"
                  disabled={busyId != null}
                />
              ) : (
                <Button
                  label={uploadAction.label}
                  onPress={() => handleEnableSync(uploadAction.reason)}
                  variant="secondary"
                />
              )}
            </View>
          ) : null}
          {actionError ? (
            <Text className="leading-4.5 mt-2 text-xs text-danger">{actionError}</Text>
          ) : null}
          {loadError ? (
            <Text className="leading-4.5 mt-2 text-xs text-danger">{loadError}</Text>
          ) : null}
        </View>

        {loading ? (
          <ListSkeleton />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-6 pb-12 pt-2"
            refreshControl={
              <RefreshControl
                refreshing={manualRefreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={theme.brandOnSurface}
              />
            }
          >
            {rows.length === 0 ? (
              <View className="mt-10 items-center px-4">
                <Text className="text-center text-base font-semibold text-text-primary">
                  No workouts on this phone
                </Text>
                <Text className="mt-2 text-center text-sm leading-5 text-text-muted">
                  Recent {platformLabel} workouts from the last two weeks appear here once Coach
                  Watts has read access and sessions exist on the device.
                </Text>
              </View>
            ) : (
              rows.map((row) => {
                const unsynced = isUnsyncedRecentStatus(row.status);
                const isBusy =
                  busyId === row.platformSessionId ||
                  row.status === 'syncing' ||
                  (syncingAll && unsynced);
                return (
                  <View
                    key={row.platformSessionId}
                    className="mb-3 rounded-xl border border-border bg-card/60 px-4 py-3.5"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="mr-3 flex-1">
                        <Text className="text-sm font-semibold text-text-primary">{row.title}</Text>
                        <Text className="mt-1 text-xs text-text-muted">
                          On phone · {formatWhen(row.startedAt)}
                        </Text>
                        {row.lastError ? (
                          <Text className="mt-1.5 text-xs text-danger" numberOfLines={2}>
                            {row.lastError}
                          </Text>
                        ) : null}
                      </View>
                      <Text className={`text-xs font-semibold ${statusColor(row.status)}`}>
                        {formatLedgerStatusLabel(row.status)}
                      </Text>
                    </View>
                    <View className="mt-3">
                      {isBusy ? (
                        <Spinner />
                      ) : uploadAction.kind !== 'upload' &&
                        (unsynced || row.status === 'synced') ? (
                        // Never render an inert Sync button: tapping it was a
                        // silent no-op, so the prerequisite becomes the action
                        // (CW-573).
                        <Button
                          label={uploadAction.label}
                          variant="secondary"
                          onPress={() => handleEnableSync(uploadAction.reason)}
                        />
                      ) : unsynced ? (
                        <Button
                          label="Sync"
                          variant="secondary"
                          onPress={() => void handleSyncOne(row, true)}
                          disabled={syncingAll}
                        />
                      ) : row.status === 'synced' ? (
                        <Button
                          label="Resync"
                          variant="secondary"
                          onPress={() => void handleSyncOne(row, true)}
                          disabled={syncingAll}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}
