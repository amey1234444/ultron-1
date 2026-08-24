import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { formatRul, LEVEL_HEX } from '../../../../lib/condition';
import { ComponentTypeIcon } from '../machineIcons';
import type { ComponentSummary } from './rollup';

// The monitored mechanical train, in the order the machine template defines it —
// motor, coupling, driven element — with each element's condition beside it. The
// connector between rows is the point: a bearing problem on the motor and one on
// the driven end are different conversations, and the chain is what makes the
// list read as one machine rather than five unrelated scores.

// GOOD / WATCH / ALERT / DANGER. WATCH exists because "normal" covers a wide
// range: a component at 98 and one at 72 are both inside their limits, but only
// one of them is worth looking at again next week.
const WATCH_BELOW = 85;

type Verdict = 'GOOD' | 'WATCH' | 'ALERT' | 'DANGER';

function verdictFor(summary: ComponentSummary): Verdict {
  if (summary.level === 'danger') return 'DANGER';
  if (summary.level === 'alert') return 'ALERT';
  return summary.health !== null && summary.health < WATCH_BELOW ? 'WATCH' : 'GOOD';
}

const VERDICT_HEX: Record<Verdict, string> = {
  GOOD: LEVEL_HEX.normal,
  WATCH: LEVEL_HEX.alert,
  ALERT: LEVEL_HEX.alert,
  DANGER: LEVEL_HEX.danger,
};

export function MachineTrain({ summaries }: { summaries: ComponentSummary[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const connector = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)';

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Machine train</Text>
        <Text className={cn('font-body text-[10px]', mutedClass)}>score · to limit</Text>
      </View>

      {summaries.length === 0 ? (
        <Text className={cn('font-body text-xs italic', mutedClass)}>This machine template defines no components.</Text>
      ) : (
        <View>
          {summaries.map((summary, index) => {
            const monitored = summary.points.length > 0;
            const verdict = verdictFor(summary);
            const colour = monitored ? VERDICT_HEX[verdict] : '#737373';
            const percent = summary.health === null ? 0 : Math.max(0, Math.min(100, summary.health));
            const isTrain = summary.type !== 'Unattributed';

            return (
              <View key={summary.componentId ?? 'unattributed'} className="flex-row">
                {/* Connector rail. The unattributed bucket is not part of the
                    train, so it does not get one. */}
                <View style={{ width: 18 }} className="items-center">
                  {isTrain && index > 0 && <View style={{ width: 1, height: 10, backgroundColor: connector }} />}
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      borderWidth: 1.5,
                      borderColor: colour,
                      backgroundColor: isDark ? '#0B0B0C' : '#FFFFFF',
                      marginTop: isTrain && index > 0 ? 0 : 10,
                    }}
                  />
                  {isTrain && index < summaries.length - 1 && (
                    <View style={{ width: 1, flex: 1, minHeight: 12, backgroundColor: connector }} />
                  )}
                </View>

                <View className="flex-1 gap-1 pb-3 pl-1">
                  <View className="flex-row items-center gap-2">
                    {summary.type !== 'Unattributed' ? (
                      <ComponentTypeIcon type={summary.type} color={isDark ? '#F5F5F5' : '#0A0A0A'} size={15} />
                    ) : (
                      <View style={{ width: 15 }} />
                    )}

                    <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[12px]', inkClass)}>
                      {summary.label}
                    </Text>

                    {monitored ? (
                      <>
                        <Text style={{ color: colour }} className="font-mono text-[12px] font-bold tabular-nums">
                          {summary.health === null ? '--' : Math.round(summary.health)}
                        </Text>
                        <Text style={{ color: colour }} className="w-14 text-right font-mono text-[8px] font-bold tracking-wider">
                          {verdict}
                        </Text>
                        <Text className={cn('w-11 text-right font-mono text-[9px] tabular-nums', mutedClass)}>
                          {formatRul(summary.soonestRulDays)}
                        </Text>
                      </>
                    ) : (
                      /* A component with nothing mapped has no condition. Saying so
                         matters: an unmonitored element silently scoring 100 would
                         be the most dangerous number on the page. */
                      <Text className={cn('font-body text-[10px] italic', mutedClass)}>not monitored</Text>
                    )}
                  </View>

                  {monitored && (
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: track }} className="w-full overflow-hidden">
                      <View style={{ height: 5, borderRadius: 3, width: `${percent}%`, backgroundColor: colour }} />
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
