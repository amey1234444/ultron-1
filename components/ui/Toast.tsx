import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { alpha, consolePalette, variantStyle, type IconName, type Variant } from './tokens';

/**
 * Toast — a transient confirmation.
 *
 * Used for events the operator caused and already knows the intent of (a card
 * dropped onto an instrument pad), where a persistent Alert would be noise. It
 * states what was connected, holds for `durationMs`, then removes itself. The
 * countdown rule under the text makes the dismissal predictable instead of the
 * message vanishing without warning.
 *
 * Mount it with a `key` that changes per event so a repeat of the same message
 * restarts the timer rather than being swallowed as an unchanged element.
 */
export function Toast({
  variant = 'success',
  title,
  detail,
  icon,
  durationMs = 2000,
  onDone,
  style,
  className,
}: {
  variant?: Variant;
  title: string;
  detail?: string;
  icon?: IconName;
  /** How long the toast stays fully visible before it fades out. */
  durationMs?: number;
  onDone?: () => void;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const skin = variantStyle(palette, variant);

  const enter = useRef(new Animated.Value(0)).current;
  const countdown = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // 160ms in, hold for the requested window, 220ms out. The caller's
    // `durationMs` is the visible hold, so a "2 second" toast is legible for two
    // full seconds rather than spending a third of that animating.
    const animation = Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(durationMs),
      Animated.timing(enter, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const bar = Animated.sequence([
      Animated.delay(160),
      Animated.timing(countdown, { toValue: 0, duration: durationMs, easing: Easing.linear, useNativeDriver: false }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onDoneRef.current?.();
    });
    bar.start();

    return () => {
      animation.stop();
      bar.stop();
    };
  }, [countdown, durationMs, enter]);

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      className={cn('overflow-hidden rounded-xl border', className)}
      style={[
        {
          backgroundColor: palette.panel,
          borderColor: skin.border,
          shadowColor: palette.shadow,
          shadowOpacity: isDark ? 0.5 : 0.14,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
        },
        style,
      ]}
    >
      <View className="flex-row items-start gap-2.5 px-3.5 py-2.5">
        <View
          className="mt-[1px] h-6 w-6 items-center justify-center rounded-lg"
          style={{ backgroundColor: skin.tint }}
        >
          <MaterialCommunityIcons name={icon ?? skin.icon} size={14} color={skin.accent} />
        </View>
        <View className="min-w-0 gap-0.5" style={{ maxWidth: 380 }}>
          <Text className="font-body-bold text-[12.5px] tracking-[-0.01em]" style={{ color: palette.ink }} numberOfLines={2}>
            {title}
          </Text>
          {detail ? (
            <Text className="font-mono text-[10.5px] leading-[15px]" style={{ color: palette.inkMuted }} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      {/* Countdown rule — the toast shows how much of its life is left. */}
      <View style={{ height: 2, backgroundColor: alpha(skin.accent, 0.16) }}>
        <Animated.View
          style={{
            height: 2,
            backgroundColor: skin.accent,
            width: countdown.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      </View>
    </Animated.View>
  );
}
