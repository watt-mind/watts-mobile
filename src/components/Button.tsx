import { ActivityIndicator, Text } from 'react-native';

import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { hapticLight } from '@/src/lib/haptics';
import { Colors } from '@/src/theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Light impact on press. Defaults to true. */
  haptic?: boolean;
  className?: string;
  testID?: string;
};

const containerByVariant: Record<ButtonVariant, string> = {
  primary: 'bg-brand-action',
  secondary: 'border border-border-strong',
  danger: 'bg-border-strong',
};

const labelByVariant: Record<ButtonVariant, string> = {
  primary: 'text-ink',
  secondary: 'text-text-primary',
  danger: 'text-danger',
};

const spinnerByVariant: Record<ButtonVariant, string> = {
  primary: Colors.ink, // dark ink on brand fill — theme-invariant
  secondary: Colors.brand,
  danger: Colors.danger,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  haptic = true,
  className = '',
  testID,
}: ButtonProps) {
  const blocked = disabled || loading;
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      className={`flex-row items-center justify-center gap-2 rounded-xl py-3.5 ${
        containerByVariant[variant]
      } ${disabled && !loading ? 'opacity-50' : ''} ${loading ? 'opacity-80' : ''} ${className}`}
      onPress={() => {
        if (haptic) hapticLight();
        onPress();
      }}
      disabled={blocked}
    >
      {/* Keep the label while busy: a spinner-only button reads as "the button
          disappeared" when work stalls, which is how an onboarding step became
          an unlabelled pill with no way forward. */}
      {loading ? <ActivityIndicator size="small" color={spinnerByVariant[variant]} /> : null}
      <Text
        className={`shrink text-base font-semibold ${labelByVariant[variant]}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
