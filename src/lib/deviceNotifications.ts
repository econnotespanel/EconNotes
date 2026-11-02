export const DEVICE_NOTIFICATION_PREFERENCE = 'econnotes-device-notifications';

export const isDeviceNotificationEnabled = (userId: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  // If the browser permission is granted, notifications are enabled by default
  // unless the user explicitly toggled them off ('false')
  return localStorage.getItem(`${DEVICE_NOTIFICATION_PREFERENCE}:${userId}`) !== 'false';
};

export const setDeviceNotificationEnabled = (userId: string, enabled: boolean) => {
  localStorage.setItem(`${DEVICE_NOTIFICATION_PREFERENCE}:${userId}`, String(enabled));
  window.dispatchEvent(new Event('econnotes-device-notification-preference'));
};

export const getNotificationCursorKey = (userId: string, type: 'notes' | 'announcements') =>
  `${DEVICE_NOTIFICATION_PREFERENCE}:${userId}:${type}-cursor`;
