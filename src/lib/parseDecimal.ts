/**
 * Locale-tolerant decimal parsing for user-entered text (CW-484).
 *
 * Every numeric form field in the app uses `keyboardType="decimal-pad"`. On a
 * comma-decimal device (hu, de, fr, pt, es, ...) that keyboard's only decimal
 * key emits `,`, so `Number("27,5")` is `NaN`. Combined with `|| 0` fallbacks
 * that silently wrote ZERO grams to the server, or with "omit when NaN" logic
 * that silently dropped a weigh-in.
 *
 * `parseDecimal` normalises the separators and REJECTS anything it cannot
 * understand by returning `null`. A failed parse must never be indistinguishable
 * from a real zero — callers decide whether to show a validation error, keep the
 * previous value, or omit the field.
 *
 * Separator rules (decimal-pad only ever exposes ONE separator key, so a single
 * separator is always the decimal point):
 *  - `"27,5"` / `"27.5"`      → 27.5   (single separator = decimal)
 *  - `"1,234.56"` / `"1.234,56"` → 1234.56 (mixed: the LAST separator is decimal,
 *                                 the other type is a thousands grouping)
 *  - `"1,234,567"`            → 1234567 (repeated single type = grouping only)
 *  - `"1 234,5"` / NBSP / thin space → 1234.5 (space grouping stripped)
 *  - `",5"` → 0.5, `"5,"` → 5 (leading/trailing separator tolerated — a partially
 *    typed value should not read as invalid mid-keystroke)
 *  - `""`, `"   "`, `"abc"`, `"1,2,3.4"`, `"1e5"`, `"NaN"`, `"Infinity"` → null
 */

/** Spaces usable as thousands separators (incl. NBSP / narrow NBSP / thin space). */
const GROUPING_SPACES = /[\s   ]/g;

/** Plain decimal number after normalisation. Rejects exponents, hex, Infinity. */
const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Parse user-entered numeric text into a finite number.
 * Returns `null` for empty or unparseable input — never a silent 0.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  const compact = input.replace(GROUPING_SPACES, '');
  if (!compact) return null;

  const commas = countOf(compact, ',');
  const dots = countOf(compact, '.');

  let normalized: string;
  if (commas > 0 && dots > 0) {
    // Mixed separators: the last one is the decimal, the other type is grouping.
    const decimalSep = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.';
    const groupingSep = decimalSep === ',' ? '.' : ',';
    // More than one decimal separator is not a format we can trust.
    if (countOf(compact, decimalSep) > 1) return null;
    const [intPart = '', fracPart = ''] = compact.split(decimalSep);
    if (fracPart.includes(groupingSep)) return null;
    const ungrouped = stripGrouping(intPart, groupingSep);
    if (ungrouped == null) return null;
    normalized = `${ungrouped}.${fracPart}`;
  } else if (commas > 1 || dots > 1) {
    // Repeated single separator = thousands grouping (e.g. "1,234,567").
    const ungrouped = stripGrouping(compact, commas > 1 ? ',' : '.');
    if (ungrouped == null) return null;
    normalized = ungrouped;
  } else {
    normalized = compact.replace(',', '.');
  }

  if (!DECIMAL_RE.test(normalized)) return null;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** `parseDecimal`, but also rejects negative values. */
export function parseNonNegativeDecimal(input: string | null | undefined): number | null {
  const n = parseDecimal(input);
  return n == null || n < 0 ? null : n;
}

/**
 * Remove a thousands separator from an integer part, but only when the grouping
 * is well formed (`1,234,567`). Returns null for nonsense like `1,2,3`.
 */
function stripGrouping(intPart: string, sep: string): string | null {
  if (!intPart.includes(sep)) return intPart;
  const escaped = sep === '.' ? '\\.' : sep;
  const pattern = new RegExp(`^[+-]?\\d{1,3}(?:${escaped}\\d{3})+$`);
  if (!pattern.test(intPart)) return null;
  return intPart.split(sep).join('');
}

function countOf(value: string, char: string): number {
  let count = 0;
  for (const c of value) if (c === char) count += 1;
  return count;
}
