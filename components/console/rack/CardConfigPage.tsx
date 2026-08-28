import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  channelCountForCardType,
  normalizedCardConfig,
  type CardConfig,
  type CardType,
  type ChannelCommonConfig,
  type ControllerConfig,
} from '../../../lib/rack';
import { cardConfigWithSimulation, simulationWithCardConfig, validateSimulatedChannel, type SimulatedChannel } from '../../../lib/simulation';
import { ActionButton } from '../ActionButton';
import { BackButton } from '../BackButton';
import { ChannelConfigFields, ControllerFields, EnabledToggle, channelConfigErrors, channelValueError } from './CardConfigFields';

type CardConfigPageProps = {
  /** Rack name, shown in the page header alongside slot, card type and channel. */
  rackName?: string;
  slot: number;
  cardType: CardType;
  initialConfig: CardConfig;
  initialEnabled: boolean;
  /** Present only for a card in a simulated rack — one entry per channel. */
  initialSimulation?: SimulatedChannel[];
  backLabel?: string;
  onBack: () => void;
  onSave: (config: CardConfig, enabled: boolean, simulation?: SimulatedChannel[]) => void;
};

/** The page title each card family gets, matching the hardware it stands for. */
const EDITOR_TITLE: Record<CardType, string> = {
  'Vibration Card': 'Vibration Channel Configuration',
  'RTD Card': 'RTD Channel Configuration',
  'Universal V/I Card': 'Universal V/I Channel Configuration',
  'Process Card': 'Universal V/I Channel Configuration',
  'Speed Card': 'Speed Channel Configuration',
  'Communication Controller': 'Configure Communication Controller',
};

const CONTEXT_CARD_LABEL: Record<CardType, string> = {
  'Vibration Card': 'Vibration',
  'RTD Card': 'RTD',
  'Universal V/I Card': 'Universal V/I',
  'Process Card': 'Universal V/I',
  'Speed Card': 'Speed',
  'Communication Controller': 'Controller',
};

