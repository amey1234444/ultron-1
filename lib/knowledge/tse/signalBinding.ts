/**
 * Binding the twin screw's installed instruments to the DOC-02 signal master.
 *
 * The machine speaks in its own tags (`TS-P3`, `TS-TZ4`) because those are what
 * the drawing and the point registry declare. DOC-02 speaks in `D001`…`D060`
 * because that is the recommended data model. Nothing joined the two until now,
 * and without the join none of the DOC-02, DOC-03 or DOC-04 engines can see a
 * single real value.
 *
 * The binding is deliberately narrow. A tag is bound only where the instrument
 * genuinely *is* the signal DOC-02 describes — the same discipline the signal
 * map already applies when it refuses to read a feed-throat temperature as a
 * zone temperature. Two consequences worth stating:
 *
 *  - `TS-TT0` (feed throat) binds to D021, not to D024. They are different
 *    places on the machine and the feed throat is normally cooled.
 *  - `TS-TZ8` and `TS-TZ9` bind to nothing. DOC-02's master stops at seven
 *    zones and this machine has nine; inventing D061 and D062 would be putting
 *    words in the document's mouth. They remain available to the machine's own
 *    analyser, which does read all nine.
 *
 * `UNBOUND_MANDATORY` is the other half of the answer: the DOC-02 mandatory
 * signals this machine has no instrument for. That list is what §37's "all
 * mandatory signals mapped or gap recorded" actually records.
 */

import type { TwinScrewTag } from '../../twinScrewExtruderPoints';
import { DOC02_SIGNAL_MASTER, signalById } from '../doc02/signals';
import type { SignalDefinition } from '../doc02/types';

/** Which DOC-02 signal each installed instrument supplies. */
export const TAG_TO_SIGNAL: Readonly<Partial<Record<TwinScrewTag, string>>> = {
  // Drive
  'TS-E1': 'D004', // motor shaft speed
  'TS-PM1': 'D002', // motor electrical — current or power, decided by the channel unit
  'TS-T1': 'D008', // motor temperature
  'TS-V1': 'D010', // motor drive-end vibration
  'TS-V2': 'D010', // motor non-drive-end vibration
  'TS-T2': 'D011', // gearbox oil temperature
  'TS-T3': 'D012', // thrust bearing temperature
  'TS-V3': 'D013', // gearbox input vibration
  'TS-V4': 'D013',
  'TS-V5': 'D013',
  'TS-S1': 'D005', // screw A speed
  'TS-S2': 'D005', // screw B speed

  // Feeding
  'TS-F1': 'D014', // main feeder actual rate
  'TS-N1': 'D016', // main feeder drive load, as speed
  'TS-I1': 'D016',
  'TS-F2': 'D018', // side feeder actual rate
  'TS-N2': 'D020',
  'TS-I2': 'D020',
  'TS-TT0': 'D021', // feed-throat temperature — NOT zone 1

  // Barrel zones one to seven. Eight and nine have no DOC-02 counterpart.
  'TS-TZ1': 'D024',
  'TS-TZ2': 'D025',
  'TS-TZ3': 'D026',
  'TS-TZ4': 'D027',
  'TS-TZ5': 'D028',
  'TS-TZ6': 'D029',
  'TS-TZ7': 'D030',

  // Melt, vent and discharge
  'TS-P1': 'D041', // intermediate melt pressure, upstream
  'TS-P2': 'D041',
  'TS-P3': 'D041', // screen inlet — the upstream melt pressure
  'TS-P4': 'D042', // screen outlet — the downstream melt pressure
  'TS-TM': 'D044', // melt temperature
  'TS-PV': 'D045', // vacuum pressure
  'TS-TV': 'D047', // vent temperature
  'TS-L1': 'D017', // hopper level, closest to refill status
};

/** The DOC-02 signal an installed tag supplies, if any. */
export function signalForTag(tag: TwinScrewTag): SignalDefinition | undefined {
  const signalId = TAG_TO_SIGNAL[tag];
  return signalId ? signalById(signalId) : undefined;
}

/** Tags this machine carries that DOC-02's master has no entry for. */
export const UNBOUND_TAGS: readonly TwinScrewTag[] = ['TS-TZ8', 'TS-TZ9'] as const;

/** Whether this machine supplies a given DOC-02 signal at all. */
export function machineSupplies(signal: SignalDefinition): boolean {
  return Object.values(TAG_TO_SIGNAL).includes(signal.signalId);
}

/**
 * DOC-02 mandatory signals this machine has no instrument for.
 *
 * Ten of these are control-system values — run status, machine mode, trip
 * bits, the seven zone setpoints, recipe id — that a PLC almost certainly
 * already holds and that nobody has wired to ULTRON. They are an integration
 * gap, not an instrumentation one, and the distinction changes who has to fix
 * it.
 */
export function unboundMandatorySignals(): SignalDefinition[] {
  return DOC02_SIGNAL_MASTER.filter((signal) => signal.priority === 'MANDATORY' && !machineSupplies(signal));
}

/** What the machine does supply, for the coverage view. */
export function boundSignals(): SignalDefinition[] {
  return DOC02_SIGNAL_MASTER.filter(machineSupplies);
}
