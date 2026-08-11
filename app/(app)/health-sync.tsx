/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack, type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-screens/experimental';

import { Button } from '@/src/components/Button';
import { AppSymbol } from '@/src/components/AppSymbol';
import { DetailSkeleton } from '@/src/components/Skeleton';
import {
  disconnectHealth,
  getHealthAuthStatus,
  openHealthSettings,
  requestHealthAuth,
  type HealthStatusResult,
} from '@/src/features/log/healthAuth';
import { resolveEnableSyncOutcome } from '@/src/features/health/enableSyncOutcome';
import { runHealthSyncPass } from '@/src/features/health/orchestrator';
import { useHealthSyncPreferences } from '@/src/features/health/useHealthSyncPreferences';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { Colors } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';

function StatusBadge({ status }: { status: string }) {
  let bg = 'bg-border-strong/80 border border-border-strong/50';
  let text = 'text-text-muted';
  let label = 'Not connected';
  let dotBg = 'bg-text-muted';

  if (status === 'connected' || status === 'unnecessary') {
    bg = 'bg-success/10 border border-success/25';
    text = 'text-success';
    label = 'Connected';
    dotBg = 'bg-success';
  } else if (status === 'partially_connected') {
    bg = 'bg-modify/10 border border-modify/40';
    text = 'text-modify';
    label = 'Partially connected';
    dotBg = 'bg-modify';
  } else if (status === 'not_available') {
    bg = 'bg-danger/10 border border-danger/25';
    text = 'text-danger';
    label = 'Not available';
    dotBg = 'bg-danger';
  }

  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${bg}`}>
      <View className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dotBg}`} />
      <Text className={`text-xs font-semibold ${text}`}>{label}</Text>
    </View>
  );
}

function PermissionRow({ title, granted }: { title: string; granted: boolean }) {
  return (
    <View className="flex-row items-center justify-between border-t border-border/60 py-3.5">
      <Text className="text-sm font-medium text-text-primary">{title}</Text>
      <View className="flex-row items-center">
        <View
          className={`h-4.5 w-4.5 mr-2 items-center justify-center rounded-full ${
            granted ? 'bg-success/15' : 'bg-border-strong'
          }`}
        >
          {granted ? (
            <Text className="text-xs font-bold text-success">✓</Text>
          ) : (
            <Text className="text-xs font-bold text-text-muted">×</Text>
          )}
        </View>
        <Text className={`text-sm font-medium ${granted ? 'text-success' : 'text-text-muted'}`}>
          {granted ? 'Granted' : 'Denied'}
        </Text>
      </View>
    </View>
  );
}

