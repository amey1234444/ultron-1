export type Status = 'success' | 'warning' | 'critical';

export const STATUS_HEX: Record<Status, string> = {
  success: '#3FBF6A',
  warning: '#D9962B',
  critical: '#D64545',
};

export const STATUS_BG_CLASS: Record<Status, string> = {
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
};

export const STATUS_LABEL: Record<Status, string> = {
  success: 'healthy',
  warning: 'warning',
  critical: 'critical',
};
