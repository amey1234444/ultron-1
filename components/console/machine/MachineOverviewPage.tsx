import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  attributeToComponent,
  DEFAULT_ISO_GROUP,
  formatHours,
  formatRul,
  ISO_10816_GROUPS,
  levelHexes,
  STATE_LABEL,
  statusForLevel,
  type IsoGroup,
  type IsoZone,
} from '../../../lib/condition';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import { consolePalette } from '../../../lib/consoleTheme';
import { Panel } from '../../Panel';
import { AlarmSummaryCard } from './overview/AlarmSummaryCard';
import { ConditionTrend } from './overview/ConditionTrend';
import { DiagnosisBanner } from './overview/DiagnosisBanner';
import { HealthFactorList } from './overview/HealthFactorList';
import { HealthRing } from './overview/HealthRing';
import { KpiTile } from './overview/KpiTile';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';
import { MachineTrain } from './overview/MachineTrain';
import { MaintenanceCard, type MaintenanceRecord } from './overview/MaintenanceCard';
import { PredictionList } from './overview/PredictionList';
import { RecentEvents, type MachineEvent } from './overview/RecentEvents';
import {
  deriveRunState,
  healthByKind,
  rankDiagnoses,
  rollUpComponents,
  sensorHealthCounts,
  summarizeMachine,
} from './overview/rollup';
import { SENSOR_TILE_MIN_WIDTH, SensorGaugeTile } from './overview/SensorGaugeTile';
import type { PointCondition } from './overview/usePointCondition';
import type { MappedChannel } from './RackOccupancyView';

const ZONE_ORDER: Record<IsoZone, number> = { A: 0, B: 1, C: 2, D: 3 };

// Two-column blocks: grow to fill, but drop to a single column rather than
// squeezing a health bar and a diagnosis into 150px each on a narrow window.
const COLUMN = { flexGrow: 1, flexBasis: 340, minWidth: 300 } as const;

const TILE_GAP = 12;

// Column counts by width, mirroring Tailwind's xl / lg / md breakpoints so this
// page steps the same way the rest of the app does. Measured on the grid itself
// rather than the window, so the thresholds are the breakpoints less this page's
// 24px padding on each side. Six across is the desktop target; the tile's compact
// gauge exists to stay readable at the ~195-250px that leaves per tile.
const COLUMN_STEPS: Array<{ minWidth: number; columns: number }> = [
  { minWidth: 1232, columns: 6 },
  { minWidth: 976, columns: 3 },
  { minWidth: 720, columns: 2 },
  { minWidth: 0, columns: 1 },
];

function columnsFor(gridWidth: number): number {
  const step = COLUMN_STEPS.find((s) => gridWidth >= s.minWidth);
  const columns = step ? step.columns : 1;
  // Never divide the row so finely that a tile falls below the width its own
  // gauge needs — better to show fewer, readable tiles per row.
  const fits = Math.max(1, Math.floor((gridWidth + TILE_GAP) / (SENSOR_TILE_MIN_WIDTH + TILE_GAP)));
  return Math.min(columns, fits);
}

// Past this a tile is not better, only wider: the gauge and value are fixed size,
// so the extra width becomes empty space in the middle of the card.
const TILE_MAX_WIDTH = 560;

function channelNumber(channelId: string): number {
  const match = /\.CH(\d+)$/.exec(channelId);
  return match ? Number(match[1]) : 0;
}

