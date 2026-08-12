import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Android has no SF Symbols: an `AppSymbol` whose `sf` is missing from SF_TO_MD
 * silently renders its text `fallback` instead of an icon, which only shows up
 * when someone looks at an Android build. Guard the map instead.
 *
 * Symbol names reach `AppSymbol` two ways, and both are scanned here:
 *  1. Literally, on the JSX element — `<AppSymbol sf="bell" />`.
 *  2. Indirectly, through a lookup/data table — `{ sf: 'fork.knife', … }` in
 *     `src/features/recovery/taxonomy.ts`, rendered later as `sf={option.sf}`.
 * Scanning only (1) is how `fork.knife` stayed unmapped with this file green
 * (CW-534): the JSX regex never sees `sf={variable}`, and the table that holds
 * the name is a `.ts` file the old walk did not even open.
 */

const ROOTS = ['app', 'src'];
const SYMBOL_SOURCE = 'src/components/AppSymbol.tsx';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function mappedSymbols(): Set<string> {
  const src = readFileSync(SYMBOL_SOURCE, 'utf8');
  const block = src.split('const SF_TO_MD = {')[1]?.split('} as const satisfies')[0] ?? '';
  const names = new Set<string>();
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    const quoted = /^'([^']+)':/.exec(line);
    const bare = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
    if (quoted) names.add(quoted[1]!);
    else if (bare) names.add(bare[1]!);
  }
  return names;
}

/** `<AppSymbol …/>` elements only — NativeTabs icons carry their own `md` prop. */
function appSymbolUsages(): { file: string; sf: string }[] {
  const found: { file: string; sf: string }[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const src = readFileSync(file, 'utf8');
      for (const element of src.matchAll(/<AppSymbol\b[\s\S]*?\/>/g)) {
        const tag = element[0];
        // An explicit `md=` override means the map is not consulted.
        if (/\bmd=/.test(tag)) continue;
        const sf = /\bsf=(?:"([^"]+)"|\{'([^']+)'\})/.exec(tag);
        if (sf) found.push({ file, sf: (sf[1] ?? sf[2])! });
      }
    }
  }
  return found;
}

const REGEX_PRECEDERS = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
]);

function skipQuoted(src: string, start: number): number {
  const quote = src[start]!;
  let i = start + 1;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    // An unterminated '…' / "…" would swallow the rest of the file; stop at the line end.
    if (quote !== '`' && c === '\n') return i;
    i++;
  }
  return i;
}

function skipRegexLiteral(src: string, start: number): number {
  let i = start + 1;
  let inCharClass = false;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') inCharClass = true;
    else if (c === ']') inCharClass = false;
    else if (c === '/' && !inCharClass) return i + 1;
    else if (c === '\n') return start + 1; // a division, not a regex
    i++;
  }
  return i;
}

/**
 * Map every character of a source file to the innermost `{…}` block containing it
 * (`-1` at file top level), ignoring braces inside strings, template literals,
 * comments and regex literals. That is what lets the table scan below answer "does
 * the object literal holding this `sf` also supply an `md`?" without a full parser.
 *
 * `balanced` reports whether the walk ended at depth 0. It is the scanner's own
 * integrity check: a desynced walk would under-report symbols and quietly turn this
 * guard back into a no-op, so the test treats it as a failure rather than trusting it.
 */
function indexBlocks(src: string): { block: Int32Array; isCode: Uint8Array; balanced: boolean } {
  const block = new Int32Array(src.length).fill(-1);
  const isCode = new Uint8Array(src.length);
  const open: number[] = [];
  let nextBlock = 0;
  let lastSignificant = '';
  let i = 0;

  while (i < src.length) {
    const c = src[i]!;
    const pair = src.slice(i, i + 2);

    if (pair === '//') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (pair === '/*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i = skipQuoted(src, i);
      lastSignificant = c;
      continue;
    }
    if (c === '/' && (lastSignificant === '' || REGEX_PRECEDERS.has(lastSignificant))) {
      i = skipRegexLiteral(src, i);
      lastSignificant = '/';
      continue;
    }

    isCode[i] = 1;
    if (c === '{') open.push(nextBlock++);
    block[i] = open.length > 0 ? open[open.length - 1]! : -1;
    if (c === '}') open.pop();
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }

  return { block, isCode, balanced: open.length === 0 };
}

/**
 * `sf: '<name>'` object-literal properties, in `.ts` data tables as well as `.tsx`.
 * An `md` in the same object literal is the documented opt-out (`SportIcon.tsx`,
 * `LogMealSheet.tsx`) — the map is never consulted for those.
 */
function symbolTableUsages(): { file: string; sf: string }[] {
  const found: { file: string; sf: string }[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const src = readFileSync(file, 'utf8');
      const { block, isCode, balanced } = indexBlocks(src);
      if (!balanced) {
        throw new Error(`Symbol scanner desynced on ${file}; fix indexBlocks before trusting it.`);
      }

      const optedOut = new Set<number>();
      for (const m of src.matchAll(/(^|[^.\w$])md\s*:/g)) {
        const at = m.index! + m[1]!.length;
        if (isCode[at]) optedOut.add(block[at]!);
      }
      for (const m of src.matchAll(/(^|[^.\w$])sf\s*:\s*'([^']+)'/g)) {
        const at = m.index! + m[1]!.length;
        if (!isCode[at]) continue;
        if (optedOut.has(block[at]!)) continue;
        found.push({ file, sf: m[2]! });
      }
    }
  }
  return found;
}

describe('AppSymbol Android coverage', () => {
  it('maps every SF Symbol rendered through AppSymbol to a Material Symbol', () => {
    const mapped = mappedSymbols();
    const usages = appSymbolUsages();

    expect(usages.length).toBeGreaterThan(20);

    const unmapped = usages
      .filter((u) => !mapped.has(u.sf))
      .map((u) => `${u.sf} (${u.file})`)
      .sort();

    expect(unmapped).toEqual([]);
  });

  it('maps every SF Symbol declared in a lookup table to a Material Symbol', () => {
    const mapped = mappedSymbols();
    const usages = symbolTableUsages();

    // Anti-vacuity floor: a broken walk must go red, not silently pass on zero rows.
    expect(usages.length).toBeGreaterThan(15);

    const unmapped = usages
      .filter((u) => !mapped.has(u.sf))
      .map((u) => `${u.sf} (${u.file})`)
      .sort();

    expect(unmapped).toEqual([]);
  });

  it('does not flag lookup tables that opt out with an explicit `md`', () => {
    // SportIcon.tsx supplies `md` for every glyph, so none of its SF names — all
    // absent from SF_TO_MD — may be reported by the table scan.
    const fromSportIcon = symbolTableUsages().filter((u) => u.file.endsWith('SportIcon.tsx'));

    expect(fromSportIcon).toEqual([]);
  });
});
