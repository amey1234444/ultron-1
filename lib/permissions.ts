// Permission identifiers for every interactive element, per the spec's "permission-ready
// frontend" requirement. Not enforced yet (full-access dev user) — the backend must
// independently authorize every action. Frontend visibility is not security.
export const PERMISSIONS = {
  PROJECT_CREATE: 'project.create',
  HIERARCHY_FOLDER_CREATE: 'hierarchy.folder.create',
  MACHINE_CREATE: 'machine.create',
  DEVICE_CREATE: 'device.create',
  DEVICE_CARD_CONFIGURE: 'device.card.configure',
  CHANNEL_BINDING_CREATE: 'channel.binding.create',
  MONITORING_LIVE_VIEW: 'monitoring.live.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
