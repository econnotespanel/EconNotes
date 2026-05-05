import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Megaphone, Users, Clock, GraduationCap, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const BannerContent = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 100;
  return (
    <div>
      <p className={`text-xs text-muted-foreground ${!expanded && isLong ? 'line-clamp-2' : ''}`}>{content}</p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary hover:underline mt-1">
          {expanded ? 'Daha az göster' : 'Devamını oku'}
        </button>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ notes: 0, announcements: 0 });
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([]);
  const [syncTime] = useState(new Date().toLocaleString('tr-TR'));
  const [academicWeek, setAcademicWeek] = useState<{ week: number | null; label: string | null; semester: string | null }>({ week: null, label: null, semester: null });
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [banners, setBanners] = useState<any[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      const [notesRes, announcementsRes, settingsRes, bannersRes] = await Promise.all([
        supabase.from('notes').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
        supabase.from('announcements').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
        supabase.from('banners').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      ]);
      setStats({ notes: notesRes.count || 0, announcements: announcementsRes.count || 0 });
      setRecentNotes(notesRes.data || []);
      setRecentAnnouncements(announcementsRes.data || []);
      setBanners(bannersRes.data || []);
      if (settingsRes.data) {
        setAcademicWeek({
          week: (settingsRes.data as any).academic_week,
          label: (settingsRes.data as any).academic_week_label,
          semester: (settingsRes.data as any).academic_semester,
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
      <div className="relative z-10 space-y-6 opacity-100 visible text-foreground">
        {/* Banners */}
        {banners.filter(b => !dismissedBanners.has(b.id)).map(banner => (
          <Card key={banner.id} className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Megaphone className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{banner.title}</p>
                  <BannerContent content={banner.content} />
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDismissedBanners(prev => new Set(prev).add(banner.id))}><X className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}

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
          {academicWeek.week && (
            <Card className="glass-card">
              <CardContent className="p-3 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <div className="text-right">
                  <p className="text-sm font-bold">{academicWeek.week}. Hafta</p>
                  <div className="flex items-center gap-1">
                    {academicWeek.semester && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{academicWeek.semester}</span>}
                    {academicWeek.label && <span className="text-[10px] text-muted-foreground">{academicWeek.label}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

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

        {/* Instagram Follow Banner */}
        <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-[hsl(340,75%,55%)] via-[hsl(25,90%,55%)] to-[hsl(45,95%,55%)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">EconNotes'u takip edin!</p>
                <p className="text-xs text-muted-foreground">Güncellemeler ve duyurular için Instagram'da bizi takip edin.</p>
              </div>
            </div>
            <a
              href="https://instagram.com/econnotess"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="outline" className="gap-2 border-primary/30 hover:bg-primary/10">
                <span className="text-xs">@econnotess</span>
              </Button>
            </a>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Son senkronizasyon: {syncTime}</span>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
