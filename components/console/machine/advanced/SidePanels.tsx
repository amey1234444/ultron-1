import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { conditionHexes } from '../../../../lib/analysisOverview';
import { qualityHex, QUALITY_LABEL, type DataQuality, type EvidenceItem } from '../../../../lib/advancedDiagnosis';
import { cn } from '../../../../lib/cn';

export function PanelHeader({
  title,
  subtitle,
  onCollapse,
}: {
  title: string;
  subtitle: string;
  onCollapse?: () => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="flex-row items-start justify-between gap-2 pb-2.5" style={{ borderBottomWidth: 1, borderBottomColor: hairline }}>
      <View className="flex-1">
        <Text className={cn('font-body-medium text-[11px]', inkClass)}>{title}</Text>
        <Text className={cn('mt-0.5 font-mono text-[8px] tracking-wider', mutedClass)}>{subtitle}</Text>
      </View>
      {onCollapse ? (
        <Pressable onPress={onCollapse} accessibilityRole="button" accessibilityLabel={`Hide ${title}`} className="px-1.5">
          <Text className={cn('font-mono text-[12px]', mutedClass)}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Contextual assistance, phrased as observation rather than instruction.
//
// This panel is the one most likely to overstep. A senior analyst does not need to
// be told what to conclude, and a tool that tells them anyway gets ignored or, worse,
// believed. So each card states what is observed and what would discriminate — never
// a verdict.
export function IntelligencePanel({
  observation,
  quality,
  qualityNote,
  dominantEvidence,
  nextStep,
  evidenceCount,
  onOpenEvidence,
  onCollapse,
}: {
  observation: string;
  quality: DataQuality;
  qualityNote: string;
  dominantEvidence: string;
  nextStep: string;
  evidenceCount: number;
  onOpenEvidence?: () => void;
  onCollapse?: () => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const card = (label: string, text: string, tint?: string) => (
    <View className="gap-1 rounded-lg border px-2.5 py-2" style={{ borderColor: hairline }}>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[8px] font-bold tracking-wider', !tint && mutedClass)}>
        {label}
      </Text>
      <Text className={cn('font-body text-[10px] leading-[15px]', inkClass)}>{text}</Text>
    </View>
  );

  return (
    <View className="gap-2.5">
      <PanelHeader title="Analyst intelligence" subtitle="OBSERVATION, NOT VERDICT" onCollapse={onCollapse} />

      {card('CURRENT OBSERVATION', observation)}
      {card(`DATA QUALITY · ${QUALITY_LABEL[quality]}`, qualityNote, qualityHex(quality, isDark))}
      {card('DOMINANT EVIDENCE', dominantEvidence)}
      {card('WHAT WOULD DISCRIMINATE', nextStep)}

      {onOpenEvidence ? (
        <Pressable
          onPress={onOpenEvidence}
          accessibilityRole="button"
          accessibilityLabel={`Open evidence tray, ${evidenceCount} items`}
          className="rounded-lg border border-accent/35 bg-accent/10 px-2.5 py-2"
        >
          <Text className="text-center font-mono text-[9px] font-bold tracking-wider text-accent">
            EVIDENCE TRAY · {evidenceCount}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Resolved per theme rather than at module load: light mode carries its own,
// deeper status ramp. See `conditionHexes` in lib/analysisOverview.ts.
function roleHexes(isDark: boolean): Record<EvidenceItem['role'], string> {
  const hex = conditionHexes(isDark);
  return { supports: hex.healthy, contradicts: hex.danger, context: hex.offline };
}

// Evidence persists across work areas, because an investigation is built by
// collecting from several of them. Contradicting evidence is kept alongside
// supporting rather than filed away — a case that only records what agrees with it
// is not a case.
export function EvidenceTray({
  evidence,
  onClose,
  onRemove,
}: {
  evidence: EvidenceItem[];
  onClose?: () => void;
  onRemove?: (id: string) => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const counts = evidence.reduce<Record<string, number>>((acc, item) => {
    acc[item.role] = (acc[item.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View className="gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>
            Evidence tray · {evidence.length}
          </Text>
          <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>
            {counts.supports ?? 0} SUPPORTS · {counts.contradicts ?? 0} CONTRADICTS · {counts.context ?? 0} CONTEXT
          </Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close evidence tray" className="px-1.5">
            <Text className={cn('font-mono text-[12px]', mutedClass)}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {evidence.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>
          Nothing collected yet. Add a view from any work area to start building a case.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {evidence.map((item) => (
            <View
              key={item.id}
              style={{ flexGrow: 1, flexBasis: 260, minWidth: 240, borderColor: hairline }}
              className="gap-1 rounded-lg border px-2.5 py-2"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[11px]', inkClass)}>
                  {item.title}
                </Text>
                <Text style={{ color: roleHexes(isDark)[item.role] }} className="font-mono text-[8px] font-bold tracking-wider">
                  {item.role.toUpperCase()}
                </Text>
              </View>

              <Text className={cn('font-body text-[10px] leading-[14px]', mutedClass)}>{item.detail}</Text>

              <View className="flex-row items-center justify-between gap-2">
                <Text numberOfLines={1} className={cn('flex-1 font-mono text-[8px]', mutedClass)}>
                  {item.source}
                </Text>
                {onRemove ? (
                  <Pressable onPress={() => onRemove(item.id)} accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                    <Text className={cn('font-mono text-[8px]', mutedClass)}>REMOVE</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
