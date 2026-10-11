import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  LifeBuoy,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Plus,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
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
import { getSupportTicketStage, type SupportTicketStatus } from '@/lib/support';

type Ticket = Database['public']['Tables']['support_tickets']['Row'];
type TicketMessage = Database['public']['Tables']['support_ticket_messages']['Row'];
type TicketStatus = SupportTicketStatus;
type TicketCategory = 'technical' | 'suggestion' | 'complaint' | 'account' | 'other';

const categories: { value: TicketCategory; label: string }[] = [
  { value: 'technical', label: 'Teknik sorun' },
  { value: 'suggestion', label: 'Öneri' },
  { value: 'complaint', label: 'Şikâyet' },
  { value: 'account', label: 'Hesap işlemleri' },
  { value: 'other', label: 'Diğer' },
];

const statusInfo: Record<TicketStatus, { label: string; className: string }> = {
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

const categoryLabel = (value: string) => categories.find((category) => category.value === value)?.label ?? value;

const TicketProgress = ({ ticket }: { ticket: Ticket }) => {
  const status = ticket.status as TicketStatus;
  const stage = getSupportTicketStage(status, ticket.first_response_at, ticket.reviewing_at);
  const closed = status === 'closed';
  const steps = [
    { label: 'Talep gönderildi', date: ticket.created_at, icon: CheckCircle2 },
    { label: 'İnceleniyor', date: ticket.reviewing_at, icon: Search },
    { label: 'Yanıtlandı', date: ticket.first_response_at, icon: MessageCircle },
    { label: 'Talep kapatıldı', date: ticket.closed_at, icon: XCircle },
  ];

  return (
    <ol aria-label="Talep durumu" className="grid grid-cols-1 gap-0 sm:grid-cols-4 sm:gap-2">
      {steps.map((step, index) => {
        const current = closed ? index === 3 : index === stage;
        const visible = index <= stage || (closed && index === 3);
        const Icon = step.icon;
        return (
          <li key={step.label} className="relative flex min-h-[56px] gap-3 sm:min-h-[92px] sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute left-[15px] top-8 h-[calc(100%-24px)] w-0.5 transition-colors duration-500 sm:left-[calc(50%+17px)] sm:top-[15px] sm:h-0.5 sm:w-[calc(100%-18px)] ${
                  index < stage || (closed && index === stage) ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                visible
                  ? current
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.3)]'
                    : 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground'
              } $              {current && !closed ? 'animate-pulse' : ''}`}
            >
              {visible ? <Icon className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
            </span>
            <span className="pb-4 sm:pb-0">
              <span className={`block text-sm font-medium ${visible ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
              {visible && step.date && <span className="mt-0.5 block text-xs text-muted-foreground">{dateTime(step.date)}</span>}
              {current && !closed && (
                <span className="mt-0.5 block text-xs text-primary">Güncel aşama <ArrowRight className="ml-1 inline h-3 w-3" /></span>
              )}
              {closed && index === 3 && <span className="mt-0.5 block text-xs text-muted-foreground">Otomatik veya yönetici tarafından kapatıldı</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const Support = () => {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [category, setCategory] = useState<TicketCategory>('technical');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    let ticketQuery = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (!isAdmin) ticketQuery = ticketQuery.eq('user_id', user.id);
    const { data: ticketData, error: ticketError } = await ticketQuery;
    if (ticketError) {
      setLoadError('Destek talepleri yüklenemedi. Lütfen daha sonra tekrar deneyin.');
      setLoading(false);
      console.error('Support tickets load failed:', ticketError);
      return;
    }

    const nextTickets = ticketData ?? [];
    setTickets(nextTickets);
    setLoadError(null);
    setSelectedId((current) => (nextTickets.some((ticket) => ticket.id === current) ? current : nextTickets[0]?.id ?? null));
    if (!nextTickets.length) {
      setMessages([]);
      setUserNames({});
      setLoading(false);
      return;
    }

    const [messageResult, profileResult] = await Promise.all([
      supabase
        .from('support_ticket_messages')
        .select('*')
        .in('ticket_id', nextTickets.map((ticket) => ticket.id))
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', Array.from(new Set(nextTickets.map((ticket) => ticket.user_id)))),
    ]);
    if (messageResult.error || profileResult.error) {
      const error = messageResult.error ?? profileResult.error;
      setLoadError('Talep yazışmaları yüklenemedi. Lütfen daha sonra tekrar deneyin.');
      setLoading(false);
      console.error('Support conversation load failed:', error);
      return;
    }
    setMessages(messageResult.data ?? []);
    setUserNames(Object.fromEntries((profileResult.data ?? []).map((item) => [item.user_id, item.full_name || 'Kullanıcı'])));
    setLoading(false);
  }, [isAdmin, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadTickets();
  }, [authLoading, loadTickets, user]);

  useEffect(() => {
    if (!user) return;
    const ticketChannel = supabase
      .channel(`support-tickets-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_tickets',
          ...(isAdmin ? {} : { filter: `user_id=eq.${user.id}` }),
        },
        () => { void loadTickets(); },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_messages' }, () => { void loadTickets(); })
      .subscribe();
    return () => { void supabase.removeChannel(ticketChannel); };
  }, [isAdmin, loadTickets, user]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  );
  const selectedMessages = useMemo(
    () => messages.filter((message) => message.ticket_id === selectedId),
    [messages, selectedId],
  );

  const createTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || submitting) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        category,
        subject: subject.trim(),
        initial_message: initialMessage.trim(),
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      console.error('Support ticket create failed:', error);
      toast.error('Destek talebi gönderilemedi. Lütfen tekrar deneyin.');
      return;
    }
    setTickets((current) => [data, ...current]);
    setSelectedId(data.id);
    setSubject('');
    setInitialMessage('');
    setDialogOpen(false);
    toast.success('Destek talebiniz gönderildi.');
    void loadTickets();
  };

  const sendReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedTicket || !reply.trim() || submitting || selectedTicket.status === 'closed') return;
    setSubmitting(true);
    const { error } = await supabase.from('support_ticket_messages').insert({
      ticket_id: selectedTicket.id,
      author_id: user.id,
      author_role: isAdmin ? 'admin' : 'user',
      message: reply.trim(),
    });
    setSubmitting(false);
    if (error) {
      console.error('Support reply send failed:', error);
      toast.error('Mesajınız gönderilemedi. Talep kapalı olabilir; lütfen yenileyip tekrar deneyin.');
      return;
    }
    setReply('');
    toast.success('Mesajınız gönderildi.');
    void loadTickets();
  };

  const updateStatus = async (ticket: Ticket, status: 'reviewing' | 'closed') => {
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticket.id);
    if (error) {
      console.error('Support ticket status update failed:', error);
      toast.error('Talep durumu güncellenemedi.');
      return;
    }
    toast.success(status === 'closed' ? 'Talep kapatıldı.' : 'Talep incelemeye alındı.');
    void loadTickets();
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
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Sorun, öneri veya geri bildiriminizi bize iletin. Destek ekibi talepleri sırayla inceler.</p>
              </div>
            </div>
            {!isAdmin && <Button onClick={() => setDialogOpen(true)} className="shrink-0 gap-2 self-start sm:self-auto"><Plus className="h-4 w-4" /> Yeni talep oluştur</Button>}
          </div>
          <div className="relative mt-5 flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground sm:max-w-fit sm:px-4">
            <Clock3 className="h-4 w-4 shrink-0 text-primary" />
            <span>Yanıt hedefi: talep oluşturulduktan sonra <strong className="font-semibold text-foreground">48 saat içinde</strong>.</span>
          </div>
        </section>

        {loadError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.65fr)]">
          <Card className="h-fit overflow-hidden">
            <CardHeader className="border-b border-border/70 p-4 sm:p-5">
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="h-4 w-4 text-primary" />{isAdmin ? 'Talep kuyruğu' : 'Taleplerim'}<span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tickets.length}</span></CardTitle>
              <CardDescription className="text-xs">{isAdmin ? 'Yanıt bekleyen talepleri inceleyin ve yanıtlayın.' : 'Durum ve yazışmalarınızı buradan takip edin.'}</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : tickets.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="mt-3 text-sm font-medium">Henüz destek talebi yok</p>
                  <p className="mt-1 text-xs text-muted-foreground">Bir konuda yardıma ihtiyacınız olursa yeni talep oluşturabilirsiniz.</p>
                </div>
              ) : (
                <div className="max-h-[62vh] space-y-1 overflow-y-auto">
                  {tickets.map((ticket) => {
                    const status = statusInfo[ticket.status as TicketStatus];
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => setSelectedId(ticket.id)}
                        aria-pressed={ticket.id === selectedId}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${ticket.id === selectedId ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/50'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 text-sm font-semibold">{ticket.subject}</span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                        </div>
                        <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{isAdmin ? (userNames[ticket.user_id] ?? 'Kullanıcı') : categoryLabel(ticket.category)}</span>
                          <span>{dateTime(ticket.created_at)}</span>
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
                        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{categoryLabel(selectedTicket.category)}</span>
                        {isAdmin && <span className="text-xs text-muted-foreground">{userNames[selectedTicket.user_id] ?? 'Kullanıcı'}</span>}
                      </div>
                      <CardTitle className="break-words text-lg sm:text-xl">{selectedTicket.subject}</CardTitle>
                      <CardDescription className="mt-1 text-xs">Talep tarihi: {dateTime(selectedTicket.created_at)}</CardDescription>
                    </div>
                    <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo[selectedTicket.status as TicketStatus].className}`}>
                      {statusInfo[selectedTicket.status as TicketStatus].label}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.status === 'submitted' && <Button size="sm" variant="outline" onClick={() => void updateStatus(selectedTicket, 'reviewing')}><Search className="mr-1.5 h-3.5 w-3.5" />İncelemeye al</Button>}
                      {selectedTicket.status === 'closed' && <Button size="sm" variant="outline" onClick={() => void updateStatus(selectedTicket, 'reviewing')}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Yeniden aç</Button>}
                      {selectedTicket.status !== 'closed' && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void updateStatus(selectedTicket, 'closed')}><XCircle className="mr-1.5 h-3.5 w-3.5" />Talebi kapat</Button>}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <TicketProgress ticket={selectedTicket} />
                  {selectedTicket.status !== 'closed' && !selectedTicket.first_response_at && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {new Date(selectedTicket.response_due_at).getTime() > Date.now()
                        ? `Yanıt hedefi: ${dateTime(selectedTicket.response_due_at)}`
                        : 'Yanıt hedef süresi aşıldı; talebiniz sırada.'}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 px-4 py-3 sm:px-5">
                  <CardTitle className="text-sm">Talep yazışması</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                  <div className="max-h-[45vh] space-y-3 overflow-y-auto">
                    <div className="rounded-xl border border-border bg-muted/40 p-3.5 sm:p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{userNames[selectedTicket.user_id] ?? profile?.full_name ?? 'Talep sahibi'}</span>
                        <span className="text-[11px] text-muted-foreground">{dateTime(selectedTicket.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{selectedTicket.initial_message}</p>
                    </div>
                    {selectedMessages.map((message) => {
                      const fromAdmin = message.author_role === 'admin';
                      return (
                        <div key={message.id} className={`max-w-[94%] rounded-xl border p-3.5 sm:max-w-[85%] sm:p-4 ${fromAdmin ? 'border-primary/20 bg-primary/5' : 'ml-auto border-border bg-muted/40'}`}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                              {fromAdmin && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                              {fromAdmin ? 'EconNotes destek ekibi' : (userNames[message.author_id] ?? 'Kullanıcı')}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{dateTime(message.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.message}</p>
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
            <DialogDescription>Konu ve mesajınızı paylaşın. Destek ekibi talebinize 48 saat içinde yanıt vermeyi hedefler.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void createTicket(event)} className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Talep konusu
              <select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring">
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
