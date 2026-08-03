import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

// A project represents a company/organization.
export function ProjectIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <MaterialCommunityIcons name="office-building-outline" size={size} color={color} />;
}

export function FolderIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <MaterialCommunityIcons name="folder-outline" size={size} color={color} />;
}

export function DevicesIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <MaterialCommunityIcons name="router-wireless" size={size} color={color} />;
}

export function MachineIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <MaterialCommunityIcons name="engine-outline" size={size} color={color} />;
}

export function Chevron({ color, expanded }: { color: string; expanded: boolean }) {
  return (
    <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
      <MaterialCommunityIcons name="chevron-right" size={16} color={color} />
    </View>
  );
}
