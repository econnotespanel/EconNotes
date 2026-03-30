import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Megaphone, Users, Clock, GraduationCap, ChevronDown, ChevronUp } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ notes: 0, announcements: 0 });
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([]);
  const [syncTime] = useState(new Date().toLocaleString('tr-TR'));
  const [academicWeek, setAcademicWeek] = useState<{ week: number | null; label: string | null }>({ week: null, label: null });
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [notesRes, announcementsRes, settingsRes] = await Promise.all([
        supabase.from('notes').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
        supabase.from('announcements').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
        supabase.from('system_settings').select('*').limit(1).single(),
      ]);
      setStats({ notes: notesRes.count || 0, announcements: announcementsRes.count || 0 });
      setRecentNotes(notesRes.data || []);
      setRecentAnnouncements(announcementsRes.data || []);
      if (settingsRes.data) {
        setAcademicWeek({
          week: (settingsRes.data as any).academic_week,
          label: (settingsRes.data as any).academic_week_label,
        });
      }
    };

    const checkUnreadAnnouncements = async () => {
      if (!user) return;
      const { data: announcements } = await supabase.from('announcements').select('id');
      const { data: views } = await supabase.from('announcement_views').select('announcement_id').eq('user_id', user.id);
      const viewedIds = new Set((views || []).map((v: any) => v.announcement_id));
      const unread = (announcements || []).filter(a => !viewedIds.has(a.id)).length;
      setUnreadAnnouncements(unread);
    };

    const checkFirstLogin = () => {
      if (user) {
        const key = `econotes_welcomed_${user.id}`;
        if (!localStorage.getItem(key)) {
          setShowWelcome(true);
          localStorage.setItem(key, 'true');
        }
      }
    };

    fetchData();
    checkUnreadAnnouncements();
    checkFirstLogin();

    // Session timeout warning (1 hour)
    const sessionStart = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - sessionStart > 3600000) {
        setSessionWarning(true);
        clearInterval(interval);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const statCards = [
    { label: 'Toplam Notlar', value: stats.notes, icon: FileText, color: 'text-primary' },
    { label: 'Paylaşılan Notlar', value: stats.notes, icon: Users, color: 'text-success' },
    { label: 'Duyurular', value: stats.announcements, icon: Megaphone, color: 'text-warning' },
  ];

  const displayedNotes = showAllNotes ? recentNotes : recentNotes.slice(0, 5);
  const displayedAnnouncements = showAllAnnouncements ? recentAnnouncements : recentAnnouncements.slice(0, 5);

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome message for first-time users */}
        {showWelcome && (
          <Card className="glass-card border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <div>
                  <p className="font-semibold">EconNotes'a Hoş Geldiniz!</p>
                  <p className="text-sm text-muted-foreground">Kaydınız başarıyla tamamlandı. Ders notlarınızı paylaşmaya ve keşfetmeye başlayabilirsiniz!</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowWelcome(false)}>✕</Button>
            </CardContent>
          </Card>
        )}

        {/* Session timeout warning */}
        {sessionWarning && (
          <Card className="glass-card border-warning/30 bg-warning/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-warning" />
                <div>
                  <p className="font-semibold text-warning">Uzun Süredir Aktifsiniz</p>
                  <p className="text-sm text-muted-foreground">1 saattir panelde aktifsiniz. Gözlerinizi dinlendirmeyi unutmayın! 😊</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSessionWarning(false)}>✕</Button>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ana Sayfa</h1>
            <p className="text-muted-foreground text-sm">Hoş Geldiniz</p>
          </div>
          {/* Academic Week Widget */}
          {academicWeek.week && (
            <Card className="glass-card">
              <CardContent className="p-3 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <div className="text-right">
                  <p className="text-sm font-bold">{academicWeek.week}. Hafta</p>
                  {academicWeek.label && <p className="text-[10px] text-muted-foreground">{academicWeek.label}</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Stats */}
        <div className="flex flex-col sm:flex-row items-stretch gap-4">
          {statCards.map((stat, i) => (
            <div key={stat.label} className="flex items-stretch flex-1">
              <Card className="glass-card flex-1 hover:shadow-xl transition-shadow cursor-pointer" onClick={() => i < 2 ? navigate('/notes') : navigate('/announcements')}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-accent ${stat.color}`}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
              {i < statCards.length - 1 && (
                <Separator orientation="vertical" className="mx-2 hidden sm:block h-auto bg-border" />
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Recent Notes */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Son Yüklenen Notlar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz not paylaşılmamış.</p>
              ) : (
                <>
                  {displayedNotes.map((note, idx) => (
                    <div key={note.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer" onClick={() => navigate('/notes')}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
                        <div>
                          <p className="text-sm font-medium">{note.title}</p>
                          <p className="text-xs text-muted-foreground">{note.uploader_name} • {note.course} • {note.semester}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(note.created_at)}</span>
                    </div>
                  ))}
                  {recentNotes.length > 5 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllNotes(!showAllNotes)}>
                      {showAllNotes ? <><ChevronUp className="h-3 w-3 mr-1" /> Daha az göster</> : <><ChevronDown className="h-3 w-3 mr-1" /> Tümünü göster ({recentNotes.length})</>}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Announcements */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-warning" /> Son Duyurular
                {unreadAnnouncements > 0 && (
                  <span className="ml-2 h-5 w-5 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center">{unreadAnnouncements}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentAnnouncements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz duyuru yok.</p>
              ) : (
                <>
                  {displayedAnnouncements.map((a, idx) => (
                    <div key={a.id} className="p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer" onClick={() => navigate('/announcements')}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{a.author_name} • {formatDateTime(a.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentAnnouncements.length > 5 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllAnnouncements(!showAllAnnouncements)}>
                      {showAllAnnouncements ? <><ChevronUp className="h-3 w-3 mr-1" /> Daha az göster</> : <><ChevronDown className="h-3 w-3 mr-1" /> Tümünü göster ({recentAnnouncements.length})</>}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Son senkronizasyon: {syncTime}</span>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
