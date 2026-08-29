/**
 * Open findings, ranked — the plant's "so what should I do about it".
 *
 * The row is built around the sentence an engineer needs and nothing else:
 * what was found, what to do, and what it was found on. Those are three
 * distinct kinds of statement, so they get three distinct treatments — the
 * finding in muted prose, the action in ink because it is the instruction, and
 * the evidence in mono because it is a tag and a reading somebody will match
 * character by character against a drawing.
 *
 * Priority is a rail down the left edge rather than a word on the right. In a
 * narrow column a coloured edge is readable at a glance from the top of the
 * list to the bottom, which is what ranking is for; a right-aligned word has to
 * be read one row at a time. The word is still there beside the title for
 * anyone who cannot separate the hues — priority never travels as colour alone.
 */
import { Text, View } from 'react-native';

import { type ConsolePalette } from '../../../../lib/consoleTheme';
import type { Insight } from '../../../../lib/dashboardMetrics';
import { STEP } from '../PlantSurfaces';
import { PAD, Panel, PanelHeader } from './OverviewChrome';

function priorityTone(palette: ConsolePalette, priority: Insight['priority']): string {
  if (priority === 'High') return palette.critical;
  if (priority === 'Medium') return palette.warning;
  // Low is informational, and the info hue is the one non-status colour in the
  // system — a low-priority finding must not read as "healthy".
  return palette.info;
}

function FindingRow({
  insight,
  palette,
  last,
}: {
  insight: Insight;
  palette: ConsolePalette;
  last: boolean;
}) {
  const tone = priorityTone(palette, insight.priority);

  return (
    <View
      style={{
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: STEP * 2.5,
        paddingLeft: PAD,
        paddingRight: PAD - 2,
        paddingVertical: STEP * 2.75,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: palette.lineSubtle,
      }}
    >
      {/* The priority rail. Inset top and bottom so it marks the row rather
          than butting into the hairlines above and below it. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: STEP * 2.25,
          bottom: STEP * 2.25,
          width: 2,
          borderRadius: 2,
          backgroundColor: tone,
        }}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 2.5 }}>
          <Text numberOfLines={1} className="font-body-bold" style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: palette.ink }}>
            {insight.subject}
          </Text>
          <Text className="font-mono" style={{ fontSize: 9, letterSpacing: 0.6, fontWeight: '700', color: tone }}>
            {insight.priority.toUpperCase()}
          </Text>
        </View>

        {/* One paragraph, two voices: the observation, then the instruction. */}
        <Text className="font-body" style={{ marginTop: 4, fontSize: 11.5, lineHeight: 16, color: palette.inkMuted }}>
          {insight.finding}.{' '}
          <Text className="font-body-medium" style={{ color: palette.ink }}>
            {insight.recommendation}.
          </Text>
        </Text>

        <Text numberOfLines={1} className="font-mono" style={{ marginTop: 5, fontSize: 10, lineHeight: 14, color: palette.inkFaint }}>
          {insight.evidence}
        </Text>
      </View>

      <View style={{ width: 42, alignItems: 'flex-end' }}>
        <Text className="font-mono" style={{ fontSize: 11, fontWeight: '600', color: palette.inkMuted }}>
          {insight.confidence}
        </Text>
        <Text className="font-mono" style={{ marginTop: 1, fontSize: 8, letterSpacing: 0.7, color: palette.inkFaint }}>
          CONF.
        </Text>
      </View>
    </View>
  );
}

export function FindingsPanel({
  findings,
  palette,
  isDark,
}: {
  findings: Insight[];
  palette: ConsolePalette;
  isDark: boolean;
}) {
  return (
    <Panel palette={palette} isDark={isDark} style={{ paddingTop: PAD }}>
      <View style={{ paddingHorizontal: PAD, paddingBottom: STEP * 3 }}>
        <PanelHeader
          label="Findings"
          subtitle="Prioritized engineering events"
          palette={palette}
          right={
            <Text className="font-mono" style={{ fontSize: 10.5, color: palette.inkFaint }}>
              {findings.length} open
            </Text>
          }
        />
      </View>

      {findings.length === 0 ? (
        <View style={{ paddingHorizontal: PAD, paddingBottom: PAD, paddingTop: STEP }}>
          <Text className="font-body" style={{ fontSize: 11.5, color: palette.inkFaint }}>
            Nothing open. Every monitored point is inside its limits.
          </Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: palette.lineSubtle }}>
          {findings.map((insight, index) => (
            <FindingRow
              key={insight.id}
              insight={insight}
              palette={palette}
              last={index === findings.length - 1}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}
