/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { QuotaLimitCard } from '@/src/features/subscriptions/QuotaLimitCard';
import { parseQuotaError } from '@/src/features/subscriptions/quota';
import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { DetailSkeleton, Skeleton } from '@/src/components/Skeleton';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';
import { isDailyCheckinCompleted } from '@/src/features/log/isDailyCheckinCompleted';
import {
  useDailyCheckinQuery,
  useGenerateDailyCheckin,
  useSubmitDailyCheckin,
} from '@/src/features/log/useDailyCheckin';
import { useTodayQuery } from '@/src/features/today/useToday';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { hapticLight, hapticError, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

const POLL_MS = 2500;
const MAX_POLL_ATTEMPTS = 30; // ~75s

export default function DailyCheckinScreen() {
  const theme = useThemeColors();
  const { instanceUrl } = useAuth();
  const todayQuery = useTodayQuery();
  const { data: checkin, isLoading, isError, error, refetch } = useDailyCheckinQuery();
  const generateMutation = useGenerateDailyCheckin();
  const submitMutation = useSubmitDailyCheckin();
  const { containerRef, overlap } = useKeyboardOverlap();
  const generateCheckin = generateMutation.mutate;

  const [answerOverrides, setAnswerOverrides] = useState<Record<string, 'YES' | 'NO'>>({});
  const [userNotesOverride, setUserNotesOverride] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollAttemptsRef = useRef(0);

  const status = checkin?.status;
  const isGenerating = status === 'PENDING' || status === 'PROCESSING';

  // 1. Auto-trigger generation on mount if no check-in exists for today
  useEffect(() => {
    if (!isLoading && !checkin && !generateMutation.isPending && !generateMutation.isError) {
      pollAttemptsRef.current = 0;
      generateCheckin(false, {
        onError: (err) => {
          setActionError(friendlyError(err, 'Failed to generate questions'));
        },
      });
    }
  }, [checkin, generateCheckin, generateMutation.isError, generateMutation.isPending, isLoading]);

  // 2. Poll today check-in while generating; cap ~75s then offer Retry / Open web
  useEffect(() => {
    if (!isGenerating) {
      pollAttemptsRef.current = 0;
      return;
    }
    const interval = setInterval(() => {
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      void refetch();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [isGenerating, refetch]);

  // 3. Treat saved answers as the base and keep only this visit's edits in local state.
  const answers = useMemo(() => {
    const saved: Record<string, 'YES' | 'NO'> = {};
    checkin?.questions?.forEach((q) => {
      if (q.answer === 'YES' || q.answer === 'NO') saved[q.id] = q.answer;
    });
    return { ...saved, ...answerOverrides };
  }, [answerOverrides, checkin?.questions]);
  const userNotes = userNotesOverride ?? checkin?.userNotes ?? '';

  const onAnswer = (qId: string, value: 'YES' | 'NO') => {
    hapticLight();
    setAnswerOverrides((prev) => ({
      ...prev,
      [qId]: value,
    }));
  };

  const openWeb = () => void openInstanceWeb(instanceUrl, '/');

  const onSubmit = async () => {
    if (!checkin?.id) return;
    setActionError(null);
    try {
      await submitMutation.mutateAsync({
        checkinId: checkin.id,
        answers,
        userNotes: userNotes.trim() || undefined,
      });
      hapticSuccess();
      void todayQuery.refetch();
      router.back();
    } catch (err) {
      hapticError();
      setActionError(friendlyError(err, 'Failed to submit check-in'));
    }
  };

  const handleRetryGenerate = () => {
    setActionError(null);
    setTimedOut(false);
    pollAttemptsRef.current = 0;
    generateMutation.mutate(true);
  };

  const allAnswered =
    checkin?.questions &&
    checkin.questions.length > 0 &&
    checkin.questions.every((q) => answers[q.id] != null);

  const renderContent = () => {
    if (isLoading || (generateMutation.isPending && !checkin)) {
      return <DetailSkeleton />;
    }

    if (timedOut && isGenerating) {
      return (
        <View className="flex-1 items-center justify-center bg-surface p-6">
          <Text className="text-lg font-semibold text-text-primary">Still preparing…</Text>
          <Text className="mt-2 text-center text-sm text-danger">
            Check-in generation timed out. Retry or continue in Coach Watts.
          </Text>
          <View className="mt-6 w-full gap-3">
            <Button label="Try Again" onPress={handleRetryGenerate} />
            <Button label="Open Coach Watts" variant="secondary" onPress={openWeb} />
            <Button label="Go Back" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      );
    }

    if (generateMutation.isError || isError) {
      const displayErr = generateMutation.error || error;
      const quota = parseQuotaError(displayErr, 'DAILY_CHECKIN');
      if (quota) {
        return (
          <View className="flex-1 justify-center bg-surface p-6">
            <QuotaLimitCard
              info={quota}
              surface="daily_checkin"
              onDismiss={() => {
                generateMutation.reset();
                setActionError(null);
                router.back();
              }}
            />
          </View>
        );
      }
      return (
        <View className="flex-1 items-center justify-center bg-surface p-6">
          <Text className="text-lg font-semibold text-text-primary">
            Could not prepare check-in
          </Text>
          <Text className="mt-2 text-center text-sm text-danger">
            {friendlyError(displayErr, 'An error occurred during generation.')}
          </Text>
          <View className="mt-6 w-full gap-3">
            <Button label="Try Again" onPress={handleRetryGenerate} />
            <Button label="Open Coach Watts" variant="secondary" onPress={openWeb} />
            <Button label="Go Back" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      );
    }

    if (isGenerating) {
      return (
        <View className="flex-1 bg-surface pt-2" testID="daily-checkin-generating">
          <Text className="mb-1 text-base font-semibold text-text-primary">
            Preparing your questions…
          </Text>
          <Text className="mb-6 text-xs text-text-muted">
            Coach is analyzing your recent training to tailor today&apos;s check-in.
          </Text>
          <View className="gap-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="mt-2 h-12 w-full rounded-xl" />
          </View>
        </View>
      );
    }

    if (!checkin?.questions || checkin.questions.length === 0) {
      return (
        <View className="flex-1 items-center justify-center bg-surface p-6">
          <Text className="text-base font-semibold text-text-primary">
            Nothing to check in today
          </Text>
          <Text className="mt-2 text-center text-sm text-text-muted">
            Coach will ask when it matters.
          </Text>
          <View className="mt-6 w-full gap-3">
            <Button
              label="Log wellness instead"
              onPress={() => router.replace('/(app)/(tabs)/log?section=wellness' as Href)}
            />
            <Button
              label="Generate questions"
              variant="secondary"
              loading={generateMutation.isPending}
              onPress={handleRetryGenerate}
            />
            <Button label="Go Back" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      );
    }

    return (
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {isDailyCheckinCompleted(checkin) ? (
          <Text className="mb-2 text-xs text-brand">Already completed — you can edit answers.</Text>
        ) : null}

        <View className="mt-2 gap-4">
          {checkin.questions.map((q) => {
            const currentAnswer = answers[q.id];
            return (
              <View key={q.id} className="rounded-xl border border-border bg-card/40 p-4">
                <Text className="text-base leading-6 text-text-body">{q.text}</Text>
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    testID={`daily-checkin-${q.id}-yes`}
                    accessibilityRole="button"
                    accessibilityLabel={`Yes: ${q.text}`}
                    accessibilityState={{ selected: currentAnswer === 'YES' }}
                    onPress={() => onAnswer(q.id, 'YES')}
                    className={`flex-1 items-center justify-center rounded-lg border py-2.5 ${
                      currentAnswer === 'YES'
                        ? 'border-brand bg-brand/10'
                        : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        currentAnswer === 'YES' ? 'text-brand' : 'text-text-muted'
                      }`}
                    >
                      YES
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`daily-checkin-${q.id}-no`}
                    accessibilityRole="button"
                    accessibilityLabel={`No: ${q.text}`}
                    accessibilityState={{ selected: currentAnswer === 'NO' }}
                    onPress={() => onAnswer(q.id, 'NO')}
                    className={`flex-1 items-center justify-center rounded-lg border py-2.5 ${
                      currentAnswer === 'NO'
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        currentAnswer === 'NO' ? 'text-danger' : 'text-text-muted'
                      }`}
                    >
                      NO
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <View className="mt-6">
          <Text className="mb-2 text-xs uppercase tracking-wide text-text-muted">
            Notes for Coach (Optional)
          </Text>
          <TextInput
            testID="daily-checkin-notes"
            className="min-h-[80px] w-full rounded-lg border border-border bg-card/40 px-3 py-2 text-base text-text-primary"
            placeholder="Add context about how you feel, soreness, stress..."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={userNotes}
            onChangeText={setUserNotesOverride}
          />
        </View>

        {actionError ? <Text className="mt-4 text-sm text-danger">{actionError}</Text> : null}
      </ScrollView>
    );
  };

  const hasQuestions = Boolean(checkin?.questions?.length) && !isGenerating;

  return (
    <View className="flex-1 justify-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss daily check-in"
        className="absolute inset-0 bg-black/60"
        onPress={() => {
          Keyboard.dismiss();
          router.back();
        }}
      />
      <View
        ref={containerRef}
        testID="daily-checkin-sheet"
        accessibilityViewIsModal={Platform.OS === 'ios'}
        accessibilityRole="summary"
        accessibilityLabel="Daily Coach Check-In"
        className="h-[88%] rounded-t-3xl bg-surface px-6 pt-4"
        style={{ paddingBottom: 40 + overlap }}
      >
        <View className="mb-4 h-1 w-10 self-center rounded-full bg-border-strong" />

        <View className="mb-4 flex-row items-start justify-between">
          <View className="min-w-0 flex-1 pr-3">
            <Text className="text-xl font-bold text-text-primary">Daily Coach Check-In</Text>
            <Text className="mt-0.5 text-xs leading-4 text-text-muted">
              Answer a few quick questions to tailor today&apos;s training.
            </Text>
          </View>
          <Pressable
            testID="daily-checkin-cancel"
            accessibilityRole="button"
            accessibilityLabel="Cancel daily check-in"
            hitSlop={8}
            className="p-1 active:opacity-70"
            onPress={() => router.back()}
          >
            <Text className="text-base font-semibold text-text-muted">Cancel</Text>
          </Pressable>
        </View>

        <View className="min-h-0 flex-1">{renderContent()}</View>

        {hasQuestions ? (
          <View className="border-t border-border bg-surface pt-3">
            <Button
              testID="daily-checkin-submit"
              label="Submit Check-In"
              disabled={!allAnswered}
              loading={submitMutation.isPending}
              onPress={onSubmit}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
