// Mapping from the app's mapped measurement points onto the digital twin's
// canonical pilot sensor tags.
//
// Pilot sensor-tag architecture (10_handoff/final_tag_signal_list.csv):
//
//   E1   motor shaft speed        proximity switch, motor rear shaft, 1 target/rev
//   V1   motor vibration          Wilcoxon 786B-10 accelerometer
//   V2   gearbox vibration        Wilcoxon 786B-10 accelerometer
//   T1-3 barrel zone temperatures PT100, zones 1-3
//   T4   motor temperature        PT100
//   T5   gearbox temperature      PT100
//   P1   metering-zone melt pressure  Dynisco PT46X4
//   L1   hopper level             80-GHz radar
//   PM1  3-phase electrical       MULTISPAN MFM-13
//
// Two things this layer will not do, because the twin's whole discipline rests
// on them:
//
//  1. It never renames a measurement into a tag it is not. A box labelled
//     "Feed Throat Temperature" is not barrel zone 1 and a "Thrust Bearing
//     Temperature" is not the motor winding, so those stay unmapped and are
//     reported as such rather than quietly feeding a zone rule.
//  2. It never mixes the two vibration amplitude domains. mm/s is a
//     band-limited velocity RMS and is the only quantity the 8 mm/s
//     CON-VIBRATION hard limit may be compared against; g is a broadband
//     acceleration RMS and is the domain rolling-element and gear-mesh damage
//     actually lives in. The unit on the channel decides which one a reading is.

import { extruderPointByCode } from '../../extruderPoints';

export type ExtruderTag =
  | 'E1'
  | 'V1'
  | 'V2'
  | 'T1'
  | 'T2'
  | 'T3'
  | 'T4'
  | 'T5'
  | 'P1'
  | 'L1'
  | 'PM1.current'
  | 'PM1.power'
  | 'PM1.voltage'
  | 'PM1.power_factor';

export const CANONICAL_UNITS: Record<ExtruderTag, string> = {
  E1: 'rpm',
  V1: 'mm/s RMS',
  V2: 'mm/s RMS',
  T1: 'degC',
  T2: 'degC',
  T3: 'degC',
  T4: 'degC',
  T5: 'degC',
  P1: 'MPa',
  L1: 'percent',
  'PM1.current': 'A',
  'PM1.power': 'kW',
  'PM1.voltage': 'V',
  'PM1.power_factor': 'fraction',
};

export const TAG_LABELS: Record<ExtruderTag, string> = {
  E1: 'Motor shaft speed',
  V1: 'Motor vibration',
  V2: 'Gearbox vibration',
  T1: 'Barrel zone 1 temperature',
  T2: 'Barrel zone 2 temperature',
  T3: 'Barrel zone 3 temperature',
  T4: 'Motor temperature',
  T5: 'Gearbox temperature',
  P1: 'Melt pressure',
  L1: 'Hopper level',
  'PM1.current': 'Motor current',
  'PM1.power': 'Electrical power',
  'PM1.voltage': 'Line voltage',
  'PM1.power_factor': 'Power factor',
};

/** Which shaft an incoming speed measurement was taken on. */
export type SpeedDomain = 'motor' | 'screw';

export type TagMatch = {
  tag: ExtruderTag;
  /** Only meaningful for E1 — a screw-domain reading is converted through the gearbox ratio. */
  speedDomain?: SpeedDomain;
  note?: string;
};

