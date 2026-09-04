import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import { useLiveMeasurement, liveMeasurementKey } from '../../../lib/liveMeasurementBus';
import { channelAlarmLevel, formatMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import { channelCountForCardType, type CardNode } from '../../../lib/rack';
import {
  isFaultInjection,
  isOutsideNormalRange,
  simulatedGateways,
  simulatedRacksForGateway,
  simulationForCard,
  type SimulatedChannel,
} from '../../../lib/simulation';
import { ActionButton } from '../ActionButton';
import { BackButton } from '../BackButton';
import { EmptyState } from '../EmptyState';

type SimulationPanelProps = {
  devices: DeviceNode[];
  cards: CardNode[];
  live: LiveState;
  running: boolean;
  canConfigure: boolean;
  onRunningChange: (running: boolean) => void;
  onBack: () => void;
  onAddGateway: () => void;
  onAddRack: (gateway: DeviceNode) => void;
  onOpenRack: (rackId: string) => void;
};

function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'critical' | 'accent' }) {
  const { isDark } = useAppTheme();
  return (
    <View
      className={cn(
        'rounded-full border px-2 py-0.5',
        tone === 'success' && 'border-status-success/50 bg-status-success/10',
        tone === 'warning' && 'border-status-warning/50 bg-status-warning/10',
        tone === 'critical' && 'border-status-critical/50 bg-status-critical/10',
        tone === 'accent' && 'border-accent/50 bg-accent/10',
        tone === 'neutral' && (isDark ? 'border-line-dark' : 'border-line-light'),
      )}
    >
      <Text
        className={cn(
          'font-mono text-[10px] uppercase tracking-[0.14em]',
          tone === 'success' && 'text-status-success',
          tone === 'warning' && 'text-status-warning',
          tone === 'critical' && 'text-status-critical',
          tone === 'accent' && 'text-accent',
          tone === 'neutral' && (isDark ? 'text-ink-muted' : 'text-ink-inverse-muted'),
        )}
      >
        {label}
      </Text>
    </View>
  );
}

