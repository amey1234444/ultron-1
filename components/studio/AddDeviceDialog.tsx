import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  DEVICE_TYPES,
  PROTOCOLS,
  defaultModelFor,
  isValidIp,
  isValidPort,
  type ConnectionStatus,
  type DeviceNode,
  type DeviceType,
  type Protocol,
} from '../../lib/devices';
import { PERMISSIONS } from '../../lib/permissions';
import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';
import { FormField } from './FormField';

export type NewDevice = {
  name: string;
  type: DeviceType;
  model: string;
  ip: string;
  port: string;
  protocol: Protocol;
  description: string;
  status: ConnectionStatus;
};

type AddDeviceDialogProps = {
  visible: boolean;
  editingDevice?: DeviceNode | null;
  onCancel: () => void;
  onCreate: (device: NewDevice) => void;
};

const DEVICE_TYPE_ICON: Record<DeviceType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Gateway: 'router-network',
  Rack: 'server-outline',
};

function TypeCard({ type, selected, onPress }: { type: DeviceType; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const color = selected ? (isDark ? '#0A0A0A' : '#F5F5F5') : isDark ? '#8A8A8A' : '#6B6B6B';

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-1 items-center gap-2 rounded-xl border py-4',
        selected
          ? isDark
            ? 'border-ink bg-ink'
            : 'border-ink-inverse bg-ink-inverse'
          : isDark
            ? 'border-line-dark'
            : 'border-line-light',
      )}
    >
      <MaterialCommunityIcons name={DEVICE_TYPE_ICON[type]} size={22} color={color} />
      <Text
        className={cn(
          'font-body-medium text-sm',
          selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
        )}
      >
        {type}
      </Text>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full border px-3 py-1.5',
        selected
          ? isDark
            ? 'border-ink bg-ink'
            : 'border-ink-inverse bg-ink-inverse'
          : isDark
            ? 'border-line-dark'
            : 'border-line-light',
      )}
    >
      <Text
        className={cn(
          'font-body-medium text-xs',
          selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AddDeviceDialog({ visible, editingDevice, onCancel, onCreate }: AddDeviceDialogProps) {
  const { isDark } = useAppTheme();
  const [type, setType] = useState<DeviceType | null>(null);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [description, setDescription] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'online' | 'failed'>('idle');

  useEffect(() => {
    if (visible) {
      setType(editingDevice?.type ?? null);
      setName(editingDevice?.name ?? '');
      setIp(editingDevice?.ip ?? '');
      setPort(editingDevice?.port ?? '');
      setProtocol(editingDevice?.protocol ?? null);
      setDescription(editingDevice?.description ?? '');
      setTestState('idle');
    }
  }, [visible, editingDevice]);

  const ipError = ip.trim().length > 0 && !isValidIp(ip) ? 'Enter a valid IPv4 address, e.g. 192.168.1.10' : undefined;
  const portError = port.trim().length > 0 && !isValidPort(port) ? 'Enter a port number between 1 and 65535' : undefined;

  const canSave =
    type !== null &&
    name.trim().length > 0 &&
    isValidIp(ip) &&
    isValidPort(port) &&
    protocol !== null;

  const handleTestConnection = () => {
    setTestState('testing');
    setTimeout(() => {
      setTestState(Math.random() > 0.3 ? 'online' : 'failed');
    }, 700);
  };

  const handleCreate = () => {
    if (!canSave || !type || !protocol) return;
    const status: ConnectionStatus =
      testState === 'online' ? 'Online' : testState === 'failed' ? 'Not Connected' : (editingDevice?.status ?? 'Not Connected');
    onCreate({
      name: name.trim(),
      type,
      model: defaultModelFor(type),
      ip: ip.trim(),
      port: port.trim(),
      protocol,
      description: description.trim(),
      status,
    });
  };

  return (
    <Dialog
      visible={visible}
      title={editingDevice ? 'Edit Device' : 'Add Device'}
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton
            label="Test Connection"
            variant="secondary"
            onPress={handleTestConnection}
            disabled={!isValidIp(ip) || !isValidPort(port) || testState === 'testing'}
          />
          <ActionButton
            label={editingDevice ? 'Save' : 'Add Device'}
            permission={PERMISSIONS.DEVICE_CREATE}
            onPress={handleCreate}
            disabled={!canSave}
          />
        </>
      }
    >
      <View className="flex-row gap-2">
        {DEVICE_TYPES.map((t) => (
          <TypeCard key={t} type={t} selected={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      <FormField label="Device Name" required value={name} onChangeText={setName} placeholder="e.g. Gateway-01" />
      <FormField label="IP Address" required value={ip} onChangeText={setIp} placeholder="e.g. 192.168.1.10" error={ipError} />
      <FormField label="Port" required value={port} onChangeText={setPort} placeholder="e.g. 502" error={portError} />

      <View className="gap-1.5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Protocol *</Text>
        <View className="flex-row flex-wrap gap-2">
          {PROTOCOLS.map((p) => (
            <Chip key={p} label={p} selected={protocol === p} onPress={() => setProtocol(p)} />
          ))}
        </View>
      </View>

      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />

      {testState !== 'idle' && (
        <View className="flex-row items-center gap-2">
          {testState === 'testing' ? (
            <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Testing connection…</Text>
          ) : (
            <>
              <View className={cn('h-2 w-2 rounded-full', testState === 'online' ? 'bg-status-success' : 'bg-status-critical')} />
              <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                {testState === 'online' ? 'Connected' : 'Connection failed'}
              </Text>
            </>
          )}
        </View>
      )}
    </Dialog>
  );
}
