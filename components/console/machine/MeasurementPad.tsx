import { Circle, G } from 'react-native-svg';

/**
 * One instrument pad on a machine drawing.
 *
 * Extracted from `SingleScrewExtruder` so every machine template draws wiring
 * state the same way. Two machines that disagree about what "linked" looks like
 * would be worse than either of them being wrong on its own.
 *
 * Three states, drawn as three different *marks* rather than three shades of
 * one: empty is a hollow ring, wired is a filled pad, and a pad whose card is
 * reporting carries a halo. Shape does the work, so the states survive
 * greyscale, colour-blind viewing, projectors and screenshots.
 *
 * Stroke widths are declared in the artwork's own user space, so a pad scales
 * in exact proportion with the machine it sits on. That is deliberate rather
 * than an oversight: `non-scaling-stroke` would hold the outline at a fixed
 * device width while the machine grew or shrank around it, which is the thing
 * that actually makes pads look wrong at the extremes of zoom.
 */
export type MeasurementPadState = 'idle' | 'linked' | 'live';

export type MeasurementPadProps = {
  x: number;
  y: number;
  state: MeasurementPadState;
  /** Status colour for the pad. */
  accent: string;
  /** The surface behind the pad, used for the hollow centre and the wired rim. */
  panel: string;
  /**
   * Spoken name for the pad. Rendered as `aria-label` on web; the interaction
   * itself lives in the trail board above this layer, which owns focus and
   * keyboard handling.
   */
  label?: string;
};

/**
 * `aria-*` and `role` are not in react-native-svg's prop types, but its web
 * shim spreads unrecognised props straight onto the DOM node, so they land as
 * real attributes. Native ignores them. One cast, contained here, rather than
 * an `any` at every call site.
 */
function ariaProps(label: string | undefined): Record<string, string> {
  return label ? { 'aria-label': label, role: 'img' } : { 'aria-hidden': 'true' };
}

export function MeasurementPad({ x, y, state, accent, panel, label }: MeasurementPadProps) {
  const wired = state !== 'idle';
  const live = state === 'live';
  return (
    <G {...ariaProps(label)}>
      {live && <Circle cx={x} cy={y} r={12} fill={accent} opacity={0.16} />}
      <Circle cx={x} cy={y} r={9} fill={accent} opacity={wired ? 0.18 : 0.08} />
      <Circle
        cx={x}
        cy={y}
        r={5}
        fill={wired ? accent : panel}
        stroke={wired ? panel : accent}
        strokeWidth={wired ? 1.4 : 1.6}
        opacity={wired ? 1 : 0.75}
      />
      {wired && <Circle cx={x} cy={y} r={2} fill="#ffffff" opacity={0.82} />}
    </G>
  );
}

/** Human-readable state text, for accessible names and QA overlays. */
export function padStateLabel(state: MeasurementPadState): string {
  return state === 'live' ? 'receiving data' : state === 'linked' ? 'configured' : 'available';
}
