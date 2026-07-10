import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import { cn } from '../../../lib/cn';
import { emptyConfigFor, isCardConfigured, type CardConfig, type CardNode, type CardType } from '../../../lib/rack';
import { ConfirmDialog } from '../ConfirmDialog';
import { CardActionsMenu, type CardActionsMenuState } from './CardActionsMenu';
import { CardConfigPage } from './CardConfigPage';
import { CardListView } from './CardListView';
import { CardOverviewPage } from './CardOverviewPage';
import { ChannelListView } from './ChannelListView';
import { InstallCardMenu, type InstallCardMenuState } from './InstallCardMenu';
import { RackFaceplate } from './RackFaceplate';

type ViewMode = 'visual' | 'cards' | 'channels';
type CardPageView = 'overview' | 'config';

type RackDetailProps = {
  device: DeviceNode;
  cards: CardNode[];
  onBack: () => void;
  onInstallCard: (slot: number, type: CardType, config: CardConfig, enabled: boolean) => void;
  onUpdateCard: (cardId: string, config: CardConfig, enabled: boolean) => void;
  onRemoveCard: (cardId: string) => void;
  canEditDeleteSchema: boolean;
};

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-full px-3 py-1.5', active && (isDark ? 'bg-ink' : 'bg-ink-inverse'))}
    >
      <Text className={cn('font-body-medium text-xs', active ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RackDetail({ device, cards, onBack, onInstallCard, onUpdateCard, onRemoveCard, canEditDeleteSchema }: RackDetailProps) {
  const { isDark } = useAppTheme();
  const [mode, setMode] = useState<ViewMode>('visual');
  const [installMenu, setInstallMenu] = useState<InstallCardMenuState | null>(null);
  const [cardMenu, setCardMenu] = useState<CardActionsMenuState | null>(null);
  const [cardPage, setCardPage] = useState<{ cardId: string; view: CardPageView } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CardNode | null>(null);
  const [stubNote, setStubNote] = useState<string | null>(null);

  const pageCard = cardPage ? cards.find((c) => c.id === cardPage.cardId) ?? null : null;

  if (cardPage && pageCard) {
    if (cardPage.view === 'overview') {
      return (
        <CardOverviewPage
          card={pageCard}
          onBack={() => setCardPage(null)}
          onEdit={() => setCardPage({ cardId: pageCard.id, view: 'config' })}
          canEditDeleteSchema={canEditDeleteSchema}
        />
      );
    }

    return (
      <CardConfigPage
        // Force a clean remount per card so internal state never lags behind
        // a changed cardType prop (which previously caused a crash switching
        // between card types across two different slots in one session).
        key={`${pageCard.id}-${pageCard.type}`}
        slot={pageCard.slot}
        cardType={pageCard.type}
        initialConfig={pageCard.config}
        initialEnabled={pageCard.enabled}
        onBack={() => setCardPage({ cardId: pageCard.id, view: isCardConfigured(pageCard) ? 'overview' : 'config' as CardPageView })}
        onSave={(config, enabled) => {
          onUpdateCard(pageCard.id, config, enabled);
          setCardPage({ cardId: pageCard.id, view: 'overview' });
        }}
      />
    );
  }

  return (
    <View className="flex-1">
      <Pressable onPress={onBack} className="px-6 pt-5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>‹ Devices</Text>
      </Pressable>

      <View className="flex-row items-center justify-between px-6 pt-3">
        <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{device.name}</Text>
        <View className={cn('flex-row rounded-full border p-1', isDark ? 'border-line-dark' : 'border-line-light')}>
          <ModeTab label="Visual Rack View" active={mode === 'visual'} onPress={() => setMode('visual')} />
          <ModeTab label="Card List View" active={mode === 'cards'} onPress={() => setMode('cards')} />
          <ModeTab label="Channel List View" active={mode === 'channels'} onPress={() => setMode('channels')} />
        </View>
      </View>

      {stubNote && (
        <View className="mx-6 mt-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2">
          <Text className="font-body text-xs text-status-warning">{stubNote}</Text>
        </View>
      )}

      <View className="flex-1">
        {mode === 'visual' && (
          <RackFaceplate
            cards={cards}
            editable={canEditDeleteSchema}
            onPressEmpty={(slot, x, y) => {
              if (canEditDeleteSchema) setInstallMenu({ slot, x, y });
            }}
            onPressCard={(card, x, y) => {
              if (canEditDeleteSchema) setCardMenu({ card, x, y });
            }}
          />
        )}
        {mode === 'cards' && <CardListView cards={cards} onOpenMenu={canEditDeleteSchema ? (card, x, y) => setCardMenu({ card, x, y }) : undefined} />}
        {mode === 'channels' && <ChannelListView cards={cards} />}
      </View>

      <InstallCardMenu
        state={installMenu}
        onClose={() => setInstallMenu(null)}
        onSelect={(slot, type) => onInstallCard(slot, type, emptyConfigFor(type), true)}
      />

      <CardActionsMenu
        state={cardMenu}
        onClose={() => setCardMenu(null)}
        onConfigure={(card) => setCardPage({ cardId: card.id, view: isCardConfigured(card) ? 'overview' : 'config' })}
        onViewChannels={() => setMode('channels')}
        onMoveCard={() => setStubNote('Move Card is coming in a later step.')}
        onReplaceCard={() => setStubNote('Replace Card is coming in a later step.')}
        onRunDiagnostics={() => setStubNote('Run Diagnostics is coming in a later step.')}
        onViewHistory={() => setStubNote('View History is coming in a later step.')}
        onRemoveCard={(card) => setRemoveTarget(card)}
        canEditDeleteSchema={canEditDeleteSchema}
      />

      <ConfirmDialog
        visible={removeTarget !== null}
        title="Remove Card"
        message={`Remove the card in slot ${removeTarget?.slot}? This cannot be undone.`}
        confirmLabel="Remove"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) onRemoveCard(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </View>
  );
}
