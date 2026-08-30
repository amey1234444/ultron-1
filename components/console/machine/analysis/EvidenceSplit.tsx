import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { severityHexes, type AnalysisCounts } from '../../../../lib/analysisDiagnosis';

const CHAIN_HEX = '#8A8A8A';

// The one thing this page most needs to say, said before anything else: of the
// rules that fired, how many describe the machine and how many describe the
// instrument measuring it.
//
// In the design this replaces the answer existed — three of the rules on the
// worst signal were chain rules — but it was recoverable only by opening a group
// and reading rule codes, while the banner asserted "sensor cause suspected" with
// nothing on screen to support it. A reader who trusts the assertion does not need
// this; a reader who wants to check it could not.
export function EvidenceSplit({ counts, unverifiedCount }: { counts: AnalysisCounts; unverifiedCount: number }) {
  const { isDark } = useAppTheme();
  const severityHex = severityHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const track = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  const total = counts.totalRules;
  const machineShare = total === 0 ? 0 : (counts.machineRules / total) * 100;
  const chainShare = total === 0 ? 0 : (counts.chainRules / total) * 100;
  const chainDominant = counts.chainRules > counts.machineRules;
  // Machine rules whose signal is not itself in doubt — the evidence that survives.
  const standing = counts.machineRules - counts.machineRulesOnUnverifiedSignals;

  return (
    <View className="gap-3">
      <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>What the evidence is about</Text>

      {total === 0 ? (
        <Text className={cn('font-body text-[12.5px] italic', mutedClass)}>No rules have fired.</Text>
      ) : (
        <>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: track }} className="w-full flex-row overflow-hidden">
            <View style={{ width: `${machineShare}%`, backgroundColor: severityHex.fault }} />
            <View style={{ width: `${chainShare}%`, backgroundColor: CHAIN_HEX }} />
          </View>

          <View className="flex-row flex-wrap gap-x-6 gap-y-2">
            <View className="gap-0.5">
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: severityHex.fault }} />
                <Text className={cn('font-mono text-[10.5px] tracking-wider', mutedClass)}>MACHINE</Text>
              </View>
              <Text className={cn('font-mono text-[21px] font-bold tabular-nums', inkClass)}>{counts.machineRules}</Text>
              <Text className={cn('font-body text-[11.5px]', mutedClass)}>
                rules about the machine
                {counts.machineRulesOnUnverifiedSignals > 0 ? ` · ${standing} still standing` : ''}
              </Text>
            </View>

            <View className="gap-0.5">
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CHAIN_HEX }} />
                <Text className={cn('font-mono text-[10.5px] tracking-wider', mutedClass)}>MEASUREMENT CHAIN</Text>
              </View>
              <Text style={{ color: chainDominant ? severityHex.limit : undefined } } className={cn('font-mono text-[21px] font-bold tabular-nums', !chainDominant && inkClass)}>
                {counts.chainRules}
              </Text>
              <Text className={cn('font-body text-[11.5px]', mutedClass)}>rules about the instrument</Text>
            </View>
          </View>

          {/* The conclusion, drawn rather than asserted.
              Rule counts alone mislead here: seven machine rules against four
              chain rules reads as "mostly a machine problem" even when the chain
              rules have invalidated the very signals the machine rules sit on. So
              the sentence is built from how much machine evidence still stands,
              not from which side has more rules. */}
          {counts.machineRulesOnUnverifiedSignals > 0 ? (
            <Text className={cn('font-body text-[12.5px] leading-[19px]', inkClass)}>
              {standing === 0
                ? 'Every machine rule that fired sits on a signal whose measurement chain is in doubt, so none of it is usable evidence about the machine yet.'
                : `${standing} machine rule${standing === 1 ? ' stands' : 's stand'} on verified signals; ${counts.machineRulesOnUnverifiedSignals} ${
                    counts.machineRulesOnUnverifiedSignals === 1 ? 'sits on a signal' : 'sit on signals'
                  } whose chain is in doubt and cannot be relied on yet.`}{' '}
              Verify the chain before any mechanical work.
            </Text>
          ) : chainDominant ? (
            <Text className={cn('font-body text-[12.5px] leading-[19px]', inkClass)}>
              Most of what fired describes the measurement chain, not the machine. Verify the chain before any mechanical work.
            </Text>
          ) : counts.chainRules > 0 ? (
            <Text className={cn('font-body text-[12.5px] leading-[19px]', mutedClass)}>
              Machine evidence stands on its own signals, but {counts.chainRules} chain rule
              {counts.chainRules === 1 ? '' : 's'} elsewhere still needs clearing.
            </Text>
          ) : (
            <Text className={cn('font-body text-[12.5px] leading-[19px]', mutedClass)}>
              Nothing suggests an instrumentation problem. Every rule describes the machine.
            </Text>
          )}

          {unverifiedCount > 0 ? (
            <View className="flex-row items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: `${severityHex.limit}14` }}>
              <Text style={{ color: severityHex.limit }} className="font-mono text-[10.5px] font-bold tracking-wider">
                {unverifiedCount} SIGNAL{unverifiedCount === 1 ? '' : 'S'} UNVERIFIED
              </Text>
              <Text className={cn('flex-1 font-body text-[11.5px]', mutedClass)}>Treat their values as suspect until the chain is checked.</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
