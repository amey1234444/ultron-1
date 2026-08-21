import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { Insight } from '../../../lib/dashboardMetrics';
import type { PlantAnalytics } from '../../../lib/plantAnalytics';
import { MicroLabel, PanelSection, PlantCard, STEP } from './PlantSurfaces';

export type PlantKpi = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  progress: number;
  target?: number;
  caption: string;
  tone: string;
};

interface PlantAnalyticsPanelProps {
  analytics: PlantAnalytics;
  kpis: PlantKpi[];
  /** Open recommendations, ranked. Fills the slot the throughput pipeline vacated. */
  insights: Insight[];
  palette: ConsolePalette;
  isDark: boolean;
}

/**
 * One open recommendation.
 *
 * Findings used to live on a Diagnostics page nobody arrived at without going
 * looking. They belong on the plant view: the thing a reader wants after "how
 * is the plant" is "so what should I do about it", and that answer has no
 * business being a click away on a tab of its own.
 *
 * The priority is a rail down the left rather than a word on the right. In a
 * narrow column a coloured edge is readable at a glance from the top of the
 * list to the bottom, which is what ranking is for; a right-aligned word has to
 * be read one row at a time.
 */
function FindingRow({
  insight,
  palette,
  isDark,
}: {
  insight: Insight;
  palette: ConsolePalette;
  isDark: boolean;
}) {
  const tone =
    insight.priority === 'High' ? palette.critical : insight.priority === 'Medium' ? palette.warning : palette.accent;

  return (
    <View
      style={{
        paddingVertical: STEP * 1.5,
        paddingLeft: STEP * 1.5,
        paddingRight: STEP,
        borderRadius: 6,
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        borderLeftWidth: 3,
        borderLeftColor: tone,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12.5,
            fontWeight: '600',
            color: palette.ink,
          }}
        >
          {insight.subject}
        </Text>
        <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 1.2, color: tone, fontWeight: '700' }}>
          {insight.priority.toUpperCase()}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 11,
          lineHeight: 15,
          color: palette.inkMuted,
          marginTop: 3,
        }}
      >
        {insight.finding}. {insight.recommendation}.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <Text numberOfLines={1} className="font-mono" style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: palette.inkFaint }}>
          {insight.evidence}
        </Text>
        <Text className="font-mono tabular-nums" style={{ fontSize: 9.5, color: palette.inkMuted, fontWeight: '600' }}>
          {insight.confidence}
        </Text>
      </View>
    </View>
  );
}

