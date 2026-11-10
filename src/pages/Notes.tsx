import Layout from '@/components/Layout';
import SignedImage from '@/components/SignedImage';
import EconLogo from '@/components/EconLogo';
import { signedNoteUrl } from '@/lib/storageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, FileText, Download, Trash2, Edit, Share2, Eye, Search, SortAsc, SortDesc, FolderOpen, ChevronLeft, Lock, MessageSquare, Smile, Pencil, ShieldCheck, Building2, GraduationCap, Sparkles, X, Loader2, Upload } from 'lucide-react';
import { logActivity } from '@/lib/activityLogger';
import { downloadWithWatermark, prepareWatermarkedPreview } from '@/lib/watermark';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';
import { useTheme } from '@/contexts/ThemeContext';
import { Progress } from '@/components/ui/progress';
import { NOTE_EDITOR_SELECT, NOTE_SELECT } from '@/lib/noteColumns';
import LoadingMessage from '@/components/ui/loading-message';
import JSZip from 'jszip';
import { normalizeUniversityName, POPULAR_UNIVERSITIES } from '@/lib/universityUtils';

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.pptx';
const EMOJIS = ['👍','👎','❤️','🔥','💯','🎓','📚','✅','❌','🙏','👏','🤔','😊','🥳','💪','📝','⭐','😀','😂','😍'];
const splitDepartments = (value: string | null | undefined) =>
  (value || '').split('|').map((department) => department.trim()).filter(Boolean);

const normalizeLegacyNoteAttribution = (note: any) => {
  const fileName = String(note.file_name || '').toLocaleLowerCase('tr-TR');
  const title = String(note.title || '').toLocaleLowerCase('tr-TR');
  const isResearchMethodsNote = fileName.includes('araştırma yöntemleri')
    || (title === 'araştırma yöntemleri' && fileName.includes('29.10.2026'));

  const normalizedUni = normalizeUniversityName(note.university);

  if (!isResearchMethodsNote) {
    return {
      ...note,
      university: normalizedUni,
    };
  }

  return {
    ...note,
    university: normalizedUni,
    uploader_name: 'Aylin Kesgin',
    edited_by_name: note.edited_by_name || 'Kaan Çolakoğulları',
  };
};

const RevisionTimer = ({ deadline }: { deadline: string | null }) => {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; expired: boolean }>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  });

  useEffect(() => {
    if (!deadline) return;
    const calc = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      setTimeLeft({ hours, minutes, seconds, expired: false });
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return null;

  if (timeLeft.expired) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1 px-2 py-0.5">
        <Clock className="h-3 w-3" /> 72 saatlik düzenleme süresi doldu (Arşivlendi)
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[11px] font-mono border-amber-500/50 bg-amber-500/20 text-amber-600 dark:text-amber-400 gap-1.5 px-2.5 py-1">
      <Clock className="h-3.5 w-3.5 animate-pulse text-amber-500" />
      <span>Kalan Süre: {timeLeft.hours}s {timeLeft.minutes}d {timeLeft.seconds}sn</span>
    </Badge>
  );
};

