# Design System — Coach Watts Mobile

UI conventions for this app. Brand tokens originate in coach-wattz `BRANDING.md`; this doc covers how they're applied here. Update it when a convention changes — code should match this doc.

## Principles

1. **Field companion, not dashboard.** One decision per viewport; depth lives on web ("Open in Coach Watts").
2. **Two themes, one system.** Light and dark ship together. Default follows the OS (`userInterfaceStyle: "automatic"`); Settings → Appearance lets the athlete pick **System / Light / Dark** (persisted on-device via `Appearance.setColorScheme`). Every color in UI code goes through a **semantic token** (surface, card, border, text…) that resolves per theme — never a raw palette value like `bg-zinc-900` or `#09090b` in a component. Dark remains the reference theme (screenshots, design exploration start there); light is derived from the same tokens, not styled ad hoc. Outdoor readability is the point: athletes use this in direct sunlight, where light mode wins. Enforce with `pnpm lint:theme`.
3. **Text is the default, icons are seasoning.** Sport glyphs and status colors aid scanning; avoid decorative icon noise.
4. **Skeletons, not spinners.** Full-screen loads show layout-matching skeletons. Spinners are only for small in-place waits (inline section loads, button loading states).

## Tokens

Source of truth: [`src/theme/colors.ts`](../src/theme/colors.ts) (JS access) and [`tailwind.config.js`](../tailwind.config.js) (className access). Keep them in sync.

