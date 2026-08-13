/**
 * Super-admin editor for the 3D plant map.
 *
 * Three things the console needs and could not do with the old illustration:
 *   • take any single part of a model out of the scene, and put it back
 *   • recolour any single part to any colour
 *   • resize one part, one component, or the whole model independently
 *
 * Every edit is stored as an override keyed by the part's Blender node name.
 * Nothing is destructive, so "Restore" is always available.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { cn } from '../../../lib/cn';
import {
  CONNECTION_COLOR,
  CONNECTION_KINDS,
  COMPONENT_SCALE_MAX,
  COMPONENT_SCALE_MIN,
  PART_SCALE_MAX,
  PART_SCALE_MIN,
  PLANT_MODELS,
  PLANT_PART_COLORS,
  countPartEdits,
  newComponentId,
  newConnectionId,
  type PlantComponent3D,
  type PlantComponentStatus,
  type PlantConnectionKind,
  type PlantPartOverride,
  type PlantScene3DConfig,
} from '../../../lib/plantScene3d';
import { ColorWell } from './ColorWell';
import { PlantScene3D, type PartNode } from './PlantScene3D';

const STATUS_OPTIONS: PlantComponentStatus[] = ['auto', 'healthy', 'warning', 'critical', 'offline'];
const HEX = /^#[0-9a-fA-F]{6}$/;

type Tab = 'components' | 'parts' | 'connections';

// ---------------------------------------------------------------------------
// Small shared controls
// ---------------------------------------------------------------------------

function Stepper({
  label,
  value,
  suffix = '',
  step = 1,
  min,
  max,
  dark,
  onChange,
  width = 62,
}: {
  label: string;
  value: number;
  suffix?: string;
  step?: number;
  min: number;
  max: number;
  dark: boolean;
  onChange: (value: number) => void;
  width?: number;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const border = dark ? 'border-line-dark' : 'border-line-light';
  const ink = dark ? 'text-ink' : 'text-ink-inverse';
  return (
    <View className="flex-row items-center gap-1">
      <Text className={cn('font-body text-[10.5px]', dark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Pressable onPress={() => onChange(clamp(value - step))} className={cn('h-6 w-6 items-center justify-center rounded border', border)}>
        <MaterialCommunityIcons name="minus" size={12} color={dark ? '#F5F5F5' : '#111827'} />
      </Pressable>
      <Text className={cn('text-center font-mono text-[10.5px]', ink)} style={{ width }}>
        {Math.round(value * 100) / 100}
        {suffix}
      </Text>
      <Pressable onPress={() => onChange(clamp(value + step))} className={cn('h-6 w-6 items-center justify-center rounded border', border)}>
        <MaterialCommunityIcons name="plus" size={12} color={dark ? '#F5F5F5' : '#111827'} />
      </Pressable>
    </View>
  );
}

function Chip({
  active,
  label,
  dark,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  dark: boolean;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded px-2 py-1', active ? 'bg-accent' : dark ? 'bg-white/10' : 'bg-black/10')}
      style={active && tone ? { backgroundColor: tone } : undefined}
    >
      <Text className={cn('font-body-medium text-[10px] capitalize', active ? 'text-white' : dark ? 'text-ink' : 'text-ink-inverse')}>
        {label}
      </Text>
    </Pressable>
  );
}

function textInputStyle(dark: boolean, extra?: object) {
  return {
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.14)' : '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11.5,
    color: dark ? '#F5F5F5' : '#111827',
    outlineStyle: 'none',
    ...extra,
  } as never;
}

// ---------------------------------------------------------------------------
// Part row + detail
// ---------------------------------------------------------------------------

function PartRow({
  part,
  override,
  selected,
  dark,
  onSelect,
  onToggleHidden,
}: {
  part: PartNode;
  override: PlantPartOverride | undefined;
  selected: boolean;
  dark: boolean;
  onSelect: () => void;
  onToggleHidden: () => void;
}) {
  const hidden = override?.hidden === true;
  return (
    <Pressable
      onPress={onSelect}
      className={cn(
        'flex-row items-center gap-2 rounded border px-2 py-1',
        selected ? 'border-accent' : dark ? 'border-line-dark' : 'border-line-light',
      )}
      style={{ marginLeft: Math.min(part.depth, 4) * 10, opacity: hidden ? 0.45 : 1 }}
    >
      <MaterialCommunityIcons
        name={part.kind === 'port' ? 'connection' : part.kind === 'anchor' ? 'target' : 'cube-outline'}
        size={12}
        color={part.kind === 'mesh' ? (dark ? '#8A9099' : '#6C7480') : CONNECTION_COLOR}
      />
      <Text
        numberOfLines={1}
        className={cn('flex-1 font-mono text-[10px]', dark ? 'text-ink' : 'text-ink-inverse')}
        style={hidden ? { textDecorationLine: 'line-through' } : undefined}
      >
        {part.name}
      </Text>
      {override?.color ? (
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: override.color }} />
      ) : null}
      {override?.scale !== undefined ? (
        <Text className="font-mono text-[9px] text-accent">{Math.round(override.scale * 100)}%</Text>
      ) : null}
      <Pressable onPress={onToggleHidden} hitSlop={6} accessibilityLabel={hidden ? `Restore ${part.name}` : `Delete ${part.name}`}>
        <MaterialCommunityIcons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={14} color={hidden ? '#D64545' : dark ? '#8A9099' : '#6C7480'} />
      </Pressable>
    </Pressable>
  );
}

function PartDetail({
  name,
  override,
  dark,
  onPatch,
  onReset,
}: {
  name: string;
  override: PlantPartOverride | undefined;
  dark: boolean;
  onPatch: (patch: PlantPartOverride) => void;
  onReset: () => void;
}) {
  const [hexDraft, setHexDraft] = useState(override?.color ?? '#B7BCC3');
  const scale = override?.scale ?? 1;
  const hidden = override?.hidden === true;

  const commitHex = (value: string) => {
    const next = value.startsWith('#') ? value : `#${value}`;
    setHexDraft(next);
    if (HEX.test(next)) onPatch({ color: next.toLowerCase() });
  };

  return (
    <View className={cn('gap-2 rounded-lg border p-2.5', dark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-white')}>
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className={cn('flex-1 font-mono text-[11px]', dark ? 'text-ink' : 'text-ink-inverse')}>
          {name}
        </Text>
        <Pressable onPress={onReset} className={cn('rounded border px-2 py-1', dark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body-medium text-[10px]', dark ? 'text-ink' : 'text-ink-inverse')}>Reset part</Text>
        </Pressable>
        <Pressable
          onPress={() => onPatch({ hidden: !hidden })}
          className="rounded px-2 py-1"
          style={{ backgroundColor: hidden ? '#3FBF6A' : '#D64545' }}
        >
          <Text className="font-body-bold text-[10px] text-white">{hidden ? 'Restore part' : 'Delete part'}</Text>
        </Pressable>
      </View>

      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className={cn('font-body text-[10.5px]', dark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Colour</Text>
        <ColorWell value={override?.color ?? '#B7BCC3'} onChange={(hex) => { setHexDraft(hex); onPatch({ color: hex }); }} />
        {PLANT_PART_COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => { setHexDraft(color); onPatch({ color }); }}
            accessibilityLabel={`Set colour ${color}`}
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              backgroundColor: color,
              borderWidth: override?.color?.toLowerCase() === color.toLowerCase() ? 2 : 1,
              borderColor: override?.color?.toLowerCase() === color.toLowerCase() ? '#3FBF6A' : 'rgba(128,128,128,0.4)',
            }}
          />
        ))}
        <TextInput
          value={hexDraft}
          onChangeText={commitHex}
          autoCapitalize="none"
          placeholder="#RRGGBB"
          placeholderTextColor="#7A7E86"
          maxLength={7}
          style={textInputStyle(dark, { width: 84, fontFamily: 'monospace' })}
        />
        <Pressable onPress={() => onPatch({ color: null })} className={cn('rounded border px-2 py-1', dark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body-medium text-[10px]', dark ? 'text-ink' : 'text-ink-inverse')}>Original</Text>
        </Pressable>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Stepper
          label="Part size"
          value={scale}
          step={0.05}
          min={PART_SCALE_MIN}
          max={PART_SCALE_MAX}
          dark={dark}
          onChange={(value) => onPatch({ scale: value })}
        />
        <Pressable onPress={() => onPatch({ scale: 1 })} className={cn('rounded border px-2 py-1', dark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body-medium text-[10px]', dark ? 'text-ink' : 'text-ink-inverse')}>1.0x</Text>
        </Pressable>
        <Text className={cn('font-body text-[9.5px]', dark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          Resizes about the part&apos;s own centre. Deleting a parent also hides everything mounted on it.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function PlantModelEditor({
  scene,
  onChange,
  componentColors,
  dark,
}: {
  scene: PlantScene3DConfig;
  onChange: (scene: PlantScene3DConfig) => void;
  componentColors: Record<string, string>;
  dark: boolean;
}) {
  const [tab, setTab] = useState<Tab>('components');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(scene.components[0]?.id ?? null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [partsByComponent, setPartsByComponent] = useState<Record<string, PartNode[]>>({});
  const [partQuery, setPartQuery] = useState('');

  const selected = scene.components.find((c) => c.id === selectedComponentId) ?? null;
  const border = dark ? 'border-line-dark' : 'border-line-light';
  const ink = dark ? 'text-ink' : 'text-ink-inverse';
  const inkMuted = dark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  // Stable identity: the canvas calls this from an effect, so a new function on
  // every render would re-enter the effect forever.
  const handlePartsDiscovered = useCallback((componentId: string, parts: PartNode[]) => {
    setPartsByComponent((current) => (current[componentId]?.length === parts.length ? current : { ...current, [componentId]: parts }));
  }, []);

  const handleSelectPart = useCallback((componentId: string, partName: string) => {
    setSelectedComponentId(componentId);
    setSelectedPart(partName);
    setTab('parts');
  }, []);

  const patchComponent = (id: string, patch: Partial<PlantComponent3D>) =>
    onChange({ ...scene, components: scene.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const patchPart = (componentId: string, partName: string, patch: PlantPartOverride) => {
    const component = scene.components.find((c) => c.id === componentId);
    if (!component) return;
    const next: PlantPartOverride = { ...component.parts[partName], ...patch };
    // Drop keys that are back at their default so the saved payload stays small.
    if (next.hidden === false) delete next.hidden;
    if (next.color === null) delete next.color;
    if (next.scale !== undefined && Math.abs(next.scale - 1) < 1e-4) delete next.scale;
    const parts = { ...component.parts };
    if (Object.keys(next).length === 0) delete parts[partName];
    else parts[partName] = next;
    patchComponent(componentId, { parts });
  };

  const resetPart = (componentId: string, partName: string) => {
    const component = scene.components.find((c) => c.id === componentId);
    if (!component) return;
    const parts = { ...component.parts };
    delete parts[partName];
    patchComponent(componentId, { parts });
  };

  const restoreComponent = (componentId: string) => patchComponent(componentId, { parts: {} });
  const restoreEverything = () => onChange({ ...scene, components: scene.components.map((c) => ({ ...c, parts: {} })) });

  const addComponent = () => {
    const component: PlantComponent3D = {
      id: newComponentId(),
      name: `Component ${scene.components.length + 1}`,
      model: 'utility-building',
      x: Math.round((scene.components.length % 3) * 14 - 14),
      z: Math.round(Math.floor(scene.components.length / 3) * 12),
      rotation: 0,
      scale: 100,
      status: 'auto',
      parts: {},
    };
    onChange({ ...scene, components: [...scene.components, component] });
    setSelectedComponentId(component.id);
  };

  const removeComponent = (id: string) => {
    onChange({
      ...scene,
      components: scene.components.filter((c) => c.id !== id),
      connections: scene.connections.filter((c) => c.fromId !== id && c.toId !== id),
    });
    setSelectedComponentId((current) => (current === id ? null : current));
  };

  const parts = selected ? partsByComponent[selected.id] ?? [] : [];
  const visibleParts = useMemo(() => {
    const query = partQuery.trim().toUpperCase();
    const list = parts.filter((p) => p.kind === 'mesh');
    return query ? list.filter((p) => p.name.includes(query)) : list;
  }, [parts, partQuery]);

  const portNames = useCallback(
    (componentId: string) => (partsByComponent[componentId] ?? []).filter((p) => p.kind === 'port').map((p) => p.name),
    [partsByComponent],
  );

  const edits = selected ? countPartEdits(selected.parts) : { hidden: 0, colored: 0, resized: 0 };
  const totalHidden = scene.components.reduce((sum, c) => sum + countPartEdits(c.parts).hidden, 0);

  const addConnection = () => {
    if (scene.components.length < 2) return;
    const [a, b] = scene.components;
    onChange({
      ...scene,
      connections: [
        ...scene.connections,
        {
          id: newConnectionId(),
          fromId: a.id,
          fromPort: portNames(a.id)[0] ?? 'PORT_UTILITY_OUT',
          toId: b.id,
          toPort: portNames(b.id)[0] ?? 'PORT_ELECTRICAL_IN',
          kind: 'utility',
        },
      ],
    });
  };

  return (
    <View className="gap-3">
      {/* ---------- live preview ---------- */}
      <View className={cn('overflow-hidden rounded-lg border', border, dark ? 'bg-surface-dark' : 'bg-surface-light')} style={{ height: 340 }}>
        <PlantScene3D
          scene={scene}
          statusColors={componentColors}
          dark={dark}
          editable
          selectedComponentId={selectedComponentId}
          selectedPart={selectedPart}
          onSelectPart={handleSelectPart}
          onPartsDiscovered={handlePartsDiscovered}
        />
      </View>

      <View className={cn('flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2', border, dark ? 'bg-surface-darkpanel' : 'bg-white')}>
        <MaterialCommunityIcons name="rotate-3d-variant" size={15} color={dark ? '#F5F5F5' : '#111827'} />
        <Text className={cn('font-body text-[11px]', inkMuted)}>Drag to orbit · scroll to zoom · click a part to select it</Text>
        <View className="flex-1" />
        <Stepper
          label="Model size"
          value={scene.modelScale}
          suffix="%"
          step={5}
          min={COMPONENT_SCALE_MIN}
          max={COMPONENT_SCALE_MAX}
          dark={dark}
          onChange={(modelScale) => onChange({ ...scene, modelScale })}
        />
        <Chip active={scene.showGrid} label="Grid" dark={dark} onPress={() => onChange({ ...scene, showGrid: !scene.showGrid })} />
        <Chip active={scene.showLabels} label="Labels" dark={dark} onPress={() => onChange({ ...scene, showLabels: !scene.showLabels })} />
      </View>

      {/* ---------- tabs ---------- */}
      <View className="flex-row gap-1.5">
        {(['components', 'parts', 'connections'] as Tab[]).map((key) => (
          <Chip
            key={key}
            active={tab === key}
            label={
              key === 'components'
                ? `Components (${scene.components.length})`
                : key === 'parts'
                  ? `Parts${totalHidden > 0 ? ` · ${totalHidden} deleted` : ''}`
                  : `Connections (${scene.connections.length})`
            }
            dark={dark}
            onPress={() => setTab(key)}
          />
        ))}
        <View className="flex-1" />
        {totalHidden > 0 ? (
          <Pressable onPress={restoreEverything} className="flex-row items-center gap-1 rounded-md bg-accent px-2.5 py-1.5">
            <MaterialCommunityIcons name="backup-restore" size={13} color="#FFFFFF" />
            <Text className="font-body-bold text-[10.5px] text-white">Recover whole model</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ---------- components ---------- */}
      {tab === 'components' ? (
        <View className="gap-2">
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator>
            <View className="gap-2">
              {scene.components.map((component) => {
                const active = component.id === selectedComponentId;
                return (
                  <Pressable
                    key={component.id}
                    onPress={() => setSelectedComponentId(component.id)}
                    className={cn('gap-2 rounded-lg border px-2.5 py-2', active ? 'border-accent' : border)}
                  >
                    <View className="flex-row flex-wrap items-center gap-2">
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: componentColors[component.id] ?? '#3FBF6A' }} />
                      <TextInput
                        value={component.name}
                        onChangeText={(name) => patchComponent(component.id, { name })}
                        onFocus={() => setSelectedComponentId(component.id)}
                        placeholder="Component name"
                        placeholderTextColor="#7A7E86"
                        style={textInputStyle(dark, { flexGrow: 1, minWidth: 150 })}
                      />
                      <Text className={cn('font-body text-[9.5px]', inkMuted)}>{PLANT_MODELS[component.model].name}</Text>
                      <Pressable onPress={() => removeComponent(component.id)} accessibilityLabel={`Remove ${component.name}`}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#D64545" />
                      </Pressable>
                    </View>
                    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Stepper label="X" value={component.x} step={0.5} min={-400} max={400} dark={dark} onChange={(x) => patchComponent(component.id, { x })} />
                      <Stepper label="Z" value={component.z} step={0.5} min={-400} max={400} dark={dark} onChange={(z) => patchComponent(component.id, { z })} />
                      <Stepper label="Rot" value={component.rotation} suffix="°" step={5} min={-360} max={360} dark={dark} onChange={(rotation) => patchComponent(component.id, { rotation })} />
                      <Stepper
                        label="Size"
                        value={component.scale}
                        suffix="%"
                        step={5}
                        min={COMPONENT_SCALE_MIN}
                        max={COMPONENT_SCALE_MAX}
                        dark={dark}
                        onChange={(scaleValue) => patchComponent(component.id, { scale: scaleValue })}
                      />
                    </View>
                    <View className="flex-row flex-wrap items-center gap-1">
                      <Text className={cn('font-body text-[10px]', inkMuted)}>Status</Text>
                      {STATUS_OPTIONS.map((status) => (
                        <Chip key={status} active={component.status === status} label={status} dark={dark} onPress={() => patchComponent(component.id, { status })} />
                      ))}
                      {countPartEdits(component.parts).hidden > 0 ? (
                        <Pressable onPress={() => restoreComponent(component.id)} className={cn('rounded border px-2 py-1', border)}>
                          <Text className="font-body-medium text-[10px] text-accent">Restore {countPartEdits(component.parts).hidden} parts</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Pressable onPress={addComponent} className={cn('flex-row items-center justify-center gap-1 rounded-md border py-2', border)}>
            <MaterialCommunityIcons name="plus" size={14} color="#3FBF6A" />
            <Text className="font-body-medium text-[11px] text-accent">Add component</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ---------- parts ---------- */}
      {tab === 'parts' ? (
        !selected ? (
          <Text className={cn('font-body text-[11px]', inkMuted)}>Select a component first.</Text>
        ) : (
          <View className="gap-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className={cn('font-body-bold text-xs', ink)}>{selected.name}</Text>
              <Text className={cn('font-body text-[10px]', inkMuted)}>
                {visibleParts.length} parts · {edits.hidden} deleted · {edits.colored} recoloured · {edits.resized} resized
              </Text>
              <View className="flex-1" />
              <TextInput
                value={partQuery}
                onChangeText={setPartQuery}
                placeholder="Filter parts (e.g. HVAC, WINDOW)"
                placeholderTextColor="#7A7E86"
                autoCapitalize="characters"
                style={textInputStyle(dark, { minWidth: 190 })}
              />
              <Pressable onPress={() => restoreComponent(selected.id)} className={cn('rounded border px-2 py-1', border)}>
                <Text className={cn('font-body-medium text-[10px]', ink)}>Restore all parts</Text>
              </Pressable>
            </View>

            {selectedPart ? (
              <PartDetail
                name={selectedPart}
                override={selected.parts[selectedPart]}
                dark={dark}
                onPatch={(patch) => patchPart(selected.id, selectedPart, patch)}
                onReset={() => resetPart(selected.id, selectedPart)}
              />
            ) : (
              <Text className={cn('font-body text-[10.5px]', inkMuted)}>Click a part in the 3D view, or pick one from the list below.</Text>
            )}

            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator>
              <View className="gap-1">
                {visibleParts.length === 0 ? (
                  <Text className={cn('font-body text-[10.5px]', inkMuted)}>
                    {parts.length === 0 ? 'Loading the model’s part list…' : 'No parts match that filter.'}
                  </Text>
                ) : (
                  visibleParts.map((part) => (
                    <PartRow
                      key={part.name}
                      part={part}
                      override={selected.parts[part.name]}
                      selected={selectedPart === part.name}
                      dark={dark}
                      onSelect={() => setSelectedPart(part.name)}
                      onToggleHidden={() => patchPart(selected.id, part.name, { hidden: !selected.parts[part.name]?.hidden })}
                    />
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        )
      ) : null}

      {/* ---------- connections ---------- */}
      {tab === 'connections' ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <View style={{ width: 22, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: CONNECTION_COLOR }} />
            <Text className={cn('font-body text-[10.5px]', inkMuted)}>Connections render as a light-blue dotted run between the two component ports.</Text>
          </View>
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator>
            <View className="gap-2">
              {scene.connections.length === 0 ? (
                <Text className={cn('font-body text-[10.5px]', inkMuted)}>No connections yet.</Text>
              ) : (
                scene.connections.map((connection) => {
                  const patch = (p: Partial<typeof connection>) =>
                    onChange({ ...scene, connections: scene.connections.map((c) => (c.id === connection.id ? { ...c, ...p } : c)) });
                  return (
                    <View key={connection.id} className={cn('gap-1.5 rounded-lg border px-2.5 py-2', border)}>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className={cn('font-body text-[10px]', inkMuted)}>From</Text>
                        {scene.components.map((c) => (
                          <Chip key={c.id} active={connection.fromId === c.id} label={c.name} dark={dark} onPress={() => patch({ fromId: c.id })} />
                        ))}
                        <View className="flex-1" />
                        <Pressable
                          onPress={() => onChange({ ...scene, connections: scene.connections.filter((c) => c.id !== connection.id) })}
                          accessibilityLabel="Remove connection"
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#D64545" />
                        </Pressable>
                      </View>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        {portNames(connection.fromId).map((port) => (
                          <Chip key={port} active={connection.fromPort === port} label={port.replace('PORT_', '')} dark={dark} onPress={() => patch({ fromPort: port })} />
                        ))}
                      </View>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className={cn('font-body text-[10px]', inkMuted)}>To</Text>
                        {scene.components.map((c) => (
                          <Chip key={c.id} active={connection.toId === c.id} label={c.name} dark={dark} onPress={() => patch({ toId: c.id })} />
                        ))}
                      </View>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        {portNames(connection.toId).map((port) => (
                          <Chip key={port} active={connection.toPort === port} label={port.replace('PORT_', '')} dark={dark} onPress={() => patch({ toPort: port })} />
                        ))}
                      </View>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className={cn('font-body text-[10px]', inkMuted)}>Service</Text>
                        {CONNECTION_KINDS.map((kind: PlantConnectionKind) => (
                          <Chip key={kind} active={connection.kind === kind} label={kind} dark={dark} onPress={() => patch({ kind })} />
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
          <Pressable
            onPress={addConnection}
            disabled={scene.components.length < 2}
            className={cn('flex-row items-center justify-center gap-1 rounded-md border py-2', border)}
            style={{ opacity: scene.components.length < 2 ? 0.5 : 1 }}
          >
            <MaterialCommunityIcons name="plus" size={14} color={CONNECTION_COLOR} />
            <Text className="font-body-medium text-[11px]" style={{ color: CONNECTION_COLOR }}>
              Add connection
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
