import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, FileText, Download, Trash2, Edit, Share2, Eye, Search, SortAsc, SortDesc, FolderOpen, ChevronLeft, Lock, MessageSquare, Smile, Pencil, ShieldCheck } from 'lucide-react';
import { logActivity } from '@/lib/activityLogger';
import { downloadWithWatermark } from '@/lib/watermark';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';
import { Progress } from '@/components/ui/progress';
import { NOTE_SELECT } from '@/lib/noteColumns';

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.pptx';
const EMOJIS = ['👍','👎','❤️','🔥','💯','🎓','📚','✅','❌','🙏','👏','🤔','😊','🥳','💪','📝','⭐','😀','😂','😍'];

const Notes = () => {
  const { user, profile, isAdmin } = useAuth();
  const { quota, refresh: refreshQuota } = useDownloadQuota();
  const [quotaBlockOpen, setQuotaBlockOpen] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [uploadRestricted, setUploadRestricted] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [filterUniversity, setFilterUniversity] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [downloadCounts, setDownloadCounts] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [passwordInput, setPasswordInput] = useState<Record<string, string>>({});
  const [unlockedNotes, setUnlockedNotes] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: '', description: '', grade: '1', department: '', course: '',
    semester: 'Güz Dönemi', file: null as File | null, note_password: '',
    university: '',
  });
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [acceptOwnership, setAcceptOwnership] = useState(false);
  const [showUploadRules, setShowUploadRules] = useState(false);

  const NOTE_UPLOAD_RULES = [
    'Yüklenen notlar telif hakkına uygun olmalıdır. Başkasının notunu paylaşmadan önce izin alınmalıdır.',
    'Uygunsuz, müstehcen veya yasadışı içerik paylaşımı kesinlikle yasaktır.',
    'Not yükleme saatleri 09:00-00:00 arasında yapılabilir (yönetici ayarına tabidir).',
    'Yüklenen notların doğruluğundan ve kalitesinden yükleyen kişi sorumludur.',
    'Spam amaçlı veya alakasız dosya yüklemek yasaktır.',
    'Desteklenen formatlar: PDF, PNG, JPG, JPEG, PPTX.',
    'Kurallara uymayan kullanıcılar cezalandırılabilir.',
    'Yönetici ekibi uygunsuz notları silme hakkına sahiptir.',
  ];

  const fetchNotes = async () => {
    const { data, error } = await supabase.from('notes').select(NOTE_SELECT).order('created_at', { ascending: sortOrder === 'asc' });
    if (error) toast.error('Notlar yüklenemedi: ' + error.message);
    setNotes((data as any[]) || []);
    setLoading(false);

    // Fetch counts
    const [viewsRes, downloadsRes, commentsRes] = await Promise.all([
      supabase.from('note_views').select('note_id'),
      supabase.from('note_downloads').select('note_id'),
      supabase.from('comments').select('*').eq('entity_type', 'note').order('created_at', { ascending: true }),
    ]);

    const vc: Record<string, number> = {};
    (viewsRes.data || []).forEach((v: any) => { vc[v.note_id] = (vc[v.note_id] || 0) + 1; });
    setViewCounts(vc);

    const dc: Record<string, number> = {};
    (downloadsRes.data || []).forEach((d: any) => { dc[d.note_id] = (dc[d.note_id] || 0) + 1; });
    setDownloadCounts(dc);

    const grouped: Record<string, any[]> = {};
    (commentsRes.data || []).forEach((c: any) => {
      if (!grouped[c.entity_id]) grouped[c.entity_id] = [];
      grouped[c.entity_id].push(c);
    });
    setComments(grouped);
  };

  const [viewRestricted, setViewRestricted] = useState(false);
  const fetchSettings = async () => {
    const { data } = await supabase.from('system_settings').select('*').limit(1).maybeSingle();
    if (data) {
      setUploadRestricted((data as any).note_upload_restricted ?? true);
      setViewRestricted((data as any).note_view_restricted ?? false);
    }
  };

  const handlePreviewClick = async (note: any) => {
    if (!user) return;
    if (viewRestricted && !isAdmin) {
      const { data } = await supabase.rpc('get_download_quota', { _user_id: user.id });
      const q = (data && data[0]) as typeof quota;
      if (q && !q.can_download) {
        setQuotaBlockOpen(true);
        return;
      }
    }
    trackView(note.id);
    if (isPreviewable(note.file_type, note.file_url)) {
      setPreviewUrl(note.file_url);
      setPreviewType(note.file_type);
    }
  };

  useEffect(() => { fetchNotes(); fetchSettings(); }, [sortOrder]);

  const canUploadNow = () => {
    if (isAdmin) return true;
    if (!uploadRestricted) return true;
    const hour = new Date().getHours();
    return hour >= 9 && hour < 24;
  };

  const trackView = async (noteId: string) => {
    if (!user) return;
    await supabase.from('note_views').upsert(
      { note_id: noteId, user_id: user.id },
      { onConflict: 'note_id,user_id' }
    );
  };

  const trackDownload = async (noteId: string) => {
    if (!user) return;
    await supabase.from('note_downloads').upsert(
      { note_id: noteId, user_id: user.id },
      { onConflict: 'note_id,user_id' }
    );
    fetchNotes();
    refreshQuota();
  };

  // Quota-aware download handler. Blocks when user has not uploaded enough notes.
  const handleDownloadClick = async (note: any) => {
    if (!user) return;
    // Re-fetch quota fresh to avoid race conditions
    const { data } = await supabase.rpc('get_download_quota', { _user_id: user.id });
    const q = (data && data[0]) as typeof quota;
    if (q && !q.can_download) {
      setQuotaBlockOpen(true);
      return;
    }
    trackDownload(note.id);
    downloadWithWatermark(note.file_url, note.file_name, note.file_type);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.department || !form.course) {
      toast.error('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }
    if (!acceptOwnership) {
      toast.error('Notun paylaşılması için izin onayı gereklidir.');
      return;
    }
    if (!canUploadNow()) {
      toast.error('Panel güvenlik kuralları gereği not yükleme işlemleri yalnızca 09.00 - 00.00 saatleri arasında yapılabilmektedir. Bu kısıtlama, sistem güvenliğini sağlamak amacıyla uygulanmaktadır. Anlayışınız için teşekkür ederiz.', { duration: 8000 });
      return;
    }

    let fileUrl = editingNote?.file_url || null;
    let fileName = editingNote?.file_name || null;
    let fileType = editingNote?.file_type || null;

    if (form.file) {
      const ext = form.file.name.split('.').pop();
      const path = `${user!.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('notes').upload(path, form.file);
      if (uploadErr) { toast.error('Dosya yüklenemedi: ' + uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('notes').getPublicUrl(path);
      fileUrl = urlData.publicUrl;
      fileName = form.file.name;
      fileType = form.file.type;
    }

    const noteData: any = {
      title: form.title, description: form.description, grade: parseInt(form.grade),
      department: form.department, course: form.course, semester: form.semester,
      file_url: fileUrl, file_name: fileName, file_type: fileType,
      user_id: user!.id, uploader_name: profile?.full_name || '',
      note_password: form.note_password || null,
      university: form.university || profile?.university || '',
      // Admin'in yüklediği notlar otomatik onaylı; diğerleri admin onayı bekler
      status: isAdmin ? 'approved' : 'pending',
      approved_at: isAdmin ? new Date().toISOString() : null,
      approved_by: isAdmin ? user!.id : null,
    };

    if (editingNote) {
      noteData.edited_at = new Date().toISOString();
      const { error } = await supabase.from('notes').update(noteData).eq('id', editingNote.id);
      if (error) { toast.error('Not güncellenemedi.'); return; }
      await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_updated', `"${form.title}" notu güncellendi`, 'note', editingNote.id);
      toast.success('Not güncellendi!');
    } else {
      const { data: insertedData, error } = await supabase.from('notes').insert(noteData).select('id').single();
      if (error) { toast.error('Not eklenemedi: ' + error.message); return; }
      await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_created', `"${form.title}" notu paylaşıldı`, 'note', insertedData?.id);
      const { awardPoints } = await import('@/hooks/usePoints');
      await awardPoints('note_upload', 25);
      if (isAdmin) {
        toast.success('Not başarıyla yayınlandı.');
      } else {
        toast.success('Notunuz başarıyla yüklendi. Admin yönetici ekibinin onayının ardından, en geç 24 saat içerisinde yayınlanacaktır.', { duration: 9000 });
      }
    }

    setDialogOpen(false);
    setEditingNote(null);
    setForm({ title: '', description: '', grade: '1', department: '', course: '', semester: 'Güz Dönemi', file: null, note_password: '', university: '' });
    setConfirmUpload(false);
    setAcceptOwnership(false);
    fetchNotes();
  };

  const handleDelete = async (id: string) => {
    const note = notes.find(n => n.id === id);
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) { toast.error('Silinemedi.'); return; }
    await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_deleted', `"${note?.title}" notu silindi`, 'note', id);
    toast.success('Not silindi!');
    fetchNotes();
  };

  const handleEdit = (note: any) => {
    setEditingNote(note);
    setForm({
      title: note.title, description: note.description || '', grade: String(note.grade),
      department: note.department, course: note.course, semester: note.semester, file: null,
      note_password: '', university: note.university || '',
    });
    setAcceptOwnership(true);
    setDialogOpen(true);
  };

  const shareNote = (note: any, platform: string) => {
    const text = `📝 ${note.title} - ${note.course} (${note.semester})\n${note.file_url || ''}`;
    const encoded = encodeURIComponent(text);
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      twitter: `https://twitter.com/intent/tweet?text=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(note.file_url || '')}`,
    };
    window.open(urls[platform], '_blank');
  };

  const addComment = async (noteId: string) => {
    const text = newComment[noteId]?.trim();
    if (!text) return;
    await supabase.from('comments').insert({
      user_id: user!.id, user_name: profile?.full_name || '',
      entity_type: 'note', entity_id: noteId, content: text,
    });
    setNewComment(prev => ({ ...prev, [noteId]: '' }));
    fetchNotes();
  };

  const addEmojiComment = async (noteId: string, emoji: string) => {
    await supabase.from('comments').insert({
      user_id: user!.id, user_name: profile?.full_name || '',
      entity_type: 'note', entity_id: noteId, content: emoji,
    });
    fetchNotes();
  };

  const isNoteLocked = (note: any) => {
    if (!note.has_password) return false;
    if (isAdmin) return false;
    if (note.user_id === user?.id) return false;
    return !unlockedNotes.has(note.id);
  };

  const unlockNote = async (noteId: string, password: string) => {
    const { data, error } = await supabase.rpc('verify_note_password', { _note_id: noteId, _password: password });
    if (error) { toast.error('Şifre doğrulanamadı.'); return; }
    if (data === true) {
      setUnlockedNotes(prev => new Set(prev).add(noteId));
      toast.success('Not kilidi açıldı.');
    } else {
      toast.error('Yanlış şifre.');
    }
  };

  const universityOptions = Array.from(new Set(notes.map(n => (n.university || '').trim()).filter(Boolean))).sort();
  const departmentOptions = Array.from(new Set(
    notes
      .filter(n => filterUniversity === 'all' || (n.university || '').trim() === filterUniversity)
      .map(n => (n.department || '').trim())
      .filter(Boolean)
  )).sort();

  const filteredNotes = notes.filter(n => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term ||
      n.title.toLowerCase().includes(term) ||
      n.course.toLowerCase().includes(term) ||
      (n.department || '').toLowerCase().includes(term) ||
      (n.university || '').toLowerCase().includes(term) ||
      (n.uploader_name || '').toLowerCase().includes(term);
    const matchesUni = filterUniversity === 'all' || (n.university || '').trim() === filterUniversity;
    const matchesDept = filterDepartment === 'all' || (n.department || '').trim() === filterDepartment;
    return matchesSearch && matchesUni && matchesDept;
  });

  const courseGroups = filteredNotes.reduce((acc: Record<string, any[]>, note) => {
    const key = note.course;
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});

  const displayNotes = selectedCourse ? (courseGroups[selectedCourse] || []) : filteredNotes;

  const isPreviewable = (fileType: string | null, fileUrl: string | null) => {
    if (!fileType || !fileUrl) return false;
    return fileType.startsWith('image/') || fileType === 'application/pdf';
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return '📄';
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📕';
    if (fileType.includes('presentation') || fileType.includes('pptx')) return '📊';
    return '📄';
  };

  const getThumbnail = (note: any) => {
    if (!note.file_url || !note.file_type) return null;
    if (note.file_type.startsWith('image/')) return note.file_url;
    return null;
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {quota && !quota.is_admin && (
          <Card className={`glass-card border-2 ${quota.can_download ? 'border-primary/30' : 'border-destructive/50'}`}>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className={`h-4 w-4 ${quota.can_download ? 'text-primary' : 'text-destructive'}`} />
                    <h3 className="font-semibold text-sm">İndirme Kotası</h3>
                    <span className="text-xs text-muted-foreground">(her 2 indirme için 1 onaylı not yüklemelisiniz)</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span><b className="text-foreground">{quota.approved_uploads}</b> onaylı yükleme</span>
                    <span>•</span>
                    <span><b className="text-foreground">{quota.total_downloads}</b> / {quota.allowed_downloads} indirme kullanıldı</span>
                    <span>•</span>
                    <span className={quota.can_download ? 'text-success' : 'text-destructive font-medium'}>
                      {quota.can_download ? `${quota.remaining} indirme hakkı kaldı` : 'Hakkınız bitti — yeni not yükleyin'}
                    </span>
                  </div>
                  <Progress
                    value={quota.allowed_downloads === 0 ? 100 : Math.min(100, (quota.total_downloads / Math.max(quota.allowed_downloads, 1)) * 100)}
                    className="mt-2 h-1.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={quotaBlockOpen} onOpenChange={setQuotaBlockOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>İndirme hakkınız doldu</AlertDialogTitle>
              <AlertDialogDescription>
                EconNotes'ta her 2 indirme için en az 1 onaylı ders notu yüklemeniz gerekmektedir. Devam etmek için yeni bir not yükleyin; notunuz yönetici tarafından onaylandığında indirme hakkınız otomatik olarak artacaktır.
                {quota && (
                  <span className="block mt-3 text-foreground">
                    Onaylı yüklemeniz: <b>{quota.approved_uploads}</b> · İndirmeniz: <b>{quota.total_downloads}</b> · Hak: <b>{quota.allowed_downloads}</b>
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Kapat</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setQuotaBlockOpen(false); setDialogOpen(true); }}>Not Yükle</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notlar</h1>
            <p className="text-sm text-muted-foreground">Tüm paylaşılan ders notları</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingNote(null); setConfirmUpload(false); setAcceptOwnership(false); } }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground" onClick={() => {
                if (!editingNote) {
                  const key = `econotes_upload_rules_${user?.id}`;
                  if (!localStorage.getItem(key)) {
                    setShowUploadRules(true);
                  }
                }
              }}><Plus className="h-4 w-4 mr-2" /> Not Ekle</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingNote ? 'Notu Düzenle' : 'Yeni Not Ekle'}</DialogTitle>
              </DialogHeader>
              {!confirmUpload ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Başlık *</Label>
                    <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="Not başlığı" />
                  </div>
                  <div className="space-y-2">
                    <Label>Açıklama</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Açıklama" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Sınıf *</Label>
                      <Select value={form.grade} onValueChange={(v) => setForm({...form, grade: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4].map(g => <SelectItem key={g} value={String(g)}>{g}. Sınıf</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Dönem *</Label>
                      <Select value={form.semester} onValueChange={(v) => setForm({...form, semester: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Güz Dönemi">Güz Dönemi</SelectItem>
                          <SelectItem value="Bahar Dönemi">Bahar Dönemi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Üniversite *</Label>
                    <Input value={form.university} onChange={(e) => setForm({...form, university: e.target.value})} placeholder="Üniversite adını yazın" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bölüm *</Label>
                    <Input value={form.department} onChange={(e) => setForm({...form, department: e.target.value})} placeholder="Bölüm adını yazın" />
                  </div>
                  <div className="space-y-2">
                    <Label>Ders *</Label>
                    <Input value={form.course} onChange={(e) => setForm({...form, course: e.target.value})} placeholder="Ders adını yazın" />
                  </div>
                  <div className="space-y-2">
                    <Label>Dosya</Label>
                    <Input type="file" accept={ACCEPTED_TYPES} onChange={(e) => setForm({...form, file: e.target.files?.[0] || null})} />
                    <p className="text-xs text-muted-foreground">Desteklenen formatlar: PDF, PNG, JPG, JPEG, PPTX</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Lock className="h-3 w-3" /> Not Şifresi (İsteğe bağlı)</Label>
                    <Input type="password" value={form.note_password} onChange={(e) => setForm({...form, note_password: e.target.value})} placeholder="Şifre belirleyin (opsiyonel)" />
                    <p className="text-xs text-muted-foreground">Şifre belirlerseniz, diğer kullanıcılar notu görmek için şifre girmelidir. Şifreyi yalnızca admin yönetici ekibi görebilir.</p>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <Checkbox id="ownership" checked={acceptOwnership} onCheckedChange={(v) => setAcceptOwnership(v as boolean)} />
                    <Label htmlFor="ownership" className="text-xs leading-tight cursor-pointer">
                      Bu notun paylaşılmasını onaylıyorum. Başkasının notu ise izin aldığımı beyan ederim.
                    </Label>
                  </div>
                  <Button className="w-full" onClick={() => setConfirmUpload(true)} disabled={!acceptOwnership}>
                    {editingNote ? 'Güncelle' : 'Notu Yükle'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <p className="text-foreground font-medium">Bu notu yüklemek istediğinize emin misiniz?</p>
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => setConfirmUpload(false)}>İptal</Button>
                    <Button className="gradient-primary text-primary-foreground" onClick={handleSubmit}>Evet, Yükle</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Not, ders, üniversite, bölüm veya kişi ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>
            {sortOrder === 'desc' ? <SortDesc className="h-4 w-4 mr-2" /> : <SortAsc className="h-4 w-4 mr-2" />}
            {sortOrder === 'desc' ? 'Yeniden Eskiye' : 'Eskiden Yeniye'}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={filterUniversity} onValueChange={(v) => { setFilterUniversity(v); setFilterDepartment('all'); setSelectedCourse(null); }}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="🏛️ Üniversite seç" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🏛️ Tüm Üniversiteler</SelectItem>
              {universityOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDepartment} onValueChange={(v) => { setFilterDepartment(v); setSelectedCourse(null); }}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="🎓 Bölüm seç" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🎓 Tüm Bölümler</SelectItem>
              {departmentOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterUniversity !== 'all' || filterDepartment !== 'all') && (
            <Button variant="ghost" onClick={() => { setFilterUniversity('all'); setFilterDepartment('all'); }}>
              Filtreleri Temizle
            </Button>
          )}
        </div>

        {/* Course folders view */}
        {!selectedCourse && !searchTerm && filterUniversity === 'all' && filterDepartment === 'all' && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" /> Ders Klasörleri
            </h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Object.entries(courseGroups).map(([course, courseNotes]) => (
                <button
                  key={course}
                  onClick={() => setSelectedCourse(course)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-accent/50 hover:bg-accent transition-colors border border-border/40 hover:shadow-md"
                >
                  <FolderOpen className="h-10 w-10 text-primary" />
                  <span className="text-sm font-medium text-center truncate w-full">{course}</span>
                  <span className="text-xs text-muted-foreground">{(courseNotes as any[]).length} not</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedCourse && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedCourse(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Tüm Klasörler
            </Button>
            <span className="text-sm font-semibold">{selectedCourse}</span>
            <span className="text-xs text-muted-foreground">({displayNotes.length} not)</span>
          </div>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground">Yükleniyor...</p>
        ) : (selectedCourse || searchTerm || filterUniversity !== 'all' || filterDepartment !== 'all') ? (
          displayNotes.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Bu klasörde henüz not yok.</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayNotes.map((note) => {
                const thumbnail = getThumbnail(note);
                const locked = isNoteLocked(note);
                return (
                  <Card key={note.id} className="glass-card hover:shadow-xl transition-all duration-300 overflow-hidden">
                    {locked ? (
                      <CardContent className="p-6 text-center space-y-3">
                        <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
                        <p className="font-medium">{note.title}</p>
                        <p className="text-xs text-muted-foreground">Bu not şifreli. Görüntülemek için şifre girin.</p>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="Şifre"
                            value={passwordInput[note.id] || ''}
                            onChange={(e) => setPasswordInput(prev => ({ ...prev, [note.id]: e.target.value }))}
                            className="text-sm"
                          />
                          <Button size="sm" onClick={() => unlockNote(note.id, passwordInput[note.id] || '')}>Aç</Button>
                        </div>
                      </CardContent>
                    ) : (
                      <>
                        {thumbnail ? (
                          <div className="relative h-40 w-full overflow-hidden bg-muted cursor-pointer" onClick={() => handlePreviewClick(note)}>
                            <img src={thumbnail} alt={note.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute bottom-2 left-2 right-2">
                              <p className="text-white text-sm font-semibold truncate">{note.title}</p>
                            </div>
                          </div>
                        ) : note.file_url ? (
                          <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center cursor-pointer" onClick={() => handlePreviewClick(note)}>
                            <div className="text-center">
                              <span className="text-4xl">{getFileIcon(note.file_type)}</span>
                              <p className="text-xs text-muted-foreground mt-2 px-4 truncate max-w-[200px]">{note.file_name}</p>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                            <div className="absolute bottom-2 left-2 right-2">
                              <p className="text-white text-sm font-semibold truncate">{note.title}</p>
                            </div>
                          </div>
                        ) : (
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary shrink-0" />
                              <span className="truncate">{note.title}</span>
                            </CardTitle>
                          </CardHeader>
                        )}
                        <CardContent className="p-4 space-y-3">
                          {note.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{note.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{note.grade}. Sınıf</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{note.course}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{note.semester}</span>
                            {note.has_password && <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> Şifreli</span>}
                          </div>
                          <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 space-y-1 text-xs">
                            {note.university && (
                              <div className="flex items-start gap-1.5">
                                <span className="font-medium text-foreground/80 shrink-0">🏛️ Üniversite:</span>
                                <span className="text-muted-foreground">{note.university}</span>
                              </div>
                            )}
                            {note.department && (
                              <div className="flex items-start gap-1.5">
                                <span className="font-medium text-foreground/80 shrink-0">🎓 Bölüm:</span>
                                <span className="text-muted-foreground">{note.department}</span>
                              </div>
                            )}
                            <div className="flex items-start gap-1.5">
                              <span className="font-medium text-foreground/80 shrink-0">👤 Yükleyen:</span>
                              <span className="text-muted-foreground">{note.uploader_name} • {formatDateTime(note.created_at)}</span>
                            </div>
                            {note.edited_at && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Pencil className="h-2.5 w-2.5" /> {formatDateTime(note.edited_at)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {viewCounts[note.id] || 0}</span>
                            <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {downloadCounts[note.id] || 0}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {(comments[note.id] || []).length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {note.file_url && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleDownloadClick(note)}>
                                  <Download className="h-3 w-3 mr-1" /> İndir
                                </Button>
                                {isPreviewable(note.file_type, note.file_url) && (
                                  <Button size="sm" variant="outline" onClick={() => handlePreviewClick(note)}>
                                    <Eye className="h-3 w-3 mr-1" /> Önizle
                                  </Button>
                                )}
                              </>
                            )}
                            {(note.user_id === user?.id || isAdmin) && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleEdit(note)}><Edit className="h-3 w-3" /></Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Bu notu silmek istediğinize emin misiniz?</AlertDialogTitle>
                                      <AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>İptal</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(note.id)}>Sil</AlertDialogAction>
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
                                    <button key={e} onClick={() => addEmojiComment(note.id, e)} className="text-lg hover:bg-accent rounded p-1 transition-colors">{e}</button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => shareNote(note, 'whatsapp')} className="h-7 px-2 text-[#25D366]" title="WhatsApp">
                                <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">WP</span>
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => shareNote(note, 'twitter')} className="h-7 px-2" title="X">
                                <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">X</span>
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => shareNote(note, 'facebook')} className="h-7 px-2 text-[#1877F2]" title="Facebook">
                                <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">FB</span>
                              </Button>
                            </div>
                          </div>

                          {/* Comments */}
                          <div className="pt-2 border-t border-border/40">
                            {(comments[note.id] || []).filter(c => c.content.length <= 2).length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {Object.entries(
                                  (comments[note.id] || []).filter(c => c.content.length <= 2).reduce((acc: Record<string, number>, c: any) => {
                                    acc[c.content] = (acc[c.content] || 0) + 1; return acc;
                                  }, {})
                                ).map(([emoji, count]) => (
                                  <span key={emoji} className="text-xs px-1.5 py-0.5 rounded-full bg-accent">{emoji} {count as number}</span>
                                ))}
                              </div>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setShowComments(prev => ({ ...prev, [note.id]: !prev[note.id] }))} className="text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" /> {showComments[note.id] ? 'Gizle' : `Yorumlar (${(comments[note.id] || []).filter(c => c.content.length > 2).length})`}
                            </Button>
                            {showComments[note.id] && (
                              <div className="mt-2 space-y-2">
                                {(comments[note.id] || []).filter(c => c.content.length > 2).map(c => (
                                  <div key={c.id} className="flex items-start gap-2 p-2 rounded bg-accent/30 text-xs">
                                    <span className="font-medium">{c.user_name}:</span>
                                    <span className="flex-1">{c.content}</span>
                                    <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(c.created_at)}</span>
                                  </div>
                                ))}
                                <div className="flex gap-2">
                                  <Input placeholder="Yorum yaz..." value={newComment[note.id] || ''} onChange={(e) => setNewComment(prev => ({ ...prev, [note.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') addComment(note.id); }} className="text-xs h-8" />
                                  <Button size="sm" className="h-8" onClick={() => addComment(note.id)}>Gönder</Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        ) : !loading && Object.keys(courseGroups).length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Henüz not paylaşılmamış.</CardContent></Card>
        ) : null}

        {/* Preview Modal */}
        {previewUrl && (
          <Dialog open={!!previewUrl} onOpenChange={() => { setPreviewUrl(null); setPreviewType(null); }}>
            <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh]">
              <DialogHeader><DialogTitle>Önizleme</DialogTitle></DialogHeader>
              <div className="w-full h-[calc(95vh-80px)] relative">
                {previewType?.startsWith('image/') ? (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                ) : previewType === 'application/pdf' ? (
                  <iframe src={previewUrl} className="w-full h-full border-0" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">Bu dosya türü önizlenemez. Lütfen indirin.</p>
                  </div>
                )}
                {/* EconNotes Watermark */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden select-none">
                  <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-16 rotate-[-30deg] scale-150 opacity-[0.08]">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i} className="text-3xl font-bold text-foreground whitespace-nowrap">EconNotes</span>
                    ))}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* First-time upload rules dialog */}
        <Dialog open={showUploadRules} onOpenChange={setShowUploadRules}>
          <DialogContent className="max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Not Yükleme Kuralları
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[300px] rounded-lg border border-border p-4">
              <ol className="space-y-3 list-decimal list-inside text-sm">
                {NOTE_UPLOAD_RULES.map((rule, i) => (
                  <li key={i} className="leading-relaxed">{rule}</li>
                ))}
              </ol>
            </ScrollArea>
            <Button className="w-full gradient-primary text-primary-foreground" onClick={() => {
              const key = `econotes_upload_rules_${user?.id}`;
              localStorage.setItem(key, 'true');
              setShowUploadRules(false);
              toast.success('Kurallar okundu. Not yüklemeye başlayabilirsiniz.');
            }}>
              Okudum ve Anladım
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Notes;
