import { useState } from 'react';

import { PERMISSIONS } from '../../lib/permissions';
import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';
import { FormField } from './FormField';

export type NewProject = {
  name: string;
  code: string;
  description: string;
};

type CreateProjectDialogProps = {
  visible: boolean;
  onCancel: () => void;
  onCreate: (project: NewProject) => void;
};

export function CreateProjectDialog({ visible, onCancel, onCreate }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  const canCreate = name.trim().length > 0;

  const handleClose = () => {
    setName('');
    setCode('');
    setDescription('');
    onCancel();
  };

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({ name: name.trim(), code: code.trim(), description: description.trim() });
    setName('');
    setCode('');
    setDescription('');
  };

  return (
    <Dialog
      visible={visible}
      title="Create Project"
      onRequestClose={handleClose}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={handleClose} />
          <ActionButton
            label="Create"
            permission={PERMISSIONS.PROJECT_CREATE}
            onPress={handleCreate}
            disabled={!canCreate}
          />
        </>
      }
    >
      <FormField label="Project Name" required value={name} onChangeText={setName} placeholder="e.g. ABC Monitoring Project" />
      <FormField label="Project Code" value={code} onChangeText={setCode} placeholder="Optional" />
      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
    </Dialog>
  );
}
