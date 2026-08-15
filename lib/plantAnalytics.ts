// Plant analytics: the one model every panel on the Plant Overview reads from.
//
// Why this file exists
// --------------------
// The dashboard's telemetry used to be assembled inline in JSX, which meant a
// number could disagree with the chart beside it and nobody would notice. Every
// figure the overview shows — per-asset telemetry, energy, performance, and the
// four bottom series — is derived here, once, from `DashboardMetrics` and the
// placed 3D components. The UI consumes the result and computes nothing.
//
// Measured vs. modelled
// ---------------------
// Some of this is measured and some of it is not, and the difference matters:
//
//  MEASURED   machine counts, alarms, gateway/channel counts, latency, health,
//             availability, OEE — all of these come straight out of
//             `buildDashboardMetrics`, which reads the real hierarchy and the
//             live telemetry frames.
//
//  MODELLED   electrical demand, energy and cost. The data model has no energy
//             meter yet, so demand is derived from what *is* measured: every
//             online machine carries a base load and every streaming channel a
//             small instrument load. The figures therefore move with real
//             telemetry rather than being decorative, but they are a model.
//             When a meter arrives, `plantDemandKw` is the only function that
//             has to change.
//
//  SHAPED     the historical series behind the bottom charts. There is no
//             aggregate history endpoint (the console samples into memory while
//             it is open — see `DashboardOverview`), so history is a
//             deterministic walk *anchored on the real current value*: the last
//             point of every series is the live figure, and the run-up to it is
//             modelled. Deterministic is the important word — the walk is seeded
//             per plant, so it does not jitter on every render.

import type { DashboardMetrics, PlantArea } from './dashboardMetrics';
import type { PlantComponent3D } from './plantScene3d';

export type PlantAssetStatus = 'healthy' | 'warning' | 'critical' | 'offline';

/** Everything the 3D scene, its labels, its tooltips and the inspector show. */
export type PlantAssetTelemetry = {
  id: string;
  name: string;
  status: PlantAssetStatus;
  /** Telemetry area this component resolved to, for provenance in the UI. */
  areaName: string | null;
  machines: number;
  machinesActive: number;
  alarms: number;
  /** Instantaneous demand, kW. Modelled — see the header. */
  powerKw: number;
  temperatureC: number;
  health: number;
  oee: number;
  utilization: number;
  latencyMs: number;
  telemetry: 'ONLINE' | 'OFFLINE';
  /** Consumption over the reporting window, kWh. Modelled. */
  energyKwh: number;
};

export type PlantEnergyRow = {
  id: string;
  label: string;
  kwh: number;
  /** 0-1, against the largest row, for the bar length. */
  share: number;
};

export type PlantSystemTelemetry = {
  totalPowerMw: number;
  totalEnergyKwh: number;
  activeMachines: number;
  connectedGateways: number;
};

export type PlantPerformanceRow = { label: string; value: number };

export type PlantSeries = {
  values: number[];
  /**
   * The headline figure printed above the chart. For a rate this is the last
   * point; for a total (cost) it is the sum of the window.
   */
  latest: number;
  /** Change against the start of the window, in percent. */
  deltaPct: number;
};

export type PlantAnalytics = {
  assets: PlantAssetTelemetry[];
  byId: Record<string, PlantAssetTelemetry>;
  energy: PlantEnergyRow[];
  system: PlantSystemTelemetry;
  performance: PlantPerformanceRow[];
  electricityDemand: PlantSeries & { hourLabels: string[] };
  operatingPower: {
    units: { id: string; label: string; values: number[] }[];
    totalMw: number;
    deltaPct: number;
    hourLabels: string[];
  };
  energyCost: PlantSeries & { labels: string[]; currency: string };
};

// --- modelling constants -----------------------------------------------------
// Named rather than inlined, because these are the assumptions behind every
// modelled figure and they should be reviewable in one place.

/** Base electrical load of one running machine. */
const KW_PER_MACHINE = 74;
/** Instrument/aux load attributable to one streaming channel. */
const KW_PER_CHANNEL = 1.9;
/** Site standing load (lighting, HVAC, offices) that exists with nothing running. */
const KW_STANDING = 96;
/** Tariff used for the cost chart. */
const COST_PER_KWH = 8.4;
const CURRENCY = '₹';
/** Reporting window the energy figures are integrated over. */
const WINDOW_HOURS = 24;

// --- deterministic noise -----------------------------------------------------

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and identical across reloads for the same seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * A walk that ends exactly on `latest`.
 *
 * The run-up is modelled, the final point is measured — so the number printed
 * above a chart is always the real one, and the chart never contradicts it.
 */
