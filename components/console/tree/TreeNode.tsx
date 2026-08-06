import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { FolderType } from '../../../lib/hierarchy';
import { FolderTypeIcon } from './FolderTypeIcon';
import { Chevron, DevicesIcon, FolderIcon, MachineIcon, ProjectIcon } from './icons';

type TreeNodeKind = 'project' | 'folder' | 'machine' | 'leaf';

type TreeNodeProps = {
  label: string;
  depth: number;
  kind?: TreeNodeKind;
  folderType?: FolderType;
  selected?: boolean;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onPress?: () => void;
  onOpenMenu?: (x: number, y: number) => void;
  testID?: string;
};

export function TreeNode({
  label,
  depth,
  kind = 'leaf',
  folderType,
  selected,
  hasChildren,
  expanded,
  onToggleExpand,
  onPress,
  onOpenMenu,
  testID,
}: TreeNodeProps) {
  const { isDark } = useAppTheme();
  const ref = useRef<View>(null);
  const [hovered, setHovered] = useState(false);

  const iconColor = selected ? (isDark ? '#F5F5F5' : '#0A0A0A') : isDark ? '#A1A3A0' : '#5F625F';
  const textColorClass = selected ? (isDark ? 'text-ink' : 'text-ink-inverse') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  // react-native-web's View/Pressable don't reliably forward an `onContextMenu`
  // prop to the underlying DOM node, so attach the right-click listener directly
  // to the host element via ref instead.
  useEffect(() => {
    if (Platform.OS !== 'web' || !onOpenMenu) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      onOpenMenu(e.pageX, e.pageY);
    };
    node.addEventListener('contextmenu', handler);
    return () => node.removeEventListener('contextmenu', handler);
  }, [onOpenMenu]);

  return (
    <View ref={ref} testID={testID} className="relative">
      <Pressable
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onLongPress={onOpenMenu ? (e) => onOpenMenu(e.nativeEvent.pageX, e.nativeEvent.pageY) : undefined}
        className={cn('flex-row items-center gap-2 rounded-r-lg py-2 pr-2', (selected || hovered) && (isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel'))}
        style={{ paddingLeft: 10 + depth * 18 }}
      >
        {hasChildren ? (
          <Pressable hitSlop={6} onPress={onToggleExpand}>
            <Chevron color={iconColor} expanded={!!expanded} />
          </Pressable>
        ) : (
          <View style={{ width: 12 }} />
        )}

        {kind === 'project' ? (
          <ProjectIcon color={iconColor} />
        ) : kind === 'folder' ? (
          folderType ? <FolderTypeIcon type={folderType} color={iconColor} /> : <FolderIcon color={iconColor} />
        ) : kind === 'machine' ? (
          <MachineIcon color={iconColor} />
        ) : (
          <DevicesIcon color={iconColor} />
        )}

        <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[13px]', textColorClass)}>
          {label}
        </Text>

        {onOpenMenu ? (
          <Pressable
            hitSlop={8}
            onPress={(e) => onOpenMenu(e.nativeEvent.pageX, e.nativeEvent.pageY)}
            accessibilityLabel="Item actions"
            testID={testID ? `${testID}:menu` : undefined}
            className={cn(
              'h-5 w-5 items-center justify-center rounded',
              (hovered || selected) ? 'opacity-100' : 'opacity-0',
              isDark ? 'active:bg-surface-dark' : 'active:bg-surface-light',
            )}
          >
            <Text className={cn('text-[15px] leading-none', textColorClass)}>⋯</Text>
          </Pressable>
        ) : null}
      </Pressable>
      {selected && (
        <View className={cn('absolute bottom-1 left-0 top-1 w-[3px] rounded-full', isDark ? 'bg-ink' : 'bg-ink-inverse')} />
      )}
    </View>
  );
}
