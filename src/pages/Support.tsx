import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Clock3,
  LifeBuoy,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyMessageAdmins } from '@/lib/adminMessages';
import {
  getNotificationCursorKey,
  isDeviceNotificationEnabled,
  setDeviceNotificationEnabled,
} from '@/lib/deviceNotifications';
import {
  buildSupportTickets,
  encodeSupportMessage,
  getAssignedSupportAdmin,
  getSupportMessageBody,
  getSupportTicketStage,
  isSupportMessageValid,
  parseSupportMessage,
  SUPPORT_MESSAGE_PREFIX,
  type SupportMessagePayload,
  type SupportTicketCategory,
  type SupportTicketRecord,
  type SupportTicketStatus,
} from '@/lib/support';

type UserDirectoryEntry = {
  user_id: string;
  full_name: string;
  university: string;
  department: string;
  grade: number | null;
  avatar_url: string | null;
};

type QueueFilter = 'all' | 'user' | 'admin';

const userTicketSteps = [
  { label: 'Talep alındı', color: 'sky' },
  { label: 'İnceleniyor', color: 'amber' },
  { label: 'Yanıtlandı', color: 'emerald' },
  { label: 'Tamamlandı', color: 'violet' },
] as const;

const adminInitiatedSteps = [
  { label: 'Görüşme başlatıldı', color: 'sky' },
  { label: 'Kullanıcı yanıtladı', color: 'amber' },
  { label: 'Yanıtlandı', color: 'emerald' },
  { label: 'Tamamlandı', color: 'violet' },
] as const;

const categories: { value: SupportTicketCategory; label: string; adminLabel: string }[] = [
  { value: 'technical', label: 'Teknik sorun', adminLabel: 'Teknik bilgilendirme' },
  { value: 'account', label: 'Hesap işlemleri', adminLabel: 'Hesap & üyelik işlemleri' },
  { value: 'complaint', label: 'Şikâyet', adminLabel: 'İçerik / kural uyarısı' },
  { value: 'suggestion', label: 'Öneri', adminLabel: 'Öneri & geri bildirim' },
  { value: 'other', label: 'Diğer', adminLabel: 'Genel yönetim mesajı' },
];

const ADMIN_SUBJECT_PRESETS = [
  'Paylaştığınız ders notu hakkında bilgilendirme',
  'Hesabınızla ilgili bilgilendirme',
  'Platform kullanım kuralları hatırlatması',
];

