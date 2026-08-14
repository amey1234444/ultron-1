import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { normalizedCardConfig, type CardConfig, type CardType, type ControllerConfig, type ProcessConfig, type SpeedConfig, type VibrationConfig } from '../../../lib/rack';
import { cardConfigWithSimulation, simulationWithCardConfig, validateSimulatedChannel, type SimulatedChannel } from '../../../lib/simulation';
import { ActionButton } from '../ActionButton';
import { BackButton } from '../BackButton';
import { ControllerFields, EnabledToggle, ProcessFields, SpeedFields, VibrationFields } from './CardConfigFields';
import { SimulationFields } from './SimulationFields';

type CardConfigPageProps = {
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

export function CardConfigPage({ slot, cardType, initialConfig, initialEnabled, initialSimulation, backLabel = 'Back', onBack, onSave }: CardConfigPageProps) {
  const { isDark } = useAppTheme();
  const [form, setForm] = useState<{ config: CardConfig; enabled: boolean; simulation?: SimulatedChannel[] }>(() => {
    const normalized = normalizedCardConfig(cardType, initialConfig);
    return {
      config: initialSimulation?.length ? cardConfigWithSimulation(cardType, normalized, initialSimulation) : normalized,
      enabled: initialEnabled,
      simulation: initialSimulation,
    };
  });
  const { config, enabled, simulation } = form;
  const isSimulatedSignal = !!simulation?.length;
  const isExistingSignal = 'channelNames' in initialConfig && !!initialConfig.channelNames[0]?.trim();

  // Unit, range and alarm limits live on the card AND on the signal definition
  // of a simulated channel. Editing either side now updates the other, so a
  // value typed here is not silently replaced on save — which is exactly what
  // used to happen, and made the card's Unit field look read-only.
  const set = <K extends string>(key: K, value: string) =>
    setForm((previous) => {
      const nextConfig = { ...previous.config, [key]: value } as CardConfig;
      return {
        ...previous,
        config: nextConfig,
        simulation: previous.simulation ? simulationWithCardConfig(cardType, nextConfig, previous.simulation) : previous.simulation,
      };
    });
  const setChannelName = (index: number, value: string) =>
    setForm((previous) => {
      if (!('channelNames' in previous.config)) return previous;
      const channelNames = [...previous.config.channelNames];
      channelNames[index] = value;
      return { ...previous, config: { ...previous.config, channelNames } };
    });

  const canSave = (() => {
    if ('controllerName' in config) {
      return config.controllerName.trim().length > 0 && config.ip.trim().length > 0 && config.port.trim().length > 0;
    }
    if ('channelNames' in config) {
      if (!config.channelNames[0]?.trim()) return false;
      if (isSimulatedSignal && simulation) {
        return simulation.every((channel, index) => Object.keys(validateSimulatedChannel(channel, config.channelNames[index] ?? '')).length === 0);
      }
      return true;
    }
    return false;
  })();

  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  return (
    <View className="flex-1">
      <View className="px-6 pt-5">
        <BackButton label={backLabel} onPress={onBack} />
      </View>

      <View className="px-6 pt-3">
        <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>Configure {cardType}</Text>
        <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Slot {slot}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 py-5" style={{ maxWidth: 480 }}>
        {!isSimulatedSignal && cardType === 'Vibration Card' && <VibrationFields config={config as VibrationConfig} set={set} setChannelName={setChannelName} />}
        {!isSimulatedSignal && cardType === 'Process Card' && <ProcessFields config={config as ProcessConfig} set={set} setChannelName={setChannelName} />}
        {!isSimulatedSignal && cardType === 'Speed Card' && <SpeedFields config={config as SpeedConfig} set={set} setChannelName={setChannelName} />}
        {cardType === 'Communication Controller' && <ControllerFields config={config as ControllerConfig} set={set} />}

        {!isSimulatedSignal && <EnabledToggle enabled={enabled} onChange={(next) => setForm((previous) => ({ ...previous, enabled: next }))} />}

        {isSimulatedSignal && simulation && (
          <SimulationFields
            cardType={cardType}
            config={config}
            cardEnabled={enabled}
            channels={simulation}
            onCardEnabledChange={(next) => setForm((previous) => ({ ...previous, enabled: next }))}
            onConfigChange={(next) => setForm((previous) => ({ ...previous, config: next }))}
            onChange={(channels) => {
              setForm((previous) => ({
                ...previous,
                simulation: channels,
                config: cardConfigWithSimulation(cardType, previous.config, channels),
              }));
            }}
          />
        )}
      </ScrollView>

      <View className={cn('flex-row justify-end gap-3 border-t px-6 py-4', lineClass)}>
        <ActionButton label="Cancel" variant="secondary" onPress={onBack} />
        <ActionButton
          label={isSimulatedSignal ? `Save & ${isExistingSignal ? 'update' : 'start'} simulation` : 'Save'}
          // Both sides are already in step (see `set` above), so saving stores
          // what is on screen rather than overwriting it from the signal.
          onPress={() => canSave && onSave(config, enabled, simulation)}
          disabled={!canSave}
        />
      </View>
    </View>
  );
}
