import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, LifeBuoy, Loader2, MessageCircle, MessageSquareText, Plus, Search, Send, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import {
  encodeSupportMessage,
  getAssignedSupportAdmin,
  getSupportMessageBody,
  getSupportTicketStage,
  parseSupportMessage,
  SUPPORT_MESSAGE_PREFIX,
  type SupportMessagePayload,
  type SupportTicketCategory,
  type SupportTicketStatus,
} from '@/lib/support';

type StoredMessage = Database['public']['Tables']['messages']['Row'];
type Ticket = {
  id: string;
  userId: string;
  adminId: string;
  category: SupportTicketCategory;
  subject: string;
  initialMessage: string;
  createdAt: string;
  status: SupportTicketStatus;
  reviewingAt: string | null;
  firstResponseAt: string | null;
  closedAt: string | null;
  replies: { id: string; senderId: string; content: string; createdAt: string; kind: 'reply' | 'status' }[];
};

const categories: { value: SupportTicketCategory; label: string }[] = [
  { value: 'technical', label: 'Teknik sorun' },
  { value: 'suggestion', label: 'Öneri' },
  { value: 'complaint', label: 'Şikâyet' },
  { value: 'account', label: 'Hesap işlemleri' },
  { value: 'other', label: 'Diğer' },
];

