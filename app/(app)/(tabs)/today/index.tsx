/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-screens/experimental';

import { useOfflineCached } from '@/src/hooks/useOfflineCached';
import { useTabScrollPadding } from '@/src/hooks/useTabScrollPadding';

import { friendlyError } from '@/src/api/errors';
import { useAuth } from '@/src/auth/AuthContext';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { AppSymbol } from '@/src/components/AppSymbol';
import { Button } from '@/src/components/Button';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { Skeleton, SkeletonScreen } from '@/src/components/Skeleton';
import { SportIcon } from '@/src/components/SportIcon';
import {
  ACTIVITY_GLANCE_WORKOUTS_KEY,
  useCompletePlannedWorkout,
  useRecentActivityQuery,
  useSkipPlannedWorkout,
  useUpcomingPlannedQuery,
} from '@/src/features/activity/useActivity';
import { FuelStateDecisionLink } from '@/src/features/nutrition/FuelStateDecisionLink';
import { NutritionGlance } from '@/src/features/nutrition/NutritionGlance';
import { useTodayNutritionQuery } from '@/src/features/nutrition/useNutrition';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';
import { FinishSetupCard } from '@/src/features/activation/FinishSetupCard';
import { useActivationStatus } from '@/src/features/activation/useActivationStatus';
import { useHealthSyncPreferences } from '@/src/features/health/useHealthSyncPreferences';
import { useIntegrationStatus } from '@/src/features/integrations/useIntegrationStatus';
import { isDailyCheckinCompleted } from '@/src/features/log/isDailyCheckinCompleted';
import { useDailyCheckinQuery } from '@/src/features/log/useDailyCheckin';
import { isNutritionTrackingEnabled } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { DASHBOARD_PROFILE_KEY } from '@/src/features/profile/useRecentWellness';
import { useActiveRecoveryQuery } from '@/src/features/recovery/useRecovery';
import { AnalysisReadyCard } from '@/src/features/today/analysis-ready-card';
import { AllowanceHint } from '@/src/features/subscriptions/AllowanceHint';
import { QuotaLimitCard } from '@/src/features/subscriptions/QuotaLimitCard';
import { parseQuotaError, type QuotaInfo } from '@/src/features/subscriptions/quota';
import { useRefreshQuotaAllowances } from '@/src/features/subscriptions/useQuotaAllowances';
import { AnalyzeReadinessPanel } from '@/src/features/today/AnalyzeReadinessPanel';
import { ComingUpStrip } from '@/src/features/today/coming-up-strip';
import { MoreActionsSheet, type MoreAction } from '@/src/features/today/more-actions-sheet';
import { UpcomingEventsGlance } from '@/src/features/today/UpcomingEventsGlance';
import { TrainingLoadGlance } from '@/src/features/performance/TrainingLoadGlance';
import { pmcQueryKey } from '@/src/features/performance/usePmc';
import { MonthlyProgressGlance } from '@/src/features/stats/MonthlyProgressGlance';
import { monthlyComparisonQueryKey } from '@/src/features/stats/useMonthlyProgress';
import { WellnessSection } from '@/src/features/today/wellness-section';
import {
  confidenceFilledCount,
  formatDuration,
  heroToneForAction,
  mapRecommendationDetail,
  type HeroTone,
} from '@/src/features/today/mapTodayPayload';
import { RecentlyTeaser } from '@/src/features/today/recently-teaser';
import { CreateAdHocWorkoutSheet } from '@/src/features/today/CreateAdHocWorkoutSheet';
import { RecommendationDetailSheet } from '@/src/features/today/RecommendationDetailSheet';
import { RefineRecommendationSheet } from '@/src/features/today/RefineRecommendationSheet';
import { fetchAdHocGenerateStatus, type AdHocWorkoutRequest } from '@/src/features/today/adHocApi';
import { fetchRecommendationStatus, fetchTodayView } from '@/src/features/today/api';
import { syncTodayWidget } from '@/src/features/today/syncTodayWidget';
import type { ActivityRecommendationApi, TodayPlannedWorkout } from '@/src/features/today/types';
import {
  TODAY_QUERY_KEY,
  useAcceptRecommendation,
  useGenerateAdHocWorkout,
  useGenerateTodayRecommendation,
  useTodayQuery,
} from '@/src/features/today/useToday';
import { WeekGlanceStrip } from '@/src/features/today/week-glance-strip';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { humanizeWorkoutType } from '@/src/lib/humanizeWorkoutType';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

