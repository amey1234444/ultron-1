import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { attributeToComponent, DEFAULT_ISO_GROUP, type IsoGroup } from '../../../lib/condition';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import { AnalysisWorkspace, type AnalysisMachine, type AnalysisWorkspaceData } from './AnalysisWorkspace';
import { deriveAnalysis } from './deriveAnalysis';
import { deriveRunState, rankDiagnoses, rollUpComponents, summarizeMachine } from './overview/rollup';
import { usePointCondition, type PointCondition } from './overview/usePointCondition';
import type { MappedChannel } from './RackOccupancyView';

// The analysis layer, wired to this machine's own live readings.
//
// The three analysis pages are prop-driven and own no data access, which is what
// makes them testable — but it also means something has to stand between them and
// the rack. This is that something, and it is deliberately thin: it collects the
// per-point conditions, rolls them up with the same functions the sensor overview
// uses, hands the result to deriveAnalysis, and renders the workspace.
//
// Sharing the roll-up with the overview is the point. The two screens answer
// different questions — "what is every sensor reading" and "what does that mean" —
// and if they derived condition separately they would eventually disagree in front
// of an operator, which is the one thing a condition-monitoring page must not do.

// One point's condition, reported upward. Rendered rather than called in a loop
// because usePointCondition is a hook and the mapped-channel list is not fixed.
function ConditionProbe({
  mapped,
  machineId,
  machineName,
  isoGroup,
  componentId,
  online,
  devices,
  cards,
  live,
  onCondition,
}: {
  mapped: MappedChannel;
  machineId: string;
  machineName: string;
  isoGroup: IsoGroup;
  componentId: string | null;
  online: boolean;
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  onCondition: (condition: PointCondition) => void;
}) {
  const condition = usePointCondition(mapped, machineId, { isoGroup, componentId, online, devices, cards, live, machineName });

  useEffect(() => {
    onCondition(condition);
  }, [condition, onCondition]);

  return null;
}

export type MachineAnalysisWorkspaceProps = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  // Live telemetry the host already holds, forwarded so channels on racks that
  // are not addressable on the measurement bus still resolve — the canvas reads
  // them the same way. See useMappedChannelReading.
  live?: LiveState;
  isoGroup?: IsoGroup;
  hierarchyPath?: string;
  onOpenAlarms?: () => void;
};

export function MachineAnalysisWorkspace({
  machine,
  mappedChannels,
  devices,
  cards,
  live,
  isoGroup = DEFAULT_ISO_GROUP,
  hierarchyPath,
  onOpenAlarms,
}: MachineAnalysisWorkspaceProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const [conditions, setConditions] = useState<Record<string, PointCondition>>({});

  // Must stay referentially stable: usePointCondition returns a new object on
  // every reading tick, so an unstable callback here would re-run every probe's
  // reporting effect on every render and never settle.
  const reportCondition = useCallback((condition: PointCondition) => {
    setConditions((prev) => (prev[condition.id] === condition ? prev : { ...prev, [condition.id]: condition }));
  }, []);

  // Drop conditions for points that are no longer mapped, or an unlinked box would
  // keep contributing to the health score and the issue list forever.
  useEffect(() => {
    setConditions((prev) => {
      const live = new Set(mappedChannels.map((m) => m.id));
      const keys = Object.keys(prev);
      if (keys.every((key) => live.has(key))) return prev;
      const next: Record<string, PointCondition> = {};
      for (const key of keys) if (live.has(key)) next[key] = prev[key];
      return next;
    });
  }, [mappedChannels]);

  // The saved mapping records which channel a box reads, not which component it is
  // bolted to, so the binding is recovered from the label. See
  // attributeToComponent for the tiers and for what happens when none of them land.
  const componentIdByBox = useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const mapped of mappedChannels) {
      result[mapped.id] = attributeToComponent(mapped.label, machine.components);
    }
    return result;
  }, [mappedChannels, machine.components]);

  const onlineByRack = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const device of devices) result[device.id] = device.status === 'Online' && !device.archived;
    return result;
  }, [devices]);

  // Physical wiring order — rack, then slot, then channel — so every list built
  // from this is stable across ticks instead of reshuffling as readings drift.
  const orderedChannels = useMemo(
    () =>
      [...mappedChannels].sort(
        (a, b) =>
          a.channel.deviceName.localeCompare(b.channel.deviceName) ||
          a.channel.slot - b.channel.slot ||
          a.channel.id.localeCompare(b.channel.id) ||
          a.id.localeCompare(b.id),
      ),
    [mappedChannels],
  );

  const conditionList = useMemo(
    () => orderedChannels.map((m) => conditions[m.id]).filter((c): c is PointCondition => Boolean(c)),
    [orderedChannels, conditions],
  );

  const components = useMemo(() => rollUpComponents(machine, conditionList), [machine, conditionList]);
  const summary = useMemo(() => summarizeMachine(conditionList), [conditionList]);
  const ranked = useMemo(() => rankDiagnoses(components), [components]);
  const runState = useMemo(() => deriveRunState(conditionList), [conditionList]);

  const data = useMemo(
    () =>
      deriveAnalysis({
        machine,
        mappedChannels: orderedChannels,
        conditions: conditionList,
        components,
        summary,
        ranked,
        runState,
        devices,
        cards,
      }),
    [machine, orderedChannels, conditionList, components, summary, ranked, runState, devices, cards],
  );

  // AnalysisWorkspace re-derives its payload whenever this callback's identity
  // changes, so binding it to `data` is what makes the pages live.
  const dataFor = useCallback((): AnalysisWorkspaceData => data, [data]);

  const machines = useMemo<AnalysisMachine[]>(
    () => [{ id: machine.id, name: machine.name, template: machine.template, hierarchyPath }],
    [machine.id, machine.name, machine.template, hierarchyPath],
  );

  const probes = (
    <View style={{ height: 0, overflow: 'hidden' }} pointerEvents="none">
      {mappedChannels.map((mapped) => (
        <ConditionProbe
          key={mapped.id}
          mapped={mapped}
          machineId={machine.id}
          machineName={machine.name}
          isoGroup={isoGroup}
          componentId={componentIdByBox[mapped.id] ?? null}
          online={onlineByRack[mapped.channel.rackId] ?? false}
          devices={devices}
          cards={cards}
          live={live}
          onCondition={reportCondition}
        />
      ))}
    </View>
  );

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet, so there is nothing to analyse — link a box to a channel in
          Design mode.
        </Text>
      </View>
    );
  }

  // The pages read the first tick's worth of conditions, which arrive one commit
  // after the probes mount. Saying so beats rendering an all-healthy machine for a
  // frame and then correcting it.
  if (conditionList.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        {probes}
        <Text className={cn('font-body text-sm italic', mutedClass)}>Reading channel history…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {probes}
      <AnalysisWorkspace
        machines={machines}
        initialMachineId={machine.id}
        dataFor={dataFor}
        onOpenAlarms={onOpenAlarms ? () => onOpenAlarms() : undefined}
      />
    </View>
  );
}
