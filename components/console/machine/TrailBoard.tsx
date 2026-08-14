import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { deviceWithGatewayConnectionState, gatewayForRack, type DeviceNode } from '../../../lib/devices';
import { liveMeasurementKey } from '../../../lib/liveMeasurementBus';
import { channelHasRecentData, channelLiveStatus, deviceHasLiveBinding, latestMeasurementForChannel, type LiveMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import { loadLocal, saveLocal } from '../../../lib/localPersist';
import { listChannels, type CardNode, type ChannelRef } from '../../../lib/rack';
import {
  alpha,
  Badge,
  Button,
  consolePalette,
  Toast,
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
  type IconName,
  type Variant,
} from '../../ui';
import { AdjustableTrail, type Point, type TrailStatus } from './AdjustableTrail';
import type { ConnectorState, MachineConnector } from './machineConnectors';
import { MappableBox, MAPPABLE_BOX_HEIGHT, MAPPABLE_BOX_WIDTH, UNLINKED_BOX_WIDTH } from './MappableBox';
import { createTemplateDefaultLayout, hasDefaultLayout } from './templateDefaultLayouts';

export type Anchor = { rx: number; ry: number };

export type Trail = {
  id: string;
  points: Point[];
  startBoxId?: string;
  endBoxId?: string;
  startBoxAnchor?: Anchor;
  endBoxAnchor?: Anchor;
  startMachineAnchor?: Anchor;
  endMachineAnchor?: Anchor;
  // Set when the machine end landed on one of the artwork's instrument pads
  // rather than on bare machine body. This is what turns a drawn line into a
  // declared connection: the pad's code identifies the instrument, and the
  // analysis layer resolves the card's signal through it.
  startMachinePointCode?: string;
  endMachinePointCode?: string;
  // Template-generated trails: the middle bend is *derived* (horizontal run out
  // of the box + one 45° segment into the machine), so whenever either endpoint
  // re-anchors (zoom, box move/resize) the bend is recomputed to keep that
  // shape instead of going stale at its authored position.
  autoRoute?: boolean;
};

// Recompute the derived bend of an auto-routed 3-point trail from its current
// endpoints: bend sits at the box end's height, offset from the machine end by
// exactly |Δy| so the machine-side segment is 45° and the box-side segment is
// horizontal.
function rerouteBend(trail: Trail, points: Point[]): Point[] {
  if (!trail.autoRoute || points.length !== 3) return points;
  const machineEnd = trail.startMachineAnchor ? points[0] : points[2];
  const boxEnd = trail.startMachineAnchor ? points[2] : points[0];
  const direction = boxEnd.x >= machineEnd.x ? 1 : -1;
  const bend = { x: machineEnd.x + direction * Math.abs(machineEnd.y - boxEnd.y), y: boxEnd.y };
  return [points[0], bend, points[2]];
}

export type Box = {
  id: string;
  x: number;
  y: number;
  centerX?: number;
  centerY?: number;
  label: string;
  channelId?: string;
  /** Stable machine-template identity; legacy saved boxes remain label-resolved. */
  templatePointCode?: string;
};

type Rect = { x: number; y: number; width: number; height: number };

type TrailBoardProps = {
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  machineRect: Rect | null;
  machineId: string;
  // Machines whose template ships a default layout (Rotary Airlock Valve,
  // Single Screw Extruder) get it auto-applied when opened with nothing saved,
  // and a "⟲ Template" toolbar button to re-apply it on demand.
  machineTemplate: string;
  // Positions/scales the board layer exactly like the machine's stage container,
  // so trail/box coordinates (stored in stage units) line up with the machine on
  // any screen. The toolbar renders outside this transform, unscaled.
  stageStyle: StyleProp<ViewStyle>;
  stageScale: number;
  // Actual View: clean dashboard-monitor rendering — no toolbar, no selection,
  // no dragging/editing. Live values and status colours keep updating.
  readOnly?: boolean;
  hideUnlink?: boolean;
  // Shared layout for this machine loaded from the server (Supabase). When
  // provided it seeds the board; "Save Config" persists back through
  // onSaveLayout so the change is visible to every other user.
  initialLayout?: SavedLayout | null;
  templateLayout?: SavedLayout | null;
  onSaveLayout?: (machineId: string, layout: SavedLayout) => void;
  onSaveTemplate?: (machineTemplate: string, layout: SavedLayout) => void;
  canSaveTemplate?: boolean;
  // The instrument pads this machine's artwork draws. A trail endpoint dropped
  // near one snaps onto it exactly and records which instrument it is.
  connectors?: MachineConnector[];
  // Reports which pads are wired right now, so the artwork can draw a connected
  // pad differently from an empty one.
  onConnectorStateChange?: (state: Record<string, ConnectorState>) => void;
  // TrailBoard keeps ownership of edit state while the workspace decides where
  // the command rail and stage layers are hosted.
  renderWorkspace?: (layers: TrailBoardLayers) => ReactNode;
};

export type TrailBoardLayers = {
  toolbar: ReactNode | null;
  board: ReactNode;
};

export type SavedLayout = { trails: Trail[]; boxes: Box[] };

// v3: coordinates are stage units on the fixed 1600×900 design stage, so saved
// layouts are resolution-independent. Shared with MachineWorkspace, which reads
// the same saved boxes to build the Actual View "Rack"/"Overview" sub-tabs.
export function trailBoardStorageKey(machineId: string) {
  return `ultron.trailboard.v3.${machineId}`;
}

const AUTO_SAVE_DEBOUNCE_MS = 700;

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pointInRect(point: Point, rect: Rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// Hit area covering the box's connector dot plus its actual rendered card.
// `size` should be the measured dimensions when known; before that, fall back
// to the shared card dimensions so linked cards behave the same in both modes.
function boxHitRect(box: { x: number; y: number }, size: { width: number; height: number } = { width: MAPPABLE_BOX_WIDTH, height: MAPPABLE_BOX_HEIGHT }): Rect {
  const cardLeft = box.x + 12;
  const cardTop = box.y - 30;
  const left = Math.min(box.x - 10, cardLeft - 10);
  const top = Math.min(box.y - 10, cardTop - 10);
  const right = Math.max(box.x + 10, cardLeft + size.width + 10);
  const bottom = cardTop + size.height + 10;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function boxVisualRect(
  box: Box,
  channels: ChannelRef[],
  size?: { width: number; height: number },
): Rect {
  const linked = !!box.channelId && channels.some((c) => c.id === box.channelId);
  const width = size?.width ?? (linked ? MAPPABLE_BOX_WIDTH : UNLINKED_BOX_WIDTH);
  const height = size?.height ?? MAPPABLE_BOX_HEIGHT;
  return {
    x: box.x + (linked ? 14 : 12),
    y: box.y + (linked ? -38 : -30),
    width,
    height,
  };
}

function withBoxCenter(
  box: Box,
  channels: ChannelRef[],
  size?: { width: number; height: number },
): Box {
  const rect = boxVisualRect(box, channels, size);
  return {
    ...box,
    centerX: Math.round((rect.x + rect.width / 2) * 100) / 100,
    centerY: Math.round((rect.y + rect.height / 2) * 100) / 100,
  };
}

function channelNumberFor(channel: ChannelRef): number {
  const match = channel.id.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

const STATUS_RANK: Record<TrailStatus, number> = { offline: -1, normal: 0, warning: 1, critical: 2 };
function worseStatus(a: TrailStatus, b: TrailStatus): TrailStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

// How close, in stage units, a dropped endpoint has to be to an instrument pad
// before it counts as a connection to that instrument. Wide enough to hit with
// a mouse at any zoom; well under the 80-unit spacing of the closest pair of
// pads on either artwork, so two neighbouring barrel zones can never be
// confused for each other.
const CONNECTOR_SNAP_RADIUS = 26;

function connectorStagePoint(connector: MachineConnector, rect: Rect): Point {
  return { x: rect.x + connector.rx * rect.width, y: rect.y + connector.ry * rect.height };
}

function nearestConnector(
  point: Point,
  rect: Rect | null,
  connectors: MachineConnector[],
): { connector: MachineConnector; point: Point } | null {
  if (!rect || connectors.length === 0) return null;
  let best: { connector: MachineConnector; point: Point; distance: number } | null = null;
  for (const connector of connectors) {
    const padPoint = connectorStagePoint(connector, rect);
    const distance = Math.hypot(point.x - padPoint.x, point.y - padPoint.y);
    if (distance <= CONNECTOR_SNAP_RADIUS && (!best || distance < best.distance)) {
      best = { connector, point: padPoint, distance };
    }
  }
  return best ? { connector: best.connector, point: best.point } : null;
}

function channelLocationLabel(channel: ChannelRef): string {
  return `S${String(channel.slot).padStart(2, '0')}.CH${channelNumberFor(channel)}`;
}

// Anchors are fractions of the machine rect; both artworks are drawn on the
// same 1200×760 viewBox, so comparing them in artwork units gives one tolerance
// that means the same thing at every zoom and screen size.
const ARTWORK_WIDTH = 1200;
const ARTWORK_HEIGHT = 760;
const ANCHOR_MATCH_TOLERANCE = 14;

function connectorForAnchor(anchor: Anchor | undefined, connectors: MachineConnector[]): MachineConnector | undefined {
  if (!anchor) return undefined;
  let best: { connector: MachineConnector; distance: number } | undefined;
  for (const connector of connectors) {
    const distance = Math.hypot((anchor.rx - connector.rx) * ARTWORK_WIDTH, (anchor.ry - connector.ry) * ARTWORK_HEIGHT);
    if (distance <= ANCHOR_MATCH_TOLERANCE && (!best || distance < best.distance)) best = { connector, distance };
  }
  return best?.connector;
}

/**
 * Give saved trails their pad identity back.
 *
 * Layouts saved before instrument pads were identified — including every trail
 * the template generator produced — carry only a machine anchor. That anchor is
 * already sitting on a pad, so the pad it is sitting on is recoverable, and
 * recovering it means an existing canvas lights up correctly instead of looking
 * unwired until every endpoint is dragged again.
 */
function withResolvedConnectors(trails: Trail[], connectors: MachineConnector[]): Trail[] {
  if (connectors.length === 0) return trails;
  let changed = false;
  const next = trails.map((trail) => {
    const start = trail.startMachinePointCode ? undefined : connectorForAnchor(trail.startMachineAnchor, connectors);
    const end = trail.endMachinePointCode ? undefined : connectorForAnchor(trail.endMachineAnchor, connectors);
    if (!start && !end) return trail;
    changed = true;
    return {
      ...trail,
      ...(start ? { startMachinePointCode: start.code } : null),
      ...(end ? { endMachinePointCode: end.code } : null),
    };
  });
  return changed ? next : trails;
}

/** A transient confirmation raised by a connection the operator just made. */
type ConnectionNotice = {
  id: number;
  variant: Variant;
  icon: IconName;
  title: string;
  detail?: string;
};

export function TrailBoard({
  devices,
  cards,
  live,
  machineRect,
  machineId,
  machineTemplate,
  stageStyle,
  stageScale,
  readOnly = false,
  hideUnlink = false,
  initialLayout = null,
  templateLayout = null,
  onSaveLayout,
  onSaveTemplate,
  canSaveTemplate = false,
  connectors = [],
  onConnectorStateChange,
  renderWorkspace,
}: TrailBoardProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const storageKey = trailBoardStorageKey(machineId);
  const effectiveRack = useCallback((rack: DeviceNode) => deviceWithGatewayConnectionState(rack, devices), [devices]);
  const pickableChannelFilter = useCallback(
    (rack: DeviceNode, card: CardNode, channelNumber: number) => {
      const rackState = effectiveRack(rack);
      if (rackState.status !== 'Online') return false;
      if (!card.enabled) return false;
      if (!live || !deviceHasLiveBinding(rackState, live)) return true;
      return channelLiveStatus(rackState, card, channelNumber, live) === 'active'
        || channelHasRecentData(rackState, card, channelNumber, live);
    },
    [effectiveRack, live],
  );
  // A saved layout wins; otherwise the canvas starts as only the machine
  // artwork. Template wiring is still available from the toolbar when needed.
  const initialLayoutRef = useRef<SavedLayout | null>(null);
  if (initialLayoutRef.current === null) {
    const saved = initialLayout ?? loadLocal<SavedLayout>(storageKey);
    initialLayoutRef.current = saved ?? templateLayout ?? { trails: [], boxes: [] };
  }

  const [trails, setTrails] = useState<Trail[]>(initialLayoutRef.current.trails);
  const [boxes, setBoxes] = useState<Box[]>(initialLayoutRef.current.boxes);
  const appliedRemoteLayout = useRef<SavedLayout | null>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [boxLiveValues, setBoxLiveValues] = useState<Record<string, number>>({});
  const [boxSizes, setBoxSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [justSaved, setJustSaved] = useState(false);
  const [justSavedTemplate, setJustSavedTemplate] = useState(false);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTemplateFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while an endpoint is being dragged, so every instrument pad on the
  // machine lights up as a target instead of the operator having to guess where
  // a connection is allowed to land.
  const [wiring, setWiring] = useState(false);
  // The pad a connection was just made to — pulsed briefly so the eye is taken
  // to the instrument that was wired, not just to the toast.
  const [flashedConnector, setFlashedConnector] = useState<string | null>(null);
  const [notice, setNotice] = useState<ConnectionNotice | null>(null);
  const noticeSeq = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channels = useMemo(() => listChannels(devices, cards), [devices, cards]);
  const pickableChannels = useMemo(() => listChannels(devices, cards, { channelIsAvailable: pickableChannelFilter }), [devices, cards, pickableChannelFilter]);
  const isChannelLive = useCallback(
    (channel: ChannelRef | null) => {
      if (!channel) return true;
      const rack = devices.find((device) => device.id === channel.rackId);
      const card = cards.find((c) => c.deviceId === channel.rackId && c.slot === channel.slot);
      if (!rack || !card) return false;
      const rackState = effectiveRack(rack);
      if (rackState.status !== 'Online') return false;
      if (!live || !deviceHasLiveBinding(rackState, live)) return true;
      const channelNumber = channelNumberFor(channel);
      return channelLiveStatus(rackState, card, channelNumber, live) === 'active'
        || channelHasRecentData(rackState, card, channelNumber, live);
    },
    [cards, devices, effectiveRack, live],
  );
  const liveReadingFor = useCallback(
    (channel: ChannelRef | null): LiveMeasurement | undefined => {
      if (!channel || !live) return undefined;
      const rack = devices.find((device) => device.id === channel.rackId);
      const card = cards.find((c) => c.deviceId === channel.rackId && c.slot === channel.slot);
      if (!rack || !card) return undefined;
      const rackState = effectiveRack(rack);
      if (rackState.status !== 'Online') return undefined;
      return latestMeasurementForChannel(rackState, card, channelNumberFor(channel), live);
    },
    [cards, devices, effectiveRack, live],
  );
  const liveMeasurementKeyFor = useCallback(
    (channel: ChannelRef | null): string | null => {
      if (!channel) return null;
      const rack = devices.find((device) => device.id === channel.rackId);
      if (!rack) return null;
      const gateway = gatewayForRack(rack, devices);
      const gatewayId = rack.realGatewayId ?? gateway?.realGatewayId;
      const rackId = rack.realRackId;
      if (!gatewayId || rackId === undefined || rackId === null || String(rackId) === '') return null;
      return liveMeasurementKey(gatewayId, String(rackId), channel.slot, channelNumberFor(channel));
    },
    [devices],
  );
  const channelsRef = useRef(channels);
  const trailsRef = useRef(trails);
  const boxesRef = useRef(boxes);
  const boxSizesRef = useRef(boxSizes);
  const readOnlyRef = useRef(readOnly);
  const onSaveLayoutRef = useRef(onSaveLayout);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayout = useRef<SavedLayout | null>(null);

  channelsRef.current = channels;
  trailsRef.current = trails;
  boxesRef.current = boxes;
  boxSizesRef.current = boxSizes;
  readOnlyRef.current = readOnly;
  onSaveLayoutRef.current = onSaveLayout;

  const readingText = useCallback((reading: LiveMeasurement | undefined, channel: ChannelRef): string | null => {
    if (!reading || typeof reading.value !== 'number' || !Number.isFinite(reading.value)) return null;
    const value = Math.abs(reading.value) >= 100 ? reading.value.toFixed(1) : reading.value.toFixed(2);
    return `${value} ${reading.unit ?? channel.unit}`.trim();
  }, []);

  /**
   * State the connection the operator just made, then get out of the way.
   *
   * The four outcomes are deliberately distinct. "Connected to the analysis
   * layer" is only claimed when a pad the model actually reads carries a linked
   * channel that is currently reporting — a card sitting on an instrument the
   * model does not consume, or one that has never sent a sample, is a different
   * situation and says so rather than being congratulated.
   */
  const announceConnection = useCallback(
    (connector: MachineConnector, box: Box | undefined) => {
      const channel = box?.channelId ? channelsRef.current.find((c) => c.id === box.channelId) ?? null : null;
      const reading = channel ? liveReadingFor(channel) : undefined;
      const value = channel && isChannelLive(channel) ? readingText(reading, channel) : null;

      const next: Omit<ConnectionNotice, 'id'> = !connector.analyzerTag
        ? {
            variant: 'muted',
            icon: 'link-variant-off',
            title: `${connector.label} is not read by the analysis layer`,
            detail: connector.analyzerNote ?? 'This instrument carries no tag in the current model.',
          }
        : !channel
          ? {
              variant: 'info',
              icon: 'link-variant',
              title: `Connected to ${connector.label}`,
              detail: `Link a rack channel to feed analyzer tag ${connector.analyzerTag}.`,
            }
          : value
            ? {
                variant: 'success',
                icon: 'check-decagram',
                title: `This data is connected to channel ${channel.code}`,
                detail: `${connector.label} → ${connector.analyzerTag} · ${channelLocationLabel(channel)} · ${value}`,
              }
            : {
                variant: 'warning',
                icon: 'timer-sand',
                title: `${channel.code} linked to ${connector.label}`,
                detail: `Analyzer tag ${connector.analyzerTag} — waiting for the first gateway sample.`,
              };

      noticeSeq.current += 1;
      setNotice({ ...next, id: noticeSeq.current });
      setFlashedConnector(connector.code);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashedConnector(null), 2000);
    },
    [isChannelLive, liveReadingFor, readingText],
  );

  const layoutWithCenters = useCallback((nextTrails: Trail[], nextBoxes: Box[]): SavedLayout => {
    return {
      trails: nextTrails,
      boxes: nextBoxes.map((box) => withBoxCenter(box, channelsRef.current, boxSizesRef.current[box.id])),
    };
  }, []);

  const persistLayout = useCallback(
    (nextTrails: Trail[], nextBoxes: Box[], options: { immediate?: boolean } = {}) => {
      if (readOnlyRef.current) return;
      const layout = layoutWithCenters(nextTrails, nextBoxes);
      saveLocal<SavedLayout>(storageKey, layout);
      pendingLayout.current = layout;

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      const send = () => {
        const queued = pendingLayout.current;
        pendingLayout.current = null;
        onSaveLayoutRef.current?.(machineId, queued ?? layout);
      };
      if (options.immediate) {
        send();
      } else {
        autoSaveTimer.current = setTimeout(send, AUTO_SAVE_DEBOUNCE_MS);
      }
    },
    [layoutWithCenters, machineId, storageKey],
  );

  const replaceTrails = useCallback(
    (next: Trail[] | ((current: Trail[]) => Trail[]), shouldPersist = true) => {
      const nextTrails = typeof next === 'function' ? next(trailsRef.current) : next;
      trailsRef.current = nextTrails;
      setTrails(nextTrails);
      if (shouldPersist) persistLayout(nextTrails, boxesRef.current);
    },
    [persistLayout],
  );

  const replaceBoxes = useCallback(
    (next: Box[] | ((current: Box[]) => Box[]), shouldPersist = true) => {
      const nextBoxes = typeof next === 'function' ? next(boxesRef.current) : next;
      boxesRef.current = nextBoxes;
      setBoxes(nextBoxes);
      if (shouldPersist) persistLayout(trailsRef.current, nextBoxes);
    },
    [persistLayout],
  );

  // A polling refresh may deliver a layout saved by another authenticated user
  // while this machine is open. Apply that new object to both design and actual
  // canvases so their geometry stays consistent without requiring navigation.
  useEffect(() => {
    if (!initialLayout || initialLayout === appliedRemoteLayout.current) return;
    appliedRemoteLayout.current = initialLayout;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    trailsRef.current = initialLayout.trails;
    boxesRef.current = initialLayout.boxes;
    setTrails(initialLayout.trails);
    setBoxes(initialLayout.boxes);
    setSelectedId(null);
  }, [initialLayout]);

  const applyTemplateLayout = () => {
    // Generate against the machine's *current* rect (it shrinks/grows with
    // zoom) — endpoints and bends land exactly on the artwork as rendered
    // right now, not where it would sit at 100%.
    const layout = templateLayout ?? createTemplateDefaultLayout(machineTemplate, pickableChannels, machineRect);
    trailsRef.current = layout.trails;
    boxesRef.current = layout.boxes;
    setTrails(layout.trails);
    setBoxes(layout.boxes);
    persistLayout(layout.trails, layout.boxes);
    setSelectedId(null);
  };

  const saveConfig = () => {
    // Persist to the shared server layout (visible to other users) and keep a
    // local copy so offline / native still renders the last saved state.
    persistLayout(trailsRef.current, boxesRef.current, { immediate: true });
    setJustSaved(true);
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    savedFlashTimer.current = setTimeout(() => setJustSaved(false), 1600);
  };

  const templateSafeLayout = () => {
    const layout = layoutWithCenters(trailsRef.current, boxesRef.current);
    return {
      trails: layout.trails,
      boxes: layout.boxes.map((box) => {
        const { channelId: _channelId, ...rest } = box;
        return rest;
      }),
    };
  };

  const saveTemplate = () => {
    onSaveTemplate?.(machineTemplate, templateSafeLayout());
    setJustSavedTemplate(true);
    if (savedTemplateFlashTimer.current) clearTimeout(savedTemplateFlashTimer.current);
    savedTemplateFlashTimer.current = setTimeout(() => setJustSavedTemplate(false), 1600);
  };

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
      if (savedTemplateFlashTimer.current) clearTimeout(savedTemplateFlashTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (pendingLayout.current) {
        onSaveLayoutRef.current?.(machineId, pendingLayout.current);
        pendingLayout.current = null;
      }
    };
  }, [machineId]);

  useEffect(() => {
    if (initialLayout || !templateLayout || trailsRef.current.length > 0 || boxesRef.current.length > 0) return;
    trailsRef.current = templateLayout.trails;
    boxesRef.current = templateLayout.boxes;
    setTrails(templateLayout.trails);
    setBoxes(templateLayout.boxes);
  }, [initialLayout, templateLayout]);

  // Entering Actual View drops any active selection so no editing chrome
  // (highlight ring, bend toolbar) leaks into the clean monitor rendering.
  useEffect(() => {
    if (readOnly) setSelectedId(null);
  }, [readOnly]);

  const addTrail = () => {
    const n = trails.length;
    const baseX = boardSize.width > 0 ? boardSize.width / 2 : 300;
    const baseY = boardSize.height > 0 ? boardSize.height / 2 : 200;
    const stagger = (n % 6) * 26;
    const id = makeId('trail');

    replaceTrails((prev) => [
      ...prev,
      {
        id,
        points: [
          { x: baseX - 160 + stagger, y: baseY - 80 + stagger },
          { x: baseX + 160 - stagger, y: baseY + 80 - stagger },
        ],
      },
    ]);
    setSelectedId(id);
  };

  const addBox = () => {
    const n = boxes.length;
    const baseX = boardSize.width > 0 ? boardSize.width / 2 : 300;
    const baseY = boardSize.height > 0 ? boardSize.height / 2 : 200;
    const stagger = (n % 5) * 30;

    replaceBoxes((prev) => [...prev, { id: makeId('box'), x: baseX - 220, y: baseY - 120 + stagger, label: '' }]);
  };

  const updateTrailPoints = (id: string, points: Point[]) => {
    replaceTrails((prev) => prev.map((t) => (t.id === id ? { ...t, points } : t)));
  };

  const removeTrail = (id: string) => {
    replaceTrails((prev) => prev.filter((t) => t.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };

  // Detach a trail endpoint from whatever box/machine spot it was attached to
  // (called as soon as the user grabs it again) so it's freely draggable instead
  // of fighting a controlled position.
  const detachEndpoint = (trailId: string, which: 'start' | 'end') => {
    const boxIdKey = which === 'start' ? 'startBoxId' : 'endBoxId';
    const boxAnchorKey = which === 'start' ? 'startBoxAnchor' : 'endBoxAnchor';
    const machineAnchorKey = which === 'start' ? 'startMachineAnchor' : 'endMachineAnchor';
    const pointCodeKey = which === 'start' ? 'startMachinePointCode' : 'endMachinePointCode';
    replaceTrails((prev) =>
      prev.map((t) =>
        t.id === trailId
          ? { ...t, [boxIdKey]: undefined, [boxAnchorKey]: undefined, [machineAnchorKey]: undefined, [pointCodeKey]: undefined }
          : t,
      ),
    );
  };

  // On release, in priority order:
  //   1. an instrument pad within snapping distance — the endpoint jumps onto
  //      the pad exactly and the connection is recorded against that instrument;
  //   2. a box the endpoint was dropped on (nearest wins);
  //   3. bare machine body, anchored at the exact spot it was dropped.
  // Every case is remembered as a fraction of that box's/machine's rect, so the
  // endpoint tracks its target through drags, resizes and zoom.
  const releaseEndpoint = (trailId: string, which: 'start' | 'end', point: Point) => {
    const pad = nearestConnector(point, machineRect, connectors);

    const candidateBoxes = pad
      ? []
      : boxes
          .map((box) => ({ box, rect: boxHitRect(box, boxSizes[box.id]) }))
          .filter(({ rect }) => pointInRect(point, rect))
          .sort((a, b) => Math.hypot(point.x - a.box.x, point.y - a.box.y) - Math.hypot(point.x - b.box.x, point.y - b.box.y));

    const hit = candidateBoxes[0] ?? null;
    const hitMachine = !pad && !hit && machineRect && pointInRect(point, machineRect) ? machineRect : null;

    // The card at the *other* end is the one this instrument now describes.
    const releasedTrail = trailsRef.current.find((t) => t.id === trailId);
    const oppositeBoxId = releasedTrail ? (which === 'start' ? releasedTrail.endBoxId : releasedTrail.startBoxId) : undefined;

    const nextTrails = trailsRef.current.map((t) => {
      if (t.id !== trailId) return t;
      const index = which === 'start' ? 0 : t.points.length - 1;
      const boxIdKey = which === 'start' ? 'startBoxId' : 'endBoxId';
      const boxAnchorKey = which === 'start' ? 'startBoxAnchor' : 'endBoxAnchor';
      const machineAnchorKey = which === 'start' ? 'startMachineAnchor' : 'endMachineAnchor';
      const pointCodeKey = which === 'start' ? 'startMachinePointCode' : 'endMachinePointCode';
      const landing = pad ? pad.point : point;
      const nextPoints = t.points.map((p, i) => (i === index ? landing : p));

      if (pad && machineRect) {
        return {
          ...t,
          points: nextPoints,
          [boxIdKey]: undefined,
          [boxAnchorKey]: undefined,
          [machineAnchorKey]: { rx: pad.connector.rx, ry: pad.connector.ry } satisfies Anchor,
          [pointCodeKey]: pad.connector.code,
        };
      }

      if (hit) {
        const anchor: Anchor = { rx: (point.x - hit.rect.x) / hit.rect.width, ry: (point.y - hit.rect.y) / hit.rect.height };
        return { ...t, points: nextPoints, [boxIdKey]: hit.box.id, [boxAnchorKey]: anchor, [machineAnchorKey]: undefined, [pointCodeKey]: undefined };
      }

      if (hitMachine) {
        const anchor: Anchor = { rx: (point.x - hitMachine.x) / hitMachine.width, ry: (point.y - hitMachine.y) / hitMachine.height };
        return { ...t, points: nextPoints, [boxIdKey]: undefined, [boxAnchorKey]: undefined, [machineAnchorKey]: anchor, [pointCodeKey]: undefined };
      }

      return {
        ...t,
        points: nextPoints,
        [boxIdKey]: undefined,
        [boxAnchorKey]: undefined,
        [machineAnchorKey]: undefined,
        [pointCodeKey]: undefined,
      };
    });

    // Landing on a pad names the card: the instrument's code is what the
    // analysis layer resolves the signal through, and an unnamed card takes the
    // instrument's own label rather than staying blank.
    const connectedBox = oppositeBoxId ? boxesRef.current.find((b) => b.id === oppositeBoxId) : undefined;
    const nextBoxes =
      pad && connectedBox
        ? boxesRef.current.map((b) =>
            b.id === connectedBox.id
              ? { ...b, templatePointCode: pad.connector.code, label: b.label.trim() ? b.label : pad.connector.label }
              : b,
          )
        : boxesRef.current;

    replaceTrails(nextTrails, false);
    replaceBoxes(nextBoxes);

    if (pad) {
      announceConnection(pad.connector, nextBoxes.find((b) => b.id === oppositeBoxId));
    }
  };

  const updateBoxPosition = (id: string, point: Point) => {
    replaceBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...point } : b)));
  };

  const updateBoxLabel = (id: string, label: string) => {
    replaceBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)));
  };

  const pickBoxChannel = (id: string, channel: ChannelRef | null) => {
    const nextBoxes = boxesRef.current.map((b) => (b.id === id ? { ...b, channelId: channel?.id } : b));
    replaceBoxes(nextBoxes);

    // The card was already sitting on an instrument pad and has only now been
    // given a channel — that is the same connection event as dropping it there,
    // so it gets the same confirmation.
    if (!channel) return;
    const attached = trailsRef.current.find(
      (t) => (t.endBoxId === id && t.startMachinePointCode) || (t.startBoxId === id && t.endMachinePointCode),
    );
    const code = attached?.endBoxId === id ? attached?.startMachinePointCode : attached?.endMachinePointCode;
    const connector = code ? connectors.find((candidate) => candidate.code === code) : undefined;
    if (connector) announceConnection(connector, nextBoxes.find((b) => b.id === id));
  };

  const removeBox = (id: string) => {
    const nextBoxes = boxesRef.current.filter((b) => b.id !== id);
    const nextTrails = trailsRef.current.map((t) => ({
        ...t,
        startBoxId: t.startBoxId === id ? undefined : t.startBoxId,
        startBoxAnchor: t.startBoxId === id ? undefined : t.startBoxAnchor,
        endBoxId: t.endBoxId === id ? undefined : t.endBoxId,
        endBoxAnchor: t.endBoxId === id ? undefined : t.endBoxAnchor,
      }));
    boxesRef.current = nextBoxes;
    trailsRef.current = nextTrails;
    setBoxes(nextBoxes);
    setTrails(nextTrails);
    persistLayout(nextTrails, nextBoxes);
    setBoxLiveValues((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const addBendToSelected = () => {
    replaceTrails((prev) =>
      prev.map((t) => {
        if (t.id !== selectedId || t.points.length < 2) return t;
        const insertIndex = t.points.length - 1;
        const previous = t.points[insertIndex - 1];
        const end = t.points[insertIndex];
        const bend = { x: (previous.x + end.x) / 2, y: (previous.y + end.y) / 2 };
        return { ...t, points: [...t.points.slice(0, insertIndex), bend, ...t.points.slice(insertIndex)] };
      }),
    );
  };

  const removeBendFromSelected = () => {
    replaceTrails((prev) =>
      prev.map((t) => (t.id === selectedId && t.points.length > 2 ? { ...t, points: t.points.filter((_, i) => i !== t.points.length - 2) } : t)),
    );
  };

  // Machine moved/resized (zoom change) — pull every machine-anchored endpoint
  // along with it, from its remembered relative position.
  useEffect(() => {
    if (!machineRect) return;
    setTrails((prev) => {
      const next = prev.map((t) => {
        if (!t.startMachineAnchor && !t.endMachineAnchor) return t;
        const nextPoints = t.points.map((p, i) => {
          if (t.startMachineAnchor && i === 0) {
            return { x: machineRect.x + t.startMachineAnchor.rx * machineRect.width, y: machineRect.y + t.startMachineAnchor.ry * machineRect.height };
          }
          if (t.endMachineAnchor && i === t.points.length - 1) {
            return { x: machineRect.x + t.endMachineAnchor.rx * machineRect.width, y: machineRect.y + t.endMachineAnchor.ry * machineRect.height };
          }
          return p;
        });
        return { ...t, points: rerouteBend(t, nextPoints) };
      });
      trailsRef.current = next;
      return next;
    });
  }, [machineRect]);

  // A box moved, OR its rendered boundary changed — pull every box-anchored
  // endpoint along with it, from its remembered relative spot on that box's
  // *current* rect.
  useEffect(() => {
    setTrails((prev) => {
      const next = prev.map((t) => {
        if (!t.startBoxAnchor && !t.endBoxAnchor) return t;
        const nextPoints = t.points.map((p, i) => {
          if (t.startBoxAnchor && i === 0) {
            const box = boxes.find((b) => b.id === t.startBoxId);
            if (!box) return p;
            const rect = boxHitRect(box, boxSizes[box.id]);
            return { x: rect.x + t.startBoxAnchor.rx * rect.width, y: rect.y + t.startBoxAnchor.ry * rect.height };
          }
          if (t.endBoxAnchor && i === t.points.length - 1) {
            const box = boxes.find((b) => b.id === t.endBoxId);
            if (!box) return p;
            const rect = boxHitRect(box, boxSizes[box.id]);
            return { x: rect.x + t.endBoxAnchor.rx * rect.width, y: rect.y + t.endBoxAnchor.ry * rect.height };
          }
          return p;
        });
        return { ...t, points: rerouteBend(t, nextPoints) };
      });
      trailsRef.current = next;
      return next;
    });
  }, [boxes, boxSizes]);

  // Wherever a trail is actually attached to this box right now — falls back to
  // the box's own anchor point when nothing's attached yet.
  const boxConnectorPoint = (box: Box): Point => {
    const attachedTrail = trails.find((t) => t.startBoxId === box.id || t.endBoxId === box.id);
    if (!attachedTrail) return { x: box.x, y: box.y };
    return attachedTrail.startBoxId === box.id ? attachedTrail.points[0] : attachedTrail.points[attachedTrail.points.length - 1];
  };

  const boxStatus = (boxId: string | undefined): TrailStatus => {
    if (!boxId) return 'normal';
    const box = boxes.find((b) => b.id === boxId);
    const channel = box?.channelId ? channels.find((c) => c.id === box.channelId) : null;
    if (!channel) return 'normal';
    const value = boxLiveValues[boxId];
    if (value === undefined) return 'normal';
    if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return 'critical';
    if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return 'warning';
    return 'normal';
  };

  // A layout can arrive from local storage, from the server, or from the
  // template generator; all three are normalised here rather than at each entry
  // point, so no path can leave a trail on a pad without knowing which pad.
  useEffect(() => {
    const resolved = withResolvedConnectors(trailsRef.current, connectors);
    if (resolved === trailsRef.current) return;
    trailsRef.current = resolved;
    setTrails(resolved);
  }, [connectors, trails]);

  // Which instrument pads are wired, and whether the card on the other end is
  // actually reporting. The artwork draws an empty pad, a wired pad and a live
  // pad differently, so the machine itself shows what is instrumented.
  const connectorState = useMemo<Record<string, ConnectorState>>(() => {
    if (connectors.length === 0) return {};
    const state: Record<string, ConnectorState> = {};
    for (const trail of trails) {
      const ends = [
        { code: trail.startMachinePointCode, boxId: trail.endBoxId },
        { code: trail.endMachinePointCode, boxId: trail.startBoxId },
      ];
      for (const end of ends) {
        if (!end.code) continue;
        const box = end.boxId ? boxes.find((b) => b.id === end.boxId) : undefined;
        const channel = box?.channelId ? channels.find((c) => c.id === box.channelId) ?? null : null;
        const reporting = !!channel && isChannelLive(channel) && typeof liveReadingFor(channel)?.value === 'number';
        if (state[end.code] === 'live') continue;
        state[end.code] = reporting ? 'live' : 'linked';
      }
    }
    return state;
  }, [boxes, channels, connectors.length, isChannelLive, liveReadingFor, trails]);

  // Telemetry ticks rebuild the map every few hundred ms; only a real change in
  // what is wired should reach the parent and re-render the artwork.
  const connectorStateRef = useRef(connectorState);
  connectorStateRef.current = connectorState;
  const connectorStateKey = useMemo(
    () =>
      Object.keys(connectorState)
        .sort()
        .map((code) => `${code}:${connectorState[code]}`)
        .join('|'),
    [connectorState],
  );
  useEffect(() => {
    onConnectorStateChange?.(connectorStateRef.current);
  }, [connectorStateKey, onConnectorStateChange]);

  const selectedTrail = selectedId ? trails.find((trail) => trail.id === selectedId) ?? null : null;
  const linkedChannelCount = boxes.filter((box) => box.channelId).length;
  const wiredPadCount = Object.keys(connectorState).length;

  // The command rail. One instrument, grouped by what the buttons do: what the
  // canvas holds, what can be added, the template, then the two commit actions.
  // Trail-specific editing is deliberately not here — it lives on the canvas
  // beside the selected trail, so this rail keeps a fixed height and the stage
  // below it never resizes when a selection changes.
  const toolbar = readOnly ? null : (
    <Toolbar>
      <ToolbarGroup className="px-1.5">
        <Badge variant="muted" icon="vector-polyline">
          {trails.length} trail{trails.length === 1 ? '' : 's'}
        </Badge>
        <Badge variant={linkedChannelCount > 0 ? 'success' : 'muted'} icon="link-variant">
          {linkedChannelCount}/{boxes.length} linked
        </Badge>
        {connectors.length > 0 ? (
          <Badge variant={wiredPadCount > 0 ? 'info' : 'muted'} icon="target-variant">
            {wiredPadCount}/{connectors.length} pads
          </Badge>
        ) : null}
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup>
        <Button tone="primary" icon="vector-line" onPress={addTrail} accessibilityLabel="Add trail">
          Add Trail
        </Button>
        <Button tone="secondary" icon="card-plus-outline" onPress={addBox} accessibilityLabel="Add data box">
          Add Box
        </Button>
      </ToolbarGroup>

      {(hasDefaultLayout(machineTemplate) || (canSaveTemplate && onSaveTemplate)) && (
        <>
          <ToolbarDivider />
          <ToolbarGroup>
            {hasDefaultLayout(machineTemplate) && (
              <Button tone="info" icon="restore" onPress={applyTemplateLayout} accessibilityLabel="Apply the template layout">
                Template
              </Button>
            )}
            {canSaveTemplate && onSaveTemplate && (
              <Button
                tone="info"
                icon={justSavedTemplate ? 'check' : 'content-save-cog-outline'}
                onPress={saveTemplate}
                accessibilityLabel="Save this layout as the template"
              >
                {justSavedTemplate ? 'Template saved' : 'Save Template'}
              </Button>
            )}
          </ToolbarGroup>
        </>
      )}

      <ToolbarDivider />

      <Button
        tone="success"
        icon={justSaved ? 'check-decagram' : 'content-save-outline'}
        onPress={saveConfig}
        accessibilityLabel="Save the canvas configuration"
      >
        {justSaved ? 'Configuration saved' : 'Save Config'}
      </Button>
    </Toolbar>
  );

  // Contextual editing for the selected trail, floated over the canvas so the
  // toolbar's height — and therefore the stage scale — never changes.
  const selectionRail =
    selectedTrail && !readOnly ? (
      <View pointerEvents="box-none" className="absolute inset-x-0 bottom-4 items-center">
        <View pointerEvents="box-none" className="flex-row items-center gap-2 px-4">
          <Toolbar>
            <ToolbarGroup className="pl-1.5">
              <Badge variant="info" icon="vector-polyline">
                Trail · {selectedTrail.points.length - 2} bend{selectedTrail.points.length - 2 === 1 ? '' : 's'}
              </Badge>
            </ToolbarGroup>
            <ToolbarDivider />
            <ToolbarGroup>
              <Button
                tone="secondary"
                size="xs"
                icon="minus"
                disabled={selectedTrail.points.length <= 2}
                onPress={removeBendFromSelected}
                accessibilityLabel="Remove a bend from the selected trail"
              >
                Bend
              </Button>
              <Button tone="secondary" size="xs" icon="plus" onPress={addBendToSelected} accessibilityLabel="Add a bend to the selected trail">
                Bend
              </Button>
            </ToolbarGroup>
            <ToolbarDivider />
            <Button
              tone="destructive"
              size="xs"
              icon="trash-can-outline"
              onPress={() => removeTrail(selectedTrail.id)}
              accessibilityLabel="Delete the selected trail"
            >
              Delete
            </Button>
          </Toolbar>
        </View>
      </View>
    ) : null;

  const board = (
    <>
      {/* Tapping empty canvas deselects — only mounted while something is selected, so
          it never intercepts clicks meant for the machine underneath otherwise. */}
      {selectedId && !readOnly && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={() => setSelectedId(null)}
        />
      )}

      {/* Standalone use (no host workspace): the rail floats top-right over the
          canvas, matching where the workspace puts it. */}
      {!renderWorkspace && !readOnly && (
        <View pointerEvents="box-none" className="absolute right-4 top-4 items-end" style={{ zIndex: 20 }}>
          {toolbar}
        </View>
      )}

      {/* Board layer — same absolute position + scale transform as the machine's
          stage, so everything inside shares the machine's stage coordinate space. */}
      <View
        pointerEvents="box-none"
        // userSelect (web): prevents a drag gesture from picking up a native
        // text selection as it passes over nearby labels underneath the overlay.
        style={[stageStyle, { userSelect: 'none' }]}
        onLayout={(e) => setBoardSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {/* Instrument pads as drop targets. They appear the moment an endpoint
            is picked up, so where a connection may land is shown rather than
            guessed, and the pad just wired keeps a ring for the life of the
            confirmation toast. */}
        {!readOnly && machineRect && connectors.length > 0 && (wiring || flashedConnector) && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
            {connectors.map((connector) => {
              const flashed = flashedConnector === connector.code;
              if (!wiring && !flashed) return null;
              const padPoint = connectorStagePoint(connector, machineRect);
              const size = flashed ? 34 : 26;
              const colour = connector.analyzerTag ? palette.accent : palette.neutral;
              return (
                <View
                  key={connector.code}
                  style={{
                    position: 'absolute',
                    left: padPoint.x - size / 2,
                    top: padPoint.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: flashed ? 2 : 1.5,
                    borderColor: alpha(colour, flashed ? 0.95 : 0.42),
                    backgroundColor: alpha(colour, flashed ? 0.2 : 0.08),
                  }}
                />
              );
            })}
          </View>
        )}

        {trails.map((trail) => (
          <AdjustableTrail
            key={trail.id}
            points={trail.points}
            selected={trail.id === selectedId}
            status={worseStatus(boxStatus(trail.startBoxId), boxStatus(trail.endBoxId))}
            canvasWidth={boardSize.width}
            canvasHeight={boardSize.height}
            stageScale={stageScale}
            interactive={!readOnly}
            showControlPoints={!readOnly}
            onPointsChange={(points) => updateTrailPoints(trail.id, points)}
            onSelect={() => setSelectedId(trail.id)}
            onEndpointGrab={(which) => {
              setWiring(true);
              detachEndpoint(trail.id, which);
            }}
            onEndpointRelease={(which, point) => {
              setWiring(false);
              releaseEndpoint(trail.id, which, point);
            }}
          />
        ))}

        {boxes.map((box) => {
          const channel = channels.find((c) => c.id === box.channelId) ?? null;
          return (
            <MappableBox
              key={box.id}
              x={box.x}
              y={box.y}
              label={box.label}
              attached={trails.some((t) => t.startBoxId === box.id || t.endBoxId === box.id)}
              connectorPoint={boxConnectorPoint(box)}
              channel={channel}
              dataLive={isChannelLive(channel)}
              liveReading={liveReadingFor(channel)}
              liveMeasurementKey={liveMeasurementKeyFor(channel)}
              channels={channels}
              pickableChannels={pickableChannels}
              devices={devices}
              canvasWidth={boardSize.width}
              canvasHeight={boardSize.height}
              stageScale={stageScale}
              readOnly={readOnly}
              hideUnlink={hideUnlink}
              onDrag={(point) => updateBoxPosition(box.id, point)}
              onLabelChange={(label) => updateBoxLabel(box.id, label)}
              onPickChannel={(channel) => pickBoxChannel(box.id, channel)}
              onDelete={() => removeBox(box.id)}
              onLiveValueChange={(value) => setBoxLiveValues((prev) => (prev[box.id] === value ? prev : { ...prev, [box.id]: value }))}
              onSizeChange={(size) =>
                setBoxSizes((prev) => (prev[box.id]?.width === size.width && prev[box.id]?.height === size.height ? prev : { ...prev, [box.id]: size }))
              }
            />
          );
        })}
      </View>

      {selectionRail}

      {/* The connection confirmation. Sits over the canvas rather than in the
          page flow so it cannot reflow the stage while it is on screen. */}
      {notice && (
        <View pointerEvents="box-none" className="absolute inset-x-0 top-4 items-center px-4" style={{ zIndex: 30 }}>
          <Toast
            key={notice.id}
            variant={notice.variant}
            icon={notice.icon}
            title={notice.title}
            detail={notice.detail}
            durationMs={2000}
            onDone={() => setNotice((current) => (current && current.id === notice.id ? null : current))}
          />
        </View>
      )}
    </>
  );

  if (renderWorkspace) return <>{renderWorkspace({ toolbar, board })}</>;

  return board;
}