// One channel row, subscribed to just its own point on the live measurement bus
// so a 10 samples/sec channel repaints its own value without re-rendering the
// rest of the panel.
function ChannelRow({
  gatewayScriptId,
  rackId,
  slot,
  channelNumber,
  label,
  channel,
}: {
  gatewayScriptId: string;
  rackId: string;
  slot: number;
  channelNumber: number;
  label: string;
  channel: SimulatedChannel;
}) {
  const { isDark } = useAppTheme();
  const measurement = useLiveMeasurement(liveMeasurementKey(gatewayScriptId, rackId, slot, channelNumber));
  const level = channelAlarmLevel(measurement);
  const outsideNormal = measurement?.value !== null && measurement?.value !== undefined && isOutsideNormalRange(measurement.value, channel);

  const tone = level === 'danger' ? 'critical' : level === 'alert' ? 'warning' : outsideNormal ? 'accent' : 'success';
  const statusLabel = level === 'danger' ? 'Danger' : level === 'alert' ? 'Alert' : outsideNormal ? 'Off Normal' : 'Normal';

  return (
    <View className={cn('flex-row items-center gap-3 border-t px-4 py-2.5', isDark ? 'border-line-dark' : 'border-line-light')}>
      <Text className={cn('w-24 font-mono text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        S{String(slot).padStart(2, '0')}.CH{channelNumber}
      </Text>
      <View className="flex-1">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')} numberOfLines={1}>
          {label}
        </Text>
        <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {channel.kind} · {channel.min}–{channel.max} {channel.unit} · {channel.samplesPerSecond}/s
          {channel.alertLimit !== null ? ` · alert ${channel.alertLimit}` : ''}
          {channel.dangerLimit !== null ? ` · danger ${channel.dangerLimit}` : ''}
        </Text>
      </View>
      {isFaultInjection(channel.behaviour) && <Pill label={channel.behaviour} tone="accent" />}
      {!channel.enabled ? (
        <Pill label="Disabled" />
      ) : (
        <>
          <Text className={cn('w-28 text-right font-mono text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {formatMeasurement(measurement)}
          </Text>
          <View className="w-24 items-end">
            <Pill label={statusLabel} tone={tone} />
          </View>
        </>
      )}
    </View>
  );
}

function RackBlock({
  rack,
  gatewayScriptId,
  cards,
  canConfigure,
  onOpenRack,
}: {
  rack: DeviceNode;
  gatewayScriptId: string;
  cards: CardNode[];
  canConfigure: boolean;
  onOpenRack: (rackId: string) => void;
}) {
  const { isDark } = useAppTheme();
  const rackId = rack.realRackId === undefined || rack.realRackId === null ? '' : String(rack.realRackId);
  const populated = cards
    .filter((card) => card.deviceId === rack.id && channelCountForCardType(card.type) > 0)
    .sort((a, b) => a.slot - b.slot);

  return (
    <View className={cn('rounded-xl border', isDark ? 'border-line-dark bg-white/[0.02]' : 'border-line-light bg-white')}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <MaterialCommunityIcons name="server-outline" size={16} color={isDark ? '#A1A3A0' : '#5F625F'} />
        <View className="flex-1">
          <Text className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{rack.name}</Text>
          <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            rack_id: {rackId || '—'} · {rack.ip}
          </Text>
        </View>
        <Pill label={rack.status === 'Online' ? 'Online' : 'Not Connected'} tone={rack.status === 'Online' ? 'success' : 'neutral'} />
        <ActionButton label={canConfigure ? 'Configure Channels' : 'Open Rack'} variant="secondary" onPress={() => onOpenRack(rack.id)} />
      </View>

      {populated.length === 0 ? (
        <View className={cn('border-t px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            No cards installed. Open the rack and install a card to create simulated channels.
          </Text>
        </View>
      ) : (
        populated.flatMap((card) => {
          const channels = simulationForCard(card);
          const names = 'channelNames' in card.config ? card.config.channelNames : [];
          return channels.map((channel, index) => (
            <ChannelRow
              key={`${card.id}-${index}`}
              gatewayScriptId={gatewayScriptId}
              rackId={rackId}
              slot={card.slot}
              channelNumber={index + 1}
              label={names[index]?.trim() || `${card.type} CH${index + 1}`}
              channel={channel}
            />
          ));
        })
      )}
    </View>
  );
}

export function SimulationPanel({
  devices,
  cards,
  live,
  running,
  canConfigure,
  onRunningChange,
  onBack,
  onAddGateway,
  onAddRack,
  onOpenRack,
}: SimulationPanelProps) {
  const { isDark } = useAppTheme();
  const gateways = simulatedGateways(devices);
  const channelCount = gateways.reduce(
    (total, gateway) =>
      total +
      simulatedRacksForGateway(gateway, devices).reduce(
        (rackTotal, rack) =>
          rackTotal +
          cards
            .filter((card) => card.deviceId === rack.id)
            .reduce((cardTotal, card) => cardTotal + simulationForCard(card).filter((channel) => channel.enabled).length, 0),
        0,
      ),
    0,
  );

  if (gateways.length === 0) {
    return (
      <View className="flex-1">
        <View className="px-6 pt-5">
          <BackButton label="Back to Devices" onPress={onBack} />
        </View>
        <EmptyState
          eyebrow="Simulation Mode"
          title="No simulated hardware"
          description="Create a simulated gateway to build a virtual plant — racks, cards and channels that publish exactly like real BlackGATE hardware, with no sensors attached."
        >
          {canConfigure && <ActionButton label="Add Simulated Gateway" onPress={onAddGateway} />}
        </EmptyState>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-6 pt-5">
        <BackButton label="Back to Devices" onPress={onBack} />
      </View>

      <View className="flex-row items-start justify-between gap-4 px-6 pt-3">
        <View className="flex-1">
          <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>Simulation Mode</Text>
          <Text className={cn('mt-1 max-w-2xl font-body text-xs leading-5', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Simulated channels publish the same telemetry a Communication Controller does, so status, alarms, machine mapping
            and analysis behave exactly as they would with physical sensors.
          </Text>
          <View className="mt-2 flex-row items-center gap-2">
            <Pill label={running ? `Running · ${channelCount} channels` : 'Paused'} tone={running ? 'success' : 'warning'} />
            <Pill label={`${live.gateways.length} gateway${live.gateways.length === 1 ? '' : 's'} publishing`} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <ActionButton
            label={running ? 'Pause Simulation' : 'Run Simulation'}
            variant={running ? 'secondary' : 'primary'}
            onPress={() => onRunningChange(!running)}
          />
          {canConfigure && <ActionButton label="Add Simulated Gateway" onPress={onAddGateway} />}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-6 py-5">
        {gateways.map((gateway) => {
          const racks = simulatedRacksForGateway(gateway, devices);
          return (
            <View key={gateway.id} className="gap-3">
              <View className="flex-row items-center gap-3">
                <MaterialCommunityIcons name="router-network" size={18} color={isDark ? '#F5F5F5' : '#0A0A0A'} />
                <View className="flex-1">
                  <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{gateway.name}</Text>
                  <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    gateway_id: {gateway.realGatewayId ?? '—'} · {gateway.ip}
                  </Text>
                </View>
                <Pill label={gateway.status === 'Online' ? 'Online' : 'Not Connected'} tone={gateway.status === 'Online' ? 'success' : 'neutral'} />
                {canConfigure && <ActionButton label="Add Simulated Rack" variant="secondary" onPress={() => onAddRack(gateway)} />}
              </View>

              {racks.length === 0 ? (
                <View className={cn('rounded-xl border px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
                  <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    No racks yet. Add a simulated rack to start creating channels.
                  </Text>
                </View>
              ) : (
                racks.map((rack) => (
                  <RackBlock
                    key={rack.id}
                    rack={rack}
                    gatewayScriptId={gateway.realGatewayId ?? ''}
                    cards={cards}
                    canConfigure={canConfigure}
                    onOpenRack={onOpenRack}
                  />
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
