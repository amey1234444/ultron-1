import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import { loadLocal, saveLocal } from '../../../lib/localPersist';
import { listChannels, type CardNode, type ChannelRef } from '../../../lib/rack';
import { AdjustableTrail, type Point, type TrailStatus } from './AdjustableTrail';
import { MappableBox, MAPPABLE_BOX_HEIGHT, MAPPABLE_BOX_WIDTH } from './MappableBox';
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
  label: string;
  channelId?: string;
};

type Rect = { x: number; y: number; width: number; height: number };

type TrailBoardProps = {
  devices: DeviceNode[];
  cards: CardNode[];
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
};

export type SavedLayout = { trails: Trail[]; boxes: Box[] };

// v3: coordinates are stage units on the fixed 1600×900 design stage, so saved
// layouts are resolution-independent. Shared with MachineWorkspace, which reads
// the same saved boxes to build the Actual View "Rack"/"Overview" sub-tabs.
export function trailBoardStorageKey(machineId: string) {
  return `ultron.trailboard.v3.${machineId}`;
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pointInRect(point: Point, rect: Rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// Hit area covering the box's connector dot plus its actual rendered card — not
// just a fixed guess, since linking/unlinking a channel changes the card's real
// height. `size` should be the card's measured (onLayout) dimensions when known;
// falls back to the nominal size before the first measurement arrives.
function boxHitRect(box: { x: number; y: number }, size: { width: number; height: number } = { width: MAPPABLE_BOX_WIDTH, height: MAPPABLE_BOX_HEIGHT }): Rect {
  const cardLeft = box.x + 12;
  const cardTop = box.y - 30;
  const left = Math.min(box.x - 10, cardLeft - 10);
  const top = Math.min(box.y - 10, cardTop - 10);
  const right = Math.max(box.x + 10, cardLeft + size.width + 10);
  const bottom = cardTop + size.height + 10;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const STATUS_RANK: Record<TrailStatus, number> = { offline: -1, normal: 0, warning: 1, critical: 2 };
function worseStatus(a: TrailStatus, b: TrailStatus): TrailStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export function TrailBoard({
  devices,
  cards,
  machineRect,
  machineId,
  machineTemplate,
  stageStyle,
  stageScale,
  readOnly = false,
  hideUnlink = false,
}: TrailBoardProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const storageKey = trailBoardStorageKey(machineId);

  // A saved layout always wins; otherwise a template that ships a default
  // layout (RAV) starts pre-wired instead of blank. Computed exactly once —
  // the template generates fresh random ids each call.
  const initialLayoutRef = useRef<SavedLayout | null>(null);
  if (initialLayoutRef.current === null) {
    const saved = loadLocal<SavedLayout>(storageKey);
    initialLayoutRef.current =
      saved ?? (hasDefaultLayout(machineTemplate) ? createRavDefaultLayout(listChannels(devices, cards)) : { trails: [], boxes: [] });
  }

  const [trails, setTrails] = useState<Trail[]>(initialLayoutRef.current.trails);
  const [boxes, setBoxes] = useState<Box[]>(initialLayoutRef.current.boxes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [boxLiveValues, setBoxLiveValues] = useState<Record<string, number>>({});
  const [boxSizes, setBoxSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [justSaved, setJustSaved] = useState(false);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channels = useMemo(() => listChannels(devices, cards), [devices, cards]);

  const applyTemplateLayout = () => {
    // Generate against the machine's *current* rect (it shrinks/grows with
    // zoom) — endpoints and bends land exactly on the artwork as rendered
    // right now, not where it would sit at 100%.
    const layout = createRavDefaultLayout(channels, machineRect);
    setTrails(layout.trails);
    setBoxes(layout.boxes);
    setSelectedId(null);
  };

  const saveConfig = () => {
    saveLocal<SavedLayout>(storageKey, { trails, boxes });
    setJustSaved(true);
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    savedFlashTimer.current = setTimeout(() => setJustSaved(false), 1600);
  };

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    };
  }, []);

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

    setTrails((prev) => [
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

    setBoxes((prev) => [...prev, { id: makeId('box'), x: baseX - 220, y: baseY - 120 + stagger, label: '' }]);
  };

  const updateTrailPoints = (id: string, points: Point[]) => {
    setTrails((prev) => prev.map((t) => (t.id === id ? { ...t, points } : t)));
  };

  const removeTrail = (id: string) => {
    setTrails((prev) => prev.filter((t) => t.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };

  // Detach a trail endpoint from whatever box/machine spot it was attached to
  // (called as soon as the user grabs it again) so it's freely draggable instead
  // of fighting a controlled position.
  const detachEndpoint = (trailId: string, which: 'start' | 'end') => {
    const boxIdKey = which === 'start' ? 'startBoxId' : 'endBoxId';
    const boxAnchorKey = which === 'start' ? 'startBoxAnchor' : 'endBoxAnchor';
    const machineAnchorKey = which === 'start' ? 'startMachineAnchor' : 'endMachineAnchor';
    setTrails((prev) =>
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

    setTrails((prev) =>
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
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...point } : b)));
  };

  const updateBoxLabel = (id: string, label: string) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)));
  };

  const pickBoxChannel = (id: string, channel: ChannelRef | null) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, channelId: channel?.id } : b)));
  };

  const removeBox = (id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setTrails((prev) =>
      prev.map((t) => ({
        ...t,
        startBoxId: t.startBoxId === id ? undefined : t.startBoxId,
        startBoxAnchor: t.startBoxId === id ? undefined : t.startBoxAnchor,
        endBoxId: t.endBoxId === id ? undefined : t.endBoxId,
        endBoxAnchor: t.endBoxId === id ? undefined : t.endBoxAnchor,
      })),
    );
    setBoxLiveValues((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const addBendToSelected = () => {
    setTrails((prev) =>
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
    setTrails((prev) =>
      prev.map((t) => (t.id === selectedId && t.points.length > 2 ? { ...t, points: t.points.filter((_, i) => i !== t.points.length - 2) } : t)),
    );
  };

  // Machine moved/resized (zoom change) — pull every machine-anchored endpoint
  // along with it, from its remembered relative position.
  useEffect(() => {
    if (!machineRect) return;
    setTrails((prev) =>
      prev.map((t) => {
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
      }),
    );
  }, [machineRect]);

  // A box moved, OR its rendered boundary changed (linking/unlinking a channel
  // changes the card's height) — pull every box-anchored endpoint along with it,
  // from its remembered relative spot on that box's *current* rect.
  useEffect(() => {
    setTrails((prev) =>
      prev.map((t) => {
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
      }),
    );
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
            onPointsChange={(points) => updateTrailPoints(trail.id, points)}
            onSelect={() => setSelectedId(trail.id)}
            onEndpointGrab={(which) => detachEndpoint(trail.id, which)}
            onEndpointRelease={(which, point) => releaseEndpoint(trail.id, which, point)}
          />
        ))}

        {boxes.map((box) => (
          <MappableBox
            key={box.id}
            x={box.x}
            y={box.y}
            label={box.label}
            attached={trails.some((t) => t.startBoxId === box.id || t.endBoxId === box.id)}
            connectorPoint={boxConnectorPoint(box)}
            channel={channels.find((c) => c.id === box.channelId) ?? null}
            channels={channels}
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
        ))}
      </View>
    </>
  );
}