const Notes = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
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
  const [previewSlides, setPreviewSlides] = useState<string[]>([]);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [uploadRestricted, setUploadRestricted] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [departmentInputs, setDepartmentInputs] = useState<string[]>(['']);
  const [filterUniversity, setFilterUniversity] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [downloadCounts, setDownloadCounts] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [passwordInput, setPasswordInput] = useState<Record<string, string>>({});
  const [unlockedNotes, setUnlockedNotes] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: '', description: '', grade: '1', course: '',
    semester: 'Güz Dönemi', file: null as File | null, note_password: '',
    university: '',
  });
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [acceptOwnership, setAcceptOwnership] = useState(false);
  const [showUploadRules, setShowUploadRules] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

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

  const uploadFileWithProgress = async (path: string, file: File) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('Dosya yükleme oturumu bulunamadı.');
    }

    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', `${SUPABASE_URL}/storage/v1/object/notes/${path}`);
      request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      request.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
      request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      request.setRequestHeader('x-upsert', 'false');
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(new Error('Dosya yüklenemedi.'));
      };
      request.onerror = () => reject(new Error('Dosya yükleme bağlantısı kesildi.'));
      request.onabort = () => reject(new Error('Dosya yükleme iptal edildi.'));
      request.send(file);
    });
  };

  const fetchNotes = async () => {
    let { data, error } = await supabase.from('notes').select(NOTE_EDITOR_SELECT).order('created_at', { ascending: sortOrder === 'asc' });
    if (error?.message.includes('edited_by_name')) {
      ({ data, error } = await supabase.from('notes').select(NOTE_SELECT).order('created_at', { ascending: sortOrder === 'asc' }));
    }
    if (error) toast.error('Notlar yüklenemedi: ' + error.message);
    const normalizedNotes = ((data as any[]) || []).map(normalizeLegacyNoteAttribution);
    setNotes(normalizedNotes);
    setLoading(false);

    const noteIds = normalizedNotes.map((note) => note.id).filter(Boolean);
    if (noteIds.length === 0) {
      setViewCounts({});
      setDownloadCounts({});
      setComments({});
      return;
    }

    // Only load engagement data for notes currently shown on this page.
    const [viewsRes, downloadsRes, commentsRes] = await Promise.all([
      supabase.from('note_views').select('note_id').in('note_id', noteIds),
      supabase.from('note_downloads').select('note_id').in('note_id', noteIds),
      supabase
        .from('comments')
        .select('id, entity_id, content, user_name, created_at')
        .eq('entity_type', 'note')
        .in('entity_id', noteIds)
        .order('created_at', { ascending: true }),
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
    const { data } = await supabase.from('public_system_status').select('*').limit(1).maybeSingle();
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
    if (isPreviewable(note.file_type, note.file_url, note.file_name)) {
      setPreviewLoadingId(note.id);
      try {
        const signed = await signedNoteUrl(note.file_url);
        if (!signed) { toast.error('Dosya bağlantısı oluşturulamadı.'); return; }

        const viewerName = profile?.full_name?.trim()
          || String(user.user_metadata?.full_name || '').trim()
          || user.email?.split('@')[0]
          || 'EconNotes kullanıcısı';

        // Önizleme için EconNotes filigranını dosyaya ekle
        const displayUrl = await prepareWatermarkedPreview(signed, note.file_name, note.file_type, viewerName);
        setPreviewUrl(displayUrl);
        setPreviewType(note.file_type);
        setPreviewSlides([]);
        if (isPowerPoint(note.file_type, note.file_name)) {
          try {
            const response = await fetch(signed);
            if (!response.ok) throw new Error('Sunum dosyası indirilemedi.');
            const archive = await JSZip.loadAsync(await response.arrayBuffer());
            const slidePaths = Object.keys(archive.files)
              .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
              .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
            const slides = await Promise.all(slidePaths.map(async (path) => {
              const xml = await archive.files[path].async('text');
              const document = new DOMParser().parseFromString(xml, 'application/xml');
              return Array.from(document.getElementsByTagNameNS('*', 't'))
                .map((node) => node.textContent?.trim() || '')
                .filter(Boolean)
                .join(' ');
            }));
            setPreviewSlides(slides);
          } catch {
            setPreviewSlides([]);
            toast.error('PowerPoint önizlemesi hazırlanamadı. Dosyayı indirerek açabilirsiniz.');
          }
        }
      } catch (err) {
        console.error('Önizleme açma hatası:', err);
        toast.error('Önizleme hazırlanırken bir hata oluştu.');
      } finally {
        setPreviewLoadingId(null);
      }
    } else {
      toast.info('Bu dosya türü önizlenemez. İndirme butonunu kullanabilirsiniz.');
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
    const signed = await signedNoteUrl(note.file_url);
    if (!signed) { toast.error('Dosya bağlantısı oluşturulamadı.'); return; }
    const fullName = profile?.full_name?.trim()
      || String(user.user_metadata?.full_name || '').trim()
      || user.email?.split('@')[0]
      || 'EconNotes kullanıcısı';
    await downloadWithWatermark(signed, note.file_name, note.file_type, fullName);
  };

  const openNewNoteDialog = () => {
    setEditingNote(null);
    setConfirmUpload(false);
    setAcceptOwnership(false);
    const defaultUni = profile?.university ? normalizeUniversityName(profile.university) : '';
    const defaultGrade = profile?.grade ? String(profile.grade) : '1';
    setForm({
      title: '',
      description: '',
      grade: defaultGrade,
      course: '',
      semester: 'Güz Dönemi',
      file: null,
      note_password: '',
      university: defaultUni,
    });
    if (profile?.department) {
      setDepartmentInputs([profile.department]);
    } else {
      setDepartmentInputs(['']);
    }
    const key = `econotes_upload_rules_${user?.id}`;
    if (!localStorage.getItem(key)) {
      setShowUploadRules(true);
    } else {
      setDialogOpen(true);
    }
  };

  const handleSubmit = async () => {
    const departments = departmentInputs.map((department) => department.trim()).filter(Boolean);
    const chosenUniversity = normalizeUniversityName(form.university || profile?.university || '');
    if (!form.title || departments.length === 0 || !form.course || !chosenUniversity || chosenUniversity === 'Üniversite bilgisi yok') {
      toast.error('Lütfen tüm zorunlu alanları doldurun (Üniversite, Bölüm, Ders ve Başlık zorunludur).');
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

    setUploading(true);
    setUploadProgress(form.file ? 0 : 100);
    try {
      if (form.file) {
        const ext = form.file.name.split('.').pop();
        const path = `${user!.id}/${Date.now()}.${ext}`;
        await uploadFileWithProgress(path, form.file);
        fileUrl = path;
        fileName = form.file.name;
        fileType = form.file.type;
      }

      const noteData: any = {
        title: form.title.trim(),
        description: form.description,
        grade: parseInt(form.grade),
        department: departments.join(' | '),
        course: form.course.trim(),
        semester: form.semester,
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
        note_password: form.note_password || null,
        university: chosenUniversity,
      };

      if (editingNote) {
        noteData.edited_at = new Date().toISOString();
        const editorName = profile?.full_name || user?.user_metadata?.full_name || '';
        noteData.edited_by_name = editorName;

        // Düzenleme / revizyon istenen not kullanıcı tarafından güncellenince tekrar admin onayına geçer
        if (editingNote.status === 'revision_requested' || !isAdmin) {
          noteData.status = isAdmin ? 'approved' : 'pending';
          noteData.rejection_reason = null;
        }

        let { error } = await supabase.from('notes').update(noteData).eq('id', editingNote.id);
        if (error?.message.includes('edited_by_name')) {
          delete noteData.edited_by_name;
          ({ error } = await supabase.from('notes').update(noteData).eq('id', editingNote.id));
        }
        if (error) { toast.error('Not güncellenemedi.'); return; }
        await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_updated', `"${form.title}" notu güncellendi`, 'note', editingNote.id);
        toast.success(
          editingNote.status === 'revision_requested'
            ? 'Notunuz başarıyla güncellendi ve tekrar yönetici ekibinin onayına iletildi.'
            : 'Not güncellendi!'
        );
      } else {
        Object.assign(noteData, {
          user_id: user!.id,
          uploader_name: profile?.full_name || '',
          // Admin'in yüklediği notlar otomatik onaylı; diğerleri admin onayı bekler
          status: isAdmin ? 'approved' : 'pending',
          approved_at: isAdmin ? new Date().toISOString() : null,
          approved_by: isAdmin ? user!.id : null,
        });
        const { data: insertedData, error } = await supabase.from('notes').insert(noteData).select('id').single();
        if (error) { toast.error('Not eklenemedi: ' + error.message); return; }
        await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'note_created', `"${form.title}" notu paylaşıldı`, 'note', insertedData?.id);
        const { awardPoints } = await import('@/hooks/usePoints');
        await awardPoints('note_upload', 25);
        if (isAdmin) {
          toast.success('Not başarıyla yayınlandı.');
        } else {
          toast.success('Notunuz başarıyla yüklendi ve onay aşamasına alındı. Yönetici ekibinin inceleyip onaylamasının ardından paylaşılan notlara eklenecektir.', { duration: 8000 });
        }
      }

      setDialogOpen(false);
      setEditingNote(null);
      setForm({
        title: '',
        description: '',
        grade: profile?.grade ? String(profile.grade) : '1',
        course: '',
        semester: 'Güz Dönemi',
        file: null,
        note_password: '',
        university: profile?.university ? normalizeUniversityName(profile.university) : '',
      });
      setDepartmentInputs(profile?.department ? [profile.department] : ['']);
      setConfirmUpload(false);
      setAcceptOwnership(false);
      fetchNotes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya yüklenemedi.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
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
      title: note.title,
      description: note.description || '',
      grade: String(note.grade),
      course: note.course,
      semester: note.semester,
      file: null,
      note_password: '',
      university: normalizeUniversityName(note.university || profile?.university || ''),
    });
    setDepartmentInputs(splitDepartments(note.department).length ? splitDepartments(note.department) : ['']);
    setAcceptOwnership(true);
    setDialogOpen(true);
  };

  const shareNote = (note: any, platform: string) => {
    const shareLink = `${window.location.origin}/notes`;
    const text = `📝 ${note.title} - ${note.course} (${note.semester})\n${shareLink}`;
    const encoded = encodeURIComponent(text);
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      twitter: `https://twitter.com/intent/tweet?text=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`,
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

  // Yalnızca onaylanmış notlar paylaşılan notlar kataloğunda listelenir
  const publicNotes = useMemo(() => notes.filter(n => n.status === 'approved'), [notes]);

  const myPendingNotes = useMemo(
    () => notes.filter(n => n.user_id === user?.id && n.status === 'pending'),
    [notes, user?.id]
  );

  const myRevisionNotes = useMemo(() => {
    return notes.filter((n) => {
      if (n.user_id !== user?.id || n.status !== 'revision_requested') return false;
      // 72 saat süre dolmuşsa arşive gitmiştir, kullanıcıya kapatılır
      if (n.revision_deadline && new Date(n.revision_deadline).getTime() <= Date.now()) {
        return false;
      }
      return true;
    });
  }, [notes, user?.id]);

  const universityOptions = Array.from(new Set(publicNotes.map(n => normalizeUniversityName(n.university)))).sort();
  const departmentOptions = Array.from(new Set(
    publicNotes
      .filter(n => filterUniversity === 'all' || normalizeUniversityName(n.university) === filterUniversity)
      .flatMap(n => splitDepartments(n.department))
      .filter(Boolean)
  )).sort();

  const filteredNotes = publicNotes.filter(n => {
    const term = searchTerm.toLowerCase();
    const noteUni = normalizeUniversityName(n.university);
    const matchesSearch = !term ||
      n.title.toLowerCase().includes(term) ||
      n.course.toLowerCase().includes(term) ||
      (n.department || '').toLowerCase().includes(term) ||
      noteUni.toLowerCase().includes(term) ||
      (n.uploader_name || '').toLowerCase().includes(term);
    const matchesUni = filterUniversity === 'all' || noteUni === filterUniversity;
    const matchesDept = filterDepartment === 'all' || splitDepartments(n.department).includes(filterDepartment);
    return matchesSearch && matchesUni && matchesDept;
  });

  const courseGroups = filteredNotes.reduce<Record<string, any[]>>((acc, note) => {
    const key = note.course;
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});

  const showingNotes = Boolean(selectedCourse || searchTerm || filterDepartment !== 'all');
  const allDisplayNotes = selectedCourse ? (courseGroups[selectedCourse] || []) : (showingNotes ? filteredNotes : []);
  // Windowed rendering: only mount a slice of cards, grow as the sentinel scrolls into view.
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [selectedCourse, allDisplayNotes.length]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= allDisplayNotes.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisibleCount((c) => c + PAGE_SIZE);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, allDisplayNotes.length]);
  const displayNotes = allDisplayNotes.slice(0, visibleCount);
  const universityGroups = filteredNotes.reduce<Record<string, any[]>>((acc, note) => {
    const key = normalizeUniversityName(note.university);
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});

  const getUniversityLogo = (university: string) => {
    if (university.toLocaleLowerCase('tr-TR').includes('düzce')) {
      return theme === 'dark'
        ? '/university-logos/duzce-university-white.png'
        : '/university-logos/duzce-university.png';
    }
    return null;
  };

  const isPowerPoint = (fileType: string | null, fileName: string | null) =>
    fileType?.includes('presentation') === true || /\.pptx?$/i.test(fileName || '');

  const isPreviewable = (fileType: string | null, fileUrl: string | null, fileName: string | null) => {
    if (!fileType || !fileUrl) return false;
    return fileType.startsWith('image/') || fileType === 'application/pdf' || isPowerPoint(fileType, fileName);
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
                Yeni kullanıcılar 2 indirme hakkı ile başlar. Daha fazla indirme için onaylanan en az 1 ders notu yüklemeniz gerekir; notunuz yönetici tarafından onaylandığında kota otomatik olarak güncellenir.
                {quota && (
                  <span className="block mt-3 text-foreground">
                    Onaylı yüklemeniz: <b>{quota.approved_uploads}</b> · İndirmeniz: <b>{quota.total_downloads}</b> · Hak: <b>{quota.allowed_downloads}</b>
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Kapat</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setQuotaBlockOpen(false); openNewNoteDialog(); }}>Not Yükle</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Düzenleme / Revizyon Bekleyen Notlar (72 Saat Süre) */}
        {myRevisionNotes.length > 0 && (
          <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4 sm:p-5 space-y-3 shadow-lg shadow-amber-500/5 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  <Clock className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-foreground flex items-center gap-2">
                    <span>Düzenleme / Revizyon Bekleyen Notlarınız</span>
                    <Badge variant="outline" className="border-amber-500/50 bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                      {myRevisionNotes.length} Not
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Yönetici ekibi yüklediğiniz notta eksik veya hatalı bilgi tespit etti ve düzeltmeniz için 72 saat süre tanıdı.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {myRevisionNotes.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-amber-500/30 shadow-xs"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-foreground truncate">{n.title}</h4>
                      <RevisionTimer deadline={n.revision_deadline} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {n.course} • {n.department || 'Bölüm belirtilmemiş'} • {n.university || 'Üniversite belirtilmemiş'}
                    </p>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2 text-xs text-foreground">
                      <strong className="text-amber-600 dark:text-amber-400">Yönetici Geri Bildirimi: </strong>
                      {n.rejection_reason || n.revision_notes || 'Lütfen notun eksik bilgilerini tamamlayın.'}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleEdit(n)}
                      className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-9 px-4 gap-1.5 shadow-sm shadow-amber-500/20"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>Notu Düzenle & Tekrar Gönder</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onay Aşamasındaki Notlar */}
        {myPendingNotes.length > 0 && (
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="h-4 w-4 text-warning" />
                <span>Onay Aşamasındaki Notlarınız ({myPendingNotes.length})</span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30">
                Yönetici İncelemesinde
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Yüklediğiniz bu notlar yönetici ekibinin onay aşamasındadır. Yönetici ekibi onayladığı zaman paylaşılan yüklü notlar kataloğunda listelenecektir.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
              {myPendingNotes.map((n) => (
                <div key={n.id} className="p-2.5 rounded-xl border border-border/60 bg-card/60 text-xs space-y-1">
                  <p className="font-semibold text-foreground truncate">{n.title}</p>
                  <p className="text-muted-foreground truncate">{n.course} • {n.department || 'Bölüm yok'} • {n.university || 'Üniversite yok'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notlar</h1>
            <p className="text-sm text-muted-foreground">Tüm paylaşılan ders notları</p>
          </div>
          <Button
            className="gradient-primary text-primary-foreground rounded-xl"
            onClick={openNewNoteDialog}
          >
            <Plus className="h-4 w-4 mr-2" /> Not Ekle
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditingNote(null); setConfirmUpload(false); setAcceptOwnership(false); } }}>
            <DialogContent className="flex flex-col gap-0 p-0 overflow-hidden sm:p-0">
              <DialogHeader className="px-5 pt-5 pb-3.5 border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent shrink-0">
                <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span>{editingNote ? 'Notu Düzenle' : 'Yeni Not Ekle'}</span>
                </DialogTitle>
              </DialogHeader>
              {!confirmUpload ? (
                <>
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground/90">Başlık *</Label>
                      <Input className="rounded-xl bg-background/70" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="Not başlığı" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground/90">Açıklama</Label>
                      <Textarea className="rounded-xl bg-background/70 min-h-[76px]" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Açıklama" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground/90">Sınıf *</Label>
                        <Select value={form.grade} onValueChange={(v) => setForm({...form, grade: v})}>
                          <SelectTrigger className="rounded-xl bg-background/70"><SelectValue /></SelectTrigger>
                          <SelectContent className="z-[95] rounded-xl">
                            {[1,2,3,4].map(g => <SelectItem key={g} value={String(g)}>{g}. Sınıf</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground/90">Dönem *</Label>
                        <Select value={form.semester} onValueChange={(v) => setForm({...form, semester: v})}>
                          <SelectTrigger className="rounded-xl bg-background/70"><SelectValue /></SelectTrigger>
                          <SelectContent className="z-[95] rounded-xl">
                            <SelectItem value="Güz Dönemi">Güz Dönemi</SelectItem>
                            <SelectItem value="Bahar Dönemi">Bahar Dönemi</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold text-foreground/90">Üniversite *</Label>
                        {profile?.university && form.university !== normalizeUniversityName(profile.university) && (
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, university: normalizeUniversityName(profile.university) }))}
                            className="text-[11px] text-primary hover:underline"
                          >
                            Kayıtlı üniversitemi kullan ({normalizeUniversityName(profile.university)})
                          </button>
                        )}
                      </div>
                      <Input
                        className="rounded-xl bg-background/70"
                        value={form.university}
                        onChange={(e) => setForm({...form, university: e.target.value})}
                        onBlur={() => {
                          if (form.university.trim()) {
                            setForm(prev => ({ ...prev, university: normalizeUniversityName(prev.university) }));
                          }
                        }}
                        placeholder="Örn: Düzce Üniversitesi"
                        list="notes-popular-universities-list"
                      />
                      <datalist id="notes-popular-universities-list">
                        {POPULAR_UNIVERSITIES.map((uni) => (
                          <option key={uni} value={uni} />
                        ))}
                      </datalist>
                      <p className="text-[11px] text-muted-foreground">
                        {profile?.university
                          ? 'Kayıtlı üniversiteniz otomatik tanımlanmıştır. Başka bir üniversitenin ders notunu yüklüyorsanız alanı dilediğiniz gibi değiştirebilirsiniz.'
                          : 'Notun ait olduğu üniversiteyi yazın veya listeden seçin.'}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs font-semibold text-foreground/90">Bölüm{departmentInputs.length > 1 ? 'ler' : ''} *</Label>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => setDepartmentInputs((current) => [...current, ''])}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Bölüm ekle
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {departmentInputs.map((department, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              className="rounded-xl bg-background/70"
                              value={department}
                              onChange={(e) => setDepartmentInputs((current) => current.map((value, i) => i === index ? e.target.value : value))}
                              placeholder={index === 0 ? 'Bölüm adını yazın' : 'Diğer bölüm'}
                              aria-label={`${index + 1}. bölüm`}
                            />
                            {departmentInputs.length > 1 && (
                              <Button type="button" size="icon" variant="ghost" className="rounded-full shrink-0" aria-label="Bölümü kaldır" onClick={() => setDepartmentInputs((current) => current.filter((_, i) => i !== index))}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      {departmentInputs.length > 1 && (
                        <p className="text-[11px] text-muted-foreground">Bu not, eklediğiniz tüm bölümler için listelenecek.</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground/90">Ders *</Label>
                      <Input className="rounded-xl bg-background/70" value={form.course} onChange={(e) => setForm({...form, course: e.target.value})} placeholder="Ders adını yazın" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground/90">Dosya</Label>
                      <label className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08] hover:border-primary/50 p-3.5 transition-all">
                        <input
                          type="file"
                          accept={ACCEPTED_TYPES}
                          className="sr-only"
                          onChange={(e) => setForm({...form, file: e.target.files?.[0] || null})}
                        />
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                            <Upload className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs sm:text-sm font-semibold text-foreground">
                              {form.file ? form.file.name : 'Dosya seçmek için dokunun'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {form.file
                                ? `${(form.file.size / (1024 * 1024)).toFixed(2)} MB • Değiştirmek için dokunun`
                                : 'PDF, PNG, JPG, JPEG veya PPTX'}
                            </p>
                          </div>
                        </div>
                        {form.file && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setForm({ ...form, file: null });
                            }}
                            aria-label="Seçilen dosyayı kaldır"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90"><Lock className="h-3.5 w-3.5 text-primary" /> Not Şifresi (İsteğe bağlı)</Label>
                      <Input type="password" className="rounded-xl bg-background/70" value={form.note_password} onChange={(e) => setForm({...form, note_password: e.target.value})} placeholder="Şifre belirleyin (opsiyonel)" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">Şifre belirlerseniz, diğer kullanıcılar notu görmek için şifre girmelidir. Şifreyi yalnızca admin yönetici ekibi görebilir.</p>
                    </div>
                    <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-warning/10 border border-warning/25">
                      <Checkbox id="ownership" className="mt-0.5 rounded-md" checked={acceptOwnership} onCheckedChange={(v) => setAcceptOwnership(v as boolean)} />
                      <Label htmlFor="ownership" className="text-xs leading-relaxed cursor-pointer">
                        Bu notun paylaşılmasını onaylıyorum. Başkasının notu ise izin aldığımı beyan ederim.
                      </Label>
                    </div>
                  </div>
                  <div className="px-5 py-3.5 border-t border-border/60 bg-card/95 shrink-0">
                    <Button className="w-full h-11 rounded-2xl gradient-primary text-primary-foreground font-semibold" onClick={() => setConfirmUpload(true)} disabled={!acceptOwnership}>
                      {editingNote ? 'Güncelle' : 'Notu Yükle'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-5 sm:p-6 space-y-4 text-center">
                  <p className="text-foreground font-medium">Bu notu yüklemek istediğinize emin misiniz?</p>
                  {uploading && (
                    <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-left">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span>{uploadProgress < 100 ? 'Not yükleniyor...' : 'Not hazırlanıyor...'}</span>
                        <span className="tabular-nums text-primary">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-[11px] text-muted-foreground">Pencereyi kapatmayın, yükleme tamamlanıyor.</p>
                    </div>
                  )}
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" className="rounded-xl" disabled={uploading} onClick={() => setConfirmUpload(false)}>İptal</Button>
                    <Button className="gradient-primary text-primary-foreground min-w-28 rounded-xl" disabled={uploading} onClick={handleSubmit}>
                      {uploading ? `${uploadProgress}%` : 'Evet, Yükle'}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-80" />
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Not, ders, üniversite, bölüm veya kişi ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setSelectedCourse(null); }} className="h-11 rounded-xl border-border/70 bg-background/80 pl-10" />
            </div>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>
              {sortOrder === 'desc' ? <SortDesc className="mr-2 h-4 w-4" /> : <SortAsc className="mr-2 h-4 w-4" />}
              {sortOrder === 'desc' ? 'Yeniden Eskiye' : 'Eskiden Yeniye'}
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Select value={filterUniversity} onValueChange={(v) => { setFilterUniversity(v); setFilterDepartment('all'); setSelectedCourse(null); }}>
              <SelectTrigger className="h-10 rounded-xl bg-background/80 sm:w-72"><Building2 className="mr-2 h-4 w-4 text-primary" /><SelectValue placeholder="Üniversite seç" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Üniversiteler</SelectItem>
                {universityOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDepartment} onValueChange={(v) => { setFilterDepartment(v); setSelectedCourse(null); }}>
              <SelectTrigger className="h-10 rounded-xl bg-background/80 sm:w-72"><GraduationCap className="mr-2 h-4 w-4 text-primary" /><SelectValue placeholder="Bölüm seç" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Bölümler</SelectItem>
                {departmentOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterUniversity !== 'all' || filterDepartment !== 'all' || searchTerm) && (
              <Button variant="ghost" className="h-10 rounded-xl" onClick={() => { setFilterUniversity('all'); setFilterDepartment('all'); setSearchTerm(''); setSelectedCourse(null); }}>
                Filtreleri Temizle
              </Button>
            )}
          </div>
        </section>

        {/* Course folders view */}
        {!selectedCourse && !searchTerm && filterDepartment === 'all' && (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  {filterUniversity === 'all' ? <Building2 className="h-5 w-5 text-primary" /> : <FolderOpen className="h-5 w-5 text-primary" />}
                  {filterUniversity === 'all' ? 'Üniversitelere Göre Notlar' : `${filterUniversity} · Ders Klasörleri`}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {filterUniversity === 'all' ? 'Notları üniversite seçerek keşfedin.' : 'Ders seçerek bu üniversitedeki notları görüntüleyin.'}
                </p>
              </div>
              {filterUniversity !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterUniversity('all'); setSelectedCourse(null); }}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Üniversiteler
                </Button>
              )}
            </div>
            {loading ? (
              <Card className="glass-card">
                <CardContent className="flex min-h-40 items-center justify-center p-8">
                  <LoadingMessage />
                </CardContent>
              </Card>
            ) : filterUniversity === 'all' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(universityGroups).map(([university, universityNotes]) => {
                  const universityLogo = getUniversityLogo(university);
                  return (
                  <button
                    key={university}
                    onClick={() => { setFilterUniversity(university); setSelectedCourse(null); }}
                    className="group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-accent/20 p-5 pt-7 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                  >
                    <span className="absolute left-5 top-0 h-1.5 w-20 rounded-b-full bg-gradient-to-r from-primary to-secondary opacity-80" />
                    <span className="pointer-events-none absolute inset-x-5 top-4 border-t border-dashed border-primary/20" />
                    <div className="absolute -right-5 -top-7 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-colors group-hover:bg-primary/20" />
                    <div className="relative flex w-full items-start justify-between gap-3">
                      <span className="flex h-12 w-28 items-center justify-center rounded-xl border border-primary/15 bg-background/70 px-2 shadow-sm">
                        {universityLogo ? (
                          <img
                            src={universityLogo}
                            alt={`${university} logosu`}
                            className="max-h-9 w-auto max-w-full object-contain"
                          />
                        ) : (
                          <Building2 className="h-5 w-5 text-primary" />
                        )}
                      </span>
                      <span className="rounded-full bg-background/75 px-2.5 py-1 text-xs font-medium text-muted-foreground">{universityNotes.length} not</span>
                    </div>
                    <div className="relative mt-4">
                      <span className="block truncate text-base font-semibold text-foreground">{university}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Ders klasörlerini görüntüle</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(courseGroups).map(([course, courseNotes]) => (
                  <button
                    key={course}
                    onClick={() => setSelectedCourse(course)}
                    className="group relative flex min-h-36 flex-col items-start justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-4 pt-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-lg"
                  >
                    <span className="absolute left-4 top-0 h-1.5 w-16 rounded-b-full bg-gradient-to-r from-primary to-secondary opacity-80" />
                    <span className="pointer-events-none absolute inset-x-4 top-4 border-t border-dashed border-primary/15" />
                    <div className="flex w-full items-start justify-between">
                      <span className="rounded-xl border border-primary/15 bg-primary/10 p-2.5 text-primary shadow-sm transition-transform group-hover:scale-105"><FolderOpen className="h-5 w-5" /></span>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{courseNotes.length}</span>
                    </div>
                    <div className="mt-3 w-full min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{course}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {Array.from(new Set(courseNotes.map((note) => note.semester).filter(Boolean))).join(' · ') || 'Ders notları'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!loading && Object.keys(filterUniversity === 'all' ? universityGroups : courseGroups).length === 0 && (
              <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Henüz paylaşılmış not bulunmuyor.</CardContent></Card>
            )}
          </section>
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

        {loading && showingNotes ? (
          <p className="text-center text-muted-foreground">Yükleniyor...</p>
        ) : showingNotes ? (
          displayNotes.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Bu klasörde henüz not yok.</CardContent></Card>
          ) : (
            <><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayNotes.map((note) => {
                const thumbnail = getThumbnail(note);
                const locked = isNoteLocked(note);
                const createdAt = new Date(note.created_at).getTime();
                const isNew = Number.isFinite(createdAt)
                  && createdAt <= Date.now()
                  && Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
                return (
                  <Card key={note.id} className="group relative overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-[0_8px_24px_hsl(var(--primary)/0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_18px_40px_hsl(var(--primary)/0.12)]">
                    {locked ? (
                      <CardContent className="p-6 text-center space-y-3">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 to-secondary/15 text-primary shadow-inner">
                          <Lock className="h-6 w-6" />
                        </div>
                        <p className="font-semibold">{note.title}</p>
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
                          <div className="relative h-44 w-full cursor-pointer overflow-hidden bg-muted" onClick={() => handlePreviewClick(note)}>
                            <SignedImage source={thumbnail} alt={note.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/10 to-transparent" />
                            {previewLoadingId === note.id && (
                              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm text-white">
                                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                                <span className="mt-2 text-xs font-medium">Önizleme yükleniyor...</span>
                              </div>
                            )}
                            <div className="absolute left-3 top-3">
                              <span className="rounded-full border border-white/20 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-md">
                                {note.file_type?.includes('pdf') ? 'PDF notu' : 'Görsel not'}
                              </span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <p className="truncate text-base font-semibold text-white drop-shadow-sm">{note.title}</p>
                              {note.file_name && <p className="mt-1 truncate text-xs text-white/70">{note.file_name}</p>}
                            </div>
                          </div>
                        ) : note.file_url ? (
                          <div className="relative flex h-44 w-full cursor-pointer items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/20" onClick={() => handlePreviewClick(note)}>
                            {previewLoadingId === note.id && (
                              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm text-white">
                                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                                <span className="mt-2 text-xs font-medium">Önizleme yükleniyor...</span>
                              </div>
                            )}
                            <div className="absolute -left-10 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl transition-all duration-500 group-hover:bg-primary/30" />
                            <div className="absolute -bottom-20 -right-8 h-44 w-44 rounded-full bg-secondary/20 blur-3xl transition-all duration-500 group-hover:bg-secondary/30" />
                            <div className="relative flex max-w-[85%] flex-col items-center text-center">
                              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-background/75 text-3xl shadow-lg shadow-primary/10 backdrop-blur-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 dark:border-white/10">{getFileIcon(note.file_type)}</span>
                              <p className="mt-3 max-w-full truncate text-xs font-medium text-foreground/75">{note.file_name}</p>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 border-t border-white/40 bg-background/75 px-4 py-2.5 text-center backdrop-blur-md dark:border-white/10">
                              <p className="truncate text-sm font-semibold leading-5 text-foreground">{note.title}</p>
                            </div>
                          </div>
                        ) : (
                          <CardHeader className="border-b border-border/50 bg-gradient-to-br from-primary/5 via-transparent to-secondary/10 pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                              <span className="truncate">{note.title}</span>
                            </CardTitle>
                          </CardHeader>
                        )}
                        <CardContent className="space-y-4 p-4 sm:p-5">
                          {note.description && (
                            <div className="min-w-0">
                              <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground ${expandedDescriptions[note.id] ? 'line-clamp-none' : 'line-clamp-3'}`}>
                                {note.description}
                              </p>
                              {note.description.length > 180 && (
                                <button
                                  type="button"
                                  className="mt-1 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                                  aria-expanded={Boolean(expandedDescriptions[note.id])}
                                  onClick={() => setExpandedDescriptions((current) => ({
                                    ...current,
                                    [note.id]: !current[note.id],
                                  }))}
                                >
                                  {expandedDescriptions[note.id] ? 'Daha az göster' : 'Açıklamanın tamamını gör'}
                                </button>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {isNew && <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"><Sparkles className="h-3 w-3" /> Yeni</span>}
                            <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{note.grade}. Sınıf</span>
                            <span className="rounded-full bg-gradient-to-r from-primary to-secondary px-2.5 py-1 text-xs font-medium text-white shadow-sm shadow-primary/20">{note.course}</span>
                            <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">{note.semester}</span>
                            {note.has_password && <span className="flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"><Lock className="h-3 w-3" /> Şifreli</span>}
                          </div>
                          <div className="space-y-2.5 rounded-xl border border-border/60 bg-gradient-to-br from-muted/50 to-muted/20 p-3 text-xs">
                            {note.university && (
                              <div className="flex items-start gap-1.5">
                                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/75" />
                                <span className="font-medium text-foreground/80">Üniversite</span>
                                <span className="min-w-0 truncate text-muted-foreground">{note.university}</span>
                              </div>
                            )}
                            {note.department && (
                              <div className="flex items-start gap-1.5">
                                <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
                                <span className="shrink-0 font-medium text-foreground/80">Bölüm{splitDepartments(note.department).length > 1 ? 'ler' : ''}</span>
                                <div className="flex flex-wrap gap-1">
                                  {splitDepartments(note.department).map((department) => (
                                    <span key={department} className="rounded-md border border-border/50 bg-background/70 px-1.5 py-0.5 text-muted-foreground">{department}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex items-start gap-1.5">
                              <span className="shrink-0 text-primary/75">♙</span>
                              <span className="font-medium text-foreground/80">Yükleyen</span>
                              <span className="min-w-0 truncate text-muted-foreground">{note.uploader_name} · {formatDateTime(note.created_at)}</span>
                            </div>
                            {note.edited_at && (
                              <div className="flex items-center gap-1.5 border-t border-border/50 pt-2 text-muted-foreground">
                                <Pencil className="h-3 w-3 text-primary/75" />
                                <span>Düzenleyen</span>
                                {note.edited_by_name && <span className="truncate">{note.edited_by_name}</span>}
                                <span>· {formatDateTime(note.edited_at)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1.5"><Eye className="h-3.5 w-3.5 text-primary/80" /> {viewCounts[note.id] || 0}</span>
                            <span className="flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1.5"><Download className="h-3.5 w-3.5 text-secondary" /> {downloadCounts[note.id] || 0}</span>
                            <span className="flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1.5"><MessageSquare className="h-3.5 w-3.5 text-primary/80" /> {(comments[note.id] || []).length}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                            {note.file_url && (
                              <>
                                <Button size="sm" onClick={() => handleDownloadClick(note)} className="bg-gradient-to-r from-primary to-secondary text-white shadow-sm shadow-primary/20 transition-all hover:brightness-105 hover:shadow-md">
                                  <Download className="h-3 w-3 mr-1" /> İndir
                                </Button>
                                {isPreviewable(note.file_type, note.file_url, note.file_name) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={previewLoadingId === note.id}
                                    onClick={() => handlePreviewClick(note)}
                                    className="border-border/70 bg-background/70 hover:border-primary/30 hover:bg-primary/5"
                                  >
                                    {previewLoadingId === note.id ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin text-primary" />
                                    ) : (
                                      <Eye className="h-3 w-3 mr-1" />
                                    )} Önizle
                                  </Button>
                                )}
                              </>
                            )}
                            {(note.user_id === user?.id || isAdmin) && (
                              <>
                                <Button size="icon" variant="outline" onClick={() => handleEdit(note)} aria-label="Notu düzenle" className="h-9 w-9 border-border/70 bg-background/70 hover:border-primary/30 hover:bg-primary/5"><Edit className="h-3.5 w-3.5" /></Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="icon" variant="outline" aria-label="Notu sil" className="h-9 w-9 border-border/70 bg-background/70 text-destructive hover:border-destructive/30 hover:bg-destructive/5"><Trash2 className="h-3.5 w-3.5" /></Button>
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
                                <Button size="icon" variant="ghost" aria-label="Tepki ekle" className="h-9 w-9 text-muted-foreground hover:bg-primary/5 hover:text-primary"><Smile className="h-4 w-4" /></Button>
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
          {visibleCount < allDisplayNotes.length && <div ref={sentinelRef} aria-hidden className="h-10" />}</>
          )
        ) : !loading && Object.keys(courseGroups).length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Henüz not paylaşılmamış.</CardContent></Card>
        ) : null}

        {/* Preview Modal */}
        {previewUrl && (
          <Dialog
            open={!!previewUrl}
            onOpenChange={() => {
              if (previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
              }
              setPreviewUrl(null);
              setPreviewType(null);
              setPreviewSlides([]);
            }}
          >
            <DialogContent className="flex h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border-primary/25 bg-slate-950 p-0 shadow-2xl shadow-primary/20 [&>button]:hidden sm:h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)]">
              <DialogHeader className="relative flex min-h-[72px] shrink-0 flex-row items-center justify-between border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-primary/20 px-4 py-3 pr-16 text-left sm:px-6 sm:pr-20">
                <DialogClose className="absolute right-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 p-0 text-white opacity-100 transition-colors hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60" aria-label="Önizlemeyi kapat">
                  <X className="h-5 w-5" aria-hidden="true" />
                </DialogClose>
                <div className="flex min-w-0 items-center gap-3">
                  <EconLogo allWhite className="h-8 w-28 sm:h-9 sm:w-36" />
                  <span className="h-8 w-px bg-white/15" />
                  <div>
                    <DialogTitle className="text-sm font-semibold text-white sm:text-base">Önizleme</DialogTitle>
                  </div>
                </div>
              </DialogHeader>
              <div className="relative min-h-0 flex-1 w-full overflow-hidden bg-slate-900 p-2 sm:p-3">
                {previewType?.startsWith('image/') ? (
                  <div className="flex h-full w-full items-center justify-center overflow-auto rounded-xl border border-white/10 bg-slate-950/70 p-2 shadow-inner">
                    <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                  </div>
                ) : previewType === 'application/pdf' ? (
                  <div className="h-full w-full overflow-hidden rounded-xl border border-white/10 bg-white shadow-inner">
                    <iframe src={previewUrl} title="EconNotes belge önizlemesi" className="h-full w-full border-0" />
                  </div>
                ) : isPowerPoint(previewType, null) ? (
                  <div className="h-full w-full space-y-4 overflow-auto rounded-xl border border-white/10 bg-slate-950/70 p-4 shadow-inner sm:p-6">
                    {previewSlides.length > 0 ? previewSlides.map((slide, index) => (
                      <article key={index} className="relative min-h-48 overflow-hidden rounded-xl border border-slate-200/20 bg-white p-5 text-left text-slate-900 shadow-lg sm:min-h-64 sm:p-8">
                        <div className="pointer-events-none absolute right-4 top-4 select-none opacity-40 flex items-center gap-1.5">
                          <span className="font-bold text-xs text-blue-700">EconNotes</span>
                          <span className="text-[10px] text-slate-600">• {profile?.full_name?.trim() || String(user?.user_metadata?.full_name || '').trim() || user?.email?.split('@')[0] || 'Öğrenci'}</span>
                        </div>
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Slayt {index + 1}</p>
                        <p className="whitespace-pre-wrap text-sm leading-7 sm:text-base">{slide}</p>
                      </article>
                    )) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-300">
                        PowerPoint slaytları hazırlanıyor...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-slate-950/70">
                    <p className="text-sm text-slate-300">Bu dosya türü önizlenemez. Lütfen indirin.</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* First-time upload rules dialog */}
        <Dialog open={showUploadRules} onOpenChange={setShowUploadRules}>
          <DialogContent className="flex flex-col gap-4 rounded-3xl">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span>Not Yükleme Kuralları</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Topluluk kalitesi ve güvenliği için lütfen paylaşım kurallarını inceleyin.
              </p>
            </DialogHeader>
            <div className="max-h-[50dvh] overflow-y-auto pr-1 space-y-2.5">
              {NOTE_UPLOAD_RULES.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3 text-xs sm:text-sm leading-relaxed text-foreground"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span>{rule.replace(/^\d+\.\s*/, '')}</span>
                </div>
              ))}
            </div>
            <Button
              className="w-full h-11 rounded-2xl gradient-primary text-primary-foreground font-semibold"
              onClick={() => {
                const key = `econotes_upload_rules_${user?.id}`;
                localStorage.setItem(key, 'true');
                setShowUploadRules(false);
                setDialogOpen(true);
                toast.success('Kurallar okundu. Not yüklemeye başlayabilirsiniz.');
              }}
            >
              Okudum ve Anladım
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Notes;
