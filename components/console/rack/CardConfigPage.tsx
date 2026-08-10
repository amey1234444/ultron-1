import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { CardConfig, CardType, ControllerConfig, ProcessConfig, SpeedConfig, VibrationConfig } from '../../../lib/rack';
import { cardConfigWithSimulation, type SimulatedChannel } from '../../../lib/simulation';
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
  const [config, setConfig] = useState<CardConfig>(initialConfig);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [simulation, setSimulation] = useState<SimulatedChannel[] | undefined>(initialSimulation);

  const set = <K extends string>(key: K, value: string) => setConfig((prev) => ({ ...prev, [key]: value }));
  const setChannelName = (index: number, value: string) =>
    setConfig((prev) => {
      if (!('channelNames' in prev)) return prev;
      const channelNames = [...prev.channelNames];
      channelNames[index] = value;
      return { ...prev, channelNames };
    });

  const canSave = (() => {
    if ('controllerName' in config) {
      return config.controllerName.trim().length > 0 && config.ip.trim().length > 0 && config.port.trim().length > 0;
    }
    if ('channelNames' in config) {
      return config.channelNames[0]?.trim().length > 0;
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
        {cardType === 'Vibration Card' && <VibrationFields config={config as VibrationConfig} set={set} setChannelName={setChannelName} />}
        {cardType === 'Process Card' && <ProcessFields config={config as ProcessConfig} set={set} setChannelName={setChannelName} />}
        {cardType === 'Speed Card' && <SpeedFields config={config as SpeedConfig} set={set} setChannelName={setChannelName} />}
        {cardType === 'Communication Controller' && <ControllerFields config={config as ControllerConfig} set={set} />}

        <EnabledToggle enabled={enabled} onChange={setEnabled} />

        {simulation && (
          <SimulationFields
            cardType={cardType}
            channelNames={'channelNames' in config ? config.channelNames : []}
            channels={simulation}
            onChange={setSimulation}
          />
        )}
      </ScrollView>

      <View className={cn('flex-row justify-end gap-3 border-t px-6 py-4', lineClass)}>
        <ActionButton label="Cancel" variant="secondary" onPress={onBack} />
        <ActionButton
          label="Save"
          onPress={() => canSave && onSave(simulation ? cardConfigWithSimulation(cardType, config, simulation) : config, enabled, simulation)}
          disabled={!canSave}
        />
      </View>
    </View>
  );
}
