import { describe, expect, it } from 'vitest';

import {
  formatDeltaPercent,
  formatMetricValue,
  mapMonthlyChartSeries,
  mapMonthlyComparisonPayload,
  metricUnitLabel,
  summarizeMonthlyProgress,
  toDisplayMetricValue,
} from '../mapMonthlyComparison';

function day(tss: number) {
  return { tss, duration: 0, distance: 0, elevation: 0, count: 1 };
}

function cum(tss: number) {
  return { tss, duration: 0, distance: 0, elevation: 0, count: 0 };
}

describe('mapMonthlyComparisonPayload / summarizeMonthlyProgress', () => {
  it('maps payload and computes month-to-date delta', () => {
    const payload = mapMonthlyComparisonPayload({
      todayDay: 10,
      currentMonth: {
        name: 'July',
        daily: { 10: day(50) },
        cumulative: {
          10: { tss: 400, duration: 12, distance: 100, elevation: 1000, count: 8 },
        },
      },
      lastMonth: {
        name: 'June',
        daily: { 10: day(40) },
        cumulative: {
          10: { tss: 320, duration: 10, distance: 80, elevation: 800, count: 7 },
        },
      },
    });

    expect(payload.currentMonthName).toBe('July');
    expect(payload.todayDay).toBe(10);

    const summary = summarizeMonthlyProgress(payload, 'tss');
    expect(summary.currentTotal).toBe(400);
    expect(summary.lastTotal).toBe(320);
    expect(summary.percentDiff).toBeCloseTo(25);
    expect(summary.unitLabel).toBe('pts');
    expect(summary.formattedCurrent).toBe('400pts');
    expect(formatDeltaPercent(summary.percentDiff)).toBe('+25%');
  });

  it('honours the Miles preference for distance and elevation totals (CW-491)', () => {
    const payload = mapMonthlyComparisonPayload({
      todayDay: 10,
      currentMonth: {
        name: 'July',
        cumulative: {
          10: { tss: 400, duration: 12, distance: 412, elevation: 1200, count: 8 },
        },
      },
      lastMonth: {
        name: 'June',
        cumulative: {
          10: { tss: 320, duration: 10, distance: 320, elevation: 900, count: 7 },
        },
      },
    });

    const km = summarizeMonthlyProgress(payload, 'distance', 'Kilometers');
    expect(km.unitLabel).toBe('km');
    expect(km.formattedCurrent).toBe('412km');

    const mi = summarizeMonthlyProgress(payload, 'distance', 'Miles');
    expect(mi.unitLabel).toBe('mi');
    expect(mi.formattedCurrent).toBe('256mi');
    // Raw totals stay in payload (metric) units — conversion happens at format time.
    expect(mi.currentTotal).toBe(412);
    // A ratio is unit-invariant, so the delta must not move.
    expect(mi.percentDiff).toBeCloseTo(km.percentDiff);

    const elevM = summarizeMonthlyProgress(payload, 'elevation', 'Kilometers');
    expect(elevM.unitLabel).toBe('m');
    expect(elevM.formattedCurrent).toBe('1,200m');

    const elevFt = summarizeMonthlyProgress(payload, 'elevation', 'Miles');
    expect(elevFt.unitLabel).toBe('ft');
    expect(elevFt.formattedCurrent).toBe('3,937ft');
  });

  it('leaves non-distance metrics untouched in both unit systems', () => {
    for (const metric of ['tss', 'duration', 'count'] as const) {
      expect(toDisplayMetricValue(42, metric, 'Miles')).toBe(42);
      expect(metricUnitLabel(metric, 'Miles')).toBe(metricUnitLabel(metric, 'Kilometers'));
    }
    expect(formatMetricValue(12, 'duration', 'Miles')).toBe('12h');
    expect(formatMetricValue(8, 'count', 'Miles')).toBe('8');
  });

  it('uses 100% when last month is zero and current has volume', () => {
    const payload = mapMonthlyComparisonPayload({
      todayDay: 5,
      currentMonth: {
        name: 'July',
        cumulative: {
          5: { tss: 100, duration: 2, distance: 0, elevation: 0, count: 2 },
        },
      },
      lastMonth: {
        name: 'June',
        cumulative: {
          5: { tss: 0, duration: 0, distance: 0, elevation: 0, count: 0 },
        },
      },
    });
    expect(summarizeMonthlyProgress(payload, 'tss').percentDiff).toBe(100);
  });
});

