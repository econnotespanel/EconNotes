import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getNotificationCursorKey, isDeviceNotificationEnabled } from '@/lib/deviceNotifications';
import { toast } from 'sonner';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';

const POLL_INTERVAL_MS = 12_000;

const ContentNotificationListener = () => {
  const { user } = useAuth();
  const polling = useRef(false);

  useEffect(() => {
    if (!user || !('Notification' in window)) return;

    // Dispatches a notification reliably across both Mobile PWA/Android (Service Worker showNotification)
    // and Desktop Windows/Mac (Notification constructor)
    const notify = async (title: string, body: string, tag: string, path: string) => {
      // 1. Play subtle audio chime
      playChime();

      // 2. Show in-app interactive notification banner so active users immediately see it
      toast(title, {
        description: body,
        duration: 9000,
        action: {
          label: 'Görüntüle',
          onClick: () => window.location.assign(path),
        },
      });

      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted' || !isDeviceNotificationEnabled(user.id)) return;

      // 3. Dispatch to device operating system notification center (Windows, Mac, Android, iOS PWA)
      await displayDeviceNotification(title, {
        body,
        tag,
        data: { url: path },
      });
    };

    // Instant real-time listener: fires with zero delay when an admin inserts a new announcement
    const channel = supabase
      .channel('realtime-announcements-push')
      .on(
        'broadcast',
        { event: 'new-announcement' },
        (payload) => {
          const ann = payload.payload as any;
          if (ann) {
            void notify(
              `📢 EconNotes Duyuru: ${ann.title}`,
              ann.content ? ann.content.slice(0, 120) : 'Yeni bir duyuru paylaşıldı.',
              `announcement-bc-${Date.now()}`,
              '/announcements'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          const newAnn = payload.new as any;
          if (newAnn) {
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
            oldNote?.status !== 'approved'
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
          const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
          if (!noteCursor) localStorage.setItem(noteCursorKey, thirtySecondsAgo);
          if (!announcementCursor) localStorage.setItem(announcementCursorKey, thirtySecondsAgo);
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
            .select('id, title, user_id, created_at')
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
