import type { DeviceNode } from '../../lib/devices';
import { PERMISSIONS } from '../../lib/permissions';
import { MenuContainer, MenuDivider, MenuItem } from './Menu';

export type DeviceMenuState = {
  x: number;
  y: number;
  device: DeviceNode;
};

type DeviceMenuProps = {
  state: DeviceMenuState | null;
  onClose: () => void;
  onOpen: (device: DeviceNode) => void;
  onEdit: (device: DeviceNode) => void;
  onTestConnection: (device: DeviceNode) => void;
  onAssign: (device: DeviceNode) => void;
  onUnassign: (device: DeviceNode) => void;
  onDelete: (device: DeviceNode) => void;
  onArchive: (device: DeviceNode) => void;
};

export function DeviceMenu({ state, onClose, onOpen, onEdit, onTestConnection, onAssign, onUnassign, onDelete, onArchive }: DeviceMenuProps) {
  if (!state) return null;
  const { device } = state;
  const run = (fn: (d: DeviceNode) => void) => () => {
    fn(device);
    onClose();
  };

  return (
    <MenuContainer x={state.x} y={state.y} onClose={onClose}>
      <MenuItem label="Open" onPress={run(onOpen)} />
      <MenuItem label="Edit" onPress={run(onEdit)} />
      <MenuItem label="Test Connection" onPress={run(onTestConnection)} testID={`permission:${PERMISSIONS.DEVICE_CREATE}`} />
      <MenuDivider />
      {device.projectId === null ? (
        <MenuItem label="Assign to Project" onPress={run(onAssign)} />
      ) : (
        <MenuItem label="Unassign from Project" onPress={run(onUnassign)} />
      )}
      <MenuDivider />
      {device.projectId === null ? (
        <MenuItem label="Delete" onPress={run(onDelete)} danger />
      ) : (
        <MenuItem label="Archive" onPress={run(onArchive)} hint="In use by a project" />
      )}
    </MenuContainer>
  );
}
