import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View, type ViewStyle } from 'react-native';

import { LOGO_ASPECT, LOGO_DARK } from '../../../lib/brandLogos';

const LOGO_HEIGHT = 26;

const TRACK_WIDTH = 132;
const SEGMENT_WIDTH = 52;

/**
 * The wait between screens.
 *
 * One idea, done properly: the wordmark settles into place and a single hairline
 * carries a travelling highlight. The sweep is eased in and out rather than
 * linear, so it slows at each end the way a physical thing would — that easing
 * is the whole difference between this and a spinner. Nothing else moves, and
 * nothing counts up, because a loader that draws attention to itself makes the
 * wait feel longer than it is.
 */
export function AppLoader({ overlay = false }: { overlay?: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(6)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(rise, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]);
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    );
    entrance.start();
    loop.start();
    return () => {
      entrance.stop();
      loop.stop();
    };
  }, [fade, rise, sweep]);

  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-SEGMENT_WIDTH, TRACK_WIDTH],
  });

  return (
    <View
      style={
        (overlay
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0A0A0A',
            }
          : {
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0A0A0A',
            }) as ViewStyle
      }
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }], alignItems: 'center' }}>
        <Image
          source={LOGO_DARK}
          style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * LOGO_ASPECT }}
          resizeMode="contain"
          accessibilityLabel="BlackGATE"
        />

        <View
          style={{
            marginTop: 22,
            width: TRACK_WIDTH,
            height: 1,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.10)',
          }}
        >
          <Animated.View style={{ width: SEGMENT_WIDTH, height: 1, transform: [{ translateX }] }}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.85)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}