// Evaluated in order, so the specific patterns come before the generic ones.
const LABEL_TO_TAG: { match: RegExp; result: TagMatch }[] = [
  // Explicit pilot tag names — a box labelled with the tag itself resolves directly.
  { match: /(^|[^a-z])e1([^a-z0-9]|$)/i, result: { tag: 'E1', speedDomain: 'motor' } },
  { match: /(^|[^a-z])v1([^a-z0-9]|$)/i, result: { tag: 'V1' } },
  { match: /(^|[^a-z])v2([^a-z0-9]|$)/i, result: { tag: 'V2' } },
  { match: /(^|[^a-z])l1([^a-z0-9]|$)/i, result: { tag: 'L1' } },
  { match: /(^|[^a-z])t4([^a-z0-9]|$)/i, result: { tag: 'T4' } },
  { match: /(^|[^a-z])t5([^a-z0-9]|$)/i, result: { tag: 'T5' } },
  { match: /pm1[\s._-]*power[\s._-]*factor/i, result: { tag: 'PM1.power_factor' } },
  { match: /pm1[\s._-]*voltage/i, result: { tag: 'PM1.voltage' } },
  { match: /pm1[\s._-]*power/i, result: { tag: 'PM1.power' } },
  { match: /pm1[\s._-]*current/i, result: { tag: 'PM1.current' } },

  // Electrical.
  { match: /(motor|drive|line)?\s*current/i, result: { tag: 'PM1.current' } },
  { match: /power\s*factor/i, result: { tag: 'PM1.power_factor' } },
  { match: /(line|supply)\s*voltage/i, result: { tag: 'PM1.voltage' } },
  { match: /(active|electrical|motor)\s*power|power\s*\(?k?w\)?/i, result: { tag: 'PM1.power' } },

  // Speed. E1 is the motor rear shaft; a screw-speed reading is the same
  // shaft seen through the controlled 20:1 gearbox ratio.
  {
    match: /screw\s*(shaft\s*)?(speed|rpm)/i,
    result: { tag: 'E1', speedDomain: 'screw', note: 'Screw-domain reading converted to the motor shaft through the controlled gearbox reduction ratio.' },
  },
  { match: /(motor|shaft|drive)\s*(shaft\s*)?(speed|rpm)/i, result: { tag: 'E1', speedDomain: 'motor' } },

  // Vibration by location. V1 is on the motor housing, V2 on the gearbox housing.
  { match: /(gearbox|gear\s*box|gear)\s*.*vib/i, result: { tag: 'V2' } },
  { match: /vib.*\b(gearbox|gear\s*box)\b/i, result: { tag: 'V2' } },
  { match: /motor\s*.*vib/i, result: { tag: 'V1' } },
  { match: /vib.*\bmotor\b/i, result: { tag: 'V1' } },

  // Temperatures by location.
  { match: /(barrel\s*)?zone\s*0*1\b.*temp|temp.*\bzone\s*0*1\b/i, result: { tag: 'T1' } },
  { match: /(barrel\s*)?zone\s*0*2\b.*temp|temp.*\bzone\s*0*2\b/i, result: { tag: 'T2' } },
  { match: /(barrel\s*)?zone\s*0*3\b.*temp|temp.*\bzone\s*0*3\b/i, result: { tag: 'T3' } },
  { match: /(gearbox|gear\s*box)\s*(oil\s*)?temp/i, result: { tag: 'T5' } },
  { match: /motor\s*(winding\s*|housing\s*)?temp/i, result: { tag: 'T4' } },

  // Process.
  { match: /(melt|metering|barrel)\s*pressure/i, result: { tag: 'P1' } },
  { match: /hopper\s*level|feed\s*(hopper\s*)?level|material\s*level/i, result: { tag: 'L1' } },
];

/**
 * Measurement points the extruder model deliberately leaves unmapped, with the
 * reason. These are surfaced in the UI so a mapped-but-unused point reads as a
 * declared modelling boundary rather than as a bug.
 */
const UNMODELLED: { match: RegExp; reason: string }[] = [
  {
    match: /\bnde\b/i,
    reason:
      'The pilot package carries one accelerometer per housing (V1 motor, V2 gearbox). A second non-drive-end motor channel has no declared healthy baseline and no rule of its own.',
  },
  {
    match: /die\s*head\s*pressure|die\s*pressure/i,
    reason:
      'P1 is the only installed melt-pressure transducer and it sits upstream of both the screen pack and the die. A separate die-head reading is not part of the controlled model, and the restriction rule already reports screen/die as an honest ambiguity.',
  },
  {
    match: /feed\s*throat\s*temp/i,
    reason:
      'The feed throat is upstream of barrel zone 1 and is normally cooled, so it is not a zone temperature. Rename the point to "Barrel Zone 1 Temperature" if it is in fact wired to zone 1.',
  },
  {
    match: /thrust\s*bearing\s*temp/i,
    reason:
      'The controlled temperature tags are the motor (T4) and gearbox (T5) housings. A thrust-bearing reading has no declared baseline of its own; rename it to "Motor Temperature" only if it is actually the motor housing sensor.',
  },
  {
    match: /material\s*temp|melt\s*temp/i,
    reason:
      'The melt temperature is a recipe target, not one of the three controlled barrel-zone measurements the heater and cooling rules compare against.',
  },
];

