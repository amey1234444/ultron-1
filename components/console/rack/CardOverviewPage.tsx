import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { channelCountForCardType, channelNamesForCard, formatProcessValue, normalizeProcessConfig, slotKind, type CardNode } from '../../../lib/rack';
import { manualChannelValue, simulationForCard } from '../../../lib/simulation';
import { ActionButton } from '../ActionButton';
import { BackButton } from '../BackButton';
import { CardTypeIcon } from './cardIcons';

type CardOverviewPageProps = {
  card: CardNode;
  backLabel?: string;
  onBack: () => void;
  onEdit: () => void;
  canEditDeleteSchema: boolean;
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  return (
    <View className={cn('flex-row items-center justify-between border-b px-5 py-3', lineClass)}>
      <Text className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn(mono ? 'font-mono' : 'font-body-medium', 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
    </View>
  );
}

function channelRows(card: CardNode): { label: string; value: string }[] {
  if (card.type === 'Process Card' && 'engineeringMin' in card.config) {
    const config = normalizeProcessConfig(card.config);
    const unit = config.unit || '—';
    const alarmValue = (enabled: boolean, value: string) => (enabled ? `${value || 'not set'} ${unit}` : 'Disabled');
    // Only a simulated card carries a signal definition, and only then is there
    // a driven value to report. A physical card reads its channel from the
    // field wiring, so there is nothing configured here to show.
    const channel = card.simulation?.length ? simulationForCard(card)[0] : undefined;
    const channelValueRows = channel
      ? [
          { label: 'Value Source', value: channel.behaviour },
          // A generated behaviour has no single configured value to report —
          // its number is whatever the walk currently sits at, which belongs on
          // the rack faceplate rather than in a configuration summary.
          ...(channel.behaviour === 'Manual'
            ? [{ label: 'Channel Value', value: `${formatProcessValue(manualChannelValue(channel), config.displayPrecision)} ${unit}` }]
            : []),
        ]
      : [];
    return [
      { label: 'Display Name', value: config.channelNames[0] || '—' },
      { label: 'Tag', value: config.tag || '—' },
      { label: 'Input Type', value: config.inputType },
      { label: 'Engineering Unit', value: unit },
      { label: 'Engineering Range', value: `${config.engineeringMin || '—'} to ${config.engineeringMax || '—'} ${unit}` },
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
  if (channelCountForCardType(card.type) > 0) {
    return channelNamesForCard(card).map((name) => ({ label: 'Channel Name', value: name || '—' }));
  }
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
  return [];
}

export function CardOverviewPage({ card, backLabel = 'Back', onBack, onEdit, canEditDeleteSchema }: CardOverviewPageProps) {
  const { isDark } = useAppTheme();
  const inkColor = isDark ? '#F5F5F5' : '#0A0A0A';

  return (
    <View className="flex-1">
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

      <View className={cn('mx-6 mt-4 rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}>
        <Row label="Slot" value={String(card.slot)} mono />
        <Row label="Card Type" value={card.type} />
        <Row label="Kind" value={slotKind(card.slot) === 'acquisition' ? 'Acquisition' : 'Controller'} />
        <Row label="Status" value={card.enabled ? 'Enabled' : 'Disabled'} />
        {channelCountForCardType(card.type) > 0 && <Row label="Channels" value={String(channelCountForCardType(card.type))} mono />}
      </View>

      <View className="px-6 pt-5">
        <Text className={cn('font-body-medium text-xs uppercase tracking-wider', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {card.type === 'Process Card' && 'engineeringMin' in card.config ? 'Channel Card Configuration' : 'channelNames' in card.config ? 'Channels' : 'Controller Details'}
        </Text>
      </View>

      <View className={cn('mx-6 mt-2 rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}>
        {channelRows(card).map((row) => (
          <Row key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
    </View>
  );
}
