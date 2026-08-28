import type { CardNode } from './rack';

// What each analysis actually requires, and whether this machine's configuration
// can supply it.
//
// This is the most important module in the Advanced Diagnosis layer, and the
// reason is worth stating plainly: every deep analysis on this page is a claim
// about physics, and a plot drawn without the data behind it is not a placeholder
// — it is a lie an analyst will read numbers off. A fabricated spectrum with a
// peak at some arbitrary x is worse than an empty panel, because an empty panel
// cannot be mistaken for a 187 Hz bearing tone.
//
// So no analysis renders unless its prerequisites are met, and when they are not
// the page names the specific missing thing rather than showing a blank chart.

export type AnalysisMode =
  | 'trend'
  | 'waveform'
  | 'spectrum'
  | 'envelope'
  | 'bearing'
  | 'order'
  | 'phase'
  | 'waterfall'
  | 'compare';

export const MODE_LABEL: Record<AnalysisMode, string> = {
  trend: 'Trend',
  waveform: 'Waveform',
  spectrum: 'Spectrum',
  envelope: 'Envelope',
  bearing: 'Bearing',
  order: 'Order',
  phase: 'Phase',
  waterfall: 'Waterfall',
  compare: 'Compare',
};

export const MODE_PURPOSE: Record<AnalysisMode, string> = {
  trend: 'How a scalar has moved over time.',
  waveform: 'The raw time-domain signal, for impacts and modulation.',
  spectrum: 'Energy by frequency, for identifying which mechanism is exciting.',
  envelope: 'Demodulated high-frequency energy, for early bearing defects.',
  bearing: 'Defect frequencies against the spectrum, for a specific bearing.',
  order: 'Frequency normalised to shaft speed, to separate speed-dependent faults.',
  phase: 'Relative timing between points, to separate unbalance from misalignment.',
  waterfall: 'Spectra stacked over time, to watch a tone grow.',
  compare: 'The same measurement against a reference period.',
};

export type Prerequisite =
  | 'scalar-history'
  | 'raw-waveform'
  | 'adequate-sample-rate'
  | 'high-frequency-band'
  | 'bearing-geometry'
  | 'tacho'
  | 'synchronous-channels'
  | 'spectrum-history'
  | 'reference-period';

export const PREREQUISITE_LABEL: Record<Prerequisite, string> = {
  'scalar-history': 'Trended values',
  'raw-waveform': 'Raw waveform capture',
  'adequate-sample-rate': 'Adequate sample rate',
  'high-frequency-band': 'High-frequency band',
  'bearing-geometry': 'Bearing geometry',
  tacho: 'Speed reference',
  'synchronous-channels': 'Synchronous channels',
  'spectrum-history': 'Stored spectra',
  'reference-period': 'Reference period',
};

export const PREREQUISITE_WHY: Record<Prerequisite, string> = {
  'scalar-history': 'A stored series of values for this point over time.',
  'raw-waveform': 'The time-domain record itself. A trended RMS value cannot be transformed back into one.',
  'adequate-sample-rate': 'A rate high enough to resolve the frequencies the analysis depends on.',
  'high-frequency-band': 'A demodulation band above the machine tones, where early bearing energy appears.',
  'bearing-geometry': 'Ball count and diameters, or the four defect frequencies directly. Without them a spectrum cannot be labelled.',
  tacho: 'A once-per-revolution reference, so frequency can be expressed in orders of shaft speed.',
  'synchronous-channels': 'Two or more channels sampled on the same clock. Phase between independently sampled channels is meaningless.',
  'spectrum-history': 'Spectra retained over time rather than only the latest.',
  'reference-period': 'A period recorded as representative, taken at comparable speed and load.',
};

const REQUIRES: Record<AnalysisMode, Prerequisite[]> = {
  trend: ['scalar-history'],
  compare: ['scalar-history', 'reference-period'],
  waveform: ['raw-waveform'],
  spectrum: ['raw-waveform', 'adequate-sample-rate'],
  envelope: ['raw-waveform', 'adequate-sample-rate', 'high-frequency-band'],
  bearing: ['raw-waveform', 'adequate-sample-rate', 'bearing-geometry'],
  order: ['raw-waveform', 'adequate-sample-rate', 'tacho'],
  phase: ['raw-waveform', 'synchronous-channels', 'tacho'],
  waterfall: ['spectrum-history'],
};

export type CapabilityInputs = {
  hasScalarHistory: boolean;
  hasRawWaveform: boolean;
  sampleRateHz: number | null;
  hasHighFrequencyBand: boolean;
  hasBearingGeometry: boolean;
  hasTacho: boolean;
  synchronousChannelCount: number;
  hasSpectrumHistory: boolean;
  hasReferencePeriod: boolean;
  // Shaft speed, used to judge whether the sample rate reaches the frequencies
  // that matter for this machine rather than some absolute threshold.
  shaftHz: number | null;
};

// Industry practice for a usable spectrum span: the anti-alias filter and window
// cost more than the theoretical Nyquist half, so 2.56 rather than 2 is the
// divisor used to state the highest trustworthy line.
const SPECTRUM_DIVISOR = 2.56;

