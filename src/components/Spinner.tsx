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
 * `tone` covers the two tints in use across the app — the brand default and a
 * de-emphasised `muted` for secondary/background work. It is a closed union
 * rather than a free-form `color` prop on purpose: an escape hatch would just
 * reopen the hand-tinting bypass this component exists to close. A spinner
 * that needs a genuinely different tint (e.g. sitting on a filled button, see
 * `Button.tsx`) belongs outside this component, not behind a `color` prop.
 */
export function Spinner({
  size = 'small',
  className,
  tone = 'brand',
}: {
  size?: 'small' | 'large';
  className?: string;
  tone?: 'brand' | 'muted';
}) {
  const theme = useThemeColors();
  const color = tone === 'muted' ? theme.textMuted : theme.brandOnSurface;
  return <ActivityIndicator size={size} color={color} className={className} />;
}