describe('mapMonthlyChartSeries', () => {
  it('keeps last month cumulative through the full month while current stops at today', () => {
    const currentCumulative: Record<number, ReturnType<typeof cum> | null> = {};
    const lastCumulative: Record<number, ReturnType<typeof cum>> = {};
    for (let d = 1; d <= 31; d++) {
      currentCumulative[d] = d <= 20 ? cum(d * 10) : null;
      lastCumulative[d] = cum(d * 8);
    }

    const payload = mapMonthlyComparisonPayload({
      todayDay: 20,
      currentMonth: { name: 'July', cumulative: currentCumulative },
      lastMonth: { name: 'June', cumulative: lastCumulative },
    });

    const chart = mapMonthlyChartSeries(payload, 'tss', 'cumulative');
    const current = chart.series.find((s) => s.key === 'current');
    const last = chart.series.find((s) => s.key === 'last');

    expect(chart.endDay).toBe(31);
    expect(chart.durationSec).toBe(30);
    expect(current?.points).toHaveLength(20);
    expect(current?.points.at(-1)).toEqual({ x: 19, y: 200 });
    expect(last?.points).toHaveLength(31);
    expect(last?.points.at(-1)).toEqual({ x: 30, y: 248 });
  });

  it('converts chart points and the series unit for a Miles athlete (CW-491)', () => {
    const currentCumulative: Record<number, ReturnType<typeof cum> | null> = {};
    const lastCumulative: Record<number, ReturnType<typeof cum>> = {};
    for (let d = 1; d <= 31; d++) {
      const bucket = { tss: 0, duration: 0, distance: d * 10, elevation: 0, count: 0 };
      currentCumulative[d] = d <= 20 ? bucket : null;
      lastCumulative[d] = bucket;
    }
    const payload = mapMonthlyComparisonPayload({
      todayDay: 20,
      currentMonth: { name: 'July', cumulative: currentCumulative },
      lastMonth: { name: 'June', cumulative: lastCumulative },
    });

    const kmChart = mapMonthlyChartSeries(payload, 'distance', 'cumulative', 'Kilometers');
    expect(kmChart.series[0]!.unit).toBe('km');
    expect(kmChart.series[0]!.points.at(-1)!.y).toBeCloseTo(200);

    const miChart = mapMonthlyChartSeries(payload, 'distance', 'cumulative', 'Miles');
    expect(miChart.series.every((s) => s.unit === 'mi')).toBe(true);
    expect(miChart.series[0]!.points.at(-1)!.y).toBeCloseTo(124.274, 2);
  });

  it('keeps last month daily through the full month while current stops at today', () => {
    const currentDaily: Record<number, ReturnType<typeof day>> = {};
    const lastDaily: Record<number, ReturnType<typeof day>> = {};
    for (let d = 1; d <= 31; d++) {
      currentDaily[d] = day(d <= 10 ? 20 : 0);
      lastDaily[d] = day(d <= 28 ? 15 : 0);
    }

    const payload = mapMonthlyComparisonPayload({
      todayDay: 10,
      currentMonth: { name: 'July', daily: currentDaily, cumulative: {} },
      lastMonth: { name: 'June', daily: lastDaily, cumulative: {} },
    });

    const chart = mapMonthlyChartSeries(payload, 'tss', 'daily');
    const current = chart.series.find((s) => s.key === 'current');
    const last = chart.series.find((s) => s.key === 'last');

    expect(current?.points).toHaveLength(10);
    expect(last?.points).toHaveLength(31);
    expect(last?.points.at(-1)?.x).toBe(30);
  });
});
