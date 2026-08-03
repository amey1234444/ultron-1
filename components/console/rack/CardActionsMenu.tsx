import type { CardNode } from '../../../lib/rack';
import { MenuContainer, MenuDivider, MenuItem } from '../Menu';

export type CardActionsMenuState = { x: number; y: number; card: CardNode };

type CardActionsMenuProps = {
  state: CardActionsMenuState | null;
  onClose: () => void;
  onConfigure: (card: CardNode) => void;
  onViewChannels: (card: CardNode) => void;
  onMoveCard: (card: CardNode) => void;
  onReplaceCard: (card: CardNode) => void;
  onRemoveCard: (card: CardNode) => void;
  onRunDiagnostics: (card: CardNode) => void;
  onViewHistory: (card: CardNode) => void;
  canEditDeleteSchema: boolean;
};

export function CardActionsMenu({
  state,
  onClose,
  onConfigure,
  onViewChannels,
  onMoveCard,
  onReplaceCard,
  onRemoveCard,
  onRunDiagnostics,
  onViewHistory,
  canEditDeleteSchema,
}: CardActionsMenuProps) {
  if (!state) return null;
  const { card } = state;
  const run = (fn: (c: CardNode) => void) => () => {
    fn(card);
    onClose();
  };

  return (
    <MenuContainer x={state.x} y={state.y} onClose={onClose}>
      {canEditDeleteSchema && <MenuItem label="Configure" onPress={run(onConfigure)} />}
      <MenuItem label="View Channels" onPress={run(onViewChannels)} />
      {canEditDeleteSchema && (
        <>
          <MenuDivider />
          <MenuItem label="Move Card" onPress={run(onMoveCard)} />
          <MenuItem label="Replace Card" onPress={run(onReplaceCard)} />
        </>
      )}
      <MenuDivider />
      <MenuItem label="Run Diagnostics" onPress={run(onRunDiagnostics)} />
      <MenuItem label="View History" onPress={run(onViewHistory)} />
      {canEditDeleteSchema && (
        <>
          <MenuDivider />
          <MenuItem label="Remove Card" onPress={run(onRemoveCard)} danger />
        </>
      )}
    </MenuContainer>
  );
}
