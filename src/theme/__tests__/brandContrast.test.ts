import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { Themes } from '../colors';

/**
 * WCAG 2.1 relative luminance / contrast ratio.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

describe('contrastRatio', () => {
  it('matches known WCAG reference pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

/** Every accent exposed as a per-theme foreground token. */
const FOREGROUND_TOKENS = [
  'brandOnSurface',
  'modifyOnSurface',
  'recoveryOnSurface',
  'hydrationOnSurface',
  'dangerOnSurface',
  'successOnSurface',
  'macroCaloriesOnSurface',
  'macroCarbsOnSurface',
  'macroProteinOnSurface',
  'macroFatOnSurface',
] as const;

describe('every accent foreground', () => {
  it.each(FOREGROUND_TOKENS)('%s clears AA for normal text on both themes', (token) => {
    for (const theme of [Themes.light, Themes.dark]) {
      expect(contrastRatio(theme[token], theme.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(theme[token], theme.card)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('keeps error and success text readable on their tinted cards', () => {
    for (const theme of [Themes.light, Themes.dark]) {
      expect(contrastRatio(theme.dangerOnSurface, theme.tintError)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(contrastRatio(theme.successOnSurface, theme.tintSuccess)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('leaves the dark palette on its original vivid accents', () => {
    // Danger is the deliberate exception — red-400 reads better on #450a0a.
    expect(Themes.dark.modifyOnSurface).toBe(Themes.dark.modify);
    expect(Themes.dark.recoveryOnSurface).toBe(Themes.dark.recovery);
    expect(Themes.dark.successOnSurface).toBe(Themes.dark.success);
    expect(Themes.dark.macroCarbsOnSurface).toBe(Themes.dark.macroCarbs);
  });

  it('documents that the raw accents fail as light-mode text', () => {
    // The regression these tokens exist to prevent — all were under AA.
    for (const accent of [
      Themes.light.brand,
      Themes.light.modify,
      Themes.light.recovery,
      Themes.light.success,
      Themes.light.macroCarbs,
    ]) {
      expect(contrastRatio(accent, Themes.light.surface)).toBeLessThan(AA_NORMAL);
    }
  });
});

describe('brand as foreground', () => {
  it('keeps the vivid brand on dark, where it already passes', () => {
    expect(Themes.dark.brandOnSurface).toBe(Themes.dark.brand);
  });

  it('documents why light mode cannot reuse the fill colour', () => {
    // Under even the relaxed large-text floor, not just AA normal.
    expect(contrastRatio(Themes.light.brand, Themes.light.surface)).toBeLessThan(AA_LARGE);
  });
});

describe('brand as fill', () => {
  it('stays theme-invariant so ink-on-brand keeps its contrast', () => {
    expect(Themes.light.brand).toBe(Themes.dark.brand);
    for (const theme of [Themes.light, Themes.dark]) {
      expect(contrastRatio(theme.ink, theme.brand)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * CW-348: components were tinting glyphs with raw accent hex instead of the
 * foreground tokens, so light mode shipped 1.74:1–3.79:1 text. Each row pins
 * the literal that shipped to the token that replaced it, so a revert has to
 * fail here as well as in `scripts/check-theme-tokens.mjs`.
 */
const RAW_ACCENT_SUBSTITUTIONS = [
  { raw: '#22c55e', token: 'successOnSurface', site: 'FirstRunActivationCompanion bolt' },
  { raw: '#ef4444', token: 'dangerOnSurface', site: 'FirstRunActivationCompanion heart' },
  { raw: '#3b82f6', token: 'macroProteinOnSurface', site: 'FirstRunActivationCompanion run' },
  { raw: '#a855f7', token: 'macroFatOnSurface', site: 'FirstRunActivationCompanion chat' },
  { raw: '#34d399', token: 'successOnSurface', site: 'CoachChat nutrition glyph' },
  { raw: '#fb7185', token: 'dangerOnSurface', site: 'CoachChat wellness glyph' },
  { raw: '#a5b4fc', token: 'macroFatOnSurface', site: 'CoachChat planning glyph' },
  { raw: '#38bdf8', token: 'recoveryOnSurface', site: 'CoachChat workouts glyph' },
  { raw: '#f87171', token: 'dangerOnSurface', site: 'CoachChat / recovery-event error' },
  { raw: '#00DC82', token: 'brandOnSurface', site: 'CoachChat dictation spinner' },
] as const;

describe('raw accents replaced by foreground tokens (CW-348)', () => {
  it.each(RAW_ACCENT_SUBSTITUTIONS)(
    '$site: $raw failed light mode, $token clears AA',
    ({ raw, token }) => {
      expect(contrastRatio(raw, Themes.light.surface)).toBeLessThan(AA_NORMAL);
      expect(contrastRatio(Themes.light[token], Themes.light.surface)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(contrastRatio(Themes.dark[token], Themes.dark.surface)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it('keeps the muted token readable — it tints the denied/unknown glyphs', () => {
    for (const theme of [Themes.light, Themes.dark]) {
      expect(contrastRatio(theme.textMuted, theme.surface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('keeps invariant white ink legible on the invariant recording fill', () => {
    // CoachChat's dictation button paints `bg-red-500` in both themes, so its
    // ink stays invariant white. Graphic, not text — the 3:1 floor applies.
    expect(contrastRatio(Themes.dark.textPrimary, Themes.dark.danger)).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
    expect(Themes.dark.danger).toBe(Themes.light.danger);
  });
});

describe('the guardrail script covers what these tokens protect', () => {
  const script = readFileSync('scripts/check-theme-tokens.mjs', 'utf8');

  it('matches any hex literal, not an enumerated handful', () => {
    // Read the script's own regex back rather than restating it here, so the
    // two cannot drift apart.
    const hexRule = /const hexPattern =\s*\/(.+)\/[a-z]*;/.exec(script);
    expect(hexRule, 'hexPattern not found in check-theme-tokens.mjs').not.toBeNull();
    const pattern = new RegExp(hexRule![1]!);

    for (const { raw } of RAW_ACCENT_SUBSTITUTIONS) {
      expect(pattern.test(`color: '${raw}'`), raw).toBe(true);
    }
    for (const shorthand of ['#fff', '#0af', '#00DC8280']) {
      expect(pattern.test(`color: '${shorthand}'`), shorthand).toBe(true);
    }
    // Not a colour — an id-like token must not trip the rule.
    expect(pattern.test('#0123456789abcdef')).toBe(false);
  });

  it('keeps every allowlisted exception documented with a reason', () => {
    const allowlist = script.split('const allowlist')[1]?.split('const violations')[0] ?? '';
    for (const file of [
      'app/+html.tsx',
      'app/(app)/invite.tsx',
      'src/features/auth/AuthAtmosphere.tsx',
      'src/features/log/WellnessScoreCard.tsx',
      'src/features/nutrition/BarcodeScannerModal.tsx',
    ]) {
      expect(allowlist).toContain(file);
    }
    // One `reason:` per allowlisted file — no silent entries.
    expect(allowlist.match(/reason:/g)?.length).toBe(5);
    expect(allowlist.match(/literals:/g)?.length).toBe(5);
  });
});

describe('token sources agree', () => {
  const css = readFileSync('global.css', 'utf8');

  /** `--color-<name>-on-surface: R G B;` → `#RRGGBB`, within one theme block. */
  function cssVar(block: string, cssName: string): string {
    const scope = css.split(block)[1] ?? '';
    const re = new RegExp(`--color-${cssName}-on-surface:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`);
    const m = re.exec(scope);
    if (!m) throw new Error(`no --color-${cssName}-on-surface after "${block}"`);
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((v) => Number(v).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }

  /** `macroCarbsOnSurface` → `macro-carbs` */
  function cssNameFor(token: string): string {
    return token
      .replace(/OnSurface$/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }

  it.each(FOREGROUND_TOKENS)('keeps global.css in sync with the TS map for %s', (token) => {
    const name = cssNameFor(token);
    expect(cssVar(':root {', name)).toBe(Themes.light[token].toUpperCase());
    expect(cssVar('prefers-color-scheme: dark', name)).toBe(Themes.dark[token].toUpperCase());
  });

  it('points every tailwind text accent at its variable, not a literal', () => {
    const config = readFileSync('tailwind.config.js', 'utf8');
    const textColor = config.split('textColor:')[1] ?? '';
    expect(textColor).toContain('var(--color-brand-on-surface)');
    for (const token of FOREGROUND_TOKENS) {
      expect(textColor).toContain(
        `var(--color-${token
          .replace(/OnSurface$/, '')
          .replace(/([a-z])([A-Z])/g, '$1-$2')
          .toLowerCase()}-on-surface)`,
      );
    }
    // bg-brand / border-brand must keep the invariant fill.
    expect(config).toContain("DEFAULT: '#00DC82'");
  });
});