export function CardConfigPage({ rackName, slot, cardType, initialConfig, initialEnabled, initialSimulation, backLabel = 'Back', onBack, onSave }: CardConfigPageProps) {
  const { isDark } = useAppTheme();
  const [form, setForm] = useState<{ config: CardConfig; enabled: boolean; simulation?: SimulatedChannel[] }>(() => {
    const normalized = normalizedCardConfig(cardType, initialConfig);
    const config = initialSimulation?.length ? cardConfigWithSimulation(cardType, normalized, initialSimulation) : normalized;
    return {
      config,
      enabled: initialEnabled,
      simulation: initialSimulation?.length ? simulationWithCardConfig(cardType, config, initialSimulation) : initialSimulation,
    };
  });
  const { config, enabled, simulation } = form;
  const isAcquisitionCard = channelCountForCardType(cardType) > 0;
  const channelConfig = isAcquisitionCard ? (config as ChannelCommonConfig) : null;

  const set = <K extends string>(key: K, value: string) =>
    setForm((previous) => ({ ...previous, config: { ...previous.config, [key]: value } as CardConfig }));

  const setChannelName = (index: number, value: string) =>
    setForm((previous) => {
      if (!('channelNames' in previous.config)) return previous;
      const channelNames = [...previous.config.channelNames];
      channelNames[index] = value;
      return { ...previous, config: { ...previous.config, channelNames } };
    });

  // The card is where an engineer types, so a card edit always flows into the
  // signal definition the generator runs — never the other way round while the
  // page is open. Echoing back would rewrite the text still being typed.
  const setChannelConfig = (nextConfig: ChannelCommonConfig) =>
    setForm((previous) => ({
      ...previous,
      config: nextConfig as CardConfig,
      simulation: previous.simulation ? simulationWithCardConfig(cardType, nextConfig as CardConfig, previous.simulation) : previous.simulation,
    }));

  // The knob panel edits only the signal definition — value, behaviour, output
  // state, measurement type, cadence — none of which the card config derives
  // from, so nothing needs to flow back.
  const setPrimaryChannel = (channel: SimulatedChannel) =>
    setForm((previous) => {
      if (!previous.simulation?.length) return previous;
      return { ...previous, simulation: previous.simulation.map((entry, index) => (index === 0 ? channel : entry)) };
    });

  const canSave = (() => {
    if ('controllerName' in config) {
      return config.controllerName.trim().length > 0 && config.ip.trim().length > 0 && config.port.trim().length > 0;
    }
    if (!channelConfig) return false;
    // The card's own rules always apply. When a signal is attached, the knob's
    // value and the generator's own bounds have to hold as well — both sides are
    // checked rather than one standing in for the other.
    if (Object.keys(channelConfigErrors(cardType, channelConfig)).length > 0) return false;
    const channel = simulation?.[0];
    if (channel && channel.behaviour === 'Manual' && channelValueError(channelConfig, channel.manualValue)) return false;
    if (simulation) {
      return simulation.every((entry, index) => Object.keys(validateSimulatedChannel(entry, channelConfig.channelNames[index] ?? '')).length === 0);
    }
    return true;
  })();

  /**
   * Saves the configuration as typed, with the free-text fields trimmed.
   *
   * A trailing space in a unit is invisible in the field and then shows up
   * beside every reading on every screen that renders the channel.
   */
  const save = () => {
    if (!canSave) return;
    let nextConfig = config;
    if ('channelNames' in nextConfig) {
      nextConfig = { ...nextConfig, channelNames: nextConfig.channelNames.map((name) => name.trim()) } as CardConfig;
    }
    if ('unit' in nextConfig && typeof nextConfig.unit === 'string') {
      nextConfig = { ...nextConfig, unit: nextConfig.unit.trim() } as CardConfig;
    }
    if ('tag' in nextConfig) {
      nextConfig = { ...nextConfig, tag: nextConfig.tag.trim() } as CardConfig;
    }
    onSave(nextConfig, enabled, simulation ? simulationWithCardConfig(cardType, nextConfig, simulation) : simulation);
  };

  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const pageClass = isDark ? 'bg-surface-dark' : 'bg-surface-light';
  const footerClass = isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel';

  const contextPill = (label: string, value: string) => (
    <View key={label} className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}>
      <Text className={cn('font-mono text-[9px] uppercase tracking-[0.16em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn('mt-0.5 font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
    </View>
  );

  return (
    <View className={cn('flex-1', pageClass)}>
      <View className="px-6 pt-5">
        <BackButton label={backLabel} onPress={onBack} />
      </View>

      <View className="px-6 pt-3">
        <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{EDITOR_TITLE[cardType]}</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {rackName ? contextPill('Rack', rackName) : null}
          {contextPill('Slot', `Slot-${String(slot).padStart(2, '0')}`)}
          {contextPill('Card Type', CONTEXT_CARD_LABEL[cardType])}
          {isAcquisitionCard && contextPill('Channel', 'CH-01')}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 py-5">
        {channelConfig && (
          <ChannelConfigFields
            type={cardType}
            config={channelConfig}
            setChannelName={setChannelName}
            setConfig={setChannelConfig}
            channel={simulation?.[0]}
            onChannelChange={setPrimaryChannel}
          />
        )}
        {cardType === 'Communication Controller' && <ControllerFields config={config as ControllerConfig} set={set} />}

        <EnabledToggle enabled={enabled} onChange={(next) => setForm((previous) => ({ ...previous, enabled: next }))} />
      </ScrollView>

      <View className={cn('flex-row flex-wrap justify-end gap-3 border-t px-6 py-4', lineClass, footerClass)}>
        <ActionButton label="Cancel" variant="secondary" onPress={onBack} />
        {isAcquisitionCard && <ActionButton label="Save" variant="secondary" onPress={save} disabled={!canSave} />}
        <ActionButton
          label={isAcquisitionCard ? 'Save & Upload' : 'Save'}
          // Both sides are already in step, so saving stores what is on screen
          // rather than overwriting it from the signal definition.
          onPress={save}
          disabled={!canSave}
        />
      </View>
    </View>
  );
}
