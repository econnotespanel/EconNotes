import { supabase } from '@/integrations/supabase/client';

export const DEVICE_NOTIFICATION_PREFERENCE = 'econnotes-device-notifications';
export const ANNOUNCEMENTS_UPDATED_EVENT = 'econnotes:announcements-updated';
export const ANNOUNCEMENT_BROADCAST_CHANNEL = 'realtime-announcements-push';

// Tab-local tracking of announcements just created in THIS browser tab.
// Suppresses redundant popups on the exact tab where the admin hit "Publish",
// while still allowing notifications on the admin's other devices (e.g. phone) and all other users.
const localCreatedAnnouncementKeys = new Set<string>();

export const markLocalAnnouncementCreated = (idOrTitle?: string | null) => {
  if (!idOrTitle) return;
  localCreatedAnnouncementKeys.add(String(idOrTitle));
  if (localCreatedAnnouncementKeys.size > 100) {
    const oldest = localCreatedAnnouncementKeys.values().next().value;
    if (oldest) localCreatedAnnouncementKeys.delete(oldest);
  }
};

export const isLocalAnnouncementCreated = (id?: string | null, title?: string | null): boolean => {
  if (id && localCreatedAnnouncementKeys.has(String(id))) return true;
  if (title && localCreatedAnnouncementKeys.has(String(title))) return true;
  return false;
};

export const notifyAnnouncementsUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ANNOUNCEMENTS_UPDATED_EVENT));
};

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

export interface AnnouncementBroadcastPayload {
  id?: string;
  title: string;
  content: string;
  user_id?: string;
  created_at?: string;
}

/**
 * Broadcasts a newly created announcement to all connected devices without colliding with
 * or leaking the active listener channel in the same tab.
 */
export const broadcastNewAnnouncement = async (
  payload: AnnouncementBroadcastPayload,
): Promise<void> => {
  try {
    const channels = supabase.getChannels();
    const existing = channels.find(
      (ch) =>
        ch.topic === `realtime:${ANNOUNCEMENT_BROADCAST_CHANNEL}` ||
        ch.topic === ANNOUNCEMENT_BROADCAST_CHANNEL,
    );

    if (existing && existing.state === 'joined') {
      await existing.send({
        type: 'broadcast',
        event: 'new-announcement',
        payload,
      });
      return;
    }

    // Fallback: create a dedicated short-lived sender channel and clean it up immediately after sending
    const tempChannel = supabase.channel(ANNOUNCEMENT_BROADCAST_CHANNEL, {
      config: { broadcast: { self: false, ack: true } },
    });

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        void supabase.removeChannel(tempChannel);
        resolve();
      }, 4000);

      tempChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await tempChannel.send({
              type: 'broadcast',
              event: 'new-announcement',
              payload,
            });
          } catch (sendErr) {
            console.warn('Realtime announcement broadcast send failed:', sendErr);
          } finally {
            window.clearTimeout(timeout);
            // Delay teardown slightly so the WebSocket frame flushes cleanly
            window.setTimeout(() => {
              void supabase.removeChannel(tempChannel);
            }, 300);
            resolve();
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          window.clearTimeout(timeout);
          void supabase.removeChannel(tempChannel);
          resolve();
        }
      });
    });
  } catch (err) {
    console.warn('Realtime announcement broadcast error:', err);
  }
};
