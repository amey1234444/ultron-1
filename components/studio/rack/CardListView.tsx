import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { channelCountForCardType, slotKind, type CardNode } from '../../../lib/rack';
import { CardTypeIcon } from './cardIcons';

type CardListViewProps = {
  cards: CardNode[];
  onOpenMenu: (card: CardNode, x: number, y: number) => void;
};

function labelFor(card: CardNode): string {
  if ('channelNames' in card.config) {
    const names = card.config.channelNames.filter(Boolean);
    return names.length > 0 ? names.join(', ') : '—';
  }
  if ('controllerName' in card.config) return card.config.controllerName || '—';
  return '—';
}

export function CardListView({ cards, onOpenMenu }: CardListViewProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const sorted = [...cards].sort((a, b) => a.slot - b.slot);

  if (sorted.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-10">
        <Text className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          No cards installed yet. Switch to Visual Rack View to install one.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 py-5">
      <View className={cn('flex-row items-center gap-3 border-b px-4 pb-3 mb-3', lineClass)}>
        {['Slot', 'Card Type', 'Name', 'Status', ''].map((h, i) => (
          <Text
            key={h + i}
            style={{ flex: i === 0 ? 0.5 : i === 4 ? 0.3 : 1 }}
            className={cn('font-body-medium text-[11px] uppercase tracking-wider', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}
          >
            {h}
          </Text>
        ))}
      </View>

      {sorted.map((card) => (
        <Pressable
          key={card.id}
          onPress={(e) => onOpenMenu(card, e.nativeEvent.pageX, e.nativeEvent.pageY)}
          className={cn('mb-2 flex-row items-center gap-3 rounded-xl border px-4 py-3', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
        >
          <Text style={{ flex: 0.5 }} className={cn('font-mono text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {card.slot}
          </Text>
          <View style={{ flex: 1 }} className="flex-row items-center gap-2">
            <CardTypeIcon type={card.type} color={isDark ? '#F5F5F5' : '#0A0A0A'} size={16} />
            <Text numberOfLines={1} className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {card.type}
            </Text>
          </View>
          <Text style={{ flex: 1 }} numberOfLines={1} className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {labelFor(card)}
          </Text>
          <View style={{ flex: 1 }} className="flex-row items-center gap-1.5">
            <View className={cn('h-1.5 w-1.5 rounded-full', card.enabled ? 'bg-status-success' : 'bg-ink-muted')} />
            <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              {card.enabled ? 'Active' : 'Disabled'} · {slotKind(card.slot)} · {channelCountForCardType(card.type)} ch
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
