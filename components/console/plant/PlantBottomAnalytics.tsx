import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAnalytics } from '../../../lib/plantAnalytics';
import { HealthEnvelopeChart, Measured, MicroSparkline } from './PlantCharts';
import { MicroLabel, PlantCard, STEP } from './PlantSurfaces';

interface PlantBottomAnalyticsProps {
  analytics: PlantAnalytics;
  alarmBars: { labels: string[]; critical: number[]; warning: number[]; info: number[] };
  alarmCounts: { critical: number; warning: number; info: number };
  live: boolean;
  palette: ConsolePalette;
  isDark: boolean;
  stacked?: boolean;
}

export function PlantBottomAnalytics({
  analytics,
  alarmCounts,
  live,
  palette,
  isDark,
  stacked = false,
}: PlantBottomAnalyticsProps) {
  const { assets } = analytics;

  const demoHealthHistory = [74, 76, 75, 78, 77, 76, 78, 76];
  const demoTimeLabels = ['03:20 PM', '03:28 PM', '03:35 PM', '03:44 PM'];

  // Needs Attention assets (sorted by health ascending, showing assets that need attention first)
  const attentionList = [...assets].sort((a, b) => a.health - b.health).slice(0, 3);

  return (
    <View
      style={{
        flex: stacked ? undefined : 1,
        flexDirection: stacked ? 'column' : 'row',
        gap: STEP * 2,
        minHeight: 0,
      }}
    >
      {/* --- PANEL 1: HEALTH SCORE --- */}
      <PlantCard
        palette={palette}
        isDark={isDark}
        style={{ flex: 1.4, minWidth: 320, minHeight: 0, padding: STEP * 3, paddingBottom: STEP * 2 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MicroLabel palette={palette} size={11}>
              HEALTH SCORE
            </MicroLabel>
          </View>
        </View>

        {/* Envelope Chart. The statistical rail that used to close this card —
            current, mean, min, max, std dev — is gone: the chart already draws
            the current value at its endpoint and labels its own maximum and
            minimum, so the rail was the same four numbers restated as text
            directly under the picture of them. */}
        <View style={{ flex: 1, minHeight: 0, marginTop: STEP * 1.5 }}>
          <Measured>
            {({ width, height }) => (
              <HealthEnvelopeChart
                values={demoHealthHistory}
                xLabels={demoTimeLabels}
                width={width}
                height={height}
                palette={palette}
                target={90}
                critical={60}
                currentVal={76}
              />
            )}
          </Measured>
        </View>
      </PlantCard>

      {/* --- PANEL 2: NEEDS ATTENTION (Priority Queue) --- */}
      <PlantCard
        palette={palette}
        isDark={isDark}
        style={{ flex: 1.1, minWidth: 280, minHeight: 0, padding: STEP * 3 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <MicroLabel palette={palette} size={11}>
            NEEDS ATTENTION
          </MicroLabel>
          <Text className="font-mono" style={{ fontSize: 11, color: palette.accent, fontWeight: '600' }}>
            View all
          </Text>
        </View>

        <View style={{ flex: 1, marginTop: STEP * 2, gap: STEP * 1.5 }}>
          {attentionList.map((asset, index) => {
            const gap = asset.health - 90;
            const tone = asset.health >= 85 ? palette.accent : asset.health >= 75 ? palette.warning : palette.critical;

            return (
              <View
                key={asset.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: STEP * 1.5,
                  paddingHorizontal: STEP * 1.5,
                  borderRadius: 6,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  borderLeftWidth: 3,
                  borderLeftColor: tone,
                }}
              >
                <Text className="font-mono tabular-nums" style={{ fontSize: 12, color: palette.inkFaint, width: 24, fontWeight: '600' }}>
                  0{index + 1}
                </Text>

                <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                  <Text numberOfLines={1} style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: '600', color: palette.ink }}>
                    {asset.name}
                  </Text>
                  <Text className="font-mono" style={{ fontSize: 10, color: tone, marginTop: 1, textTransform: 'capitalize' }}>
                    {asset.status.toLowerCase()}
                  </Text>
                </View>

                {/* Score Only (No Sparkline symbol) */}
                <View style={{ alignItems: 'flex-end', minWidth: 56 }}>
                  <Text className="font-mono tabular-nums" style={{ fontSize: 13, fontWeight: '700', color: palette.ink }}>
                    {asset.health} <Text style={{ fontSize: 9.5, color: palette.inkFaint }}>/100</Text>
                  </Text>
                  <Text className="font-mono tabular-nums" style={{ fontSize: 10, fontWeight: '600', color: gap >= 0 ? palette.accent : palette.critical }}>
                    {gap >= 0 ? `+${gap}` : `${gap}`} pts
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </PlantCard>

      {/* --- PANEL 3: ACTIVITY & INSIGHTS (Operational Event Stream) --- */}
      <PlantCard
        palette={palette}
        isDark={isDark}
        style={{ flex: 1, minWidth: 260, minHeight: 0, padding: STEP * 3 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <MicroLabel palette={palette} size={10.5}>
            ACTIVITY & INSIGHTS
          </MicroLabel>
          <Text className="font-mono" style={{ fontSize: 10, color: palette.accent, fontWeight: '600' }}>
            View all
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: STEP * 2 }}>
          <View style={{ gap: STEP * 2, paddingLeft: 6 }}>
            {/* Event 1 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent, marginTop: 3 }} />
                <View style={{ width: 1, flex: 1, backgroundColor: palette.line, marginTop: 4 }} />
              </View>
              <View style={{ flex: 1, paddingBottom: STEP }}>
                <Text className="font-mono" style={{ fontSize: 9.5, color: palette.inkFaint }}>
                  03:44 PM
                </Text>
                <Text style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11.5, fontWeight: '600', color: palette.ink, marginTop: 1 }}>
                  Systems normal
                </Text>
                <Text style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10.5, color: palette.inkMuted, marginTop: 1 }}>
                  No critical alarms across components
                </Text>
              </View>
            </View>

            {/* Event 2 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warning, marginTop: 3 }} />
                <View style={{ width: 1, flex: 1, backgroundColor: palette.line, marginTop: 4 }} />
              </View>
              <View style={{ flex: 1, paddingBottom: STEP }}>
                <Text className="font-mono" style={{ fontSize: 9.5, color: palette.inkFaint }}>
                  03:42 PM
                </Text>
                <Text style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11.5, fontWeight: '600', color: palette.ink, marginTop: 1 }}>
                  Utility Area needs attention
                </Text>
                <Text style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10.5, color: palette.inkMuted, marginTop: 1 }}>
                  Health score below target (73/100)
                </Text>
              </View>
            </View>

            {/* Event 3 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent, marginTop: 3 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="font-mono" style={{ fontSize: 9.5, color: palette.inkFaint }}>
                  03:32 PM
                </Text>
                <Text style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11.5, fontWeight: '600', color: palette.ink, marginTop: 1 }}>
                  Throughput spike detected
                </Text>
                <Text style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10.5, color: palette.inkMuted, marginTop: 1 }}>
                  Peak rate reached 4.2 packets/s
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </PlantCard>
    </View>
  );
}
