/**
 * DIAGNOSIS — the fast overall conclusion.
 *
 * This is the page a plant operator opens first and often only. It answers four
 * questions in the order they are actually asked: what is the machine's status,
 * what needs attention, what changed, and what does ULTRON think is wrong.
 *
 * It is deliberately the *simplest* screen in the layer. Rule ids, evidence
 * classes, engine layers and match scores are all real and all traceable — and
 * none of them belong here, because a page that leads with `WRN-GBX-002` makes
 * an operator do the translating. They surface one tab across, in Advance
 * Diagnosis, beside the reasoning they belong to.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { KeyChange, MachinePart } from '../../../../lib/analysis/extruder';
import { Badge, consolePalette, type Variant } from '../../../ui';
import { EmptyNote, Section, StepRow, SummaryStrip } from './AnalyzerParts';

/**
 * One line in Needs attention.
 *
 * `kind` mirrors the engine's own three registries — a crossed decision
 * boundary is a WARNING, a breached hard process limit is an ALARM, and a
 * matched fault signature is a FAULT. Severity and inference are parallel axes:
 * a fault is a root-cause inference, not the rung above alarm.
 */
export type AttentionItem = {
  key: string;
  kind: 'WARNING' | 'ALARM' | 'FAULT';
  /** Plain-language line. No rule ids. */
  message: string;
  /** The traceable id, shown small underneath. */
  reference: string;
  part: MachinePart | null;
};

export type CurrentDiagnosis = {
  likelyCause: string;
  affectedPart: string;
  /**
   * How the candidate ranked, in words. Never a percentage: this machine has no
   * calibrated fault-probability model, and a number with a % sign beside it
   * would be a fabricated confidence.
   */
  ranking: string;
  cannotConfirm: string[];
};

const KIND_VARIANT: Record<AttentionItem['kind'], Variant> = {
  WARNING: 'warning',
  ALARM: 'destructive',
  FAULT: 'destructive',
};

const KIND_LABEL: Record<AttentionItem['kind'], string> = {
  WARNING: 'Warning',
  ALARM: 'Alarm',
  FAULT: 'Fault',
};

const DIRECTION_ICON: Record<KeyChange['direction'], 'arrow-up' | 'arrow-down' | 'minus'> = {
  UP: 'arrow-up',
  DOWN: 'arrow-down',
  FLAT: 'minus',
};

