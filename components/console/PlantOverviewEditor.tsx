import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  DEFAULT_PLANT_OVERVIEW,
  PLANT_MAP_HEIGHT,
  PLANT_MAP_WIDTH,
  clampToMap,
  newPlantTagId,
  type PlantOverviewConfig,
  type PlantTag,
  type PlantTagStatus,
} from '../../lib/plantOverview';

const STATUS_COLORS: Record<Exclude<PlantTagStatus, 'auto'>, string> = {
  healthy: '#3FBF6A',
  warning: '#D9962B',
  critical: '#D64545',
  offline: '#7A7E86',
};

const STATUS_OPTIONS: PlantTagStatus[] = ['auto', 'healthy', 'warning', 'critical', 'offline'];

const LABEL_W = 132;
const LABEL_H = 44;

function tagColor(tag: PlantTag, autoColor: string): string {
  return tag.status === 'auto' ? autoColor : STATUS_COLORS[tag.status];
}

// A pin or label that can be dragged around the map. Movement is tracked in
// viewBox units, converted from screen pixels with the current render scale.
function Draggable({
  x,
  y,
  scale,
  onMove,
  onSelect,
  children,
  style,
}: {
  x: number;
  y: number;
  scale: number;
  onMove: (dx: number, dy: number) => void;
  onSelect: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const lastRef = useRef({ dx: 0, dy: 0 });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          lastRef.current = { dx: 0, dy: 0 };
          onSelect();
        },
        onPanResponderMove: (_event, gesture) => {
          const factor = scaleRef.current || 1;
          const stepX = (gesture.dx - lastRef.current.dx) / factor;
          const stepY = (gesture.dy - lastRef.current.dy) / factor;
          lastRef.current = { dx: gesture.dx, dy: gesture.dy };
          onMove(stepX, stepY);
        },
      }),
    [onMove, onSelect],
  );

  return (
    <View {...responder.panHandlers} style={[{ position: 'absolute', left: x * scale, top: y * scale }, style]}>
      {children}
    </View>
  );
}

