import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getNotificationCursorKey, isDeviceNotificationEnabled } from '@/lib/deviceNotifications';

const POLL_INTERVAL_MS = 60_000;

const ContentNotificationListener = () => {
  const { user } = useAuth();
  const polling = useRef(false);

  useEffect(() => {
    if (!user || !('Notification' in window)) return;

    // Dispatches a notification through the Service Worker (required for mobile PWA/Android/iOS)
    // with fallback to Desktop window.Notification
    const notify = async (title: string, body: string, tag: string, path: string) => {
      if (Notification.permission !== 'granted' || !isDeviceNotificationEnabled(user.id)) return;
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(title, {
            body,
            tag,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [150, 60, 150],
            data: { url: path },
            renotify: true,
          });
          return;
        }

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

    // Instant real-time listener: fires with zero delay when an admin inserts a new announcement
    const channel = supabase
      .channel('realtime-announcements-push')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          const newAnn = payload.new as any;
          if (newAnn && newAnn.user_id !== user.id) {
            void notify(
              `📢 EconNotes Duyuru: ${newAnn.title}`,
              newAnn.content ? newAnn.content.slice(0, 120) : 'Yeni bir duyuru paylaşıldı.',
              `announcement-${newAnn.id}`,
              '/announcements'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notes' },
        (payload) => {
          const updatedNote = payload.new as any;
          const oldNote = payload.old as any;
          if (
            updatedNote &&
            updatedNote.status === 'approved' &&
            oldNote?.status !== 'approved' &&
            updatedNote.user_id !== user.id
          ) {
            void notify(
              '📚 Yeni Not Yayımlandı',
              updatedNote.title || 'Yeni ders notu onaylandı.',
              `note-${updatedNote.id}`,
              '/notes'
            );
          }
        }
      )
      .subscribe();

    // Polling fallback to catch any notifications missed during network offline moments
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
          supabase
            .from('notes')
            .select('id, title, user_id, approved_at')
            .eq('status', 'approved')
            .not('approved_at', 'is', null)
            .gt('approved_at', noteCursor)
            .neq('user_id', user.id)
            .order('approved_at', { ascending: true }),
          supabase
            .from('announcements')
            .select('id, title, user_id, created_at')
            .gt('created_at', announcementCursor)
            .neq('user_id', user.id)
            .order('created_at', { ascending: true }),
        ]);

        if (notesResult.data && notesResult.data.length > 0) {
          for (const note of notesResult.data) {
            void notify('📚 Yeni not yayımlandı', note.title, `note-${note.id}`, '/notes');
          }
          const latestApprovedAt = notesResult.data.at(-1)?.approved_at;
          if (latestApprovedAt) localStorage.setItem(noteCursorKey, latestApprovedAt);
        }

        if (announcementsResult.data && announcementsResult.data.length > 0) {
          for (const announcement of announcementsResult.data) {
            void notify('📢 Yeni duyuru yayımlandı', announcement.title, `announcement-${announcement.id}`, '/announcements');
          }
          const latestCreatedAt = announcementsResult.data.at(-1)?.created_at;
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

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
};

export default ContentNotificationListener;
