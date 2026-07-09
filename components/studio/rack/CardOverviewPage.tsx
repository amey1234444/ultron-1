import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { channelCountForCardType, slotKind, type CardNode } from '../../../lib/rack';
import { ActionButton } from '../ActionButton';
import { CardTypeIcon } from './cardIcons';

type CardOverviewPageProps = {
  card: CardNode;
  onBack: () => void;
  onEdit: () => void;
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
  if ('channelNames' in card.config) {
    return card.config.channelNames.map((name, index) => ({ label: `Channel ${index + 1}`, value: name || '—' }));
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

export function CardOverviewPage({ card, onBack, onEdit }: CardOverviewPageProps) {
  const { isDark } = useAppTheme();
  const inkColor = isDark ? '#F5F5F5' : '#0A0A0A';

  return (
    <View className="flex-1">
      <Pressable onPress={onBack} className="px-6 pt-5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>‹ Back</Text>
      </Pressable>

      <View className="flex-row items-center justify-between px-6 pt-3">
        <View className="flex-row items-center gap-2">
          <CardTypeIcon type={card.type} color={inkColor} size={18} />
          <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{card.type}</Text>
        </View>
        <ActionButton label="Edit Configuration" onPress={onEdit} />
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
          {'channelNames' in card.config ? 'Channels' : 'Controller Details'}
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