const statusInfo: Record<SupportTicketStatus, { label: string; className: string }> = {
  submitted: { label: 'Gönderildi', className: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  reviewing: { label: 'İnceleniyor', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  answered: { label: 'Yanıtlandı', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  closed: { label: 'Kapatıldı', className: 'border-muted-foreground/20 bg-muted text-muted-foreground' },
};

const dateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const categoryLabel = (value: SupportTicketCategory) => categories.find((item) => item.value === value)?.label ?? value;

const isTicketPayload = (
  payload: SupportMessagePayload,
): payload is Extract<SupportMessagePayload, { kind: 'ticket' }> => payload.kind === 'ticket';

const buildTickets = (rows: StoredMessage[], adminView: boolean, currentUserId: string): Ticket[] => {
  const orderedRows = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tickets = new Map<string, Ticket>();

  for (const row of orderedRows) {
    const payload = parseSupportMessage(row.content);
    if (!payload || !isTicketPayload(payload)) continue;
    if (adminView ? row.receiver_id !== currentUserId || row.sender_id === currentUserId : row.sender_id !== currentUserId) continue;
    if (row.sender_id === row.receiver_id) continue;
    tickets.set(payload.ticketId, {
      id: payload.ticketId,
      userId: row.sender_id,
      adminId: row.receiver_id,
      category: payload.category,
      subject: payload.subject,
      initialMessage: payload.message,
      createdAt: row.created_at,
      status: 'submitted',
      reviewingAt: null,
      firstResponseAt: null,
      closedAt: null,
      replies: [],
    });
  }

  for (const row of orderedRows) {
    const payload = parseSupportMessage(row.content);
    if (!payload || isTicketPayload(payload)) continue;
    const ticket = tickets.get(payload.ticketId);
    if (!ticket || (row.sender_id !== ticket.userId && row.sender_id !== ticket.adminId)) continue;

    if (payload.kind === 'status') {
      if (row.sender_id !== ticket.adminId) continue;
      ticket.status = payload.status;
      if (payload.status === 'reviewing') ticket.reviewingAt ??= row.created_at;
      else ticket.closedAt = row.created_at;
      ticket.replies.push({ id: row.id, senderId: row.sender_id, content: row.content, createdAt: row.created_at, kind: 'status' });
    } else {
      ticket.replies.push({ id: row.id, senderId: row.sender_id, content: row.content, createdAt: row.created_at, kind: 'reply' });
      if (row.sender_id === ticket.adminId) {
        ticket.firstResponseAt ??= row.created_at;
        ticket.status = 'answered';
      } else if (ticket.status === 'answered') {
        ticket.status = 'reviewing';
        ticket.reviewingAt ??= row.created_at;
      }
    }
  }

  return [...tickets.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const Support = () => {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignedAdminId, setAssignedAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [category, setCategory] = useState<SupportTicketCategory>('technical');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const adminIdsResult = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    const adminIds = [...new Set((adminIdsResult.data ?? []).map((row) => row.user_id))];
    let availableAdminIds = adminIds;
    if (!isAdmin && availableAdminIds.length === 0) {
      if (adminIdsResult.error) {
        console.warn('Support admin role list is unavailable; falling back to the latest admin announcement author:', adminIdsResult.error);
      } else {
        console.warn('Support admin role list is empty; falling back to the latest admin announcement author.');
      }
      const announcementResult = await supabase
        .from('announcements')
        .select('user_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (announcementResult.error) {
        console.error('Support announcement admin fallback failed:', announcementResult.error);
      } else if (announcementResult.data?.user_id) {
        availableAdminIds = [announcementResult.data.user_id];
      }
    }
    const assigned = isAdmin ? user.id : getAssignedSupportAdmin(user.id, availableAdminIds);
    setAssignedAdminId(assigned);
    if (!assigned) {
      setTickets([]);
      setUserNames({});
      setLoadError('Yönetici hesabı destek için belirlenemedi. Yöneticinin en az bir duyurusu olmalı veya yönetici rolü sorgulanabilmeli.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .like('content', `${SUPPORT_MESSAGE_PREFIX}%`)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Support messages load failed:', error);
      setLoadError('Destek talepleri yüklenemedi. Lütfen tekrar deneyin.');
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    const nextTickets = buildTickets(rows, isAdmin, user.id);
    setTickets(nextTickets);
    setLoadError(null);
    setSelectedId((current) => (nextTickets.some((ticket) => ticket.id === current) ? current : nextTickets[0]?.id ?? null));
    if (isAdmin && nextTickets.length) {
      const profileResult = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', [...new Set(nextTickets.map((ticket) => ticket.userId))]);
      if (profileResult.error) {
        console.error('Support user profiles load failed:', profileResult.error);
        setLoadError('Talep sahiplerinin bilgileri yüklenemedi.');
        setLoading(false);
        return;
      }
      setUserNames(Object.fromEntries((profileResult.data ?? []).map((item) => [item.user_id, item.full_name || 'Kullanıcı'])));
    } else {
      setUserNames({});
    }
    setLoading(false);
  }, [isAdmin, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void loadTickets();
  }, [authLoading, loadTickets, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`support-messages-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { void loadTickets(); })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          toast.error('Destek canlı bağlantısı kurulamadı. Sayfayı yenileyip tekrar deneyin.');
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [loadTickets, user]);

  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) ?? null, [selectedId, tickets]);
  const selectedReplies = selectedTicket?.replies ?? [];
  const selectedStage = selectedTicket
    ? getSupportTicketStage(selectedTicket.status, selectedTicket.firstResponseAt, selectedTicket.reviewingAt)
    : 0;

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

  const createTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !assignedAdminId || submitting) return;
    setSubmitting(true);
    const success = await insertSupportMessage(assignedAdminId, {
      version: 1,
      ticketId: crypto.randomUUID(),
      kind: 'ticket',
      category,
      subject: subject.trim(),
      message: initialMessage.trim(),
    });
    setSubmitting(false);
    if (!success) return;
    setSubject('');
    setInitialMessage('');
    setDialogOpen(false);
    toast.success('Destek talebiniz gönderildi.');
    await loadTickets();
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedTicket || !reply.trim() || submitting || selectedTicket.status === 'closed') return;
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
    await loadTickets();
  };

  const updateStatus = async (ticket: Ticket, status: 'reviewing' | 'closed') => {
    const success = await insertSupportMessage(ticket.userId, {
      version: 1,
      ticketId: ticket.id,
      kind: 'status',
      status,
    });
    if (!success) return;
    toast.success(status === 'closed' ? 'Talep kapatıldı.' : 'Talep incelemeye alındı.');
    await loadTickets();
  };

  if (authLoading || (!user && loading)) {
    return <Layout><div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div></Layout>;
  }
  if (!user) {
    return <Layout><Card className="mx-auto mt-10 max-w-lg"><CardContent className="p-8 text-center"><LifeBuoy className="mx-auto mb-3 h-9 w-9 text-primary" /><h1 className="text-xl font-semibold">Destek Merkezi</h1><p className="mt-2 text-sm text-muted-foreground">Destek talebi oluşturmak ve taleplerinizi takip etmek için giriş yapın.</p><Button className="mt-5" onClick={() => navigate('/login')}>Giriş yap</Button></CardContent></Card></Layout>;
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><LifeBuoy className="h-6 w-6" /></span>
              <div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Destek Merkezi</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Sorun, öneri veya geri bildiriminizi bize iletin. Destek ekibi talepleri buradan yanıtlar.</p>
              </div>
            </div>
            {!isAdmin && <Button onClick={() => setDialogOpen(true)} className="shrink-0 gap-2 self-start sm:self-auto"><Plus className="h-4 w-4" /> Yeni talep oluştur</Button>}
          </div>
          <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground sm:max-w-fit sm:px-4">
            <Clock3 className="h-4 w-4 shrink-0 text-primary" />
            <span>Gönderdiğiniz talepleri ve yönetici yanıtlarını buradan takip edebilirsiniz.</span>
          </div>
        </section>

        {loadError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.65fr)]">
          <Card className="h-fit overflow-hidden">
            <CardHeader className="border-b border-border/70 p-4 sm:p-5">
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="h-4 w-4 text-primary" />{isAdmin ? 'Talep kuyruğu' : 'Taleplerim'}<span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tickets.length}</span></CardTitle>
              <CardDescription className="text-xs">{isAdmin ? 'Kullanıcı taleplerini inceleyin ve yanıtlayın.' : 'Durum ve yazışmalarınızı buradan takip edin.'}</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : tickets.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="mt-3 text-sm font-medium">Henüz destek talebi yok</p>
                  <p className="mt-1 text-xs text-muted-foreground">{isAdmin ? 'Kullanıcı talebi geldiğinde burada görünür.' : 'Bir konuda yardıma ihtiyacınız olursa yeni talep oluşturabilirsiniz.'}</p>
                </div>
              ) : (
                <div className="max-h-[62vh] space-y-1 overflow-y-auto">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      aria-pressed={ticket.id === selectedId}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${ticket.id === selectedId ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/50'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-semibold">{ticket.subject}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusInfo[ticket.status].className}`}>{statusInfo[ticket.status].label}</span>
                      </div>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{isAdmin ? (userNames[ticket.userId] ?? 'Kullanıcı') : categoryLabel(ticket.category)}</span>
                        <span>{dateTime(ticket.createdAt)}</span>
                      </span>
                    </button>
                  ))}
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
                        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{categoryLabel(selectedTicket.category)}</span>
                        {isAdmin && <span className="text-xs text-muted-foreground">{userNames[selectedTicket.userId] ?? 'Kullanıcı'}</span>}
                      </div>
                      <CardTitle className="break-words text-lg sm:text-xl">{selectedTicket.subject}</CardTitle>
                      <CardDescription className="mt-1 text-xs">Talep tarihi: {dateTime(selectedTicket.createdAt)}</CardDescription>
                    </div>
                    <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo[selectedTicket.status].className}`}>{statusInfo[selectedTicket.status].label}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.status !== 'reviewing' && selectedTicket.status !== 'closed' && <Button size="sm" variant="outline" onClick={() => void updateStatus(selectedTicket, 'reviewing')}><Search className="mr-1.5 h-3.5 w-3.5" />İncelemeye al</Button>}
                      {selectedTicket.status === 'closed' && <Button size="sm" variant="outline" onClick={() => void updateStatus(selectedTicket, 'reviewing')}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Yeniden aç</Button>}
                      {selectedTicket.status !== 'closed' && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void updateStatus(selectedTicket, 'closed')}><XCircle className="mr-1.5 h-3.5 w-3.5" />Talebi kapat</Button>}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <ol aria-label="Talep durumu" className="grid grid-cols-1 gap-0 sm:grid-cols-4 sm:gap-2">
                    {['Talep gönderildi', 'İnceleniyor', 'Yanıtlandı', 'Kapatıldı'].map((label, index) => {
                      const visible = index <= selectedStage || (selectedTicket.status === 'closed' && index === 3);
                      return <li key={label} className={`border-l-2 py-1 pl-3 text-xs sm:border-l-0 sm:pl-0 sm:text-center ${visible ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}>{label}</li>;
                    })}
                  </ol>
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 px-4 py-3 sm:px-5"><CardTitle className="text-sm">Talep yazışması</CardTitle></CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <div className="max-h-[45vh] space-y-3 overflow-y-auto">
                    <div className="rounded-xl border border-border bg-muted/40 p-3.5 sm:p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{userNames[selectedTicket.userId] ?? profile?.full_name ?? 'Talep sahibi'}</span>
                        <span className="text-[11px] text-muted-foreground">{dateTime(selectedTicket.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{selectedTicket.initialMessage}</p>
                    </div>
                    {selectedReplies.map((message) => {
                      const fromAdmin = message.senderId === selectedTicket.adminId;
                      const payload = parseSupportMessage(message.content);
                      const isStatus = payload?.kind === 'status';
                      return (
                        <div key={message.id} className={`max-w-[94%] rounded-xl border p-3.5 sm:max-w-[85%] sm:p-4 ${isStatus ? 'mx-auto border-border bg-muted/40 text-center' : fromAdmin ? 'border-primary/20 bg-primary/5' : 'ml-auto border-border bg-muted/40'}`}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                              {fromAdmin && !isStatus && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                              {isStatus ? 'Talep durumu' : fromAdmin ? 'EconNotes destek ekibi' : (userNames[message.senderId] ?? 'Kullanıcı')}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{dateTime(message.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{getSupportMessageBody(message.content)}</p>
                        </div>
                      );
                    })}
                  </div>
                  {selectedTicket.status === 'closed' ? (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">Bu talep kapatıldı. Yeni bir konu için yeni destek talebi oluşturabilirsiniz.</div>
                  ) : (
                    <form onSubmit={(event) => void sendReply(event)} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Textarea value={reply} onChange={(event) => setReply(event.target.value)} minLength={1} maxLength={5000} rows={3} placeholder={isAdmin ? 'Kullanıcıya yanıtınızı yazın…' : 'Talebinizle ilgili ek bilgi veya yanıtınızı yazın…'} required className="min-h-[88px] resize-y sm:min-h-[44px]" />
                      <Button type="submit" disabled={submitting || !reply.trim()} className="shrink-0 gap-2 self-end"><Send className="h-4 w-4" />{submitting ? 'Gönderiliyor' : 'Gönder'}</Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="flex min-h-[360px] items-center justify-center p-8 text-center">
              <div><MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/50" /><h2 className="mt-3 font-semibold">Görüntülenecek talep seçin</h2><p className="mt-1 text-sm text-muted-foreground">Talep durumunu ve yazışmaları burada görebilirsiniz.</p></div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni destek talebi</DialogTitle>
            <DialogDescription>Konu ve mesajınızı destek ekibine gönderin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void createTicket(event)} className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Talep konusu
              <select value={category} onChange={(event) => setCategory(event.target.value as SupportTicketCategory)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring">
                {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Kısa başlık
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={120} placeholder="Örn. Not indirme sorunu" required />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Mesajınız
              <Textarea value={initialMessage} onChange={(event) => setInitialMessage(event.target.value)} minLength={10} maxLength={5000} rows={5} placeholder="Sorunu veya önerinizi ayrıntılı olarak anlatın…" required />
              <span className="block text-right text-xs font-normal text-muted-foreground">{initialMessage.length}/5000</span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Vazgeç</Button>
              <Button type="submit" disabled={submitting || subject.trim().length < 3 || initialMessage.trim().length < 10} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Talebi gönder
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Support;
