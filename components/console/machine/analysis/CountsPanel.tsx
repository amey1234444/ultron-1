import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { severityHexes, SEVERITY_LABEL, SEVERITY_ORDER, type AnalysisCounts } from '../../../../lib/analysisDiagnosis';

// Severity counts for this machine.
//
// Findings and rules are labelled as different things and shown side by side,
// because they are different things and conflating them is what put "Faults 7" in
// a sidebar next to a filter chip reading "Faults 4" on the same screen. One
// finding can carry several rules; both numbers are useful, neither is "the" count.
export function CountsPanel({ counts }: { counts: AnalysisCounts }) {
  const { isDark } = useAppTheme();
  const severityHex = severityHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const track = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  const total = counts.totalFindings;

  return (
    <View className="gap-3">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Counts · this machine</Text>

      <View className="flex-row items-center gap-2 pb-1" style={{ borderBottomWidth: 1, borderBottomColor: hairline }}>
        <Text className={cn('flex-1 font-mono text-[8px] uppercase tracking-wider', mutedClass)}>Kind</Text>
        <Text style={{ width: 54 }} className={cn('text-right font-mono text-[8px] uppercase tracking-wider', mutedClass)}>Findings</Text>
        <Text style={{ width: 42 }} className={cn('text-right font-mono text-[8px] uppercase tracking-wider', mutedClass)}>Rules</Text>
      </View>

      {SEVERITY_ORDER.map((severity) => (
        <View key={severity} className="flex-row items-center gap-2">
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: severityHex[severity] }} />
          <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', inkClass)}>
            {SEVERITY_LABEL[severity]}
          </Text>
          <Text style={{ width: 54, color: severityHex[severity] }} className="text-right font-mono text-[13px] font-bold tabular-nums">
            {counts.findingsBySeverity[severity]}
          </Text>
          <Text style={{ width: 42 }} className={cn('text-right font-mono text-[11px] tabular-nums', mutedClass)}>
            {counts.rulesBySeverity[severity]}
          </Text>
        </View>
      ))}

      <View className="gap-1.5 pt-1">
        <Text className={cn('font-mono text-[8px] uppercase tracking-wider', mutedClass)}>Severity mix · by count</Text>
        {total === 0 ? (
          <Text className={cn('font-body text-[10px] italic', mutedClass)}>Nothing has fired.</Text>
        ) : (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: track }} className="w-full flex-row overflow-hidden">
            {SEVERITY_ORDER.map((severity) => {
              const share = (counts.findingsBySeverity[severity] / total) * 100;
              if (share === 0) return null;
              return <View key={severity} style={{ width: `${share}%`, backgroundColor: severityHex[severity] }} />;
            })}
          </View>
        )}
      </View>
    </View>
  );
}
