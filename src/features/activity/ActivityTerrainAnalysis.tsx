/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useMemo, useState } from 'react';
import { Text, type TextStyle, View } from 'react-native';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { hapticLight } from '@/src/lib/haptics';
import type { ActivityTerrainStreams } from './chartTypes';
import {
  bucketTerrainProfile,
  deriveTerrainAnalysis,
  type DerivedClimb,
  type TerrainAnalysis,
} from './climbs';
import {
  type DistanceDisplayUnits,
  type TemperatureDisplayUnits,
  elevationUnitLabel,
  formatAltitudeAxisM,
  formatAxisDistanceKm,
  formatClimbDistanceKm,
  formatClimbElevationM,
  formatTemperatureC,
  spokenDistanceKm,
  spokenElevationM,
  spokenTemperatureC,
} from './mapActivity';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { gradientColor, gradientColors } from '@/src/theme/gradientScale';
import { useThemeColors } from '@/src/theme/useThemeColors';

const TERRAIN_HEIGHT = 132;
const TERRAIN_PAD = { left: 32, right: 12, top: 23, bottom: 18 } as const;
const TABULAR_NUMBERS: TextStyle = { fontVariant: ['tabular-nums'] };

/** Athlete display preferences (CW-491) — source terrain data is always metric/°C. */
type TerrainUnits = {
  distanceUnits: DistanceDisplayUnits;
  temperatureUnits: TemperatureDisplayUnits;
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function metric(value: number | null, suffix: string): string {
  return value == null ? '—' : `${Math.round(value)} ${suffix}`;
}

function accessibleDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainder = totalSeconds % 60;
  return [
    hours > 0 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : null,
    minutes > 0 ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : null,
    remainder > 0 || totalSeconds === 0
      ? `${remainder} ${remainder === 1 ? 'second' : 'seconds'}`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function accessibleClimbSummary(
  climb: DerivedClimb,
  expanded: boolean,
  units: TerrainUnits,
): string {
  const summary = [
    `Climb ${climb.index + 1}`,
    climb.category ? `category ${climb.category}` : null,
    spokenDistanceKm(climb.lengthM / 1_000, units.distanceUnits),
    `${spokenElevationM(climb.gainM, units.distanceUnits)} gained`,
    `${climb.averageGradePct.toFixed(1)} percent average grade`,
    accessibleDuration(climb.durationSec),
    `${Math.round(climb.vam)} VAM`,
    climb.averageWatts == null ? null : `${Math.round(climb.averageWatts)} watts average`,
    climb.averageCadence == null
      ? null
      : `${Math.round(climb.averageCadence)} revolutions per minute average`,
  ];
  if (expanded) {
    summary.push(
      `starts at ${spokenDistanceKm(climb.startKm, units.distanceUnits)}`,
      `${climb.maxGradePct.toFixed(1)} percent maximum grade`,
      climb.averageHeartrate == null
        ? null
        : `${Math.round(climb.averageHeartrate)} beats per minute average`,
      climb.averageTempC == null
        ? null
        : `${spokenTemperatureC(climb.averageTempC, units.temperatureUnits)} average`,
    );
  }
  return summary.filter(Boolean).join(', ');
}

function visibleClimbs(climbs: readonly DerivedClimb[]): DerivedClimb[] {
  if (climbs.length <= 8) return [...climbs];
  return [...climbs]
    .sort((left, right) => right.gainM - left.gainM)
    .slice(0, 6)
    .sort((left, right) => left.startIndex - right.startIndex);
}

function TerrainStrip({
  analysis,
  selectedClimb,
  units,
}: {
  analysis: TerrainAnalysis;
  selectedClimb: number | null;
  units: TerrainUnits;
}) {
  const theme = useThemeColors();
  const palette = gradientColors(theme);
  const [width, setWidth] = useState(0);
  const profile = analysis.profile;
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  const distanceSpan = Math.max(last.distanceM - first.distanceM, 1);
  const innerWidth = Math.max(width - TERRAIN_PAD.left - TERRAIN_PAD.right, 1);
  const plotHeight = TERRAIN_HEIGHT - TERRAIN_PAD.top - TERRAIN_PAD.bottom;
  const columns = bucketTerrainProfile(profile, innerWidth);
  const minAltitude = Math.min(...profile.map((point) => point.smoothedAltitudeM));
  const maxAltitude = Math.max(...profile.map((point) => point.smoothedAltitudeM));
  const localRange = Math.max(40, maxAltitude - minAltitude);
  const baseline = minAltitude - localRange * 0.1;
  const altitudeSpan = Math.max(maxAltitude - baseline, 1) * 1.06;
  const toY = (altitude: number) =>
    TERRAIN_PAD.top + plotHeight - ((altitude - baseline) / altitudeSpan) * plotHeight;
  const toX = (distanceM: number) =>
    TERRAIN_PAD.left + ((distanceM - first.distanceM) / distanceSpan) * innerWidth;
  const columnWidth = Math.max(innerWidth / Math.max(Math.floor(innerWidth), 1) + 0.35, 1);
  const startKm = first.distanceM / 1_000;
  const endKm = last.distanceM / 1_000;
  const midKm = (startKm + endKm) / 2;
  const kmDigits = endKm - startKm < 25 ? 1 : 0;
  const accessibilityLabel = `Terrain profile from ${spokenDistanceKm(startKm, units.distanceUnits)} to ${spokenDistanceKm(endKm, units.distanceUnits)} with ${analysis.climbs.length} climbs`;
  const contourPoints = columns
    .map(
      (column) =>
        `${TERRAIN_PAD.left + column.columnIndex + columnWidth / 2},${toY(column.maxAltitudeM)}`,
    )
    .join(' ');

  return (
    <View className="mt-6">
      <Text className="mb-3 text-xs uppercase tracking-wide text-text-body">Terrain</Text>
      <View className="pb-2 pt-1" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          style={{ height: TERRAIN_HEIGHT }}
        >
          {width > 0 ? (
            <Svg width={width} height={TERRAIN_HEIGHT}>
              {columns.map((column) => {
                const x = TERRAIN_PAD.left + column.columnIndex;
                const y = toY(column.maxAltitudeM);
                return (
                  <Rect
                    key={column.columnIndex}
                    x={x}
                    y={y}
                    width={columnWidth}
                    height={Math.max(TERRAIN_PAD.top + plotHeight - y, 1)}
                    fill={gradientColor(column.meanGradientPct, palette)}
                  />
                );
              })}
              <Polyline
                points={contourPoints}
                fill="none"
                stroke={theme.textBody}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {analysis.climbs.map((climb) => {
                const startX = toX(profile[climb.startIndex]!.distanceM);
                const endX = toX(profile[climb.endIndex]!.distanceM);
                const selected = selectedClimb === climb.index;
                const color = selected ? theme.brandOnSurface : theme.textBody;
                return (
                  <Line
                    key={`bracket-${climb.index}`}
                    x1={startX}
                    x2={Math.max(startX + 1.5, endX)}
                    y1={TERRAIN_PAD.top - 8}
                    y2={TERRAIN_PAD.top - 8}
                    stroke={color}
                    strokeWidth={selected ? 3 : 2}
                  />
                );
              })}
              {analysis.climbs.map((climb) => {
                const startX = toX(profile[climb.startIndex]!.distanceM);
                const endX = toX(profile[climb.endIndex]!.distanceM);
                const selected = selectedClimb === climb.index;
                return (
                  <SvgText
                    key={`number-${climb.index}`}
                    x={(startX + endX) / 2}
                    y={10}
                    fill={selected ? theme.brandOnSurface : theme.textBody}
                    fontSize={10}
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {climb.index + 1}
                  </SvgText>
                );
              })}
              <Line
                x1={TERRAIN_PAD.left}
                x2={width - TERRAIN_PAD.right}
                y1={TERRAIN_PAD.top + plotHeight}
                y2={TERRAIN_PAD.top + plotHeight}
                stroke={theme.borderStrong}
                strokeWidth={1}
              />
              <SvgText x={2} y={TERRAIN_PAD.top + 8} fill={theme.textBody} fontSize={9}>
                {formatAltitudeAxisM(maxAltitude, units.distanceUnits)}{' '}
                {elevationUnitLabel(units.distanceUnits)}
              </SvgText>
              <SvgText x={2} y={TERRAIN_PAD.top + plotHeight} fill={theme.textBody} fontSize={9}>
                {formatAltitudeAxisM(minAltitude, units.distanceUnits)}{' '}
                {elevationUnitLabel(units.distanceUnits)}
              </SvgText>
              {[
                { value: startKm, anchor: 'start' as const, x: TERRAIN_PAD.left },
                { value: midKm, anchor: 'middle' as const, x: TERRAIN_PAD.left + innerWidth / 2 },
                { value: endKm, anchor: 'end' as const, x: width - TERRAIN_PAD.right },
              ].map((tick) => (
                <SvgText
                  key={tick.anchor}
                  x={tick.x}
                  y={TERRAIN_HEIGHT - 2}
                  fill={theme.textBody}
                  fontSize={9}
                  textAnchor={tick.anchor}
                >
                  {formatAxisDistanceKm(tick.value, units.distanceUnits, kmDigits)}
                </SvgText>
              ))}
            </Svg>
          ) : null}
        </View>
        <View className="mt-2 flex-row items-center">
          <View
            className="mr-1.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: theme.textBody }}
          />
          <Text className="text-xs text-text-body">
            Elevation ({elevationUnitLabel(units.distanceUnits)})
          </Text>
        </View>
        <View
          className="mt-3 flex-row overflow-hidden rounded-sm"
          style={{ marginLeft: TERRAIN_PAD.left, marginRight: TERRAIN_PAD.right }}
          accessibilityElementsHidden
        >
          {palette.map((color) => (
            <View key={color} className="h-2 flex-1" style={{ backgroundColor: color }} />
          ))}
        </View>
        <View
          className="mt-1 flex-row justify-between"
          style={{ marginLeft: TERRAIN_PAD.left, marginRight: TERRAIN_PAD.right }}
        >
          <Text className="text-[9px] text-text-body">−10% descent</Text>
          <Text className="text-[9px] text-text-body">flat</Text>
          <Text className="text-[9px] text-text-body">+10% climb</Text>
        </View>
      </View>
    </View>
  );
}

function ClimbLedger({
  climbs,
  selectedClimb,
  onSelect,
  units,
}: {
  climbs: readonly DerivedClimb[];
  selectedClimb: number | null;
  onSelect: (index: number | null) => void;
  units: TerrainUnits;
}) {
  if (climbs.length === 0) {
    return (
      <View className="mt-6">
        <Text className="text-xs uppercase tracking-wide text-text-body">Climbs</Text>
        <Text className="mt-2 text-sm text-text-body">No sustained climbs detected.</Text>
      </View>
    );
  }
  const shown = visibleClimbs(climbs);
  const hiddenCount = climbs.length - shown.length;

  return (
    <View className="mt-6">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-xs uppercase tracking-wide text-text-body">Climbs</Text>
        <Text className="text-xs text-text-body">{climbs.length} total</Text>
      </View>
      <View>
        {shown.map((climb, rowIndex) => {
          const expanded = selectedClimb === climb.index;
          return (
            <AnimatedPressable
              key={climb.index}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={accessibleClimbSummary(climb, expanded, units)}
              accessibilityHint={`Double tap to ${expanded ? 'collapse' : 'expand'} climb details`}
              hitSlop={8}
              className={`min-h-11 px-4 py-3 ${
                rowIndex < shown.length - 1 ? 'border-b border-border/80' : ''
              } ${expanded ? 'bg-card' : ''}`}
              onPress={() => {
                hapticLight();
                onSelect(expanded ? null : climb.index);
              }}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <Text className="text-sm font-semibold text-text-primary">
                    Climb {climb.index + 1}
                  </Text>
                  {climb.category ? (
                    <View className="rounded-full border border-border-strong px-2 py-0.5">
                      <Text className="text-[10px] font-semibold text-text-body">
                        {climb.category}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-sm text-text-body" style={TABULAR_NUMBERS}>
                  {formatClimbDistanceKm(climb.lengthM / 1_000, units.distanceUnits)} ·{' '}
                  {formatClimbElevationM(climb.gainM, units.distanceUnits)}
                </Text>
              </View>
              <View className="mt-1 flex-row justify-between gap-3">
                <Text className="text-xs text-text-body" style={TABULAR_NUMBERS}>
                  {climb.averageGradePct.toFixed(1)}% · {formatDuration(climb.durationSec)} ·{' '}
                  {Math.round(climb.vam)} VAM
                </Text>
                <Text className="text-xs text-text-body" style={TABULAR_NUMBERS}>
                  {metric(climb.averageWatts, 'W')} · {metric(climb.averageCadence, 'rpm')}
                </Text>
              </View>
              {expanded ? (
                <Text className="mt-2 text-xs leading-5 text-text-body" style={TABULAR_NUMBERS}>
                  Starts at {formatClimbDistanceKm(climb.startKm, units.distanceUnits)} · max{' '}
                  {climb.maxGradePct.toFixed(1)}% · {metric(climb.averageHeartrate, 'bpm')}
                  {climb.averageTempC == null
                    ? ''
                    : ` · ${formatTemperatureC(climb.averageTempC, units.temperatureUnits)} average`}
                </Text>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>
      {hiddenCount > 0 ? (
        <Text className="mt-2 text-xs text-text-body">
          Showing the six biggest climbs by gain · {hiddenCount} smaller climbs omitted
        </Text>
      ) : null}
    </View>
  );
}

export function ActivityTerrainAnalysis({ terrain }: { terrain: ActivityTerrainStreams | null }) {
  const analysis = useMemo(
    () => (terrain ? deriveTerrainAnalysis(terrain.points) : null),
    [terrain],
  );
  const profileQuery = useAthleteProfileQuery();
  const units = useMemo<TerrainUnits>(
    () => ({
      distanceUnits: profileQuery.data?.distanceUnits ?? 'Kilometers',
      temperatureUnits: profileQuery.data?.temperatureUnits ?? 'Celsius',
    }),
    [profileQuery.data?.distanceUnits, profileQuery.data?.temperatureUnits],
  );
  const [selectedClimb, setSelectedClimb] = useState<number | null>(null);
  if (!analysis || analysis.profile.length < 3) return null;

  return (
    <>
      <TerrainStrip analysis={analysis} selectedClimb={selectedClimb} units={units} />
      <ClimbLedger
        climbs={analysis.climbs}
        selectedClimb={selectedClimb}
        onSelect={setSelectedClimb}
        units={units}
      />
    </>
  );
}
