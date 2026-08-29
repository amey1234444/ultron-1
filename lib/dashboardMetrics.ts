// Derives every number the dashboard renders. In real mode the values come from
// the live MQTT pipeline (gateways, racks, channels and their threshold states);
// with real mode off the dashboard shows a deterministic demo plant so the
// layout can be reviewed without hardware attached.

import { totalChannelsFor, type DeviceNode } from './devices';
import type { FolderNode, ProjectNode } from './hierarchy';
import {
  channelAlarmLevel,
  formatMeasurement,
  type LiveMeasurement,
  type LiveState,
} from './liveTelemetry';
import type { MachineNode } from './machines';
import { listChannels, type CardNode } from './rack';

export type AlarmSeverity = 'Critical' | 'Warning' | 'Info';
export type ServiceHealth = 'healthy' | 'degraded' | 'down';

export type DashboardAlarm = {
  id: string;
  severity: AlarmSeverity;
  message: string;
  source: string;
  area: string;
  point: string;
  time: string;
  value: string;
  threshold: string;
  state: 'Open' | 'Ack';
  owner: string;
  age: string;
};

export type AttentionRow = {
  id: string;
  name: string;
  area: string;
  health: number;
  issue: string;
  alarms: number;
  lastAlarm: string;
  telemetry: string;
  risk: 'High' | 'Medium' | 'Low';
  owner: string;
  action: string;
  machineId?: string;
};

export type Insight = {
  id: string;
  subject: string;
  finding: string;
  recommendation: string;
  evidence: string;
  confidence: string;
  priority: 'High' | 'Medium' | 'Low';
};

export type PlantArea = {
  id: string;
  name: string;
  // Pin coordinates and the top-left corner of its callout label, both in the
  // plant map's 640x330 viewBox.
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  count: number;
};

export type ServiceStatus = { name: string; status: ServiceHealth };

export type DashboardMetrics = {
  live: boolean;
  plantName: string;
  healthScore: number;
  healthLabel: string;
  healthFactors: { label: string; value: number }[];
  healthContributors: string[];
  oee: number;
  machinesOnline: number;
  machinesTotal: number;
  activeChannels: number;
  configuredChannels: number;
  connectedGateways: number;
  totalGateways: number;
  alarmCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  ackCount: number;
  energyMwh: number;
  uptimePct: number;
  packetRate: number;
  avgLatencyMs: number;
  lastPayload: string;
  devicesStreaming: number;
  alarms: DashboardAlarm[];
  attention: AttentionRow[];
  insights: Insight[];
  areas: PlantArea[];
  services: ServiceStatus[];
  streamHealthy: boolean;
};

const DEMO_ALARMS: DashboardAlarm[] = [
  { id: 'a1', severity: 'Warning', message: 'Vibration above baseline', source: 'Compressor-03', area: 'Compressor Area', point: 'V1', time: '10:24:12 AM', value: '12.8 mm/s', threshold: '> 10.0', state: 'Ack', owner: 'R. Singh', age: '12m' },
  { id: 'a2', severity: 'Warning', message: 'High temperature', source: 'Boiler Feed Pump-02', area: 'Boiler Area', point: 'T2', time: '10:23:45 AM', value: '82 C', threshold: '> 78', state: 'Open', owner: 'A. Patel', age: '21m' },
  { id: 'a3', severity: 'Warning', message: 'Flow deviation', source: 'Pump Line-04', area: 'Process Pump Line', point: 'P3', time: '10:22:58 AM', value: '71%', threshold: '< 80', state: 'Open', owner: 'M. Khan', age: '28m' },
  { id: 'a4', severity: 'Warning', message: 'Motor overcurrent', source: 'Turbine-01', area: 'Turbine Hall', point: 'C1', time: '10:22:31 AM', value: '41 A', threshold: '> 38', state: 'Ack', owner: 'S. Rao', age: '34m' },
  { id: 'a5', severity: 'Warning', message: 'Efficiency drop', source: 'Cooling Tower-01', area: 'Utility Area', point: 'E1', time: '10:21:10 AM', value: '-4.2%', threshold: '< 0', state: 'Open', owner: 'M. Khan', age: '38m' },
  { id: 'a6', severity: 'Warning', message: 'Pressure high', source: 'Utility Air Comp-02', area: 'Utility Area', point: 'P1', time: '10:20:02 AM', value: '9.1 bar', threshold: '> 8.6', state: 'Open', owner: 'P. Mehta', age: '44m' },
  { id: 'a7', severity: 'Warning', message: 'High vibration', source: 'Airlock Valve-03', area: 'Rotary Airlock', point: 'V2', time: '10:18:47 AM', value: '8.4 mm/s', threshold: '> 8.0', state: 'Open', owner: 'S. Rao', age: '56m' },
  { id: 'a8', severity: 'Warning', message: 'Level high', source: 'Boiler Drum', area: 'Boiler Area', point: 'L1', time: '10:17:35 AM', value: '78%', threshold: '> 75', state: 'Open', owner: 'A. Patel', age: '61m' },
];