function formatLastSync(iso?: string): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'Never';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HealthSyncSettingsScreen() {
  const theme = useThemeColors();
  const { preferences, setEnabled, setWorkouts } = useHealthSyncPreferences();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  /** Banner copy when a completed pass read nothing — set by both the enable toggle and "Sync now" (CW-336). */
  const [noDataHint, setNoDataHint] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<HealthStatusResult>({ status: 'loading' });

  const loadStatus = async () => {
    try {
      const res = await getHealthAuthStatus();
      setAuthStatus(res);
    } catch (err) {
      console.warn('[HealthSettings] Failed to fetch health status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadStatus(), 0);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void loadStatus();
      }
    });

    return () => {
      clearTimeout(initialLoad);
      subscription.remove();
    };
  }, []);

  const handleConnect = async () => {
    hapticLight();
    setBusy(true);
    try {
      const success = await requestHealthAuth();
      if (success) {
        hapticSuccess();
      } else {
        hapticError();
      }
      await loadStatus();
    } catch {
      hapticError();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    hapticLight();
    setBusy(true);
    try {
      const success = await disconnectHealth();
      if (success) {
        await setEnabled(false);
        hapticSuccess();
      } else {
        hapticError();
      }
      await loadStatus();
    } catch {
      hapticError();
    } finally {
      setBusy(false);
    }
  };

  const handleManageSettings = async () => {
    hapticLight();
    await openHealthSettings();
  };

  const handleInstallHealthConnect = async () => {
    hapticLight();
    await Linking.openURL(
      'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata',
    );
  };

  const handleToggleSync = async (enabled: boolean) => {
    hapticLight();
    setBusy(true);
    setSyncError(null);
    setNoDataHint(null);
    try {
      // Enabling succeeds even when the first pass finds nothing — that is a
      // warning, not a failure, so the toggle stays on and only the hint appears.
      const { syncPass } = await setEnabled(enabled);
      setNoDataHint(resolveEnableSyncOutcome(syncPass, Platform.OS).hint);
      hapticSuccess();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Could not update health sync');
      hapticError();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWorkouts = async (enabled: boolean) => {
    hapticLight();
    setBusy(true);
    setSyncError(null);
    setNoDataHint(null);
    try {
      const { syncPass } = await setWorkouts(enabled);
      setNoDataHint(resolveEnableSyncOutcome(syncPass, Platform.OS).hint);
      hapticSuccess();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Could not update workout sync');
      hapticError();
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    hapticLight();
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await runHealthSyncPass({ force: true });
      setNoDataHint(resolveEnableSyncOutcome(result, Platform.OS).hint);
      const failed =
        result.wellnessFailed > 0 ||
        result.workoutsFailed > 0 ||
        result.wellnessPassError ||
        result.workoutPassError;
      if (failed) {
        setSyncError('Some health data could not be synced. Check Sync history to retry.');
        hapticError();
      } else {
        hapticSuccess();
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Health sync failed');
      hapticError();
    } finally {
      setSyncing(false);
    }
  };

  const isIOS = Platform.OS === 'ios';

  return (
    <>
      <Stack.Screen
        options={{
          title: isIOS ? 'Apple Health' : 'Health Connect',
          headerShown: true,
        }}
      />
      <SafeAreaView edges={{ bottom: true }} style={{ flex: 1, backgroundColor: theme.surface }}>
        {loading ? (
          <DetailSkeleton />
        ) : (
          <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pb-12 pt-4">
            <Text className="text-sm leading-5 text-text-muted">
              Connect {isIOS ? 'Apple Health' : 'Health Connect'} to prefill check-ins and
              optionally sync wellness metrics and workouts to your Coach Watts instance.
            </Text>

            <View className="mt-6 rounded-xl border border-border bg-card/60 p-5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-3 h-5 w-5 items-center justify-center">
                    <AppSymbol
                      sf="heart.text.square.fill"
                      size={18}
                      tintColor={theme.textMuted}
                      fallback=""
                    />
                  </View>
                  <View>
                    <Text className="text-base font-semibold text-text-primary">
                      {isIOS ? 'Apple Health' : 'Health Connect'}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {isIOS ? 'HealthKit Integration' : 'Android Health Hub'}
                    </Text>
                  </View>
                </View>
                <StatusBadge status={authStatus.status} />
              </View>

              {isIOS && (
                <View className="mt-6 gap-3 border-t border-border/80 pt-5">
                  {authStatus.status === 'should_request' ? (
                    <Button
                      label="Connect Apple Health"
                      onPress={() => void handleConnect()}
                      loading={busy}
                    />
                  ) : (
                    <>
                      <View className="rounded-lg border border-border/50 bg-surface/40 p-4">
                        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand">
                          Permissions Info
                        </Text>
                        <Text className="leading-4.5 text-xs text-text-muted">
                          iOS usually shows the consent sheet only once. If you denied something,
                          turn it back on in Health → Profile → Apps → Coach Watts. Request access
                          again can still help when Coach Watts adds new data types.
                        </Text>
                      </View>
                      <Button
                        label="Request access again"
                        variant="secondary"
                        onPress={() => void handleConnect()}
                        loading={busy}
                      />
                      <Button
                        label="Open Apple Health"
                        variant="secondary"
                        onPress={() => void handleManageSettings()}
                      />
                    </>
                  )}
                </View>
              )}

              {!isIOS && (
                <View className="mt-4">
                  {authStatus.status === 'not_available' ? (
                    <View className="mt-2 border-t border-border/80 pt-4">
                      <Text className="mb-4 text-sm leading-5 text-danger">
                        Health Connect is required but currently unavailable or not installed.
                      </Text>
                      <Button
                        label="Install Health Connect"
                        onPress={() => void handleInstallHealthConnect()}
                      />
                    </View>
                  ) : (
                    <View className="mt-2">
                      <PermissionRow title="Sleep" granted={!!authStatus.details?.sleepGranted} />
                      <PermissionRow title="Weight" granted={!!authStatus.details?.weightGranted} />
                      <PermissionRow
                        title="Workouts"
                        granted={!!authStatus.details?.workoutsGranted}
                      />
                      <PermissionRow
                        title="Heart rate"
                        granted={!!authStatus.details?.heartGranted}
                      />
                      <PermissionRow
                        title="Calories"
                        granted={!!authStatus.details?.caloriesGranted}
                      />
                      <PermissionRow title="Steps" granted={!!authStatus.details?.stepsGranted} />

                      {authStatus.details?.workoutsGranted ? (
                        <Text className="leading-4.5 mt-3 text-xs text-text-muted">
                          GPS routes for your workouts can only be turned on inside Health Connect —
                          open it below and allow “Exercise routes”. Everything else syncs without
                          it.
                        </Text>
                      ) : null}

                      {authStatus.status === 'partially_connected' ? (
                        <Text className="leading-4.5 mt-3 text-xs text-modify">
                          Some required permissions are missing. Grant them again below, or manage
                          access in Health Connect.
                        </Text>
                      ) : null}

                      <View className="mt-6 gap-3">
                        {authStatus.status !== 'connected' ? (
                          <Button
                            label={
                              authStatus.status === 'partially_connected'
                                ? 'Grant missing permissions'
                                : 'Connect Health Connect'
                            }
                            onPress={() => void handleConnect()}
                            loading={busy}
                          />
                        ) : null}

                        <Button
                          variant="secondary"
                          label="Manage in Health Connect"
                          onPress={() => void handleManageSettings()}
                        />

                        {authStatus.status !== 'not_connected' ? (
                          <Button
                            variant="danger"
                            label="Disconnect"
                            onPress={() => void handleDisconnect()}
                            loading={busy}
                          />
                        ) : null}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View className="mt-6 overflow-hidden rounded-xl border border-border bg-card/60">
              <View className="flex-row items-center justify-between px-4 py-4">
                <View className="mr-4 flex-1">
                  <Text className="text-base font-semibold text-text-primary">
                    Sync to Coach Watts
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-text-muted">
                    Automatically upload daily wellness metrics (sleep, RHR, HRV, weight, and more)
                    to your instance. Off by default.
                  </Text>
                </View>
                <Switch
                  trackColor={{ false: theme.border, true: Colors.brand }}
                  thumbColor={Platform.OS === 'ios' ? undefined : theme.textPrimary}
                  value={preferences.syncEnabled}
                  onValueChange={(v) => void handleToggleSync(v)}
                  disabled={busy}
                />
              </View>

              {preferences.syncEnabled && (
                <View className="flex-row items-center justify-between border-t border-border/80 px-4 py-4">
                  <View className="mr-4 flex-1">
                    <Text className="text-base font-semibold text-text-primary">Sync workouts</Text>
                    <Text className="mt-1 text-sm leading-5 text-text-muted">
                      Upload exercise sessions not already in Coach Watts. Turn off to keep wellness
                      sync only.
                    </Text>
                  </View>
                  <Switch
                    trackColor={{ false: theme.border, true: Colors.brand }}
                    thumbColor={Platform.OS === 'ios' ? undefined : theme.textPrimary}
                    value={preferences.syncWorkouts}
                    onValueChange={(v) => void handleToggleWorkouts(v)}
                    disabled={busy}
                  />
                </View>
              )}

              <View className="border-t border-border/80 px-4 py-3">
                <Text className="text-xs text-text-muted">
                  Last successful sync: {formatLastSync(preferences.lastSuccessAt)}
                </Text>
                {syncError && (
                  <Text className="leading-4.5 mt-2 text-xs text-danger">{syncError}</Text>
                )}
              </View>
            </View>

            <View className="mt-4 gap-3">
              {preferences.syncEnabled ? (
                <>
                  <Button
                    label="Sync now"
                    onPress={() => void handleSyncNow()}
                    loading={syncing}
                    variant="secondary"
                  />
                  {noDataHint && (
                    <Text className="leading-4.5 text-xs text-modify">{noDataHint}</Text>
                  )}
                </>
              ) : null}

              <Pressable
                onPress={() => {
                  hapticLight();
                  router.push(APP_HREFS.healthWorkouts as Href);
                }}
                className="flex-row items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-4"
              >
                <View>
                  <Text className="text-base font-semibold text-text-primary">Recent workouts</Text>
                  <Text className="mt-1 text-sm text-text-muted">
                    On this phone vs synced to Coach Watts
                  </Text>
                </View>
                <Text className="text-lg text-text-muted">›</Text>
              </Pressable>

              {preferences.syncEnabled ? (
                <Pressable
                  onPress={() => {
                    hapticLight();
                    router.push(APP_HREFS.healthHistory as Href);
                  }}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-4"
                >
                  <View>
                    <Text className="text-base font-semibold text-text-primary">Sync history</Text>
                    <Text className="mt-1 text-sm text-text-muted">
                      See what was sent, retry failures
                    </Text>
                  </View>
                  <Text className="text-lg text-text-muted">›</Text>
                </Pressable>
              ) : null}
            </View>

            <View className="mt-6 rounded-xl border border-border bg-surface/20 p-5">
              <Text className="text-sm font-semibold text-text-primary">Privacy</Text>
              <Text className="leading-4.5 mt-2 text-xs text-text-muted">
                When Sync to Coach Watts is off, health readings stay on your device until you save
                a check-in. When sync is on, Coach Watts uploads objective health metrics
                {preferences.syncWorkouts ? ' and workouts' : ''} to your Coach Watts instance in
                the background. We do not write data back to{' '}
                {isIOS ? 'Apple Health' : 'Health Connect'}, and we do not include health metric
                values in crash logs.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}
