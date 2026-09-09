/**
 * The circular loader shown while the machine is on its way.
 *
 * The stage used to render an `ActivityIndicator` for this, and it was never
 * seen once: the notice lived inside the layer the stage holds at `opacity: 0`
 * until the first projection arrives. So for the whole of a 3.6 MB download and
 * a 280k-triangle parse the operator was shown a completely empty panel, and
 * the only honest reading of an empty panel is that something is broken. This
 * renders outside that layer, which is the actual fix; the ring is what makes
 * the wait legible once it is visible at all.
 *
 * It is determinate wherever it can be. `machineAssetProgress` counts the
 * asset's bytes as they arrive, so during the download the arc is real
 * progress, not decoration. When the body is complete and three.js moves on to
 * parsing -- no network events, unknown duration -- the ring switches to a
 * rotating arc, because a bar that sits still at 100% reads worse than one that
 * admits it is waiting.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import {
  readMachineProgress,
  subscribeMachineProgress,
  type MachineLoadProgress,
} from './machineAssetProgress';

/** Ring geometry, in px. Sized to read at a glance without dominating the stage. */
const SIZE = 54;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Fraction of the ring the indeterminate arc occupies. */
const SWEEP = 0.24;

/**
 * Where the determinate phase stops.
 *
 * The download is most of the wait but not all of it, so the arc is mapped into
 * the first 88% of the ring. Running it to a full circle and then continuing to
 * show a loader is the specific thing that makes people think a UI has hung.
 */
const DOWNLOAD_SHARE = 0.88;

/** Live progress for one asset, as React state. */
function useMachineProgress(modelUrl: string): MachineLoadProgress {
  const [progress, setProgress] = useState<MachineLoadProgress>(() => readMachineProgress(modelUrl));

  useEffect(() => {
    // Re-read on subscribe: bytes can land between the initial state and here.
    setProgress(readMachineProgress(modelUrl));
    return subscribeMachineProgress(modelUrl, setProgress);
  }, [modelUrl]);

  return progress;
}

export function MachineLoadingRing({
  dark,
  modelUrl,
  message,
}: {
  dark: boolean;
  modelUrl: string;
  message?: string;
}) {
  const progress = useMachineProgress(modelUrl);
  const spin = useRef(new Animated.Value(0)).current;

  const determinate = progress.phase === 'downloading' && progress.ratio !== null;

  useEffect(() => {
    // One looped driver, started once and left running for the lifetime of the
    // indicator. `useNativeDriver` is false because react-native-svg on web
    // animates through style, not through a native node.
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const rotation = useMemo(
    () => spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [spin],
  );

  const track = dark ? 'rgba(245,245,245,0.10)' : 'rgba(17,24,39,0.10)';
  const accent = '#55D98B';
  const label = dark ? 'rgba(245,245,245,0.66)' : 'rgba(17,24,39,0.60)';
  const readout = dark ? 'rgba(245,245,245,0.88)' : 'rgba(17,24,39,0.82)';

  const filled = determinate ? (progress.ratio ?? 0) * DOWNLOAD_SHARE : SWEEP;
  const dashOffset = CIRCUMFERENCE * (1 - filled);

  const caption =
    message ??
    (progress.phase === 'failed'
      ? 'Retrying the machine asset…'
      : determinate
        ? 'Loading machine'
        : 'Preparing machine');

  const percent = determinate ? Math.round((progress.ratio ?? 0) * 100) : null;

  const ring = (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke={track}
        strokeWidth={STROKE}
        fill="none"
      />
      {/* Rotated -90 degrees so the arc starts at twelve o'clock. Wrapped in an
          animated group only while indeterminate; a determinate arc that also
          span would be two different pieces of information in one mark. */}
      <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
        />
      </G>
    </Svg>
  );

  return (
    <View
      style={{ alignItems: 'center', justifyContent: 'center', gap: 10 }}
      // The whole thing is one status message, not four separate strings.
      accessibilityRole={Platform.OS === 'web' ? ('progressbar' as never) : undefined}
      accessibilityLabel={percent === null ? caption : `${caption}, ${percent}%`}
    >
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {determinate ? (
          ring
        ) : (
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>{ring}</Animated.View>
        )}
        {percent === null ? null : (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            pointerEvents="none"
          >
            <Text
              style={{
                fontSize: 11,
                fontVariant: ['tabular-nums'],
                color: readout,
              }}
            >
              {percent}%
            </Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 11.5, textAlign: 'center', color: label }}>{caption}</Text>
    </View>
  );
}

/** Kept exported so the stage can size its own placeholder to match. */
export const MACHINE_LOADING_RING_SIZE = SIZE;
