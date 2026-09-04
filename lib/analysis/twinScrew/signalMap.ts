/**
 * Mapping from the app's mapped measurement points onto the twin screw's
 * canonical signal tags.
 *
 * Built to the same discipline as the single-screw map
 * (`lib/analysis/extruder/signalMap.ts`), against a different machine. Two
 * things this layer will not do, because the whole value of the mapping rests
 * on them:
 *
 *  1. It never renames a measurement into a tag it is not. A "Feed Throat
 *     Temperature" is not barrel zone 1, a barrel *metal* temperature is not
 *     melt temperature, a side-feeder speed is not the main screw speed, and
 *     motor speed is not screw speed. Those stay unmapped and are reported as
 *     such rather than quietly feeding a rule.
 *
 *  2. It never mixes the two vibration amplitude domains. mm/s is a
 *     band-limited velocity RMS; g is a broadband acceleration RMS, and that is
 *     the domain rolling-element and gear-mesh damage actually lives in. The
 *     unit on the channel decides which one a reading is, and a limit declared
 *     in one domain is never compared against a value in the other.
 *
 * A third rule is specific to this machine: Screw A and Screw B are separate
 * shafts with separate measurements. They are never averaged into a single
 * "screw speed", because the difference between them is the signal — a drive
 * imbalance is invisible in the mean.
 */

import {
  twinScrewPointByCode,
  type TwinScrewModelStatus,
  type TwinScrewTag,
} from '../../twinScrewExtruderPoints';

/** The physical quantity a tag carries, and the unit it is normalised to. */
export const CANONICAL_UNITS: Record<TwinScrewTag, string> = {
  'TS-E1': 'rpm',
  'TS-V1': 'mm/s RMS',
  'TS-V2': 'mm/s RMS',
  'TS-V3': 'mm/s RMS',
  'TS-V4': 'mm/s RMS',
  'TS-V5': 'mm/s RMS',
  'TS-T1': 'degC',
  'TS-T2': 'degC',
  'TS-T3': 'degC',
  'TS-PM1': 'kW',
  'TS-S1': 'rpm',
  'TS-S2': 'rpm',
  'TS-L1': 'percent',
  'TS-F1': 'kg/h',
  'TS-N1': 'rpm',
  'TS-I1': 'A',
  'TS-F2': 'kg/h',
  'TS-N2': 'rpm',
  'TS-I2': 'A',
  'TS-TT0': 'degC',
  'TS-TZ1': 'degC',
  'TS-TZ2': 'degC',
  'TS-TZ3': 'degC',
  'TS-TZ4': 'degC',
  'TS-TZ5': 'degC',
  'TS-TZ6': 'degC',
  'TS-TZ7': 'degC',
  'TS-TZ8': 'degC',
  'TS-TZ9': 'degC',
  'TS-P1': 'MPa',
  'TS-P2': 'MPa',
  'TS-PV': 'MPa',
  'TS-TV': 'degC',
  'TS-TM': 'degC',
  'TS-P3': 'MPa',
  'TS-P4': 'MPa',
};

/** Which amplitude domain a vibration reading arrived in. */
export type VibrationDomain = 'velocity' | 'acceleration';

/** Which shaft a speed measurement was taken on. Never inferred. */
export type SpeedDomain = 'motor' | 'screw-a' | 'screw-b' | 'feeder';

export type SignalResolution =
  | {
      kind: 'mapped';
      tag: TwinScrewTag;
      modelStatus: TwinScrewModelStatus;
      /** Present when the tag is a speed: which shaft it belongs to. */
      speedDomain?: SpeedDomain;
      /** Why no commissioned rule reads it, when none does. */
      note?: string;
    }
  | { kind: 'unmodelled'; reason: string }
  | { kind: 'unrecognised' };

