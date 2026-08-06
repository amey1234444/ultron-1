import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  displayIpFor,
  healthFor,
  lastCommunicationLabel,
  racksForGateway,
  totalChannelsFor,
  type DeviceNode,
} from '../../lib/devices';
import type { ProjectNode } from '../../lib/hierarchy';
import { activeChannelsForDevice, type LiveState } from '../../lib/liveTelemetry';
import { RibbonEdge } from './RibbonEdge';

type DevicesTableProps = {
  devices: DeviceNode[];
  allDevices?: DeviceNode[];
  projects: ProjectNode[];
  live?: LiveState;
  onOpenDevice: (id: string) => void;
  onOpenMenu?: (x: number, y: number, deviceId: string) => void;
};

type SortKey = 'name' | 'type' | 'status';

// Proportional flex ratios so the table always fills the available width.
const FLEX = {
  name: 1.8,
  type: 0.8,
  model: 1,
  ip: 1.3,
  port: 0.7,
  status: 1.4,
  project: 1.1,
  lastComm: 1.3,
  mapping: 0.8,
};
const MENU_WIDTH = 28;

function HeaderCell({
  label,
  flex,
  align,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  flex: number;
  align?: 'right';
  sortKey?: SortKey;
  activeSort?: { key: SortKey; dir: 'asc' | 'desc' } | null;
  onSort?: (key: SortKey) => void;
}) {
  const { isDark } = useAppTheme();
  const isActive = activeSort?.key === sortKey;
  const content = (
    <View className="flex-row items-center gap-1" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
      {sortKey && (
        <MaterialCommunityIcons
          name={isActive && activeSort?.dir === 'desc' ? 'arrow-down' : 'arrow-up'}
          size={11}
          color={isDark ? '#A1A3A0' : '#5F625F'}
          style={{ opacity: isActive ? 1 : 0.25 }}
        />
      )}
    </View>
  );

  if (!sortKey || !onSort) {
    return <View style={{ flex, paddingRight: 8 }}>{content}</View>;
  }

  return (
    <Pressable style={{ flex, paddingRight: 8 }} onPress={() => onSort(sortKey)}>
      {content}
    </Pressable>
  );
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full px-2 py-0.5',
        online ? 'bg-status-success/15' : 'bg-status-critical/15',
      )}
    >
      <View className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-status-success' : 'bg-status-critical')} />
      <Text numberOfLines={1} className={cn('font-body-medium text-[11px]', online ? 'text-status-success' : 'text-status-critical')}>
        {online ? 'Online' : 'Not Connected'}
      </Text>
    </View>
  );
}

function DeviceRow({
  device,
  allDevices,
  projectName,
  live,
  onOpenDevice,
  onOpenMenu,
}: {
  device: DeviceNode;
  allDevices: DeviceNode[];
  projectName: string;
  live?: LiveState;
  onOpenDevice: (id: string) => void;
  onOpenMenu?: (x: number, y: number, deviceId: string) => void;
}) {
  const { isDark } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const borderClass = isDark ? 'border-line-dark' : 'border-line-light';
  const total = totalChannelsFor(device.type);
  const activeChannels = live ? activeChannelsForDevice(device, live) : { active: 0, total };
  const shownIp = displayIpFor(device);
  const hasIp = shownIp.length > 0;
  const health = healthFor(device);
  const gatewayRackCount = device.type === 'Gateway' ? racksForGateway(device, allDevices).length : 0;

  return (
    <Pressable
      onPress={() => onOpenDevice(device.id)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      className={cn(
        'relative mb-2 flex-row items-center gap-3 overflow-hidden rounded-xl border px-5 py-3',
        borderClass,
        isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel',
        device.archived && 'opacity-50',
        hovered && (isDark ? 'bg-surface-dark' : 'bg-surface-light'),
      )}
    >
      <RibbonEdge health={health} side="left" />
      <RibbonEdge health={health} side="right" />

      <Text style={{ flex: FLEX.name }} numberOfLines={1} className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
        {device.name}
      </Text>
      <Text style={{ flex: FLEX.type }} className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {device.type}
      </Text>
      <Text style={{ flex: FLEX.model }} className={cn('font-mono text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {device.model}
      </Text>
      <Text
        style={{ flex: FLEX.ip }}
        numberOfLines={1}
        className={cn('font-mono text-xs', hasIp ? (isDark ? 'text-ink-muted' : 'text-ink-inverse-muted') : 'italic text-status-warning')}
      >
        {hasIp ? shownIp : 'not set'}
      </Text>
      <Text style={{ flex: FLEX.port, paddingRight: 8, textAlign: 'right' }} className={cn('font-mono text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {device.port || '-'}
      </Text>
      <View style={{ flex: FLEX.status }}>
        <StatusPill online={device.status === 'Online'} />
      </View>
      <Text
        style={{ flex: FLEX.project }}
        numberOfLines={1}
        className={cn('font-body text-sm', projectName === 'Unassigned' ? 'italic' : '', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}
      >
        {projectName}
      </Text>
      <Text style={{ flex: FLEX.lastComm }} className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {lastCommunicationLabel(device)}
      </Text>
      <Text style={{ flex: FLEX.mapping }} className={cn('font-mono text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {device.type === 'Gateway' ? `${gatewayRackCount} rack${gatewayRackCount === 1 ? '' : 's'}` : total > 0 ? `${activeChannels.active} / ${activeChannels.total}` : '-'}
      </Text>
      {onOpenMenu ? (
        <Pressable
          hitSlop={8}
          testID={`device-row-menu:${device.id}`}
          onPress={(e) => {
            e.stopPropagation();
            const { pageX, pageY } = e.nativeEvent;
            onOpenMenu(pageX, pageY, device.id);
          }}
          style={{ width: MENU_WIDTH }}
        >
          <MaterialCommunityIcons name="dots-vertical" size={16} color={isDark ? '#A1A3A0' : '#5F625F'} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function DevicesTable({ devices, allDevices = devices, projects, live, onOpenDevice, onOpenMenu }: DevicesTableProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const sorted = useMemo(() => {
    if (!sort) return devices;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...devices].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [devices, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <View className="flex-1 px-4 py-5 md:px-6">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ minWidth: 980, flex: 1 }}>
          <View className={cn('mb-4 flex-row items-center gap-3 border-b px-5 pb-3', lineClass)}>
            <HeaderCell label="Device Name" flex={FLEX.name} sortKey="name" activeSort={sort} onSort={toggleSort} />
            <HeaderCell label="Type" flex={FLEX.type} sortKey="type" activeSort={sort} onSort={toggleSort} />
            <HeaderCell label="Model" flex={FLEX.model} />
            <HeaderCell label="IP Address" flex={FLEX.ip} />
            <HeaderCell label="Port" flex={FLEX.port} align="right" />
            <HeaderCell label="Status" flex={FLEX.status} sortKey="status" activeSort={sort} onSort={toggleSort} />
            <HeaderCell label="Project" flex={FLEX.project} />
            <HeaderCell label="Last Comm." flex={FLEX.lastComm} />
            <HeaderCell label="Active Ch." flex={FLEX.mapping} />
            {onOpenMenu ? <View style={{ width: MENU_WIDTH }} /> : null}
          </View>

          <ScrollView>
            {sorted.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                allDevices={allDevices}
                projectName={d.projectId ? (projectNameById.get(d.projectId) ?? 'Unassigned') : 'Unassigned'}
                live={live}
                onOpenDevice={onOpenDevice}
                onOpenMenu={onOpenMenu}
              />
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}
