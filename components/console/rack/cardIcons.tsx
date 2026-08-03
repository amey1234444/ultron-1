import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { CardType } from '../../../lib/rack';

export const CARD_TYPE_ICON: Record<CardType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'Vibration Card': 'vibrate',
  'Process Card': 'gauge',
  'Speed Card': 'speedometer',
  'Communication Controller': 'expansion-card-variant',
};

export function CardTypeIcon({ type, color, size = 18 }: { type: CardType; color: string; size?: number }) {
  return <MaterialCommunityIcons name={CARD_TYPE_ICON[type]} size={size} color={color} />;
}
