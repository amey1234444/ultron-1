/**
 * Native fallback for the full-bleed plant workspace.
 *
 * Docking panels onto a canvas only makes sense where there is a WebGL canvas to
 * dock onto, so on native the same slots are stacked vertically in a scroll view
 * instead. Keeps the Expo bundle free of the DOM shell in `PlantWorkspace.web`.
 */
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

export type PlantKpi = {
  label: string;
  value: string;
  unit?: string;
  progress?: number;
  plan?: string;
  tone: string;
};

export type PlantWorkspaceProps = {
  canvas: ReactNode;
  kpis: PlantKpi[];
  rail: ReactNode;
  dock: ReactNode;
  title: string;
  meta?: string;
  live?: boolean;
  dark: boolean;
  compact?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
};

export default function PlantWorkspace({ canvas, kpis, rail, dock, title, meta, dark }: PlantWorkspaceProps) {
  const ink = dark ? '#F7F6F2' : '#0A0B0D';
  const inkMuted = dark ? '#8B8D93' : '#5C6068';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,11,13,0.10)';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: ink }}>{title}</Text>
        {meta ? <Text style={{ fontSize: 10.5, color: inkMuted }}>{meta}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {kpis.map((kpi) => (
          <View key={kpi.label} style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 10, minWidth: 140 }}>
            <Text style={{ fontSize: 9, letterSpacing: 1.2, color: inkMuted }}>{kpi.label.toUpperCase()}</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: ink, marginTop: 2 }}>
              {kpi.value}
              {kpi.unit ? <Text style={{ fontSize: 11, color: inkMuted }}>{kpi.unit}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ height: 320, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: border }}>{canvas}</View>
      {rail}
      {dock}
    </ScrollView>
  );
}
