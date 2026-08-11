import type { StreamSeries } from '@/src/features/activity/chartTypes';
import {
  elevationUnitLabel,
  kmToDisplayDistance,
  metersToDisplayElevation,
} from '@/src/features/activity/mapActivity';
import { distanceUnitLabel } from '@/src/features/profile/mapProfile';
import type { DistanceUnits } from '@/src/features/profile/types';
import { Colors } from '@/src/theme/colors';

import type {
  MonthlyComparisonPayload,
  MonthlyDayMetrics,
  MonthlyMetric,
  MonthlyProgressSummary,
  MonthlyViewMode,
} from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

function mapDayBucket(raw: unknown): MonthlyDayMetrics {
  const obj = asRecord(raw) || {};
  return {
    tss: asFiniteNumber(obj.tss),
    duration: asFiniteNumber(obj.duration),
    distance: asFiniteNumber(obj.distance),
    elevation: asFiniteNumber(obj.elevation),
    count: asFiniteNumber(obj.count),
  };
}

function mapDayMap(raw: unknown, allowNull = false): Record<number, MonthlyDayMetrics | null> {
  const obj = asRecord(raw) || {};
  const out: Record<number, MonthlyDayMetrics | null> = {};
  for (let day = 1; day <= 31; day++) {
    const entry = obj[String(day)] ?? obj[day];
    if (entry == null) {
      out[day] = allowNull ? null : mapDayBucket({});
      continue;
    }
    out[day] = mapDayBucket(entry);
  }
  return out;
}

export function mapMonthlyComparisonPayload(json: unknown): MonthlyComparisonPayload {
  const root = asRecord(json);
  if (!root) throw new Error('Invalid monthly comparison response');

  const current = asRecord(root.currentMonth) || {};
  const last = asRecord(root.lastMonth) || {};

  return {
    currentMonthName: typeof current.name === 'string' && current.name ? current.name : 'Current',
    lastMonthName: typeof last.name === 'string' && last.name ? last.name : 'Last month',
    todayDay: Math.max(1, Math.min(31, Math.round(asFiniteNumber(root.todayDay) || 1))),
    currentDaily: mapDayMap(current.daily) as Record<number, MonthlyDayMetrics>,
    lastDaily: mapDayMap(last.daily) as Record<number, MonthlyDayMetrics>,
    currentCumulative: mapDayMap(current.cumulative, true),
    lastCumulative: mapDayMap(last.cumulative, true),
  };
}

/**
 * The API always reports metric units (km / m). Distance and elevation are re-expressed
 * in the athlete's `distanceUnits` preference here — before CW-491 this hard-coded 'km'
 * and 'm' with no conversion, so a Miles athlete read a kilometre total labelled "km".
 */
export function metricUnitLabel(
  metric: MonthlyMetric,
  distanceUnits: DistanceUnits = 'Kilometers',
): string {
  switch (metric) {
    case 'duration':
      return 'h';
    case 'distance':
      return distanceUnitLabel(distanceUnits);
    case 'elevation':
      return elevationUnitLabel(distanceUnits);
    case 'count':
      return '';
    default:
      return 'pts';
  }
}

/** Convert one raw (metric) payload value into the athlete's display unit. */
export function toDisplayMetricValue(
  value: number,
  metric: MonthlyMetric,
  distanceUnits: DistanceUnits = 'Kilometers',
): number {
  if (!Number.isFinite(value)) return 0;
  if (metric === 'distance') return kmToDisplayDistance(value, distanceUnits);
  if (metric === 'elevation') return metersToDisplayElevation(value, distanceUnits);
  return value;
}

export function formatMetricValue(
  value: number,
  metric: MonthlyMetric,
  distanceUnits: DistanceUnits = 'Kilometers',
): string {
  const rounded = Math.round(toDisplayMetricValue(value, metric, distanceUnits));
  const label = metricUnitLabel(metric, distanceUnits);
  return label ? `${rounded.toLocaleString()}${label}` : rounded.toLocaleString();
}

export function summarizeMonthlyProgress(
  payload: MonthlyComparisonPayload,
  metric: MonthlyMetric,
  distanceUnits: DistanceUnits = 'Kilometers',
): MonthlyProgressSummary {
  const currentAtToday = payload.currentCumulative[payload.todayDay];
  const lastAtToday = payload.lastCumulative[payload.todayDay];
  const currentTotal = currentAtToday ? currentAtToday[metric] : 0;
  const lastTotal = lastAtToday ? lastAtToday[metric] : 0;
  const percentDiff =
    lastTotal === 0 ? (currentTotal > 0 ? 100 : 0) : ((currentTotal - lastTotal) / lastTotal) * 100;

  return {
    // Totals stay in the payload's metric units; conversion happens at format time so
    // there is exactly one conversion point.
    currentTotal,
    lastTotal,
    percentDiff,
    unitLabel: metricUnitLabel(metric, distanceUnits),
    formattedCurrent: formatMetricValue(currentTotal, metric, distanceUnits),
    formattedLast: formatMetricValue(lastTotal, metric, distanceUnits),
  };
}

export function mapMonthlyChartSeries(
  payload: MonthlyComparisonPayload,
  metric: MonthlyMetric,
  viewMode: MonthlyViewMode,
  distanceUnits: DistanceUnits = 'Kilometers',
): { series: StreamSeries[]; durationSec: number; endDay: number } {
  // Match web MonthlyComparisonCard: x-axis is days 1–31. Current month stops at
  // today; last month keeps the full curve so month-over-month shape is visible.
  const endDay = 31;
  const pointsCurrent: { x: number; y: number }[] = [];
  const pointsLast: { x: number; y: number }[] = [];

  for (let day = 1; day <= endDay; day++) {
    const currentPoint =
      viewMode === 'cumulative' ? payload.currentCumulative[day] : payload.currentDaily[day];
    const lastPoint =
      viewMode === 'cumulative' ? payload.lastCumulative[day] : payload.lastDaily[day];

    if (currentPoint && day <= payload.todayDay) {
      pointsCurrent.push({
        x: day - 1,
        y: toDisplayMetricValue(currentPoint[metric], metric, distanceUnits),
      });
    }
    if (lastPoint) {
      pointsLast.push({
        x: day - 1,
        y: toDisplayMetricValue(lastPoint[metric], metric, distanceUnits),
      });
    }
  }

  const seriesUnit = metricUnitLabel(metric, distanceUnits) || metric.toUpperCase();
  const series: StreamSeries[] = [
    {
      key: 'current',
      label: payload.currentMonthName,
      unit: seriesUnit,
      color: Colors.brand,
      points: pointsCurrent,
    },
    {
      key: 'last',
      label: payload.lastMonthName,
      unit: seriesUnit,
      color: Colors.textMuted,
      points: pointsLast,
    },
  ].filter((s) => s.points.length > 0);

  return { series, durationSec: Math.max(endDay - 1, 1), endDay };
}

export function formatSportLabel(sport: string): string {
  return sport
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

export function dashboardWebPath(): string {
  return '/dashboard';
}

export function formatDeltaPercent(percentDiff: number): string {
  const abs = Math.abs(percentDiff);
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  const sign = percentDiff > 0 ? '+' : percentDiff < 0 ? '−' : '';
  return `${sign}${rounded}%`;
}