/**
 * Labels this model refuses to consume, and why.
 *
 * Consulted before the generic patterns, so a label the model has explicitly
 * declined cannot fall through and be eaten by a looser rule below it. Each
 * entry names the rename that *would* be legitimate, so a genuinely
 * mis-labelled point can be corrected rather than argued with.
 */
const REFUSED: { match: RegExp; reason: string }[] = [
  {
    match: /feed\s*throat\s*temp/i,
    reason:
      'The feed throat sits upstream of barrel zone 1 and is normally cooled, so it is not a zone temperature and is never read as TS-TZ1. Rename the point to "Barrel Temperature Zone 1" only if it is in fact wired to zone 1.',
  },
  {
    match: /(barrel|zone)\s*.*\b(metal|surface|skin|shell)\b.*temp|temp.*\b(metal|surface|skin|shell)\b/i,
    reason:
      'A barrel metal / shell temperature is the heater band reading, not the melt. It is never promoted to TS-TM. Melt temperature is the immersion probe in the die adapter.',
  },
  {
    match: /(screw\s*)?torque/i,
    reason:
      'Screw torque is not an installed measurement on this machine. Motor power (TS-PM1) is a different quantity and is never relabelled as torque; a torque value would have to be derived from power and shaft speed, with its provenance recorded.',
  },
  {
    match: /specific\s*energy|sme\b/i,
    reason:
      'Specific mechanical energy is a derived index requiring power and a commissioned throughput reference. Neither is declared for this machine, so it is not synthesised.',
  },
  {
    match: /die\s*(head\s*)?(pressure|temp)/i,
    reason:
      'The installed transducers are the two screen-changer tappings (TS-P3 inlet, TS-P4 outlet). A separate die-head reading is not part of this machine, and the screen differential already reports the restriction it would be used for.',
  },
];

/**
 * Label patterns, evaluated in order so specific beats generic.
 *
 * Every speed pattern declares its shaft explicitly. There is deliberately no
 * bare `/speed|rpm/` fallback: on a machine with a motor, two screws and two
 * feeders, an unqualified speed cannot be assigned to a shaft without guessing,
 * and guessing here is exactly what produces a confident wrong answer.
 */
const LABEL_TO_TAG: { match: RegExp; tag: TwinScrewTag; speedDomain?: SpeedDomain }[] = [
  // Feeders first — "side feeder speed" must not be caught by a screw pattern.
  { match: /side\s*feed(er)?\s*.*rate|side\s*feed(er)?\s*(kg|flow)/i, tag: 'TS-F2' },
  { match: /side\s*feed(er)?\s*.*(speed|rpm)/i, tag: 'TS-N2', speedDomain: 'feeder' },
  { match: /side\s*feed(er)?\s*.*current/i, tag: 'TS-I2' },
  { match: /main\s*feed(er)?\s*.*rate|main\s*feed(er)?\s*(kg|flow)/i, tag: 'TS-F1' },
  { match: /main\s*feed(er)?\s*.*(speed|rpm)/i, tag: 'TS-N1', speedDomain: 'feeder' },
  { match: /main\s*feed(er)?\s*.*current/i, tag: 'TS-I1' },
  { match: /hopper\s*level|material\s*level/i, tag: 'TS-L1' },

  // Screw shafts, named individually.
  { match: /screw\s*(a|1)\b.*(speed|rpm)|(speed|rpm).*screw\s*(a|1)\b/i, tag: 'TS-S1', speedDomain: 'screw-a' },
  { match: /screw\s*(b|2)\b.*(speed|rpm)|(speed|rpm).*screw\s*(b|2)\b/i, tag: 'TS-S2', speedDomain: 'screw-b' },
  { match: /motor\s*(shaft\s*)?(speed|rpm)/i, tag: 'TS-E1', speedDomain: 'motor' },

  // Vibration by housing. Input and output gearbox housings stay separate.
  { match: /gear\s*box|gearbox/i, tag: 'TS-V3' }, // refined below by in/out
  { match: /motor\s*.*\bde\b.*vib|motor\s*driv/i, tag: 'TS-V1' },
  { match: /motor\s*.*\bnde\b.*vib|non[-\s]*driv/i, tag: 'TS-V2' },

  // Temperatures by location.
  { match: /motor\s*(winding\s*|housing\s*)?temp/i, tag: 'TS-T1' },
  { match: /(gearbox|gear\s*box)\s*(oil\s*)?temp/i, tag: 'TS-T2' },
  { match: /thrust\s*bearing\s*temp/i, tag: 'TS-T3' },
  { match: /vent\s*.*temp/i, tag: 'TS-TV' },
  { match: /melt\s*temp/i, tag: 'TS-TM' },

  // Process pressure.
  { match: /vent\s*.*(pressure|vacuum)|vacuum/i, tag: 'TS-PV' },
  { match: /screen\s*inlet/i, tag: 'TS-P3' },
  { match: /screen\s*outlet/i, tag: 'TS-P4' },
];

