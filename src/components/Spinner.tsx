import { ActivityIndicator } from 'react-native';

import { useThemeColors } from '@/src/theme/useThemeColors';

/**
 * Brand-tinted loading spinner.
 *
 * Exists so a spinner picks up `brandOnSurface` per theme rather than the
 * invariant brand fill: #00DC82 on light #fafafa is 1.74:1, so a raw
 * `<ActivityIndicator color={Colors.brand} />` is nearly invisible in light
 * mode. Prefer this over hand-tinting ActivityIndicator.
 *
 * `tone` is a closed union rather than a free-form `color` prop on purpose: an
 * escape hatch would just reopen the hand-tinting bypass this component exists
 * to close. The rule that keeps it closed is that **every tone names a semantic
 * foreground on the theme's own surface**, and resolves to the matching
 * `*OnSurface` / muted token:
 *
 * - `brand` — the default; ordinary work in flight.
 * - `muted` — de-emphasised secondary/background work.
 * - `danger` — a *destructive* operation in flight (deleting a record). Not
 *   "make it red": it is the loading counterpart of `Button`'s `danger`
 *   variant, and picks up `dangerOnSurface` per theme (#f87171 dark, #b91c1c
 *   light) so it stays legible on both.
 *
 * A spinner whose tint is not a surface foreground does not belong here. That
 * covers a spinner on a filled button (it needs ink against the fill — see
 * `Button.tsx`) and one whose tint is data-driven rather than semantic (the
 * per-tool-domain hues in `CoachChat.tsx`). Those stay raw and allowlisted in
 * `__tests__/spinnerUsage.test.ts`; adding an `onFill`-style tone would break
 * the surface-foreground invariant and turn this union back into a colour prop.
 */
export function Spinner({
  size = 'small',
  className,
  tone = 'brand',
}: {
  size?: 'small' | 'large';
  className?: string;
  tone?: 'brand' | 'muted' | 'danger';
}) {
  const theme = useThemeColors();
  const colorByTone = {
    brand: theme.brandOnSurface,
    muted: theme.textMuted,
    danger: theme.dangerOnSurface,
  } as const;
  return <ActivityIndicator size={size} color={colorByTone[tone]} className={className} />;
}
