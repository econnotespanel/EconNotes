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
import { toast } from 'sonner';
import { Plus, FileText, Download, Trash2, Edit, Share2, Eye, Search, SortAsc, SortDesc } from 'lucide-react';
import { logActivity } from '@/lib/activityLogger';

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.pptx';

const Notes = () => {
  const { user, profile, isAdmin } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [uploadRestricted, setUploadRestricted] = useState(true);
  const [form, setForm] = useState({
    title: '', description: '', grade: '1', department: '', course: '',
    semester: 'Güz Dönemi', file: null as File | null,
  });
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [acceptOwnership, setAcceptOwnership] = useState(false);

  const fetchNotes = async () => {
    const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: sortOrder === 'asc' });
    setNotes(data || []);
    setLoading(false);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('system_settings').select('*').limit(1).single();
    if (data) setUploadRestricted((data as any).note_upload_restricted ?? true);
  };

  useEffect(() => { fetchNotes(); fetchSettings(); }, [sortOrder]);

  const canUploadNow = () => {
    if (isAdmin) return true;
    if (!uploadRestricted) return true;
    const hour = new Date().getHours();
    return hour >= 9 && hour < 24;
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
      toast.error('Not yükleme saatleri: 09:00-00:00. Panel güvenlik kurallarından dolayı bu kısıtlama yapılmaktadır.');
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

    const noteData = {
      title: form.title, description: form.description, grade: parseInt(form.grade),
      department: form.department, course: form.course, semester: form.semester,
      file_url: fileUrl, file_name: fileName, file_type: fileType,
      user_id: user!.id, uploader_name: profile?.full_name || '',
    };

    if (editingNote) {
      const { error } = await supabase.from('notes').update(noteData).eq('id', editingNote.id);
      if (error) { toast.error('Not güncellenemedi.'); return; }
      await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_updated', `"${form.title}" notu güncellendi`, 'note', editingNote.id);
      toast.success('Not güncellendi!');
    } else {
      const { data: insertedData, error } = await supabase.from('notes').insert(noteData).select('id').single();
      if (error) { toast.error('Not eklenemedi: ' + error.message); return; }
      await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_created', `"${form.title}" notu paylaşıldı`, 'note', insertedData?.id);
      toast.success('Not başarıyla eklendi!');
    }

    setDialogOpen(false);
    setEditingNote(null);
    setForm({ title: '', description: '', grade: '1', department: '', course: '', semester: 'Güz Dönemi', file: null });
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

  const filteredNotes = notes.filter(n =>
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.course.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notlar</h1>
            <p className="text-sm text-muted-foreground">Tüm paylaşılan ders notları</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingNote(null); setConfirmUpload(false); setAcceptOwnership(false); } }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Not Ekle</Button>
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
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <Checkbox id="ownership" checked={acceptOwnership} onCheckedChange={(v) => setAcceptOwnership(v as boolean)} />
                    <Label htmlFor="ownership" className="text-xs leading-tight cursor-pointer">
                      Bu notun paylaşılmasını onaylıyorum. Başkasının notu ise izin aldığımı beyan ederim. Notun paylaşılması için izin alınması gerekmektedir.
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
            <Input placeholder="Not ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>
            {sortOrder === 'desc' ? <SortDesc className="h-4 w-4 mr-2" /> : <SortAsc className="h-4 w-4 mr-2" />}
            {sortOrder === 'desc' ? 'Yeniden Eskiye' : 'Eskiden Yeniye'}
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">Yükleniyor...</p>
        ) : filteredNotes.length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Henüz not paylaşılmamış.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredNotes.map((note) => {
              const thumbnail = getThumbnail(note);
              return (
                <Card key={note.id} className="glass-card hover:shadow-xl transition-all duration-300 overflow-hidden">
                  {/* Preview thumbnail */}
                  {thumbnail ? (
                    <div className="relative h-40 w-full overflow-hidden bg-muted cursor-pointer" onClick={() => { setPreviewUrl(note.file_url); setPreviewType(note.file_type); }}>
                      <img src={thumbnail} alt={note.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-sm font-semibold truncate">{note.title}</p>
                      </div>
                    </div>
                  ) : note.file_url ? (
                    <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center cursor-pointer" onClick={() => { if (isPreviewable(note.file_type, note.file_url)) { setPreviewUrl(note.file_url); setPreviewType(note.file_type); } }}>
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
                    {!thumbnail && !note.file_url && note.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{note.description}</p>
                    )}
                    {(thumbnail || note.file_url) && note.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{note.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{note.grade}. Sınıf</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{note.course}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{note.semester}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {note.uploader_name} • {note.department} • {new Date(note.created_at).toLocaleDateString('tr-TR')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {note.file_url && (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <a href={note.file_url} download={note.file_name}><Download className="h-3 w-3 mr-1" /> İndir</a>
                          </Button>
                          {isPreviewable(note.file_type, note.file_url) && (
                            <Button size="sm" variant="outline" onClick={() => { setPreviewUrl(note.file_url); setPreviewType(note.file_type); }}>
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
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => shareNote(note, 'whatsapp')} className="h-7 px-2 text-[#25D366]" title="WhatsApp">
                          <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">WP</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => shareNote(note, 'twitter')} className="h-7 px-2" title="X (Twitter)">
                          <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">X</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => shareNote(note, 'facebook')} className="h-7 px-2 text-[#1877F2]" title="Facebook">
                          <Share2 className="h-3 w-3 mr-1" /><span className="text-[10px]">FB</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Preview Modal */}
        {previewUrl && (
          <Dialog open={!!previewUrl} onOpenChange={() => { setPreviewUrl(null); setPreviewType(null); }}>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader><DialogTitle>Önizleme</DialogTitle></DialogHeader>
              <div className="w-full h-[60vh]">
                {previewType?.startsWith('image/') ? (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                ) : previewType === 'application/pdf' ? (
                  <iframe src={previewUrl} className="w-full h-full border-0" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">Bu dosya türü önizlenemez. Lütfen indirin.</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
};

export default Notes;