const statusInfo: Record<SupportTicketStatus, { label: string; className: string }> = {
  submitted: {
    label: 'Gönderildi',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  },
  reviewing: {
    label: 'İnceleniyor',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
  answered: {
    label: 'Yanıtlandı',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  closed: {
    label: 'Kapatıldı',
    className: 'border-muted-foreground/20 bg-muted text-muted-foreground',
  },
};

const getTicketStatusBadge = (ticket: SupportTicketRecord, isAdmin: boolean) => {
  if (ticket.initiatedBy === 'admin') {
    if (ticket.status === 'submitted') {
      return {
        label: isAdmin ? 'Gönderildi' : 'Yönetici Mesajı',
        className: statusInfo.submitted.className,
      };
    }
    if (ticket.status === 'reviewing' && isAdmin) {
      return {
        label: 'Yanıt Geldi',
        className: statusInfo.reviewing.className,
      };
    }
  }
  return statusInfo[ticket.status];
};

const dateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const categoryLabel = (value: SupportTicketCategory, isAdminInitiated = false) => {
  const item = categories.find((c) => c.value === value);
  if (!item) return value;
  return isAdminInitiated ? item.adminLabel : item.label;
};

const Support = () => {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTicket = searchParams.get('ticket');

  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [userProfilesMap, setUserProfilesMap] = useState<
    Record<string, { name: string; subtitle: string; avatarUrl: string | null }>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [assignedAdminId, setAssignedAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Regular user ticket creation modal
  const [dialogOpen, setDialogOpen] = useState(false);
  const [category, setCategory] = useState<SupportTicketCategory>('technical');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');

  // Admin "Select User & Start Conversation" modal
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryEntry[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedTargetUser, setSelectedTargetUser] = useState<UserDirectoryEntry | null>(null);
  const [adminCategory, setAdminCategory] = useState<SupportTicketCategory>('account');
  const [adminSubject, setAdminSubject] = useState('');
  const [adminInitialMessage, setAdminInitialMessage] = useState('');

  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof window !== 'undefined' &&
      Boolean(
        user &&
          isDeviceNotificationEnabled(user.id) &&
          'Notification' in window &&
          Notification.permission === 'granted',
      ),
  );

  useEffect(() => {
    const syncNotificationPreference = () => {
      setNotificationsEnabled(
        Boolean(
          user &&
            isDeviceNotificationEnabled(user.id) &&
            'Notification' in window &&
            Notification.permission === 'granted',
        ),
      );
    };
    syncNotificationPreference();
    window.addEventListener('econnotes-device-notification-preference', syncNotificationPreference);
    return () =>
      window.removeEventListener('econnotes-device-notification-preference', syncNotificationPreference);
  }, [user]);

  const loadDirectoryUsers = useCallback(async () => {
    if (!user || !isAdmin) return [];
    setDirectoryLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, full_name, university, department, grade, avatar_url')
      .neq('user_id', user.id)
      .order('full_name', { ascending: true })
      .limit(1000);
    setDirectoryLoading(false);
    if (error) {
      console.error('Support user directory load failed:', error);
      toast.error('Kullanıcı listesi yüklenemedi.');
      return [];
    }
    const entries: UserDirectoryEntry[] = (data ?? []).map((item) => ({
      user_id: item.user_id,
      full_name: item.full_name || 'İsimsiz Kullanıcı',
      university: item.university || '',
      department: item.department || '',
      grade: item.grade ?? null,
      avatar_url: item.avatar_url ?? null,
    }));
    setDirectoryUsers(entries);
    return entries;
  }, [isAdmin, user]);

  const loadTickets = useCallback(
    async (preferredTicketId?: string) => {
      if (!user) return;
      setLoading(true);

      const [{ data: msgRows, error: msgError }, adminIdsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .like('content', `${SUPPORT_MESSAGE_PREFIX}%`)
          .order('created_at', { ascending: true }),
        supabase.from('user_roles').select('user_id').eq('role', 'admin'),
      ]);

      if (msgError) {
        console.error('Support messages load failed:', msgError);
        setLoadError('Destek talepleri yüklenemedi. Lütfen tekrar deneyin.');
        setLoading(false);
        return;
      }

      const rows = msgRows ?? [];

      // Verify senders of admin-initiated support threads through the server-side `is_admin` RPC
      const adminInitiatedSenderIds = [
        ...new Set(
          rows
            .filter((row) => {
              const p = parseSupportMessage(row.content);
              return p?.kind === 'ticket' && p.initiatedBy === 'admin';
            })
            .map((row) => row.sender_id),
        ),
      ];
      let verifiedAdmins: string[] | undefined;
      if (adminInitiatedSenderIds.length > 0) {
        try {
          verifiedAdmins = isAdmin
            ? [...new Set([user.id, ...(await verifyMessageAdmins(adminInitiatedSenderIds))])]
            : await verifyMessageAdmins(adminInitiatedSenderIds);
        } catch (verifyError) {
          console.error('Support administrator verification failed:', verifyError);
          verifiedAdmins = isAdmin ? [user.id] : [];
        }
      }

      const nextTickets = buildSupportTickets(rows, isAdmin, user.id, verifiedAdmins);

      let availableAdminIds = [...new Set((adminIdsResult.data ?? []).map((row) => row.user_id))];
      if (!isAdmin && availableAdminIds.length === 0) {
        const announcementResult = await supabase
          .from('announcements')
          .select('user_id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (announcementResult.data?.user_id) {
          availableAdminIds = [announcementResult.data.user_id];
        } else if (nextTickets.length > 0) {
          availableAdminIds = [nextTickets[0].adminId];
        }
      }

      const assigned = isAdmin ? user.id : getAssignedSupportAdmin(user.id, availableAdminIds);
      setAssignedAdminId(assigned);

      setTickets(nextTickets);
      setLoadError(
        !assigned && nextTickets.length === 0
          ? 'Yönetici hesabı destek için belirlenemedi. Yöneticinin en az bir duyurusu olmalı veya yönetici rolü sorgulanabilmeli.'
          : null,
      );

      setSelectedId((current) => {
        if (preferredTicketId && nextTickets.some((ticket) => ticket.id === preferredTicketId)) {
          return preferredTicketId;
        }
        if (requestedTicket && nextTickets.some((ticket) => ticket.id === requestedTicket)) {
          return requestedTicket;
        }
        return nextTickets.some((ticket) => ticket.id === current) ? current : nextTickets[0]?.id ?? null;
      });

      const counterpartIds = [
        ...new Set(nextTickets.map((ticket) => (isAdmin ? ticket.userId : ticket.adminId))),
      ];
      if (counterpartIds.length > 0) {
        const profileResult = await supabase
          .from('profiles')
          .select('user_id, full_name, university, department, avatar_url')
          .in('user_id', counterpartIds);
        if (!profileResult.error && profileResult.data) {
          setUserProfilesMap(
            Object.fromEntries(
              profileResult.data.map((item) => [
                item.user_id,
                {
                  name: item.full_name || 'Kullanıcı',
                  subtitle: [item.university, item.department].filter(Boolean).join(' • '),
                  avatarUrl: item.avatar_url ?? null,
                },
              ]),
            ),
          );
        }
      } else {
        setUserProfilesMap({});
      }

      setLoading(false);
    },
    [isAdmin, requestedTicket, user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void loadTickets();
  }, [authLoading, loadTickets, user]);

  useEffect(() => {
    if (requestedTicket && tickets.some((ticket) => ticket.id === requestedTicket)) {
      setQueueFilter('all');
      setSelectedId(requestedTicket);
    }
  }, [requestedTicket, tickets]);

  // Support deep-link `/support?userId=<uuid>` so admins can also launch conversation directly for a specific user
  useEffect(() => {
    const preselectedUserId = searchParams.get('userId');
    if (!isAdmin || !user || !preselectedUserId || preselectedUserId === user.id) return;

    const openForPreselectedUser = async () => {
      const list = directoryUsers.length > 0 ? directoryUsers : await loadDirectoryUsers();
      const found = list.find((u) => u.user_id === preselectedUserId);
      if (found) {
        setSelectedTargetUser(found);
      }
      setAdminDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('userId');
      setSearchParams(next, { replace: true });
    };

    void openForPreselectedUser();
  }, [directoryUsers, isAdmin, loadDirectoryUsers, searchParams, setSearchParams, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`support-messages-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadTickets();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          toast.error('Destek canlı bağlantısı kurulamadı. Sayfayı yenileyip tekrar deneyin.');
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTickets, user]);

  const filteredTickets = useMemo(() => {
    if (queueFilter === 'all') return tickets;
    return tickets.filter((ticket) => ticket.initiatedBy === queueFilter);
  }, [queueFilter, tickets]);

  const userInitiatedCount = useMemo(
    () => tickets.filter((t) => t.initiatedBy === 'user').length,
    [tickets],
  );
  const adminInitiatedCount = useMemo(
    () => tickets.filter((t) => t.initiatedBy === 'admin').length,
    [tickets],
  );

  const selectedTicket = useMemo(
    () =>
      filteredTickets.find((ticket) => ticket.id === selectedId) ??
      tickets.find((ticket) => ticket.id === selectedId) ??
      null,
    [filteredTickets, selectedId, tickets],
  );

  // Mark only opened Support conversation messages as read
  useEffect(() => {
    if (!user || !selectedTicket || selectedTicket.unreadRowIds.length === 0) return;
    const idsToMark = [...selectedTicket.unreadRowIds];

    const markRead = async () => {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', idsToMark)
        .eq('receiver_id', user.id);
      if (!error) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === selectedTicket.id ? { ...t, hasUnread: false, unreadRowIds: [] } : t,
          ),
        );
        window.dispatchEvent(new CustomEvent('econnotes:support-read-updated'));
      }
    };
    void markRead();
  }, [selectedTicket, user]);

  const filteredDirectoryUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return directoryUsers;
    return directoryUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.university.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q),
    );
  }, [directoryUsers, userSearchQuery]);

  const selectedReplies = selectedTicket?.replies ?? [];
  const progressSteps =
    selectedTicket?.initiatedBy === 'admin' ? adminInitiatedSteps : userTicketSteps;
  const selectedStage = selectedTicket
    ? getSupportTicketStage(
        selectedTicket.status,
        selectedTicket.firstResponseAt,
        selectedTicket.reviewingAt,
      )
    : 0;
  const currentStage = selectedTicket?.status === 'closed' ? 3 : selectedStage;

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      toast.error('Bu tarayıcı cihaz bildirimlerini desteklemiyor.');
      return;
    }
    try {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      setNotificationsEnabled(permission === 'granted');
      if (permission === 'granted' && user) {
        const now = new Date().toISOString();
        setDeviceNotificationEnabled(user.id, true);
        localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
        localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
        toast.success('Yeni not, duyuru ve destek bildirimleri açıldı.');
      } else {
        toast.error('Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.');
      }
    } catch (error) {
      console.error('Support notification permission request failed:', error);
      toast.error('Cihaz bildirimi izni istenemedi. Tarayıcı ayarlarını kontrol edin.');
    }
  };

  const insertSupportMessage = async (receiverId: string, payload: SupportMessagePayload) => {
    if (!user) return false;
    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content: encodeSupportMessage(payload),
    });
    if (error) {
      console.error('Support message send failed:', error);
      toast.error('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
      return false;
    }
    return true;
  };

  const openAdminNewConversationModal = () => {
    setAdminDialogOpen(true);
    if (directoryUsers.length === 0) {
      void loadDirectoryUsers();
    }
  };

  const createTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !assignedAdminId || submitting) return;
    if (subject.trim().length < 3 || !isSupportMessageValid(initialMessage)) {
      toast.error('Başlık en az 3 karakter, mesaj ise boşluksuz en az 1 karakter olmalıdır.');
      return;
    }
    setSubmitting(true);
    const newTicketId = crypto.randomUUID();
    const success = await insertSupportMessage(assignedAdminId, {
      version: 1,
      ticketId: newTicketId,
      kind: 'ticket',
      initiatedBy: 'user',
      category,
      subject: subject.trim(),
      message: initialMessage.trim(),
    });
    setSubmitting(false);
    if (!success) return;
    setSubject('');
    setInitialMessage('');
    setDialogOpen(false);
    setQueueFilter('all');
    toast.success('Destek talebiniz gönderildi.');
    await loadTickets(newTicketId);
  };

  const createAdminConversation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !isAdmin || !selectedTargetUser || submitting) return;
    if (adminSubject.trim().length < 3 || !isSupportMessageValid(adminInitialMessage)) {
      toast.error('Başlık en az 3 karakter, mesaj ise boşluksuz en az 1 karakter olmalıdır.');
      return;
    }
    setSubmitting(true);
    const newTicketId = crypto.randomUUID();
    const success = await insertSupportMessage(selectedTargetUser.user_id, {
      version: 1,
      ticketId: newTicketId,
      kind: 'ticket',
      initiatedBy: 'admin',
      category: adminCategory,
      subject: adminSubject.trim(),
      message: adminInitialMessage.trim(),
    });
    setSubmitting(false);
    if (!success) return;

    const recipientName = selectedTargetUser.full_name;
    setSelectedTargetUser(null);
    setUserSearchQuery('');
    setAdminSubject('');
    setAdminInitialMessage('');
    setAdminDialogOpen(false);
    setQueueFilter('all');
    toast.success(`${recipientName} ile destek görüşmesi başlatıldı.`);
    await loadTickets(newTicketId);
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedTicket || !reply.trim() || submitting || selectedTicket.status === 'closed')
      return;
    setSubmitting(true);
    const receiverId = isAdmin ? selectedTicket.userId : selectedTicket.adminId;
    const success = await insertSupportMessage(receiverId, {
      version: 1,
      ticketId: selectedTicket.id,
      kind: 'reply',
      message: reply.trim(),
    });
    setSubmitting(false);
    if (!success) return;
    setReply('');
    toast.success('Yanıtınız gönderildi.');
    await loadTickets(selectedTicket.id);
  };

  const updateStatus = async (ticket: SupportTicketRecord, status: 'reviewing' | 'closed') => {
    const success = await insertSupportMessage(ticket.userId, {
      version: 1,
      ticketId: ticket.id,
      kind: 'status',
      status,
    });
    if (!success) return;
    toast.success(status === 'closed' ? 'Görüşme / talep kapatıldı.' : 'İncelemeye alındı.');
    await loadTickets(ticket.id);
  };

  const deleteTicket = async (ticket: SupportTicketRecord) => {
    if (!isAdmin || ticket.status !== 'closed') return;
    const success = await insertSupportMessage(ticket.userId, {
      version: 1,
      ticketId: ticket.id,
      kind: 'deleted',
    });
    if (!success) return;
    toast.success('Destek kaydı listeden kaldırıldı.');
    await loadTickets();
  };

  if (authLoading || (!user && loading)) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }
  if (!user) {
    return (
      <Layout>
        <Card className="mx-auto mt-10 max-w-lg">
          <CardContent className="p-8 text-center">
            <LifeBuoy className="mx-auto mb-3 h-9 w-9 text-primary" />
            <h1 className="text-xl font-semibold">Destek Merkezi</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Destek talebi oluşturmak ve taleplerinizi takip etmek için giriş yapın.
            </p>
            <Button className="mt-5" onClick={() => navigate('/login')}>
              Giriş yap
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <LifeBuoy className="h-6 w-6" />
              </span>
              <div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Destek Merkezi</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {isAdmin
                    ? 'Kullanıcıların destek taleplerini yanıtlayın veya kişi seçerek doğrudan resmi destek görüşmesi başlatın.'
                    : 'Sorun, öneri veya geri bildiriminizi bize iletin; yönetimin size gönderdiği resmi destek mesajlarını buradan takip edin.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 self-start sm:self-auto">
              {isAdmin && 'Notification' in window && (
                <Button
                  variant="outline"
                  onClick={() => void enableNotifications()}
                  disabled={notificationsEnabled}
                  className="gap-2"
                >
                  <Smartphone className="h-4 w-4" />
                  {notificationsEnabled ? 'Bildirimler açık' : 'Bildirimleri aç'}
                </Button>
              )}
              {isAdmin ? (
                <Button onClick={openAdminNewConversationModal} className="shrink-0 gap-2">
                  <UserPlus className="h-4 w-4" /> Kişi Seç &amp; Konuşma Başlat
                </Button>
              ) : (
                <Button
                  onClick={() => setDialogOpen(true)}
                  disabled={!assignedAdminId}
                  className="shrink-0 gap-2"
                >
                  <Plus className="h-4 w-4" /> Yeni talep oluştur
                </Button>
              )}
            </div>
          </div>
          <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground sm:max-w-fit sm:px-4">
            <Clock3 className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {isAdmin
                ? 'Mesajlar bölümündeki kişisel arkadaş sohbetleriniz Destek Merkezi’nde görünmez; yalnızca buradan başlatılan resmi destek görüşmeleri yer alır.'
                : 'Gönderdiğiniz talepleri ve yönetici yanıtlarını buradan takip edebilirsiniz.'}
            </span>
          </div>
        </section>

        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {loadError}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.88fr)_minmax(0,1.62fr)]">
          <Card className="h-fit overflow-hidden">
            <CardHeader className="space-y-3 border-b border-border/70 p-4 sm:p-5">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  {isAdmin ? 'Destek & Görüşme Kuyruğu' : 'Taleplerim & Yönetici Mesajları'}
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {filteredTickets.length}
                  </span>
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {isAdmin
                    ? 'Kullanıcı taleplerini ve başlattığınız resmi görüşmeleri yönetin.'
                    : 'Destek taleplerinizi ve yönetimin başlattığı görüşmeleri görüntüleyin.'}
                </CardDescription>
              </div>

              {tickets.length > 0 && (
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
                  <button
                    type="button"
                    onClick={() => setQueueFilter('all')}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                      queueFilter === 'all'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Tümü ({tickets.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueFilter('user')}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                      queueFilter === 'user'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Talepler ({userInitiatedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueFilter('admin')}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                      queueFilter === 'admin'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Yönetim ({adminInitiatedCount})
                  </button>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-2 sm:p-3">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="mt-3 text-sm font-medium">
                    {tickets.length === 0 ? 'Henüz destek görüşmesi yok' : 'Bu filtrede kayıt yok'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAdmin
                      ? 'Kullanıcı talebi geldiğinde veya kişi seçip konuşma başlattığınızda burada görünür.'
                      : 'Bir konuda yardıma ihtiyacınız olursa yeni talep oluşturabilirsiniz.'}
                  </p>
                  {isAdmin && tickets.length === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openAdminNewConversationModal}
                      className="mt-4 gap-1.5"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Kişi Seç &amp; Konuşma Başlat
                    </Button>
                  )}
                </div>
              ) : (
                <div className="max-h-[62vh] space-y-1 overflow-y-auto">
                  {filteredTickets.map((ticket) => {
                    const badge = getTicketStatusBadge(ticket, isAdmin);
                    const studentMeta = userProfilesMap[ticket.userId];
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => setSelectedId(ticket.id)}
                        aria-pressed={ticket.id === selectedId}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${
                          ticket.id === selectedId
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent hover:border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex items-center gap-1.5 line-clamp-2 text-sm font-semibold">
                            {ticket.hasUnread && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                title="Okunmamış mesaj"
                              />
                            )}
                            <span>{ticket.subject}</span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {ticket.initiatedBy === 'admin' && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-primary">
                            <ShieldCheck className="h-3 w-3 shrink-0" />
                            <span>
                              {isAdmin ? 'Yönetici tarafından başlatıldı' : 'EconNotes Yönetimi mesajı'}
                            </span>
                          </div>
                        )}

                        <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate">
                            {isAdmin
                              ? studentMeta?.name ?? 'Kullanıcı'
                              : categoryLabel(ticket.category, ticket.initiatedBy === 'admin')}
                          </span>
                          <span className="shrink-0">{dateTime(ticket.updatedAt)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedTicket ? (
            <div className="min-w-0 space-y-4">
              <Card className="overflow-hidden">
                <CardHeader className="space-y-3 border-b border-border/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          {categoryLabel(
                            selectedTicket.category,
                            selectedTicket.initiatedBy === 'admin',
                          )}
                        </span>
                        {selectedTicket.initiatedBy === 'admin' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                            <ShieldCheck className="h-3 w-3" />
                            Yönetici Başlattı
                          </span>
                        )}
                        {isAdmin && (
                          <span className="text-xs font-medium text-foreground">
                            {userProfilesMap[selectedTicket.userId]?.name ?? 'Kullanıcı'}
                            {userProfilesMap[selectedTicket.userId]?.subtitle
                              ? ` (${userProfilesMap[selectedTicket.userId].subtitle})`
                              : ''}
                          </span>
                        )}
                      </div>
                      <CardTitle className="break-words text-lg sm:text-xl">
                        {selectedTicket.subject}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">
                        Başlangıç tarihi: {dateTime(selectedTicket.createdAt)}
                      </CardDescription>
                    </div>
                    {(() => {
                      const badge = getTicketStatusBadge(selectedTicket, isAdmin);
                      return (
                        <span
                          className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.initiatedBy === 'user' &&
                        selectedTicket.status !== 'reviewing' &&
                        selectedTicket.status !== 'closed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateStatus(selectedTicket, 'reviewing')}
                          >
                            <Search className="mr-1.5 h-3.5 w-3.5" />
                            İncelemeye al
                          </Button>
                        )}
                      {selectedTicket.status === 'closed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateStatus(selectedTicket, 'reviewing')}
                          >
                            <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                            Yeniden aç
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-destructive">
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Sil
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Destek kaydı listeden kaldırılsın mı?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Kayıt Destek Merkezi listelerinden kaldırılır. Mesaj kayıtları
                                  denetim amacıyla saklanır. Bu işlem geri alınamaz.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void deleteTicket(selectedTicket)}>
                                  Listeden kaldır
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      {selectedTicket.status !== 'closed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => void updateStatus(selectedTicket, 'closed')}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          Görüşmeyi kapat
                        </Button>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <ol
                    aria-label="Talep durumu"
                    className="grid grid-cols-4 rounded-2xl border border-border/70 bg-muted/20 px-1 py-5 sm:px-3 sm:py-6"
                  >
                    {progressSteps.map((step, index) => {
                      const complete = index < currentStage;
                      const current = index === currentStage;
                      const reached = complete || current;
                      const colorClasses = {
                        sky: reached
                          ? 'border-sky-500 bg-sky-500 text-white shadow-sky-500/25'
                          : 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300',
                        amber: reached
                          ? 'border-amber-500 bg-amber-500 text-white shadow-amber-500/25'
                          : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
                        emerald: reached
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-emerald-500/25'
                          : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
                        violet: reached
                          ? 'border-violet-500 bg-violet-500 text-white shadow-violet-500/25'
                          : 'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300',
                      }[step.color];
                      const connectorColorClasses = {
                        sky: 'bg-sky-500',
                        amber: 'bg-amber-500',
                        emerald: 'bg-emerald-500',
                        violet: 'bg-violet-500',
                      }[step.color];
                      return (
                        <li
                          key={step.label}
                          aria-current={current ? 'step' : undefined}
                          className="relative flex min-w-0 flex-col items-center text-center"
                        >
                          {index < progressSteps.length - 1 && (
                            <span
                              aria-hidden="true"
                              className={`absolute left-1/2 top-5 z-0 h-1 w-full -translate-y-1/2 rounded-full transition-colors duration-500 sm:top-6 ${
                                complete ? connectorColorClasses : 'bg-border'
                              }`}
                            />
                          )}
                          <span
                            className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-md ring-4 ring-background transition-all duration-700 sm:h-12 sm:w-12 ${colorClasses} ${
                              current ? 'support-stage-current motion-reduce:animate-none' : ''
                            }`}
                          >
                            {complete ? (
                              <Check className="h-5 w-5" />
                            ) : index === 0 ? (
                              <MessageSquareText className="h-4 w-4" />
                            ) : index === 1 ? (
                              <Search className="h-4 w-4" />
                            ) : index === 2 ? (
                              <MessageCircle className="h-4 w-4" />
                            ) : (
                              <Check className="h-5 w-5" />
                            )}
                          </span>
                          <span
                            className={`mt-3 max-w-full px-1 text-[10px] font-semibold sm:text-xs ${
                              reached ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {step.label}
                          </span>
                          {reached && (
                            <span className="mt-1 min-h-4 text-[9px] text-muted-foreground sm:text-[10px]">
                              {index === 0
                                ? dateTime(selectedTicket.createdAt)
                                : index === 1
                                ? dateTime(selectedTicket.reviewingAt)
                                : index === 2
                                ? dateTime(selectedTicket.firstResponseAt)
                                : selectedTicket.status === 'closed'
                                ? dateTime(selectedTicket.closedAt)
                                : null}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 px-4 py-3 sm:px-5">
                  <CardTitle className="text-sm">Görüşme yazışması</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <div className="max-h-[45vh] space-y-3 overflow-y-auto">
                    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-muted/40 p-4 shadow-sm sm:p-5">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs font-semibold">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                            {selectedTicket.initiatedBy === 'admin' ? (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            ) : (
                              <MessageSquareText className="h-3.5 w-3.5" />
                            )}
                          </span>
                          {selectedTicket.initiatedBy === 'admin'
                            ? 'EconNotes Yönetim Ekibi'
                            : userProfilesMap[selectedTicket.userId]?.name ??
                              profile?.full_name ??
                              'Talep sahibi'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {dateTime(selectedTicket.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {selectedTicket.initialMessage}
                      </p>
                    </div>
                    {selectedReplies.map((message) => {
                      const fromAdmin = message.senderId === selectedTicket.adminId;
                      const payload = parseSupportMessage(message.content);
                      const isStatus = payload?.kind === 'status';
                      const senderDisplayName = isStatus
                        ? 'Durum güncellemesi'
                        : fromAdmin
                        ? 'EconNotes Destek Ekibi'
                        : isAdmin
                        ? userProfilesMap[message.senderId]?.name ?? 'Kullanıcı'
                        : profile?.full_name ?? 'Siz';

                      return (
                        <div
                          key={message.id}
                          className={`max-w-[94%] rounded-2xl border p-3.5 shadow-sm sm:max-w-[85%] sm:p-4 ${
                            isStatus
                              ? 'mx-auto border-border/80 bg-muted/40 text-center'
                              : fromAdmin
                              ? 'border-primary/20 bg-gradient-to-br from-primary/5 to-card'
                              : 'ml-auto border-border/80 bg-muted/40'
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                              {fromAdmin && !isStatus && (
                                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                              )}
                              {senderDisplayName}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {dateTime(message.createdAt)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {getSupportMessageBody(message.content)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {selectedTicket.status === 'closed' ? (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
                      Bu görüşme kapatıldı.{' '}
                      {isAdmin
                        ? 'Gerekirse yukarıdan yeniden açabilir veya kişi seçerek yeni görüşme başlatabilirsiniz.'
                        : 'Yeni bir konu için yeni destek talebi oluşturabilirsiniz.'}
                    </div>
                  ) : (
                    <form
                      onSubmit={(event) => void sendReply(event)}
                      className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
                    >
                      <Textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        minLength={1}
                        maxLength={5000}
                        rows={3}
                        placeholder={
                          isAdmin
                            ? 'Kullanıcıya yanıtınızı yazın…'
                            : 'Destek ekibine yanıtınızı yazın…'
                        }
                        required
                        className="min-h-[88px] resize-y sm:min-h-[44px]"
                      />
                      <Button
                        type="submit"
                        disabled={submitting || !reply.trim()}
                        className="shrink-0 gap-2 self-end"
                      >
                        <Send className="h-4 w-4" />
                        {submitting ? 'Gönderiliyor' : 'Gönder'}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="flex min-h-[360px] items-center justify-center p-8 text-center">
              <div>
                <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <h2 className="mt-3 font-semibold">Görüntülenecek görüşme seçin</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isAdmin
                    ? 'Soldan bir kayıt seçin veya üstten kişi seçerek yeni destek görüşmesi başlatın.'
                    : 'Talep durumunu ve yönetici yazışmalarını burada görebilirsiniz.'}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Regular User: Create Support Ticket Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni destek talebi</DialogTitle>
            <DialogDescription>Konu ve mesajınızı destek ekibine gönderin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void createTicket(event)} className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Talep konusu
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Kısa başlık
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                minLength={3}
                maxLength={120}
                placeholder="Örn. Not indirme sorunu"
                required
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Mesajınız
              <Textarea
                value={initialMessage}
                onChange={(event) => setInitialMessage(event.target.value)}
                minLength={1}
                maxLength={5000}
                rows={5}
                placeholder="Sorunu veya önerinizi ayrıntılı olarak anlatın…"
                required
              />
              <span className="block text-right text-xs font-normal text-muted-foreground">
                {initialMessage.length}/5000
              </span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Vazgeç
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting || subject.trim().length < 3 || !isSupportMessageValid(initialMessage)
                }
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Talebi gönder
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Platform Admin: Select User & Start Official Support Conversation Dialog */}
      <Dialog
        open={adminDialogOpen}
        onOpenChange={(open) => {
          setAdminDialogOpen(open);
          if (!open) {
            setUserSearchQuery('');
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Destek Merkezi Üzerinden Konuşma Başlat
            </DialogTitle>
            <DialogDescription>
              İletişime geçmek istediğiniz kullanıcıyı seçin. Bu görüşme arkadaşlık isteği
              gerektirmeden doğrudan kullanıcının <strong>Destek Merkezi</strong> ekranında açılır
              ve kişisel Mesajlar kutunuza karışmaz.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => void createAdminConversation(event)} className="space-y-4">
            {/* Step 1: User Picker or Selected User Banner */}
            {!selectedTargetUser ? (
              <div className="space-y-2.5">
                <label className="block text-sm font-medium">1. Kullanıcı Seçin</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={userSearchQuery}
                    onChange={(event) => setUserSearchQuery(event.target.value)}
                    placeholder="İsim, üniversite veya bölüm ile kullanıcı ara..."
                    className="pl-9"
                  />
                </div>

                <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-border/80 bg-muted/20 p-2">
                  {directoryLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Kullanıcılar yükleniyor…
                    </div>
                  ) : filteredDirectoryUsers.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      Eşleşen kullanıcı bulunamadı.
                    </p>
                  ) : (
                    filteredDirectoryUsers.slice(0, 80).map((u) => {
                      const openThread = tickets.find(
                        (t) => t.userId === u.user_id && t.status !== 'closed',
                      );
                      return (
                        <div
                          key={u.user_id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-transparent bg-card p-2.5 transition-colors hover:border-primary/30 hover:bg-primary/5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar className="h-8 w-8 shrink-0">
                              {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                              <AvatarFallback className="text-xs">
                                {u.full_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{u.full_name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[u.university, u.department, u.grade ? `${u.grade}. Sınıf` : '']
                                  .filter(Boolean)
                                  .join(' • ') || 'Profil detayı yok'}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {openThread && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs text-primary"
                                onClick={() => {
                                  setQueueFilter('all');
                                  setSelectedId(openThread.id);
                                  setAdminDialogOpen(false);
                                }}
                              >
                                Açık Görüşme
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 px-2.5 text-xs"
                              onClick={() => setSelectedTargetUser(u)}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Seç
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    {selectedTargetUser.avatar_url && (
                      <AvatarImage src={selectedTargetUser.avatar_url} />
                    )}
                    <AvatarFallback className="text-xs">
                      {selectedTargetUser.full_name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      Seçilen Kullanıcı
                    </p>
                    <p className="truncate text-sm font-semibold">{selectedTargetUser.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[selectedTargetUser.university, selectedTargetUser.department]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedTargetUser(null)}
                >
                  Kişiyi Değiştir
                </Button>
              </div>
            )}

            {/* Step 2: Category, Subject & Message */}
            <label className="block space-y-1.5 text-sm font-medium">
              Konu türü
              <select
                value={adminCategory}
                onChange={(event) =>
                  setAdminCategory(event.target.value as SupportTicketCategory)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.adminLabel}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="admin-support-subject">
                Görüşme başlığı
              </label>
              <Input
                id="admin-support-subject"
                value={adminSubject}
                onChange={(event) => setAdminSubject(event.target.value)}
                minLength={3}
                maxLength={120}
                placeholder="Örn. Paylaştığınız ders notu hakkında bilgilendirme"
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ADMIN_SUBJECT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAdminSubject(preset)}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-1.5 text-sm font-medium">
              Mesajınız
              <Textarea
                value={adminInitialMessage}
                onChange={(event) => setAdminInitialMessage(event.target.value)}
                minLength={1}
                maxLength={5000}
                rows={4}
                placeholder="Kullanıcıya iletmek istediğiniz resmi destek mesajını yazın…"
                required
              />
              <span className="block text-right text-xs font-normal text-muted-foreground">
                {adminInitialMessage.length}/5000
              </span>
            </label>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setAdminDialogOpen(false)}>
                Vazgeç
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting ||
                  !selectedTargetUser ||
                  adminSubject.trim().length < 3 ||
                  !isSupportMessageValid(adminInitialMessage)
                }
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Konuşmayı Başlat
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Support;
