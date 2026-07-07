import { PERMISSIONS } from '../../lib/permissions';
import { MenuContainer, MenuDivider, MenuItem } from './Menu';

export type ContextMenuTarget =
  | { kind: 'project'; id: string }
  | { kind: 'folder'; id: string; projectId: string };

export type ContextMenuState = {
  x: number;
  y: number;
  target: ContextMenuTarget;
  /** Whether "Add Machine" is allowed here — only inside an actual folder, per spec §4.3. */
  canAddMachine: boolean;
};

type ContextMenuProps = {
  state: ContextMenuState | null;
  onClose: () => void;
  onAddFolder: (target: ContextMenuTarget) => void;
  onAddMachine: (target: ContextMenuTarget) => void;
  onRename: (target: ContextMenuTarget) => void;
  onDuplicate: (target: ContextMenuTarget) => void;
  onMove: (target: ContextMenuTarget) => void;
  onDelete: (target: ContextMenuTarget) => void;
};

export function ContextMenu({ state, onClose, onAddFolder, onAddMachine, onRename, onDuplicate, onMove, onDelete }: ContextMenuProps) {
  if (!state) return null;

  const isFolder = state.target.kind === 'folder';
  const run = (fn: (t: ContextMenuTarget) => void) => () => {
    fn(state.target);
    onClose();
  };

  return (
    <MenuContainer x={state.x} y={state.y} onClose={onClose}>
      <MenuItem label="Add Folder" onPress={run(onAddFolder)} testID={`permission:${PERMISSIONS.HIERARCHY_FOLDER_CREATE}`} />
      <MenuItem
        label="Add Machine"
        onPress={run(onAddMachine)}
        disabled={!state.canAddMachine}
        hint={!state.canAddMachine ? 'Select a folder first' : undefined}
        testID={`permission:${PERMISSIONS.MACHINE_CREATE}`}
      />
      <MenuDivider />
      <MenuItem label="Rename" onPress={run(onRename)} />
      <MenuItem label="Duplicate" onPress={run(onDuplicate)} />
      <MenuItem label="Move" onPress={run(onMove)} disabled={!isFolder} hint={!isFolder ? 'Projects can’t be moved' : undefined} />
      <MenuDivider />
      <MenuItem label="Delete" onPress={run(onDelete)} danger />
    </MenuContainer>
  );
}
