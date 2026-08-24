import { useMemo } from 'react';

import {
  DEFAULT_ISO_GROUP,
  isoZone,
  KIND_FOR_LETTER,
  levelFor,
  pointHealth,
  projectToDanger,
  resolveThresholds,
  sensorState,
  type ConditionLevel,
  type IsoGroup,
  type IsoZone,
  type MeasurementBand,
  type Prognosis,
  type ResolvedThresholds,
  type SensorState,
} from '../../../../lib/condition';
import type { MeasurementPointKind } from '../../../../lib/machines';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from '../liveValue';
import type { MappedChannel } from '../RackOccupancyView';
import { conditionHistoryStorageKey, useConditionHistory } from './useConditionHistory';

// Everything the overview knows about one measurement point, assembled in one
// place so the cards, the component roll-up, the diagnosis banner and the alarm
// summary are all reading the same numbers rather than each recomputing a
// slightly different version of them.
export type PointCondition = {
  id: string;
  code: string;
  label: string;
  kind: MeasurementPointKind | 'Unknown';
  letter: LiveKindLetter;
  unit: string;
  value: number;
  band: MeasurementBand;
  thresholds: ResolvedThresholds;
  level: ConditionLevel;
  // The measurement condition combined with reachability. `level` is what the
  // reading says; `state` is what the tile should show, because a stale value
  // from an unreachable rack must not be presented as a live one.
  state: SensorState;
  online: boolean;
  health: number;
  prognosis: Prognosis;
  samples: number[];
  windowHours: number;
  // Change across the whole buffer as a fraction of where it started, which is
  // the "up 38% over two days" line an operator actually reacts to.
  changeFraction: number;
  rising: boolean;
  // ISO 10816-3 zone, and only for velocity readings in mm/s RMS — the standard
  // is defined in those units, so applying its boundaries to acceleration or to
  // in/s would be a units error wearing a standard's name.
  isoZone: IsoZone | null;
  componentId: string | null;
};

function isVelocityInMillimetresPerSecond(letter: LiveKindLetter, unit: string) {
  return letter === 'V' && unit.replace(/\s/g, '').toLowerCase() === 'mm/s';
}

export function usePointCondition(
  mapped: MappedChannel,
  machineId: string,
  options?: { isoGroup?: IsoGroup; componentId?: string | null; online?: boolean },
): PointCondition {
  const { channel, label } = mapped;
  const isoGroup = options?.isoGroup ?? DEFAULT_ISO_GROUP;
  const componentId = options?.componentId ?? null;
  const online = options?.online ?? true;

  const history = useConditionHistory(channel.letter, conditionHistoryStorageKey(machineId, mapped.id));

  return useMemo(() => {
    const band = LIVE_RANGE_FOR_LETTER[channel.letter];
    const samples = history.samples;
    const value = samples[samples.length - 1];
    const first = samples[0];

    const thresholds = resolveThresholds(channel, band);
    const level = levelFor(value, thresholds);
    const prognosis = projectToDanger(samples, thresholds, history.sampleIntervalHours);

    return {
      id: mapped.id,
      code: channel.code,
      label,
      kind: KIND_FOR_LETTER[channel.letter],
      letter: channel.letter,
      unit: channel.unit,
      value,
      band,
      thresholds,
      level,
      state: sensorState(level, online),
      online,
      health: pointHealth(value, thresholds, band),
      prognosis,
      samples,
      windowHours: history.windowHours,
      // Guard the divisor: a reading legitimately sitting at zero would make the
      // percentage meaningless rather than infinite.
      changeFraction: Math.abs(first) > 1e-6 ? (value - first) / Math.abs(first) : 0,
      rising: prognosis.slopePerDay > 0 && prognosis.confidence !== 'none',
      isoZone: isVelocityInMillimetresPerSecond(channel.letter, channel.unit) ? isoZone(value, isoGroup) : null,
      componentId,
    };
  }, [channel, label, mapped.id, history, isoGroup, componentId, online]);
}
