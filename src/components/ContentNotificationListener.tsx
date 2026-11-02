import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getNotificationCursorKey, isDeviceNotificationEnabled } from '@/lib/deviceNotifications';
import { toast } from 'sonner';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';

const POLL_INTERVAL_MS = 6_000;

const ContentNotificationListener = () => {
  const { user } = useAuth();
  const polling = useRef(false);
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    // Dispatches a notification reliably across both Mobile PWA/Android (Service Worker showNotification)
    // and Desktop Windows/Mac (Notification constructor)
    const notify = async (title: string, body: string, tag: string, path: string) => {
      if (notifiedIds.current.has(tag)) return;
      notifiedIds.current.add(tag);

      // 1. Play subtle audio chime
      playChime();

      // 2. Show in-app interactive toast notification
      toast(title, {
        description: body,
        duration: 9000,
        action: {
          label: 'Görüntüle',
          onClick: () => window.location.assign(path),
        },
      });

      // 3. Dispatch to device operating system notification center (Windows, Mac, Android, iOS PWA)
      if ('Notification' in window && Notification.permission === 'granted' && isDeviceNotificationEnabled(user.id)) {
        await displayDeviceNotification(title, {
          body,
          tag,
          data: { url: path },
        });
      }
    };

    // Instant real-time listener: broadcast with self: true ensures all tabs and open devices get it
    const channel = supabase
      .channel('realtime-announcements-push', {
        config: { broadcast: { self: true } },
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
            void notify(
              ann.title,
              cleanMessage,
              `announcement-bc-${ann.id || Date.now()}`,
              '/announcements'
            );
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
            void notify('📚 Yeni not yayımlandı', note.title, `note-${note.id}`, '/notes');
          }
          const latestApprovedAt = notesResult.data.at(-1)?.approved_at;
          if (latestApprovedAt) localStorage.setItem(noteCursorKey, latestApprovedAt);
        }

        if (announcementsResult.data && announcementsResult.data.length > 0) {
          for (const announcement of announcementsResult.data) {
            const cleanMessage = announcement.content
              ? String(announcement.content).replace(/<[^>]*>/g, '').trim().slice(0, 180)
              : 'Duyurunun detaylarını görmek için tıklayın.';
            void notify(
              announcement.title || 'Duyuru',
              cleanMessage,
              `announcement-${announcement.id}`,
              '/announcements'
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

    // Also listen to local announcement events sent from the current tab
    const onLocalAnnouncement = (e: any) => {
      const ann = e.detail;
      if (ann && ann.title) {
        const cleanMessage = ann.content
          ? String(ann.content).replace(/<[^>]*>/g, '').trim().slice(0, 180)
          : 'Duyurunun detaylarını görmek için tıklayın.';
        void notify(
          ann.title,
          cleanMessage,
          `announcement-local-${ann.id || Date.now()}`,
          '/announcements'
        );
      }
    };
    window.addEventListener('econnotes-local-announcement', onLocalAnnouncement);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('econnotes-device-notification-preference', onPreferenceChanged);
      window.removeEventListener('econnotes-local-announcement', onLocalAnnouncement);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
};

export default ContentNotificationListener;
