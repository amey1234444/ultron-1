/**
 * Super-admin editor for the shared Plant Overview.
 *
 * The map is a 3D scene now, so this is a thin frame around `PlantModelEditor`:
 * it owns the draft config, the reset/cancel/save actions, and nothing else.
 * The legacy 2D `tags` are carried through untouched — they are no longer drawn,
 * but previously saved layouts must survive a round trip.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import type { PlantOverviewConfig } from '../../lib/plantOverview';
import { DEFAULT_PLANT_SCENE_3D, type PlantScene3DConfig } from '../../lib/plantScene3d';
import { PlantModelEditor } from './plant3d/PlantModelEditor';

export function PlantOverviewEditor({
  initialConfig,
  componentColors,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initialConfig: PlantOverviewConfig;
  /** Live status colour per component id, used to preview `auto` components. */
  componentColors: Record<string, string>;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (config: PlantOverviewConfig) => void;
}) {
  const { isDark } = useAppTheme();
  const [config, setConfig] = useState<PlantOverviewConfig>(initialConfig);

  const setScene = (scene3d: PlantScene3DConfig) => setConfig((current) => ({ ...current, scene3d }));
  const border = isDark ? 'border-line-dark' : 'border-line-light';
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-3">
      <PlantModelEditor scene={config.scene3d} onChange={setScene} componentColors={componentColors} dark={isDark} />

      {error ? <Text className="font-body text-[11px] text-status-critical">{error}</Text> : null}

      <View className="flex-row flex-wrap items-center justify-end gap-2">
        <View className="flex-1 flex-row items-center gap-1.5">
          <MaterialCommunityIcons name="account-supervisor-outline" size={14} color={isDark ? '#8A9099' : '#6C7480'} />
          <Text className={cn('font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Saving publishes this layout to every user in the workspace.
          </Text>
        </View>
        <Pressable onPress={() => setScene(DEFAULT_PLANT_SCENE_3D)} className={cn('rounded-lg border px-3 py-2', border)}>
          <Text className={cn('font-body-medium text-xs', ink)}>Reset to default</Text>
        </Pressable>
        <Pressable onPress={onCancel} className={cn('rounded-lg border px-3 py-2', border)}>
          <Text className={cn('font-body-medium text-xs', ink)}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => onSave(config)} disabled={saving} className="rounded-lg bg-accent px-4 py-2" style={{ opacity: saving ? 0.6 : 1 }}>
          <Text className="font-body-bold text-xs text-white">{saving ? 'Saving…' : 'Save for everyone'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
