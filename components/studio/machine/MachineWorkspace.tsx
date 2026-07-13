import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import { loadLocal } from '../../../lib/localPersist';
import type { MachineComponent, MachineNode } from '../../../lib/machines';
import { listChannels, type CardNode } from '../../../lib/rack';
import { PanelToggle } from '../PanelToggle';
import { AlarmView } from './AlarmView';
import { MachineOverview } from './MachineOverview';
import { ComponentTypeIcon } from './machineIcons';
import { MachineCanvas } from './MachineCanvas';
import { computePointCode, PointCard } from './PointCard';
import { RackOccupancyView, type MappedChannel } from './RackOccupancyView';
import { createRavDefaultLayout, hasDefaultLayout } from './ravDefaultLayout';
import { RotaryAirlockValve } from './RotaryAirlockValve';
import { StageGrid, STAGE_HEIGHT, STAGE_WIDTH } from './StageGrid';
import { TrailBoard, trailBoardStorageKey, type Box, type SavedLayout } from './TrailBoard';
import { TrendView } from './TrendView';

type WorkspaceMode = 'design' | 'actual';

type MachineWorkspaceProps = {
  machine: MachineNode;
  devices: DeviceNode[];
  cards: CardNode[];
  onBack: () => void;
  canConfigure?: boolean;
  // Actual View is meant to be a full-screen "deployed dashboard" preview — the
  // parent uses this to hide the hierarchy sidebar while it's active.
  onModeChange?: (mode: WorkspaceMode) => void;
};
type RightTab = 'components' | 'properties';
type ActualTab = 'machine' | 'rack' | 'overview' | 'alarm' | 'trend';

