import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { FolderType } from '../../../lib/hierarchy';

const ICON_BY_TYPE: Record<FolderType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Plant: 'factory',
  Unit: 'cube-outline',
  Area: 'vector-square',
  System: 'sitemap',
  'Machine Group': 'robot-industrial-outline',
  'Custom Folder': 'folder-cog-outline',
};

export function FolderTypeIcon({ type, color, size = 16 }: { type: FolderType; color: string; size?: number }) {
  return <MaterialCommunityIcons name={ICON_BY_TYPE[type]} size={size} color={color} />;
}
