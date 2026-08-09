import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import { loadLocal } from '../../../lib/localPersist';
import { expectedPointsForTemplate, type MachineComponent, type MachineNode } from '../../../lib/machines';
import { listChannels, type CardNode } from '../../../lib/rack';
import { AlarmView } from './AlarmView';
import { AnalysisView } from './AnalysisView';
import { MachineOverview } from './MachineOverview';
import { MachineCanvas } from './MachineCanvas';
import { RackOccupancyView, type MappedChannel } from './RackOccupancyView';
import { RotaryAirlockValve } from './RotaryAirlockValve';
import { SingleScrewExtruder } from './SingleScrewExtruder';
import { StageGrid, STAGE_HEIGHT, STAGE_WIDTH } from './StageGrid';
import { TrailBoard, trailBoardStorageKey, type Box, type SavedLayout } from './TrailBoard';
import { TrendView } from './TrendView';

type WorkspaceMode = 'design' | 'actual';

type MachineWorkspaceProps = {
  machine: MachineNode;
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  // Shared canvas layout for this machine (Supabase-backed). Both the design
  // and actual views read it so they stay in sync across users; null falls back
  // to localStorage / the template default.
  layout?: SavedLayout | null;
  templateLayout?: SavedLayout | null;
  onSaveLayout?: (machineId: string, layout: SavedLayout) => void;
  onSaveTemplate?: (machineTemplate: string, layout: SavedLayout) => void;
  onBack: () => void;
  canConfigure?: boolean;
  canSaveTemplate?: boolean;
  // Actual View is meant to be a full-screen "deployed dashboard" preview — the
  // parent uses this to hide the hierarchy sidebar while it's active.
  onModeChange?: (mode: WorkspaceMode) => void;
};
type ActualTab = 'machine' | 'rack' | 'overview' | 'analysis' | 'alarm' | 'trend';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
// Templates that render a dedicated SVG schematic instead of the generic
// component canvas. They share one 1200×760 viewBox and one wrapper, so the
// stage geometry (and therefore every saved trail anchor) is identical.
const ARTWORK_TEMPLATES = new Set<string>(['Rotary Airlock Valve', 'Single Screw Extruder']);
// That wrapper has a `p-6` (24px) pad between it and the actual SVG artwork;
// subtract it so trail anchors line up with the drawing itself rather than the
// padded box around it.
const ARTWORK_PADDING = 24;

// Segmented control: one bordered track with the selected tab filled, so the
// Machine/Rack/Overview/Analysis/Alarm/Trend switch reads as a single instrument
// rather than six loose pills.
function ActualSubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={cn(
        'rounded-full px-3.5 py-1.5',
        active && (isDark ? 'bg-ink' : 'bg-ink-inverse'),
      )}
    >
      <Text
        className={cn(
          'font-mono text-[10px] uppercase tracking-[0.16em]',
          active ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
        )}
      >
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