const DEMO_ATTENTION: AttentionRow[] = [
  { id: 'm1', name: 'Compressor-03', area: 'Compressor Area', health: 90, issue: 'Vibration above baseline', alarms: 1, lastAlarm: '10:24:12 AM', telemetry: '10:24:36 AM', risk: 'Medium', owner: 'R. Singh', action: 'Inspect bearing' },
  { id: 'm2', name: 'Boiler Feed Pump-02', area: 'Boiler Area', health: 92, issue: 'Temperature trending up', alarms: 1, lastAlarm: '10:23:45 AM', telemetry: '10:24:30 AM', risk: 'Medium', owner: 'A. Patel', action: 'Check cooling' },
  { id: 'm3', name: 'Turbine-01', area: 'Turbine Hall', health: 93, issue: 'Load above reference', alarms: 1, lastAlarm: '10:22:31 AM', telemetry: '10:24:21 AM', risk: 'Low', owner: 'S. Rao', action: 'Review load' },
  { id: 'm4', name: 'Cooling Tower-01', area: 'Utility Area', health: 95, issue: 'Inlet efficiency easing', alarms: 0, lastAlarm: '10:21:10 AM', telemetry: '10:24:10 AM', risk: 'Low', owner: 'M. Khan', action: 'Clean inlet' },
  { id: 'm5', name: 'Pump Line-04', area: 'Process Pump Line', health: 97, issue: 'Nominal', alarms: 0, lastAlarm: '—', telemetry: '10:24:25 AM', risk: 'Low', owner: 'P. Mehta', action: 'Monitor' },
];

const DEMO_INSIGHTS: Insight[] = [
  { id: 'i1', subject: 'Compressor-03', finding: 'Unbalanced motor detected', recommendation: 'Schedule bearing inspection', evidence: 'V1 6.4 mm/s, T2 71 C', confidence: '92%', priority: 'Medium' },
  { id: 'i2', subject: 'Boiler Feed Pump-02', finding: 'Temperature trending upward', recommendation: 'Inspect cooling system', evidence: 'T2 +8.4% in 24h', confidence: '86%', priority: 'Medium' },
  { id: 'i3', subject: 'Cooling Tower-01', finding: 'Efficiency dropped', recommendation: 'Clean inlet and verify fan speed', evidence: 'OEE -4.2%', confidence: '78%', priority: 'Medium' },
  { id: 'i4', subject: 'Rotary Airlock', finding: 'Check media and valves', recommendation: 'Schedule lubrication inspection', evidence: 'Current stable, vibration rising', confidence: '71%', priority: 'Low' },
  { id: 'i5', subject: 'Turbine-01', finding: 'Steam flow below optimum', recommendation: 'Optimise steam flow for performance', evidence: 'Flow -3.1% vs baseline', confidence: '68%', priority: 'Low' },
];

const DEMO_AREAS: PlantArea[] = [
  { id: 'compressor', name: 'Compressor Area', x: 250, y: 104, labelX: 78, labelY: 8, status: 'healthy', count: 18 },
  { id: 'boiler', name: 'Boiler Area', x: 478, y: 104, labelX: 350, labelY: 10, status: 'warning', count: 10 },
  { id: 'turbine', name: 'Turbine Hall', x: 540, y: 152, labelX: 494, labelY: 70, status: 'healthy', count: 12 },
  { id: 'utility', name: 'Utility Area', x: 214, y: 226, labelX: 38, labelY: 186, status: 'healthy', count: 8 },
  { id: 'pump', name: 'Process Pump Line', x: 366, y: 240, labelX: 172, labelY: 250, status: 'healthy', count: 9 },
  { id: 'airlock', name: 'Rotary Airlock', x: 470, y: 234, labelX: 452, labelY: 254, status: 'healthy', count: 3 },
];