/** Barrel zones resolve by number rather than by nine near-identical patterns. */
const ZONE_TAGS: TwinScrewTag[] = ['TS-TZ1', 'TS-TZ2', 'TS-TZ3', 'TS-TZ4', 'TS-TZ5', 'TS-TZ6', 'TS-TZ7', 'TS-TZ8', 'TS-TZ9'];

function zoneTagFor(label: string): TwinScrewTag | null {
  const match = /(?:barrel\s*)?(?:temperature\s*)?zone\s*0*([1-9])\b/i.exec(label);
  if (!match) return null;
  return ZONE_TAGS[Number(match[1]) - 1] ?? null;
}

/** Intermediate melt pressure, by number. */
function intermediatePressureTagFor(label: string): TwinScrewTag | null {
  const match = /intermediate\s*(?:melt\s*)?pressure\s*0*([12])\b/i.exec(label);
  if (!match) return null;
  return match[1] === '1' ? 'TS-P1' : 'TS-P2';
}

/**
 * Which quantity a channel on the motor electrical pad carries.
 *
 * TS-PM1 is one instrument, so the drawing has one pad for it and which
 * quantity is wired there is a property of the channel. Deciding by unit keeps
 * the two honest: amps are current, kilowatts are power. The distinction
 * matters because a load rule would be declared on one and not the other.
 */
export function electricalQuantityForUnit(unit: string | undefined): 'current' | 'power' | 'voltage' | 'power_factor' {
  const lower = (unit ?? '').trim().toLowerCase();
  if (['a', 'amp', 'amps', 'ma'].includes(lower)) return 'current';
  if (['v', 'kv', 'volt', 'volts'].includes(lower)) return 'voltage';
  if (['pf', 'fraction'].includes(lower)) return 'power_factor';
  return 'power';
}

/**
 * Resolve a measurement point onto a canonical tag.
 *
 * The registry is consulted first: a point placed on the drawing carries its
 * own identity, and that beats any pattern match on a label a user may have
 * edited. Patterns are the fallback for a hand-labelled card that was never
 * snapped to a pad.
 */
