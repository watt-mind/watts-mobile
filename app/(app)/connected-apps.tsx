/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack, type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { AppSymbol } from '@/src/components/AppSymbol';
import { Skeleton } from '@/src/components/Skeleton';
import { Spinner } from '@/src/components/Spinner';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';
import { CONNECTED_APPS_WEB_PATH } from '@/src/features/integrations/providers';
import { useIntegrationStatus } from '@/src/features/integrations/useIntegrationStatus';
import type { CuratedProviderRow, ProviderRowState } from '@/src/features/integrations/types';
import { getHealthAuthStatus } from '@/src/features/log/healthAuth';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

function formatLastSync(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusLabel(state: ProviderRowState): string {
  if (state === 'connected') return 'Connected';
  if (state === 'error') return 'Needs attention';
  return 'Not connected';
}

function actionLabel(state: ProviderRowState): string {
  if (state === 'connected') return 'Manage';
  if (state === 'error') return 'Fix';
  return 'Connect';
}

function StatusDot({ state }: { state: ProviderRowState }) {
  const color =
    state === 'connected' ? 'bg-success' : state === 'error' ? 'bg-modify' : 'bg-text-muted';
  return <View className={`mr-1.5 h-1.5 w-1.5 rounded-full ${color}`} />;
}

function ProviderRow({
  row,
  isLast,
  onAction,
}: {
  row: CuratedProviderRow;
  isLast: boolean;
  onAction: () => void;
}) {
  const lastSync = formatLastSync(row.lastSyncAt);
  const detailParts: string[] = [statusLabel(row.state)];
  if (row.state === 'connected' && lastSync) {
    detailParts.push(`Last sync ${lastSync}`);
  }
  if (row.state === 'error') {
    detailParts.push(row.errorMessage || 'Reconnect on the web');
  }

  return (
    <View
      className={`flex-row items-center px-4 py-3.5 ${isLast ? '' : 'border-b border-border/80'}`}
    >
      <View className="min-w-0 flex-1 pr-3">
        <Text className="text-base font-medium text-text-primary">{row.label}</Text>
        <View className="mt-0.5 flex-row items-center">
          <StatusDot state={row.state} />
          <Text className="flex-1 text-sm text-text-muted" numberOfLines={2}>
            {detailParts.join(' · ')}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel(row.state)} ${row.label}`}
        className="rounded-lg border border-border-strong px-3 py-2 active:opacity-70"
        onPress={onAction}
      >
        <Text className="text-sm font-semibold text-text-primary">{actionLabel(row.state)} ↗</Text>
      </Pressable>
    </View>
  );
}

export default function ConnectedAppsLiteScreen() {
  const theme = useThemeColors();
  const { instanceUrl } = useAuth();
  const { rows, isLoading, isError, isFetching, refetch, error } = useIntegrationStatus();
  const [healthDetail, setHealthDetail] = useState('Checking…');

  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        const result = await getHealthAuthStatus();
        if (!active) return;
        if (result.status === 'connected' || result.status === 'unnecessary') {
          setHealthDetail('Connected');
        } else if (result.status === 'partially_connected') {
          setHealthDetail('Partially connected');
        } else if (result.status === 'should_request' || result.status === 'not_connected') {
          setHealthDetail('Not connected');
        } else {
          setHealthDetail('Not available');
        }
      } catch {
        if (active) setHealthDetail('Not available');
      }
    };
    void update();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void update();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const openAppsWeb = () => {
    void openInstanceWeb(instanceUrl, CONNECTED_APPS_WEB_PATH);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Connected apps' }} />
      <SafeAreaView edges={{ bottom: true }} style={{ flex: 1, backgroundColor: theme.surface }}>
        <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pb-12 pt-4">
          <Text className="text-sm text-text-muted">
            Phone health and Coach Watts Connected Apps are different pipes. Connect wearables here
            so Coach Watts can sync them on the server; use Health Sync for data already on this
            phone.
          </Text>

          <Text className="mb-2 mt-8 text-xs font-semibold uppercase tracking-widest text-text-muted">
            On this phone
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Health Sync"
            className="overflow-hidden rounded-xl border border-border bg-card active:opacity-80"
            onPress={() => router.push(APP_HREFS.settingsHealth as Href)}
          >
            <View className="flex-row items-center px-4 py-3.5">
              <View className="mr-3 h-5 w-5 items-center justify-center">
                <AppSymbol sf="heart" size={18} tintColor={theme.textMuted} fallback="" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-base font-medium text-text-primary">Health Sync</Text>
                <Text className="mt-0.5 text-sm text-text-muted" numberOfLines={1}>
                  {healthDetail}
                </Text>
              </View>
              <AppSymbol sf="chevron.right" size={14} tintColor={theme.textMuted} fallback="›" />
            </View>
          </Pressable>

          <View className="mt-8 flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Coach Watts Connected Apps
            </Text>
            {isFetching && !isLoading ? <Spinner size="small" tone="muted" /> : null}
          </View>

          {isLoading && !rows ? (
            <View className="mt-2 overflow-hidden rounded-xl border border-border bg-card px-4 py-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className={`${i < 3 ? 'mb-3' : ''} h-14 rounded-xl`} />
              ))}
            </View>
          ) : isError && !rows ? (
            <View className="mt-2 rounded-xl border border-border bg-card px-4 py-5">
              <Text className="text-base font-medium text-text-primary">
                Couldn’t load connection status
              </Text>
              <Text className="mt-2 text-sm text-text-muted">
                {error instanceof Error
                  ? error.message
                  : 'This instance may not support companion status yet. Manage apps on the web.'}
              </Text>
              <View className="mt-4 gap-3">
                <Button label="Open Connected Apps on web" onPress={openAppsWeb} />
                <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
              </View>
            </View>
          ) : (
            <View className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
              {(rows ?? []).map((row, index, list) => (
                <ProviderRow
                  key={row.key}
                  row={row}
                  isLast={index === list.length - 1}
                  onAction={openAppsWeb}
                />
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage all Connected Apps"
            className="mt-6 items-center py-3 active:opacity-70"
            onPress={openAppsWeb}
          >
            <Text className="text-sm font-semibold text-brand">Manage all Connected Apps</Text>
            <Text className="mt-1 text-center text-xs text-text-muted">
              Opens Coach Watts in the browser
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
