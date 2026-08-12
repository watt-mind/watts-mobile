/**
 * Wire encoding for calendar dates the athlete picked as a plain `YYYY-MM-DD`
 * (CW-493).
 *
 * Complementary to `./date.ts`, which goes the opposite direction: `date.ts`
 * derives a calendar key from an instant; this module encodes a calendar key
 * for the wire. The two stay separate on purpose — do not merge them.
 *
 * The old convention anchored those days at UTC noon (`T12:00:00Z`), which is
 * only safe within ±11 hours of UTC: in Pacific/Auckland (UTC+12, +13 in DST)
 * `2026-08-10T12:00:00Z` is already `2026-08-11` locally, so an A-race created
 * for Sunday showed up on Monday. `T23:59:59Z` was worse still — for
 * Asia/Kolkata (UTC+5:30) an Aug 10 deadline landed at 05:29 on Aug 11.
 *
 * There are two correct encodings, and which one applies depends on how the
 * endpoint interprets the instant:
 *
 * - `ymdToWireDate` — UTC midnight. Use for values the API stores verbatim and
 *   hands back as a day marker (event `date`, goal `targetDate`/`eventDate`).
 *   `localDateKey` treats a UTC-midnight timestamp as calendar-stable in every
 *   zone, and the server's own `getUserLocalDate` normalizes to exactly this,
 *   so the day round-trips unchanged. (The events/goals endpoints type these
 *   fields as a plain string and just call `new Date(...)`, so a bare
 *   `YYYY-MM-DD` would also be accepted there — but `/api/plans/initialize`
 *   validates `z.string().datetime()` and would reject it, so a full ISO
 *   instant is used uniformly.)
 * - `ymdToLocalStartOfDayIso` / `ymdToLocalEndOfDayIso` — the instant of local
 *   midnight / local end of day. Use for endpoints that re-derive the calendar
 *   day from the instant using the athlete's stored timezone (plan
 *   `startDate`), where a UTC-anchored instant lands on the wrong day for
 *   negative offsets.
 *
 * All three throw `RangeError` on an unparseable `ymd`, exactly as the
 * `new Date(...).toISOString()` calls they replace did; callers validate the
 * form value first.
 */

function parseYmd(ymd: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) throw new RangeError(`Invalid calendar date: ${ymd}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Calendar day → UTC midnight ISO, the canonical date-only wire value. */
export function ymdToWireDate(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

/** Calendar day → the instant of local midnight on that day. */
export function ymdToLocalStartOfDayIso(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** Calendar day → the instant of local 23:59:59 on that day. */
export function ymdToLocalEndOfDayIso(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  return new Date(y, m - 1, d, 23, 59, 59, 0).toISOString();
}