export type MachineOverviewPageProps = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  // Needed for the sensor identity on each tile: which rack and slot a reading
  // comes through, what card and input type is behind it, and its engineering
  // range. MachineWorkspace already holds both lists.
  devices: DeviceNode[];
  cards: CardNode[];
  // Live telemetry the host already holds. Channels on racks that carry no real
  // gateway/rack ids are not addressable on the measurement bus and resolve only
  // through this — which is how a canvas box reads them. See
  // useMappedChannelReading.
  live?: LiveState;
  // Total measurement points the machine template defines.
  expectedPoints: number;
  // Which ISO 10816-3 group this machine belongs to. Really a property of the
  // machine (power rating and foundation), so it should move onto MachineNode
  // once there is somewhere to set it; until then callers can pass it.
  isoGroup?: IsoGroup;
  maintenance?: MaintenanceRecord[];
  // Availability has no source in the data model — there is no runtime or
  // downtime record to compute it from — so it is passed in or reported as
  // unavailable rather than invented.
  availability?: string;
  // Header context. The page is handed a machine, not its position in the
  // hierarchy, so the path comes from whoever navigated here.
  hierarchyPath?: string;
  events?: MachineEvent[];
  onSelectMachine?: () => void;
  onRefresh?: () => void;
  onOpenAlarms?: () => void;
  onSelectPoint?: (mapped: MappedChannel) => void;
  // The commissioned binding, when the host has it. MappedChannel records which
  // channel a box reads, not which component it is bolted to, so without this the
  // page can only infer the component from the channel's label — and two
  // components on one machine legitimately share point names ("DE Vibration H"),
  // which label matching cannot separate. A host that knows the binding should say
  // so rather than let it be guessed.
  componentIdFor?: (mapped: MappedChannel) => string | undefined;
};

