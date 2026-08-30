// The prognosis hero and its summary row.
//
// The page's whole job is to hold one apparent contradiction in front of the
// reader without resolving it: the machine is healthy NOW, and a trend is
// developing that will not stay healthy. So the hero states the developing
// fault at display size, and the summary row puts CURRENT CONDITION and
// PROGNOSIS STATUS side by side — green next to amber, deliberately. That is
// not an inconsistency to be tidied away; it is the definition of predictive
// maintenance, and the layout exists to make it legible.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { CONDITION_LABEL } from '../../../../lib/analysisOverview';
import { cn } from '../../../../lib/cn';
import type { PrognosisTone, PrognosisViewModel } from '../analysis/prognosisViewModel';
import { Hoverable, alpha, consolePalette, radius, tabular, text } from '../../../ui';

export function toneHex(tone: PrognosisTone, isDark: boolean): string {
  const palette = consolePalette(isDark);
  if (tone === 'healthy') return palette.accent;
  if (tone === 'danger') return palette.critical;
  if (tone === 'alert' || tone === 'attention') return palette.forecast;
  return palette.ink;
}

/** A small technical tag. Not a pill with a personality. */
export function Tag({ label, tone }: { label: string; tone: PrognosisTone }) {
  const { isDark } = useAppTheme();
  const colour = toneHex(tone, isDark);
  return (
    <View
      className="px-2 py-[3px]"
      style={{ borderWidth: 1, borderColor: alpha(colour, 0.34), backgroundColor: alpha(colour, 0.1), borderRadius: 4 }}
    >
      <Text className={text.label} style={{ color: colour }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The degradation ring.
 *
 * Deliberately small and mostly dark track: it is a reading, not a speedometer.
 * One arc, one colour, one number — no gradient, no ticks, no second ring.
 */
function DegradationRing({ score }: { score: number | null }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const size = 78;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;

  return (
    <View className="items-center gap-1.5">
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.track} strokeWidth={stroke} fill="none" />
          {score === null ? null : (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={palette.forecast}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference * fraction} ${circumference}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className={text.dataLg} style={[tabular, { color: palette.forecast }]}>
            {score === null ? '—' : `${Math.round(score)}%`}
          </Text>
        </View>
      </View>
      <Text className={text.label} style={{ color: palette.inkFaint }}>
        DEGRADATION
      </Text>
    </View>
  );
}

export type SummaryFact = {
  label: string;
  value: string;
  note?: string;
  tone?: PrognosisTone;
};

/**
 * The eight-cell instrument band.
 *
 * One ruled frame with hairlines between the cells rather than eight floating
 * boxes: the cells are readings of one machine at one moment, and boxing each
 * separately says they are eight unrelated things. Only the VALUE takes colour;
 * cell backgrounds stay neutral so the band does not turn into a traffic light.
 */
export function PrognosisSummaryGrid({ facts }: { facts: SummaryFact[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  // Ruled with `lineStrong` rather than `line`. Eight readings sitting in one
  // frame need a visible edge between them or they read as one paragraph of
  // labels and numbers — and the reader has to use the label positions to
  // re-derive where each cell starts, which is exactly the work a rule saves.
  return (
    <View
      className="overflow-hidden border"
      style={{ borderColor: palette.lineStrong, borderRadius: radius.md, backgroundColor: palette.panelRaised }}
    >
      <View className="flex-row flex-wrap" style={{ marginRight: -1, marginBottom: -1 }}>
        {facts.map((fact) => (
          <Hoverable
            key={fact.label}
            className="gap-1 px-3.5 py-3"
            style={({ hovered }) => ({
              flexGrow: 1,
              flexBasis: 152,
              minWidth: 138,
              borderRightWidth: 1,
              borderBottomWidth: 1,
              borderColor: palette.lineStrong,
              backgroundColor: hovered ? palette.hoverSurface : undefined,
            })}
          >
            <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
              {fact.label}
            </Text>
            <Text
              className={text.dataMd}
              style={[tabular, { color: fact.tone ? toneHex(fact.tone, isDark) : palette.ink, fontWeight: '600' }]}
              numberOfLines={1}
            >
              {fact.value}
            </Text>
            {fact.note ? (
              <Text className={text.micro} style={{ color: palette.inkFaint }} numberOfLines={2}>
                {fact.note}
              </Text>
            ) : null}
          </Hoverable>
        ))}
      </View>
    </View>
  );
}

export function PrognosisHero({ model }: { model: PrognosisViewModel }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const healthy = model.machineCondition === 'healthy';

  return (
    <View
      className="overflow-hidden border"
      style={{ borderColor: alpha(palette.forecast, 0.22), borderRadius: radius.lg, backgroundColor: palette.panel }}
    >
      <View className="flex-row items-center justify-between gap-3 px-4 py-2" style={{ backgroundColor: alpha(palette.forecast, 0.08) }}>
        <Text className={text.label} style={{ color: palette.forecast }}>
          EARLY DEGRADATION DETECTED
        </Text>
        <Text className={text.label} style={{ color: alpha(palette.forecast, 0.75) }}>
          PROGNOSIS
        </Text>
      </View>

      <View className="flex-row flex-wrap items-start justify-between gap-4 px-4 py-4">
        <View className="min-w-0 flex-1 gap-2" style={{ minWidth: 260 }}>
          <Text className={text.label} style={{ color: palette.inkFaint }}>
            {model.affectedComponent}
            {model.machineArea ? ` · ${model.machineArea.toLocaleUpperCase()}` : ''}
          </Text>
          <Text className="font-body-bold text-[22px] leading-[27px] tracking-[-0.03em]" style={{ color: palette.ink }}>
            {model.headline}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Tag label={`CURRENTLY ${CONDITION_LABEL[model.machineCondition].toLocaleUpperCase()}`} tone={healthy ? 'healthy' : 'attention'} />
            <Tag label="LONG-TERM TREND DETECTED" tone="attention" />
          </View>
          <Text className={cn('max-w-[760px]', text.body)} style={{ color: palette.inkMuted }}>
            {model.summary}
          </Text>
        </View>

        <DegradationRing score={model.degradationScore} />
      </View>
    </View>
  );
}

/** A region heading: micro eyebrow, title, optional right-hand slot. */
export function PanelHeading({
  eyebrow,
  title,
  subtitle,
  trailingLabel,
  trailingValue,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  trailingLabel?: string;
  trailingValue?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <View className="min-w-0 gap-1">
        <Text className={text.label} style={{ color: palette.inkFaint }}>
          {eyebrow}
        </Text>
        <Text className="font-body-bold text-[15px] leading-[20px] tracking-[-0.02em]" style={{ color: palette.ink }}>
          {title}
        </Text>
        {subtitle ? (
          <Text className={text.micro} style={{ color: palette.inkMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailingValue ? (
        <View className="items-end gap-1">
          {trailingLabel ? (
            <Text className={text.label} style={{ color: palette.inkFaint }}>
              {trailingLabel}
            </Text>
          ) : null}
          <Text className={text.chip} style={{ color: palette.forecast }}>
            {trailingValue}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The status strip at the foot of maintenance guidance. */
export function ShutdownStrip({ required }: { required: boolean | null }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = required === null ? palette.neutral : required ? palette.critical : palette.accent;
  const value = required === null ? 'NOT DETERMINED' : required ? 'REQUIRED' : 'NOT REQUIRED';
  const trailing = required === null ? 'STATUS UNKNOWN' : required ? 'ACT NOW' : 'SYSTEM SAFE';

  return (
    <View
      className="flex-row items-center justify-between gap-3 px-3 py-2.5"
      style={{ borderWidth: 1, borderColor: alpha(colour, 0.3), backgroundColor: alpha(colour, 0.08), borderRadius: radius.sm }}
    >
      <View className="gap-0.5">
        <Text className={text.label} style={{ color: palette.inkFaint }}>
          IMMEDIATE SHUTDOWN
        </Text>
        <Text className={text.chip} style={{ color: colour }}>
          {value}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <MaterialCommunityIcons
          name={required === null ? 'help-circle-outline' : required ? 'alert-octagon-outline' : 'shield-check-outline'}
          size={13}
          color={colour}
        />
        <Text className={text.label} style={{ color: colour }}>
          {trailing}
        </Text>
      </View>
    </View>
  );
}
