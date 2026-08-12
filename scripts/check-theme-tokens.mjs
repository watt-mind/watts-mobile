#!/usr/bin/env node
/**
 * Guardrail: no raw colour literals outside `src/theme/`.
 *
 * Two independent rules run over every `.js/.jsx/.ts/.tsx` file under `app/`
 * and `src/`, excluding `src/theme/` (which owns the palette):
 *
 *   1. Utility-class rule — the dark-only Tailwind classes that predate the
 *      dual-theme tokens (`zinc-*`, `text-white`, `bg-surface-dark`,
 *      `text-ink-muted`).
 *   2. Hex-literal rule — ANY 3-, 4-, 6-, or 8-digit hex colour. Every accent
 *      already has a per-theme foreground token in `src/theme/colors.ts`
 *      (`successOnSurface`, `dangerOnSurface`, `brandOnSurface`, …) that is
 *      contrast-tested in `src/theme/__tests__/brandContrast.test.ts`. A raw
 *      hex bypasses that tuning and ships a light-mode contrast failure.
 *
 * Comments are not scanned: documentation legitimately quotes hex values while
 * explaining why a token exists. Only whole-line `//` comments and block
 * comments (`/* … *\/` and the JSX `{/* … *\/}` form) are skipped — a trailing
 * `//` is never stripped, so `color: '#22c55e', // brand` is still caught.
 *
 * See openspec/changes/dual-theme-tokens and docs/DESIGN.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const roots = ['app', 'src'];
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

/** Dark-only utility classes superseded by the semantic token classes. */
const classPattern = /zinc-\d|text-white\b|bg-surface-dark|text-ink-muted/;

/** 3-, 4-, 6-, or 8-digit hex colour; the lookahead rejects longer runs. */
const hexPattern =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

/**
 * Deliberate exceptions, each pinned to the exact literals it may use — a file
 * on this list is NOT a free pass, so an accent hex added to any of them still
 * fails. Every entry needs a reason why no theme token can apply.
 */
const allowlist = new Map([
  [
    'app/+html.tsx',
    {
      literals: ['#fff', '#000'],
      reason:
        'Static <head> CSS for the web build. Emitted as a string before React ' +
        'mounts, so no theme context exists; it drives prefers-color-scheme itself.',
    },
  ],
  [
    'app/(app)/invite.tsx',
    {
      literals: ['#000000', '#ffffff'],
      reason:
        'QR_MODULE_DARK / QR_MODULE_LIGHT. QR modules must stay pure black on ' +
        'pure white to hold the contrast ratio scanners require.',
    },
  ],
  [
    'src/features/auth/AuthAtmosphere.tsx',
    {
      literals: ['#fafafa', '#ffffff'],
      reason:
        'Compared against `theme.surface` to detect the light palette — a value ' +
        'read from the theme, not a colour rendered to the screen.',
    },
  ],
  [
    'src/features/log/WellnessScoreCard.tsx',
    {
      literals: ['#000000'],
      reason:
        'Ink over the active brand fill. `bg-brand` is theme-invariant, so its ' +
        'ink must be too (21:1 on #00DC82); a per-theme token would invert it.',
    },
  ],
  [
    'src/features/nutrition/BarcodeScannerModal.tsx',
    {
      literals: ['#ffffff'],
      reason:
        'Chrome over the live camera viewfinder. There is no theme surface ' +
        'behind the preview, so the overlay stays white in both themes.',
    },
  ],
]);

const violations = [];

for (const root of roots) {
  for (const file of walk(root)) {
    const displayPath = relative('.', file).split(sep).join('/');
    if (displayPath.startsWith('src/theme/')) continue;

    const allowed = new Set(
      (allowlist.get(displayPath)?.literals ?? []).map((value) => value.toLowerCase()),
    );

    for (const [index, line] of codeLines(readFileSync(file, 'utf8'))) {
      const where = `${displayPath}:${index + 1}`;

      if (classPattern.test(line)) {
        violations.push(`${where}: raw neutral class — ${line.trim()}`);
      }

      for (const [literal] of line.matchAll(hexPattern)) {
        if (allowed.has(literal.toLowerCase())) continue;
        violations.push(`${where}: raw hex ${literal} — ${line.trim()}`);
      }
    }
  }
}

if (violations.length === 0) {
  console.log('theme-tokens: ok (no raw colour literals outside src/theme/)');
  process.exit(0);
}

console.error('theme-tokens: raw colour values found — use semantic tokens from src/theme:\n');
for (const line of violations) console.error(`  ${line}`);
console.error(
  '\nUse `useThemeColors()` and an `*OnSurface` foreground token, or add a ' +
    'documented exception to the allowlist in scripts/check-theme-tokens.mjs.',
);
process.exit(1);

/**
 * Yield `[index, line]` for every line that carries code, skipping block
 * comments and whole-line `//` comments. Mid-line `//` is deliberately left
 * alone: stripping it would swallow real code after a string containing `//`.
 */
function* codeLines(source) {
  let inBlockComment = false;

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (inBlockComment) {
      const end = trimmed.indexOf('*/');
      if (end === -1) continue;
      inBlockComment = false;
      const rest = trimmed.slice(end + 2).trim();
      if (rest) yield [index, rest];
      continue;
    }

    if (trimmed.startsWith('//')) continue;

    // `/* … */` and the JSX form `{/* … */}`.
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    yield [index, line];
  }
}

function* walk(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      yield path;
    }
  }
}
