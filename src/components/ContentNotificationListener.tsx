import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  ANNOUNCEMENT_BROADCAST_CHANNEL,
  getNotificationCursorKey,
  isDeviceNotificationEnabled,
  isLocalAnnouncementCreated,
  notifyAnnouncementsUpdated,
} from '@/lib/deviceNotifications';
import { syncOneSignalSubscription } from '@/lib/onesignal';
import { toast } from 'sonner';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';

const POLL_INTERVAL_MS = 20_000;
const HANDLED_STORAGE_KEY = 'econnotes_handled_content_notifs';

// Persistent deduplication cache to prevent duplicate alerts across re-renders & multiple event channels
const handledNotificationKeys = new Set<string>();

const loadPersistedHandledKeys = () => {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(HANDLED_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(-150)) {
        if (typeof item === 'string') handledNotificationKeys.add(item);
      }
    }
  } catch {
    // ignore
  }
};

const rememberHandledKey = (key: string) => {
  handledNotificationKeys.add(key);
  if (handledNotificationKeys.size > 200) {
    const oldest = handledNotificationKeys.values().next().value;
    if (oldest) handledNotificationKeys.delete(oldest);
  }
  try {
    sessionStorage.setItem(HANDLED_STORAGE_KEY, JSON.stringify(Array.from(handledNotificationKeys).slice(-150)));
  } catch {
    // ignore
  }
};

const stripHtml = (raw: unknown): string => {
  if (!raw) return 'Duyurunun detaylarını görmek için tıklayın.';
  const cleaned = String(raw).replace(/<[^>]*>/g, '').trim();
  return cleaned ? cleaned.slice(0, 180) : 'Duyurunun detaylarını görmek için tıklayın.';
};

const ContentNotificationListener = () => {
  const { user } = useAuth();
  const polling = useRef(false);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    loadPersistedHandledKeys();

    // Ensure OneSignal subscription is cleanly synced whenever browser permission is already granted
    if ('Notification' in window && Notification.permission === 'granted') {
      void syncOneSignalSubscription(user.id, isDeviceNotificationEnabled(user.id));
    }

    const advanceCursor = (type: 'notes' | 'announcements', isoTimestamp?: string | null) => {
      const key = getNotificationCursorKey(user.id, type);
      const next = isoTimestamp || new Date().toISOString();
      const prev = localStorage.getItem(key);
      if (!prev || next > prev) {
        localStorage.setItem(key, next);
      }
    };

    // Dispatches a notification reliably and strictly ONCE across the entire app
    const notifyOnce = async (params: {
      title: string;
      rawTitle?: string;
      body: string;
      dedupKey: string;
      path: string;
      announcementId?: string;
      noteAuthorId?: string;
      cursorType?: 'notes' | 'announcements';
      cursorTimestamp?: string | null;
    }) => {
      const {
        title,
        rawTitle,
        body,
        dedupKey,
        path,
        announcementId,
        noteAuthorId,
        cursorType,
        cursorTimestamp,
      } = params;

      if (cursorType) {
        advanceCursor(cursorType, cursorTimestamp);
      }

      // 1. Suppress duplicate alert ONLY on the exact tab that just published the announcement
      //    (other devices logged into the same account & all other users WILL still receive it!)
      if (cursorType === 'announcements' && isLocalAnnouncementCreated(announcementId, rawTitle || title)) {
        rememberHandledKey(dedupKey);
        notifyAnnouncementsUpdated();
        return;
      }

      // For notes, do not notify the author of their own note approval
      if (cursorType === 'notes' && noteAuthorId && noteAuthorId === user.id) {
        rememberHandledKey(dedupKey);
        return;
      }

      // 2. Strict deduplication check across Broadcast + Postgres Changes + Polling
      if (handledNotificationKeys.has(dedupKey)) {
        return;
      }
      rememberHandledKey(dedupKey);

      if (cursorType === 'announcements') {
        notifyAnnouncementsUpdated();
      }

      // 3. Play subtle audio chime (internally throttled to once every 2s)
      playChime();

      // 4. Show in-app interactive toast notification (works on ALL devices including iOS Safari web)
      toast(title, {
        description: body,
        duration: 8000,
        action: {
          label: 'Görüntüle',
          onClick: () => window.location.assign(path),
        },
      });

      // 5. Dispatch to device OS notification center (Windows, Mac, Android Chrome, iOS PWA)
      if ('Notification' in window && Notification.permission === 'granted' && isDeviceNotificationEnabled(user.id)) {
        await displayDeviceNotification(title, {
          body,
          tag: dedupKey,
          data: { url: path },
        });
      }
    };

    const handleIncomingAnnouncement = (ann: {
      id?: string;
      title?: string;
      content?: string;
      created_at?: string;
    }) => {
      if (!ann || !ann.title) return;
      const cleanMessage = stripHtml(ann.content);
      const dedupKey = `ann-${ann.id || ann.title}`;
      const formattedTitle =
        ann.title.startsWith('📢') || ann.title.startsWith('🔴') ? ann.title : `📢 ${ann.title}`;
      void notifyOnce({
        title: formattedTitle,
        rawTitle: ann.title,
        body: cleanMessage,
        dedupKey,
        path: '/announcements',
        announcementId: ann.id,
        cursorType: 'announcements',
        cursorTimestamp: ann.created_at,
      });
    };

    // 1. Instant real-time broadcast + database INSERT listener
    const channel = supabase
      .channel(ANNOUNCEMENT_BROADCAST_CHANNEL, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'new-announcement' }, (payload) => {
        const ann = payload.payload as {
          id?: string;
          title?: string;
          content?: string;
          created_at?: string;
        };
        handleIncomingAnnouncement(ann);
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        ({ new: row }) => {
          if (!row) return;
          handleIncomingAnnouncement({
            id: typeof row.id === 'string' ? row.id : undefined,
            title: typeof row.title === 'string' ? row.title : undefined,
            content: typeof row.content === 'string' ? row.content : undefined,
            created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
          });
        },
      )
      .subscribe();

    // 2. Reliable polling fallback (runs for ALL authenticated users so in-app alerts, badge sync,
    //    and OS notifications work even if WebSocket disconnects or user is on iOS web)
    const pollForContent = async () => {
      if (polling.current) return;
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
            void notifyOnce({
              title: '📚 Yeni not yayımlandı',
              body: note.title,
              dedupKey,
              path: '/notes',
              noteAuthorId: note.user_id,
              cursorType: 'notes',
              cursorTimestamp: note.approved_at,
            });
          }
          const latestApprovedAt = notesResult.data.at(-1)?.approved_at;
          if (latestApprovedAt) advanceCursor('notes', latestApprovedAt);
        }

        if (announcementsResult.data && announcementsResult.data.length > 0) {
          for (const announcement of announcementsResult.data) {
            handleIncomingAnnouncement({
              id: announcement.id,
              title: announcement.title || 'Duyuru',
              content: announcement.content,
              created_at: announcement.created_at,
            });
          }
          const latestCreatedAt = announcementsResult.data.at(-1)?.created_at;
          if (latestCreatedAt) advanceCursor('announcements', latestCreatedAt);
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

    // Trigger immediate poll on permission toggle, window focus, or mobile resume from background
    const onRefresh = () => {
      void pollForContent();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pollForContent();
      }
    };

    window.addEventListener('econnotes-device-notification-preference', onRefresh);
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('econnotes-device-notification-preference', onRefresh);
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return null;
};

export default ContentNotificationListener;