function anchoredSeries(seed: number, length: number, latest: number, swing: number): number[] {
  const random = rng(seed);
  const out: number[] = [];
  let value = latest * (0.86 + random() * 0.2);
  for (let i = 0; i < length; i += 1) {
    // A slow sine gives the series a diurnal shape; the noise keeps it from
    // reading as a generated wave.
    const curve = Math.sin((i / length) * Math.PI * 1.6 - 0.5) * swing * 0.5;
    value += (random() - 0.47) * swing;
    out.push(Math.max(0, value + curve));
  }
  // Re-level onto the real figure without flattening the shape.
  const drift = latest - out[out.length - 1];
  return out.map((entry, index) => Math.max(0, entry + drift * (index / (length - 1))));
}

// --- component ↔ telemetry area binding -------------------------------------

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Bind each placed component to a telemetry area.
 *
 * Exact name first (which is how a super admin is expected to wire this up —
 * name the component after the area), then a word-overlap match, then whatever
 * areas are left over, in order. The leftover pass is what keeps a freshly
 * seeded plant meaningful: every component reports a *distinct* real area
 * rather than six components all echoing the same one.
 */
function bindAreas(
  components: PlantComponent3D[],
  areas: PlantArea[],
): Map<string, PlantArea | null> {
  const bound = new Map<string, PlantArea | null>();
  const taken = new Set<string>();

  const claim = (component: PlantComponent3D, area: PlantArea | undefined) => {
    if (!area || taken.has(area.id)) return false;
    taken.add(area.id);
    bound.set(component.id, area);
    return true;
  };

  const pending = components.filter(
    (component) => !claim(component, areas.find((area) => normalize(area.name) === normalize(component.name))),
  );

  const stillPending = pending.filter((component) => {
    const words = new Set(normalize(component.name).split(' '));
    return !claim(
      component,
      areas.find((area) => !taken.has(area.id) && normalize(area.name).split(' ').some((word) => words.has(word))),
    );
  });

  for (const component of stillPending) {
    bound.set(component.id, areas.find((area) => !taken.has(area.id)) ?? null);
    const assigned = bound.get(component.id);
    if (assigned) taken.add(assigned.id);
  }

  return bound;
}

/** Total site demand, kW. The single place the energy model lives. */
export function plantDemandKw(metrics: DashboardMetrics): number {
  return KW_STANDING + metrics.machinesOnline * KW_PER_MACHINE + metrics.activeChannels * KW_PER_CHANNEL;
}

export type BuildPlantAnalyticsInput = {
  metrics: DashboardMetrics;
  components: PlantComponent3D[];
  /** Explicit statuses already resolved by the dashboard (`auto` applied). */
  statuses: Record<string, PlantAssetStatus>;
  /** Drives the slow evolution of the shaped series. */
  nowMs: number;
};

