/**
 * Local-calendar derivation: turning an *instant* into the athlete's calendar
 * day, and Monday-start week math over those days (CW-355).
 *
 * Before this module the same `getFullYear()`/`padStart(2, '0')` body existed
 * in six places and Monday-start week math in four, so a DST or locale fix
 * landed in one copy never reached the others — Today, Plan and Nutrition
 * could disagree about "today" for the same wall clock. CW-285, CW-485,
 * CW-492 and CW-493 were all that same drift class, each patched one copy at
 * a time.
 *
 * Complementary to `./wireDate.ts`, which goes the *opposite* direction:
 * `date.ts` derives a calendar key from an instant; `wireDate.ts` encodes a
 * calendar key the athlete picked into an instant for the wire. The two stay
 * separate on purpose — do not merge them.
 *
 * Two invariants that look like accidents and are not:
 *
 * - The `T12:00:00` noon anchor in `dateKeysInRange` is what makes the cursor
 *   loop DST-safe. Anchored at midnight, a spring-forward day advanced by
 *   `setDate(+1)` can land back on the same calendar day (or skip one);
 *   starting from noon leaves ±1h of slack either side. Do not "simplify" it.
 * - `nextMondayYmd` deliberately does NOT share the pivot used by
 *   `weekRangeContaining`/`weekRangeFromOffset`. Those snap *back* to the
 *   Monday of the current week; `nextMondayYmd` moves *forward* to a future
 *   Monday and, when today is already Monday, returns the Monday a week out.
 *   Both rules are load-bearing; they are kept distinct.
 */

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|[+-]00:?00)?)?$/;

/** Local calendar key YYYY-MM-DD. Date-only strings stay calendar-stable (not UTC midnight). */
export function localDateKey(input: string | Date | null | undefined): string | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const dateOnly = DATE_ONLY_RE.exec(trimmed);
    if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (Number.isNaN(input.getTime())) return null;
  const y = input.getFullYear();
  const m = String(input.getMonth() + 1).padStart(2, '0');
  const day = String(input.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Local calendar key for a known-good `Date` (defaults to now).
 *
 * The non-null "today" form the mappers want. Unlike `localDateKey` it takes
 * only a `Date` and always returns a string — an invalid `Date` yields
 * `NaN-NaN-NaN` rather than `null`, matching the behaviour of the six copies
 * this replaces.
 */
export function localDateYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday-start week containing `now` (local). */
export function weekRangeContaining(now = new Date()): { start: Date; end: Date; keys: string[] } {
  const today = startOfLocalDay(now);
  const day = today.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addLocalDays(today, mondayOffset);
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    keys.push(localDateKey(addLocalDays(start, i))!);
  }
  return { start, end: addLocalDays(start, 6), keys };
}

/**
 * Monday-start week `weekOffset` weeks from the one containing `now`, as YMD
 * strings. `0` is the current week, `-1` the previous, `+1` the next.
 */
export function weekRangeFromOffset(
  weekOffset: number,
  now = new Date(),
): { start: string; end: string } {
  const day = now.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + mondayOffset + weekOffset * 7,
  );
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: localDateYmd(monday), end: localDateYmd(sunday) };
}

/**
 * Inclusive local day keys from `startYmd` to `endYmd`, capped at 14.
 *
 * Anchored at local noon so a DST transition inside the range cannot make the
 * cursor repeat or skip a day. The 14-key cap bounds a malformed range.
 */
export function dateKeysInRange(startYmd: string, endYmd: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startYmd}T12:00:00`);
  const endDate = new Date(`${endYmd}T12:00:00`);
  while (cursor <= endDate && keys.length < 14) {
    keys.push(localDateYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Next Monday after `from` (if today is Monday, returns next week). */
export function nextMondayYmd(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay();
  const daysUntil = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + daysUntil);
  return localDateYmd(d);
}
