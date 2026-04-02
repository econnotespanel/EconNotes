import Layout from '@/components/Layout';
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
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [acceptChecked, setAcceptChecked] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const checkLive = async () => {
      const { data } = await supabase.from('announcements')
        .select('*')
        .ilike('title', '%Canlı Ders%')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const match = data[0].content.match(/Oda: (.+)/);
        if (match) {
          setRoomName(match[1]);
          setIsLive(true);
        }
      }
    };
    checkLive();
    // Admin bypasses rules
    if (isAdmin) setRulesAccepted(true);
  }, [user]);

  const startClass = async () => {
    const room = `econotes-${Date.now()}`;
    setRoomName(room);
    setIsLive(true);

    await supabase.from('announcements').insert({
      title: '🔴 Canlı Ders Başladı!',
      content: `Canlı ders şu anda aktif! Katılmak için Canlı Ders sayfasına gidin.\nOda: ${room}`,
      user_id: user!.id,
      author_name: 'Yönetici',
    });
    toast.success('Canlı ders başlatıldı! Duyuru paylaşıldı.');
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
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Video className="h-6 w-6 text-primary" /> Canlı Ders
            </h1>
            <p className="text-sm text-muted-foreground">Video konferans ile ders anlatımı</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {!isLive ? (
                <Button className="gradient-primary text-primary-foreground" onClick={startClass}>
                  <Video className="h-4 w-4 mr-2" /> Ders Başlat
                </Button>
              ) : (
                <Button variant="destructive" onClick={endClass}>
                  <VideoOff className="h-4 w-4 mr-2" /> Dersi Bitir
                </Button>
              )}
            </div>
          )}
        </div>

        {isLive && roomName ? (
          !rulesAccepted ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center space-y-4">
                <ShieldCheck className="h-16 w-16 text-primary mx-auto" />
                <h2 className="text-lg font-semibold">Canlı Derse Katılmadan Önce</h2>
                <p className="text-sm text-muted-foreground">
                  Canlı derse katılabilmek için önce kuralları okumanız ve kabul etmeniz gerekmektedir.
                </p>
                <Button className="gradient-primary text-primary-foreground" onClick={() => setShowRulesDialog(true)}>
                  Kuralları Oku ve Kabul Et
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card overflow-hidden">
              <CardContent className="p-0">
                <iframe
                  src={jitsiUrl}
                  className="w-full h-[70vh] border-0"
                  allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
                />
              </CardContent>
            </Card>
          )
        ) : (
          <Card className="glass-card">
            <CardContent className="p-12 text-center space-y-4">
              <VideoOff className="h-16 w-16 text-muted-foreground mx-auto opacity-30" />
              <h2 className="text-lg font-semibold">Şu anda aktif canlı ders bulunmamaktadır</h2>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? 'Yeni bir canlı ders başlatmak için yukarıdaki butonu kullanın.'
                  : 'Bir yönetici canlı ders başlattığında burada katılabilirsiniz.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Rules Dialog */}
        <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
          <DialogContent className="max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Canlı Ders Kuralları
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[300px] rounded-lg border border-border p-4">
              <ol className="space-y-3 list-decimal list-inside text-sm">
                {LIVE_CLASS_RULES.map((rule, i) => (
                  <li key={i} className="leading-relaxed">{rule}</li>
                ))}
              </ol>
            </ScrollArea>
            <div className="flex items-start gap-2 mt-2">
              <Checkbox id="accept-rules" checked={acceptChecked} onCheckedChange={(v) => setAcceptChecked(v as boolean)} />
              <label htmlFor="accept-rules" className="text-xs leading-tight cursor-pointer">
                Canlı ders kurallarını okudum ve kabul ediyorum. Kurallara uymadığım takdirde cezai yaptırım uygulanabileceğini biliyorum.
              </label>
            </div>
            <Button className="w-full gradient-primary text-primary-foreground" onClick={handleAcceptRules}>
              Kabul Et ve Derse Katıl
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default LiveClass;