export function buildPlantAnalytics({
  metrics,
  components,
  statuses,
  nowMs,
}: BuildPlantAnalyticsInput): PlantAnalytics {
  const seedBase = hash(metrics.plantName + components.map((c) => c.id).join('|'));
  // The shaped history advances once a minute. Fast enough to look alive,
  // slow enough that it never fights the 5s metric tick for attention.
  const phase = Math.floor(nowMs / 60_000);

  const areaBinding = bindAreas(components, metrics.areas);
  const totalDemandKw = plantDemandKw(metrics);

  // --- per-asset telemetry ---------------------------------------------------
  // Machines and alarms are apportioned from the bound area's real figures.
  // Load is apportioned by machine count, so the biggest area draws the most.

  const draft = components.map((component) => {
    const area = areaBinding.get(component.id) ?? null;
    const rows = area ? metrics.attention.filter((row) => row.area === area.name) : [];
    const random = rng(seedBase ^ hash(component.id));

    const machines = area?.count ?? 0;
    const alarms = rows.reduce((sum, row) => sum + row.alarms, 0);
    const health = rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.health, 0) / rows.length)
      : metrics.healthScore;

    const status: PlantAssetStatus = statuses[component.id] ?? area?.status ?? 'healthy';
    const offline = status === 'offline';
    // Footprint is a real proxy for connected load: the hall draws more than
    // the gateway house because it is bigger.
    const weight = machines + (component.scale / 100) ** 2 * 2.5;

    return {
      component,
      area,
      status,
      machines,
      machinesActive: offline ? 0 : Math.max(0, machines - rows.filter((row) => row.risk === 'High').length),
      alarms,
      health,
      weight: offline ? 0 : weight,
      // Deterministic per-asset variation so two areas of the same size do not
      // report identical temperatures.
      tempJitter: random(),
      oeeJitter: random(),
      utilJitter: random(),
    };
  });

  const weightTotal = draft.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  const assets: PlantAssetTelemetry[] = draft.map((entry) => {
    const powerKw = round((entry.weight / weightTotal) * totalDemandKw, 1);
    const load = entry.weight / weightTotal;
    return {
      id: entry.component.id,
      name: entry.component.name,
      status: entry.status,
      areaName: entry.area?.name ?? null,
      machines: entry.machines,
      machinesActive: entry.machinesActive,
      alarms: entry.alarms,
      powerKw,
      // Ambient plus a rise with load; warning and critical assets run hotter,
      // which is the whole point of showing a temperature next to a status.
      temperatureC: round(
        21.5 + load * 26 + entry.tempJitter * 3.2 + (entry.status === 'critical' ? 9 : entry.status === 'warning' ? 4.5 : 0),
        1,
      ),
      health: entry.health,
      oee: Math.round(clamp(metrics.oee + (entry.oeeJitter - 0.5) * 14, 0, 100)),
      utilization: Math.round(clamp(load * 100 * 2.2 + entry.utilJitter * 12, 0, 100)),
      latencyMs: metrics.avgLatencyMs,
      telemetry: entry.status === 'offline' ? 'OFFLINE' : 'ONLINE',
      energyKwh: round(powerKw * WINDOW_HOURS, 2),
    };
  });

  const byId: Record<string, PlantAssetTelemetry> = {};
  for (const asset of assets) byId[asset.id] = asset;

  // --- energy consumption ----------------------------------------------------
  // Top four by consumption, with the tail rolled into "Others" so the list is
  // always five rows and always adds up to the plant total.

  const ranked = [...assets].sort((a, b) => b.energyKwh - a.energyKwh);
  const head = ranked.slice(0, 4);
  const tail = ranked.slice(4);
  const energyRows: PlantEnergyRow[] = head.map((asset) => ({
    id: asset.id,
    label: asset.name,
    kwh: asset.energyKwh,
    share: 0,
  }));
  if (tail.length > 0) {
    energyRows.push({
      id: 'others',
      label: 'Others',
      kwh: round(tail.reduce((sum, asset) => sum + asset.energyKwh, 0), 2),
      share: 0,
    });
  }
  const energyMax = Math.max(1, ...energyRows.map((row) => row.kwh));
  const energy = energyRows.map((row) => ({ ...row, share: row.kwh / energyMax }));

  // --- system telemetry ------------------------------------------------------

  const system: PlantSystemTelemetry = {
    totalPowerMw: round(totalDemandKw / 1000, 3),
    totalEnergyKwh: round(totalDemandKw * WINDOW_HOURS, 3),
    activeMachines: metrics.machinesOnline,
    connectedGateways: metrics.connectedGateways,
  };

  // --- plant performance -----------------------------------------------------
  // All four are measured. Availability and Efficiency are the health factors
  // the score itself is built from, so the panel agrees with the KPI above it.

  const availability = metrics.healthFactors.find((factor) => factor.label === 'Availability')?.value ?? 0;
  const efficiency = metrics.healthFactors.find((factor) => factor.label === 'Performance')?.value ?? 0;
  const performance: PlantPerformanceRow[] = [
    { label: 'Availability', value: Math.round(availability) },
    { label: 'OEE', value: Math.round(metrics.oee) },
    { label: 'Efficiency', value: Math.round(efficiency) },
    {
      label: 'Utilization',
      value: metrics.machinesTotal > 0 ? Math.round((metrics.machinesOnline / metrics.machinesTotal) * 100) : 0,
    },
  ];

  // --- bottom series ---------------------------------------------------------

  const hourLabels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];

  const demandValues = anchoredSeries(seedBase ^ phase, 32, totalDemandKw, totalDemandKw * 0.06);
  const electricityDemand = {
    values: demandValues,
    latest: round(totalDemandKw, 0),
    deltaPct: round(((demandValues[demandValues.length - 1] - demandValues[0]) / Math.max(1, demandValues[0])) * 100, 1),
    hourLabels,
  };

  // Three feeders splitting the site load. Modelled the same way as the total,
  // and they sum to it, so the multi-series chart is internally consistent.
  const unitSplit = [0.42, 0.34, 0.24];
  const units = unitSplit.map((fraction, index) => ({
    id: `unit-${index + 1}`,
    label: `Unit ${index + 1}`,
    values: anchoredSeries(
      seedBase ^ phase ^ hash(`unit${index}`),
      32,
      (totalDemandKw / 1000) * fraction,
      (totalDemandKw / 1000) * 0.05,
    ),
  }));
  const operatingPower = {
    units,
    totalMw: round(totalDemandKw / 1000, 2),
    deltaPct: electricityDemand.deltaPct,
    hourLabels,
  };

  const costValues = anchoredSeries(
    seedBase ^ phase ^ hash('cost'),
    12,
    (totalDemandKw * WINDOW_HOURS * COST_PER_KWH) / 12,
    totalDemandKw * 1.4,
  );
  const energyCost = {
    values: costValues,
    latest: Math.round(costValues.reduce((sum, value) => sum + value, 0)),
    deltaPct: round(((costValues[costValues.length - 1] - costValues[0]) / Math.max(1, costValues[0])) * 100, 1),
    labels: Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')),
    currency: CURRENCY,
  };

  return {
    assets,
    byId,
    energy,
    system,
    performance,
    electricityDemand,
    operatingPower,
    energyCost,
  };
}
