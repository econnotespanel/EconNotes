import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, VideoOff, Users, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sendOneSignalNotification } from '@/lib/onesignal';
import {
  broadcastNewAnnouncement,
  markLocalAnnouncementCreated,
  notifyAnnouncementsUpdated,
} from '@/lib/deviceNotifications';

const LIVE_CLASS_RULES = [
  'Canlı ders süresince tüm katılımcılar birbirine saygılı davranmalıdır.',
  'Hakaret, küfür, argo veya aşağılayıcı ifadeler kesinlikle yasaktır.',
  'Ders sırasında gereksiz gürültü yapılmamalıdır. Mikrofonunuzu kapatınız.',
  'Ders içeriğinin kaydedilmesi veya paylaşılması yasaktır.',
  'Uygunsuz görsel veya ses paylaşımı yapılması durumunda dersten çıkarılırsınız.',
  'Sohbet alanında spam veya reklam içerikli mesajlar yasaktır.',
  'Yönetici ekibinin talimatlarına uyulmalıdır.',
  'Kurallara uymayan kullanıcılar cezalandırılabilir.',
];

const LiveClass = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [acceptChecked, setAcceptChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    const checkLive = async () => {
      const { data } = await supabase.from('announcements')
        .select('content')
        .ilike('title', '%Canlı Ders%')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const match = data[0].content.match(/Oda:\s*([A-Za-z0-9_-]{4,64})/);
        if (match && match[1]) {
          setRoomName(match[1]);
          setIsLive(true);
        }
      }
    };
    void checkLive();
    if (isAdmin) setRulesAccepted(true);
  }, [user, authLoading, isAdmin, navigate]);

  const startClass = async () => {
    const rand =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 12);
    const room = `econotes-${Date.now()}-${rand}`;
    setRoomName(room);
    setIsLive(true);

    const title = '🔴 Canlı Ders Başladı!';
    const content = `Canlı ders şu anda aktif! Katılmak için Canlı Ders sayfasına gidin.\nOda: ${room}`;
    const { data: created } = await supabase
      .from('announcements')
      .insert({
        title,
        content,
        user_id: user!.id,
        author_name: 'Yönetici',
      })
      .select('id, title, content, user_id, created_at')
      .single();

    markLocalAnnouncementCreated(created?.id || title);
    markLocalAnnouncementCreated(title);
    notifyAnnouncementsUpdated();
    void broadcastNewAnnouncement({
      id: created?.id,
      title,
      content,
      user_id: user?.id,
      created_at: created?.created_at || new Date().toISOString(),
    });
    void sendOneSignalNotification(title, content, 'https://econnotes.online/live-class');
    toast.success('Canlı ders başlatıldı! Duyuru ve bildirim paylaşıldı.');
  };

  const endClass = async () => {
    setIsLive(false);
    setRoomName('');
    toast.success('Canlı ders sonlandırıldı.');
  };

  const handleAcceptRules = () => {
    if (!acceptChecked) {
      toast.error('Kuralları kabul etmeniz gerekmektedir.');
      return;
    }
    setRulesAccepted(true);
    setShowRulesDialog(false);
    toast.success('Kurallar kabul edildi. Canlı derse erişebilirsiniz.');
  };

  const jitsiUrl = roomName ? `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false&userInfo.displayName=${encodeURIComponent(user?.user_metadata?.full_name || 'Kullanıcı')}` : '';

  return (
    <Layout>
      <div className="space-y-5 animate-fade-in">
        <PageHeader
          title="Canlı Ders"
          description="Etkileşimli video konferans ile canlı ders anlatımı ve katılım alanı."
          icon={Video}
          badge={
            isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Canlı Yayın Aktif
              </span>
            ) : undefined
          }
          actions={
            isAdmin ? (
              !isLive ? (
                <Button variant="cta" className="w-full sm:w-auto" onClick={startClass}>
                  <Video className="h-4 w-4" /> Ders Başlat
                </Button>
              ) : (
                <Button variant="destructive" className="w-full rounded-full sm:w-auto" onClick={endClass}>
                  <VideoOff className="h-4 w-4" /> Dersi Bitir
                </Button>
              )
            ) : undefined
          }
        />

        {isLive && roomName ? (
          !rulesAccepted ? (
            <Card className="glass-card">
              <CardContent className="p-8 sm:p-12 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-bold">Canlı Derse Katılmadan Önce</h2>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Canlı derse katılabilmek için önce kuralları okumanız ve kabul etmeniz gerekmektedir.
                </p>
                <Button variant="cta" onClick={() => setShowRulesDialog(true)}>
                  Kuralları Oku ve Kabul Et
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card overflow-hidden">
              <CardContent className="p-0">
                <iframe
                  src={jitsiUrl}
                  title="EconNotes Canlı Ders"
                  className="w-full h-[68dvh] min-h-[420px] border-0"
                  allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
                />
              </CardContent>
            </Card>
          )
        ) : (
          <Card className="glass-card">
            <CardContent className="p-8 sm:p-12 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <VideoOff className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-bold">Şu anda aktif canlı ders bulunmamaktadır</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {isAdmin
                  ? 'Yeni bir canlı ders başlatmak için yukarıdaki butonu kullanın.'
                  : 'Bir yönetici canlı ders başlattığında buradan katılabilirsiniz.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Rules Dialog */}
        <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
          <DialogContent className="max-h-[85dvh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Canlı Ders Kuralları
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[280px] rounded-2xl border border-border p-4">
              <ol className="space-y-3 list-decimal list-inside text-sm">
                {LIVE_CLASS_RULES.map((rule, i) => (
                  <li key={i} className="leading-relaxed">{rule}</li>
                ))}
              </ol>
            </ScrollArea>
            <div className="flex items-start gap-2.5 mt-1">
              <Checkbox id="accept-rules" checked={acceptChecked} onCheckedChange={(v) => setAcceptChecked(v as boolean)} />
              <label htmlFor="accept-rules" className="text-xs leading-relaxed cursor-pointer">
                Canlı ders kurallarını okudum ve kabul ediyorum. Kurallara uymadığım takdirde cezai yaptırım uygulanabileceğini biliyorum.
              </label>
            </div>
            <Button variant="cta" className="w-full" onClick={handleAcceptRules}>
              Kabul Et ve Derse Katıl
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default LiveClass;
