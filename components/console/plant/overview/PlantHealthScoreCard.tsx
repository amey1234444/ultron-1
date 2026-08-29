/**
 * The plant's health score, and the shape of the fleet behind it.
 *
 * Two questions, in the order an operator asks them: "how is the plant" — the
 * score against its target — and "why" — how the assets are distributed across
 * the four condition bands. They live in one card because the second is the
 * explanation of the first; splitting them puts a card boundary between a
 * number and its reason.
 *
 * The score is the one figure this page exists to show, so it is the only thing
 * on the overview set at display size. Everything else on the card is a
 * qualifier attached to it: the target, the gap, the bar it sits on.
 */
import { Text, View } from 'react-native';

import { alpha, type ConsolePalette } from '../../../../lib/consoleTheme';
import { STEP } from '../PlantSurfaces';
import { Divider, Kicker, PAD, Panel } from './OverviewChrome';

export type AssetDistribution = {
  critical: number;
  atRisk: number;
  neutral: number;
  healthy: number;
};

/** A track segment that is only drawn when it has assets in it. */
function Segment({ count, total, color }: { count: number; total: number; color: string }) {
  if (count <= 0 || total <= 0) return null;
  return <View style={{ flex: count, backgroundColor: color }} />;
}

function DistributionCell({
  label,
  count,
  tone,
  palette,
}: {
  label: string;
  count: number;
  tone: string;
  palette: ConsolePalette;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: STEP * 1.5 }}>
      <Text
        numberOfLines={1}
        className="font-mono"
        style={{ fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase', color: tone }}
      >
        {label}
      </Text>
      {/* The count wears ink, not the band's hue. The word above it already
          says which band this is, and a coloured numeral would make "how many"
          and "how bad" the same statement. */}
      <Text
        className="font-mono"
        style={{ fontSize: 17, lineHeight: 20, fontWeight: '600', color: count > 0 ? palette.ink : palette.inkDisabled }}
      >
        {count}
      </Text>
    </View>
  );
}

export function PlantHealthScoreCard({
  score,
  target,
  distribution,
  updatedLabel,
  palette,
  isDark,
}: {
  score: number;
  target: number;
  distribution: AssetDistribution;
  /** Provenance for the score — when it was last recomputed. */
  updatedLabel: string;
  palette: ConsolePalette;
  isDark: boolean;
}) {
  const gap = score - target;
  const onPlan = gap >= 0;
  const total = distribution.critical + distribution.atRisk + distribution.neutral + distribution.healthy;
  const scorePct = Math.max(0, Math.min(100, score));
  const targetPct = Math.max(0, Math.min(100, target));
  // The fill states the reading, so it carries the reading's condition.
  const scoreTone = score >= 85 ? palette.accent : score >= 60 ? palette.warning : palette.critical;

  return (
    <Panel palette={palette} isDark={isDark} style={{ padding: PAD }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: STEP * 3 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Kicker palette={palette}>Plant health</Kicker>
        </View>
        <Text numberOfLines={1} className="font-mono" style={{ fontSize: 10, color: palette.inkFaint }}>
          {updatedLabel}
        </Text>
      </View>

      {/* --- the reading ---------------------------------------------------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: STEP * 3,
          marginTop: STEP * 3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text
            className="font-display"
            style={{ fontSize: 46, lineHeight: 48, letterSpacing: -2, color: palette.ink }}
          >
            {score}
          </Text>
          <Text className="font-body" style={{ fontSize: 13, color: palette.inkFaint }}>
            /100
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: STEP * 1.5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: STEP * 1.5 }}>
            <Text className="font-mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: palette.inkFaint }}>
              TARGET
            </Text>
            <Text className="font-mono" style={{ fontSize: 13, fontWeight: '600', color: palette.ink }}>
              {target}
            </Text>
          </View>
          {/* The gap is the sentence the score is really making. It gets a
              tinted pill because it is the one figure here a reader acts on. */}
          <View
            style={{
              paddingHorizontal: STEP * 1.75,
              paddingVertical: 3,
              borderRadius: 4,
              backgroundColor: onPlan ? palette.accentSoft : palette.criticalSoft,
              borderWidth: 1,
              borderColor: onPlan ? palette.accentBorder : palette.criticalBorder,
            }}
          >
            <Text
              className="font-mono"
              style={{ fontSize: 11, fontWeight: '600', color: onPlan ? palette.accent : palette.critical }}
            >
              {onPlan ? '+' : ''}
              {gap.toFixed(1)} pts
            </Text>
          </View>
        </View>
      </View>

      {/* The bar with a plan marker: "56" becomes "56 against a plan of 90",
          which is the question the operator actually has. */}
      <View
        style={{
          position: 'relative',
          height: 6,
          borderRadius: 6,
          marginTop: STEP * 4,
          backgroundColor: palette.track,
        }}
      >
        <View style={{ width: `${scorePct}%`, height: '100%', borderRadius: 6, backgroundColor: scoreTone }} />
        <View
          style={{
            position: 'absolute',
            left: `${targetPct}%`,
            top: -3,
            width: 1.5,
            height: 12,
            borderRadius: 1,
            backgroundColor: palette.ink,
            opacity: 0.55,
          }}
        />
      </View>

      <Divider palette={palette} style={{ marginTop: PAD, marginBottom: STEP * 3 }} />

      {/* --- the fleet behind it -------------------------------------------- */}
      <Kicker palette={palette}>Asset distribution</Kicker>

      <View style={{ flexDirection: 'row', gap: STEP * 2, marginTop: STEP * 3 }}>
        <DistributionCell label="Critical" count={distribution.critical} tone={palette.critical} palette={palette} />
        <DistributionCell label="At risk" count={distribution.atRisk} tone={palette.warning} palette={palette} />
        <DistributionCell label="Neutral" count={distribution.neutral} tone={palette.neutral} palette={palette} />
        <DistributionCell label="Healthy" count={distribution.healthy} tone={palette.accent} palette={palette} />
      </View>

      <View
        accessibilityLabel={`${distribution.healthy} of ${total} assets healthy`}
        style={{
          flexDirection: 'row',
          height: 6,
          borderRadius: 6,
          overflow: 'hidden',
          marginTop: STEP * 3.5,
          backgroundColor: total > 0 ? palette.track : alpha(palette.ink, 0.05),
        }}
      >
        <Segment count={distribution.critical} total={total} color={palette.critical} />
        <Segment count={distribution.atRisk} total={total} color={palette.warning} />
        <Segment count={distribution.neutral} total={total} color={palette.neutral} />
        <Segment count={distribution.healthy} total={total} color={palette.accent} />
      </View>
    </Panel>
  );
}