export function usableSpectrumSpanHz(sampleRateHz: number | null): number | null {
  return sampleRateHz === null || sampleRateHz <= 0 ? null : sampleRateHz / SPECTRUM_DIVISOR;
}

// Bearing defect tones sit at single-figure multiples of shaft speed, and the
// harmonics that distinguish a defect from a coincidence sit above those. Ten
// orders is the practical floor for identification; three is not enough to see
// anything but the shaft itself.
const REQUIRED_ORDERS_FOR_DIAGNOSIS = 10;

export function requiredSampleRateHz(shaftHz: number | null): number | null {
  return shaftHz === null ? null : shaftHz * REQUIRED_ORDERS_FOR_DIAGNOSIS * SPECTRUM_DIVISOR;
}

function sampleRateIsAdequate(inputs: CapabilityInputs): boolean {
  const needed = requiredSampleRateHz(inputs.shaftHz);
  if (needed === null || inputs.sampleRateHz === null) return false;
  return inputs.sampleRateHz >= needed;
}

export type Capability = {
  mode: AnalysisMode;
  available: boolean;
  missing: Prerequisite[];
};

export function assessCapability(mode: AnalysisMode, inputs: CapabilityInputs): Capability {
  const missing: Prerequisite[] = [];

  for (const requirement of REQUIRES[mode]) {
    const met =
      requirement === 'scalar-history'
        ? inputs.hasScalarHistory
        : requirement === 'raw-waveform'
          ? inputs.hasRawWaveform
          : requirement === 'adequate-sample-rate'
            ? sampleRateIsAdequate(inputs)
            : requirement === 'high-frequency-band'
              ? inputs.hasHighFrequencyBand
              : requirement === 'bearing-geometry'
                ? inputs.hasBearingGeometry
                : requirement === 'tacho'
                  ? inputs.hasTacho
                  : requirement === 'synchronous-channels'
                    ? inputs.synchronousChannelCount >= 2
                    : requirement === 'spectrum-history'
                      ? inputs.hasSpectrumHistory
                      : inputs.hasReferencePeriod;

    if (!met) missing.push(requirement);
  }

  return { mode, available: missing.length === 0, missing };
}

export function assessAll(inputs: CapabilityInputs): Capability[] {
  return (Object.keys(REQUIRES) as AnalysisMode[]).map((mode) => assessCapability(mode, inputs));
}

// Reads what the rack model can actually tell us, and is deliberately pessimistic
// about the rest.
//
// The vibration card config carries a sampling rate and a sensor type, so the rate
// is real. Nothing in the model stores a waveform, a spectrum, a bearing geometry,
// a tacho channel or a synchronous sampling group — so those are false here, and
// will stay false until the acquisition path and a store for the results exist.
// Reporting them as available because the UI has a tab for them is how a
// diagnostic tool starts producing confident nonsense.
export function capabilityFromCard(card: CardNode | null, shaftHz: number | null, hasScalarHistory: boolean): CapabilityInputs {
  const config = card?.config;
  const rate = config && 'samplingRate' in config ? Number.parseFloat(config.samplingRate) : NaN;

  return {
    hasScalarHistory,
    // No waveform store exists in the data model.
    hasRawWaveform: false,
    sampleRateHz: Number.isFinite(rate) && rate > 0 ? rate : null,
    hasHighFrequencyBand: false,
    hasBearingGeometry: false,
    hasTacho: false,
    // Channels on one card share a card, not a sample clock, as far as the model
    // records. Claiming otherwise would make every phase reading meaningless.
    synchronousChannelCount: 0,
    hasSpectrumHistory: false,
    hasReferencePeriod: false,
    shaftHz,
  };
}

// A single sentence an analyst can act on, for the case where the sample rate is
// configured but too low. This is a real and common commissioning fault, and it is
// invisible unless something states it against the machine's own speed.
export function sampleRateVerdict(inputs: CapabilityInputs): { ok: boolean; text: string } | null {
  if (inputs.sampleRateHz === null) return null;

  const needed = requiredSampleRateHz(inputs.shaftHz);
  const span = usableSpectrumSpanHz(inputs.sampleRateHz);
  if (needed === null || span === null) return null;

  const orders = inputs.shaftHz ? span / inputs.shaftHz : null;

  if (inputs.sampleRateHz >= needed) {
    return {
      ok: true,
      text: `Configured at ${inputs.sampleRateHz} Hz, giving a usable span to ${Math.round(span)} Hz — about ${Math.round(
        orders ?? 0,
      )} orders at this speed. Adequate for bearing identification.`,
    };
  }

  return {
    ok: false,
    text: `Configured at ${inputs.sampleRateHz} Hz, giving a usable span to only ${Math.round(span)} Hz — about ${
      orders === null ? '?' : orders.toFixed(1)
    } orders at ${inputs.shaftHz?.toFixed(1)} Hz shaft speed. Bearing identification needs roughly ${Math.round(
      needed,
    )} Hz. Raising the card's sampling rate is a prerequisite for spectral work here, not a preference.`,
  };
}
