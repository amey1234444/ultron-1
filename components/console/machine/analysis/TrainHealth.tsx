import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { CONDITION_HEX, CONDITION_LABEL, type OverviewCondition } from '../../../../lib/analysisOverview';
import type { ComponentType } from '../../../../lib/machines';
import { ComponentTypeIcon } from '../machineIcons';

// One element of the monitored train. Assembled by the page from the machine's
// own component list, never hardcoded: an extruder has a screw, a barrel and a
// die where a pump has an impeller, and the train has to be whatever the machine
// is configured to be.
export type TrainNode = {
  id: string;
  name: string;
  // What it is or where it sits — "output bearing · DE".
  detail: string;
  type: ComponentType | null;
  condition: OverviewCondition;
  health: number | null;
  // The single most relevant live figure for this element.
  metricLabel: string;
  metricValue: string;
  // Why it reads the way it does, in one line.
  observation: string;
};

const NODE_WIDTH = 208;

function HealthBar({ health, colour }: { health: number | null; colour: string }) {
  const { isDark } = useAppTheme();
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: track }} className="w-full overflow-hidden">
      {health !== null && (
        <View style={{ height: 5, borderRadius: 3, width: `${Math.max(0, Math.min(100, health))}%`, backgroundColor: colour }} />
      )}
    </View>
  );
}

function Node({ node, onPress }: { node: TrainNode; onPress?: (node: TrainNode) => void }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const monitored = node.health !== null;
  const colour = monitored ? CONDITION_HEX[node.condition] : CONDITION_HEX.offline;

  const body = (
    <View
      style={{ borderColor: monitored ? `${colour}40` : hairline }}
      className={cn('flex-1 gap-2.5 rounded-xl border px-3 py-3', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 flex-row items-center gap-1.5">
          {node.type ? <ComponentTypeIcon type={node.type} color={isDark ? '#F5F5F5' : '#0A0A0A'} size={14} /> : null}
          <Text numberOfLines={1} className={cn('flex-1 font-body-bold text-[12px]', inkClass)}>
            {node.name}
          </Text>
        </View>
        <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 3, backgroundColor: colour }} />
      </View>

      <Text numberOfLines={1} className={cn('font-mono text-[9px]', mutedClass)}>
        {node.detail}
      </Text>

      {monitored ? (
        <>
          <View className="flex-row items-end justify-between">
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>HEALTH</Text>
            <View className="flex-row items-baseline gap-1.5">
              <Text style={{ color: colour }} className="font-mono text-[17px] font-bold tabular-nums">
                {Math.round(node.health as number)}%
              </Text>
              <Text style={{ color: colour }} className="font-mono text-[8px] font-bold tracking-wider">
                {CONDITION_LABEL[node.condition]}
              </Text>
            </View>
          </View>

          <HealthBar health={node.health} colour={colour} />

          <View className="flex-row items-center justify-between gap-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: hairline }}>
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{node.metricLabel}</Text>
            <Text numberOfLines={1} className={cn('font-mono text-[11px] tabular-nums', inkClass)}>
              {node.metricValue}
            </Text>
          </View>
        </>
      ) : (
        /* An element with nothing mapped to it has no condition. Reporting it as
           healthy would make an unmonitored component the most reassuring thing
           on the page. */
        <View className="py-1">
          <Text className={cn('font-body text-[10px] italic', mutedClass)}>Not monitored</Text>
        </View>
      )}

      {/* Pushed to the bottom of the card rather than following the block above
          it, so the observation lines read across the train as one row instead
          of stepping with whatever each element had to say above them. */}
      <Text numberOfLines={2} className={cn('mt-auto font-body text-[10px] leading-[14px]', mutedClass)}>
        {node.observation}
      </Text>
    </View>
  );

  // The width lives on the outer wrapper so the card itself is free to grow down
  // the cross axis — every element in the train is the same height whatever it
  // has to report, which is what makes the row read as one machine.
  return (
    <View style={{ width: NODE_WIDTH }}>
      {onPress ? (
        <Pressable
          onPress={() => onPress(node)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${node.name}`}
          className="flex-1"
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
}

// The train as the machine is actually built, left to right, with the connector
// between elements drawn so the sequence reads as a power path rather than as
// five unrelated cards.
//
// Horizontal and scrollable inside its own container: the sequence is the
// information, so wrapping it into a grid would destroy the one thing this
// section exists to show. The page body never scrolls sideways.
export function TrainHealth({
  nodes,
  criticalPath,
  onSelectNode,
}: {
  nodes: TrainNode[];
  criticalPath?: string;
  onSelectNode?: (node: TrainNode) => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const connector = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  const counts = nodes.reduce<Record<string, number>>((acc, n) => {
    if (n.health === null) return acc;
    acc[n.condition] = (acc[n.condition] ?? 0) + 1;
    return acc;
  }, {});
  const mix = (['danger', 'alert', 'attention', 'healthy'] as OverviewCondition[])
    .filter((c) => counts[c])
    .map((c) => `${counts[c]} ${CONDITION_LABEL[c]}`)
    .join(' · ');

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-end justify-between gap-2">
        <View>
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Machine train health</Text>
          <Text numberOfLines={1} className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>
            {nodes.map((n) => n.name.toUpperCase()).join('  →  ')}
          </Text>
        </View>
        {mix ? <Text className={cn('font-mono text-[9px]', mutedClass)}>{mix}</Text> : null}
      </View>

      {nodes.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>
          This machine has no components configured, so there is no train to show.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
          <View className="flex-row items-stretch">
            {nodes.map((node, index) => (
              <View key={node.id} className="flex-row items-stretch">
                {index > 0 ? (
                  <View className="flex-row items-center" style={{ width: 26 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: connector }} />
                    <Text style={{ color: connector }} className="font-mono text-[12px]">
                      ›
                    </Text>
                  </View>
                ) : null}
                <Node node={node} onPress={onSelectNode} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* What the train is telling you, so it works as a navigation aid rather
          than as decoration. */}
      {criticalPath ? (
        <View className="rounded-lg border px-3.5 py-2.5" style={{ borderColor: hairline }}>
          <Text className={cn('font-body text-[11px] leading-[17px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
            <Text style={{ color: CONDITION_HEX.danger }} className="font-body-bold">
              Critical path:{' '}
            </Text>
            {criticalPath}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
