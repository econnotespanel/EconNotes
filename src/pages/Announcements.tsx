import Layout from '@/components/Layout';
import SignedImage from '@/components/SignedImage';
import { openSignedNote } from '@/lib/storageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Megaphone, Edit, Trash2, Share2, SortAsc, SortDesc, Search, Eye, MessageSquare, Smile, Pencil, Upload, FileIcon, Image as ImageIcon, X } from 'lucide-react';

const EMOJIS = ['👍','👎','❤️','🔥','💯','🎓','📚','✅','❌','🙏','👏','🤔','😊','🥳','💪','📝','⭐','😀','😂','😍'];

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
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: sortOrder === 'asc' });
    setAnnouncements(data || []);
    setLoading(false);

    if (user && data) {
      for (const a of data) {
        await supabase.from('announcement_views').upsert(
          { announcement_id: a.id, user_id: user.id },
          { onConflict: 'announcement_id,user_id' }
        );
      }
    }

    if (data) {
      const { data: views } = await supabase.from('announcement_views').select('announcement_id');
      const counts: Record<string, number> = {};
      (views || []).forEach((v: any) => { counts[v.announcement_id] = (counts[v.announcement_id] || 0) + 1; });
      setViewCounts(counts);
    }

    if (data) {
      const { data: allComments } = await supabase.from('comments').select('*').eq('entity_type', 'announcement').order('created_at', { ascending: true });
      const grouped: Record<string, any[]> = {};
      (allComments || []).forEach((c: any) => {
        if (!grouped[c.entity_id]) grouped[c.entity_id] = [];
        grouped[c.entity_id].push(c);
      });
      setComments(grouped);
    }
  };

  useEffect(() => { fetchData(); }, [sortOrder]);

  const handleSubmit = async () => {
    if (!form.title || !form.content) { toast.error('Lütfen tüm alanları doldurun.'); return; }

    let attachmentUrl = editingItem?.attachment_url || null;
    let attachmentName = editingItem?.attachment_name || null;
    let attachmentType = editingItem?.attachment_type || null;

    if (attachmentFile) {
      setUploadingFile(true);
      const ext = attachmentFile.name.split('.').pop();
      const filePath = `announcements/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('notes').upload(filePath, attachmentFile);
      if (uploadError) { toast.error('Dosya yüklenemedi.'); setUploadingFile(false); return; }
      attachmentUrl = filePath;
      attachmentName = attachmentFile.name;
      attachmentType = attachmentFile.type.startsWith('image/') ? 'image' : 'file';
      setUploadingFile(false);
    }

    const data: any = {
      title: form.title, content: form.content,
      user_id: user!.id, author_name: profile?.full_name || '',
      attachment_url: attachmentUrl, attachment_name: attachmentName, attachment_type: attachmentType,
    };

    if (editingItem) {
      data.edited_at = new Date().toISOString();
      const { error } = await supabase.from('announcements').update(data).eq('id', editingItem.id);
      if (error) { toast.error('Güncellenemedi.'); return; }
      toast.success('Duyuru güncellendi!');
    } else {
      const { error } = await supabase.from('announcements').insert(data);
      if (error) { toast.error('Eklenemedi: ' + error.message); return; }
      toast.success('Duyuru eklendi!');
    }

    setDialogOpen(false); setEditingItem(null); setForm({ title: '', content: '' }); setConfirmUpload(false); setAttachmentFile(null); fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) { toast.error('Silinemedi.'); return; }
    toast.success('Duyuru silindi!'); fetchData();
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setForm({ title: item.title, content: item.content });
    setAttachmentFile(null);
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

  const addComment = async (announcementId: string) => {
    const text = newComment[announcementId]?.trim();
    if (!text) return;
    const { error } = await supabase.from('comments').insert({
      user_id: user!.id, user_name: profile?.full_name || '',
      entity_type: 'announcement', entity_id: announcementId, content: text,
    });
    if (error) { toast.error('Yorum eklenemedi.'); return; }
    setNewComment(prev => ({ ...prev, [announcementId]: '' })); fetchData();
  };

  const addEmojiComment = async (announcementId: string, emoji: string) => {
    const { error } = await supabase.from('comments').insert({
      user_id: user!.id, user_name: profile?.full_name || '',
      entity_type: 'announcement', entity_id: announcementId, content: emoji,
    });
    if (error) { toast.error('Emoji eklenemedi.'); return; }
    fetchData();
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
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
            <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingItem(null); setConfirmUpload(false); setAttachmentFile(null); } }}>
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
                    <div className="space-y-2">
                      <Label>Dosya / Görsel Ekle (Opsiyonel)</Label>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                      {attachmentFile ? (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50 text-sm">
                          {attachmentFile.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileIcon className="h-4 w-4 text-primary" />}
                          <span className="flex-1 truncate">{attachmentFile.name}</span>
                          <Button variant="ghost" size="sm" onClick={() => setAttachmentFile(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-2" /> Dosya Seç
                        </Button>
                      )}
                      {editingItem?.attachment_url && !attachmentFile && (
                        <p className="text-xs text-muted-foreground">Mevcut ek: {editingItem.attachment_name}</p>
                      )}
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
                      <Button className="gradient-primary text-primary-foreground" onClick={handleSubmit} disabled={uploadingFile}>
                        {uploadingFile ? 'Yükleniyor...' : 'Evet, Yayınla'}
                      </Button>
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
                    {a.edited_at && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 font-normal">
                        <Pencil className="h-2.5 w-2.5" /> düzenlendi {formatDateTime(a.edited_at)}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>

                  {/* Attachment display */}
                  {a.attachment_url && (
                    <div className="mt-2">
                      {a.attachment_type === 'image' ? (
                        <SignedImage source={a.attachment_url} alt={a.attachment_name} className="max-w-full max-h-64 rounded-lg border border-border object-contain" />
                      ) : (
                        <button type="button" onClick={() => { void openSignedNote(a.attachment_url); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 text-sm hover:bg-accent transition-colors">
                          <FileIcon className="h-4 w-4 text-primary" />
                          <span>{a.attachment_name || 'Dosya'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{a.author_name} • {formatDateTime(a.created_at)}</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {viewCounts[a.id] || 0}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {(comments[a.id] || []).length}</span>
                  </div>
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="ghost"><Smile className="h-3 w-3" /></Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" side="top">
                        <div className="grid grid-cols-5 gap-1">
                          {EMOJIS.map(e => (
                            <button key={e} onClick={() => addEmojiComment(a.id, e)} className="text-lg hover:bg-accent rounded p-1 transition-colors">{e}</button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button size="sm" variant="ghost" onClick={() => shareAnnouncement(a, 'whatsapp')} className="h-7 px-2 text-[#25D366]" title="WhatsApp">
                      <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">WP</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => shareAnnouncement(a, 'twitter')} className="h-7 px-2" title="X (Twitter)">
                      <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">X</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => shareAnnouncement(a, 'facebook')} className="h-7 px-2 text-[#1877F2]" title="Facebook">
                      <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">FB</span>
                    </Button>
                  </div>

                  {/* Comments section */}
                  <div className="pt-2 border-t border-border/40">
                    {(comments[a.id] || []).filter(c => c.content.length <= 2).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(
                          (comments[a.id] || []).filter(c => c.content.length <= 2).reduce((acc: Record<string, number>, c: any) => {
                            acc[c.content] = (acc[c.content] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([emoji, count]) => (
                          <span key={emoji} className="text-xs px-1.5 py-0.5 rounded-full bg-accent">{emoji} {count as number}</span>
                        ))}
                      </div>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => setShowComments(prev => ({ ...prev, [a.id]: !prev[a.id] }))} className="text-xs">
                      <MessageSquare className="h-3 w-3 mr-1" /> {showComments[a.id] ? 'Yorumları Gizle' : `Yorumlar (${(comments[a.id] || []).filter(c => c.content.length > 2).length})`}
                    </Button>

                    {showComments[a.id] && (
                      <div className="mt-2 space-y-2">
                        {(comments[a.id] || []).filter(c => c.content.length > 2).map(c => (
                          <div key={c.id} className="flex items-start gap-2 p-2 rounded bg-accent/30 text-xs">
                            <span className="font-medium">{c.user_name}:</span>
                            <span className="flex-1">{c.content}</span>
                            <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(c.created_at)}</span>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Yorum yaz..."
                            value={newComment[a.id] || ''}
                            onChange={(e) => setNewComment(prev => ({ ...prev, [a.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') addComment(a.id); }}
                            className="text-xs h-8"
                          />
                          <Button size="sm" className="h-8" onClick={() => addComment(a.id)}>Gönder</Button>
                        </div>
                      </div>
                    )}
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