export function resolveSignal(label: string, templatePointCode?: string): SignalResolution {
  const registered = twinScrewPointByCode(templatePointCode);
  if (registered) {
    return {
      kind: 'mapped',
      tag: registered.analyzerTag,
      modelStatus: registered.modelStatus,
      ...(registered.analyzerTag === 'TS-E1' ? { speedDomain: 'motor' as const } : {}),
      ...(registered.analyzerTag === 'TS-S1' ? { speedDomain: 'screw-a' as const } : {}),
      ...(registered.analyzerTag === 'TS-S2' ? { speedDomain: 'screw-b' as const } : {}),
      ...(registered.analyzerNote ? { note: registered.analyzerNote } : {}),
    };
  }

  const text = label.trim();
  if (!text) return { kind: 'unrecognised' };

  const refused = REFUSED.find((entry) => entry.match.test(text));
  if (refused) return { kind: 'unmodelled', reason: refused.reason };

  const zone = zoneTagFor(text);
  if (zone) return { kind: 'mapped', tag: zone, modelStatus: 'integrity-only' };

  const intermediate = intermediatePressureTagFor(text);
  if (intermediate) return { kind: 'mapped', tag: intermediate, modelStatus: 'integrity-only' };

  // Gearbox vibration needs the housing before it can be assigned a tag.
  if (/vib/i.test(text) && /gear\s*box|gearbox/i.test(text)) {
    if (/\bin(put)?\b/i.test(text)) return { kind: 'mapped', tag: 'TS-V3', modelStatus: 'integrity-only' };
    if (/out(put)?\s*[-\s]?1\b/i.test(text)) return { kind: 'mapped', tag: 'TS-V4', modelStatus: 'integrity-only' };
    if (/out(put)?\s*[-\s]?2\b/i.test(text)) return { kind: 'mapped', tag: 'TS-V5', modelStatus: 'integrity-only' };
    return {
      kind: 'unmodelled',
      reason:
        'This machine carries three gearbox accelerometers (input TS-V3, output-1 TS-V4, output-2 TS-V5). An unqualified "gearbox vibration" cannot be assigned to a housing without guessing, so it is left unmapped. Name the housing in the label.',
    };
  }

  const matched = LABEL_TO_TAG.filter((entry) => !/gear\s*box|gearbox/i.test(entry.match.source)).find((entry) =>
    entry.match.test(text),
  );
  if (matched) {
    return {
      kind: 'mapped',
      tag: matched.tag,
      modelStatus: 'integrity-only',
      ...(matched.speedDomain ? { speedDomain: matched.speedDomain } : {}),
    };
  }

  if (/(speed|rpm)/i.test(text)) {
    return {
      kind: 'unmodelled',
      reason:
        'This machine has five rotating shafts (motor, screw A, screw B, main feeder, side feeder). An unqualified speed cannot be assigned to one of them without guessing, so it is left unmapped. Name the shaft in the label.',
    };
  }

  return { kind: 'unrecognised' };
}

export class UnitError extends Error {}

export type NormalisedReading = {
  /** Value in the tag's canonical unit, or null when nothing was reported. */
  value: number | null;
  unit: string;
  conversion: string;
  /**
   * Set when a vibration channel arrived in the acceleration domain. Kept apart
   * from the velocity scalar on purpose: a limit declared in mm/s may never be
   * compared against a broadband acceleration RMS in g.
   */
  domain?: VibrationDomain;
};

const G_TO_MS2 = 9.80665;

/**
 * Convert a reading into its canonical unit.
 *
 * Only explicitly supported units are accepted. An unrecognised unit throws
 * rather than being assumed, because a silently assumed unit is how a value in
 * the wrong domain reaches a threshold comparison.
 */
