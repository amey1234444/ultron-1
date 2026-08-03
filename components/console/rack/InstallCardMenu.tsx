import { allowedCardTypesForSlot, type CardType } from '../../../lib/rack';
import { MenuContainer, MenuItem } from '../Menu';

export type InstallCardMenuState = { x: number; y: number; slot: number };

type InstallCardMenuProps = {
  state: InstallCardMenuState | null;
  onClose: () => void;
  onSelect: (slot: number, type: CardType) => void;
};

export function InstallCardMenu({ state, onClose, onSelect }: InstallCardMenuProps) {
  if (!state) return null;
  const options = allowedCardTypesForSlot(state.slot);

  return (
    <MenuContainer x={state.x} y={state.y} onClose={onClose}>
      {options.map((type) => (
        <MenuItem
          key={type}
          label={type}
          onPress={() => {
            onSelect(state.slot, type);
            onClose();
          }}
        />
      ))}
    </MenuContainer>
  );
}
