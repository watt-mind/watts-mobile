/**
 * Timezone helpers for tests.
 *
 * Date bugs in this app are almost always *local-calendar* bugs: they are
 * invisible on a UTC CI runner and only show up in a zone that observes DST
 * (America/New_York) or sits at an extreme positive offset (Pacific/Auckland).
 *
 * `vitest.config.ts` pins `TZ=UTC` (via `test.env`) for the default run so results are
 * deterministic, and `withTimeZone` lets an individual test opt into another
 * zone so the regression is asserted on every `pnpm test` — no separate run
 * required. `pnpm test:tz` additionally re-runs the whole suite under those
 * zones to catch date assumptions nobody thought to pin.
 *
 * Safety: vitest's default `forks` pool gives each test file its own child
 * process and tests inside a file run sequentially, so mutating
 * `process.env.TZ` here cannot leak into another file. Do not use these
 * helpers inside `test.concurrent`.
 */

/** DST-observing, negative offset (UTC-5 / UTC-4). */
export const TZ_NEW_YORK = 'America/New_York';
/** Extreme positive offset (UTC+12 / UTC+13 in DST). */
export const TZ_AUCKLAND = 'Pacific/Auckland';
/** Half-hour positive offset (UTC+5:30), no DST. */
export const TZ_KOLKATA = 'Asia/Kolkata';

/** Zones every date-sensitive helper should behave correctly in. */
export const CRITICAL_TIME_ZONES = ['UTC', TZ_NEW_YORK, TZ_AUCKLAND, TZ_KOLKATA] as const;

/**
 * Run `fn` with `process.env.TZ` pinned to `timeZone`, restoring the previous
 * value afterwards. Node re-reads `process.env.TZ` on the next `Date` call, so
 * this affects local-time arithmetic inside `fn`.
 */
export function withTimeZone<T>(timeZone: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    // Sanity check: a runtime that silently ignored TZ would make every
    // timezone assertion below vacuously pass. `Intl` throws RangeError on an
    // unknown zone; the offset comparison catches a TZ that did not take.
    // (Note: `resolvedOptions().timeZone` may report a canonical alias, e.g.
    // Asia/Kolkata → Asia/Calcutta, so it is not compared by name.)
    Intl.DateTimeFormat('en-US', { timeZone });
    if (timeZone !== 'UTC' && new Date().getTimezoneOffset() === 0) {
      throw new Error(`Time zone ${timeZone} did not take effect (still at UTC offset)`);
    }
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