export function ConclusionTab({
  status,
  statusVariant,
  statusDetail,
  warningCount,
  alarmCount,
  faultCount,
  attention,
  changes,
  diagnosis,
  action,
  onOpenPart,
}: {
  /** One word: Normal, Warning, Critical, No data. */
  status: string;
  statusVariant: Variant;
  statusDetail: string;
  warningCount: number;
  alarmCount: number;
  faultCount: number;
  attention: AttentionItem[];
  changes: KeyChange[];
  diagnosis: CurrentDiagnosis | null;
  /** The single next step, when the model has one. */
  action: { priority: string; steps: string[] } | null;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="gap-3">
      <SummaryStrip
        items={[
          { key: 'status', label: 'Machine status', value: status, variant: statusVariant, detail: statusDetail },
          {
            key: 'warnings',
            label: 'Warnings',
            value: String(warningCount),
            variant: warningCount > 0 ? 'warning' : 'muted',
            detail: 'Registered boundaries crossed',
          },
          {
            key: 'alarms',
            label: 'Alarms',
            value: String(alarmCount),
            variant: alarmCount > 0 ? 'destructive' : 'muted',
            detail: 'Hard process limits exceeded',
          },
          {
            key: 'faults',
            label: 'Detected problems',
            value: String(faultCount),
            variant: faultCount > 0 ? 'destructive' : 'muted',
            detail: 'Matched fault signatures',
          },
        ]}
      />

      <View className="gap-3 lg:flex-row lg:items-start">
        <View className="min-w-0 flex-1">
          <Section
            title="Needs attention"
            eyebrow="Now"
            meta="Everything currently raised on this machine. Faults first, then breached limits, then crossed boundaries."
            padded={false}
          >
            {attention.length === 0 ? (
              <EmptyNote>Nothing is currently raised on this machine.</EmptyNote>
            ) : (
              attention.map((item, index) => (
                <Pressable
                  key={item.key}
                  onPress={item.part ? () => onOpenPart(item.part as MachinePart) : undefined}
                  disabled={!item.part}
                  accessibilityRole={item.part ? 'button' : undefined}
                  accessibilityLabel={item.part ? `${item.message}. Open ${item.part}.` : item.message}
                  className="flex-row items-center gap-3 px-4 py-2.5"
                  style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="font-body-bold text-[12.5px]" style={{ color: palette.ink }}>
                      {item.message}
                    </Text>
                    <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                      {[item.reference, item.part].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Badge variant={KIND_VARIANT[item.kind]} icon={null} outline>
                    {KIND_LABEL[item.kind]}
                  </Badge>
                  {item.part ? (
                    <MaterialCommunityIcons name="chevron-right" size={15} color={palette.inkFaint} />
                  ) : null}
                </Pressable>
              ))
            )}
          </Section>
        </View>

        <View className="min-w-0 flex-1">
          <Section
            title="Key changes"
            eyebrow="This session"
            meta="What has actually moved, from where to where."
            padded={false}
            footnote="Signals without enough history are left out rather than listed as unchanged, which the data could not support."
          >
            {changes.length === 0 ? (
              <EmptyNote>Not enough history has been collected this session to report a change.</EmptyNote>
            ) : (
              changes.map((change, index) => (
                <View
                  key={change.tag}
                  className="flex-row items-center gap-3 px-4 py-2.5"
                  style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
                >
                  <Text className="min-w-0 flex-1 font-body text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                    {change.label}
                  </Text>
                  <Text
                    className="font-mono text-[11.5px]"
                    style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}
                    numberOfLines={1}
                  >
                    {change.from} → {change.to}
                  </Text>
                  <View className="flex-row items-center gap-1" style={{ width: 104 }}>
                    <MaterialCommunityIcons
                      name={DIRECTION_ICON[change.direction]}
                      size={12}
                      color={change.direction === 'FLAT' ? palette.inkFaint : palette.warning}
                    />
                    <Text className="font-body text-[10.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                      {change.note}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Section>
        </View>
      </View>

      <Section
        title="Current diagnosis"
        eyebrow="Conclusion"
        accent={diagnosis ? 'warning' : 'success'}
        footnote="No percentage confidence is reported for this machine: it has no calibrated fault-probability model, so the ranking is an ordinal engineering match rather than a probability."
      >
        {diagnosis === null ? (
          <Text className="font-body text-[12px] leading-[17px]" style={{ color: palette.inkMuted }}>
            No controlled fault signature is met by the current measurements. Nothing on this machine needs a decision right now.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-x-8 gap-y-3">
            <View style={{ minWidth: 220 }} className="flex-1">
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                Likely cause
              </Text>
              <Text className="mt-1 font-body-bold text-[14px]" style={{ color: palette.ink }}>
                {diagnosis.likelyCause}
              </Text>
            </View>
            <View style={{ minWidth: 150 }} className="flex-1">
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                Affected part
              </Text>
              <Text className="mt-1 font-body-bold text-[14px]" style={{ color: palette.ink }}>
                {diagnosis.affectedPart}
              </Text>
            </View>
            <View style={{ minWidth: 170 }} className="flex-1">
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                How it ranked
              </Text>
              <Text className="mt-1 font-body-bold text-[14px]" style={{ color: palette.ink }}>
                {diagnosis.ranking}
              </Text>
            </View>
            <View style={{ minWidth: 240 }} className="flex-1">
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                What ULTRON cannot confirm
              </Text>
              <Text className="mt-1 font-body text-[12.5px] leading-[17px]" style={{ color: palette.ink }}>
                {diagnosis.cannotConfirm[0] ?? 'Nothing further is outstanding on this conclusion.'}
              </Text>
            </View>
          </View>
        )}
      </Section>

      {action ? (
        <Section title="What to do" eyebrow={`Priority · ${action.priority}`} accent="warning">
          <View className="gap-2">
            {action.steps.slice(0, 4).map((step, index) => (
              <StepRow key={index} index={index + 1} text={step} />
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}
