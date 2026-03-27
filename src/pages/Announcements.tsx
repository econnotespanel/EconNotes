import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Megaphone, Edit, Trash2, Share2, SortAsc, SortDesc, Search } from 'lucide-react';

const Announcements = () => {
  const { user, profile, isAdmin } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });

  const fetchData = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: sortOrder === 'asc' });
    setAnnouncements(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [sortOrder]);

  const handleSubmit = async () => {
    if (!form.title || !form.content) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }

    const data = {
      title: form.title, content: form.content,
      user_id: user!.id, author_name: profile?.full_name || '',
    };

    if (editingItem) {
      const { error } = await supabase.from('announcements').update(data).eq('id', editingItem.id);
      if (error) { toast.error('Güncellenemedi.'); return; }
      toast.success('Duyuru güncellendi!');
    } else {
      const { error } = await supabase.from('announcements').insert(data);
      if (error) { toast.error('Eklenemedi: ' + error.message); return; }
      toast.success('Duyuru eklendi!');
    }

    setDialogOpen(false);
    setEditingItem(null);
    setForm({ title: '', content: '' });
    setConfirmUpload(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) { toast.error('Silinemedi.'); return; }
    toast.success('Duyuru silindi!');
    fetchData();
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setForm({ title: item.title, content: item.content });
    setDialogOpen(true);
  };

  const shareAnnouncement = (a: any, platform: string) => {
    const text = `📢 ${a.title}: ${a.content}`;
    const encoded = encodeURIComponent(text);
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      twitter: `https://twitter.com/intent/tweet?text=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?quote=${encoded}`,
    };
    window.open(urls[platform], '_blank');
  };

  const filtered = announcements.filter(a =>
    a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Duyurular</h1>
            <p className="text-sm text-muted-foreground">Panel duyuruları</p>
          </div>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingItem(null); setConfirmUpload(false); } }}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Duyuru Ekle</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingItem ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}</DialogTitle>
                </DialogHeader>
                {!confirmUpload ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Başlık</Label>
                      <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="Duyuru başlığı" />
                    </div>
                    <div className="space-y-2">
                      <Label>İçerik</Label>
                      <Textarea value={form.content} onChange={(e) => setForm({...form, content: e.target.value})} placeholder="Duyuru içeriği" rows={5} />
                    </div>
                    <Button className="w-full" onClick={() => setConfirmUpload(true)}>
                      {editingItem ? 'Güncelle' : 'Duyuruyu Yayınla'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 text-center">
                    <p className="font-medium">Bu duyuruyu yayınlamak istediğinize emin misiniz?</p>
                    <div className="flex gap-3 justify-center">
                      <Button variant="outline" onClick={() => setConfirmUpload(false)}>İptal</Button>
                      <Button className="gradient-primary text-primary-foreground" onClick={handleSubmit}>Evet, Yayınla</Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Duyuru ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>
            {sortOrder === 'desc' ? <SortDesc className="h-4 w-4 mr-2" /> : <SortAsc className="h-4 w-4 mr-2" />}
            {sortOrder === 'desc' ? 'Yeniden Eskiye' : 'Eskiden Yeniye'}
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">Yükleniyor...</p>
        ) : filtered.length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Henüz duyuru yok.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((a) => (
              <Card key={a.id} className="glass-card hover:shadow-xl transition-all duration-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-warning shrink-0" />
                    {a.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                  <p className="text-xs text-muted-foreground">{a.author_name} • {new Date(a.created_at).toLocaleDateString('tr-TR')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(a)}><Edit className="h-3 w-3 mr-1" /> Düzenle</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3 mr-1" /> Sil</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Bu duyuruyu silmek istediğinize emin misiniz?</AlertDialogTitle>
                              <AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(a.id)}>Sil</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                    {['whatsapp', 'twitter', 'facebook'].map(p => (
                      <Button key={p} size="sm" variant="ghost" onClick={() => shareAnnouncement(a, p)} className="h-7 w-7 p-0">
                        <Share2 className="h-3 w-3" />
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Announcements;
