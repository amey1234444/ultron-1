import { useEffect, useState } from 'react';

import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';
import { FormField } from './FormField';

type RenameDialogProps = {
  visible: boolean;
  currentName: string;
  onCancel: () => void;
  onRename: (name: string) => void;
};

export function RenameDialog({ visible, currentName, onCancel, onRename }: RenameDialogProps) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  const canSave = name.trim().length > 0;

  return (
    <Dialog
      visible={visible}
      title="Rename"
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton label="Save" onPress={() => canSave && onRename(name.trim())} disabled={!canSave} />
        </>
      }
    >
      <FormField label="Name" required value={name} onChangeText={setName} />
    </Dialog>
  );
}
