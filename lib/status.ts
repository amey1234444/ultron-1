export type Status = 'success' | 'warning' | 'critical';

export const STATUS_HEX: Record<Status, string> = {
  success: '#6EF08A',
  warning: '#E3B341',
  critical: '#F2624A',
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