const RIGHT_PANEL_WIDTH = 288;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
// The Rotary Airlock Valve wrapper has a `p-8` (32px) pad between it and the
// actual SVG artwork; subtract it so trail anchors line up with the drawing
// itself rather than the padded box around it.
const RAV_PADDING = 32;

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable onPress={onPress} className={cn('rounded-full px-3 py-1.5', active && (isDark ? 'bg-ink' : 'bg-ink-inverse'))}>
      <Text className={cn('font-body-medium text-xs', active ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActualSubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full border px-3 py-1 ',
        active ? (isDark ? 'border-ink bg-ink' : 'border-ink-inverse bg-ink-inverse') : lineClass,
      )}
    >
      <Text className={cn('font-body-medium text-[11px]', active ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

function RightTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  return (
    <Pressable onPress={onPress} className={cn('flex-1 items-center border-b-2 py-3', active ? (isDark ? 'border-ink' : 'border-ink-inverse') : cn('border-transparent', lineClass))}>
      <Text className={cn('font-body-medium text-xs', active ? (isDark ? 'text-ink' : 'text-ink-inverse') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

function ZoomControls({ zoom, onZoomOut, onReset, onZoomIn }: { zoom: number; onZoomOut: () => void; onReset: () => void; onZoomIn: () => void }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-4 items-center">
      <View className={cn('flex-row items-center gap-1 rounded-full border px-1 py-1', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}>
        <Pressable onPress={onZoomOut} disabled={zoom <= MIN_ZOOM} className="h-7 w-7 items-center justify-center rounded-full">
          <Text className={cn('font-body-bold text-sm', zoom <= MIN_ZOOM ? mutedClass : inkClass)}>−</Text>
        </Pressable>
        <Pressable onPress={onReset} className="px-2">
          <Text className={cn('font-body-medium text-[11px] tabular-nums', mutedClass)}>{Math.round(zoom * 100)}%</Text>
        </Pressable>
        <Pressable onPress={onZoomIn} disabled={zoom >= MAX_ZOOM} className="h-7 w-7 items-center justify-center rounded-full">
          <Text className={cn('font-body-bold text-sm', zoom >= MAX_ZOOM ? mutedClass : inkClass)}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ComponentRow({ component, selected, onPress }: { component: MachineComponent; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const iconColor = isDark ? '#F5F5F5' : '#0A0A0A';
  return (
    <Pressable
      onPress={onPress}
      className={cn('flex-row items-center gap-2 rounded-lg px-3 py-2', selected && (isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel'))}
    >
      <ComponentTypeIcon type={component.type} color={iconColor} size={16} />
      <View className="flex-1">
        <Text numberOfLines={1} className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {component.label}
        </Text>
        <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {component.type} · {component.points.length} point{component.points.length === 1 ? '' : 's'}
        </Text>
      </View>
    </Pressable>
  );
}

export function MachineWorkspace({ machine, devices, cards, onBack, onModeChange, canConfigure = false }: MachineWorkspaceProps) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width > 0 && width < 900;
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const [mode, setMode] = useState<WorkspaceMode>(() => (canConfigure ? 'design' : 'actual'));
  useEffect(() => {
    onModeChange?.(mode);
    return () => onModeChange?.('design');
  }, [mode, onModeChange]);
  useEffect(() => {
    setMode(canConfigure ? 'design' : 'actual');
  }, [canConfigure]);
  const [actualTab, setActualTab] = useState<ActualTab>('machine');
  const [rightTab, setRightTab] = useState<RightTab>('components');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(machine.components[0]?.id ?? null);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Layout of the machine wrapper in *stage coordinates* (the stage is a fixed
  // 1600×900 design space, so this never changes with window size, panels, or
  // monitor resolution — transforms don't affect onLayout). Used together with
  // `zoom` below so trail endpoints anchored to the machine can track it.
  const [machineLayout, setMachineLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  const roundZoom = (value: number) => Math.round(value * 100) / 100;
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, roundZoom(z + ZOOM_STEP)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, roundZoom(z - ZOOM_STEP)));
  const resetZoom = () => setZoom(1);

  const isActual = mode === 'actual';
  const readOnlyCanvas = !canConfigure || isActual;

  useEffect(() => {
    if (isNarrow) setRightCollapsed(true);
  }, [isNarrow]);

  // Rack/Overview/Alarm/Trend reflect the last *saved* box↔channel mappings
  // (the same localStorage layout TrailBoard persists via "Save Config") —
  // Actual View is meant to preview the deployed dashboard, not in-progress
  // unsaved edits. The "Machine" tab reads live in-memory state directly via
  // TrailBoard(readOnly) instead, so it's excluded here.
  const allChannels = useMemo(() => listChannels(devices, cards), [devices, cards]);

  const [savedBoxes, setSavedBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!isActual || actualTab === 'machine') return;
    const saved = loadLocal<SavedLayout>(trailBoardStorageKey(machine.id));
    if (saved?.boxes && saved.boxes.length > 0) {
      setSavedBoxes(saved.boxes);
      return;
    }
    // No saved config yet: fall back to the template's default wiring (RAV ships
    // one) so the Actual View dashboards render live demo data out of the box
    // instead of an empty "nothing mapped" state.
    setSavedBoxes(hasDefaultLayout(machine.template) ? createRavDefaultLayout(allChannels).boxes : []);
  }, [isActual, actualTab, machine.id, machine.template, allChannels]);

  const mappedChannels = useMemo<MappedChannel[]>(
    () =>
      savedBoxes
        .filter((box) => box.channelId)
        .map((box) => ({ box, channel: allChannels.find((c) => c.id === box.channelId) }))
        .filter((entry): entry is { box: Box; channel: NonNullable<(typeof entry)['channel']> } => !!entry.channel)
        .map(({ box, channel }) => ({ id: box.id, channel, label: box.label.trim() || channel.label })),
    [savedBoxes, allChannels],
  );
  // Total measurement points the machine template defines (e.g. RAV's Motor
  // component lists 6) — the "expected" denominator for the coverage indicator
  // shown across the Rack/Overview/Alarm/Trend sub-tabs.
  const expectedPoints = useMemo(() => machine.components.reduce((sum, c) => sum + c.points.length, 0), [machine.components]);

  // The whole design lives on a fixed 1600×900 logical stage that gets
  // uniformly scaled to fit the available canvas. All trail/box/machine
  // geometry is stored in stage units, so the layout is identical on every
  // screen — only the scale factor changes.
  //
  // Both Design and Actual View use the same "contain" fit (scale to the
  // smaller ratio, letterboxed) so the machine schema — every card, box, trail
  // and gauge — appears at the exact same size and position in Actual View as
  // it does in Design. An earlier "cover" overscan in Actual made the two
  // views disagree and could crop cards near the stage edges; keeping a single
  // shared scale guarantees 1:1 geometry parity.
  const stageScale = canvasSize ? Math.min(canvasSize.width / STAGE_WIDTH, canvasSize.height / STAGE_HEIGHT) : 1;
  const stageStyle = canvasSize
    ? {
        position: 'absolute' as const,
        left: (canvasSize.width - STAGE_WIDTH) / 2,
        top: (canvasSize.height - STAGE_HEIGHT) / 2,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        transform: [{ scale: stageScale }],
      }
    : null;

  // `transform: scale` scales around the element's own centre, so the visual
  // (post-scale) box is the unscaled layout box re-centred at the same point.
  // All in stage units.
  const machineRect = useMemo(() => {
    if (!machineLayout) return null;
    const pad = machine.template === 'Rotary Airlock Valve' ? RAV_PADDING : 0;
    const contentX = machineLayout.x + pad;
    const contentY = machineLayout.y + pad;
    const contentWidth = machineLayout.width - pad * 2;
    const contentHeight = machineLayout.height - pad * 2;
    const centerX = contentX + contentWidth / 2;
    const centerY = contentY + contentHeight / 2;
    const width = contentWidth * zoom;
    const height = contentHeight * zoom;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }, [machineLayout, zoom, machine.template]);

  const selectedComponent = useMemo(
    () => machine.components.find((c) => c.id === selectedComponentId) ?? null,
    [machine.components, selectedComponentId],
  );

  const selectComponent = (component: MachineComponent) => {
    setSelectedComponentId(component.id);
    setRightTab('properties');
  };

  const backButton = (
    <Pressable onPress={onBack}>
      <Text className={cn('font-body-medium text-xs', mutedClass)}>‹ Back</Text>
    </Pressable>
  );

  const nameBlock = (
    <View>
      <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{machine.name}</Text>
      <Text className={cn('font-body text-xs', mutedClass)}>{machine.template}</Text>
    </View>
  );

  const actualSubTabs = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', gap: 8, paddingVertical: 2 }}
      style={{ flexGrow: 0, flexShrink: 1, marginLeft: 'auto' }}
    >
      <ActualSubTab label="Machine" active={actualTab === 'machine'} onPress={() => setActualTab('machine')} />
      <ActualSubTab label="Rack" active={actualTab === 'rack'} onPress={() => setActualTab('rack')} />
      <ActualSubTab label="Overview" active={actualTab === 'overview'} onPress={() => setActualTab('overview')} />
      <ActualSubTab label="Alarm" active={actualTab === 'alarm'} onPress={() => setActualTab('alarm')} />
      <ActualSubTab label="Trend" active={actualTab === 'trend'} onPress={() => setActualTab('trend')} />
    </ScrollView>
  );

  return (
    <View className="flex-1">
      {isActual ? (
        // Actual View is a full-screen dashboard preview — the mode switcher
        // (and the hierarchy sidebar, hidden by the parent) stay out of the
        // way entirely, so Back, the name, and the sub-tabs share one compact
        // row instead of leaving a mostly-empty strip above it.
        <View className="gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <View className="flex-row items-center gap-4">
            {backButton}
            {nameBlock}
          </View>
          {actualSubTabs}
        </View>
      ) : (
        <>
          <View className="gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between md:px-6 md:pt-5">
            {backButton}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center' }}
              className={cn('max-w-full rounded-full border p-1', lineClass)}
              style={{ flexGrow: 0, flexShrink: 1, marginLeft: 'auto' }}
            >
              <ModeTab label="Design" active={mode === 'design'} onPress={() => setMode('design')} />
              <ModeTab label="Actual View" active={false} onPress={() => setMode('actual')} />
            </ScrollView>
          </View>

          <View className="flex-row items-center justify-between px-4 pt-3 md:px-6">{nameBlock}</View>
        </>
      )}

      {isActual && actualTab === 'rack' && (
        <RackOccupancyView devices={devices} cards={cards} mappedChannels={mappedChannels} expectedPoints={expectedPoints} />
      )}

      {isActual && actualTab === 'overview' && <MachineOverview mappedChannels={mappedChannels} expectedPoints={expectedPoints} />}

      {isActual && actualTab === 'alarm' && (
        <AlarmView mappedChannels={mappedChannels} machineId={machine.id} expectedPoints={expectedPoints} />
      )}

      {isActual && actualTab === 'trend' && (
        <TrendView mappedChannels={mappedChannels} machineId={machine.id} expectedPoints={expectedPoints} />
      )}

      {(mode === 'design' || (isActual && actualTab === 'machine')) && (
        <View className="relative flex-1 flex-row">
          <View
            className="relative flex-1 overflow-hidden"
            onLayout={(e) => setCanvasSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            {stageStyle && (
              <>
                <View pointerEvents="box-none" style={stageStyle} className="items-center justify-center">
                  <StageGrid />
                  <View
                    onLayout={(e) => {
                      const { x, y, width, height } = e.nativeEvent.layout;
                      setMachineLayout({ x, y, width, height });
                    }}
                    style={{ transform: [{ scale: zoom }] }}
                    className={machine.template === 'Rotary Airlock Valve' ? 'w-full max-w-4xl p-8' : 'h-full w-full'}
                  >
                    {machine.template === 'Rotary Airlock Valve' ? (
                      <RotaryAirlockValve />
                    ) : (
                      <MachineCanvas components={machine.components} selectedId={selectedComponentId} onSelect={selectComponent} />
                    )}
                  </View>
                </View>

                <TrailBoard
                  devices={devices}
                  cards={cards}
                  machineRect={machineRect}
                  machineId={machine.id}
                  machineTemplate={machine.template}
                  stageStyle={stageStyle}
                  stageScale={stageScale}
                  readOnly={readOnlyCanvas}
                  hideUnlink={readOnlyCanvas}
                />

                <ZoomControls zoom={zoom} onZoomOut={zoomOut} onReset={resetZoom} onZoomIn={zoomIn} />
              </>
            )}
          </View>

          {!isActual && (
            <PanelToggle
              collapsed={rightCollapsed}
              onPress={() => setRightCollapsed((v) => !v)}
              right={rightCollapsed ? 8 : RIGHT_PANEL_WIDTH - 12}
              testID="ui.panel.right.toggle"
            />
          )}

          {!isActual && !rightCollapsed && (
            <View className={cn('w-72 border-l', lineClass)}>
              <View className={cn('flex-row border-b', lineClass)}>
                <RightTabButton label="Components" active={rightTab === 'components'} onPress={() => setRightTab('components')} />
                <RightTabButton label="Properties" active={rightTab === 'properties'} onPress={() => setRightTab('properties')} />
              </View>

              {rightTab === 'components' ? (
                <View className="gap-1 p-3">
                  {machine.components.map((component) => (
                    <ComponentRow
                      key={component.id}
                      component={component}
                      selected={component.id === selectedComponentId}
                      onPress={() => selectComponent(component)}
                    />
                  ))}
                </View>
              ) : selectedComponent ? (
                <View className="gap-4 p-4">
                  <View className="flex-row items-center gap-2">
                    <ComponentTypeIcon type={selectedComponent.type} color={isDark ? '#F5F5F5' : '#0A0A0A'} size={18} />
                    <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{selectedComponent.label}</Text>
                  </View>

                  {selectedComponent.points.length === 0 ? (
                    <Text className={cn('font-body text-xs italic', mutedClass)}>This component has no measurement points.</Text>
                  ) : (
                    <View className="gap-2">
                      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Measurement Points</Text>
                      {selectedComponent.points.map((point) => (
                        <PointCard key={point.id} code={computePointCode(selectedComponent.points, point.id)} point={point} />
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View className="p-4">
                  <Text className={cn('font-body text-xs italic', mutedClass)}>Select a component to view its properties.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
