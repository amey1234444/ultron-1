import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { channelCountForCardType, type CardNode } from '../../../lib/rack';

type ChannelListViewProps = {
  cards: CardNode[];
};

function channelLabelsFor(card: CardNode): string[] {
  if ('channelNames' in card.config) {
    return card.config.channelNames.map((name, index) => name || `${card.type} (unnamed CH${index + 1})`);
  }
  return [card.type];
}

export function ChannelListView({ cards }: ChannelListViewProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const rows = [...cards]
    .filter((c) => channelCountForCardType(c.type) > 0)
    .sort((a, b) => a.slot - b.slot)
    .flatMap((card) =>
      channelLabelsFor(card).map((label, index) => ({
        id: `S${String(card.slot).padStart(2, '0')}.CH${index + 1}`,
        card,
        label,
      })),
    );

  if (rows.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-10">
        <Text className={cn('font-body text-sm', mutedClass)}>No channels yet — install an acquisition card first.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 py-5">
      <View className={cn('flex-row items-center gap-3 border-b px-4 pb-3 mb-3', lineClass)}>
        {['Channel', 'Sensor', 'Status', 'Mapped Point'].map((h) => (
          <Text key={h} style={{ flex: 1 }} className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>
            {h}
          </Text>
        ))}
      </View>

      {rows.map(({ id, label }) => (
        <View
          key={id}
          className={cn('mb-2 flex-row items-center gap-3 rounded-xl border px-4 py-3', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
        >
          <Text style={{ flex: 1 }} className={cn('font-mono text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {id}
          </Text>
          <Text style={{ flex: 1 }} numberOfLines={1} className={cn('font-body text-sm', mutedClass)}>
            {label}
          </Text>
          <Text style={{ flex: 1 }} className={cn('font-body text-sm italic', mutedClass)}>
            Unmapped
          </Text>
          <Text style={{ flex: 1 }} className={cn('font-body text-sm', mutedClass)}>
            —
          </Text>
        </View>
      ))}
    </View>
  );
}
