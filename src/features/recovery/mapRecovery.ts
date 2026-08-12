import { localDateYmd } from '@/src/lib/date';

import {
  DESCRIPTION_MAX,
  findOptionForCategoryType,
  optionById,
  severityPresetFromValue,
  severityValueFromPreset,
  type JourneyEventOption,
} from './taxonomy';
import type {
  JourneyEventPayload,
  RecoveryContextItem,
  RecoveryEventFormValues,
  TimePresetId,
} from './types';

export function toLocalDateTimeValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Strictly parses a `YYYY-MM-DDTHH:mm` local datetime string.
 *
 * Returns `null` on malformed input or a calendar-invalid date (e.g.
 * `2026-02-30T10:00`, `2026-13-01T00:00`) instead of silently falling back to
 * "now" — callers must surface a validation error rather than save a wrong
 * timestamp.
 */
export function fromLocalDateTimeValue(value: string): Date | null {
  const match = LOCAL_DATETIME_RE.exec(value.trim());
  if (!match) return null;
  const [, yStr, mStr, dStr, hStr, minStr] = match;
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const hour = Number(hStr);
  const minute = Number(minStr);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  return isValid ? date : null;
}

export function isLocalTimestampValid(value: string): boolean {
  return fromLocalDateTimeValue(value) !== null;
}

function setLocalTime(base: Date, hour: number, minute: number): Date {
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function applyTimePreset(preset: TimePresetId, now = new Date()): string {
  if (preset === 'custom') {
    return toLocalDateTimeValue(now);
  }
  if (preset === 'now') {
    return toLocalDateTimeValue(now);
  }
  if (preset === 'earlier-today') {
    return toLocalDateTimeValue(setLocalTime(now, 8, 0));
  }
  // yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return toLocalDateTimeValue(setLocalTime(yesterday, 9, 0));
}

export function emptyRecoveryEventForm(now = new Date()): RecoveryEventFormValues {
  return {
    optionId: 'fatigue',
    severityPreset: 'moderate',
    timePreset: 'now',
    localTimestamp: toLocalDateTimeValue(now),
    description: '',
  };
}

/**
 * Resolves the taxonomy option (title, icon, category) for a server-provided
 * recovery context item.
 *
 * `item.label` is free display text chosen by the server, **not** a
 * `JourneyEventOptionId` — looking an option up by label makes `optionById`
 * miss and silently return its first entry (illness / 🌡️) for nearly every
 * item. Always resolve through the structured `category` + `metadata.eventType`
 * pair instead. Returns a stable option even when both are absent.
 */
export function recoveryItemOption(item: RecoveryContextItem): JourneyEventOption {
  const eventType =
    typeof item.metadata?.eventType === 'string' ? item.metadata.eventType : undefined;
  return findOptionForCategoryType(item.category, eventType);
}

export function formFromRecoveryItem(item: RecoveryContextItem): RecoveryEventFormValues {
  const option = recoveryItemOption(item);
  return {
    optionId: option.id,
    severityPreset: severityPresetFromValue(item.severity),
    timePreset: 'custom',
    localTimestamp: toLocalDateTimeValue(new Date(item.startAt)),
    description: item.description ?? '',
  };
}

export function clampDescription(description: string): string {
  return description.trim().slice(0, DESCRIPTION_MAX);
}

export function toJourneyPayload(values: RecoveryEventFormValues): JourneyEventPayload {
  const option = optionById(values.optionId);
  const description = clampDescription(values.description);
  const timestamp = fromLocalDateTimeValue(values.localTimestamp);
  if (!timestamp) {
    throw new Error('Invalid recovery event timestamp');
  }
  const payload: JourneyEventPayload = {
    timestamp: timestamp.toISOString(),
    eventType: option.eventType,
    category: option.category,
    severity: severityValueFromPreset(values.severityPreset),
  };
  if (description) payload.description = description;
  return payload;
}

export function isDescriptionValid(description: string): boolean {
  return description.length <= DESCRIPTION_MAX;
}

export function parseRecoveryContextItem(raw: unknown): RecoveryContextItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.sourceRecordId !== 'string') return null;
  if (typeof r.startAt !== 'string' || typeof r.endAt !== 'string') return null;

  const kind = r.kind;
  if (kind !== 'wellness' && kind !== 'journey_event' && kind !== 'daily_checkin') return null;

  const sourceType = r.sourceType;
  if (
    sourceType !== 'imported' &&
    sourceType !== 'manual_event' &&
    sourceType !== 'daily_checkin'
  ) {
    return null;
  }

  return {
    id: r.id,
    sourceRecordId: r.sourceRecordId,
    kind,
    sourceType,
    label: typeof r.label === 'string' ? r.label : 'Recovery context',
    description: typeof r.description === 'string' ? r.description : null,
    severity: typeof r.severity === 'number' ? r.severity : null,
    startAt: r.startAt,
    endAt: r.endAt,
    editable: Boolean(r.editable),
    deletable: Boolean(r.deletable),
    origin: typeof r.origin === 'string' ? r.origin : '',
    category: typeof r.category === 'string' ? r.category : null,
    metadata:
      r.metadata && typeof r.metadata === 'object'
        ? (r.metadata as Record<string, unknown>)
        : undefined,
  };
}

export function parseRecoveryContextList(raw: unknown): RecoveryContextItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseRecoveryContextItem).filter((item): item is RecoveryContextItem => !!item);
}

/**
 * Items active on the athlete's local calendar day.
 *
 * Journey events are point-in-time timestamps (startAt === endAt) — use the
 * device-local calendar day of the timestamp so early/late local hours are not
 * dropped when the UTC date portion differs.
 *
 * Wellness periods and daily check-ins are calendar-day anchors stored as UTC
 * midnights — compare the UTC date portion (same as web activeToday).
 */
export function filterActiveToday(
  items: RecoveryContextItem[],
  today = localDateYmd(),
): RecoveryContextItem[] {
  return items.filter((item) => {
    if (item.kind === 'journey_event') {
      return localDateYmd(new Date(item.startAt)) === today;
    }
    const start = item.startAt.slice(0, 10);
    const end = item.endAt.slice(0, 10);
    return start <= today && end >= today;
  });
}

export function eventTypeBadgeLabel(eventType: string): string {
  if (eventType === 'RECOVERY_NOTE') return 'Recovery note';
  if (eventType === 'WELLNESS_CHECK') return 'Wellness check';
  return 'Symptom';
}

export function formatRecoveryDate(startAt: string, today = localDateYmd()): string {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return startAt;
  const eventDate = localDateYmd(d);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (eventDate === today) {
    return `Today at ${time}`;
  }

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (eventDate === localDateYmd(yesterdayDate)) {
    return `Yesterday at ${time}`;
  }

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