export function normaliseReading(tag: TwinScrewTag, value: number | null, unit: string): NormalisedReading {
  const expected = CANONICAL_UNITS[tag];
  const raw = (unit ?? '').trim();
  const lower = raw.toLowerCase();
  const finite = value !== null && value !== undefined && Number.isFinite(value);
  const scale = (factor: number, conversion: string, domain?: VibrationDomain): NormalisedReading => ({
    value: finite ? (value as number) * factor : null,
    unit: expected,
    conversion,
    ...(domain ? { domain } : {}),
  });

  if (expected === 'mm/s RMS') {
    if (['mm/s', 'mm/s rms', 'mms'].includes(lower)) return scale(1, 'identity', 'velocity');
    if (['in/s', 'ips'].includes(lower)) return scale(25.4, 'in_per_s_to_mm_per_s', 'velocity');
    // Acceleration is a different physical quantity. It is carried through with
    // its domain declared, never converted into the velocity scalar.
    if (['g', 'g rms'].includes(lower)) return scale(G_TO_MS2, 'g_to_m_per_s2', 'acceleration');
    if (['m/s2', 'm/s^2', 'm/s²'].includes(lower)) return scale(1, 'identity', 'acceleration');
    throw new UnitError(`${tag} requires mm/s or in/s (velocity) or g / m/s² (acceleration); received ${raw || '(none)'}`);
  }

  if (expected === 'degC') {
    if (['degc', '°c', 'c', 'celsius'].includes(lower)) return scale(1, 'identity');
    if (['k', 'kelvin'].includes(lower)) {
      return { value: finite ? (value as number) - 273.15 : null, unit: expected, conversion: 'K_to_degC' };
    }
    if (['degf', '°f', 'f'].includes(lower)) {
      return { value: finite ? ((value as number) - 32) / 1.8 : null, unit: expected, conversion: 'degF_to_degC' };
    }
    throw new UnitError(`${tag} requires degC (or K/degF); received ${raw || '(none)'}`);
  }

  if (expected === 'MPa') {
    if (lower === 'mpa') return scale(1, 'identity');
    if (lower === 'bar') return scale(0.1, 'bar_to_MPa');
    if (lower === 'kpa') return scale(0.001, 'kPa_to_MPa');
    if (lower === 'psi') return scale(0.00689476, 'psi_to_MPa');
    if (lower === 'pa') return scale(1e-6, 'Pa_to_MPa');
    if (['mbar'].includes(lower)) return scale(0.0001, 'mbar_to_MPa');
    throw new UnitError(`${tag} requires MPa (or bar/mbar/kPa/psi/Pa); received ${raw || '(none)'}`);
  }

  if (expected === 'rpm') {
    if (['rpm', 'r/min'].includes(lower)) return scale(1, 'identity');
    if (lower === 'rps') return scale(60, 'rps_to_rpm');
    if (lower === 'hz') return scale(60, 'hz_to_rpm');
    throw new UnitError(`${tag} requires rpm (or rps/Hz); received ${raw || '(none)'}`);
  }

  if (expected === 'percent') {
    if (['%', 'percent', 'pct'].includes(lower)) return scale(1, 'identity');
    if (lower === 'fraction') return scale(100, 'fraction_to_percent');
    throw new UnitError(`${tag} requires percent; received ${raw || '(none)'}`);
  }

  if (expected === 'A') {
    if (['a', 'amp', 'amps'].includes(lower)) return scale(1, 'identity');
    if (lower === 'ma') return scale(0.001, 'mA_to_A');
    throw new UnitError(`${tag} requires A; received ${raw || '(none)'}`);
  }

  if (expected === 'kW') {
    if (lower === 'kw') return scale(1, 'identity');
    if (lower === 'w') return scale(0.001, 'W_to_kW');
    if (lower === 'mw') return scale(1000, 'MW_to_kW');
    // Amps are not power. A current channel on the electrical pad is a valid
    // wiring, but it is a different quantity and is refused here rather than
    // being treated as kilowatts.
    if (['a', 'amp', 'amps', 'ma'].includes(lower)) {
      throw new UnitError(
        `${tag} normalises the power quantity in kW. This channel reports current in ${raw}; read it as the current quantity rather than converting amps into kilowatts.`,
      );
    }
    throw new UnitError(`${tag} requires kW (or W/MW); received ${raw || '(none)'}`);
  }

  if (expected === 'kg/h') {
    if (['kg/h', 'kg/hr', 'kgh'].includes(lower)) return scale(1, 'identity');
    if (['g/min'].includes(lower)) return scale(0.06, 'g_per_min_to_kg_per_h');
    if (['kg/min'].includes(lower)) return scale(60, 'kg_per_min_to_kg_per_h');
    if (['lb/h', 'lbs/h'].includes(lower)) return scale(0.453592, 'lb_per_h_to_kg_per_h');
    throw new UnitError(`${tag} requires kg/h; received ${raw || '(none)'}`);
  }

  throw new UnitError(`${tag} has no declared canonical unit`);
}

