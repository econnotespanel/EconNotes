export const DEVICE_NOTIFICATION_PREFERENCE = 'econnotes-device-notifications';

export const isDeviceNotificationEnabled = (userId: string) =>
  localStorage.getItem(`${DEVICE_NOTIFICATION_PREFERENCE}:${userId}`) === 'true';

export const setDeviceNotificationEnabled = (userId: string, enabled: boolean) => {
  localStorage.setItem(`${DEVICE_NOTIFICATION_PREFERENCE}:${userId}`, String(enabled));
  window.dispatchEvent(new Event('econnotes-device-notification-preference'));
};

export const getNotificationCursorKey = (userId: string, type: 'notes' | 'announcements') =>
  `${DEVICE_NOTIFICATION_PREFERENCE}:${userId}:${type}-cursor`;
