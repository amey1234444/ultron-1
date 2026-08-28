import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import { cn } from '../../../lib/cn';
import { emptyConfigFor, isCardConfigured, type CardConfig, type CardNode, type CardType } from '../../../lib/rack';
import { isSimulatedDevice, simulationForCard, type SimulatedChannel } from '../../../lib/simulation';
import { BackButton } from '../BackButton';
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

// Tab order is also motion direction: moving right in this list means the
// outgoing view leaves left and the incoming one enters from the right, so the
// three modes read as one object turning rather than three screens swapping.
const MODE_ORDER: ViewMode[] = ['visual', 'cards', 'channels'];
const MODE_LABEL: Record<ViewMode, string> = {
  visual: 'Visual Rack View',
  cards: 'Card List View',
  channels: 'Channel List View',
};

// The web build has no native animation driver (react-native-web runs Animated
// on the JS thread), and asking for one there logs a warning on every switch.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// Deliberately brief: this is a view an operator flips between all shift.
const EXIT_MS = 90;
const ENTER_MS = 150;
const TAB_MS = 220;
const TRAVEL = 12;

/**
 * Whether the OS/browser is asking for reduced motion.
 *
 * Subscribed rather than read once, so toggling the setting takes effect without
 * a reload — on react-native-web this is backed by the
 * `prefers-reduced-motion: reduce` media query.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        // An environment without the capability simply keeps motion on.
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

function ModeTabs({ mode, onSelect, reduced }: { mode: ViewMode; onSelect: (mode: ViewMode) => void; reduced: boolean }) {
  const { isDark } = useAppTheme();
  // Every tab is sized to the widest label, which makes the active pill a fixed
  // width that can slide on translateX alone — no animated width, no layout.
  const [widths, setWidths] = useState<number[]>(() => MODE_ORDER.map(() => 0));
  const indicatorX = useRef(new Animated.Value(0)).current;

  const tabWidth = widths.every((width) => width > 0) ? Math.max(...widths) : 0;
  const index = MODE_ORDER.indexOf(mode);

  useEffect(() => {
    if (tabWidth === 0) return;
    const target = index * tabWidth;
    if (reduced) {
      indicatorX.setValue(target);
      return;
    }
    Animated.timing(indicatorX, {
      toValue: target,
      duration: TAB_MS,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [index, tabWidth, reduced, indicatorX]);

  // Applying the max width back to every tab is a stable fixed point: each tab
  // then measures at exactly that width, so this settles after one extra pass.
  const handleLayout = (position: number) => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setWidths((previous) =>
      Math.abs((previous[position] ?? 0) - width) < 1 ? previous : previous.map((value, i) => (i === position ? width : value)),
    );
  };

  return (
    <View className={cn('flex-row rounded-full border p-1', isDark ? 'border-line-dark' : 'border-line-light')}>
      <View className="flex-row">
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: tabWidth,
              transform: [{ translateX: indicatorX }],
            }}
          >
            {/* Colour stays in a className so the palette lives in one place;
                the Animated wrapper carries only the transform. */}
            <View className={cn('flex-1 rounded-full', isDark ? 'bg-ink' : 'bg-ink-inverse')} />
          </Animated.View>
        )}

        {MODE_ORDER.map((value, position) => {
          const active = mode === value;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              onLayout={handleLayout(position)}
              style={tabWidth > 0 ? { width: tabWidth } : undefined}
              className="items-center rounded-full px-3 py-1.5"
            >
              <Text
                className={cn(
                  'font-body-medium text-xs',
                  active ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
                )}
              >
                {MODE_LABEL[value]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type RackDetailProps = {
  device: DeviceNode;
  devices?: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  onBack: () => void;
  backLabel?: string;
  onInstallCard: (slot: number, type: CardType, config: CardConfig, enabled: boolean) => void;
  onUpdateCard: (cardId: string, config: CardConfig, enabled: boolean, simulation?: SimulatedChannel[]) => void;
  onRemoveCard: (cardId: string) => void;
  canEditDeleteSchema: boolean;
};

export function RackDetail({ device, devices = [device], cards, live, onBack, backLabel = 'Back', onInstallCard, onUpdateCard, onRemoveCard, canEditDeleteSchema }: RackDetailProps) {
  const { isDark } = useAppTheme();
  const [mode, setMode] = useState<ViewMode>('visual');
  const [installMenu, setInstallMenu] = useState<InstallCardMenuState | null>(null);
  const [cardMenu, setCardMenu] = useState<CardActionsMenuState | null>(null);
  const [cardPage, setCardPage] = useState<{ cardId: string; view: CardPageView } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CardNode | null>(null);
  const [stubNote, setStubNote] = useState<string | null>(null);

  const reduced = useReducedMotion();
  // `mode` is where we are going; `renderedMode` is what is on screen. They
  // differ only for the ~90ms the outgoing view takes to leave.
  const [renderedMode, setRenderedMode] = useState<ViewMode>(mode);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  // Leave. Driven by an effect on `mode` rather than by the tab press handler so
  // that every route into a mode change animates — including CardActionsMenu's
  // "View Channels", which calls setMode directly.
  useEffect(() => {
    if (mode === renderedMode) return;
    if (reduced) {
      setRenderedMode(mode);
      return;
    }
    const direction = MODE_ORDER.indexOf(mode) > MODE_ORDER.indexOf(renderedMode) ? 1 : -1;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateX, {
        toValue: -direction * TRAVEL,
        duration: EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(({ finished }) => {
      // Interrupted means a third tab was pressed mid-flight; this effect reruns
      // for the newer target rather than swapping to a stale one.
      if (!finished) return;
      translateX.setValue(direction * TRAVEL);
      setRenderedMode(mode);
    });
  }, [mode, renderedMode, reduced, opacity, translateX]);

  // Enter. Under reduced motion this is the whole transition: the view still
  // changes, it just arrives already in place instead of travelling.
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: ENTER_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [renderedMode, reduced, opacity, translateX]);

  const effectiveDevice = deviceWithGatewayConnectionState(device, devices);
  const pageCard = cardPage ? cards.find((c) => c.id === cardPage.cardId) ?? null : null;

  if (cardPage && pageCard) {
    if (cardPage.view === 'overview') {
      return (
        <CardOverviewPage
          card={pageCard}
          rack={effectiveDevice}
          devices={devices}
          live={live}
          backLabel={`Back to ${effectiveDevice.name}`}
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
        rackName={effectiveDevice.name}
        slot={pageCard.slot}
        cardType={pageCard.type}
        initialConfig={pageCard.config}
        initialEnabled={pageCard.enabled}
        initialSimulation={isSimulatedDevice(device) ? simulationForCard(pageCard) : undefined}
        // A card that has never been configured has no overview to fall back to
        // (Configure opens the form directly), so leaving the form must return
        // to the rack — sending it back to 'config' left the page on itself and
        // made Back and Cancel dead.
        backLabel={isCardConfigured(pageCard) ? 'Back to Card' : `Back to ${effectiveDevice.name}`}
        onBack={() => setCardPage(isCardConfigured(pageCard) ? { cardId: pageCard.id, view: 'overview' } : null)}
        onSave={(config, enabled, simulation) => {
          onUpdateCard(pageCard.id, config, enabled, simulation);
          setCardPage({ cardId: pageCard.id, view: 'overview' });
        }}
        onSimulationPreview={(config, enabled, simulation) => {
          onUpdateCard(pageCard.id, config, enabled, simulation);
        }}
      />
    );
  }

  return (
    <View className="flex-1">
      <View className="px-6 pt-5">
        <BackButton label={backLabel} onPress={onBack} />
      </View>

      <View className="flex-row items-center justify-between px-6 pt-3">
        <View>
          <View className="flex-row items-center gap-2">
            <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{effectiveDevice.name}</Text>
            {isSimulatedDevice(effectiveDevice) && (
              <View className="rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5">
                <Text className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">Simulated</Text>
              </View>
            )}
          </View>
          <Text className={cn('mt-1 font-mono text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            rack_id: {effectiveDevice.realRackId ?? '-'}
          </Text>
        </View>
        <ModeTabs mode={mode} onSelect={setMode} reduced={reduced} />
      </View>

      {stubNote && (
        <View className="mx-6 mt-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2">
          <Text className="font-body text-xs text-status-warning">{stubNote}</Text>
        </View>
      )}

      <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>
        {renderedMode === 'visual' && (
          <RackFaceplate
            device={effectiveDevice}
            cards={cards}
            live={live}
            editable={canEditDeleteSchema}
            onPressEmpty={(slot, x, y) => {
              if (canEditDeleteSchema) setInstallMenu({ slot, x, y });
            }}
            onPressCard={(card, x, y) => {
              if (canEditDeleteSchema) setCardMenu({ card, x, y });
            }}
          />
        )}
        {renderedMode === 'cards' && (
          <CardListView
            cards={cards}
            device={effectiveDevice}
            live={live}
            onOpenMenu={canEditDeleteSchema ? (card, x, y) => setCardMenu({ card, x, y }) : undefined}
          />
        )}
        {renderedMode === 'channels' && <ChannelListView device={effectiveDevice} cards={cards} live={live} />}
      </Animated.View>

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
