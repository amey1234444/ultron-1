import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, gatewayForRack, type DeviceNode } from '../../../lib/devices';
import { liveMeasurementKey } from '../../../lib/liveMeasurementBus';
import { channelHasRecentData, channelLiveStatus, latestMeasurementForChannel, type LiveMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import { loadLocal, saveLocal } from '../../../lib/localPersist';
import { listChannels, type CardNode, type ChannelRef } from '../../../lib/rack';
import { AdjustableTrail, type Point, type TrailStatus } from './AdjustableTrail';
import { MappableBox, MAPPABLE_BOX_HEIGHT, MAPPABLE_BOX_WIDTH, UNLINKED_BOX_WIDTH } from './MappableBox';
import { createRavDefaultLayout, hasDefaultLayout } from './ravDefaultLayout';

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
};

type Rect = { x: number; y: number; width: number; height: number };

type TrailBoardProps = {
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  machineRect: Rect | null;
  machineId: string;
  // Machines whose template ships a default layout (currently the Rotary
  // Airlock Valve) get it auto-applied when opened with nothing saved, and a
  // "⟲ Template" toolbar button to re-apply it on demand.
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
  onSaveLayout?: (machineId: string, layout: SavedLayout) => void;
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
  onSaveLayout,
}: TrailBoardProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const storageKey = trailBoardStorageKey(machineId);
  const effectiveRack = useCallback((rack: DeviceNode) => deviceWithGatewayConnectionState(rack, devices), [devices]);
  const pickableChannelFilter = useCallback(
    (rack: DeviceNode, card: CardNode, channelNumber: number) => {
      const rackState = effectiveRack(rack);
      if (rackState.status !== 'Online') return false;
      if (!card.enabled) return false;
      if (!live || (live.gateways.length === 0 && live.racks.length === 0 && live.slots.length === 0 && live.measurements.length === 0)) return true;
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
    initialLayoutRef.current = saved ?? { trails: [], boxes: [] };
  }

  const [trails, setTrails] = useState<Trail[]>(initialLayoutRef.current.trails);
  const [boxes, setBoxes] = useState<Box[]>(initialLayoutRef.current.boxes);
  const appliedRemoteLayout = useRef<SavedLayout | null>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [boxLiveValues, setBoxLiveValues] = useState<Record<string, number>>({});
  const [boxSizes, setBoxSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [justSaved, setJustSaved] = useState(false);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (!live) return true;
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
    const layout = createRavDefaultLayout(pickableChannels, machineRect);
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

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (pendingLayout.current) {
        onSaveLayoutRef.current?.(machineId, pendingLayout.current);
        pendingLayout.current = null;
      }
    };
  }, [machineId]);

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
    replaceTrails((prev) =>
      prev.map((t) => (t.id === trailId ? { ...t, [boxIdKey]: undefined, [boxAnchorKey]: undefined, [machineAnchorKey]: undefined } : t)),
    );
  };

  // On release: attach to a box if dropped anywhere on one (nearest wins), else
  // attach to the machine if dropped anywhere on it. Either way it sticks to the
  // *exact* spot it was dropped — any border or corner, not just a fixed
  // connector — remembered as a fraction of that box's/machine's rect so it can
  // track it through drags/resizes.
  const releaseEndpoint = (trailId: string, which: 'start' | 'end', point: Point) => {
    const candidateBoxes = boxes
      .map((box) => ({ box, rect: boxHitRect(box, boxSizes[box.id]) }))
      .filter(({ rect }) => pointInRect(point, rect))
      .sort((a, b) => Math.hypot(point.x - a.box.x, point.y - a.box.y) - Math.hypot(point.x - b.box.x, point.y - b.box.y));

    const hit = candidateBoxes[0] ?? null;
    const hitMachine = !hit && machineRect && pointInRect(point, machineRect) ? machineRect : null;

    replaceTrails((prev) =>
      prev.map((t) => {
        if (t.id !== trailId) return t;
        const index = which === 'start' ? 0 : t.points.length - 1;
        const boxIdKey = which === 'start' ? 'startBoxId' : 'endBoxId';
        const boxAnchorKey = which === 'start' ? 'startBoxAnchor' : 'endBoxAnchor';
        const machineAnchorKey = which === 'start' ? 'startMachineAnchor' : 'endMachineAnchor';
        const nextPoints = t.points.map((p, i) => (i === index ? point : p));

        if (hit) {
          const anchor: Anchor = { rx: (point.x - hit.rect.x) / hit.rect.width, ry: (point.y - hit.rect.y) / hit.rect.height };
          return { ...t, points: nextPoints, [boxIdKey]: hit.box.id, [boxAnchorKey]: anchor, [machineAnchorKey]: undefined };
        }

        if (hitMachine) {
          const anchor: Anchor = { rx: (point.x - hitMachine.x) / hitMachine.width, ry: (point.y - hitMachine.y) / hitMachine.height };
          return { ...t, points: nextPoints, [boxIdKey]: undefined, [boxAnchorKey]: undefined, [machineAnchorKey]: anchor };
        }

        return { ...t, points: nextPoints, [boxIdKey]: undefined, [boxAnchorKey]: undefined, [machineAnchorKey]: undefined };
      }),
    );
  };

  const updateBoxPosition = (id: string, point: Point) => {
    replaceBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...point } : b)));
  };

  const updateBoxLabel = (id: string, label: string) => {
    replaceBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)));
  };

  const pickBoxChannel = (id: string, channel: ChannelRef | null) => {
    replaceBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, channelId: channel?.id } : b)));
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

  return (
    <>
      {/* Tapping empty canvas deselects — only mounted while something is selected, so
          it never intercepts clicks meant for the machine underneath otherwise. */}
      {selectedId && !readOnly && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={() => setSelectedId(null)}
        />
      )}

      {!readOnly && (
        <View pointerEvents="box-none" className="absolute left-4 top-4 flex-row items-center gap-2">
          <View className={cn('rounded-full border px-2.5 py-1', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}>
            <Text className={cn('font-body text-[11px]', mutedClass)}>
              {trails.length} trail{trails.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable onPress={addTrail} className={cn('rounded-full px-3 py-1.5', isDark ? 'bg-ink' : 'bg-ink-inverse')}>
            <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-inverse' : 'text-ink')}>+ Add Trail</Text>
          </Pressable>
          <Pressable onPress={addBox} className={cn('rounded-full border px-3 py-1.5', lineClass)}>
            <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>+ Add Box</Text>
          </Pressable>
          {hasDefaultLayout(machineTemplate) && (
            <Pressable onPress={applyTemplateLayout} className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5">
              <Text className="font-body-bold text-xs text-accent">⟲ Template</Text>
            </Pressable>
          )}
          <Pressable onPress={saveConfig} className="rounded-full border border-status-success/40 bg-status-success/10 px-3 py-1.5">
            <Text className="font-body-bold text-xs text-status-success">{justSaved ? '✓ Saved' : '💾 Save Config'}</Text>
          </Pressable>
        </View>
      )}

      {selectedId && !readOnly && (
        <View pointerEvents="box-none" className="absolute left-4 top-14 flex-row items-center gap-2">
          <Pressable onPress={removeBendFromSelected} className={cn('rounded-full border px-3 py-1.5', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}>
            <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>Remove bend</Text>
          </Pressable>
          <Pressable onPress={addBendToSelected} className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5">
            <Text className="font-body-bold text-xs text-accent">Add bend</Text>
          </Pressable>
          <Pressable onPress={() => removeTrail(selectedId)} className="rounded-full border border-status-critical/35 bg-status-critical/10 px-3 py-1.5">
            <Text className="font-body-bold text-xs text-status-critical">Delete trail</Text>
          </Pressable>
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
            onEndpointGrab={(which) => detachEndpoint(trail.id, which)}
            onEndpointRelease={(which, point) => releaseEndpoint(trail.id, which, point)}
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
    </>
  );
}