Brand/state accents (brand, recovery, modify, danger, zone ramp) are **theme-invariant as fills**. Neutrals are **semantic** and resolve per theme — as does **brand-on-surface**, the brand green used as text or an icon tint (see [Brand foreground vs fill](#brand-foreground-vs-fill)):

| Semantic token | Dark value | Light value | Tailwind | Replaces |
|----------------|-----------|-------------|----------|----------|
| surface | `#09090b` | `#fafafa` | `bg-surface` | `bg-surface-dark`, raw `#09090b` |
| card | zinc-900 `#18181b` (`/80`) | white | `bg-card` | `bg-zinc-900`, `bg-zinc-900/80` |
| border | zinc-800 `#27272a` | zinc-200 `#e4e4e7` | `border-border` | `border-zinc-800` |
| border-strong | zinc-700 `#3f3f46` | zinc-300 `#d4d4d8` | `border-border-strong` | `border-zinc-700` (inputs/buttons) |
| text-primary | white | zinc-950 `#09090b` | `text-text-primary` | `text-white` |
| text-body | zinc-200 `#e4e4e7` | zinc-700 `#3f3f46` | `text-text-body` | `text-zinc-200` |
| text-muted | `#71717a` | zinc-600 `#52525b` | `text-text-muted` | `text-ink-muted` |
| tint-error | red-950 `#450a0a` | red-50 `#fef2f2` | `bg-tint-error` | `bg-red-950/40` |
| tint-success | green-950 `#052e16` | green-50 `#f0fdf4` | `bg-tint-success` | `bg-green-950/40` |

Wired via CSS variables in `global.css` (`:root` light + `prefers-color-scheme: dark`) mapped in `tailwind.config.js` with `<alpha-value>` slots (`bg-card/80`). JS access: `useThemeColors()` / `Themes.dark|light` in `src/theme/colors.ts`. **Contrast rule** applies in both themes: text on brand green is always dark ink (`text-ink`); light `text-muted` is zinc-600 so body-size muted text clears WCAG AA on `#fafafa`.

**Card elevation:** both themes use a hairline `border-border` (no soft shadow). Light stays flat like dark so list density and press targets stay identical; a light-only shadow can be revisited later if cards feel washed out on pure white.

| Token | Value | Tailwind | Use |
|-------|-------|----------|-----|
| brand (fill) | `#00DC82` | `bg-brand` / `border-brand` | Fills, active states, train hero tone — theme-invariant |
| accent on surface | per theme — see [table](#accent-foreground-vs-fill) | `text-brand` / `text-modify` / `text-danger` / …, `theme.*OnSurface` | **Text**, icon tints, spinners, chart strokes |
| brand action | `#00C16A` | `bg-brand-action` | Primary button fill only |
| brand deep | `#00A155` | `brand-deep` | Chart accent |
| recovery | `#38bdf8` | `text-recovery` / `bg-recovery` | Rest-day hero accent (sky on dark; not violet) |
| modify | `#f59e0b` | `text-modify` / `bg-modify` | Modify hero accent |
| macro calories / carbs / protein / fat | `#fb923c` / `#fbbf24` / `#60a5fa` / `#a78bfa` | `macro-calories` … `macro-fat` | Nutrition bars & explain accents — never raw hex in components |
| hydration | `#38bdf8` (same as recovery) | `text-hydration` / `bg-hydration` | Fluid / water meters |
| surface | see table | `bg-surface` | Screen background |
| ink | `#09090b` | `text-ink` | Text **on** brand green |
| danger | `#ef4444` | `bg-danger` (fill) / `text-danger` (per theme) | Errors, destructive |
| success | `#22c55e` | `text-success` / `text-green-400` | Success confirmations |

### Zone ramp (Z1→Z7)

Shared by activity zone bars, planned zone rows, and the structure-profile silhouette. Access via `Colors.zones` / `zoneColor(index)` (0-based, clamps to last) or Tailwind `bg-zone-1` … `bg-zone-7`. Unknown intensity uses `Colors.zoneNeutral` / `bg-zone-neutral`.

| Zone | Hex | Tailwind | Note |
|------|-----|----------|------|
| Z1 | `#3b82f6` | `zone-1` | Blue |
| Z2 | `#14b8a6` | `zone-2` | Teal — distinct from brand green |
| Z3 | `#eab308` | `zone-3` | Yellow |
| Z4 | `#f97316` | `zone-4` | Orange |
| Z5 | `#ef4444` | `zone-5` | Red |
| Z6 | `#a855f7` | `zone-6` | Purple |
| Z7 | `#52525b` | `zone-7` | Zinc |

### Plan block accents

Season timeline phase colours. Access via `Colors.planBlocks` / `blockTypeColor(type)` — never a parallel hex map in feature code.

| Type | Hex | Note |
|------|-----|------|
| PREP | `#94a3b8` | Slate |
| BASE | `#3b82f6` | Same as Z1 |
| BUILD | `#f59e0b` | Same as modify |
| PEAK | `#ef4444` | Same as danger |
| RACE | `#a855f7` | Same as Z6 |
| TRANSITION | `#00DC82` | Brand |

Neutral surfaces use semantic tokens: cards `bg-card(/80)` with `border-border`, input/button borders `border-border-strong`, hairline row dividers `border-border/80`.

**Contrast rule:** text on brand green is always dark (`text-ink`), never white / `text-text-primary`.

### Accent foreground vs fill

Every accent means two different things and only one of them is theme-invariant.

- **As a fill** (`bg-*`, `border-*`) accents stay vivid on both themes. A brand fill always carries `text-ink` (10.95:1 either way), and chart fills are judged as graphics, not text.
- **As a foreground** — text, icon `tintColor`, spinners, chart strokes — an accent must resolve per theme. The palette was designed against dark surfaces, so on light `#fafafa` **every accent lands between 1.6:1 and 3.8:1 as text**, under the 4.5:1 AA floor (most are under the 3:1 large-text floor too). Light mode uses the same hue one step darker.

| Foreground token | Dark | Light | Light ratio on `#fafafa` |
|---|---|---|---|
| `brandOnSurface` | `#00DC82` | `#00854E` | 4.51 |
| `modifyOnSurface` | `#f59e0b` | `#b45309` | 4.81 |
| `recoveryOnSurface` / `hydrationOnSurface` | `#38bdf8` | `#0369a1` | 5.68 |
| `dangerOnSurface` | `#f87171` | `#b91c1c` | 6.20 |
| `successOnSurface` | `#22c55e` | `#15803d` | 4.81 |
| `macroCaloriesOnSurface` | `#fb923c` | `#c2410c` | 4.96 |
| `macroCarbsOnSurface` | `#fbbf24` | `#a16207` | 4.72 |
| `macroProteinOnSurface` | `#60a5fa` | `#1d4ed8` | 6.42 |
| `macroFatOnSurface` | `#a78bfa` | `#6d28d9` | 6.81 |

`dangerOnSurface` is the one token whose dark value is not the raw accent: red-400 is lighter than `danger` and reads better on the tinted error card (5.84 vs 4.29 on `#450a0a`).

Wiring: `--color-*-on-surface` in `global.css`, `textColor.*` in `tailwind.config.js` (Tailwind's `textColor` scale feeds text utilities only, so `text-modify` and `bg-modify` diverge without touching call sites), and `*OnSurface` on the `Themes` maps for imperative use.

**Rules:**

1. Never read an accent foreground off the static `Colors` export — that is the dark map, so it pins the vivid value and fails in light mode. Use `useThemeColors().<accent>OnSurface`, the `text-*` class, or `<Spinner />`.
2. Don't reach for raw Tailwind palette classes (`text-red-400`, `text-green-400`) for state text — they are theme-blind and were the second source of light-mode failures. Use `text-danger` / `text-success`.

`src/theme/__tests__/brandContrast.test.ts` asserts every token clears AA on both themes, that error/success text clears its tinted card, that fills stay invariant, and that `global.css` / `tailwind.config.js` / `colors.ts` agree.

### Guardrail: `pnpm lint:theme`

`scripts/check-theme-tokens.mjs` walks every `.js/.jsx/.ts/.tsx` under `app/` and `src/` (skipping `src/theme/`, which owns the palette) and enforces two rules:

1. **Utility classes** — the dark-only classes superseded by tokens: `zinc-*`, `text-white`, `bg-surface-dark`, `text-ink-muted`.
2. **Hex literals** — **any** 3-, 4-, 6-, or 8-digit hex colour, not an enumerated list. Until CW-348 this rule named only four dark neutrals (`#09090b`, `#27272a`, `#18181b`, `#3f3f46`), so every accent hex slipped through and shipped light-mode text between 1.74:1 and 3.79:1 — the exact failure the `*OnSurface` tokens exist to prevent. The check reported "ok" the whole time.

Comments are not scanned, since docs legitimately quote hex while explaining a token. Only *whole-line* `//`, `/* … */`, and JSX `{/* … */}` comments are skipped — a trailing `//` is never stripped, so `color: '#22c55e', // brand` is still caught.

**Allowlist.** Genuine exceptions live in an explicit `allowlist` map in the script, keyed by file **and pinned to the exact literals that file may use** — an allowlisted file is not a blanket exemption, so an accent hex added to one still fails. Every entry carries a `reason`. Add to it only when no token can apply:

| File | Literals | Why |
|---|---|---|
| `app/+html.tsx` | `#fff` `#000` | Static `<head>` CSS for the web build, emitted as a string before React mounts — no theme context exists, and it drives `prefers-color-scheme` itself. |
| `app/(app)/invite.tsx` | `#000000` `#ffffff` | QR modules must stay pure black on pure white to hold the contrast scanners require. |
| `src/features/auth/AuthAtmosphere.tsx` | `#fafafa` `#ffffff` | Compared *against* `theme.surface` to detect the light palette — a value read from the theme, never rendered. |
| `src/features/log/WellnessScoreCard.tsx` | `#000000` | Ink over the active brand fill. `bg-brand` is theme-invariant, so its ink must be too (21:1); a per-theme token would invert it. |
| `src/features/nutrition/BarcodeScannerModal.tsx` | `#ffffff` | Chrome over the live camera viewfinder — no theme surface behind the preview. |

The recurring shape of a legitimate exception is **ink on a theme-invariant fill** or **a colour that is never rendered**. If neither applies, use a token. Where the invariant fill is expressed in code rather than the allowlist — `CoachChat`'s dictation button paints `bg-red-500` while recording — read the invariant value off the static `Colors` map with a comment saying why, rather than inlining a literal.

## Type scale

- Screen title / greeting: `text-2xl font-semibold text-text-primary`
- Card/hero title: `text-2xl` (hero) or `text-lg` (compact) `font-semibold text-text-primary`
- Section header: `text-xs font-semibold uppercase tracking-widest text-text-muted` (e.g. "Coming up")
- Card label (kicker): `text-xs uppercase tracking-wide text-text-muted`
- Body / prose: `text-base leading-6 text-text-body`
- Row title: `text-base font-medium text-text-primary`
- Metadata line: `text-sm text-text-muted`, values joined with `' · '` (date · type · duration · TSS)

## Layout

- Screen padding: `px-6`, `pt-4`, bottom `pb-10`–`pb-12` on scroll content.
- Section spacing: `mt-8` between major sections, `mt-6` between blocks inside a flow.
- Cards: `rounded-xl` (hero cards `rounded-2xl`), `p-4`–`p-5`.
- List rows: either bordered cards (`mb-3 rounded-xl border`) for dedicated list screens, or hairline-divided rows (`border-b py-3`) for embedded teasers.

## Shared components — use these, don't hand-roll

All in [`src/components/`](../src/components):

- **`Button`** — the only way to render a full-width action button. Variants: `primary` (brand-action fill, dark label), `secondary` (border-strong outline), `danger` (border-strong fill, red label). Handles loading spinner, disabled dimming (`opacity-50`), press feedback, and accessibility props. Pass margins via `className`.
- **`AppSymbol`** — cross-platform glyph wrapper (`SF Symbol` on iOS, Material Symbol on Android). Prefer this over raw `SymbolView` + emoji branching. Add new SF→MD pairs in `src/components/AppSymbol.tsx`.
- **`SportIcon`** — circular sport glyph derived from the workout `type` string. Sizes in use: 18 (detail/hero), 14 (list rows), 13 (Today teasers). Built on `AppSymbol`. Add new sport mappings there, not inline.
- **`BottomSheet`** — bottom-anchored modal for forms / detail panes (grabber + scrim dismiss). Do not hand-roll `Modal` + top-pinned flex. Use `scroll={false}` when embedding native pickers.
- **`DateYmdField`** — calendar date control for YYYY-MM-DD values (native `@expo/ui` picker + optional +1/+3/+6 mo chips). Prefer this over typed date strings on create forms.
- **Sectioned choice menus** (e.g. Plan Adjust with This week + Season) — one `BottomSheet` with eyebrow sections and hairline action rows. Do **not** nest `ActionSheetIOS` / `Alert` menus for multi-group choices.
- **Plan generator** — thumb-first steps (Goal → Days → Volume → Sports → Timeline → Approach), then working → preview (phase glance with plan-block accents + first week with SportIcon). Prefer chip rows over dense strategy cards; Create goal leaves the generator for Goals EventGoalWizard.
- **EventGoalWizard** — type grid → (EVENT) multi-select calendar events → configure. Match web Create Goal payloads (`eventIds` for EVENT); AI suggest/review stay web.
- **`showActionSheet` / `ActionSheetPortal`** — short, single-level choice menus only (≤ ~5 options, one group). Mount `ActionSheetPortal` once at the root. Keep `Alert.alert` for true confirms (destructive / irreversible) only.
- **`Skeleton` / `ListSkeleton` / `DetailSkeleton`** — loading placeholders. New screens get a skeleton that roughly matches their loaded layout.

Inline text links (Retry, See all, Check in…): `text-sm font-semibold text-brand` on a Pressable with **`hitSlop={8}`** — every tappable target must reach ~44pt.

## States

- **Loading:** skeleton (see above). Warm-cache Today target is < ~2s.
- **Error:** red tinted card (`border-danger/40 bg-tint-error`, `text-danger`) with an inline brand-colored Retry link. Prefer friendly copy over raw API messages.
- **Empty:** honest one-liner in `text-text-muted` ("Waiting for sync…", "No upcoming planned workouts.") plus the relevant action. Never a blank screen.
- **Success/confirm:** green (`text-green-400`) inline text or state change; keep it near the triggering control. For meaningful habit actions that already occupy a dedicated flow (for example, logging a photo meal), the final screen may become a restrained completion state: one success haptic, a short checkmark transition, the real values added, and the updated daily context. No confetti, invented praise, badges, or detached celebratory toast.

## Haptic Feedback Map

Map haptic interactions uniformly across all screens. Use the helpers from `src/lib/haptics.ts`:

- **`hapticLight()`**: Chip selection (e.g. Log check-in options), segment selectors, +/- steppers, custom list item row presses, tab swaps.
- **`hapticSuccess()`**: Successful API actions, log submissions, accepted recommendations, successfully sent chat messages.
- **`hapticError()`**: Blocked form validation, API failures, authentication failure.

## Keyboard & Input Accessibility

To avoid keyboards layout overlap or blocking inputs:

- **Tab screens:** Use `useKeyboardOverlap` hook to adjust bottom padding dynamically on iOS (standard `KeyboardAvoidingView` behaves incorrectly inside bottom tab systems).
- **Dismiss interactions:** Wrap inputs/forms in a root dismissing `Pressable` that calls `Keyboard.dismiss()` to ensure taps on empty space hide the keyboard.
- **Standard screens:** Use standard `KeyboardAvoidingView` or `KeyboardAwareScrollView` for standalone screens (like Login or Athlete Profile).

## Standardized Press Animations

- Prefer **`AnimatedPressable`** (spring-scale + opacity press animation) over raw `Pressable` with `active:opacity-80` classes.
- Ensure all tappable surfaces (links, chips, triggers) have **`hitSlop={8}`** or higher, targeting a minimum touch dimension of **44pt**.

## Accessibility & Dynamic Type Scaling

- Primary CTAs go through `Button` (roles/labels/state included).
- Custom icon-only Pressables need `accessibilityRole="button"` + `accessibilityLabel`.
- **Dynamic Type Scaling Rules:**
  - **Enable Font Scaling:** Never set `allowFontScaling={false}` on `Text` or `TextInput` components.
  - **Max Font Multiplier:** Tight headers, badges, and fixed CTAs should specify `maxFontSizeMultiplier` (`MAX_FONT_SCALE_DEFAULT = 1.5` in `src/theme/typography.ts`, `MAX_FONT_SCALE_BADGE = 1.3`, `MAX_FONT_SCALE_HERO = 1.25`) to cap text growth where container overflow would break layout.
  - **Fluid Body Prose:** Body text and prose content allow unconstrained OS font scaling.
  - **Layout Resilience:** Text containers must use flexible padding (`py-3`, `min-h-[44px]`) and flex wrapping instead of fixed height classes (`h-10`, `h-12`) that clip when fonts scale up.
- **Reduce Motion Animation Rules:**
  - Use `useReduceMotion()` hook (`src/hooks/useReduceMotion.ts`) and guards (`reduceMotionGuard`, `reduceMotionScale`, `reduceMotionDuration`) for Reanimated styles and layout transitions.
  - **Press Animations:** `AnimatedPressable` automatically bypasses spring scale transforms and opacity pulses when Reduce Motion is enabled.
  - **Skeleton & Pulsing Components:** `Skeleton` placeholders settle at a static opacity (0.65) without continuous looping pulses under Reduce Motion.
  - **Typing & Streaming Indicators:** `TypingIndicator` freezes dot bounce loops at neutral position when Reduce Motion is active.
- **Maestro / e2e:** screen and sheet roots (and primary CTAs the suite must tap) also get stable `testID`s — naming, inventory, and when to update flows live in [e2e.md](./e2e.md) § Maintaining e2e. Labels may change with copy; `testID`s should not.

## Localization & Copy Policy

- **V1 Client Chrome is English-First:** Mobile UI labels, headings, CTAs, and tab titles use English copy.
- **Typed `src/i18n` Scaffold:** All new or updated chrome strings are routed through `src/i18n` (`t()`, `messages/en.ts`). Keys are stable and typed to support future catalog expansion (e.g. Tolgee / shared multi-language catalogs with web).
- **Server-Driven Localization:** Dynamic AI content (Coach chat messages, AI recommendations, workout step names, advice, notes) is generated in the athlete's language by the `coach-wattz` backend based on their user profile setting.
- **Chrome / Content Separation:** Client chrome labels should never prefix, wrap, or concatenate server-driven content in ways that assume English sentence structure or cause mixed-language presentation.


## Don'ts

- No raw hex in components — not just neutrals (`bg-zinc-900`, `#09090b`, `text-white`) but accents too (`#22c55e`, `#f87171`). Semantic tokens only, so both themes stay correct; `pnpm lint:theme` fails on any hex literal. **Exceptions** are the allowlist in `scripts/check-theme-tokens.mjs` (see [Guardrail](#guardrail-pnpm-linttheme)) — e.g. QR modules may use pure `#000000` / `#ffffff` for scanner reliability; wrap the pad in semantic `bg-card` chrome.
- No white text on brand green.
- No new one-off button styles — extend `Button` with a variant instead.
- No full-screen `ActivityIndicator` for initial loads.
- No CTL grids, Today calendar heatmaps, or dashboard clones (see [product-baseline.md](./product-baseline.md)). Athlete’s compact swipeable 12-week day-circle glance (Activity done/planned; Nutrition logged/gaps when tracking on) is allowed; keep it glance-scale (no streak gamification, no TSS/calorie heat legend).

