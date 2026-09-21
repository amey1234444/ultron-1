import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { MlDiagnosis, MlShapContribution } from '../../../../lib/knowledge/ml/contract';
import {
  Alert,
  Badge,
  Body,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SectionLabel,
  Separator,
  alpha,
  consolePalette,
} from '../../../ui';

/**
 * Why BLACKGATE produced this finding — in two panels that must not be merged.
 *
 * **Physical evidence** comes from the DOC-04 evidence model and the DOC-07
 * fault library: measured signals, required and contradicting evidence, the
 * mechanism. It is knowledge, validated, and it is what an engineer acts on.
 *
 * **Model contributors** come from SHAP. They explain the *classifier's*
 * output, not the machine. A large contribution from a pressure slope means
 * the model's score moved because that feature had that value; it does not
 * mean rising pressure causes the fault.
 *
 * The two are rendered separately and labelled differently because the
 * confusion is expensive: an engineer who reads a SHAP ranking as causality
 * will go and work on the feature at the top, which on a correlated feature set
 * is frequently a symptom.
 *
 * Contradicting and missing evidence are shown, never hidden. DOC-04 §18: a
 * diagnosis that discards the evidence against it is not a diagnosis.
 */

type Props = {
  diagnosis: MlDiagnosis;
};

function ContributionRow({
  entry,
  maximum,
}: {
  entry: MlShapContribution;
  maximum: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const magnitude = maximum > 0 ? Math.abs(entry.shap) / maximum : 0;
  const positive = entry.shap > 0;
  const colour = positive ? palette.warning : palette.accent;

  return (
    <View className="gap-1 py-1.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1 text-[12px]" style={{ color: palette.ink }} numberOfLines={2}>
          {entry.featureName}
        </Text>
        <Text className="font-mono text-[11px]" style={{ color: palette.inkMuted }}>
          {entry.value === null ? '—' : entry.value.toPrecision(3)}
          {entry.unit && entry.unit !== 'unknown' ? ` ${entry.unit}` : ''}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {/* Centred bars: leftward reduces the score, rightward raises it. A
            single-direction bar chart makes a negative contribution look like a
            small positive one, which is the opposite of what it means. */}
        <View className="h-[5px] flex-1 flex-row items-center justify-center">
          <View className="h-[5px] flex-1 items-end">
            {!positive ? (
              <View
                style={{
                  width: `${magnitude * 100}%`,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colour,
                }}
              />
            ) : null}
          </View>
          <View style={{ width: 1, height: 9, backgroundColor: alpha(palette.inkMuted, 0.5) }} />
          <View className="h-[5px] flex-1">
            {positive ? (
              <View
                style={{
                  width: `${magnitude * 100}%`,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colour,
                }}
              />
            ) : null}
          </View>
        </View>
        <Text className="w-[52px] text-right font-mono text-[10px]" style={{ color: palette.inkMuted }}>
          {entry.shap >= 0 ? '+' : ''}
          {entry.shap.toFixed(3)}
        </Text>
      </View>
    </View>
  );
}

export function ExplanationPanel({ diagnosis }: Props) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const maximum = diagnosis.shap.reduce((best, entry) => Math.max(best, Math.abs(entry.shap)), 0);
  const positive = diagnosis.shap.filter((entry) => entry.shap > 0);
  const negative = diagnosis.shap.filter((entry) => entry.shap < 0);

  return (
    <View className="gap-3">
      {/* -- physical evidence, from the knowledge layer -------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Physical evidence</CardTitle>
          <Body muted className="text-[12px]">
            From the DOC-04 evidence model and the DOC-07 fault library. This is what the
            conclusion rests on.
          </Body>
        </CardHeader>
        <CardContent className="gap-3">
          <View className="gap-1">
            <SectionLabel>Mechanism</SectionLabel>
            <Body className="text-[12px]">{diagnosis.mechanism || 'No mechanism is recorded for this finding.'}</Body>
          </View>

          {diagnosis.supportingEvidence.length > 0 ? (
            <View className="gap-1">
              <SectionLabel>Supporting</SectionLabel>
              {diagnosis.supportingEvidence.map((item, index) => (
                <View key={`${item.statement}-${index}`} className="flex-row items-start gap-2">
                  <Badge variant={item.evidenceClass === 'REQUIRED' ? 'info' : 'muted'} icon={null}>
                    {item.evidenceClass}
                  </Badge>
                  <Body className="flex-1 text-[12px]">{item.statement}</Body>
                </View>
              ))}
            </View>
          ) : null}

          {diagnosis.contradictingEvidence.length > 0 ? (
            <View className="gap-1">
              <SectionLabel>Contradicting — never hidden</SectionLabel>
              {diagnosis.contradictingEvidence.map((item, index) => (
                <View key={`${item.statement}-${index}`} className="flex-row items-start gap-2">
                  <MaterialCommunityIcons name="alert-circle-outline" size={13} color={palette.warning} />
                  <Body className="flex-1 text-[12px]">{item.statement}</Body>
                </View>
              ))}
            </View>
          ) : null}

          {diagnosis.missingEvidence.length > 0 ? (
            <View className="gap-1">
              <SectionLabel>Missing</SectionLabel>
              {diagnosis.missingEvidence.map((item, index) => (
                <View key={`${item.statement}-${index}`} className="flex-row items-start gap-2">
                  <MaterialCommunityIcons name="help-circle-outline" size={13} color={palette.inkMuted} />
                  <Body className="flex-1 text-[12px]">{item.statement}</Body>
                </View>
              ))}
            </View>
          ) : null}

          {diagnosis.alternatives.length > 0 ? (
            <View className="gap-1">
              <SectionLabel>Alternatives the same evidence could mean</SectionLabel>
              {diagnosis.alternatives.map((entry) => (
                <Body key={entry} className="text-[12px]">
                  • {entry}
                </Body>
              ))}
            </View>
          ) : null}

          {diagnosis.rootCauseCandidates.length > 0 ? (
            <View className="gap-1">
              <SectionLabel>
                Root-cause candidates — {diagnosis.rootCauseConfidence.level} confidence
              </SectionLabel>
              {diagnosis.rootCauseCandidates.map((entry) => (
                <Body key={entry} className="text-[12px]">
                  • {entry}
                </Body>
              ))}
            </View>
          ) : null}

          {diagnosis.groupedSymptoms.length > 0 ? (
            <View className="gap-1">
              <SectionLabel>Downstream symptoms grouped under this cause</SectionLabel>
              {diagnosis.groupedSymptoms.map((entry) => (
                <Body key={entry} className="text-[12px]">
                  • {entry}
                </Body>
              ))}
            </View>
          ) : null}
        </CardContent>
      </Card>

      {/* -- model contributors, deliberately a separate card --------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Model contributors</CardTitle>
          <Body muted className="text-[12px]">
            How each feature moved the classifier&apos;s output. This explains the model, not the
            machine — it is not a causal ranking.
          </Body>
        </CardHeader>
        <CardContent>
          {!diagnosis.shapAvailable ? (
            <Alert variant="muted" title="No model explanation" icon="chart-box-outline">
              <Body>
                {diagnosis.shapUnavailableReason ??
                  'This finding came from the deterministic rules, which explain themselves through the evidence above.'}
              </Body>
            </Alert>
          ) : (
            <View className="gap-1">
              <SectionLabel>Raised the score</SectionLabel>
              {positive.length > 0 ? (
                positive.map((entry) => (
                  <ContributionRow key={entry.feature} entry={entry} maximum={maximum} />
                ))
              ) : (
                <Body className="text-[12px]">Nothing contributed positively.</Body>
              )}

              {negative.length > 0 ? (
                <>
                  <Separator className="my-2" />
                  <SectionLabel>Lowered the score</SectionLabel>
                  {negative.map((entry) => (
                    <ContributionRow key={entry.feature} entry={entry} maximum={maximum} />
                  ))}
                </>
              ) : null}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}
