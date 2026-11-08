import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getAdminMessageTarget, verifyMessageAdmins } from '@/lib/adminMessages';
import AdminMessageNotice from '@/components/AdminMessageNotice';

export default function AdminMessageListener() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [target, setTarget] = useState<string | null>(null);
  const dismissed = useRef(new Set<string>());

  useEffect(() => {
    dismissed.current.clear();
    setTarget(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user || loading) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const { data, error } = await supabase.from('messages')
          .select('id,sender_id,receiver_id,content,is_read,created_at')
          .eq('receiver_id', user.id).eq('is_read', false)
          .order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        const rows = data ?? [];
        const admins = await verifyMessageAdmins(rows.map((row) => row.sender_id));
        const next = rows.find((row) => {
          const rowTarget = getAdminMessageTarget(row, user.id, admins);
          return rowTarget && !dismissed.current.has(rowTarget);
        });
        if (active) setTarget(next ? getAdminMessageTarget(next, user.id, admins) : null);
      } catch (error) {
        console.error('Administrator message check failed:', error);
      } finally { checking = false; }
    };
    // A dismissed notice remains unread, but does not interrupt again in this session.
    const dismiss = () => { void check(); };
    void check();
    const channel = supabase.channel(`admin-message-notice-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, dismiss)
      .subscribe();
    const interval = window.setInterval(() => { void check(); }, 60000);
    window.addEventListener('focus', dismiss);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', dismiss); void supabase.removeChannel(channel); };
  }, [user?.id, loading]);

  const close = () => { if (target) dismissed.current.add(target); setTarget(null); };
  return <AdminMessageNotice open={Boolean(target) && location.pathname !== '/support'} onClose={close} onOpen={() => {
    if (!target) return;
    const path = `/support?ticket=${encodeURIComponent(target)}`;
    close();
    navigate(path);
  }} />;
}