import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAnalytics } from '../../../lib/plantAnalytics';
import { ImpulseChart, Measured } from './PlantCharts';
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
  palette: ConsolePalette;
  isDark: boolean;
}

export function PlantAnalyticsPanel({
  analytics,
  kpis,
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

  // Throughput values from telemetry/KPIs
  const channelKpi = kpis.find((k) => k.id === 'channels');
  const throughputCurrent = channelKpi ? parseFloat(channelKpi.value) || 3.6 : 3.6;

  const demoImpulseData = [0.8, 1.2, 0.9, 1.6, 1.1, 0.7, 2.1, 1.4, 2.8, 4.2, 3.1, 1.5, 0.9, 1.3];
  const demoTimeLabels = ['03:20', '03:28', '03:35', '03:44'];

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

        {/* --- 3. EXPANDED TELEMETRY THROUGHPUT (PACKETS / S) --- */}
        <PanelSection title="Throughput Telemetry Pipeline" palette={palette}>
          <View style={{ gap: STEP * 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text className="font-display tabular-nums" style={{ fontSize: 32, fontWeight: '700', color: palette.ink }}>
                  {throughputCurrent.toFixed(1)}
                </Text>
                <Text className="font-mono" style={{ fontSize: 11, color: palette.inkMuted, fontWeight: '600' }}>
                  pkt/s
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: palette.accentSoft,
                  borderWidth: 1,
                  borderColor: 'rgba(16, 185, 129, 0.25)',
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent }} />
                <Text className="font-mono" style={{ fontSize: 9.5, color: palette.accent, fontWeight: '700' }}>
                  MQTT STREAM
                </Text>
              </View>
            </View>

            {/* Gigaton Impulse Chart */}
            <View style={{ height: 110, marginTop: 2 }}>
              <Measured>
                {({ width, height }) => (
                  <ImpulseChart
                    values={demoImpulseData}
                    xLabels={demoTimeLabels}
                    width={width}
                    height={height}
                    palette={palette}
                    color={palette.accent}
                  />
                )}
              </Measured>
            </View>

            {/* In-Depth Statistical Grid */}
            <View
              style={{
                borderRadius: 8,
                padding: STEP * 2,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                borderWidth: 1,
                borderColor: palette.line,
                gap: STEP * 1.5,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <MicroLabel palette={palette} size={9.5}>
                    AVERAGE RATE
                  </MicroLabel>
                  <Text className="font-mono tabular-nums" style={{ fontSize: 12, color: palette.ink, marginTop: 2, fontWeight: '600' }}>
                    2.8 pkt/s
                  </Text>
                </View>

                <View>
                  <MicroLabel palette={palette} size={9.5}>
                    PEAK RATE
                  </MicroLabel>
                  <Text className="font-mono tabular-nums" style={{ fontSize: 12, color: palette.accent, marginTop: 2, fontWeight: '700' }}>
                    6.6 pkt/s
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <MicroLabel palette={palette} size={9.5}>
                    RELIABILITY
                  </MicroLabel>
                  <Text className="font-mono tabular-nums" style={{ fontSize: 12, color: palette.accent, marginTop: 2, fontWeight: '700' }}>
                    99.9%
                  </Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: palette.line }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.inkFaint }}>
                  LATENCY: 14ms
                </Text>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.inkFaint }}>
                  PACKET LOSS: 0%
                </Text>
                <Text className="font-mono" style={{ fontSize: 10, color: palette.inkMuted, fontWeight: '600' }}>
                  03:44 PM
                </Text>
              </View>
            </View>
          </View>
        </PanelSection>
      </ScrollView>
    </PlantCard>
  );
}