export type SignalResolution =
  | { kind: 'mapped'; tag: ExtruderTag; speedDomain?: SpeedDomain; note?: string }
  | { kind: 'unmodelled'; reason: string }
  | { kind: 'unrecognised' };

/**
 * Resolve a measurement-point label onto a canonical pilot tag.
 *
 * The exclusion list is consulted first, so a label the model has explicitly
 * declined ("Motor NDE Vibration") cannot fall through to the generic pattern
 * below it and be consumed as the motor channel.
 */
export function resolveSignal(label: string, templatePointCode?: string): SignalResolution {
  const registered = extruderPointByCode(templatePointCode);
  if (registered?.analyzerTag) {
    const tag = registered.analyzerTag === 'PM1' ? 'PM1.power' : registered.analyzerTag;
    return {
      kind: 'mapped',
      tag,
      ...(registered.analyzerTag === 'E1' ? { speedDomain: registered.code === 'SCREW_RPM' ? 'screw' as const : 'motor' as const } : {}),
    };
  }
  if (registered?.analyzerNote) return { kind: 'unmodelled', reason: registered.analyzerNote };
  const text = label.trim();
  if (!text) return { kind: 'unrecognised' };
  const unmodelled = UNMODELLED.find((entry) => entry.match.test(text));
  if (unmodelled) return { kind: 'unmodelled', reason: unmodelled.reason };
  const matched = LABEL_TO_TAG.find((entry) => entry.match.test(text));
  if (matched) return { kind: 'mapped', ...matched.result };
  return { kind: 'unrecognised' };
}

export class UnitError extends Error {}

export type NormalisedReading = {
  /** Canonical value in the tag's canonical unit, or null when the tag reported nothing. */
  value: number | null;
  unit: string;
  conversion: string;
  /**
   * Set when a V1/V2 reading arrived in the acceleration domain (g or m/s²).
   * That value is a broadband acceleration RMS and is deliberately kept out of
   * the mm/s velocity scalar, which is what the CON-VIBRATION limit bounds.
   */
  accelerationRmsG?: number;
};

const G = 9.80665;

/**
 * Convert a measurement into its canonical unit.
 *
 * Only explicitly supported alternate units are accepted; anything else is
 * rejected rather than silently assumed, which is what the twin's
 * `features.normalise` does.
 */
