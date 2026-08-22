import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { consolePalette, variantStyle, type IconName, type Variant } from './tokens';
import { tabular, text } from './type';

/**
 * Badge — a status pill.
 *
 * Colour never travels alone here. Every badge renders a coloured icon beside an
 * ink-coloured label, so the state survives colour-blindness, greyscale print and
 * forced-colors mode. Pass `icon={null}` only where an adjacent element already
 * carries the same meaning visually.
 */
export function Badge({
  children,
  variant = 'default',
  icon,
  outline = false,
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  /** Defaults to the variant's own icon. `null` suppresses it. */
  icon?: IconName | null;
  outline?: boolean;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);
  const glyph = icon === undefined ? style.icon : icon;

  return (
    <View
      className={cn('flex-row items-center gap-1.5 self-start rounded-md px-2 py-[3px]', className)}
      style={{
        backgroundColor: outline ? 'transparent' : style.tint,
        borderWidth: outline ? 1 : 0,
        borderColor: style.border,
      }}
    >
      {glyph ? <MaterialCommunityIcons name={glyph} size={11} color={style.accent} /> : null}
      {/* Sentence case, from the type scale, rather than a hand-rolled tracked
          uppercase of its own. Every label passed in here already arrives cased
          the way it should read — 'Normal', 'No reading', 'F-MOTOR-EFF' — so the
          CSS transform was doing nothing but shouting, and a signals table with
          eleven stencilled NORMAL pills down it buries the one row that is not.
          Codes stay upper case because they are written that way at source. */}
      <Text
        className={text.chip}
        style={{ color: variant === 'default' || variant === 'muted' ? palette.inkMuted : palette.ink }}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * A bare status dot, for dense rows where a full pill would dominate.
 *
 * Always pair it with a text label in the same row — a dot on its own is
 * colour-only encoding.
 */
export function StatusDot({ variant, size = 7 }: { variant: Variant; size?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: style.accent }} />;
}

/**
 * A monospaced key/value pair for provenance and metadata rows.
 *
 * Values use tabular figures because these stack into columns and must align.
 */
export function KeyValue({
  label,
  value,
  variant,
  className,
}: {
  label: string;
  value: string;
  variant?: Variant;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variant ? variantStyle(palette, variant).accent : undefined;
  return (
    <View className={cn('flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <Text className={text.label} style={{ color: palette.inkFaint }}>
        {label}
      </Text>
      <View className="min-w-0 flex-row items-center gap-1.5">
        {accent ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} /> : null}
        <Text className={text.data} style={[tabular, { color: palette.ink }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}
