import { View } from 'react-native';

/**
 * The small lit dot that stands in for a status icon.
 *
 * A dot rather than a glyph, everywhere a state is being announced — LIVE, the
 * condition on the health panel, a predicted mode, "no active condition". The
 * alternative is a coloured icon per state, which puts four or five saturated
 * shapes on one page and makes a healthy machine look as busy as a failing one.
 * A dot carries the same information in the one channel that is already
 * meaningful here: colour.
 *
 * The halo is a second circle behind the first at low opacity, not a shadow.
 * `shadowRadius` is three different features on web, iOS and Android — and on
 * Android it needs `elevation`, which also reorders the view — so a plain ring
 * is the only version that looks identical everywhere. It is deliberately faint:
 * the glow should be noticeable when you look at it and invisible when you are
 * reading the text beside it.
 */
export function StatusDot({
  colour,
  size = 8,
  glow = true,
}: {
  colour: string;
  /** Diameter of the solid centre. The halo scales with it. */
  size?: number;
  /** Off for dots in dense rows, where a halo on every line becomes noise. */
  glow?: boolean;
}) {
  const halo = Math.round(size * 2.1);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {glow ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            backgroundColor: colour,
            opacity: 0.22,
          }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour }} />
    </View>
  );
}
