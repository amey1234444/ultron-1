import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import {
  channelCountForCardType,
  decimalsForPrecision,
  derivedChannelRangeFor,
  formatProcessValue,
  normalizeChannelConfig,
  slotKind,
  type CardNode,
  type ChannelCommonConfig,
  type ProcessConfig,
  type SpeedConfig,
  type VibrationConfig,
} from '../../../lib/rack';
import { manualChannelValue, simulationForCard } from '../../../lib/simulation';
import { ActionButton } from '../ActionButton';
import { BackButton } from '../BackButton';
import { ChannelDataGraph } from './ChannelDataGraph';
import { CardTypeIcon } from './cardIcons';

type CardOverviewPageProps = {
  card: CardNode;
  rack: DeviceNode;
  devices: DeviceNode[];
  live?: LiveState;
  backLabel?: string;
  onBack: () => void;
  onEdit: () => void;
  canEditDeleteSchema: boolean;
};

type ChannelRowsInput = {
  card: CardNode;
  rack: DeviceNode;
  devices: DeviceNode[];
  live?: LiveState;
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const surfaceClass = isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel';

  return (
    <View className={cn('flex-row items-center justify-between gap-4 border-b px-5 py-3', lineClass, surfaceClass)}>
      <Text className={cn('shrink-0 font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn(mono ? 'font-mono' : 'font-body-medium', 'min-w-0 flex-1 text-right text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
        {value}
      </Text>
    </View>
  );
}

function livePrimaryChannelValue({ card, rack, devices, live }: ChannelRowsInput): number | undefined {
  if (!live || channelCountForCardType(card.type) === 0) return undefined;
  const measurement = latestMeasurementForChannel(deviceWithGatewayConnectionState(rack, devices), card, 1, live);
  if (!measurement || measurement.measurementValid === false || measurement.quality !== 'GOOD') return undefined;
  return typeof measurement.value === 'number' && Number.isFinite(measurement.value) ? measurement.value : undefined;
}

function formatLiveChannelValue(value: number, precision: ChannelCommonConfig['displayPrecision'], unit: string): string {
  const decimals = Math.max(decimalsForPrecision(precision), 2);
  return `${value.toFixed(decimals)} ${unit}`;
}

function channelRows(input: ChannelRowsInput): { label: string; value: string }[] {
  const { card } = input;
  if ('controllerName' in card.config) {
    return [
      { label: 'Controller Name', value: card.config.controllerName || '—' },
      { label: 'IP Address', value: card.config.ip || '—' },
      { label: 'Port', value: card.config.port || '—' },
      { label: 'Firmware', value: card.config.firmware || '—' },
      { label: 'Role', value: card.config.role },
      { label: 'Partner Controller', value: card.config.partnerController || '—' },
    ];
  }
  if (channelCountForCardType(card.type) === 0) return [];

  // One shared block means one summary, whatever the card measures. The rows
  // that differ are the physical input, which is the only card-specific part of
  // the editor too.
  const config = normalizeChannelConfig(card.type, card.config as unknown as Record<string, unknown>) as ChannelCommonConfig;
  const unit = config.unit || '—';
  const range = derivedChannelRangeFor(config);
  const alarmValue = (enabled: boolean, value: string) => (enabled ? `${value || 'not set'} ${unit}` : 'Disabled');
  const channel = card.simulation?.length ? simulationForCard(card)[0] : undefined;
  const liveValue = channel ? livePrimaryChannelValue(input) : undefined;

  const hardware: { label: string; value: string }[] =
    card.type === 'Vibration Card' && 'sensorType' in config
      ? [
          { label: 'Sensor Type', value: (config as VibrationConfig).sensorType || '—' },
          { label: 'Sensitivity', value: (config as VibrationConfig).sensitivity || '—' },
          { label: 'Sampling Rate', value: channel ? `${channel.samplesPerSecond} Hz` : (config as VibrationConfig).samplingRate || '—' },
        ]
      : card.type === 'RTD Card' && 'scaling' in config
        ? [
            { label: 'Sensor Type', value: 'RTD temperature input' },
            { label: 'Scaling', value: (config as ProcessConfig).scaling || '1' },
            { label: 'Filter', value: (config as ProcessConfig).filter || 'â€”' },
          ]
      : card.type === 'Speed Card' && 'pulsesPerRevolution' in config
        ? [
            { label: 'Input Type', value: (config as SpeedConfig).inputType },
            { label: 'Pulses / Revolution', value: (config as SpeedConfig).pulsesPerRevolution || '—' },
            { label: 'Trigger', value: (config as SpeedConfig).trigger || '—' },
          ]
        : card.type === 'Universal V/I Card' && 'scaling' in config
          ? [
              { label: 'Universal V/I Input', value: (config as ProcessConfig).inputType },
              { label: 'Input Scaling', value: (config as ProcessConfig).scaling || '1' },
              { label: 'Filter', value: (config as ProcessConfig).filter || '—' },
            ]
        : 'scaling' in config
          ? [
              { label: 'Input Type', value: (config as ProcessConfig).inputType },
              { label: 'Scaling', value: (config as ProcessConfig).scaling || '1' },
              { label: 'Filter', value: (config as ProcessConfig).filter || '—' },
            ]
          : [];

  // Only a simulated card carries a signal definition, and only then is there a
  // driven value to report. A physical card reads its channel from the field.
  const channelValueRows = channel
    ? [
        { label: 'Value Source', value: channel.behaviour },
        // A generated behaviour has no single configured value to report - its
        // number is wherever the walk currently sits, which belongs on the rack
        // faceplate rather than in a configuration summary.
        ...(channel.behaviour === 'Manual'
          ? [
              {
                label: 'Channel Value',
                value:
                  liveValue === undefined
                    ? `${formatProcessValue(manualChannelValue(channel), config.displayPrecision)} ${unit}`
                    : formatLiveChannelValue(liveValue, config.displayPrecision, unit),
              },
            ]
          : []),
      ]
    : [];

  return [
    { label: 'Display Name', value: config.channelNames[0] || '—' },
    { label: 'Tag', value: config.tag || '—' },
    ...hardware,
    { label: 'Engineering Unit', value: unit },
    { label: 'Full Range', value: `${formatProcessValue(range.min, config.displayPrecision)} to ${formatProcessValue(range.max, config.displayPrecision)} ${unit}` },
    { label: 'Healthy / Reset Value', value: config.healthyValue ? `${config.healthyValue} ${unit}` : 'â€”' },
    { label: 'Calibration Offset', value: `${config.offset || '0'} ${unit}` },
    { label: 'Low-Low Alarm', value: alarmValue(config.alarmLowLowEnabled, config.alarmLowLow) },
    { label: 'Low Alarm', value: alarmValue(config.alarmLowEnabled, config.alarmLow) },
    { label: 'High Alarm', value: alarmValue(config.alarmHighEnabled, config.alarmHigh) },
    { label: 'High-High Alarm', value: alarmValue(config.alarmHighHighEnabled, config.alarmHighHigh) },
    { label: 'Hysteresis', value: `${config.hysteresis || '—'} ${unit}` },
    { label: 'Alarm Delay', value: `${config.alarmDelay || '0'} sec` },
    { label: 'Display Precision', value: config.displayPrecision },
    ...channelValueRows,
  ];
}

export function CardOverviewPage({ card, rack, devices, live, backLabel = 'Back', onBack, onEdit, canEditDeleteSchema }: CardOverviewPageProps) {
  const { isDark } = useAppTheme();
  const inkColor = isDark ? '#F5F5F5' : '#0A0A0A';
  const pageClass = isDark ? 'bg-surface-dark' : 'bg-surface-light';
  const panelClass = isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel';

  return (
    <View className={cn('flex-1', pageClass)}>
      <ScrollView className="flex-1" contentContainerClassName="pb-6">
        <View className="px-6 pt-5">
          <BackButton label={backLabel} onPress={onBack} />
        </View>

        <View className="flex-row items-center justify-between px-6 pt-3">
          <View className="flex-row items-center gap-2">
            <CardTypeIcon type={card.type} color={inkColor} size={18} />
            <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{card.type}</Text>
          </View>
          {canEditDeleteSchema && <ActionButton label="Edit Configuration" onPress={onEdit} />}
        </View>

        <View className={cn('mx-6 mt-4 overflow-hidden rounded-xl border', panelClass)}>
          <Row label="Slot" value={String(card.slot)} mono />
          <Row label="Card Type" value={card.type} />
          <Row label="Kind" value={slotKind(card.slot) === 'acquisition' ? 'Acquisition' : 'Controller'} />
          <Row label="Status" value={card.enabled ? 'Enabled' : 'Disabled'} />
          {channelCountForCardType(card.type) > 0 && <Row label="Channels" value={String(channelCountForCardType(card.type))} mono />}
        </View>

        {channelCountForCardType(card.type) > 0 && <ChannelDataGraph card={card} rack={rack} devices={devices} live={live} />}

        <View className="px-6 pt-5">
          <Text className={cn('font-body-medium text-xs uppercase tracking-wider', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {channelCountForCardType(card.type) > 0 ? 'Channel Configuration' : 'Controller Details'}
          </Text>
        </View>

        <View className={cn('mx-6 mt-2 overflow-hidden rounded-xl border', panelClass)}>
          {channelRows({ card, rack, devices, live }).map((row) => (
            <Row key={row.label} label={row.label} value={row.value} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