export function PlantAnalyticsPanel({
  analytics,
  kpis,
  insights,
  palette,
  isDark,
}: PlantAnalyticsPanelProps) {
  const { performance, assets } = analytics;

  // Derive health score values from actual telemetry & KPIs
  const healthKpi = kpis.find((k) => k.id === 'health');
  const healthScore = healthKpi ? Math.round(parseFloat(healthKpi.value) || 76) : 76;
  const healthTarget = 90;
  const gapPts = (healthScore - healthTarget).toFixed(1);

  // Asset health stats
  const totalAssets = assets.length || 5;
  const onPlanCount = assets.filter((a) => a.health >= healthTarget).length;
  const worstAsset = assets.length > 0 ? [...assets].sort((a, b) => a.health - b.health)[0] : null;
  const bestAsset = assets.length > 0 ? [...assets].sort((a, b) => b.health - a.health)[0] : null;

  // Asset health categories
  const criticalCount = assets.filter((a) => a.status === 'critical').length;
  const atRiskCount = assets.filter((a) => a.status === 'warning').length;
  const neutralCount = assets.filter((a) => a.status === 'offline').length;
  const healthyCount = assets.filter((a) => a.status === 'healthy').length;

  return (
    <PlantCard palette={palette} isDark={isDark} style={{ flex: 1, minHeight: 0, padding: 0 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: STEP * 3.5, gap: STEP * 3.5 }}
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* --- 1. PLANT HEALTH SCORE --- */}
        <PanelSection title="Plant Health Score" palette={palette} first>
          <View style={{ gap: STEP * 2.5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text
                  className="font-display tabular-nums"
                  style={{ fontSize: 42, fontWeight: '700', color: palette.ink, lineHeight: 46 }}
                >
                  {healthScore}
                </Text>
                <Text className="font-body" style={{ fontSize: 13, color: palette.inkFaint }}>
                  /100
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text className="font-mono" style={{ fontSize: 10, color: palette.inkMuted }}>
                    TARGET
                  </Text>
                  <Text className="font-mono tabular-nums" style={{ fontSize: 13, fontWeight: '600', color: palette.ink }}>
                    {healthTarget}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: Number(gapPts) >= 0 ? palette.accentSoft : 'rgba(239, 68, 68, 0.12)',
                  }}
                >
                  <Text className="font-mono" style={{ fontSize: 9, color: palette.inkMuted, fontWeight: '600' }}>
                    GAP
                  </Text>
                  <Text
                    className="font-mono tabular-nums"
                    style={{
                      fontSize: 11.5,
                      fontWeight: '700',
                      color: Number(gapPts) >= 0 ? palette.accent : palette.critical,
                    }}
                  >
                    {Number(gapPts) >= 0 ? `+${gapPts}` : `${gapPts}`} pts
                  </Text>
                </View>
              </View>
            </View>

            {/* Asset status summary rail */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: STEP * 2,
                borderTopWidth: 1,
                borderTopColor: palette.line,
              }}
            >
              <View>
                <MicroLabel palette={palette} size={9}>
                  ASSETS ON PLAN
                </MicroLabel>
                <Text className="font-mono tabular-nums" style={{ fontSize: 14, fontWeight: '600', color: palette.accent, marginTop: 2 }}>
                  {onPlanCount} <Text style={{ fontSize: 11, color: palette.inkFaint }}>/ {totalAssets}</Text>
                </Text>
              </View>

              <View>
                <MicroLabel palette={palette} size={9}>
                  FURTHEST OFF
                </MicroLabel>
                <Text className="font-mono tabular-nums" style={{ fontSize: 14, fontWeight: '600', color: palette.critical, marginTop: 2 }}>
                  {worstAsset ? worstAsset.health : '—'}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <MicroLabel palette={palette} size={9}>
                  BEST ASSET
                </MicroLabel>
                <Text className="font-mono tabular-nums" style={{ fontSize: 14, fontWeight: '600', color: palette.accent, marginTop: 2 }}>
                  {bestAsset ? bestAsset.health : '—'}
                </Text>
              </View>
            </View>
          </View>
        </PanelSection>

        {/* --- 2. ASSET HEALTH DISTRIBUTION --- */}
        <PanelSection title="Asset Health Distribution" palette={palette}>
          <View style={{ gap: STEP * 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.critical, fontWeight: '700' }}>
                  CRITICAL
                </Text>
                <Text className="font-mono tabular-nums" style={{ fontSize: 16, fontWeight: '700', color: palette.ink, marginTop: 2 }}>
                  {criticalCount}
                </Text>
              </View>

              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.warning, fontWeight: '700' }}>
                  AT RISK
                </Text>
                <Text className="font-mono tabular-nums" style={{ fontSize: 16, fontWeight: '700', color: palette.ink, marginTop: 2 }}>
                  {atRiskCount}
                </Text>
              </View>

              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.neutral, fontWeight: '700' }}>
                  NEUTRAL
                </Text>
                <Text className="font-mono tabular-nums" style={{ fontSize: 16, fontWeight: '700', color: palette.ink, marginTop: 2 }}>
                  {neutralCount}
                </Text>
              </View>

              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.accent, fontWeight: '700' }}>
                  HEALTHY
                </Text>
                <Text className="font-mono tabular-nums" style={{ fontSize: 16, fontWeight: '700', color: palette.accent, marginTop: 2 }}>
                  {healthyCount}
                </Text>
              </View>
            </View>

            {/* Distribution Bar */}
            <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', flexDirection: 'row', overflow: 'hidden' }}>
              {criticalCount > 0 && <View style={{ flex: criticalCount, backgroundColor: palette.critical }} />}
              {atRiskCount > 0 && <View style={{ flex: atRiskCount, backgroundColor: palette.warning }} />}
              {neutralCount > 0 && <View style={{ flex: neutralCount, backgroundColor: palette.neutral }} />}
              {healthyCount > 0 && <View style={{ flex: healthyCount, backgroundColor: palette.accent }} />}
            </View>
          </View>
        </PanelSection>

        {/* --- 3. FINDINGS --- */}
        <PanelSection title="Findings" palette={palette} unit={`${insights.length} open`}>
          {insights.length === 0 ? (
            <Text
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 11.5,
                color: palette.inkMuted,
                paddingVertical: STEP * 3,
                textAlign: 'center',
              }}
            >
              No recommendations right now
            </Text>
          ) : (
            <View style={{ gap: STEP * 1.5 }}>
              {insights.map((insight) => (
                <FindingRow key={insight.id} insight={insight} palette={palette} isDark={isDark} />
              ))}
            </View>
          )}
        </PanelSection>
      </ScrollView>
    </PlantCard>
  );
}
