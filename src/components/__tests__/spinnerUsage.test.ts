import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `src/components/Spinner.tsx` exists so a loading spinner picks up
 * `brandOnSurface` per theme rather than the theme-invariant brand fill —
 * #00DC82 on light #fafafa is 1.74:1, so a raw
 * `<ActivityIndicator color={Colors.brand} />` is nearly invisible in light
 * mode. Twelve call sites had re-derived that tint by hand (CW-356); nothing
 * stopped the thirteenth from getting it wrong.
 *
 * This is the guardrail: every `<ActivityIndicator>` under `app/` and `src/`
 * must go through `Spinner`, except the entries explicitly listed below.
 * Follows the source-scanning pattern of `appSymbolCoverage.test.ts` — vitest
 * runs in `environment: 'node'`, so a test can read files off disk but cannot
 * render RN components.
 */

const ROOTS = ['app', 'src'];

/**
 * Files permitted to render a raw `<ActivityIndicator>`, each with the reason
 * it cannot go through `Spinner`. Adding an entry here is a deliberate act —
 * prefer `<Spinner />` (or a new `tone` on it) over a new exemption.
 */
const ALLOWLIST = new Map<string, string>([
  ['src/components/Spinner.tsx', 'The component itself — this is the one sanctioned usage.'],
  [
    'src/components/Button.tsx',
    'Deliberate exception: the spinner sits on a filled button, not on a surface, so it tints ' +
      'from `spinnerByVariant[variant]`. `brandOnSurface` would be wrong against the fill.',
  ],
  [
    'src/features/coach/CoachChat.tsx',
    'Deliberate exception, two spinners, neither a surface foreground: the dictation button ' +
      'changes its own fill, so its spinner needs ink on the brand fill and `brandOnSurface` on ' +
      '`bg-card` (the `Button.tsx` case); and the tool-progress chip tints per tool domain, a ' +
      'data-driven hue that must match the glyph beside it.',
  ],
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Raw `<ActivityIndicator …>` elements in a source string. */
export function countRawUsages(source: string): number {
  return [...source.matchAll(/<ActivityIndicator\b/g)].length;
}

/** Normalised repo-relative path, so the allowlist reads the same on any OS. */
function posix(file: string): string {
  return file.split(sep).join('/');
}

function scan(): { file: string; count: number }[] {
  const found: { file: string; count: number }[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const count = countRawUsages(readFileSync(file, 'utf8'));
      if (count > 0) found.push({ file: posix(file), count });
    }
  }
  return found;
}

/** The pure rule under test: which scanned files are not exempt. */
export function offenders(files: { file: string; count: number }[]): string[] {
  return files
    .filter(({ file, count }) => count > 0 && !ALLOWLIST.has(file))
    .map(({ file }) => file)
    .sort();
}

describe('Spinner usage guardrail', () => {
  it('routes every ActivityIndicator through Spinner outside the allowlist', () => {
    const scanned = scan();

    // A broken directory walk would make this test vacuously pass.
    expect(scanned.length).toBeGreaterThanOrEqual(ALLOWLIST.size);

    expect(offenders(scanned)).toEqual([]);
  });

  it('catches a raw ActivityIndicator reintroduced into a non-allowlisted file', () => {
    const reintroduced = [
      { file: 'src/features/nutrition/NutritionTargetsCard.tsx', count: 1 },
      { file: 'src/components/Spinner.tsx', count: 1 },
    ];

    expect(offenders(reintroduced)).toEqual(['src/features/nutrition/NutritionTargetsCard.tsx']);
    expect(countRawUsages('<ActivityIndicator color={Colors.brand} />')).toBe(1);
    expect(countRawUsages('<Spinner />')).toBe(0);
  });

  it('keeps the allowlist free of stale entries', () => {
    const withUsages = new Set(scan().map(({ file }) => file));
    const stale = [...ALLOWLIST.keys()].filter((file) => !withUsages.has(file)).sort();

    expect(stale).toEqual([]);
  });
});