// Single-machine condition and prognostic overview: what state the machine is
// in, what appears to be wrong, how long there is to act, and every sensor
// behind those claims as a panel gauge.
//
// The derivations live in lib/condition.ts and ./overview/rollup.ts; this file
// only arranges them. Worth knowing while reading it: each tile owns its own
// reading buffer (one hook per point, as everywhere else in this app) and
// reports the condition it derived back up via `onCondition`, so the ring and
// the roll-ups lag the tiles by exactly one commit on first paint.
export function MachineOverviewPage({
  machine,
  mappedChannels,
  devices,
  cards,
  live,
  expectedPoints,
  isoGroup = DEFAULT_ISO_GROUP,
  maintenance,
  availability,
  hierarchyPath,
  events,
  onSelectMachine,
  onRefresh,
  onOpenAlarms,
  onSelectPoint,
  componentIdFor,
}: MachineOverviewPageProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const levels = levelHexes(isDark);
  const palette = consolePalette(isDark);

  const [conditions, setConditions] = useState<Record<string, PointCondition>>({});
  const [gridWidth, setGridWidth] = useState<number | null>(null);

  // Must stay referentially stable: usePointCondition returns a new object on
  // every reading tick, so an unstable callback here would re-run each tile's
  // reporting effect on every render of this page and never settle.
  const reportCondition = useCallback((condition: PointCondition) => {
    setConditions((prev) => (prev[condition.id] === condition ? prev : { ...prev, [condition.id]: condition }));
  }, []);

  // Drop conditions for points that are no longer mapped, or a removed box would
  // keep contributing to the health score and alarm counts forever.
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

  // Read from the binding where the host supplies one, recovered from the label
  // where it does not — the saved mapping itself does not record which machine
  // component a box belongs to.
  const componentIdByBox = useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const mapped of mappedChannels) {
      result[mapped.id] = attributeToComponent(mapped.label, machine.components, componentIdFor?.(mapped));
    }
    return result;
  }, [mappedChannels, machine.components, componentIdFor]);

  const onlineByRack = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const device of devices) result[device.id] = device.status === 'Online' && !device.archived;
    return result;
  }, [devices]);

  const componentLabelById = useMemo(() => {
    const result: Record<string, string> = {};
    for (const component of machine.components) result[component.id] = component.label;
    return result;
  }, [machine.components]);

  // Physical wiring order — rack, then slot, then channel. An instrument panel
  // keeps a sensor in the same place every time you look at it; sorting by
  // severity would move tiles around under the operator as readings drift, which
  // is exactly what you don't want on the screen used to find a known sensor.
  const orderedChannels = useMemo(
    () =>
      [...mappedChannels].sort(
        (a, b) =>
          a.channel.deviceName.localeCompare(b.channel.deviceName) ||
          a.channel.slot - b.channel.slot ||
          channelNumber(a.channel.id) - channelNumber(b.channel.id) ||
          a.id.localeCompare(b.id),
      ),
    [mappedChannels],
  );

  // Held in mapped order rather than object order, so the lists below are stable
  // across ticks instead of reshuffling as conditions arrive.
  const conditionList = useMemo(
    () => orderedChannels.map((m) => conditions[m.id]).filter((c): c is PointCondition => Boolean(c)),
    [orderedChannels, conditions],
  );

  const summary = useMemo(() => summarizeMachine(conditionList), [conditionList]);
  const componentSummaries = useMemo(() => rollUpComponents(machine, conditionList), [machine, conditionList]);
  const ranked = useMemo(() => rankDiagnoses(componentSummaries), [componentSummaries]);

  const worstZone = useMemo(() => {
    const zones = conditionList.map((c) => c.isoZone).filter((z): z is IsoZone => z !== null);
    return zones.length > 0 ? zones.reduce((worst, z) => (ZONE_ORDER[z] > ZONE_ORDER[worst] ? z : worst), 'A' as IsoZone) : null;
  }, [conditionList]);

  const healthFactors = useMemo(() => healthByKind(conditionList), [conditionList]);
  const runState = useMemo(() => deriveRunState(conditionList), [conditionList]);
  const sensors = useMemo(() => sensorHealthCounts(conditionList), [conditionList]);
  const activeAlerts = summary.dangerCount + summary.alertCount;

  // Feed status is derived from reachability rather than a separate transport
  // signal: every rack unreachable is an offline page, some unreachable is a
  // degraded one. A real transport layer should own this.
  const feed: FeedStatus =
    sensors.total === 0 ? 'offline' : sensors.online === 0 ? 'offline' : sensors.online < sensors.total ? 'delayed' : 'live';

  // The trend shows whatever most needs attention — the worst point — so the
  // chart is about the machine's actual problem rather than channel one.
  const trended = summary.worstPoint;

  const projectionCount = conditionList.filter((c) => c.prognosis.daysToDanger !== null).length;
  const windowHours = conditionList[0]?.windowHours ?? 0;

  const perRow = gridWidth ? columnsFor(gridWidth) : 6;
  const tileWidth = gridWidth
    ? Math.min(TILE_MAX_WIDTH, Math.floor((gridWidth - TILE_GAP * (perRow - 1)) / perRow))
    : SENSOR_TILE_MIN_WIDTH;

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet — link a box to a channel in Design mode.
        </Text>
      </View>
    );
  }

  const leadDiagnosis = ranked[0] ?? null;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
      <MachineHeader
        machineName={machine.name}
        template={machine.template}
        path={hierarchyPath}
        feed={feed}
        ageSeconds={feed === 'live' ? 2 : null}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />

      {/* Data-quality strip: what the assessment above is based on. */}
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2">
        <View className="flex-row items-center gap-2">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: levels[summary.level] }} />
          <Text style={{ color: levels[summary.level] }} className="font-mono text-[11px] font-bold tracking-wider">
            {STATE_LABEL[summary.level]}
          </Text>
        </View>
        {/* More boxes can be mapped than the template defines points for — the
            shipped RAV layout wires eleven against a template that lists six —
            so "11 of 6 expected" is a real state, and phrasing it as a fraction
            reads as a broken counter. Say it the way round that is true. */}
        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {mappedChannels.length <= expectedPoints
            ? `${mappedChannels.length} of ${expectedPoints} expected points mapped`
            : `${mappedChannels.length} points mapped · template defines ${expectedPoints}`}
        </Text>
        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {formatHours(windowHours)} of history · {ISO_10816_GROUPS[isoGroup].label}
        </Text>
        {/* How much of this page's own judgement rests on limits nobody set. */}
        {summary.inferredLimitCount > 0 && (
          <Text style={{ color: palette.accent }} className="font-body text-[11px]">
            {summary.inferredLimitCount} point{summary.inferredLimitCount === 1 ? '' : 's'} judged against inferred limits
          </Text>
        )}
      </View>

      {/* KPI row — compact, one line, machine health slightly more prominent. */}
      <View className="flex-row flex-wrap gap-3">
        <KpiTile
          label="Machine health"
          value={summary.health === null ? '--' : `${Math.round(summary.health)}%`}
          tone={levels[summary.level]}
          hint={STATE_LABEL[summary.level]}
          width={176}
        />
        <KpiTile
          label="Active alerts"
          value={String(activeAlerts).padStart(2, '0')}
          tone={activeAlerts > 0 ? levels[summary.level] : undefined}
          hint={`${summary.dangerCount} danger · ${summary.alertCount} alert`}
        />
        <KpiTile label="Machine state" value={runState.label} hint={runState.detail ?? undefined} />
        <KpiTile
          label="Availability"
          value={availability ?? '--'}
          hint={availability ? 'reported' : 'no source wired'}
        />
        <KpiTile
          label="Sensor health"
          value={`${sensors.online} / ${sensors.total}`}
          tone={sensors.online < sensors.total ? levels.alert : undefined}
          hint="channels online"
        />
      </View>

      <Panel status={statusForLevel(summary.level)}>
        <View className="gap-4">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Machine health overview</Text>

          <View className="flex-row flex-wrap items-start gap-6">
            <View className="items-center gap-2">
              <HealthRing score={summary.health} level={summary.level} />
              <Text style={{ color: levels[summary.level] }} className="font-mono text-[11px] font-bold tracking-widest">
                {STATE_LABEL[summary.level]}
              </Text>
            </View>

            <View style={{ flexGrow: 1, flexBasis: 340, minWidth: 260 }}>
              <HealthFactorList factors={healthFactors} />
            </View>
          </View>

          {/* Primary observation. Driven entirely by the diagnosis passed in, so
              the analysis layer can replace the source without touching this. */}
          <DiagnosisBanner diagnosis={leadDiagnosis} summary={summary} />
        </View>
      </Panel>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={COLUMN}>
          <Panel fill>
            <MachineTrain summaries={componentSummaries} />
          </Panel>
        </View>
        <View style={COLUMN}>
          <Panel fill>
            <PredictionList diagnoses={ranked} />
          </Panel>
        </View>
      </View>

      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Live sensor overview</Text>
          <View className={cn('flex-1 border-t', lineClass)} />
          <Text className={cn('font-mono text-[10px]', mutedClass)}>
            {orderedChannels.length} sensors · rack order
          </Text>
        </View>

        <View
          className="flex-row flex-wrap"
          style={{ gap: TILE_GAP }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setGridWidth((prev) => (prev !== null && Math.abs(prev - w) < 1 ? prev : w));
          }}
        >
          {orderedChannels.map((mapped) => {
            const componentId = componentIdByBox[mapped.id];
            return (
              <SensorGaugeTile
                key={mapped.id}
                mapped={mapped}
                machineId={machine.id}
                machineName={machine.name}
                componentLabel={componentId ? componentLabelById[componentId] ?? null : null}
                devices={devices}
                cards={cards}
                live={live}
                width={tileWidth}
                online={onlineByRack[mapped.channel.rackId] ?? true}
                isoGroup={isoGroup}
                componentId={componentId}
                onCondition={reportCondition}
                onPress={onSelectPoint ? () => onSelectPoint(mapped) : undefined}
              />
            );
          })}
        </View>
      </View>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={COLUMN}>
          <Panel fill>
            {trended ? (
              <ConditionTrend
                label={`${trended.code} · ${trended.label}`}
                unit={trended.unit}
                samples={trended.samples}
                sampleIntervalHours={trended.sampleIntervalHours}
                thresholds={trended.thresholds}
                state={trended.state}
                decimals={trended.band.decimals}
              />
            ) : (
              <Text className={cn('font-body text-[11px] italic', mutedClass)}>No sensor to trend yet.</Text>
            )}
          </Panel>
        </View>
        <View style={COLUMN}>
          <Panel fill>
            <RecentEvents events={events} />
          </Panel>
        </View>
      </View>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={COLUMN}>
          <Panel fill>
            <AlarmSummaryCard summary={summary} conditions={conditionList} machineId={machine.id} onOpenAlarms={onOpenAlarms} />
          </Panel>
        </View>
        <View style={COLUMN}>
          <Panel fill>
            <MaintenanceCard records={maintenance} soonestRulDays={summary.soonestRulDays} />
          </Panel>
        </View>
      </View>
    </ScrollView>
  );
}
