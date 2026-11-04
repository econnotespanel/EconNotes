import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getNotificationCursorKey, isDeviceNotificationEnabled } from '@/lib/deviceNotifications';
import { toast } from 'sonner';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';

const POLL_INTERVAL_MS = 35_000;

// Persistent deduplication cache to prevent duplicate alerts across re-renders & multiple event channels
const handledNotificationKeys = new Set<string>();

const ContentNotificationListener = () => {
  const { user } = useAuth();
  const polling = useRef(false);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    // Dispatches a notification reliably and strictly ONCE across the entire app
    const notifyOnce = async (
      title: string,
      body: string,
      dedupKey: string,
      path: string,
      authorId?: string
    ) => {
      // 1. If the current user authored the announcement, do not pop an alert on their own screen
      if (authorId && authorId === user.id) {
        return;
      }

      // 2. Strict deduplication check
      if (handledNotificationKeys.has(dedupKey)) {
        return;
      }
      handledNotificationKeys.add(dedupKey);

      // Keep cache from growing unbounded
      if (handledNotificationKeys.size > 200) {
        const oldest = handledNotificationKeys.values().next().value;
        if (oldest) handledNotificationKeys.delete(oldest);
      }

      // 3. Play subtle audio chime (internally throttled to once every 2s)
      playChime();

      // 4. Show in-app interactive toast notification
      toast(title, {
        description: body,
        duration: 8000,
        action: {
          label: 'Görüntüle',
          onClick: () => window.location.assign(path),
        },
      });

      // 5. Dispatch to device operating system notification center (Windows, Mac, Android, iOS PWA)
      if ('Notification' in window && Notification.permission === 'granted' && isDeviceNotificationEnabled(user.id)) {
        await displayDeviceNotification(title, {
          body,
          tag: dedupKey,
          data: { url: path },
        });
      }
    };

    // Instant real-time broadcast listener
    const channel = supabase
      .channel('realtime-announcements-push', {
        config: { broadcast: { self: false } },
      })
      .on(
        'broadcast',
        { event: 'new-announcement' },
        (payload) => {
          const ann = payload.payload as any;
          if (ann && ann.title) {
            const cleanMessage = ann.content
              ? String(ann.content).replace(/<[^>]*>/g, '').trim().slice(0, 180)
              : 'Duyurunun detaylarını görmek için tıklayın.';
            const dedupKey = `ann-${ann.id || ann.title}`;
            void notifyOnce(ann.title, cleanMessage, dedupKey, '/announcements', ann.user_id);
          }
        }
      )
      .subscribe();

    // Polling fallback to catch any notifications across all open devices
    const pollForContent = async () => {
      if (polling.current || !isDeviceNotificationEnabled(user.id)) return;
      polling.current = true;
      try {
        const noteCursorKey = getNotificationCursorKey(user.id, 'notes');
        const announcementCursorKey = getNotificationCursorKey(user.id, 'announcements');
        
        let noteCursor = localStorage.getItem(noteCursorKey);
        let announcementCursor = localStorage.getItem(announcementCursorKey);
        const defaultCursor = new Date(Date.now() - 30_000).toISOString();

        if (!noteCursor) {
          noteCursor = defaultCursor;
          localStorage.setItem(noteCursorKey, defaultCursor);
        }
        if (!announcementCursor) {
          announcementCursor = defaultCursor;
          localStorage.setItem(announcementCursorKey, defaultCursor);
        }

        const [notesResult, announcementsResult] = await Promise.all([
          supabase
            .from('notes')
            .select('id, title, user_id, approved_at')
            .eq('status', 'approved')
            .not('approved_at', 'is', null)
            .gt('approved_at', noteCursor)
            .order('approved_at', { ascending: true }),
          supabase
            .from('announcements')
            .select('id, title, content, user_id, created_at')
            .gt('created_at', announcementCursor)
            .order('created_at', { ascending: true }),
        ]);

        if (notesResult.data && notesResult.data.length > 0) {
          for (const note of notesResult.data) {
            const dedupKey = `note-${note.id}`;
            void notifyOnce('📚 Yeni not yayımlandı', note.title, dedupKey, '/notes', note.user_id);
          }
          const latestApprovedAt = notesResult.data.at(-1)?.approved_at;
          if (latestApprovedAt) localStorage.setItem(noteCursorKey, latestApprovedAt);
        }

        if (announcementsResult.data && announcementsResult.data.length > 0) {
          for (const announcement of announcementsResult.data) {
            const cleanMessage = announcement.content
              ? String(announcement.content).replace(/<[^>]*>/g, '').trim().slice(0, 180)
              : 'Duyurunun detaylarını görmek için tıklayın.';
            const dedupKey = `ann-${announcement.id || announcement.title}`;
            void notifyOnce(
              announcement.title || 'Duyuru',
              cleanMessage,
              dedupKey,
              '/announcements',
              announcement.user_id
            );
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

    // Run initial poll
    void pollForContent();
    const interval = window.setInterval(() => void pollForContent(), POLL_INTERVAL_MS);

    // Also trigger poll immediately when user grants or toggles notification permission
    const onPreferenceChanged = () => {
      void pollForContent();
    };
    window.addEventListener('econnotes-device-notification-preference', onPreferenceChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('econnotes-device-notification-preference', onPreferenceChanged);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
};

export default ContentNotificationListener;
