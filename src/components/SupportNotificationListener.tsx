import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parseSupportMessage } from '@/lib/support';
import { isDeviceNotificationEnabled } from '@/lib/deviceNotifications';

const SupportNotificationListener = () => {
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!user || !isAdmin || !('Notification' in window)) return;

    const channel = supabase
      .channel(`support-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        ({ new: row }) => {
          if (!row || typeof row.content !== 'string') return;
          const payload = parseSupportMessage(row.content);
          if (!payload || payload.kind !== 'ticket' || row.sender_id === user.id || Notification.permission !== 'granted' || !isDeviceNotificationEnabled(user.id)) return;

          const title = 'Yeni destek talebi';
          const body = payload.subject;
          const tag = `support-${payload.ticketId}`;
          const path = '/support';

          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
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
            }).catch(() => {});
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

    return () => { void supabase.removeChannel(channel); };
  }, [isAdmin, user]);

  return null;
};

export default SupportNotificationListener;
