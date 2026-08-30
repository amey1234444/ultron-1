import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { conditionHexes, CONDITION_LABEL } from '../../../../lib/analysisOverview';
import type { AnalystTreeNode } from '../../../../lib/advancedDiagnosis';
import { cn } from '../../../../lib/cn';

const KIND_MARK: Record<AnalystTreeNode['kind'], string> = {
  machine: 'M',
  component: 'C',
  subcomponent: 'S',
  location: 'L',
  signal: '~',
};

// Machine → component → subcomponent → measurement location → signal.
//
// The depth is the point: an analyst descends it to isolate, and the level a
// finding sits at is itself information — energy strongest at one location means
// something different from energy present across a whole component. Condition is
// shown at every level so the descent is guided rather than guessed.
export function AnalysisTree({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: {
  nodes: AnalystTreeNode[];
  selectedId: string;
  onSelect: (node: AnalystTreeNode) => void;
  depth?: number;
}) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <>
      {nodes.map((node) => {
        const selected = node.id === selectedId;
        const colour = node.condition ? conditionHex[node.condition] : conditionHex.offline;

        return (
          <View key={node.id}>
            <Pressable
              onPress={() => onSelect(node)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${node.name}${node.condition ? `, ${CONDITION_LABEL[node.condition]}` : ''}`}
              className={cn('flex-row items-center gap-1.5 rounded py-1.5 pr-1.5', selected && 'bg-accent/10')}
              style={{ paddingLeft: 6 + depth * 11 }}
            >
              <Text style={{ width: 9 }} className={cn('font-mono text-[9.5px]', mutedClass)}>
                {KIND_MARK[node.kind]}
              </Text>

              <Text
                numberOfLines={1}
                className={cn('flex-1 font-body text-[12.5px]', selected ? 'text-accent' : node.kind === 'signal' ? mutedClass : inkClass)}
              >
                {node.name}
              </Text>

              {node.condition ? (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour }} />
              ) : null}
            </Pressable>

            {node.children ? (
              <AnalysisTree nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
            ) : null}
          </View>
        );
      })}
    </>
  );
}
