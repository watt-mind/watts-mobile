import type { DistanceUnits, WeightUnits } from '@/src/features/profile/types';
import { LBS_TO_KG } from '@/src/features/profile/mapProfile';
import { parseDecimal } from '@/src/lib/parseDecimal';

import { findMetricOption, metricCategoryFor, slugifyCustomMetric } from './catalog';
import type {
  BodyMeasurementEntry,
  BodyMeasurementsSnapshot,
  CanonicalUnit,
  CreateBodyMeasurementPayload,
  MeasurementFormValues,
} from './types';

const CM_PER_INCH = 2.54;

export function emptyMeasurementForm(metricKey = 'waist'): MeasurementFormValues {
  return {
    metricKey,
    customName: '',
    customUnit: 'cm',
    value: '',
    notes: '',
  };
}

/**
 * Parse the measurement value field (CW-555).
 *
 * Every numeric field here is `keyboardType="decimal-pad"`, whose only decimal
 * key emits `,` on a comma-decimal device. Raw `Number('72,5')` was `NaN`, which
 * made `measurementFormHasContent` report "no content" and silently greyed out
 * the Save button with no error. Route through the shared `parseDecimal` so
 * `72,5` and grouped input (`1 234,5`, `1.234,56`) parse, while genuinely
 * invalid text still returns `null`.
 */
function parseMeasurementValue(value: string): number | null {
  return parseDecimal(value.trim());
}

export function measurementFormHasContent(form: MeasurementFormValues): boolean {
  if (!form.value.trim()) return false;
  if (form.metricKey === 'custom' && !form.customName.trim()) return false;
  return parseMeasurementValue(form.value) != null;
}

function asCanonicalUnit(value: unknown): CanonicalUnit {
  if (value === 'kg' || value === 'cm' || value === 'pct') return value;
  return 'cm';
}

function parseEntry(raw: unknown): BodyMeasurementEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.metricKey !== 'string') return null;
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return null;
  if (typeof r.recordedAt !== 'string') return null;
  return {
    id: r.id,
    metricKey: r.metricKey,
    displayName: typeof r.displayName === 'string' ? r.displayName : null,
    value: r.value,
    unit: asCanonicalUnit(r.unit),
    recordedAt: r.recordedAt,
    source: typeof r.source === 'string' ? r.source : 'unknown',
    notes: typeof r.notes === 'string' ? r.notes : null,
  };
}

export function parseBodyMeasurementsResponse(json: unknown): BodyMeasurementsSnapshot {
  if (!json || typeof json !== 'object') {
    return { items: [], latestByMetric: [] };
  }
  const root = json as Record<string, unknown>;
  const items = Array.isArray(root.items)
    ? root.items.map(parseEntry).filter((e): e is BodyMeasurementEntry => e != null)
    : [];

  const latestMap =
    root.latestByMetric && typeof root.latestByMetric === 'object'
      ? (root.latestByMetric as Record<string, unknown>)
      : {};
  const latestByMetric = Object.values(latestMap)
    .map(parseEntry)
    .filter((e): e is BodyMeasurementEntry => e != null)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  return { items, latestByMetric };
}

export function prefersImperialLength(distanceUnits: DistanceUnits): boolean {
  return distanceUnits === 'Miles';
}

export function prefersImperialMass(weightUnits: WeightUnits): boolean {
  return weightUnits === 'Pounds';
}

export function displayUnitLabel(
  metricKey: string,
  canonicalUnit: CanonicalUnit,
  opts: { weightUnits: WeightUnits; distanceUnits: DistanceUnits },
): string {
  const category = metricCategoryFor(metricKey, canonicalUnit);
  if (category === 'mass') return prefersImperialMass(opts.weightUnits) ? 'lbs' : 'kg';
  if (category === 'percent') return '%';
  if (category === 'height' || category === 'length') {
    return prefersImperialLength(opts.distanceUnits) ? 'in' : 'cm';
  }
  return canonicalUnit;
}

export function toDisplayValue(
  value: number,
  metricKey: string,
  canonicalUnit: CanonicalUnit,
  opts: { weightUnits: WeightUnits; distanceUnits: DistanceUnits },
): number {
  const category = metricCategoryFor(metricKey, canonicalUnit);
  if (category === 'mass' && prefersImperialMass(opts.weightUnits)) {
    return Number((value / LBS_TO_KG).toFixed(1));
  }
  if (
    (category === 'length' || category === 'height') &&
    prefersImperialLength(opts.distanceUnits)
  ) {
    return Number((value / CM_PER_INCH).toFixed(1));
  }
  if (category === 'percent') return Number(value.toFixed(1));
  return Number(value.toFixed(1));
}

export function fromDisplayValue(
  displayValue: number,
  metricKey: string,
  canonicalUnit: CanonicalUnit,
  opts: { weightUnits: WeightUnits; distanceUnits: DistanceUnits },
): number {
  const category = metricCategoryFor(metricKey, canonicalUnit);
  if (category === 'mass' && prefersImperialMass(opts.weightUnits)) {
    return Number((displayValue * LBS_TO_KG).toFixed(2));
  }
  if (
    (category === 'length' || category === 'height') &&
    prefersImperialLength(opts.distanceUnits)
  ) {
    return Number((displayValue * CM_PER_INCH).toFixed(2));
  }
  return Number(displayValue.toFixed(2));
}

export function formatMetricName(entry: BodyMeasurementEntry): string {
  const known = findMetricOption(entry.metricKey);
  if (known && known.key !== 'custom') return known.label;
  if (entry.displayName?.trim()) return entry.displayName.trim();
  return entry.metricKey.replace(/^custom:/, '').replace(/_/g, ' ');
}

export function formatSource(source: string): string {
  if (source === 'manual_measurement') return 'Manual';
  if (source === 'profile_manual' || source === 'profile') return 'Profile';
  if (source.startsWith('oauth:') || source === 'oauth') return 'Connected';
  if (source.includes('wellness')) return 'Wellness';
  return source.replace(/_/g, ' ');
}

export function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toCreatePayload(
  form: MeasurementFormValues,
  opts: { weightUnits: WeightUnits; distanceUnits: DistanceUnits },
): CreateBodyMeasurementPayload | null {
  const display = parseMeasurementValue(form.value);
  if (display == null || display <= 0) return null;

  const isCustom = form.metricKey === 'custom';
  const option = findMetricOption(form.metricKey);
  const unit: CanonicalUnit = isCustom ? form.customUnit : (option?.unit ?? 'cm');
  const metricKey = isCustom
    ? `custom:${slugifyCustomMetric(form.customName) || 'metric'}`
    : form.metricKey;

  return {
    recordedAt: new Date().toISOString(),
    metricKey,
    displayName: isCustom ? form.customName.trim() : null,
    value: fromDisplayValue(display, metricKey, unit, opts),
    unit,
    notes: form.notes.trim() || null,
  };
}

export function measurementsWebPath(): string {
  return '/profile/settings?tab=measurements';
}