/**
 * A value computed from other signals rather than measured.
 *
 * Provenance travels with the number so a derived quantity can never be
 * presented as a directly measured channel.
 */
export type DerivedValue = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  /** The tags this was computed from. Empty means it could not be computed. */
  derivedFrom: TwinScrewTag[];
  /** Why it could not be computed, when it could not. */
  unavailableReason?: string;
};

/**
 * Screw speed imbalance between the two shafts.
 *
 * Kept as an explicit derived quantity rather than folded into a single "screw
 * speed" reading. The two shafts are geared together, so a sustained difference
 * between them is mechanically significant in a way the mean cannot show.
 */
export function deriveScrewSpeedImbalance(
  screwA: number | null,
  screwB: number | null,
): DerivedValue {
  if (screwA === null || screwB === null || !Number.isFinite(screwA) || !Number.isFinite(screwB)) {
    return {
      id: 'screw-speed-imbalance',
      label: 'Screw A/B Speed Imbalance',
      value: null,
      unit: 'percent',
      derivedFrom: [],
      unavailableReason: 'Both TS-S1 (screw A) and TS-S2 (screw B) must be mapped and reporting to compute an imbalance.',
    };
  }
  const mean = (screwA + screwB) / 2;
  return {
    id: 'screw-speed-imbalance',
    label: 'Screw A/B Speed Imbalance',
    value: mean === 0 ? 0 : (Math.abs(screwA - screwB) / Math.abs(mean)) * 100,
    unit: 'percent',
    derivedFrom: ['TS-S1', 'TS-S2'],
  };
}

/**
 * Pressure rise across the screen pack.
 *
 * A rising differential at constant throughput is the classic screen-blinding
 * indication. It is derived, so it says what it came from.
 */
export function deriveScreenDifferential(inlet: number | null, outlet: number | null): DerivedValue {
  if (inlet === null || outlet === null || !Number.isFinite(inlet) || !Number.isFinite(outlet)) {
    return {
      id: 'screen-differential',
      label: 'Screen Pack Differential Pressure',
      value: null,
      unit: 'MPa',
      derivedFrom: [],
      unavailableReason: 'Both TS-P3 (screen inlet) and TS-P4 (screen outlet) must be mapped and reporting to compute a differential.',
    };
  }
  return {
    id: 'screen-differential',
    label: 'Screen Pack Differential Pressure',
    value: inlet - outlet,
    unit: 'MPa',
    derivedFrom: ['TS-P3', 'TS-P4'],
  };
}

/**
 * The largest step between adjacent barrel zones.
 *
 * Reported as a measured gradient with its inputs named. Whether that gradient
 * is acceptable is a separate question the rule layer answers, and it has no
 * commissioned tolerance to answer it with yet.
 */
export function deriveZoneGradient(zones: (number | null)[]): DerivedValue {
  const usable: { index: number; value: number }[] = [];
  zones.forEach((value, index) => {
    if (value !== null && Number.isFinite(value)) usable.push({ index, value });
  });
  if (usable.length < 2) {
    return {
      id: 'zone-gradient',
      label: 'Largest Barrel Zone-to-Zone Step',
      value: null,
      unit: 'degC',
      derivedFrom: [],
      unavailableReason: 'At least two adjacent barrel zone temperatures must be mapped and reporting to compute a gradient.',
    };
  }
  let worst = 0;
  const from: TwinScrewTag[] = [];
  for (let i = 1; i < usable.length; i += 1) {
    const step = Math.abs(usable[i].value - usable[i - 1].value);
    if (step > worst) {
      worst = step;
      from.length = 0;
      from.push(ZONE_TAGS[usable[i - 1].index], ZONE_TAGS[usable[i].index]);
    }
  }
  return {
    id: 'zone-gradient',
    label: 'Largest Barrel Zone-to-Zone Step',
    value: worst,
    unit: 'degC',
    derivedFrom: from,
  };
}
