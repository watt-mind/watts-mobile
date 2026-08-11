/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState, type RefObject } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { DetailSkeleton } from '@/src/components/Skeleton';
import {
  displaySportName,
  formFromSportProfile,
  formHasInvalidNumbers,
  paceUnitForSport,
  showThresholdPace,
  sportSettingsWebPath,
  thresholdPaceFieldLabel,
  thresholdPaceHelperText,
  toSportThresholdPatch,
} from '@/src/features/sports/mapSports';
import type { SportProfile, SportThresholdFormValues } from '@/src/features/sports/types';
import { usePatchSportThresholds, useSportProfilesQuery } from '@/src/features/sports/useSports';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { hapticError, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';
import { APP_HREFS } from '@/src/linking/appHrefs';

export default function SportProfileEditorScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const profileId = typeof params.id === 'string' ? decodeURIComponent(params.id) : '';
  const { instanceUrl } = useAuth();
  const { data: profiles, isLoading, isError, error, refetch } = useSportProfilesQuery();
  const { containerRef, overlap } = useKeyboardOverlap();

  const profile = useMemo(
    () => profiles?.find((item) => item.id === profileId) ?? null,
    [profiles, profileId],
  );

  const title = profile ? displaySportName(profile) : 'Sport profile';

  return (
    <>
      <Stack.Screen options={{ title, headerShown: true }} />
      {isLoading && !profiles ? (
        <DetailSkeleton />
      ) : isError && !profiles ? (
        <View className="flex-1 bg-surface px-6 pt-6">
          <Text className="text-danger">
            {friendlyError(error, 'Failed to load sport profiles')}
          </Text>
          <Pressable className="mt-4" hitSlop={8} onPress={() => void refetch()}>
            <Text className="font-semibold text-brand">Retry</Text>
          </Pressable>
        </View>
      ) : !profile ? (
        <View className="flex-1 bg-surface px-6 pt-6">
          <Text className="text-base text-text-muted">
            This sport profile is no longer available.
          </Text>
          <Pressable
            className="mt-4"
            hitSlop={8}
            onPress={() => router.replace(APP_HREFS.settingsSports as Href)}
          >
            <Text className="font-semibold text-brand">Back to Sports</Text>
          </Pressable>
        </View>
      ) : (
        <SportProfileForm
          key={profile.id}
          profile={profile}
          instanceUrl={instanceUrl}
          containerRef={containerRef}
          overlap={overlap}
        />
      )}
    </>
  );
}

function SportProfileForm({
  profile,
  instanceUrl,
  containerRef,
  overlap,
}: {
  profile: SportProfile;
  instanceUrl: string | null;
  containerRef: RefObject<View | null>;
  overlap: number;
}) {
  const saveMutation = usePatchSportThresholds();
  const { data: athlete } = useAthleteProfileQuery();
  const includePace = showThresholdPace(profile);
  // The unit the stored m/s value is rendered in and typed back against (CW-483).
  const paceUnit = paceUnitForSport(profile, athlete?.distanceUnits);
  const [values, setValues] = useState(() => formFromSportProfile(profile, paceUnit));
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [paceEdited, setPaceEdited] = useState(false);
  const [renderedPaceUnit, setRenderedPaceUnit] = useState(paceUnit);

  // The athlete profile (and therefore the unit) can resolve after first render.
  // Re-render the stored m/s value in the new unit so what is shown always matches
  // the label — and so saving cannot re-parse a per-km string as per-mile.
  if (paceUnit !== renderedPaceUnit) {
    setRenderedPaceUnit(paceUnit);
    if (!paceEdited) {
      setValues((prev) => ({
        ...prev,
        thresholdPace: formFromSportProfile(profile, paceUnit).thresholdPace,
      }));
    }
  }

  const patch = <K extends keyof SportThresholdFormValues>(
    key: K,
    value: SportThresholdFormValues[K],
  ) => {
    setFormError(null);
    setSuccessMessage(null);
    if (key === 'thresholdPace') setPaceEdited(true);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const openWeb = async () => {
    await openInstanceWeb(instanceUrl, sportSettingsWebPath());
  };

  const onSave = async () => {
    setFormError(null);
    setSuccessMessage(null);
    if (formHasInvalidNumbers(values, includePace, paceUnit)) {
      hapticError();
      setFormError('Enter valid numbers for each threshold you want to update.');
      return;
    }
    const body = toSportThresholdPatch(values, includePace, paceUnit);
    if (!body) {
      hapticError();
      setFormError('Enter valid numbers for each threshold you want to update.');
      return;
    }
    try {
      await saveMutation.mutateAsync({ profile, patch: body });
      hapticSuccess();
      setSuccessMessage('Thresholds saved.');
    } catch (err) {
      hapticError();
      setFormError(friendlyError(err, 'Failed to save sport profile'));
    }
  };

  const title = displaySportName(profile);

  return (
    <View ref={containerRef} className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4"
        contentContainerStyle={{ paddingBottom: 40 + overlap }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-2xl font-semibold text-text-primary">{title}</Text>
        <Text className="mt-2 text-sm text-text-muted">Edit thresholds for this sport.</Text>

        <Field
          label="FTP (W)"
          value={values.ftp}
          onChangeText={(text) => patch('ftp', text)}
          keyboardType="number-pad"
          editable={!saveMutation.isPending}
        />
        <Field
          label="LTHR (bpm)"
          value={values.lthr}
          onChangeText={(text) => patch('lthr', text)}
          keyboardType="number-pad"
          editable={!saveMutation.isPending}
        />
        <Field
          label="Max HR (bpm)"
          value={values.maxHr}
          onChangeText={(text) => patch('maxHr', text)}
          keyboardType="number-pad"
          editable={!saveMutation.isPending}
        />
        {includePace ? (
          <Field
            label={thresholdPaceFieldLabel(paceUnit)}
            value={values.thresholdPace}
            onChangeText={(text) => patch('thresholdPace', text)}
            keyboardType="decimal-pad"
            editable={!saveMutation.isPending}
            placeholder={paceUnit === 'per-100m' ? 'e.g. 1:45' : 'e.g. 5:15'}
            helperText={thresholdPaceHelperText(paceUnit)}
          />
        ) : null}

        {formError ? <Text className="mt-4 text-sm text-danger">{formError}</Text> : null}
        {successMessage ? (
          <Text className="mt-4 text-sm text-success">{successMessage}</Text>
        ) : null}

        <Button
          className="mt-6"
          label="Save thresholds"
          onPress={() => void onSave()}
          loading={saveMutation.isPending}
        />

        <Pressable
          className="mt-3 items-center rounded-xl border border-border-strong py-3.5 active:opacity-80"
          onPress={() => void openWeb()}
        >
          <Text className="text-base font-semibold text-text-primary">Open Sport Settings</Text>
        </Pressable>

        <Pressable
          className="mt-3 items-center rounded-xl border border-border-strong py-3.5 active:opacity-80"
          onPress={() => router.back()}
        >
          <Text className="text-base font-semibold text-text-primary">Cancel</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  editable,
  placeholder,
  helperText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType: 'decimal-pad' | 'number-pad';
  editable: boolean;
  placeholder?: string;
  helperText?: string;
}) {
  const theme = useThemeColors();
  return (
    <View className="mt-5">
      <Text className="text-xs uppercase tracking-wide text-text-muted">{label}</Text>
      <TextInput
        className="mt-2 rounded-xl border border-border-strong bg-card/80 px-4 py-3 text-base text-text-primary"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
      />
      {helperText ? <Text className="mt-1 text-xs text-text-muted">{helperText}</Text> : null}
    </View>
  );
}