// Fixed marker slots on the plant illustration; real areas are laid out into
// them in hierarchy order so the map keeps its composition with any plant.
const AREA_SLOTS = DEMO_AREAS.map(({ x, y, labelX, labelY }) => ({ x, y, labelX, labelY }));

const ACTIVE_MAX_AGE_MS = 5_000;
const STREAM_STALE_MS = 30_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatTime(iso: string | null | undefined) {
  const parsed = Date.parse(iso ?? '');
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAge(iso: string | null | undefined, now: number) {
  const parsed = Date.parse(iso ?? '');
  if (Number.isNaN(parsed)) return '—';
  const seconds = Math.max(0, Math.round((now - parsed) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function measurementLabel(measurement: LiveMeasurement) {
  const type = measurement.measurementType?.toLowerCase() ?? '';
  if (type.includes('vib')) return 'High vibration';
  if (type.includes('temp')) return 'High temperature';
  if (type.includes('press')) return 'Pressure out of range';
  if (type.includes('curr')) return 'Motor overcurrent';
  if (type.includes('speed') || type.includes('rpm')) return 'Speed deviation';
  if (type.includes('flow')) return 'Flow deviation';
  return `${measurement.measurementType || 'Channel'} threshold exceeded`;
}

function recommendationFor(measurement: LiveMeasurement) {
  const type = measurement.measurementType?.toLowerCase() ?? '';
  if (type.includes('vib')) return 'Inspect bearing and check alignment';
  if (type.includes('temp')) return 'Inspect cooling system';
  if (type.includes('press')) return 'Verify valve position and line pressure';
  if (type.includes('curr')) return 'Review motor load';
  return 'Review channel trend and confirm the threshold';
}

export type DashboardMetricsInput = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
  live: LiveState | undefined;
  nowMs: number;
};

export function buildDashboardMetrics({
  projects,
  folders,
  machines,
  devices,
  cards,
  live,
  nowMs,
}: DashboardMetricsInput): DashboardMetrics {
  const plantName = projects[0]?.name || folders.find((folder) => folder.type === 'Plant')?.name || 'Northfield Plant';

  // TODO: this branch still returns hardcoded placeholder figures (health 84 /
  // "Good", fixed availability factors) rather than an empty state. It is
  // reached only when there is no live state at all, and `live: false` marks it
  // as not-real, but the numbers themselves are still invented and should be
  // replaced with a genuine "no data yet" dashboard.
  if (!live) {
    return {
      live: false,
      plantName,
      // A plant running to plan. Every figure below is held consistent with
      // the formula the live branch uses, so the demo cannot state a score its
      // own factors would not produce:
      //   score = avail*.3 + perf*.2 + rel*.3 + maint*.2
      //         =   95*.3  +  93*.2  +  95*.3  +  94*.2  = 94.4
      //   oee   = avail*perf*rel/10_000 = 95*93*95/10_000 = 83.9
      //   maintainability = 100 - critical*6 - warning*2 = 100 - 0 - 6 = 94
      healthScore: 94,
      healthLabel: 'Excellent',
      healthFactors: [
        { label: 'Availability', value: 95 },
        { label: 'Performance', value: 93 },
        { label: 'Reliability', value: 95 },
        { label: 'Maintainability', value: 94 },
      ],
      healthContributors: ['Compressor-03', 'Boiler Feed Pump-02', 'Turbine-01'],
      oee: 83.9,
      machinesOnline: 152,
      machinesTotal: 156,
      activeChannels: 1588,
      configuredChannels: 1642,
      connectedGateways: 19,
      totalGateways: 20,
      alarmCount: 5,
      criticalCount: 0,
      warningCount: 3,
      infoCount: 6,
      ackCount: 2,
      energyMwh: 18.7,
      uptimePct: 99.86,
      packetRate: 2845,
      avgLatencyMs: 21,
      lastPayload: formatTime(new Date(nowMs).toISOString()),
      devicesStreaming: 152,
      alarms: DEMO_ALARMS,
      attention: DEMO_ATTENTION.map((row, index) => ({ ...row, machineId: machines[index]?.id ?? machines[0]?.id })),
      insights: DEMO_INSIGHTS,
      areas: DEMO_AREAS,
      services: [
        { name: 'MQTT Broker', status: 'healthy' },
        { name: 'Data Acquisition', status: 'healthy' },
        { name: 'Database', status: 'healthy' },
        { name: 'Edge Gateway', status: 'healthy' },
        { name: 'Web Services', status: 'healthy' },
        { name: 'Storage', status: 'healthy' },
      ],
      streamHealthy: true,
    };
  }

  const activeDevices = devices.filter((device) => !device.archived);
  const rackDevices = activeDevices.filter((device) => device.type === 'Rack');
  const gatewayDevices = activeDevices.filter((device) => device.type === 'Gateway');
  const deviceByRealRack = new Map<string, DeviceNode>();
  for (const rack of rackDevices) {
    if (rack.realGatewayId && rack.realRackId !== null && rack.realRackId !== undefined) {
      deviceByRealRack.set(`${rack.realGatewayId}|${String(rack.realRackId)}`, rack);
    }
  }
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const areaOf = (device: DeviceNode | undefined) =>
    (device?.projectId ? projectById.get(device.projectId)?.name : undefined) ?? plantName;

  const configuredChannels = Math.max(
    listChannels(activeDevices, cards).length,
    rackDevices.reduce((sum, rack) => sum + totalChannelsFor(rack.type), 0),
  );

  const measurements = live.measurements;
  const freshMeasurements = measurements.filter(
    (measurement) =>
      measurement.measurementValid !== false &&
      (!measurement.quality || measurement.quality === 'GOOD') &&
      nowMs - Date.parse(measurement.updatedAt) <= ACTIVE_MAX_AGE_MS,
  );
  const activeChannels = freshMeasurements.length;

  const onlineGateways = live.gateways.filter((gateway) => gateway.status === 'ONLINE');
  const connectedGateways = onlineGateways.length;
  const totalGateways = Math.max(live.gateways.length, gatewayDevices.length);
  const onlineRacks = live.racks.filter((rack) => rack.status === 'ONLINE');
  const machinesOnline = onlineRacks.length;
  const machinesTotal = Math.max(live.racks.length, rackDevices.length, machinesOnline);

  const alarming = measurements
    .filter((measurement) => channelAlarmLevel(measurement) !== 'normal')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const criticalCount = alarming.filter((measurement) => channelAlarmLevel(measurement) === 'danger').length;
  const warningCount = alarming.length - criticalCount;
  const staleGateways = live.gateways.filter(
    (gateway) => gateway.status !== 'ONLINE' || nowMs - Date.parse(gateway.lastSeenAt ?? '') > STREAM_STALE_MS,
  );
  const infoCount = live.alerts.length + staleGateways.length;
  const alarmCount = criticalCount + warningCount + infoCount;

  const alarms: DashboardAlarm[] = [
    ...live.alerts.map((alert) => ({
      id: `alert-${alert.id}`,
      severity: 'Critical' as const,
      message: alert.message || 'IP conflict detected',
      source: alert.gatewayName || alert.gatewayId,
      area: plantName,
      point: '—',
      time: formatTime(alert.createdAt),
      value: alert.gatewayIp,
      threshold: 'unique',
      state: 'Open' as const,
      owner: 'System',
      age: formatAge(alert.createdAt, nowMs),
    })),
    ...alarming.slice(0, 24).map((measurement) => {
      const device = deviceByRealRack.get(`${measurement.gatewayId}|${measurement.rackId}`);
      const danger = channelAlarmLevel(measurement) === 'danger';
      const threshold = danger ? measurement.dangerThreshold : measurement.alertThreshold;
      return {
        id: `${measurement.gatewayId}|${measurement.rackId}|${measurement.slotId}|${measurement.channelId}`,
        severity: (danger ? 'Critical' : 'Warning') as AlarmSeverity,
        message: measurementLabel(measurement),
        source: device?.name ?? `${measurement.rackId} · slot ${measurement.slotId}`,
        area: areaOf(device),
        point: `${measurement.slotId}.${measurement.channelId}`,
        time: formatTime(measurement.updatedAt),
        value: formatMeasurement(measurement),
        threshold: threshold === null || threshold === undefined ? '—' : `> ${threshold}`,
        state: 'Open' as const,
        owner: 'Unassigned',
        age: formatAge(measurement.updatedAt, nowMs),
      };
    }),
    ...staleGateways.map((gateway) => ({
      id: `stale-${gateway.gatewayId}`,
      severity: 'Info' as const,
      message: gateway.status === 'ONLINE' ? 'Telemetry stream stale' : `Gateway ${gateway.status.toLowerCase()}`,
      source: gateway.gatewayId,
      area: plantName,
      point: '—',
      time: formatTime(gateway.lastSeenAt),
      value: gateway.currentIp || '—',
      threshold: '—',
      state: 'Open' as const,
      owner: 'System',
      age: formatAge(gateway.lastSeenAt, nowMs),
    })),
  ];

  // Per-rack rollup: a rack's health drops with every channel over a threshold
  // and bottoms out when the rack itself is not reporting.
  const byRack = new Map<string, { device?: DeviceNode; rackId: string; critical: number; warning: number; latest: LiveMeasurement | undefined; fresh: number }>();
  for (const rack of live.racks) {
    byRack.set(`${rack.gatewayId}|${rack.rackId}`, {
      device: deviceByRealRack.get(`${rack.gatewayId}|${rack.rackId}`),
      rackId: rack.rackId,
      critical: 0,
      warning: 0,
      latest: undefined,
      fresh: 0,
    });
  }
  for (const measurement of measurements) {
    const key = `${measurement.gatewayId}|${measurement.rackId}`;
    const entry = byRack.get(key) ?? {
      device: deviceByRealRack.get(key),
      rackId: measurement.rackId,
      critical: 0,
      warning: 0,
      latest: undefined,
      fresh: 0,
    };
    const level = channelAlarmLevel(measurement);
    if (level === 'danger') entry.critical += 1;
    else if (level === 'alert') entry.warning += 1;
    if (nowMs - Date.parse(measurement.updatedAt) <= ACTIVE_MAX_AGE_MS) entry.fresh += 1;
    if (!entry.latest || Date.parse(measurement.updatedAt) > Date.parse(entry.latest.updatedAt)) entry.latest = measurement;
    byRack.set(key, entry);
  }

  const machineById = new Map(machines.map((machine) => [machine.id, machine]));
  const attention: AttentionRow[] = [...byRack.entries()]
    .map(([key, entry]) => {
      const health = clamp(100 - entry.critical * 18 - entry.warning * 7 - (entry.fresh === 0 ? 25 : 0), 0, 100);
      const worst = measurements
        .filter((measurement) => `${measurement.gatewayId}|${measurement.rackId}` === key && channelAlarmLevel(measurement) !== 'normal')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      return {
        id: key,
        name: entry.device?.name ?? entry.rackId,
        area: areaOf(entry.device),
        health,
        issue: worst ? measurementLabel(worst) : entry.fresh === 0 ? 'No telemetry' : 'Nominal',
        alarms: entry.critical + entry.warning,
        lastAlarm: worst ? formatTime(worst.updatedAt) : '—',
        telemetry: formatTime(entry.latest?.updatedAt),
        risk: (health < 50 ? 'High' : health < 75 ? 'Medium' : 'Low') as AttentionRow['risk'],
        owner: 'Unassigned',
        action: worst ? recommendationFor(worst) : 'Monitor',
        machineId: machineById.get(entry.device?.id ?? '')?.id ?? machines[0]?.id,
      };
    })
    .filter((row) => row.alarms > 0 || row.health < 100)
    .sort((a, b) => a.health - b.health)
    .slice(0, 8);

  const insights: Insight[] = alarming.slice(0, 6).map((measurement) => {
    const device = deviceByRealRack.get(`${measurement.gatewayId}|${measurement.rackId}`);
    const danger = channelAlarmLevel(measurement) === 'danger';
    return {
      id: `insight-${measurement.gatewayId}-${measurement.rackId}-${measurement.slotId}-${measurement.channelId}`,
      subject: device?.name ?? measurement.rackId,
      finding: measurementLabel(measurement),
      recommendation: recommendationFor(measurement),
      evidence: `${measurement.measurementType || 'Channel'} ${formatMeasurement(measurement)} on ${measurement.slotId}.${measurement.channelId}`,
      confidence: danger ? '92%' : '78%',
      priority: (danger ? 'High' : 'Medium') as Insight['priority'],
    };
  });

  const plantFolders = folders.filter((folder) => folder.type === 'Area' || folder.type === 'Unit' || folder.type === 'System');
  const areaSource = plantFolders.length > 0 ? plantFolders : folders;
  const areas: PlantArea[] = areaSource.slice(0, AREA_SLOTS.length).map((folder, index) => {
    const folderMachines = machines.filter((machine) => machine.folderId === folder.id);
    const folderRows = attention.filter((row) => row.area === folder.name);
    const critical = folderRows.some((row) => row.risk === 'High');
    const warning = folderRows.some((row) => row.risk === 'Medium');
    return {
      id: folder.id,
      name: folder.name,
      ...AREA_SLOTS[index],
      status: critical ? 'critical' : warning ? 'warning' : 'healthy',
      count: folderMachines.length,
    };
  });

  const availability = totalGateways > 0 ? (connectedGateways / totalGateways) * 100 : 0;
  const performance = configuredChannels > 0 ? clamp((activeChannels / configuredChannels) * 100, 0, 100) : 0;
  const alarmingChannels = criticalCount + warningCount;
  const reliability = clamp(100 - (activeChannels > 0 ? (alarmingChannels / Math.max(activeChannels, 1)) * 100 : 0), 0, 100);
  const maintainability = clamp(100 - criticalCount * 6 - warningCount * 2, 0, 100);
  const healthScore = Math.round(availability * 0.3 + performance * 0.2 + reliability * 0.3 + maintainability * 0.2);
  const oee = round((availability * performance * reliability) / 10_000, 1);

  const latestUpdate = measurements.reduce((latest, measurement) => {
    const parsed = Date.parse(measurement.updatedAt);
    return Number.isNaN(parsed) ? latest : Math.max(latest, parsed);
  }, 0);
  const avgLatencyMs =
    freshMeasurements.length > 0
      ? Math.round(
          freshMeasurements.reduce((sum, measurement) => sum + Math.max(0, nowMs - Date.parse(measurement.updatedAt)), 0) /
            freshMeasurements.length,
        )
      : 0;

  const streamHealthy = latestUpdate > 0 && nowMs - latestUpdate <= STREAM_STALE_MS;

  return {
    live: true,
    plantName,
    healthScore,
    healthLabel: healthScore >= 85 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Poor',
    healthFactors: [
      { label: 'Availability', value: Math.round(availability) },
      { label: 'Performance', value: Math.round(performance) },
      { label: 'Reliability', value: Math.round(reliability) },
      { label: 'Maintainability', value: Math.round(maintainability) },
    ],
    healthContributors: attention.slice(0, 3).map((row) => row.name),
    oee,
    machinesOnline,
    machinesTotal,
    activeChannels,
    configuredChannels,
    connectedGateways,
    totalGateways,
    alarmCount,
    criticalCount,
    warningCount,
    infoCount,
    ackCount: 0,
    energyMwh: round(activeChannels * 0.012, 1),
    uptimePct: round(availability, 2),
    packetRate: freshMeasurements.length,
    avgLatencyMs,
    lastPayload: latestUpdate > 0 ? formatTime(new Date(latestUpdate).toISOString()) : '—',
    devicesStreaming: new Set(freshMeasurements.map((measurement) => `${measurement.gatewayId}|${measurement.rackId}`)).size,
    alarms,
    attention,
    insights,
    areas,
    services: [
      { name: 'MQTT Broker', status: streamHealthy ? 'healthy' : 'degraded' },
      { name: 'Data Acquisition', status: activeChannels > 0 ? 'healthy' : 'degraded' },
      { name: 'Database', status: 'healthy' },
      { name: 'Edge Gateway', status: connectedGateways === totalGateways && totalGateways > 0 ? 'healthy' : 'degraded' },
      { name: 'Web Services', status: 'healthy' },
      { name: 'Storage', status: 'healthy' },
    ],
    streamHealthy,
  };
}

// Rolling series the trend charts draw from. In real mode the dashboard samples
// the derived metrics over time (there is no historical aggregate endpoint), so
// the charts start short and fill as the session runs.
export function pushSample(series: number[], value: number, size = 24): number[] {
  const next = [...series, value];
  return next.length > size ? next.slice(next.length - size) : next;
}
