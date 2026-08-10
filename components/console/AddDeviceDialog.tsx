import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  DEVICE_TYPES,
  PROTOCOLS,
  composeIp,
  defaultModelFor,
  gatewayForRack,
  hostOctetFor,
  isValidIp,
  isValidHostOctet,
  isValidPort,
  ipPrefixFor,
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
  gatewayId?: string | null;
  realGatewayId?: string | null;
  realRackId?: string | number | null;
  simulated?: boolean;
};

type AddDeviceDialogProps = {
  visible: boolean;
  editingDevice?: DeviceNode | null;
  gateways?: DeviceNode[];
  initialGatewayId?: string | null;
  /** Opens the dialog in Simulation Mode: virtual hardware, addressed for you. */
  initialSimulated?: boolean;
  onCancel: () => void;
  onCreate: (device: NewDevice) => void;
};

const DEVICE_TYPE_ICON: Record<DeviceType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Gateway: 'router-network',
  Rack: 'server-outline',
};

function TypeCard({ type, selected, onPress }: { type: DeviceType; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const color = selected ? (isDark ? '#0A0A0A' : '#F5F5F5') : isDark ? '#A1A3A0' : '#5F625F';

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

export function AddDeviceDialog({
  visible,
  editingDevice,
  gateways = [],
  initialGatewayId = null,
  initialSimulated = false,
  onCancel,
  onCreate,
}: AddDeviceDialogProps) {
  const { isDark } = useAppTheme();
  const [type, setType] = useState<DeviceType | null>(null);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [hostOctet, setHostOctet] = useState('');
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [description, setDescription] = useState('');
  const [gatewayId, setGatewayId] = useState<string | null>(initialGatewayId);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'online' | 'failed'>('idle');

  // Simulated hardware is virtual: it is addressed automatically inside a
  // reserved block, so the network fields (and the connection test) are
  // meaningless here and are replaced by a short explanation.
  const simulated = editingDevice ? editingDevice.simulated === true : initialSimulated;
  const gatewayChoices = gateways.filter((gateway) => (gateway.simulated === true) === simulated);

  useEffect(() => {
    if (visible) {
      const nextType = initialGatewayId ? 'Rack' : (editingDevice?.type ?? null);
      const inferredGateway = editingDevice?.type === 'Rack' ? gatewayForRack(editingDevice, gateways) : undefined;
      const nextGatewayId = editingDevice?.gatewayId ?? inferredGateway?.id ?? initialGatewayId ?? null;
      setType(nextType);
      setName(editingDevice?.name ?? '');
      setGatewayId(nextGatewayId);
      setIp(editingDevice?.ip ?? '');
      setHostOctet(editingDevice?.type === 'Rack' ? hostOctetFor(editingDevice.ip) : '');
      setPort(editingDevice?.port ?? '');
      setProtocol(editingDevice?.protocol ?? null);
      setDescription(editingDevice?.description ?? '');
      setTestState('idle');
    }
  }, [visible, editingDevice, gateways, initialGatewayId]);

  const selectedGateway = type === 'Rack' && gatewayId ? gateways.find((gateway) => gateway.id === gatewayId) : undefined;
  const selectedGatewayPrefix = selectedGateway ? ipPrefixFor(selectedGateway.ip) : '';
  const effectiveIp = type === 'Gateway' ? ip.trim() : selectedGatewayPrefix ? composeIp(selectedGatewayPrefix, hostOctet) : ip.trim();
  const ipError =
    type === 'Gateway'
      ? ip.trim().length > 0 && !isValidIp(ip)
        ? 'Enter the gateway full IPv4 address, e.g. 192.168.10.10'
        : undefined
      : selectedGatewayPrefix
        ? hostOctet.trim().length > 0 && !isValidHostOctet(hostOctet)
          ? 'Enter the fourth IP section from 1 to 254'
          : undefined
        : ip.trim().length > 0 && !isValidIp(ip)
          ? 'Select a gateway or enter a valid full IPv4 address'
          : undefined;
  const portError = port.trim().length > 0 && !isValidPort(port) ? 'Enter a port number between 1 and 65535' : undefined;

  const canSave =
    type !== null &&
    name.trim().length > 0 &&
    (simulated
      ? type === 'Gateway' || gatewayId !== null
      : (type === 'Gateway' ? isValidIp(ip) : selectedGatewayPrefix ? isValidIp(effectiveIp) : isValidIp(ip)) &&
        isValidPort(port) &&
        protocol !== null);
  const canTestConnection = !simulated && (type === 'Gateway' ? isValidIp(ip) : isValidIp(effectiveIp)) && isValidPort(port);

  const handleTestConnection = () => {
    setTestState('testing');
    setTimeout(() => {
      setTestState(Math.random() > 0.3 ? 'online' : 'failed');
    }, 700);
  };

  const handleCreate = () => {
    if (!canSave || !type) return;
    if (!simulated && !protocol) return;
    const status: ConnectionStatus =
      testState === 'online' ? 'Online' : testState === 'failed' ? 'Not Connected' : (editingDevice?.status ?? 'Not Connected');
    onCreate({
      name: name.trim(),
      type,
      model: defaultModelFor(type),
      ip: effectiveIp,
      port: port.trim(),
      // A simulated device still carries a protocol so it looks like any other
      // device everywhere it is listed; the simulator itself does not use it.
      protocol: protocol ?? 'Modbus TCP',
      description: description.trim(),
      status,
      gatewayId: type === 'Rack' ? (gatewayId ?? null) : null,
      realGatewayId: editingDevice?.realGatewayId ?? null,
      realRackId: editingDevice?.realRackId ?? null,
      simulated,
    });
  };

  return (
    <Dialog
      visible={visible}
      title={`${editingDevice ? 'Edit' : 'Add'} ${simulated ? 'Simulated Device' : 'Device'}`}
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          {!simulated && (
            <ActionButton
              label="Test Connection"
              variant="secondary"
              onPress={handleTestConnection}
              disabled={!canTestConnection || testState === 'testing'}
            />
          )}
          <ActionButton
            label={editingDevice ? 'Save' : simulated ? 'Add Simulated Device' : 'Add Device'}
            permission={PERMISSIONS.DEVICE_CREATE}
            onPress={handleCreate}
            disabled={!canSave}
          />
        </>
      }
    >
      {simulated && (
        <View className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2">
          <Text className="font-body-medium text-xs text-accent">Simulation Mode</Text>
          <Text className={cn('mt-1 font-body text-xs leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Virtual hardware with no sensors behind it. Addressing is assigned automatically in a reserved range, and the
            device publishes the same telemetry a real gateway does.
          </Text>
        </View>
      )}

      <View className="flex-row gap-2">
        {(initialGatewayId ? (['Rack'] as DeviceType[]) : DEVICE_TYPES).map((t) => (
          <TypeCard
            key={t}
            type={t}
            selected={type === t}
            onPress={() => {
              setType(t);
              if (t === 'Gateway') setGatewayId(null);
              if (t === 'Rack' && !gatewayId && gatewayChoices.length === 1) setGatewayId(gatewayChoices[0].id);
            }}
          />
        ))}
      </View>

      <FormField
        label="Device Name"
        required
        value={name}
        onChangeText={setName}
        placeholder={simulated ? (type === 'Rack' ? 'e.g. Sim-Rack-01' : 'e.g. Sim-Gateway-01') : 'e.g. Gateway-01'}
      />
      {type === 'Rack' && gatewayChoices.length > 0 && (
        <View className="gap-1.5">
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {simulated ? 'Simulated Gateway *' : 'Gateway *'}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {gatewayChoices.map((gateway) => (
              <Chip key={gateway.id} label={`${gateway.name} (${gateway.ip || 'no IP'})`} selected={gatewayId === gateway.id} onPress={() => setGatewayId(gateway.id)} />
            ))}
          </View>
        </View>
      )}
      {simulated ? (
        <View className="gap-1.5">
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Address</Text>
          <View className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}>
            <Text className={cn('font-mono text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {editingDevice?.ip || 'assigned automatically on save'}
            </Text>
          </View>
        </View>
      ) : type === 'Gateway' ? (
        <FormField label="Gateway IP Address" required value={ip} onChangeText={setIp} placeholder="e.g. 192.168.10.10" error={ipError} />
      ) : selectedGatewayPrefix ? (
        <View className="gap-1.5">
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Rack IP Address *</Text>
          <View className="flex-row items-center gap-2">
            <View className={cn('h-10 justify-center rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}>
              <Text className={cn('font-mono text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{selectedGatewayPrefix}.</Text>
            </View>
            <TextInput
              value={hostOctet}
              onChangeText={setHostOctet}
              placeholder="11"
              placeholderTextColor={isDark ? '#5F625F' : '#A1A3A0'}
              className={cn(
                'h-10 flex-1 rounded-lg border px-3 py-2 font-mono text-sm',
                ipError ? 'border-status-critical' : isDark ? 'border-line-dark' : 'border-line-light',
                isDark ? 'bg-surface-dark text-ink' : 'bg-surface-light text-ink-inverse',
              )}
            />
          </View>
          {ipError && <Text className="font-body text-xs text-status-critical">{ipError}</Text>}
          <Text className={cn('font-mono text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {isValidIp(effectiveIp) ? effectiveIp : `${selectedGatewayPrefix}.x`}
          </Text>
        </View>
      ) : (
        <FormField label="IP Address" required value={ip} onChangeText={setIp} placeholder="e.g. 192.168.10.11" error={ipError} />
      )}
      {!simulated && <FormField label="Port" required value={port} onChangeText={setPort} placeholder="e.g. 502" error={portError} />}

      {editingDevice && (
        <View className="gap-1.5">
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Script IDs</Text>
          <View className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}>
            <Text className={cn('font-mono text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>
              gateway_id: {editingDevice.realGatewayId || 'generated on save'}
            </Text>
            {editingDevice.type === 'Rack' && (
              <Text className={cn('mt-1 font-mono text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>
                rack_id: {editingDevice.realRackId ?? 'generated on save'}
              </Text>
            )}
          </View>
        </View>
      )}

      {!simulated && (
        <View className="gap-1.5">
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Protocol *</Text>
          <View className="flex-row flex-wrap gap-2">
            {PROTOCOLS.map((p) => (
              <Chip key={p} label={p} selected={protocol === p} onPress={() => setProtocol(p)} />
            ))}
          </View>
        </View>
      )}

      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />

      {!simulated && testState !== 'idle' && (
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
