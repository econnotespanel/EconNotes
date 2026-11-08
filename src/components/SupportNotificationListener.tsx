import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parseSupportMessage } from '@/lib/support';
import { isDeviceNotificationEnabled } from '@/lib/deviceNotifications';

const SupportNotificationListener = () => {
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!user || !('Notification' in window)) return;

    const channel = supabase
      .channel(`support-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        ({ new: row }) => {
          if (!row || typeof row.content !== 'string' || row.sender_id === user.id) return;
          if (Notification.permission !== 'granted' || !isDeviceNotificationEnabled(user.id)) return;

          const payload = parseSupportMessage(row.content);
          if (!payload) return;

          let title = '';
          let body = '';

          if (payload.kind === 'ticket') {
            if (isAdmin && payload.initiatedBy !== 'admin') {
              title = 'Yeni destek talebi';
              body = payload.subject;
            } else if (!isAdmin && payload.initiatedBy === 'admin') {
              title = 'EconNotes Destek Merkezi';
              body = payload.subject;
            } else {
              return;
            }
          } else if (payload.kind === 'reply') {
            title = isAdmin ? 'Destek talebine yeni yanıt' : 'Destek talebinize yanıt geldi';
            body = payload.message.slice(0, 120);
          } else {
            return;
          }

          const tag = `support-${payload.ticketId}`;
          const path = '/support';

          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready
              .then((reg) => {
                const options: NotificationOptions & { vibrate: number[]; renotify: boolean } = {
                  body,
                  tag,
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/icon-192x192.png',
                  vibrate: [150, 60, 150],
                  data: { url: path },
                  renotify: true,
                };
                return reg.showNotification(title, options);
              })
              .catch(() => {});
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
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Support notification subscription failed:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, user]);

  return null;
};

export default SupportNotificationListener;
