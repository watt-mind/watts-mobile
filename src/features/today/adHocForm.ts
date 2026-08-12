import { parseDecimal } from '@/src/lib/parseDecimal';

import type { AdHocWorkoutRequest } from './adHocApi';

/**
 * Pure validation shared with CreateAdHocWorkoutSheet submit rules.
 *
 * The duration field is a `decimal-pad`, whose only decimal key emits `,` on a
 * comma-decimal device — `Number('45,5')` was NaN, so a perfectly good duration was
 * rejected as "greater than zero" (CW-556). `parseDecimal` (CW-484) handles the
 * separator and still returns null for genuinely unparseable text.
 */
export function validateAdHocForm(input: {
  type: AdHocWorkoutRequest['type'];
  durationText: string;
  intensity: AdHocWorkoutRequest['intensity'];
  notes: string;
}): { ok: true; payload: AdHocWorkoutRequest } | { ok: false; error: string } {
  const durationMinutes = parseDecimal(input.durationText);
  if (durationMinutes == null || durationMinutes <= 0) {
    return { ok: false, error: 'Enter a duration greater than zero.' };
  }
  const roundedMinutes = Math.round(durationMinutes);
  if (roundedMinutes < 1) {
    return { ok: false, error: 'Enter a duration of at least 1 minute.' };
  }
  return {
    ok: true,
    payload: {
      type: input.type,
      durationMinutes: roundedMinutes,
      intensity: input.intensity,
      notes: input.notes.trim(),
    },
  };
}