function openPlannedWorkout(id: string) {
  router.push(APP_HREFS.plannedDetail(id) as Href);
}

function openDiscussWithCoach() {
  router.push('/(app)/(tabs)/coach?discuss=1' as Href);
}

const HERO_TONE_CLASSES: Record<
  HeroTone,
  { accent: string; kicker: string; tint: string; fill: string }
> = {
  train: {
    accent: 'border-l-brand',
    kicker: 'text-brand',
    tint: 'bg-brand/10',
    fill: 'bg-brand',
  },
  rest: {
    accent: 'border-l-recovery',
    kicker: 'text-recovery',
    tint: 'bg-recovery/10',
    fill: 'bg-recovery',
  },
  modify: {
    accent: 'border-l-modify',
    kicker: 'text-modify',
    tint: 'bg-modify/10',
    fill: 'bg-modify',
  },
};

function ConfidenceDots({ confidence, fillClass }: { confidence: number; fillClass: string }) {
  const filled = confidenceFilledCount(confidence);
  if (filled == null) return null;
  return (
    <View
      accessibilityLabel={`Confidence ${filled} of 3`}
      className="ml-2 flex-row items-center gap-1"
    >
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n <= filled ? fillClass : 'bg-border-strong'}`}
        />
      ))}
    </View>
  );
}

function greetingPhraseForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First name for greeting personalization; null when we have nothing friendly. */
function greetingFirstName(name?: string | null, email?: string | null): string | null {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const fromEmail = email?.split('@')[0]?.trim();
  return fromEmail || null;
}

function PlannedSummaryCard({
  planned,
  hero = false,
}: {
  planned: TodayPlannedWorkout;
  hero?: boolean;
}) {
  return (
    <AnimatedPressable
      className={`${hero ? 'mt-6 rounded-2xl' : 'mt-4 rounded-xl'} border border-border bg-card/80 p-4`}
      onPress={() => openPlannedWorkout(planned.id)}
    >
      <View className="flex-row items-start gap-3">
        <SportIcon type={planned.type} size={hero ? 18 : 14} />
        <View className="min-w-0 flex-1">
          <Text className="text-xs uppercase tracking-wide text-text-muted">
            {hero ? 'Today’s planned workout' : 'Planned workout'}
          </Text>
          <Text
            className={`${hero ? 'mt-2 text-2xl' : 'mt-1 text-lg'} font-semibold text-text-primary`}
          >
            {planned.title}
          </Text>
          <Text className="mt-2 text-sm text-text-muted">
            {[
              humanizeWorkoutType(planned.type),
              formatDuration(planned.durationSec),
              planned.tss != null ? `TSS ${Math.round(planned.tss)}` : null,
              planned.structureSummary,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {hero && planned.description ? (
            <Text className="mt-3 text-base leading-6 text-text-body" numberOfLines={3}>
              {planned.description}
            </Text>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

/** Staggered fade-in-up used for the Today sections; `order` sets the delay slot. */
function EnterSection({ order, children }: { order: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(order * 60)}>{children}</Animated.View>
  );
}

export default function TodayScreen() {
  const theme = useThemeColors();

  const { instanceUrl, user } = useAuth();
  const greetingName = greetingFirstName(user?.name, user?.email);
  const greetingPhrase = greetingPhraseForNow();
  const queryClient = useQueryClient();
  const tabBottomPad = useTabScrollPadding();
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useTodayQuery();
  const {
    data: activeRecovery,
    isError: recoveryError,
    error: recoveryErr,
    refetch: refetchRecovery,
  } = useActiveRecoveryQuery();
  const upcomingQuery = useUpcomingPlannedQuery();
  const recentQuery = useRecentActivityQuery();
  const profileQuery = useAthleteProfileQuery();
  const dailyCheckinQuery = useDailyCheckinQuery();
  const nutritionEnabled = isNutritionTrackingEnabled(profileQuery.data);
  const nutritionQuery = useTodayNutritionQuery({ enabled: nutritionEnabled });
  const { isSuccess: integrationsReady, connectedCount } = useIntegrationStatus();
  const { preferences: healthSyncPrefs } = useHealthSyncPreferences();
  const { data: activation } = useActivationStatus();
  const showFinishSetup = Boolean(
    activation?.supportsActivation && activation.softActivated && !activation.fullyActivated,
  );
  // Phone-only Health Sync counts as connected data — don't nudge OAuth apps.
  const showConnectDeviceCue =
    !showFinishSetup &&
    integrationsReady &&
    connectedCount === 0 &&
    !healthSyncPrefs.syncEnabled &&
    !activation?.hasUsableData;
  const acceptMutation = useAcceptRecommendation();
  const plannedId = data?.plannedWorkout?.id;
  const completePlannedMutation = useCompletePlannedWorkout(plannedId);
  const skipPlannedMutation = useSkipPlannedWorkout(plannedId);

  const checkinCompleted = isDailyCheckinCompleted(dailyCheckinQuery.data);

  const [actionError, setActionError] = useState<string | null>(null);
  const [genState, setGenState] = useState<'idle' | 'generating' | 'error' | 'quota'>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [genQuota, setGenQuota] = useState<QuotaInfo | null>(null);
  const refreshAllowances = useRefreshQuotaAllowances();
  const [detailOpen, setDetailOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocState, setAdhocState] = useState<'idle' | 'generating' | 'error' | 'quota'>('idle');
  const [adhocError, setAdhocError] = useState<string | null>(null);
  const [adhocQuota, setAdhocQuota] = useState<QuotaInfo | null>(null);
  const generateMutation = useGenerateTodayRecommendation();
  const adhocMutation = useGenerateAdHocWorkout();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Epoch/token for the generate-status poll. Bumped each time a new generation
  // starts so a slow/late tick from a prior generation can recognize it's stale
  // and no-op instead of clobbering a newer generation's interval or genState.
  const genTokenRef = useRef(0);
  // Token the currently-scheduled interval belongs to, so clearGeneratePoll can
  // avoid tearing down a newer generation's interval when called from a stale tick.
  const pollTokenRef = useRef(0);
  const adhocPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusFailRef = useRef(0);
  const adhocFailRef = useRef(0);
  const generatingBusy = genState === 'generating' || generateMutation.isPending;
  const adhocBusy = adhocState === 'generating' || adhocMutation.isPending;
  const actionsBusy = generatingBusy || adhocBusy;

  /**
   * Clears the generate-status poll interval. When `token` is provided, only
   * clears if it still matches the interval actually scheduled (`pollTokenRef`) —
   * this prevents a stale tick from a superseded generation from clearing a
   * newer generation's interval. Omit `token` to force-clear unconditionally
   * (e.g. starting a fresh generation, or unmount).
   */
  const clearGeneratePoll = (token?: number) => {
    if (pollRef.current && (token === undefined || token === pollTokenRef.current)) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const clearAdhocPoll = () => {
    if (adhocPollRef.current) {
      clearInterval(adhocPollRef.current);
      adhocPollRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearGeneratePoll();
      clearAdhocPoll();
    },
    [],
  );

  const onGenerate = async (userFeedback?: string) => {
    if (genState === 'generating' || generateMutation.isPending || adhocBusy) return;
    clearGeneratePoll();
    // New generation epoch — any in-flight tick from a prior generation will see
    // its captured token no longer matches this and will no-op instead of acting
    // on stale data or clearing this generation's interval.
    const myToken = ++genTokenRef.current;
    statusFailRef.current = 0;
    setGenState('generating');
    refreshAllowances();
    setGenError(null);
    try {
      const trimmed = userFeedback?.trim();
      const res = await generateMutation.mutateAsync(trimmed || undefined);
      if (res.jobId) {
        let attempts = 0;
        const maxAttempts = 30;
        pollTokenRef.current = myToken;
        pollRef.current = setInterval(() => {
          void (async () => {
            attempts++;
            try {
              const status = await fetchRecommendationStatus(res.jobId);
              // A newer generation may have started while this fetch was in flight
              // (or between when this tick fired and this point) — if so, this
              // result is stale: don't touch genState or clear the newer interval.
              if (genTokenRef.current !== myToken) return;
              statusFailRef.current = 0;
              if (!status.isRunning) {
                clearGeneratePoll(myToken);
                setGenState('idle');
                void refetch();
              } else if (attempts >= maxAttempts) {
                clearGeneratePoll(myToken);
                hapticError();
                setGenState('error');
                setGenError('That took too long. Try again, or continue in Coach Watts.');
              }
            } catch {
              if (genTokenRef.current !== myToken) return;
              statusFailRef.current += 1;
              if (statusFailRef.current >= 3 || attempts >= maxAttempts) {
                clearGeneratePoll(myToken);
                hapticError();
                setGenState('error');
                setGenError('Couldn’t check generation status. Try again shortly.');
              }
            }
          })();
        }, 2500);
      } else {
        setGenState('idle');
        void refetch();
      }
    } catch (err: unknown) {
      hapticError();
      refreshAllowances();
      const quota = parseQuotaError(err, 'READINESS_RECOMMENDATION');
      if (quota) {
        setGenState('quota');
        setGenQuota(quota);
      } else {
        setGenState('error');
        setGenError(
          friendlyError(err, 'Something went wrong. Try again, or continue in Coach Watts.'),
        );
      }
    }
  };

  const { showCachedOffline, lastUpdatedLabel } = useOfflineCached({
    data,
    isError,
    dataUpdatedAt,
  });

  useEffect(() => {
    void syncTodayWidget(data);
  }, [data]);

  const onAccept = async () => {
    if (!data?.recommendationId || !data.canAccept || actionsBusy) return;
    setActionError(null);
    try {
      await acceptMutation.mutateAsync(data.recommendationId);
      hapticSuccess();
      setDetailOpen(false);
    } catch (err) {
      hapticError();
      setActionError(friendlyError(err, 'Accept failed'));
    }
  };

  const onRefineSubmit = (feedback: string) => {
    setRefineOpen(false);
    void onGenerate(feedback);
  };

  const onAdhocSubmit = async (payload: AdHocWorkoutRequest) => {
    clearAdhocPoll();
    if (adhocBusy || generatingBusy) return;
    setAdhocOpen(false);
    adhocFailRef.current = 0;
    setAdhocState('generating');
    refreshAllowances();
    setAdhocError(null);
    const priorPlannedId = data?.plannedWorkout?.id ?? null;
    try {
      const res = await adhocMutation.mutateAsync(payload);
      let attempts = 0;
      const maxAttempts = 30;
      clearAdhocPoll();
      adhocPollRef.current = setInterval(() => {
        void (async () => {
          attempts++;
          try {
            let stillRunning = true;
            if (res.jobId) {
              const status = await fetchAdHocGenerateStatus(res.jobId);
              stillRunning = status.isRunning;
            }
            adhocFailRef.current = 0;

            const latest = await fetchTodayView();
            void queryClient.setQueryData(TODAY_QUERY_KEY, latest);
            void upcomingQuery.refetch();

            const nextId = latest.plannedWorkout?.id ?? null;
            const appeared = Boolean(nextId && nextId !== priorPlannedId);

            if (!stillRunning || appeared) {
              clearAdhocPoll();
              setAdhocState('idle');
              void refetch();
              hapticSuccess();
              return;
            }

            if (attempts >= maxAttempts) {
              clearAdhocPoll();
              hapticError();
              setAdhocState('error');
              setAdhocError('That took too long. Try again, or continue in Coach Watts.');
            }
          } catch {
            adhocFailRef.current += 1;
            if (adhocFailRef.current >= 3 || attempts >= maxAttempts) {
              clearAdhocPoll();
              hapticError();
              setAdhocState('error');
              setAdhocError('Couldn’t check generation status. Try again shortly.');
            }
          }
        })();
      }, 2500);
    } catch (err: unknown) {
      clearAdhocPoll();
      hapticError();
      refreshAllowances();
      const quota = parseQuotaError(err, 'WORKOUT_GENERATION');
      if (quota) {
        setAdhocState('quota');
        setAdhocQuota(quota);
      } else {
        setAdhocState('error');
        setAdhocError(friendlyError(err, 'Couldn’t start ad-hoc workout generation.'));
      }
    }
  };

  const openWeb = async () => {
    await openInstanceWeb(instanceUrl, '/');
  };

  const [manualRefreshing, setManualRefreshing] = useState(false);

  const onRefresh = async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchRecovery(),
        upcomingQuery.refetch(),
        recentQuery.refetch(),
        profileQuery.refetch(),
        dailyCheckinQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ACTIVITY_GLANCE_WORKOUTS_KEY }),
        queryClient.invalidateQueries({ queryKey: DASHBOARD_PROFILE_KEY }),
        queryClient.invalidateQueries({ queryKey: ['wellness'] }),
        queryClient.invalidateQueries({ queryKey: pmcQueryKey(90) }),
        queryClient.invalidateQueries({ queryKey: monthlyComparisonQueryKey('all') }),
        queryClient.invalidateQueries({ queryKey: ['stats', 'monthly-comparison'] }),
        ...(nutritionEnabled ? [nutritionQuery.refetch()] : []),
      ]);
    } finally {
      setManualRefreshing(false);
    }
  };

  if (isLoading && !data) {
    return (
      <SafeAreaView
        testID="today-screen"
        edges={{ top: true }}
        style={{ flex: 1, backgroundColor: theme.surface }}
      >
        <SkeletonScreen>
          <View className="flex-1 bg-surface px-6 pt-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-7 w-48" />
            <Skeleton className="mt-6 h-44 rounded-2xl" />
            <View className="mt-4 flex-row gap-2">
              <Skeleton className="h-14 flex-1" />
              <Skeleton className="h-14 flex-1" />
              <Skeleton className="h-14 flex-1" />
            </View>
            <Skeleton className="mt-6 h-12 rounded-xl" />
            <Skeleton className="mt-3 h-12 rounded-xl" />
          </View>
        </SkeletonScreen>
      </SafeAreaView>
    );
  }

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const hasRecommendation = Boolean(data?.recommendationId);
  const planned = data?.plannedWorkout ?? null;
  const hardError = isError && !data;
  const plannedOnlyHero = !hardError && !hasRecommendation && Boolean(planned);
  const emptyNoDecision = !hardError && !hasRecommendation && !planned;
  const heroTone = heroToneForAction(data?.action);
  const heroToneClasses = HERO_TONE_CLASSES[heroTone];
  const recommendationDetail = mapRecommendationDetail(
    (data?.raw as ActivityRecommendationApi | null | undefined) ?? null,
  );
  const showGeneratePanel =
    (!showFinishSetup && emptyNoDecision) || (hasRecommendation && genState !== 'idle');
  const moreActions: MoreAction[] = [
    { key: 'details', label: 'View details', onPress: () => setDetailOpen(true) },
    ...(planned
      ? [
          {
            key: 'workout',
            label: 'View workout details',
            onPress: () => openPlannedWorkout(planned.id),
          },
        ]
      : []),
    { key: 'coach', label: 'Discuss with Coach', onPress: openDiscussWithCoach },
    { key: 'adhoc', label: 'Generate ad-hoc workout', onPress: () => setAdhocOpen(true) },
  ];

  return (
    <SafeAreaView
      testID="today-screen"
      edges={{ top: true }}
      style={{ flex: 1, backgroundColor: theme.surface }}
    >
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerClassName="px-6 pt-4"
        contentContainerStyle={{ paddingBottom: tabBottomPad }}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.brandOnSurface}
          />
        }
      >
        <EnterSection order={0}>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-sm text-text-muted">{dateLabel}</Text>
              <AnimatedPressable
                testID="today-greeting-name"
                accessibilityRole="button"
                accessibilityLabel={
                  greetingName
                    ? `${greetingPhrase}, ${greetingName}. Open athlete profile`
                    : `${greetingPhrase}. Open athlete profile`
                }
                hitSlop={8}
                className="mt-1 self-start active:opacity-70"
                onPress={() => {
                  hapticLight();
                  router.push(APP_HREFS.athlete as Href);
                }}
              >
                <Text className="text-2xl font-semibold text-text-primary">
                  {greetingPhrase}
                  {greetingName ? (
                    <>
                      {', '}
                      <Text className="text-brand">{greetingName}</Text>
                    </>
                  ) : null}
                </Text>
              </AnimatedPressable>
            </View>
            <View className="flex-row items-center gap-2.5">
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Log recovery event"
                hitSlop={8}
                className="h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card"
                onPress={() => router.push(APP_HREFS.recoveryEvent as Href)}
              >
                <AppSymbol
                  sf="cross.case.fill"
                  size={18}
                  tintColor={theme.recoveryOnSurface}
                  fallback="+"
                />
              </AnimatedPressable>
              {nutritionEnabled ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan meal photo"
                  hitSlop={8}
                  className="h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card"
                  onPress={() =>
                    router.push({
                      pathname: APP_HREFS.log,
                      params: { action: 'camera', t: String(Date.now()) },
                    } as Href)
                  }
                >
                  <AppSymbol
                    sf="camera.fill"
                    size={18}
                    tintColor={theme.brandOnSurface}
                    fallback="cam"
                  />
                </AnimatedPressable>
              ) : null}
            </View>
          </View>
        </EnterSection>

        {showFinishSetup ? (
          <EnterSection order={0}>
            <View className="mt-4">
              <FinishSetupCard />
            </View>
          </EnterSection>
        ) : null}

        <OfflineBanner visible={showCachedOffline} lastUpdatedLabel={lastUpdatedLabel} />

        {hardError ? (
          <View className="mt-6 rounded-xl border border-danger/40 bg-tint-error p-4">
            <Text className="text-base text-danger">
              {friendlyError(error, 'Could not load today')}
            </Text>
            <Pressable className="mt-3" hitSlop={8} onPress={() => void refetch()}>
              <Text className="font-semibold text-brand">Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <AnalysisReadyCard recent={recentQuery.data} />

        {!showFinishSetup && !checkinCompleted ? (
          <EnterSection order={1}>
            <Pressable
              testID="daily-checkin"
              accessibilityRole="button"
              accessibilityLabel="Do Quick Daily Coach Check-In"
              className="mt-6 py-1 active:opacity-80"
              onPress={() => router.push(APP_HREFS.dailyCheckin as Href)}
            >
              <Text className="text-xs font-semibold uppercase tracking-wide text-brand">
                Coach Check-In
              </Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-xl font-semibold text-text-primary">
                  Daily Coach Check-In
                </Text>
                <AppSymbol
                  sf="chevron.right"
                  size={16}
                  tintColor={theme.brandOnSurface}
                  fallback="›"
                />
              </View>
              <Text className="mt-1.5 text-sm leading-5 text-text-muted">
                Coach has questions prepared to adjust today’s recommendation.
              </Text>
            </Pressable>
          </EnterSection>
        ) : null}

        {showGeneratePanel ? (
          <AnalyzeReadinessPanel
            state={genState}
            errorMessage={genError}
            quotaInfo={genQuota}
            generatingPending={generateMutation.isPending}
            onAnalyze={() => void onGenerate()}
            onOpenWeb={() => void openWeb()}
            onDismissQuota={() => {
              generateMutation.reset();
              setGenState('idle');
              setGenError(null);
              setGenQuota(null);
              setActionError(null);
            }}
            onAdhoc={!showFinishSetup && emptyNoDecision ? () => setAdhocOpen(true) : undefined}
            adhocDisabled={actionsBusy}
          />
        ) : null}

        {adhocState === 'generating' ? (
          <View className="mt-6 items-center rounded-2xl border border-border bg-card/80 p-5">
            <Text className="text-base font-semibold text-text-primary">Generating workout…</Text>
            <Text className="mt-1 text-center text-sm leading-5 text-text-muted">
              AI is designing your session for today
            </Text>
          </View>
        ) : null}

        {adhocState === 'quota' ? (
          <QuotaLimitCard
            className="mt-6"
            info={adhocQuota ?? { feature: 'WORKOUT_GENERATION' }}
            surface="today_adhoc"
            onDismiss={() => {
              clearAdhocPoll();
              adhocMutation.reset();
              setAdhocState('idle');
              setAdhocError(null);
              setAdhocQuota(null);
              setActionError(null);
            }}
          />
        ) : null}

        {adhocState === 'error' ? (
          <View className="mt-6 rounded-2xl border border-danger/40 bg-tint-error p-5">
            <Text className="text-lg font-semibold text-text-primary">
              Couldn’t generate workout
            </Text>
            <Text className="mt-2 text-sm leading-5 text-danger">
              {adhocError || 'Something went wrong. Try again, or continue in Coach Watts.'}
            </Text>
            <View className="mt-5 gap-3">
              <Button
                label="Try again"
                onPress={() => {
                  clearAdhocPoll();
                  setAdhocState('idle');
                  setAdhocOpen(true);
                }}
              />
              <Button label="Open Coach Watts" variant="secondary" onPress={() => void openWeb()} />
              <Button
                label="Dismiss"
                variant="secondary"
                onPress={() => {
                  clearAdhocPoll();
                  setAdhocState('idle');
                }}
              />
            </View>
          </View>
        ) : null}

        {hasRecommendation ? (
          <EnterSection order={1}>
            <View className="mt-6">
              <View className="flex-row items-center">
                <Text className="text-xs uppercase tracking-wide text-text-muted">
                  Today’s call
                </Text>
                {data!.confidence != null ? (
                  <ConfidenceDots confidence={data!.confidence} fillClass={heroToneClasses.fill} />
                ) : null}
              </View>
              <View
                testID="today-recommendation"
                className={`mt-3 rounded-2xl border border-l-4 border-border ${heroToneClasses.accent} ${heroToneClasses.tint} p-5`}
              >
                <Text className={`text-2xl font-semibold ${heroToneClasses.kicker}`}>
                  {data!.actionLabel}
                </Text>
                {data!.rationale ? (
                  <Text className="mt-3 text-base leading-6 text-text-body">{data!.rationale}</Text>
                ) : null}
                {data!.modificationSummary && !data!.userAccepted ? (
                  <Text className="mt-3 text-sm text-text-muted">
                    Proposed change: {data!.modificationSummary}
                  </Text>
                ) : null}
              </View>
              {!showFinishSetup ? <FuelStateDecisionLink /> : null}
            </View>
          </EnterSection>
        ) : null}

        {plannedOnlyHero && planned ? (
          <EnterSection order={1}>
            <PlannedSummaryCard planned={planned} hero />
            {!showFinishSetup ? <FuelStateDecisionLink /> : null}
          </EnterSection>
        ) : null}

        {hasRecommendation && planned ? (
          <EnterSection order={2}>
            <PlannedSummaryCard planned={planned} />
          </EnterSection>
        ) : null}

        {actionError ? <Text className="mt-4 text-sm text-danger">{actionError}</Text> : null}

        {hasRecommendation ? (
          <EnterSection order={3}>
            <View className="mt-4 gap-3">
              {data?.userAccepted ? (
                planned ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Accepted — view workout"
                    className="flex-row items-center justify-center gap-2 rounded-xl border border-border-strong bg-card/80 px-4 py-3.5 active:opacity-70"
                    onPress={() => openPlannedWorkout(planned.id)}
                  >
                    <AppSymbol
                      sf="checkmark"
                      size={16}
                      tintColor={theme.successOnSurface}
                      fallback="ok"
                    />
                    <Text className="text-base font-semibold text-success">
                      Accepted — view workout
                    </Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center justify-center gap-2 rounded-xl border border-border-strong bg-card/80 px-4 py-3.5">
                    <AppSymbol
                      sf="checkmark"
                      size={16}
                      tintColor={theme.successOnSurface}
                      fallback="ok"
                    />
                    <Text className="text-base font-semibold text-success">
                      {data.action === 'rest' ? 'Rest day accepted' : 'Accepted'}
                    </Text>
                  </View>
                )
              ) : data?.canAccept ? (
                <Button
                  testID="today-recommendation-accept"
                  label={data.action === 'rest' ? 'Accept rest day' : 'Accept recommendation'}
                  onPress={() => void onAccept()}
                  loading={acceptMutation.isPending}
                  disabled={actionsBusy}
                />
              ) : null}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    variant="secondary"
                    label="Refine"
                    onPress={() => setRefineOpen(true)}
                    disabled={actionsBusy}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    testID="today-recommendation-more"
                    variant="secondary"
                    label="More"
                    onPress={() => setMoreOpen(true)}
                    disabled={actionsBusy}
                  />
                </View>
              </View>
            </View>
          </EnterSection>
        ) : null}

        {plannedOnlyHero && planned ? (
          <EnterSection order={2}>
            <View className="mt-4 gap-3">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    label="Complete"
                    onPress={() => {
                      Alert.alert(
                        'Mark complete?',
                        'This marks today’s planned session as completed.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Complete',
                            onPress: () => {
                              setActionError(null);
                              completePlannedMutation.mutate(undefined, {
                                onError: (err) =>
                                  setActionError(friendlyError(err, 'Failed to complete workout')),
                                onSuccess: () => hapticSuccess(),
                              });
                            },
                          },
                        ],
                      );
                    }}
                    loading={completePlannedMutation.isPending}
                    disabled={
                      actionsBusy ||
                      completePlannedMutation.isPending ||
                      skipPlannedMutation.isPending
                    }
                  />
                </View>
                <View className="flex-1">
                  <Button
                    variant="secondary"
                    label="Skip"
                    onPress={() => {
                      Alert.alert(
                        'Skip this workout?',
                        'This marks today’s planned session as skipped.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Skip',
                            style: 'destructive',
                            onPress: () => {
                              setActionError(null);
                              skipPlannedMutation.mutate(undefined, {
                                onError: (err) =>
                                  setActionError(friendlyError(err, 'Failed to skip workout')),
                                onSuccess: () => hapticSuccess(),
                              });
                            },
                          },
                        ],
                      );
                    }}
                    loading={skipPlannedMutation.isPending}
                    disabled={
                      actionsBusy ||
                      completePlannedMutation.isPending ||
                      skipPlannedMutation.isPending
                    }
                  />
                </View>
              </View>
              <Button
                variant="secondary"
                label="View workout details"
                onPress={() => openPlannedWorkout(planned.id)}
                disabled={actionsBusy}
              />
              <Button
                variant="secondary"
                label="Generate Ad-Hoc Workout"
                onPress={() => setAdhocOpen(true)}
                disabled={actionsBusy}
              />
              <AllowanceHint feature="WORKOUT_GENERATION" />
            </View>
          </EnterSection>
        ) : null}

        {showConnectDeviceCue ? (
          <EnterSection order={4}>
            <View className="mt-4">
              <Button
                variant="secondary"
                label="Connect a device"
                onPress={() => router.push(APP_HREFS.settingsConnectedApps as Href)}
              />
            </View>
          </EnterSection>
        ) : null}

        {!showFinishSetup ? (
          <>
            {/* Secondary glances — each section owns its own label (no empty "Context" kicker). */}
            <NutritionGlance />

            <EnterSection order={5}>
              <WellnessSection
                recoveryItems={activeRecovery}
                recoveryError={recoveryError}
                recoveryErrorMessage={friendlyError(recoveryErr, 'Couldn’t load recovery events')}
                onRetryRecovery={() => void refetchRecovery()}
              />
            </EnterSection>

            {/* No entering animation here: these glances swap fixed-height skeletons for
              async-loaded content, and a layout animation on the shared wrapper leaves
              stale measurements (sections overlapping — issue 058). */}
            <View>
              <TrainingLoadGlance />
              <MonthlyProgressGlance />
              <WeekGlanceStrip planned={upcomingQuery.data} />
              <UpcomingEventsGlance />
              <ComingUpStrip excludePlannedId={planned?.id} />
              <RecentlyTeaser />
            </View>
          </>
        ) : null}
      </ScrollView>

      <RecommendationDetailSheet
        visible={detailOpen}
        detail={recommendationDetail}
        recoveryItems={activeRecovery}
        accepting={acceptMutation.isPending}
        onClose={() => setDetailOpen(false)}
        onAccept={() => void onAccept()}
      />
      <RefineRecommendationSheet
        visible={refineOpen}
        submitting={generatingBusy}
        onClose={() => setRefineOpen(false)}
        onSubmit={onRefineSubmit}
      />
      <CreateAdHocWorkoutSheet
        visible={adhocOpen}
        submitting={adhocBusy}
        onClose={() => setAdhocOpen(false)}
        onSubmit={(payload) => void onAdhocSubmit(payload)}
      />
      <MoreActionsSheet
        visible={moreOpen}
        actions={moreActions}
        onClose={() => setMoreOpen(false)}
      />
    </SafeAreaView>
  );
}
