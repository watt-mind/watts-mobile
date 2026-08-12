import { useFonts } from 'expo-font';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import materialSymbolsRegular from 'expo-symbols/androidWeights/regular';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * SF Symbol → Material Symbol for Android/web.
 * Keep in sync when adding icons — Android has no SF Symbols.
 */
const SF_TO_MD = {
  'chevron.right': 'chevron_right',
  'chevron.left': 'chevron_left',
  'chevron.down': 'expand_more',
  'list.bullet': 'format_list_bulleted',
  'list.bullet.rectangle': 'list_alt',
  calendar: 'calendar_month',
  'calendar.badge.clock': 'calendar_clock',
  'person.crop.circle': 'account_circle',
  bell: 'notifications',
  gearshape: 'settings',
  globe: 'language',
  'hand.raised': 'privacy_tip',
  'doc.text': 'description',
  'questionmark.circle': 'help',
  'circle.lefthalf.filled': 'contrast',
  heart: 'favorite',
  'heart.fill': 'favorite',
  ruler: 'straighten',
  'figure.run': 'directions_run',
  link: 'link',
  'link.circle': 'devices',
  'bubble.left.and.bubble.right': 'forum',
  'square.and.arrow.up': 'ios_share',
  trash: 'delete',
  flag: 'flag',
  creditcard: 'credit_card',
  'rectangle.portrait.and.arrow.right': 'logout',
  'drop.fill': 'water_drop',
  'clock.fill': 'schedule',
  'moon.stars': 'moon_stars',
  'waveform.path.ecg': 'ecg',
  'wrench.and.screwdriver': 'build',
  plus: 'add',
  checkmark: 'check',
  'checkmark.circle': 'check_circle',
  'checkmark.circle.fill': 'check_circle',
  'arrow.up': 'arrow_upward',
  'mic.fill': 'mic',
  'stop.fill': 'stop',
  eye: 'visibility',
  thermometer: 'device_thermostat',
  'cross.case.fill': 'medical_services',
  'battery.25percent': 'battery_2_bar',
  'cloud.bolt': 'thunderstorm',
  allergens: 'allergy',
  'bolt.fill': 'bolt',
  'arrow.triangle.2.circlepath': 'autorenew',
  'square.and.pencil': 'edit_note',
  leaf: 'eco',
  'leaf.fill': 'eco',
  'flame.fill': 'local_fire_department',
  'fork.knife': 'restaurant',
  'dumbbell.fill': 'fitness_center',
  'drop.halffull': 'opacity',
  'gauge.with.dots.needle.33percent': 'speed',
  'exclamationmark.triangle': 'warning',
  'heart.text.square.fill': 'health_and_safety',
  qrcode: 'qr_code',
  envelope: 'mail',
  /** External-link marker: iOS leans on the arrow, Android on the open-in-new box. */
  'arrow.up.right': 'open_in_new',
  'camera.fill': 'photo_camera',
  'barcode.viewfinder': 'barcode_scanner',
  magnifyingglass: 'search',
  xmark: 'close',
  'xmark.circle.fill': 'cancel',
  'bell.slash': 'notifications_off',
  flame: 'local_fire_department',
} as const satisfies Record<string, AndroidSymbol>;

export type MappedSFSymbol = keyof typeof SF_TO_MD;

/** Cross-platform glyph: SF Symbols on iOS, Material Symbols on Android. */
export function AppSymbol({
  sf,
  md,
  size = 18,
  tintColor,
  fallback,
  style,
}: {
  sf: SFSymbol;
  /** Override Material Symbol when the shared map has no entry. */
  md?: AndroidSymbol;
  size?: number;
  tintColor?: string;
  /** Emoji / text shown only if the platform glyph cannot load. */
  fallback?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const android = md ?? (SF_TO_MD as Record<string, AndroidSymbol | undefined>)[sf];
  const name = android ? { ios: sf, android, web: android } : sf;
  // Stand-in for a glyph, so it obeys the same fixed icon slot rather than Dynamic Type.
  const fallbackNode =
    fallback != null ? (
      <Text allowFontScaling={false} style={{ fontSize: Math.max(10, size - 2), color: tintColor }}>
        {fallback}
      </Text>
    ) : undefined;

  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={tintColor}
        style={[{ width: size, height: size }, style]}
        fallback={fallbackNode}
      />
    );
  }

  if (!android) return <View style={[{ width: size, height: size }, style]}>{fallbackNode}</View>;

  return <MaterialGlyph symbol={android} size={size} tintColor={tintColor} style={style} />;
}

/**
 * Android/web have no SF Symbols, and expo-symbols' `SymbolView` paints the Material glyph
 * as a `<Text>` it never opts out of Dynamic Type — inside a box it sizes from the same
 * `size` prop. At an OS font scale > 1 the glyph therefore always renders larger than the
 * box that positions it, and Android clips children to that box: the icon loses its right
 * and bottom edges and its visible mass skews up-left, off-centre in the circular buttons
 * (the CW-303 symptom). No prop combination fixes that from outside, so paint the glyph
 * here instead — icons are chrome, not prose, and must stay the size the layout reserved.
 *
 * Geometry: Material Symbols glyphs are 1em advance with their ink centred 0.5em above the
 * baseline, and `lineHeight === fontSize` puts that baseline 1em below the text top, so the
 * ink lands dead centre of a size×size box. Icon names double as font ligatures, which is
 * why the symbol name is rendered verbatim.
 */
function MaterialGlyph({
  symbol,
  size,
  tintColor,
  style,
}: {
  symbol: AndroidSymbol;
  size: number;
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [loaded] = useFonts({ [materialSymbolsRegular.name]: materialSymbolsRegular.font });

  return (
    <View style={[{ width: size, height: size }, style]}>
      {loaded ? (
        <Text
          allowFontScaling={false}
          // The ligature source text is readable ("photo_camera"), unlike the private-use
          // codepoint it replaces — keep it out of the tree so TalkBack announces the
          // control's own label and not the icon's name.
          accessible={false}
          importantForAccessibility="no"
          aria-hidden
          style={{
            width: size,
            fontFamily: materialSymbolsRegular.name,
            fontSize: size,
            lineHeight: size,
            textAlign: 'center',
            color: tintColor,
          }}
        >
          {symbol}
        </Text>
      ) : null}
    </View>
  );
}
