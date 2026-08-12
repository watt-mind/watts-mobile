/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { Button } from '@/src/components/Button';
import { Spinner } from '@/src/components/Spinner';
import {
  filterLedgerByAttention,
  formatLedgerStatusLabel,
} from '@/src/features/health/ledgerHelpers';
import { retryLedgerItem, runHealthSyncPass } from '@/src/features/health/orchestrator';
import {
  clearSyncDiagnostic,
  describeSyncDiagnosticScope,
} from '@/src/features/health/syncDiagnostics';
import type { SyncLedgerItem, SyncLedgerStatus } from '@/src/features/health/types';
import { useSyncDiagnostic } from '@/src/features/health/useSyncDiagnostic';
import { useSyncLedger } from '@/src/features/health/useSyncLedger';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

type Filter = 'all' | 'failed' | 'needs_sync';

function statusColor(status: SyncLedgerStatus): string {
  switch (status) {
    case 'synced':
      return 'text-success';
    case 'failed':
      return 'text-danger';
    case 'needs_sync':
      return 'text-modify';
    case 'syncing':
      return 'text-brand';
    default:
      return 'text-text-muted';
  }
}

function formatWhen(item: SyncLedgerItem): string {
  const iso = item.lastAttemptAt ?? item.lastSuccessAt ?? item.startedAt ?? item.localDate;
  if (!iso) return '';
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

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 rounded-full border px-3 py-1.5 ${
        active ? 'border-brand/40 bg-brand/15' : 'border-border bg-transparent'
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-brand' : 'text-text-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function HealthSyncHistoryScreen() {
  const theme = useThemeColors();
  const items = useSyncLedger();
  const diagnostic = useSyncDiagnostic();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const visible = useMemo(() => filterLedgerByAttention(items, filter), [items, filter]);

  const handleRetry = async (id: string) => {
    hapticLight();
    setBusyId(id);
    setActionError(null);
    try {
      await retryLedgerItem(id);
      hapticSuccess();
    } catch (err) {
      // Surface why the retry could not run — the reason is also written to the
      // item's lastError, but a precondition failure needs to be visible now.
      setActionError(err instanceof Error ? err.message : 'Retry failed');
      hapticError();
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncNow = async () => {
    hapticLight();
    setSyncingAll(true);
    try {
      await runHealthSyncPass({ force: true });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setSyncingAll(false);
    }
  };

  const handleResyncAll = async () => {
    hapticLight();
    setResyncing(true);
    try {
      // Clears watermarks and backfills the full lookback window.
      await runHealthSyncPass({ fullResync: true });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setResyncing(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Sync history', headerShown: true }} />
      <SafeAreaView edges={{ bottom: true }} style={{ flex: 1, backgroundColor: theme.surface }}>
        <View className="px-6 pb-2 pt-4">
          <View className="mb-3 flex-row items-center">
            <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterChip
              label="Failed"
              active={filter === 'failed'}
              onPress={() => setFilter('failed')}
            />
            <FilterChip
              label="Needs sync"
              active={filter === 'needs_sync'}
              onPress={() => setFilter('needs_sync')}
            />
          </View>
          <Button
            label="Sync now"
            onPress={() => void handleSyncNow()}
            loading={syncingAll}
            variant="secondary"
          />
          <View className="mt-2">
            <Button
              label="Resync all"
              onPress={() => void handleResyncAll()}
              loading={resyncing}
              variant="secondary"
            />
          </View>
          <Text className="mt-2 text-xs leading-4 text-text-muted">
            Resync all re-reads the full lookback window and re-uploads changed items.
          </Text>
          {actionError ? (
            <Text className="mt-2 text-xs leading-4 text-danger">{actionError}</Text>
          ) : null}
          {diagnostic ? (
            <View className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-3">
              <Text className="text-xs font-semibold text-danger">
                {describeSyncDiagnosticScope(diagnostic.scope)} problem
              </Text>
              <Text className="mt-1 text-xs leading-4 text-danger" numberOfLines={3}>
                {diagnostic.message}
              </Text>
              <Pressable
                onPress={() => {
                  hapticLight();
                  void clearSyncDiagnostic();
                }}
                className="mt-2 self-start"
              >
                <Text className="text-xs font-semibold text-text-muted">Dismiss</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-6 pb-12 pt-2">
          {visible.length === 0 ? (
            <View className="mt-10 items-center px-4">
              <Text className="text-center text-base font-semibold text-text-primary">
                No sync history yet
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-text-muted">
                After Sync to Coach Watts runs, wellness days and workouts appear here with status
                and retry.
              </Text>
            </View>
          ) : (
            visible.map((item) => {
              // `pending` items are queued server-side and can stall — let the
              // user force another attempt instead of stranding them (CW-463).
              const canRetry =
                item.status === 'failed' ||
                item.status === 'needs_sync' ||
                item.status === 'pending';
              const isBusy = busyId === item.id || item.status === 'syncing';
              return (
                <View
                  key={item.id}
                  className="mb-3 rounded-xl border border-border bg-card/60 px-4 py-3.5"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="mr-3 flex-1">
                      <Text className="text-sm font-semibold text-text-primary">{item.title}</Text>
                      <Text className="mt-1 text-xs capitalize text-text-muted">
                        {item.kind} · {item.platform.replace('_', ' ')}
                      </Text>
                      <Text className="mt-1 text-xs text-text-muted">{formatWhen(item)}</Text>
                      {item.lastError ? (
                        <Text className="mt-1.5 text-xs text-danger" numberOfLines={2}>
                          {item.lastError}
                        </Text>
                      ) : null}
                    </View>
                    <Text className={`text-xs font-semibold ${statusColor(item.status)}`}>
                      {formatLedgerStatusLabel(item.status)}
                    </Text>
                  </View>
                  {canRetry ? (
                    <View className="mt-3">
                      {isBusy ? (
                        <Spinner />
                      ) : (
                        <Button
                          label="Retry"
                          variant="secondary"
                          onPress={() => void handleRetry(item.id)}
                        />
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
