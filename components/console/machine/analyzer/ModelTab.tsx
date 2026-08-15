/**
 * Model — what is actually doing the diagnosing.
 *
 * Four questions, in the order they get asked: which model is running, what it
 * is reading, what it cannot read, and what it refuses to state. The detail
 * behind each — every baseline's provenance, the pipeline trace, the caveat
 * list — stays reachable but collapsed, because none of it is the answer.
 */
import { View, Text, useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { BaselineValue, ExtruderTag } from '../../../../lib/analysis/extruder';
import { Badge, Body, Collapsible, consolePalette, Separator } from '../../../ui';
import { EmptyNote, Fact, Section, SummaryStrip } from './AnalyzerParts';

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

function formatNumber(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

export function ModelTab({
  modelName,
  modelVersion,
  recipeId,
  machineState,
  inputs,
  missing,
  constraintCount,
  blockedOutputs,
  baseline,
  trace,
  availability,
  caveats,
  thresholdCount,
  fieldCalibrated,
}: {
  modelName: string;
  modelVersion: string;
  recipeId: string;
  machineState: string;
  /** Tags currently feeding the model. */
  inputs: { tag: string; label: string; value: number | null; unit: string }[];
  missing: { tag: ExtruderTag; label: string; essential: boolean; note?: string }[];
  constraintCount: number;
  blockedOutputs: string[];
  baseline: BaselineValue[];
  trace: string[];
  availability: Record<string, string>;
  caveats: string[];
  thresholdCount: number;
  fieldCalibrated: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  const twoColumn = width >= 1180;

  const unavailableGroups = Object.entries(availability).filter(([, status]) => status.startsWith('NOT_EVALUATED'));

  return (
    <View className="gap-3">
      <SummaryStrip
        items={[
          { key: 'inputs', label: 'Connected inputs', value: String(inputs.length), variant: inputs.length > 0 ? 'success' : 'muted' },
          { key: 'missing', label: 'Missing inputs', value: String(missing.length), variant: missing.length > 0 ? 'warning' : 'success' },
          { key: 'limits', label: 'Constraints', value: String(constraintCount) },
          { key: 'thresholds', label: 'Thresholds', value: String(thresholdCount), detail: `${fieldCalibrated} field calibrated` },
          { key: 'blocked', label: 'Blocked outputs', value: String(blockedOutputs.length), variant: 'muted' },
        ]}
      />

      <View className={twoColumn ? 'flex-row gap-3' : 'gap-3'}>
        <Section
          className="min-w-0 flex-1"
          title="Active model"
          eyebrow="Identity"
          meta="Every judgement on this screen was produced by this model at this version."
        >
          <View className="flex-row flex-wrap gap-x-6 gap-y-2.5">
            <Fact label="Model" value={modelName} mono={false} width={200} />
            <Fact label="Version" value={modelVersion} width={110} />
            <Fact label="Recipe" value={recipeId} width={130} />
            <Fact label="Machine state" value={machineState} mono={false} width={140} />
            <Fact label="Validation" value="Not field validated" mono={false} width={160} />
            <Fact label="Actuation" value="None — advisory only" mono={false} width={180} />
          </View>
        </Section>

        <Section
          className="min-w-0 flex-1"
          title="Model limitations"
          eyebrow="What it will not state"
          accent="warning"
          footnote="Machine-specific calibration and real asset-life claims require OEM inputs and field data. Until those exist, the outputs below stay blocked rather than being estimated."
        >
          <View className="gap-2">
            {[
              ['Advisory only', 'Nothing here actuates anything. It is evidence for a human decision.'],
              [
                'Not field calibrated',
                `All ${thresholdCount} diagnostic boundaries are engineering-development values; ${fieldCalibrated} are field calibrated on this machine.`,
              ],
              ['No automatic actuation', 'The model has no write path to the plant, by construction.'],
            ].map(([term, meaning]) => (
              <View key={term} className="gap-0.5">
                <Text className="font-body-bold text-[12px]" style={{ color: palette.ink }}>
                  {term}
                </Text>
                <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                  {meaning}
                </Text>
              </View>
            ))}
            {blockedOutputs.length > 0 ? (
              <>
                <Separator />
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                  Blocked outputs
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {blockedOutputs.map((output) => (
                    <Badge key={output} variant="muted" icon="cancel">
                      {humanise(output)}
                    </Badge>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </Section>
      </View>

      <View className={twoColumn ? 'flex-row gap-3' : 'gap-3'}>
        <Section
          className="min-w-0 flex-1"
          title="Inputs"
          eyebrow="Reading now"
          meta="Tags currently resolved onto a mapped point and feeding the rules."
          padded={false}
        >
          {inputs.length === 0 ? (
            <View className="px-4 py-3">
              <EmptyNote>No point has resolved onto a model input.</EmptyNote>
            </View>
          ) : (
            inputs.map((input, index) => (
              <View
                key={input.tag}
                className="flex-row items-center gap-2.5 px-3 py-1.5"
                style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
              >
                <Text className="font-mono text-[11px]" style={{ color: palette.ink, width: 78 }} numberOfLines={1}>
                  {input.tag}
                </Text>
                <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                  {input.label}
                </Text>
                <Text className="font-mono text-[11.5px]" style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}>
                  {formatNumber(input.value)}
                </Text>
                <Text className="font-mono text-[9.5px] uppercase" style={{ color: palette.inkFaint, minWidth: 34 }}>
                  {input.unit}
                </Text>
              </View>
            ))
          )}
        </Section>

        <Section
          className="min-w-0 flex-1"
          title="Missing inputs"
          eyebrow="Not available"
          accent={missing.length > 0 ? 'warning' : undefined}
          meta="Mapping these widens what the model can separate."
          padded={false}
        >
          {missing.length === 0 ? (
            <View className="px-4 py-3">
              <EmptyNote>Every tag this model wants is mapped.</EmptyNote>
            </View>
          ) : (
            missing.map((item, index) => (
              <View
                key={item.tag}
                className="gap-1 px-3 py-2"
                style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
              >
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge variant={item.essential ? 'warning' : 'muted'} icon={null} outline>
                    {item.essential ? 'Essential' : 'Diagnostic'}
                  </Badge>
                  <Text className="font-mono text-[11px]" style={{ color: palette.ink }}>
                    {item.tag}
                  </Text>
                  <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                    {item.label}
                  </Text>
                </View>
                {item.note ? (
                  <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </View>

      <Section
        title="Healthy baseline"
        eyebrow="Reference"
        meta="Every comparison is made against the machine's own healthy reference. A value with no controlled source leaves its dependent evidence unevaluated rather than defaulting to zero."
        padded={false}
      >
        {baseline.length === 0 ? (
          <View className="px-4 py-3">
            <EmptyNote>This model declares no baseline references.</EmptyNote>
          </View>
        ) : (
          baseline.map((row, index) => (
            <View
              key={row.tag}
              className="gap-1 px-3 py-2"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
            >
              <View className="flex-row items-center gap-2.5">
                <Text className="min-w-0 flex-1 font-body text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text className="font-mono text-[11.5px]" style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}>
                  {formatNumber(row.value)} {row.unit}
                </Text>
                <Badge
                  variant={row.status === 'SOURCE_BACKED' ? 'success' : row.status === 'DERIVED' ? 'info' : 'muted'}
                  icon={null}
                  outline
                >
                  {humanise(row.status)}
                </Badge>
              </View>
              <Text className="font-mono text-[10px] leading-[14px]" style={{ color: palette.inkFaint }} numberOfLines={2}>
                {row.provenance}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Collapsible title="Pipeline execution" icon="sitemap-outline" summary={trace.join(' → ')}>
        <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
          Stages
        </Text>
        <Body muted mono>
          {trace.join(' → ')}
        </Body>
        <Separator />
        <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
          Unavailable feature groups
        </Text>
        {unavailableGroups.length === 0 ? (
          <Body muted>All feature groups were evaluated.</Body>
        ) : (
          unavailableGroups.map(([key, status]) => (
            <Body key={key} muted mono>
              {key}: {humanise(status.replace('NOT_EVALUATED_', ''))}
            </Body>
          ))
        )}
      </Collapsible>

      <Collapsible
        title="Caveats"
        icon="alert-circle-outline"
        count={caveats.length}
        summary="Everything this result depends on that is not yet established."
      >
        {caveats.map((caveat, index) => (
          <Body key={`${caveat}-${index}`} muted>
            · {caveat}
          </Body>
        ))}
      </Collapsible>

      <Collapsible
        title="What the words on this page mean"
        icon="book-open-outline"
        summary="Plain definitions for every term the analysis uses."
      >
        {[
          [
            'Pilot tag',
            "The model's name for one instrument — P1 is the melt-pressure transducer, T1 the zone 1 thermocouple. Your point names are matched onto these.",
          ],
          [
            'Baseline',
            'What this machine reads when it is healthy and on recipe. Every judgement is a comparison against it, never against a number invented for the page.',
          ],
          ['Threshold', 'The boundary at which a reading counts as evidence. All of them are written down in the model with where they came from.'],
          [
            'Hypothesis / candidate',
            'A fault the model considered. Candidates are the ones the readings actually support; the rest are listed with why they were dropped.',
          ],
          [
            'Identifiability',
            'Whether the installed sensors can tell the surviving candidates apart. When they cannot, the model says so instead of picking one.',
          ],
          [
            'Hard limit',
            'A safe-operating boundary. Being inside it is a separate question from being healthy — a machine can be inside every limit and still be failing.',
          ],
          [
            'Anomaly band',
            'How far a reading has drifted from its healthy reference, measured in consistency bands rather than a severity percentage the model cannot calibrate.',
          ],
          [
            'Match score',
            'A ranking number for how well evidence fits a fault. It orders candidates; it is not a probability and must not be read as one.',
          ],
          ['Advisory only', 'Nothing here actuates anything. It is evidence for a human decision, and it has not been field calibrated on this machine.'],
        ].map(([term, meaning]) => (
          <View key={term} className="gap-0.5 py-1">
            <Body>{term}</Body>
            <Body muted>{meaning}</Body>
          </View>
        ))}
      </Collapsible>
    </View>
  );
}