export function ComponentRow({ component, selected, onPress }: { component: MachineComponent; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn('flex-row items-center gap-2 rounded-lg px-3 py-2', selected && (isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel'))}
    >
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

export function MachineWorkspace({
  machine,
  devices,
  cards,
  live,
  layout,
  templateLayout,
  onSaveLayout,
  onSaveTemplate,
  onBack,
  onModeChange,
  canConfigure = false,
  canSaveTemplate = false,
}: MachineWorkspaceProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const mode: WorkspaceMode = canConfigure ? 'design' : 'actual';
  useEffect(() => {
    onModeChange?.(mode);
    return () => onModeChange?.('design');
  }, [mode, onModeChange]);
  const [actualTab, setActualTab] = useState<ActualTab>('machine');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(machine.components[0]?.id ?? null);
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

  // Rack/Overview/Alarm/Trend reflect the last *saved* box↔channel mappings
  // (the same localStorage layout TrailBoard persists via "Save Config") —
  // Actual View is meant to preview the deployed dashboard, not in-progress
  // unsaved edits. The "Machine" tab reads live in-memory state directly via
  // TrailBoard(readOnly) instead, so it's excluded here.
  const allChannels = useMemo(() => listChannels(devices, cards), [devices, cards]);
  const [savedBoxes, setSavedBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!isActual || actualTab === 'machine') return;
    // Prefer the shared server layout; fall back to any local copy. A newly
    // created RAV should show the machine artwork without mapping cards/trails
    // until a user explicitly saves a canvas configuration.
    const saved = layout ?? loadLocal<SavedLayout>(trailBoardStorageKey(machine.id));
    if (saved?.boxes && saved.boxes.length > 0) {
      setSavedBoxes(saved.boxes);
      return;
    }
    setSavedBoxes([]);
  }, [isActual, actualTab, machine.id, layout]);

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
  const expectedPoints = useMemo(() => Math.max(expectedPointsForTemplate(machine.template), machine.components.reduce((sum, c) => sum + c.points.length, 0)), [machine.components, machine.template]);

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
  const hasTemplateArtwork = ARTWORK_TEMPLATES.has(machine.template);

  const machineRect = useMemo(() => {
    if (!machineLayout) return null;
    const pad = ARTWORK_TEMPLATES.has(machine.template) ? ARTWORK_PADDING : 0;
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

  const selectComponent = (component: MachineComponent) => {
    setSelectedComponentId(component.id);
  };

  const backButton = (
    <Pressable onPress={onBack}>
      <Text className={cn('font-body-medium text-xs', mutedClass)}>‹ Back</Text>
    </Pressable>
  );

  const nameBlock = (
    <View>
      <Text className={cn('font-body-bold text-2xl tracking-[-0.025em]', isDark ? 'text-ink' : 'text-ink-inverse')}>
        {machine.name}
      </Text>
      <Text className={cn('font-mono text-[9.5px] uppercase tracking-[0.2em]', mutedClass)}>{machine.template}</Text>
    </View>
  );

  const actualSubTabs = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', paddingVertical: 2 }}
      style={{ flexGrow: 0, flexShrink: 1, marginLeft: 'auto' }}
    >
      <View
        className={cn(
          'flex-row items-center gap-1 rounded-full border p-1',
          isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-white',
        )}
      >
        <ActualSubTab label="Machine" active={actualTab === 'machine'} onPress={() => setActualTab('machine')} />
        <ActualSubTab label="Rack" active={actualTab === 'rack'} onPress={() => setActualTab('rack')} />
        <ActualSubTab label="Overview" active={actualTab === 'overview'} onPress={() => setActualTab('overview')} />
        <ActualSubTab label="Analysis" active={actualTab === 'analysis'} onPress={() => setActualTab('analysis')} />
        <ActualSubTab label="Alarm" active={actualTab === 'alarm'} onPress={() => setActualTab('alarm')} />
        <ActualSubTab label="Trend" active={actualTab === 'trend'} onPress={() => setActualTab('trend')} />
      </View>
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
          <View className="gap-3 px-4 pt-4 md:flex-row md:items-center md:px-6 md:pt-5">
            {backButton}
          </View>

          <View className="flex-row items-center justify-between px-4 pt-3 md:px-6">{nameBlock}</View>
        </>
      )}

      {isActual && actualTab === 'rack' && (
        <RackOccupancyView devices={devices} cards={cards} mappedChannels={mappedChannels} expectedPoints={expectedPoints} />
      )}

      {isActual && actualTab === 'overview' && (
        <MachineOverview
          mappedChannels={mappedChannels}
          devices={devices}
          cards={cards}
          live={live}
          expectedPoints={expectedPoints}
          machineId={machine.id}
          machineTemplate={machine.template}
        />
      )}

      {isActual && actualTab === 'analysis' && (
        <AnalysisView
          mappedChannels={mappedChannels}
          devices={devices}
          cards={cards}
          live={live}
          expectedPoints={expectedPoints}
          machineId={machine.id}
          machineTemplate={machine.template}
        />
      )}

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
                    className={hasTemplateArtwork ? 'w-full max-w-5xl p-6' : 'h-full w-full'}
                  >
                    {machine.template === 'Rotary Airlock Valve' ? (
                      <RotaryAirlockValve />
                    ) : machine.template === 'Single Screw Extruder' ? (
                      <SingleScrewExtruder />
                    ) : (
                      <MachineCanvas components={machine.components} selectedId={selectedComponentId} onSelect={selectComponent} />
                    )}
                  </View>
                </View>

                <TrailBoard
                  devices={devices}
                  cards={cards}
                  live={live}
                  machineRect={machineRect}
                  machineId={machine.id}
                  machineTemplate={machine.template}
                  templateLayout={templateLayout ?? null}
                  initialLayout={layout ?? null}
                  onSaveLayout={onSaveLayout}
                  onSaveTemplate={onSaveTemplate}
                  stageStyle={stageStyle}
                  stageScale={stageScale}
                  readOnly={readOnlyCanvas}
                  hideUnlink={readOnlyCanvas}
                  canSaveTemplate={canSaveTemplate}
                />

                <ZoomControls zoom={zoom} onZoomOut={zoomOut} onReset={resetZoom} onZoomIn={zoomIn} />
              </>
            )}
          </View>

        </View>
      )}
    </View>
  );
}
