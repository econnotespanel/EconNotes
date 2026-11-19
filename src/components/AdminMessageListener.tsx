import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  extractDeletedSupportTicketIds,
  getAdminMessageTarget,
  getSeenAdminNoticeIds,
  markAdminNoticeIdsSeen,
  verifyMessageAdmins,
} from '@/lib/adminMessages';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import AdminMessageNotice from '@/components/AdminMessageNotice';

interface ActiveAdminNotice {
  ticketId: string;
  messageIds: string[];
}

export default function AdminMessageListener() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeNotice, setActiveNotice] = useState<ActiveAdminNotice | null>(null);
  const dismissedMessageIds = useRef(new Set<string>());

  useEffect(() => {
    dismissedMessageIds.current = user?.id ? getSeenAdminNoticeIds(user.id) : new Set();
    setActiveNotice(null);
  }, [user?.id]);

  // Clear modal immediately if user navigates onto Support Center directly
  useEffect(() => {
    if (location.pathname === '/support' && activeNotice && user?.id) {
      for (const id of activeNotice.messageIds) {
        dismissedMessageIds.current.add(id);
      }
      markAdminNoticeIdsSeen(user.id, activeNotice.messageIds);
      setActiveNotice(null);
    }
  }, [activeNotice, location.pathname, user?.id]);

  useEffect(() => {
    if (!user || loading) return;
    let active = true;
    let checking = false;

    const check = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const [{ data, error }, { data: deletedRows }] = await Promise.all([
          supabase
            .from('messages')
            .select('id,sender_id,receiver_id,content,is_read,created_at')
            .eq('receiver_id', user.id)
            .eq('is_read', false)
            .like('content', `${SUPPORT_MESSAGE_PREFIX}%`)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('messages')
            .select('content')
            .eq('receiver_id', user.id)
            .like('content', `${SUPPORT_MESSAGE_PREFIX}%"deleted"%`)
            .limit(100),
        ]);
        if (error) throw error;

        const rows = data ?? [];
        const deletedTicketIds = extractDeletedSupportTicketIds(deletedRows ?? []);
        const storedSeen = getSeenAdminNoticeIds(user.id);
        for (const id of storedSeen) dismissedMessageIds.current.add(id);

        const admins = await verifyMessageAdmins(rows.map((row) => row.sender_id));

        const orphanedDeletedIds: string[] = [];
        const unreadByTicket = new Map<string, string[]>();

        for (const row of rows) {
          const rowTarget = getAdminMessageTarget(row, user.id, admins);
          if (!rowTarget) continue;

          if (deletedTicketIds.has(rowTarget)) {
            orphanedDeletedIds.push(row.id);
            dismissedMessageIds.current.add(row.id);
            continue;
          }

          if (dismissedMessageIds.current.has(row.id)) continue;

          const existing = unreadByTicket.get(rowTarget) ?? [];
          existing.push(row.id);
          unreadByTicket.set(rowTarget, existing);
        }

        // Silently clean up orphaned unread rows belonging to already-deleted tickets
        if (orphanedDeletedIds.length > 0) {
          markAdminNoticeIdsSeen(user.id, orphanedDeletedIds);
          void supabase
            .from('messages')
            .update({ is_read: true })
            .in('id', orphanedDeletedIds)
            .eq('receiver_id', user.id);
        }

        const firstEntry = unreadByTicket.entries().next();
        if (active) {
          setActiveNotice(
            !firstEntry.done
              ? { ticketId: firstEntry.value[0], messageIds: firstEntry.value[1] }
              : null,
          );
        }
      } catch (error) {
        console.warn('Administrator message check failed:', error);
      } finally {
        checking = false;
      }
    };

    const refresh = () => {
      void check();
    };
    const handleSupportRead = () => {
      if (user?.id) {
        const stored = getSeenAdminNoticeIds(user.id);
        for (const id of stored) dismissedMessageIds.current.add(id);
      }
      setActiveNotice((prev) => {
        if (!prev) return null;
        const stillUnseen = prev.messageIds.some((id) => !dismissedMessageIds.current.has(id));
        return stillUnseen ? prev : null;
      });
      void check();
    };

    void check();
    const channel = supabase
      .channel(`admin-message-notice-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        refresh,
      )
      .subscribe();
    const interval = window.setInterval(() => {
      void check();
    }, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('econnotes:support-read-updated', handleSupportRead);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('econnotes:support-read-updated', handleSupportRead);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loading]);

  const dismissCurrent = (markDbRead: boolean) => {
    if (!activeNotice || !user) {
      setActiveNotice(null);
      return;
    }
    const ids = [...activeNotice.messageIds];
    for (const id of ids) {
      dismissedMessageIds.current.add(id);
    }
    markAdminNoticeIdsSeen(user.id, ids);
    setActiveNotice(null);

    if (markDbRead && ids.length > 0) {
      void supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', ids)
        .eq('receiver_id', user.id)
        .then(() => {
          window.dispatchEvent(new CustomEvent('econnotes:support-read-updated'));
        });
    }
  };

  return (
    <AdminMessageNotice
      open={Boolean(activeNotice) && location.pathname !== '/support'}
      onClose={() => dismissCurrent(false)}
      onOpen={() => {
        if (!activeNotice) return;
        const path = `/support?ticket=${encodeURIComponent(activeNotice.ticketId)}`;
        dismissCurrent(true);
        navigate(path);
      }}
    />
  );
}