export function PlantOverviewEditor({
  initialConfig,
  imageUri,
  autoColors,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initialConfig: PlantOverviewConfig;
  imageUri: string;
  /** Live status colour per tag name, used to preview `auto` tags. */
  autoColors: Record<string, string>;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (config: PlantOverviewConfig) => void;
}) {
  const { isDark } = useAppTheme();
  const [config, setConfig] = useState<PlantOverviewConfig>(initialConfig);
  const [selectedId, setSelectedId] = useState<string | null>(initialConfig.tags[0]?.id ?? null);
  const [mapWidth, setMapWidth] = useState(PLANT_MAP_WIDTH);
  const scale = mapWidth / PLANT_MAP_WIDTH;
  const selected = config.tags.find((tag) => tag.id === selectedId) ?? null;

  const onMapLayout = (event: LayoutChangeEvent) => setMapWidth(event.nativeEvent.layout.width);

  const patchTag = (id: string, patch: Partial<PlantTag>) =>
    setConfig((current) => ({ ...current, tags: current.tags.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)) }));

  const movePin = (tag: PlantTag, dx: number, dy: number) =>
    patchTag(tag.id, { x: clampToMap(tag.x + dx, PLANT_MAP_WIDTH), y: clampToMap(tag.y + dy, PLANT_MAP_HEIGHT) });

  const moveLabel = (tag: PlantTag, dx: number, dy: number) =>
    patchTag(tag.id, {
      labelX: clampToMap(tag.labelX + dx, PLANT_MAP_WIDTH - LABEL_W),
      labelY: clampToMap(tag.labelY + dy, PLANT_MAP_HEIGHT - LABEL_H),
    });

  const addTag = () => {
    const tag: PlantTag = {
      id: newPlantTagId(),
      name: 'New Area',
      x: Math.round(PLANT_MAP_WIDTH / 2),
      y: Math.round(PLANT_MAP_HEIGHT / 2),
      labelX: Math.round(PLANT_MAP_WIDTH / 2) - LABEL_W / 2,
      labelY: Math.round(PLANT_MAP_HEIGHT / 2) + 40,
      status: 'auto',
    };
    setConfig((current) => ({ ...current, tags: [...current.tags, tag] }));
    setSelectedId(tag.id);
  };

  const removeTag = (id: string) => {
    setConfig((current) => ({ ...current, tags: current.tags.filter((tag) => tag.id !== id) }));
    setSelectedId((current) => (current === id ? null : current));
  };

  const setScale = (value: number) => setConfig((current) => ({ ...current, imageScale: Math.max(40, Math.min(130, value)) }));

  const mapHeight = mapWidth * (PLANT_MAP_HEIGHT / PLANT_MAP_WIDTH);
  const imageInset = (100 - config.imageScale) / 2;

  return (
    <View className="gap-3">
      <View className={cn('flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-white')}>
        <MaterialCommunityIcons name="cursor-move" size={15} color={isDark ? '#F5F5F5' : '#111827'} />
        <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          Drag a pin to move what a tag points at; drag its label to reposition the callout.
        </Text>
        <View className="flex-1" />
        <Text className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Image size</Text>
        <Pressable onPress={() => setScale(config.imageScale - 5)} className={cn('h-7 w-7 items-center justify-center rounded-md border', isDark ? 'border-line-dark' : 'border-line-light')}>
          <MaterialCommunityIcons name="minus" size={14} color={isDark ? '#F5F5F5' : '#111827'} />
        </Pressable>
        <Text className={cn('w-12 text-center font-mono text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{config.imageScale}%</Text>
        <Pressable onPress={() => setScale(config.imageScale + 5)} className={cn('h-7 w-7 items-center justify-center rounded-md border', isDark ? 'border-line-dark' : 'border-line-light')}>
          <MaterialCommunityIcons name="plus" size={14} color={isDark ? '#F5F5F5' : '#111827'} />
        </Pressable>
      </View>

      <View
        onLayout={onMapLayout}
        className={cn('overflow-hidden rounded-lg border', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}
        style={{ height: mapHeight }}
      >
        <Image
          source={{ uri: imageUri }}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: `${imageInset}%`,
            right: `${imageInset}%`,
            top: `${imageInset}%`,
            bottom: `${imageInset}%`,
          }}
        />
        {config.tags.map((tag) => {
          const color = tagColor(tag, autoColors[tag.name] ?? '#3FBF6A');
          const isSelected = tag.id === selectedId;
          return (
            <View key={tag.id}>
              <Draggable x={tag.x - 10} y={tag.y - 10} scale={scale} onSelect={() => setSelectedId(tag.id)} onMove={(dx, dy) => movePin(tag, dx, dy)}>
                <View
                  style={{
                    width: 20 * scale,
                    height: 20 * scale,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: color,
                    backgroundColor: `${color}33`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 8 * scale, height: 8 * scale, borderRadius: 999, backgroundColor: color }} />
                </View>
              </Draggable>
              <Draggable x={tag.labelX} y={tag.labelY} scale={scale} onSelect={() => setSelectedId(tag.id)} onMove={(dx, dy) => moveLabel(tag, dx, dy)}>
                <View
                  style={{
                    width: LABEL_W * scale,
                    height: LABEL_H * scale,
                    borderRadius: 7,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? '#3FBF6A' : '#dbe3ec',
                    backgroundColor: '#ffffff',
                    paddingHorizontal: 9 * scale,
                    justifyContent: 'center',
                  }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 10.5 * scale, fontWeight: '700', color: '#111827' }}>
                    {tag.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 * scale, marginTop: 3 * scale }}>
                    <View style={{ width: 6 * scale, height: 6 * scale, borderRadius: 999, backgroundColor: color }} />
                    <Text style={{ fontSize: 9 * scale, color: '#334155' }}>{tag.status === 'auto' ? 'Live status' : tag.status}</Text>
                  </View>
                </View>
              </Draggable>
            </View>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>Tags ({config.tags.length})</Text>
        <Pressable onPress={addTag} className={cn('flex-row items-center gap-1 rounded-md border px-2.5 py-1.5', isDark ? 'border-line-dark' : 'border-line-light')}>
          <MaterialCommunityIcons name="plus" size={14} color="#3FBF6A" />
          <Text className="font-body-medium text-[11px] text-accent">Add tag</Text>
        </Pressable>
      </View>

      <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator>
        <View className="gap-2">
          {config.tags.map((tag) => (
            <View
              key={tag.id}
              className={cn(
                'flex-row flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2',
                tag.id === selectedId ? 'border-accent' : isDark ? 'border-line-dark' : 'border-line-light',
              )}
            >
              <TextInput
                value={tag.name}
                onChangeText={(value) => patchTag(tag.id, { name: value })}
                onFocus={() => setSelectedId(tag.id)}
                placeholder="Tag name"
                placeholderTextColor="#7A7E86"
                style={
                  {
                    flexGrow: 1,
                    minWidth: 150,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#e2e8f0',
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    fontSize: 12,
                    color: isDark ? '#F5F5F5' : '#111827',
                    outlineStyle: 'none',
                  } as never
                }
              />
              <View className="flex-row gap-1">
                {STATUS_OPTIONS.map((status) => (
                  <Pressable
                    key={status}
                    onPress={() => patchTag(tag.id, { status })}
                    className={cn('rounded px-2 py-1', tag.status === status ? 'bg-accent' : isDark ? 'bg-white/10' : 'bg-black/10')}
                  >
                    <Text className={cn('font-body-medium text-[10px] capitalize', tag.status === status ? 'text-white' : isDark ? 'text-ink' : 'text-ink-inverse')}>{status}</Text>
                  </Pressable>
                ))}
              </View>
              <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                pin {tag.x},{tag.y}
              </Text>
              <Pressable onPress={() => removeTag(tag.id)} accessibilityLabel={`Remove ${tag.name}`}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#D64545" />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>

      {selected ? (
        <Text className={cn('font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          Selected: {selected.name} · label at {selected.labelX},{selected.labelY}
        </Text>
      ) : null}

      {error ? <Text className="font-body text-[11px] text-status-critical">{error}</Text> : null}

      <View className="flex-row justify-end gap-2">
        <Pressable onPress={() => setConfig(DEFAULT_PLANT_OVERVIEW)} className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>Reset to default</Text>
        </Pressable>
        <Pressable onPress={onCancel} className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => onSave(config)} disabled={saving} className="rounded-lg bg-accent px-4 py-2" style={{ opacity: saving ? 0.6 : 1 }}>
          <Text className="font-body-bold text-xs text-white">{saving ? 'Saving…' : 'Save for everyone'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