export function normaliseReading(
  tag: ExtruderTag,
  value: number | null,
  unit: string,
  speedDomain: SpeedDomain = 'motor',
  reductionRatio = 20,
): NormalisedReading {
  const expected = CANONICAL_UNITS[tag];
  const raw = (unit ?? '').trim();
  const lower = raw.toLowerCase();
  const finite = value !== null && value !== undefined && Number.isFinite(value);
  const scale = (factor: number, conversion: string): NormalisedReading => ({
    value: finite ? (value as number) * factor : null,
    unit: expected,
    conversion,
  });

  if (tag === 'P1') {
    if (lower === 'mpa') return scale(1, 'identity');
    if (lower === 'bar') return scale(0.1, 'bar_to_MPa');
    if (lower === 'kpa') return scale(0.001, 'kPa_to_MPa');
    if (lower === 'psi') return scale(0.00689476, 'psi_to_MPa');
    if (lower === 'pa') return scale(1e-6, 'Pa_to_MPa');
    throw new UnitError(`P1 requires MPa (or bar/kPa/psi/Pa); received ${raw || '(none)'}`);
  }

  if (tag === 'V1' || tag === 'V2') {
    // Velocity domain: the operator-facing scalar and the only quantity the
    // 8 mm/s hard limit may be compared against.
    if (lower === 'mm/s' || lower === 'mm/s rms' || lower === 'mms') {
      return { value: finite ? (value as number) : null, unit: expected, conversion: 'assumed_rms_basis_declared' };
    }
    if (lower === 'in/s' || lower === 'ips') {
      return { value: finite ? (value as number) * 25.4 : null, unit: expected, conversion: 'in_per_s_to_mm_per_s' };
    }
    // Acceleration domain: kept separate, never presented as mm/s.
    if (lower === 'g' || lower === 'g rms') {
      return {
        value: null,
        unit: 'g',
        conversion: 'acceleration_domain_retained_not_converted_to_velocity',
        accelerationRmsG: finite ? (value as number) : undefined,
      };
    }
    if (lower === 'm/s2' || lower === 'm/s^2' || lower === 'm/s²') {
      return {
        value: null,
        unit: 'g',
        conversion: 'm_per_s2_to_g',
        accelerationRmsG: finite ? (value as number) / G : undefined,
      };
    }
    throw new UnitError(`${tag} requires mm/s RMS (velocity) or g (acceleration); received ${raw || '(none)'}`);
  }

  if (tag.startsWith('T')) {
    if (lower === 'degc' || lower === '°c' || lower === 'c' || lower === 'celsius') return scale(1, 'identity');
    if (lower === 'degf' || lower === '°f' || lower === 'f') {
      return {
        value: finite ? ((value as number) - 32) / 1.8 : null,
        unit: expected,
        conversion: 'degF_to_degC',
      };
    }
    if (lower === 'k') {
      return { value: finite ? (value as number) - 273.15 : null, unit: expected, conversion: 'K_to_degC' };
    }
    throw new UnitError(`${tag} requires degC; received ${raw || '(none)'}`);
  }

  if (tag === 'E1') {
    if (lower !== 'rpm' && lower !== '') throw new UnitError(`E1 requires rpm; received ${raw}`);
    // E1 is the motor rear shaft. A screw-speed reading is the same rotation
    // seen through the controlled gearbox reduction ratio.
    if (speedDomain === 'screw') {
      return {
        value: finite ? (value as number) * reductionRatio : null,
        unit: expected,
        conversion: `screw_rpm_to_motor_rpm_x${reductionRatio}`,
      };
    }
    return scale(1, 'identity');
  }

  if (tag === 'L1') {
    if (lower === 'percent' || lower === '%' || lower === '') return scale(1, 'identity');
    throw new UnitError(`L1 requires percent; received ${raw}`);
  }

  if (tag === 'PM1.current') {
    if (lower === 'a' || lower === 'amp' || lower === 'amps' || lower === '') return scale(1, 'identity');
    if (lower === 'ma') return scale(0.001, 'mA_to_A');
    throw new UnitError(`PM1.current requires A; received ${raw}`);
  }

  if (tag === 'PM1.power') {
    if (lower === 'kw' || lower === '') return scale(1, 'identity');
    if (lower === 'w') return scale(0.001, 'W_to_kW');
    throw new UnitError(`PM1.power requires kW; received ${raw}`);
  }

  if (lower && lower !== expected.toLowerCase()) {
    throw new UnitError(`${tag} requires ${expected}; received ${raw}`);
  }
  return scale(1, 'identity');
}

/** Tags the model treats as essential evidence before any diagnosis is meaningful. */
export const ESSENTIAL_TAGS: ExtruderTag[] = ['P1', 'PM1.current', 'E1', 'T1', 'T2', 'T3'];

/** Tags that widen what can be separated, but whose absence does not block a diagnosis. */
export const DIAGNOSTIC_TAGS: ExtruderTag[] = ['V1', 'V2', 'T4', 'T5', 'L1'];

export const ALL_TAGS: ExtruderTag[] = [...ESSENTIAL_TAGS, ...DIAGNOSTIC_TAGS];
