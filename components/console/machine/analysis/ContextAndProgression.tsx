import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { CONDITION_HEX, CONDITION_LABEL, type OverallState, type ProgressionEvent } from '../../../../lib/analysisOverview';
import { MetricBox } from './StatusStrip';

// How the machine is being run, next to what condition it is in.
//
// These two are shown together precisely because they are different: a machine
// running normally can be in danger, and a stopped machine can be perfectly
// healthy. Putting them side by side is what stops a reader collapsing "it is
// running" into "it is fine".
export function OperatingContext({
  state,
  operatingState,
  speed,
  load,
  mode,
  lastData,
}: {
  state: OverallState;
  operatingState: string;
  speed?: string;
  load?: string;
  mode?: string;
  lastData: { label: string; healthy: boolean };
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  return (
    <View className="gap-3">
      <View>
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Operating context</Text>
        <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>
          OPERATING STATE IS NOT MACHINE CONDITION
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <MetricBox label="OPERATING STATE" value={operatingState} />
        <MetricBox label="MACHINE CONDITION" value={CONDITION_LABEL[state.condition]} condition={state.condition} />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {/* Absent values say so. Showing 0 rpm for an unreported speed would be a
            measurement the machine never made. */}
        <MetricBox label="SPEED" value={speed ?? 'NO DATA'} condition={speed ? undefined : 'offline'} />
        <MetricBox label="LOAD" value={load ?? 'NO DATA'} condition={load ? undefined : 'offline'} />
        <MetricBox label="MODE" value={mode ?? 'NO DATA'} condition={mode ? undefined : 'offline'} />
        <MetricBox label="LAST DATA" value={lastData.label} condition={lastData.healthy ? 'healthy' : 'alert'} />
      </View>
    </View>
  );
}

// How this got here, in a handful of steps. Not an event log — a full event and
// history workspace belongs in Advanced Diagnosis, and putting one here would bury
// the four moments that actually describe the escalation.
export function FaultProgression({ events }: { events: ProgressionEvent[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  return (
    <View className="gap-3">
      <View>
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Fault progression</Text>
        <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>ESCALATION, NOT AN EVENT LOG</Text>
      </View>

      {events.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>
          No progression recorded. Nothing has changed condition on this machine.
        </Text>
      ) : (
        <View>
          {events.map((event, index) => (
            <View
              key={event.id}
              className="flex-row gap-3 py-2.5"
              style={index > 0 ? { borderTopWidth: 1, borderTopColor: hairline } : undefined}
            >
              <Text style={{ width: 54 }} className={cn('font-mono text-[10px]', mutedClass)}>
                {event.at}
              </Text>

              <View className="items-center" style={{ width: 8 }}>
                <View
                  style={{ width: 7, height: 7, borderRadius: 4, marginTop: 4, backgroundColor: CONDITION_HEX[event.condition] }}
                />
                {index < events.length - 1 ? <View style={{ width: 1, flex: 1, marginTop: 3, backgroundColor: hairline }} /> : null}
              </View>

              <Text className={cn('flex-1 font-body text-[11px] leading-[16px]', inkClass)}>{event.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Progressive disclosure, made explicit. A reader who has understood the overview
// should be able to see what the next depth would tell them and choose to go
// there, rather than discovering it by clicking a tab labelled with one word.
export function GoDeeper({
  onOpenDiagnosis,
  onOpenAdvanced,
  advancedAvailable = true,
}: {
  onOpenDiagnosis?: () => void;
  onOpenAdvanced?: () => void;
  advancedAvailable?: boolean;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  const card = (
    eyebrow: string,
    title: string,
    chain: string,
    onPress?: () => void,
    available = true,
  ) => (
    <Pressable
      onPress={available ? onPress : undefined}
      disabled={!available || !onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${title}`}
      style={{ flexGrow: 1, flexBasis: 300, minWidth: 260, borderColor: hairline }}
      className={cn('gap-2 rounded-xl border px-3.5 py-3', !available && 'opacity-50')}
    >
      <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">{eyebrow}</Text>
      <Text className={cn('font-body-bold text-[13px] leading-[18px]', inkClass)}>{title}</Text>
      <Text className={cn('font-mono text-[9px] leading-[14px]', mutedClass)}>{chain}</Text>
      {!available ? <Text className={cn('font-body text-[10px] italic', mutedClass)}>Not available yet</Text> : null}
    </Pressable>
  );

  return (
    <View className="gap-3">
      <View>
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Go deeper</Text>
        <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>PROGRESSIVE DISCLOSURE</Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {card(
          'DIAGNOSIS',
          'Why each issue is being reported, and what to do about it.',
          'Symptoms → Evidence → Possible causes → Best explanation → Impact → Action → Verification',
          onOpenDiagnosis,
        )}
        {card(
          'ADVANCED DIAGNOSIS',
          'Signal-level evidence for one measurement point.',
          'Trend → Waveform → FFT → Envelope → Orders → Correlation → Events',
          onOpenAdvanced,
          advancedAvailable,
        )}
      </View>
    </View>
  );
}
