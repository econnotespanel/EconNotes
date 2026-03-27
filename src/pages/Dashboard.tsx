import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Megaphone, Users, Clock } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ notes: 0, announcements: 0 });
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([]);
  const [syncTime] = useState(new Date().toLocaleString('tr-TR'));

  useEffect(() => {
    const fetchData = async () => {
      const [notesRes, announcementsRes] = await Promise.all([
        supabase.from('notes').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(5),
        supabase.from('announcements').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(5),
      ]);
      setStats({ notes: notesRes.count || 0, announcements: announcementsRes.count || 0 });
      setRecentNotes(notesRes.data || []);
      setRecentAnnouncements(announcementsRes.data || []);
    };
    fetchData();
  }, []);

  const statCards = [
    { label: 'Toplam Notlar', value: stats.notes, icon: FileText, color: 'text-primary' },
    { label: 'Paylaşılan Notlar', value: stats.notes, icon: Users, color: 'text-success' },
    { label: 'Duyurular', value: stats.announcements, icon: Megaphone, color: 'text-warning' },
  ];

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Ana Sayfa</h1>
          <p className="text-muted-foreground text-sm">Hoş Geldiniz</p>
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
                <FileText className="h-5 w-5 text-primary" /> Son Notlar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz not paylaşılmamış.</p>
              ) : (
                recentNotes.map((note) => (
                  <div key={note.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer" onClick={() => navigate('/notes')}>
                    <div>
                      <p className="text-sm font-medium">{note.title}</p>
                      <p className="text-xs text-muted-foreground">{note.uploader_name} • {note.course} • {note.semester}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Announcements */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-warning" /> Son Duyurular
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentAnnouncements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz duyuru yok.</p>
              ) : (
                recentAnnouncements.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer" onClick={() => navigate('/announcements')}>
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.author_name} • {new Date(a.created_at).toLocaleDateString('tr-TR')}</p>
                  </div>
                ))
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
