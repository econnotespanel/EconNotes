import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getNotificationCursorKey, isDeviceNotificationEnabled } from '@/lib/deviceNotifications';

const POLL_INTERVAL_MS = 30_000;

const ContentNotificationListener = () => {
  const { user } = useAuth();
  const polling = useRef(false);

  useEffect(() => {
    if (!user || !('Notification' in window)) return;

    const notify = (title: string, body: string, tag: string, path: string) => {
      if (Notification.permission !== 'granted' || !isDeviceNotificationEnabled(user.id)) return;
      try {
        const notification = new Notification(title, {
          body,
          tag,
          icon: '/icons/icon-192x192.png',
        });
        notification.onclick = () => {
          window.focus();
          window.location.assign(path);
          notification.close();
        };
      } catch (error) {
        console.error('Device notification could not be displayed:', error);
      }
    };

    const pollForContent = async () => {
      if (polling.current || !isDeviceNotificationEnabled(user.id) || Notification.permission !== 'granted') return;
      polling.current = true;
      try {
        const noteCursorKey = getNotificationCursorKey(user.id, 'notes');
        const announcementCursorKey = getNotificationCursorKey(user.id, 'announcements');
        const noteCursor = localStorage.getItem(noteCursorKey);
        const announcementCursor = localStorage.getItem(announcementCursorKey);
        if (!noteCursor || !announcementCursor) {
          const now = new Date().toISOString();
          if (!noteCursor) localStorage.setItem(noteCursorKey, now);
          if (!announcementCursor) localStorage.setItem(announcementCursorKey, now);
          return;
        }

        const [notesResult, announcementsResult] = await Promise.all([
          supabase.from('notes')
            .select('id, title, user_id, approved_at')
            .eq('status', 'approved')
            .not('approved_at', 'is', null)
            .gt('approved_at', noteCursor)
            .neq('user_id', user.id)
            .order('approved_at', { ascending: true }),
          supabase.from('announcements')
            .select('id, title, user_id, created_at')
            .gt('created_at', announcementCursor)
            .neq('user_id', user.id)
            .order('created_at', { ascending: true }),
        ]);

        if (notesResult.error) {
          console.error('Published note notification check failed:', notesResult.error);
        } else {
          for (const note of notesResult.data || []) {
            notify('Yeni not yayımlandı', note.title, `note-${note.id}`, '/notes');
          }
          const latestApprovedAt = notesResult.data?.at(-1)?.approved_at;
          if (latestApprovedAt) localStorage.setItem(noteCursorKey, latestApprovedAt);
        }

        if (announcementsResult.error) {
          console.error('Announcement notification check failed:', announcementsResult.error);
        } else {
          for (const announcement of announcementsResult.data || []) {
            notify('Yeni duyuru yayımlandı', announcement.title, `announcement-${announcement.id}`, '/announcements');
          }
          const latestCreatedAt = announcementsResult.data?.at(-1)?.created_at;
          if (latestCreatedAt) localStorage.setItem(announcementCursorKey, latestCreatedAt);
        }
      } catch (error) {
        console.error('Content notification polling failed:', error);
      } finally {
        polling.current = false;
      }
    };

    void pollForContent();
    const interval = window.setInterval(() => void pollForContent(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [user]);

  return null;
};

export default ContentNotificationListener;
