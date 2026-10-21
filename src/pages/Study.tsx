import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  GraduationCap, Sparkles, Layers, ClipboardList, FileText as FileTextIcon, Video as VideoIcon,
  Loader2, ChevronLeft, ChevronRight, Check, X, Trash2, Play, Search, Plus, BookOpen,
  Upload, Mic, FileUp, Bug, Coffee, Award, Flame, Brain, Trophy, RefreshCw, RotateCw, Pause, Volume2,
  MessageCircle, Send, Wand2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { extractFile } from '@/lib/extractFile';
import { downloadLectureSummaryPdf } from '@/lib/liveLectureReport';
import { signedNoteUrl } from '@/lib/storageUrl';
import LiveLectureCapture from '@/components/study/LiveLectureCapture';

type MaterialType = 'flashcards' | 'quiz' | 'summary' | 'video';
type ExamType = 'test' | 'classic' | 'mixed';
type SourceMode = 'own' | 'platform' | 'upload';

interface Note {
  id: string;
  title: string;
  course: string;
  description: string | null;
  department: string;
  semester: string;
  user_id: string;
  status: string;
  file_name?: string | null;
  file_url?: string | null;
  file_type?: string | null;
}

interface StudyMaterial {
  id: string;
  user_id: string;
  source_type: string;
  source_note_id: string | null;
  material_type: MaterialType;
  title: string;
  course: string | null;
  content: any;
  created_at: string;
  exam_profile?: any;
}

interface StudyProgress {
  id: string;
  material_id: string;
  score: number | null;
  total_questions: number | null;
  completed_at: string | null;
}

const TYPE_META: Record<MaterialType, { label: string; icon: any; color: string; desc: string; tone: string; tint: string; code: string }> = {
  flashcards: { label: 'Bilgi Kartları', icon: Layers, color: 'from-primary to-secondary', desc: 'Hızlı tekrar için çevrilebilir kartlar', tone: 'text-primary', tint: 'bg-primary/10', code: 'KRT' },
  quiz: { label: 'Kısa Sınav', icon: ClipboardList, color: 'from-accent to-secondary', desc: 'Test veya klasik sınav denemesi', tone: 'text-accent', tint: 'bg-accent/10', code: 'SNV' },
  summary: { label: 'Konu Özeti', icon: FileTextIcon, color: 'from-success to-primary', desc: 'Özet, anahtar noktalar ve infografik', tone: 'text-success', tint: 'bg-success/10', code: 'ÖZT' },
  video: { label: 'Video Özeti', icon: VideoIcon, color: 'from-warning to-destructive', desc: 'Sahne sahne anlatım ve öneriler', tone: 'text-warning', tint: 'bg-warning/10', code: 'VİD' },
};


const MOTIVATIONS_WRONG = [
  'Hatalar öğrenmenin parçası. Açıklamayı oku, bir sonraki sefere kapacaksın.',
  'Yanlış cevap = yeni bir nöral bağlantı. Devam!',
  'Bunu bilmemen normal, şimdi öğreniyorsun. Hadi devam.',
  'Sınavda değil, çalışmadasın. Asıl başarı burada inşa ediliyor.',
  'Bir kez yanlış yaptın, bir daha yapmayacaksın. Bu sayılır.',
];
const MOTIVATIONS_RIGHT = [
  'Mükemmel! Bu konuyu kavradın.',
  'Doğru! Devam et, akış halindesin.',
  'Süper! Bir adım daha sınavı geçtin.',
  'İşte bu! 🔥',
];

// (file → base64 helper moved into src/lib/extractFile.ts)

const Study = () => {
  const { user, isAdmin } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [studyProgress, setStudyProgress] = useState<StudyProgress[]>([]);
  const [ownNotes, setOwnNotes] = useState<Note[]>([]);
  const [platformNotes, setPlatformNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<StudyMaterial | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

  // Create form
  const [sourceMode, setSourceMode] = useState<SourceMode>('own');
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCourse, setUploadCourse] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [materialType, setMaterialType] = useState<MaterialType>('flashcards');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState(10);
  const [examType, setExamType] = useState<ExamType>('test');
  const [examDate, setExamDate] = useState('');
  const [focus, setFocus] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MaterialType>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week'>('all');

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const progressTimer = useRef<number | null>(null);

  // 1 saat mola sayacı
  const studyStartRef = useRef<number>(Date.now());
  useEffect(() => {
    studyStartRef.current = Date.now();
    const t = window.setInterval(() => {
      const mins = (Date.now() - studyStartRef.current) / 60000;
      if (mins >= 60) {
        setBreakOpen(true);
        studyStartRef.current = Date.now();
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [m, own, platform, progress] = await Promise.all([
      supabase.from('study_materials').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('notes').select('id,title,course,description,department,semester,user_id,status,file_name,file_url,file_type').eq('user_id', user!.id),
      supabase.from('notes').select('id,title,course,description,department,semester,user_id,status,file_name,file_url,file_type').eq('status', 'approved').limit(200),
      supabase.from('study_progress').select('id,material_id,score,total_questions,completed_at').eq('user_id', user!.id).order('completed_at', { ascending: false }),
    ]);
    if (m.error) toast.error(`Çalışma materyalleri yüklenemedi: ${m.error.message}`);
    if (own.error) toast.error(`Notlarınız yüklenemedi: ${own.error.message}`);
    if (platform.error) toast.error(`Platform notları yüklenemedi: ${platform.error.message}`);
    if (progress.error) toast.error(`Çalışma geçmişi yüklenemedi: ${progress.error.message}`);
    setMaterials((m.data || []) as StudyMaterial[]);
    setOwnNotes((own.data || []) as Note[]);
    setPlatformNotes((platform.data || []) as Note[]);
    setStudyProgress((progress.data || []) as StudyProgress[]);
    setLoading(false);
  };

  const startProgress = (initialLabel = 'Materyal hazırlanıyor...') => {
    setProgress(2);
    setProgressLabel(initialLabel);
  };
  const rampProgressTo = (cap: number, label: string) => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    setProgressLabel(label);
    progressTimer.current = window.setInterval(() => {
      setProgress(p => (p < cap ? Math.min(cap, p + (p < 40 ? 3 : p < 70 ? 2 : 1)) : p));
    }, 350);
  };
  const setProgressNow = (pct: number, label: string) => {
    if (progressTimer.current) { window.clearInterval(progressTimer.current); progressTimer.current = null; }
    setProgress(pct);
    setProgressLabel(label);
  };
  const stopProgress = (done = true) => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = null;
    setProgress(done ? 100 : 0);
    setTimeout(() => { setProgress(0); setProgressLabel(''); }, done ? 600 : 0);
  };

  const handleGenerate = async () => {
    let payload: any = { materialType, difficulty, count, examProfile: { examType, totalQuestions: count, examDate, focus, level: difficulty } };
    let titleForMaterial = '';
    let courseForMaterial: string | null = null;
    let sourceNoteId: string | null = null;

    if (sourceMode === 'upload') {
      if (!uploadFile || !uploadTitle.trim()) { toast.error('Dosya ve başlık zorunlu.'); return; }
      const max = 25 * 1024 * 1024;
      if (uploadFile.size > max) { toast.error('Dosya 25MB sınırını aşıyor.'); return; }

      setGenerating(true);
      startProgress('Dosya okunuyor...');
      try {
        const ex = await extractFile(uploadFile, (pct, label) => setProgressNow(Math.min(pct, 65), label));
        payload.noteTitle = uploadTitle;
        payload.course = uploadCourse || '-';
        if (ex.kind === 'text') {
          payload.noteContext =
            `Yüklenen materyal: ${uploadFile.name}\nAçıklama: ${uploadDescription || '-'}\n` +
            `${ex.pages ? `Sayfa sayısı: ${ex.pages}\n` : ''}` +
            `--- METİN İÇERİĞİ ---\n${ex.text}`;
        } else if (ex.kind === 'image') {
          payload.noteContext = `Yüklenen görsel: ${uploadFile.name}\nAçıklama: ${uploadDescription || '-'}\n(Ekteki görseli birincil kaynak olarak kullan.)`;
          payload.document = { data: ex.data, mimeType: ex.mime };
        } else {
          payload.noteContext = `Yüklenen ses kaydı: ${uploadFile.name}\nAçıklama: ${uploadDescription || '-'}\n(Ekteki ses kaydını birincil kaynak olarak kullan, dökümden konuları çıkar.)`;
          payload.audio = { data: ex.data, mimeType: ex.mime };
        }
        titleForMaterial = uploadTitle;
        courseForMaterial = uploadCourse || null;
      } catch (e: any) {
        stopProgress(false);
        setGenerating(false);
        toast.error(e.message || 'Dosya okunamadı.');
        return;
      }
    } else {
      const list = sourceMode === 'own' ? ownNotes : platformNotes;
      const note = list.find(n => n.id === selectedNoteId);
      if (!note) { toast.error('Bir not seçin.'); return; }
      payload.noteTitle = note.title;
      payload.course = note.course;
      payload.noteContext = `Ders: ${note.course}\nBölüm: ${note.department}\nDönem: ${note.semester}\nBaşlık: ${note.title}\nAçıklama: ${note.description || '-'}\nDosya: ${note.file_name || '-'}`;
      titleForMaterial = note.title;
      courseForMaterial = note.course;
      sourceNoteId = note.id;
      setGenerating(true);
      startProgress('Kullanıcı notu hazırlanıyor...');
      try {
        if (note.file_url) {
          const signedUrl = await signedNoteUrl(note.file_url);
          if (!signedUrl) throw new Error('Kullanıcı notuna erişilemedi.');
          const fileResponse = await fetch(signedUrl);
          if (!fileResponse.ok) throw new Error('Kullanıcı notu indirilemedi.');
          const blob = await fileResponse.blob();
          const noteFile = new File([blob], note.file_name || 'ders-notu', {
            type: note.file_type || blob.type,
          });
          const extracted = await extractFile(noteFile, (pct, label) => setProgressNow(Math.min(pct, 65), label));
          if (extracted.kind === 'text') {
            payload.noteContext += `\n\n--- KULLANICI NOTUNUN İÇERİĞİ ---\n${extracted.text}`;
          } else if (extracted.kind === 'audio') {
            payload.audio = { data: extracted.data, mimeType: extracted.mime };
          } else {
            payload.document = { data: extracted.data, mimeType: extracted.mime };
          }
        }
      } catch (error) {
        stopProgress(false);
        setGenerating(false);
        toast.error(error instanceof Error ? error.message : 'Kullanıcı notu hazırlanamadı.');
        return;
      }
    }

    rampProgressTo(95, 'Yapay zeka materyali üretiyor...');
    try {
      const res = await supabase.functions.invoke('generate-study-material', { body: payload });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      setProgressNow(97, 'Kaydediliyor...');
      const { data: inserted, error } = await supabase.from('study_materials').insert({
        user_id: user!.id,
        source_type: sourceMode === 'platform' ? 'platform' : 'own',
        source_note_id: sourceNoteId,
        material_type: materialType,
        title: `${TYPE_META[materialType].label}: ${titleForMaterial}`,
        course: courseForMaterial,
        content: res.data.content,
        model: res.data.model,
        exam_profile: payload.examProfile,
      }).select().single();
      if (error) throw error;

      stopProgress(true);
      toast.success('Materyal hazır.');
      setCreateOpen(false);
      setActiveMaterial(inserted as StudyMaterial);
      setUploadFile(null); setUploadTitle(''); setUploadCourse(''); setUploadDescription('');
      void load();
    } catch (e: any) {
      stopProgress(false);
      toast.error(e.message || 'Üretim başarısız. Lütfen tekrar deneyin.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu materyal silinsin mi?')) return;
    await supabase.from('study_materials').delete().eq('id', id);
    toast.success('Silindi.');
    void load();
  };

  const timeMatches = (m: StudyMaterial) => {
    if (timeFilter === 'all') return true;
    const created = new Date(m.created_at).getTime();
    const now = Date.now();
    const span = timeFilter === 'today' ? 86400000 : 7 * 86400000;
    return now - created <= span;
  };

  const filtered = materials.filter(m =>
    (!search || m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.course || '').toLowerCase().includes(search.toLowerCase()))
    && (typeFilter === 'all' || m.material_type === typeFilter)
    && timeMatches(m)
  );


  const stats = {
    total: materials.length,
    flashcards: materials.filter(m => m.material_type === 'flashcards').length,
    quiz: materials.filter(m => m.material_type === 'quiz').length,
    summary: materials.filter(m => m.material_type === 'summary').length,
    video: materials.filter(m => m.material_type === 'video').length,
  };
  const quizMaterialIds = new Set(materials.filter((m) => m.material_type === 'quiz').map((m) => m.id));
  const quizAttempts = studyProgress.filter((record) =>
    quizMaterialIds.has(record.material_id) && record.score !== null && (record.total_questions || 0) > 0
  );
  const averageQuizScore = quizAttempts.length
    ? Math.round(quizAttempts.reduce((sum, attempt) => sum + (attempt.score! / attempt.total_questions!) * 100, 0) / quizAttempts.length)
    : null;
  const today = new Date();
  const weeklyStudy = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - (6 - offset));
    const attempts = quizAttempts.filter((record) => {
      if (!record.completed_at) return false;
      const completed = new Date(record.completed_at);
      return completed.getFullYear() === date.getFullYear() &&
        completed.getMonth() === date.getMonth() &&
        completed.getDate() === date.getDate();
    }).length;
    return { label: date.toLocaleDateString('tr-TR', { weekday: 'short' }), attempts };
  });
  const weeklyMax = Math.max(1, ...weeklyStudy.map((day) => day.attempts));
  const weeklyAttempts = weeklyStudy.reduce((sum, day) => sum + day.attempts, 0);

  return (
    <Layout>
      <div className="mx-auto w-full max-w-7xl space-y-5 animate-fade-in sm:space-y-6">
        {/* HUD command band */}
        <div className="hud-panel group/command relative overflow-hidden p-5 md:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(hsl(var(--neon-cyan))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--neon-cyan))_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 top-10 h-64 w-64 rounded-full border border-primary/10 opacity-70 transition-transform duration-700 group-hover/command:scale-110" />
          <div className="pointer-events-none absolute -right-16 top-18 h-48 w-48 rounded-full border border-secondary/10 opacity-70" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="hud-bar mt-1 h-14 w-1.5 shrink-0" aria-hidden="true" />
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-success shadow-[0_0_12px_hsl(var(--success))]" />
                  Aktif çalışma alanı
                </div>
                <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight md:text-4xl">
                  <span className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary shadow-[0_0_24px_hsl(var(--primary)/0.16)]">
                    <GraduationCap className="h-6 w-6 md:h-7 md:w-7" />
                  </span>
                  <span className="holo-text">Çalışma Stüdyosu</span>
                  <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] font-bold text-success">LIVE</span>
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Notlarını, PDF dosyalarını ve ses kayıtlarını yükle. Sınav türünü ve hedefini seç; sana özel bilgi kartları, kısa sınavlar, özetler ve video taslakları hazırlansın.
                </p>
              </div>
            </div>

            <div className="relative flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" onClick={() => setReportOpen(true)} className="w-full gap-2 rounded-xl border-border/80 bg-background/30 shadow-sm backdrop-blur sm:w-auto">
                <Bug className="h-4 w-4" /> Platforma Bildir
              </Button>
              <Button onClick={() => setCreateOpen(true)} className="w-full gap-2 rounded-xl border-0 bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] text-primary-foreground shadow-lg shadow-primary/20 transition-[background-position,transform] duration-500 hover:-translate-y-0.5 hover:bg-[position:100%_0] sm:w-auto">
                <Plus className="h-4 w-4" /> Yeni Materyal
              </Button>
            </div>
          </div>

          {/* Signal readouts */}
          <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Toplam', value: stats.total, icon: BookOpen, tone: 'text-primary', code: 'TOP' },
              { label: 'Kart', value: stats.flashcards, icon: Layers, tone: 'text-primary', code: 'KRT' },
              { label: 'Sınav', value: stats.quiz, icon: ClipboardList, tone: 'text-accent', code: 'SNV' },
              { label: 'Özet', value: stats.summary, icon: FileTextIcon, tone: 'text-success', code: 'ÖZT' },
              { label: 'Video', value: stats.video, icon: VideoIcon, tone: 'text-warning', code: 'VİD' },
            ].map((s, i) => {
              const pct = stats.total ? Math.round((s.value / stats.total) * 100) : 0;
              const ratio = s.label === 'Toplam' ? 100 : pct;
              return (
                <div key={i} className={`group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg ${s.label === 'Toplam' ? 'ring-1 ring-primary/15' : ''}`}>
                  <div className="hud-scanline" />
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{s.code}</span>
                    <span className={`rounded-lg border border-current/15 bg-background/40 p-1.5 ${s.tone}`}>
                      <s.icon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="mt-1 flex items-end gap-1.5">
                    <span className="font-display text-2xl font-bold leading-none">{s.value}</span>
                    <span className="text-[11px] text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full bg-current ${s.tone} transition-all duration-700`} style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <LiveLectureCapture
            userId={user!.id}
            onSaved={(material) => setMaterials((current) => [material, ...current])}
          />
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/80 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Trophy className="h-4 w-4 text-primary" />
                    Öğrenme performansın
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Son 7 gündeki kısa sınav çalışmaların</p>
                </div>
                <Badge variant="outline" className="rounded-full">{weeklyAttempts} tamamlanan sınav</Badge>
              </div>
              <div className="mt-5 grid grid-cols-[auto_1fr] items-end gap-5">
                <div>
                  <p className="text-3xl font-bold tracking-tight">{averageQuizScore === null ? '—' : `${averageQuizScore}%`}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sınav ortalaman</p>
                </div>
                <div className="flex h-16 items-end justify-between gap-2" role="img" aria-label="Son yedi gündeki kısa sınav tamamlama grafiği">
                  {weeklyStudy.map((day, index) => (
                    <div key={`${day.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{day.attempts || ''}</span>
                      <div
                        className={`w-full max-w-8 rounded-t-md transition-all ${day.attempts ? 'bg-primary/80' : 'bg-muted'}`}
                        style={{ height: `${Math.max(5, (day.attempts / weeklyMax) * 38)}px` }}
                        title={`${day.label}: ${day.attempts} kısa sınav`}
                      />
                      <span className="text-[10px] capitalize text-muted-foreground">{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {quizAttempts.length === 0 && (
                <p className="mt-4 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  İlk kısa sınavını tamamladığında ilerlemeni buradan takip edebilirsin.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-primary/15 bg-gradient-to-br from-primary/10 via-card to-secondary/10 shadow-sm">
            <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
              <div>
                <Badge variant="secondary" className="rounded-full">Bugünün çalışma hedefi</Badge>
                <h2 className="mt-3 text-lg font-semibold">Kısa tekrar, kalıcı öğrenme.</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bir kart setini gözden geçir veya sınavına uygun yeni bir kısa sınav hazırla.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => { setMaterialType('flashcards'); setCreateOpen(true); }}>
                  <Layers className="mr-2 h-4 w-4" /> Kart hazırla
                </Button>
                <Button className="rounded-xl" onClick={() => { setMaterialType('quiz'); setCreateOpen(true); }}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Kısa sınav hazırla
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Generator modules */}
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
          {(Object.keys(TYPE_META) as MaterialType[]).map(t => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            return (
              <button
                key={t}
                onClick={() => { setMaterialType(t); setCreateOpen(true); }}
                className="hud-panel group p-4 text-left sm:p-5"
              >
                <div className="hud-scanline" />
                <div className="relative">
                  <div className="flex items-center justify-between text-[10px] tracking-widest text-muted-foreground">
                    <span>{meta.code}</span>
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${meta.tone}`} />
                  </div>
                  <div className={`mt-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 ${meta.tint} ${meta.tone} transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-display font-semibold transition-colors group-hover:text-primary">{meta.label}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meta.desc}</p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Üret <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Console filters */}
        <div className="hud-panel p-4">
          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Materyal ara..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Materyal türü filtresi">
              {([['all', 'Tümü'], ...(Object.keys(TYPE_META) as MaterialType[]).map(t => [t, TYPE_META[t].label] as const)] as [string, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTypeFilter(val as 'all' | MaterialType)}
                  aria-pressed={typeFilter === val}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${typeFilter === val ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zaman filtresi">
              {([['all', 'Tüm zamanlar'], ['today', 'Bugün'], ['week', 'Son 7 gün']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTimeFilter(val)}
                  aria-pressed={timeFilter === val}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${timeFilter === val ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>


        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Henüz materyal yok. İlk çalışma setini üret.</p>
              <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Başla</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(m => {
              const meta = TYPE_META[m.material_type];
              const Icon = meta.icon;
              return (
                <div key={m.id} className="hud-panel group flex flex-col p-4">
                  <div className="hud-scanline" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 ${meta.tint} ${meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] tracking-widest text-muted-foreground">{meta.code}</span>
                      <Button variant="ghost" size="icon" className="h-9 w-9 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" onClick={() => handleDelete(m.id)} aria-label="Materyali sil">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="relative mt-3 line-clamp-2 font-display text-base font-semibold">{m.title}</h3>
                  <div className="relative mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                    {m.course && <span className="truncate">{m.course}</span>}
                    {m.exam_profile?.examType && (
                      <Badge variant="secondary" className="text-[10px]">
                        {m.exam_profile.examType === 'test' ? 'Test' : m.exam_profile.examType === 'classic' ? 'Klasik' : 'Karma'}
                      </Badge>
                    )}
                  </div>
                  <div className="relative mt-auto pt-4">
                    <Button variant="secondary" className="w-full gap-2" onClick={() => setActiveMaterial(m)}>
                      <Play className="h-3.5 w-3.5" /> Çalışmaya Başla
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!generating) setCreateOpen(o); }}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Yeni Çalışma Materyali</DialogTitle>
            <DialogDescription>Kaynağını seç, sınav profilini doldur. Yapay zeka sana özel materyali hazırlasın.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Materyal türü */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Materyal türü</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {(Object.keys(TYPE_META) as MaterialType[]).map(t => {
                  const Icon = TYPE_META[t].icon;
                  return (
                    <button key={t} type="button" onClick={() => setMaterialType(t)} className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition ${materialType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}>
                      <Icon className="h-4 w-4" />
                      {TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Kaynak */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Kaynak</Label>
              <Tabs value={sourceMode} onValueChange={(v: any) => { setSourceMode(v); setSelectedNoteId(''); }} className="mt-2">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="own">Notlarım ({ownNotes.length})</TabsTrigger>
                  <TabsTrigger value="platform">Platform ({platformNotes.length})</TabsTrigger>
                  <TabsTrigger value="upload" className="gap-1"><Upload className="h-3 w-3" /> Yükle</TabsTrigger>
                </TabsList>
                <TabsContent value="own" className="mt-2">
                  <Select value={selectedNoteId} onValueChange={setSelectedNoteId}>
                    <SelectTrigger><SelectValue placeholder="Notunu seç (yayınlanmamış olanlar dahil)..." /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {ownNotes.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">Henüz notun yok.</div>
                      ) : ownNotes.map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          <span className="font-medium">{n.title}</span>
                          <span className="text-muted-foreground ml-2 text-xs">· {n.course} · {n.status}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Onay beklenen veya reddedilmiş notların bile burada çalışılabilir.</p>
                </TabsContent>
                <TabsContent value="platform" className="mt-2">
                  <Select value={selectedNoteId} onValueChange={setSelectedNoteId}>
                    <SelectTrigger><SelectValue placeholder="Onaylı not seç..." /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {platformNotes.map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          <span className="font-medium">{n.title}</span>
                          <span className="text-muted-foreground ml-2 text-xs">· {n.course}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>
                <TabsContent value="upload" className="mt-2 space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input placeholder="Başlık (örn. Mikro 1. Vize)" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                    <Input placeholder="Ders (opsiyonel)" value={uploadCourse} onChange={e => setUploadCourse(e.target.value)} />
                  </div>
                  <Textarea placeholder="Kısa açıklama (opsiyonel)" rows={2} value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} />
                  <label className="flex items-center gap-3 px-3 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition">
                    <FileUp className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{uploadFile ? uploadFile.name : 'Dosya seç (PDF, görsel, ses, metin)'}</p>
                      <p className="text-[11px] text-muted-foreground">PDF (tarayıcıda metin çıkarılır), PNG, JPG, MP3, WAV, M4A, TXT, MD — maks 25MB</p>
                    </div>
                    {uploadFile?.type.startsWith('audio/') && <Mic className="h-4 w-4 text-fuchsia-500" />}
                    <input type="file" className="hidden" accept=".pdf,.txt,.md,image/*,audio/*,text/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                  </label>
                </TabsContent>
              </Tabs>
            </div>

            {/* Sınav profili */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Sınav profili</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Sınav türü</Label>
                  <Select value={examType} onValueChange={(v: any) => setExamType(v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test (çoktan seçmeli)</SelectItem>
                      <SelectItem value="classic">Klasik (açık uçlu)</SelectItem>
                      <SelectItem value="mixed">Karma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{materialType === 'flashcards' ? 'Kart sayısı' : 'Soru sayısı'}</Label>
                  <Input type="number" className="h-9" min={3} max={30} value={count} onChange={e => setCount(parseInt(e.target.value) || 10)} />
                </div>
                <div>
                  <Label className="text-xs">Zorluk</Label>
                  <Select value={difficulty} onValueChange={(v: any) => setDifficulty(v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Kolay</SelectItem>
                      <SelectItem value="medium">Orta</SelectItem>
                      <SelectItem value="hard">Zor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Sınav tarihi (isteğe bağlı)</Label>
                  <Input type="date" className="h-9" value={examDate} onChange={e => setExamDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Odaklanmak istediğin konu (isteğe bağlı)</Label>
                <Input className="h-9" placeholder="örn. Talep esnekliği, integral uygulamaları..." value={focus} onChange={e => setFocus(e.target.value)} />
              </div>
            </div>

            {/* Progress */}
            {generating && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-primary">{progressLabel}</span>
                  <span className="tabular-nums">%{progress}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <Button onClick={handleGenerate} disabled={generating} className="w-full gap-2" size="lg">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Hazırlanıyor...</> : <><Sparkles className="h-4 w-4" /> Yapay zekâyla hazırla</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Viewer */}
      <Dialog open={!!activeMaterial} onOpenChange={(o) => !o && setActiveMaterial(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto rounded-2xl p-3 sm:p-6">
          {activeMaterial && <MaterialViewer key={activeMaterial.id} material={activeMaterial} onReport={() => setReportOpen(true)} onProgressSaved={() => void load()} />}
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} materialId={activeMaterial?.id} user={user} />

      {/* Break dialog */}
      <Dialog open={breakOpen} onOpenChange={setBreakOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Coffee className="h-5 w-5 text-amber-500" /> Küçük bir mola vermek ister misin?</DialogTitle>
            <DialogDescription>
              Yoğun bir şekilde çalışıyorsun — iyi bir molayı hak ettin. Git elini yüzünü yıka, bir bardak su iç, kısa bir nefes al. 5 dakika sonra çok daha verimli geri döneceksin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <Trophy className="h-8 w-8 text-amber-500" />
            <div className="text-sm">
              <p className="font-semibold">1 saatlik kesintisiz çalışma 🔥</p>
              <p className="text-xs text-muted-foreground">Beyninin küçük bir resetlemeye ihtiyacı var.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBreakOpen(false)}>Devam edeyim</Button>
            <Button onClick={() => setBreakOpen(false)} className="gap-2"><Coffee className="h-4 w-4" /> 5 dakika mola</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

// ============ Report Dialog ============
const ReportDialog = ({ open, onOpenChange, materialId, user }: { open: boolean; onOpenChange: (o: boolean) => void; materialId?: string; user: any }) => {
  const [section, setSection] = useState('quiz');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!description.trim()) { toast.error('Lütfen sorunu kısaca anlat.'); return; }
    if (!user) { toast.error('Giriş gerekli.'); return; }
    setSubmitting(true);
    try {
      let screenshotUrl: string | null = null;
      if (screenshot) {
        const path = `study-reports/${user.id}/${Date.now()}-${screenshot.name}`;
        const { error: upErr } = await supabase.storage.from('notes').upload(path, screenshot, { upsert: false });
        if (!upErr) {
          screenshotUrl = path;
        }
      }
      const { error } = await supabase.from('study_reports').insert({
        user_id: user.id,
        user_email: user.email || '',
        user_name: user.user_metadata?.full_name || '',
        material_id: materialId || null,
        section,
        description: description.trim(),
        screenshot_url: screenshotUrl,
      });
      if (error) throw error;
      toast.success('Bildirimin yöneticilere ulaştı. Teşekkürler.');
      onOpenChange(false);
      setDescription(''); setScreenshot(null); setSection('quiz');
    } catch (e: any) {
      toast.error(e.message || 'Bildirim gönderilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bug className="h-4 w-4 text-destructive" /> Platforma bildir</DialogTitle>
          <DialogDescription>Çalışma stüdyosunda bir bilgi hatası, yanlış cevap veya hata fark ettiysen yöneticilere ilet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Hangi bölümde?</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quiz">Kısa sınav</SelectItem>
                <SelectItem value="flashcards">Bilgi Kartları</SelectItem>
                <SelectItem value="summary">Konu Özeti</SelectItem>
                <SelectItem value="video">Video Özeti</SelectItem>
                <SelectItem value="other">Diğer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sorunu kısaca anlat</Label>
            <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Örn: 3. soruda B şıkkı doğru gözüküyor ama açıklama D şıkkı diyor..." />
          </div>
          <div>
            <Label className="text-xs">Ekran görüntüsü (opsiyonel)</Label>
            <Input type="file" accept="image/*" onChange={e => setScreenshot(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
            Bildirimi gönder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============ Viewers ============
const MaterialViewer = ({ material, onReport, onProgressSaved }: { material: StudyMaterial; onReport: () => void; onProgressSaved: () => void }) => {
  const [coachOpen, setCoachOpen] = useState(false);
  const renderer = () => {
    switch (material.material_type) {
      case 'flashcards': return <FlashcardViewer material={material} onProgressSaved={onProgressSaved} />;
      case 'quiz': return <QuizViewer material={material} onProgressSaved={onProgressSaved} />;
      case 'summary': return <SummaryViewer material={material} />;
      case 'video': return <VideoViewer material={material} />;
    }
  };
  return (
    <div className="space-y-4">
      <DialogHeader className="min-w-0">
        <DialogTitle className="flex min-w-0 flex-col items-stretch gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 break-words leading-snug">{material.title}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
            <Button
              size="sm"
              onClick={() => setCoachOpen(true)}
              aria-label="Yapay Zekâ Akıl Hocası"
              className="min-w-0 gap-1 bg-gradient-to-r from-primary to-fuchsia-500 text-primary-foreground hover:opacity-90"
            >
              <Wand2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Yapay Zekâ Akıl Hocası</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onReport} className="gap-1 px-2">
              <Bug className="h-3.5 w-3.5 shrink-0" /> <span>Bildir</span>
            </Button>
          </div>
        </DialogTitle>
      </DialogHeader>
      {renderer()}
      <StudyCoachPanel material={material} open={coachOpen} onClose={() => setCoachOpen(false)} />
    </div>
  );
};

// ============ AI Akıl Hocası (bağlamsal sohbet) ============
const QUICK_PROMPTS = [
  'Bu konuyu daha basit anlat.',
  'Somut bir örnek ver.',
  'En çok hangi 3 noktayı çalışmalıyım?',
  'Bana 3 hızlı soru sor.',
];

const StudyCoachPanel = ({ material, open, onClose }: { material: StudyMaterial; open: boolean; onClose: () => void }) => {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Merhaba 👋 Ben senin Akıl Hocan'ım. **${material.title}** materyalini birlikte çalışalım. Aşağıdan hızlı bir başlangıç seçebilir veya istediğini sorabilirsin.`,
      }]);
    }
  }, [open, material.title]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('study-coach', {
        body: {
          materialTitle: material.title,
          materialType: material.material_type,
          course: material.course,
          materialContent: material.content,
          messages: next,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (e: any) {
      toast.error(e.message || 'Akıl Hocası şu an cevap veremedi.');
      setMessages(m => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center">
            <Wand2 className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Yapay Zekâ Akıl Hocası</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Bu materyale özel yardımcın</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0"><X className="h-4 w-4" /></Button>
      </div>

      <div className="max-h-[min(45dvh,340px)] space-y-3 overflow-y-auto p-3 sm:p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted/70 border border-border rounded-bl-sm'
            }`}>
              {m.role === 'assistant'
                ? <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted/70 border border-border rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Düşünüyor...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p}
              onClick={() => send(p)}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded-full border border-border bg-card hover:bg-primary/10 hover:border-primary/40 transition disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-t border-border bg-card/50 p-3">
        <Input
          placeholder="Bir soru sor..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={() => send(input)} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const FlashcardViewer = ({ material, onProgressSaved }: { material: StudyMaterial; onProgressSaved: () => void }) => {
  const cards: Array<{ front: string; back: string; hint?: string }> = material.content?.cards || [];
  const [queue, setQueue] = useState(() => cards.map((_, index) => index));
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mastered, setMastered] = useState<Set<number>>(new Set());
  const savedSessionRef = useRef(false);
  const cardIndex = queue[idx];

  useEffect(() => {
    if (!cards.length || mastered.size !== cards.length || savedSessionRef.current) return;
    savedSessionRef.current = true;
    void supabase.from('study_progress').insert({
      user_id: material.user_id,
      material_id: material.id,
      score: cards.length,
      total_questions: cards.length,
      attempts: 1,
      completed_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) {
        toast.error(`Kart ilerlemesi kaydedilemedi: ${error.message}`);
        return;
      }
      toast.success('Kart seti tamamlandı ve ilerlemen kaydedildi.');
      onProgressSaved();
    });
  }, [cards.length, mastered.size, material.id, material.user_id, onProgressSaved]);

  const rateCard = (rating: 'again' | 'hard' | 'known') => {
    if (rating === 'known') {
      setMastered((current) => new Set(current).add(cardIndex));
    }

    setQueue((current) => {
      const next = [...current];
      if (rating === 'again') next.splice(Math.min(idx + 3, next.length), 0, cardIndex);
      if (rating === 'hard') next.push(cardIndex);
      return next;
    });
    setIdx((current) => current + 1);
    setFlipped(false);
  };

  if (mastered.size === cards.length && cards.length > 0) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-8 text-center">
        <Trophy className="mx-auto h-10 w-10 text-primary" />
        <h3 className="mt-3 text-xl font-bold">Kart seti tamamlandı!</h3>
        <p className="mt-1 text-sm text-muted-foreground">{cards.length} kartı öğrendim olarak işaretledin.</p>
        <Button variant="outline" className="mt-5" onClick={() => { setQueue(cards.map((_, index) => index)); setIdx(0); setMastered(new Set()); setFlipped(false); savedSessionRef.current = false; }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Baştan tekrar et
        </Button>
      </div>
    );
  }

  if (cardIndex === undefined || !cards[cardIndex]) return <p className="text-muted-foreground">Kart bulunamadı.</p>;
  const card = cards[cardIndex];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{mastered.size} / {cards.length} öğrenildi · tekrar {idx + 1}</span>
        <Progress value={(mastered.size / cards.length) * 100} className="w-32 h-1.5" />
      </div>
      <button type="button" onClick={() => setFlipped(f => !f)} className="min-h-[260px] w-full cursor-pointer rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.06] p-8 text-center transition hover:border-primary/30 hover:shadow-lg">
        <div>
          <Badge variant="outline" className="mb-3">{flipped ? 'Cevap' : 'Soru'}</Badge>
          <p className="text-xl font-medium whitespace-pre-wrap">{flipped ? card.back : card.front}</p>
          {!flipped && card.hint && <p className="text-xs text-muted-foreground mt-4 italic">İpucu: {card.hint}</p>}
          <p className="mt-5 text-xs text-muted-foreground">{flipped ? 'Cevabı hatırlama durumuna göre değerlendir' : 'Düşün ve cevabı görmek için karta dokun'}</p>
        </div>
      </button>
      {flipped ? (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => rateCard('again')} className="h-auto min-h-12 flex-col gap-0.5 border-destructive/30 px-2 py-2 text-destructive hover:bg-destructive/5">
            <span className="text-sm font-semibold">Tekrar</span><span className="text-[10px] font-normal">Unuttum</span>
          </Button>
          <Button variant="outline" onClick={() => rateCard('hard')} className="h-auto min-h-12 flex-col gap-0.5 border-warning/40 px-2 py-2 text-warning hover:bg-warning/5">
            <span className="text-sm font-semibold">Zorlandım</span><span className="text-[10px] font-normal">Tekrar göster</span>
          </Button>
          <Button onClick={() => rateCard('known')} className="h-auto min-h-12 flex-col gap-0.5 px-2 py-2">
            <span className="text-sm font-semibold">Öğrendim</span><span className="text-[10px] font-normal">Kartı bitir</span>
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setFlipped(true)} className="w-full gap-2"><RotateCw className="h-4 w-4" /> Cevabı göster</Button>
      )}
    </div>
  );
};

const QuizViewer = ({ material, onProgressSaved }: { material: StudyMaterial; onProgressSaved: () => void }) => {
  const questions: Array<any> = material.content?.questions || [];
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [streak, setStreak] = useState(0);
  const [motiv, setMotiv] = useState<{ text: string; ok: boolean } | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const savedAttemptRef = useRef(false);
  const score = questions.filter((qq: any, i: number) => qq.type !== 'open_ended' && answers[i] === qq.correctIndex).length;
  const answeredMC = questions.filter((qq: any, i: number) => qq.type !== 'open_ended' && revealed[i]).length;
  const completed = questions.length > 0 && questions.every((_, questionIndex) => revealed[questionIndex]);

  useEffect(() => {
    if (!completed || savedAttemptRef.current) return;
    savedAttemptRef.current = true;
    setSavingResult(true);
    void (async () => {
      try {
        const { error } = await supabase.from('study_progress').insert({
          user_id: material.user_id,
          material_id: material.id,
          score,
          total_questions: answeredMC,
          attempts: 1,
          completed_at: new Date().toISOString(),
        });
        if (error) {
          toast.error(`Kısa sınav sonucu kaydedilemedi: ${error.message}`);
          savedAttemptRef.current = false;
          return;
        }
        toast.success('Kısa sınav sonucu çalışma geçmişine kaydedildi.');
        onProgressSaved();
      } catch (error) {
        console.error('Kısa sınav sonucu kaydedilemedi:', error);
        toast.error('Kısa sınav sonucu kaydedilemedi. Lütfen tekrar deneyin.');
        savedAttemptRef.current = false;
      } finally {
        setSavingResult(false);
      }
    })();
  }, [answeredMC, completed, material.id, material.user_id, onProgressSaved, score]);

  if (!questions[idx]) return <p className="text-muted-foreground">Soru yok.</p>;
  const q = questions[idx];
  const isOpen = q.type === 'open_ended';
  const userChoice = answers[idx];
  const isRevealed = revealed[idx];

  const choose = (optIdx: number) => {
    if (isRevealed) return;
    setAnswers({ ...answers, [idx]: optIdx });
    setRevealed({ ...revealed, [idx]: true });
    const correct = optIdx === q.correctIndex;
    if (correct) {
      setStreak(s => s + 1);
      setMotiv({ text: MOTIVATIONS_RIGHT[Math.floor(Math.random() * MOTIVATIONS_RIGHT.length)], ok: true });
    } else {
      setStreak(0);
      setMotiv({ text: MOTIVATIONS_WRONG[Math.floor(Math.random() * MOTIVATIONS_WRONG.length)], ok: false });
    }
  };
  const revealOpen = () => {
    setRevealed({ ...revealed, [idx]: true });
    setMotiv({ text: 'Cevabını model cevap ile karşılaştır. Eksik bıraktığın noktaları not al.', ok: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <Badge variant="outline">Soru {idx + 1} / {questions.length}</Badge>
          {streak > 1 && <Badge className="gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30"><Flame className="h-3 w-3" /> {streak}'li seri</Badge>}
        </div>
        <span className="shrink-0 text-muted-foreground">Doğru: <strong className="text-foreground">{score}/{answeredMC || 0}</strong></span>
      </div>
      <Progress value={((idx + 1) / questions.length) * 100} className="h-1.5" />

      <div className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-3 sm:p-5">
        <p className="break-words text-base font-medium">{q.question}</p>

        {isOpen ? (
          <div className="space-y-3">
            <Textarea rows={5} placeholder="Cevabını yaz..." value={openAnswers[idx] || ''} onChange={e => setOpenAnswers({ ...openAnswers, [idx]: e.target.value })} disabled={isRevealed} />
            {!isRevealed && <Button onClick={revealOpen} className="gap-2"><Check className="h-4 w-4" /> Model cevabı göster</Button>}
            {isRevealed && (
              <div className="space-y-2 animate-fade-in">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">ÖRNEK CEVAP</p>
                  <p className="text-sm whitespace-pre-wrap">{q.sampleAnswer || '-'}</p>
                </div>
                {q.explanation && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">DEĞERLENDİRME REHBERİ</p>
                    <p className="text-sm whitespace-pre-wrap">{q.explanation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {(q.options || []).map((opt: string, i: number) => {
              const correct = i === q.correctIndex;
              const chosen = userChoice === i;
              let cls = 'border-border hover:border-primary/50 hover:bg-accent';
              if (isRevealed) {
                if (correct) cls = 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300';
                else if (chosen) cls = 'border-red-500 bg-red-500/10 text-red-900 dark:text-red-300';
                else cls = 'border-border opacity-60';
              }
              return (
                <button key={i} onClick={() => choose(i)} disabled={isRevealed} className={`w-full text-left px-4 py-3 rounded-lg border-2 transition flex items-center gap-3 ${cls}`}>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background border text-xs font-bold shrink-0">{String.fromCharCode(65 + i)}</span>
                  <span className="min-w-0 flex-1 break-words text-sm">{opt}</span>
                  {isRevealed && correct && <Check className="h-5 w-5 text-emerald-500 shrink-0" />}
                  {isRevealed && chosen && !correct && <X className="h-5 w-5 text-red-500 shrink-0" />}
                </button>
              );
            })}
            {isRevealed && q.explanation && (
              <div className={`mt-3 p-3 rounded-lg border animate-fade-in ${userChoice === q.correctIndex ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                <p className="text-xs font-semibold mb-1">{userChoice === q.correctIndex ? '✓ DOĞRU — NEDEN?' : '✗ NEDEN YANLIŞ?'}</p>
                <p className="text-sm">{q.explanation}</p>
              </div>
            )}
          </div>
        )}

        {motiv && isRevealed && (
          <div className={`flex items-center gap-2 text-sm font-medium animate-fade-in ${motiv.ok ? 'text-emerald-600' : 'text-violet-600'}`}>
            {motiv.ok ? <Award className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {motiv.text}
          </div>
        )}
      </div>

      <div className="flex min-w-0 gap-2">
        <Button variant="outline" onClick={() => { setIdx(Math.max(0, idx - 1)); setMotiv(null); }} disabled={idx === 0} className="min-w-0 flex-1 gap-1 px-2 sm:gap-2"><ChevronLeft className="h-4 w-4 shrink-0" /> Önceki</Button>
        <Button onClick={() => { setIdx(Math.min(questions.length - 1, idx + 1)); setMotiv(null); }} disabled={idx === questions.length - 1} className="min-w-0 flex-1 gap-1 px-2 sm:gap-2">Sonraki <ChevronRight className="h-4 w-4 shrink-0" /></Button>
      </div>

      {completed && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-fuchsia-500/10 p-4 text-center">
          <Trophy className="h-8 w-8 mx-auto text-primary mb-2" />
          <p className="font-bold text-lg">Kısa sınav tamamlandı!</p>
          <p className="text-sm text-muted-foreground">{score} / {answeredMC} doğru. Yanlışlarını gözden geçir — bu seferki çalışman gerçek bir kazanım.</p>
          {savingResult && <p className="mt-2 text-xs text-muted-foreground">Sonucun kaydediliyor...</p>}
        </div>
      )}
    </div>
  );
};

const SummaryViewer = ({ material }: { material: StudyMaterial }) => {
  const c = material.content || {};
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => downloadLectureSummaryPdf({
            title: material.title,
            course: material.course,
            createdAt: new Date(material.created_at).toLocaleDateString('tr-TR'),
            overview: c.overview,
            keyPoints: c.keyPoints,
            sections: c.sections,
            transcript: c.transcript,
          })}
        >
          <FileTextIcon className="h-4 w-4" /> PDF olarak indir
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Genel bakış</p>
        <p className="text-sm leading-relaxed">{c.overview}</p>
      </div>
      {c.keyPoints?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Anahtar noktalar</p>
          <ul className="space-y-1.5">
            {c.keyPoints.map((kp: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm"><span className="text-primary font-bold">▸</span>{kp}</li>
            ))}
          </ul>
        </div>
      )}
      {c.infographic?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {c.infographic.map((it: any, i: number) => (
            <div key={i} className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</p>
              <p className="text-lg font-bold mt-1">{it.value}</p>
            </div>
          ))}
        </div>
      )}
      {c.sections?.map((s: any, i: number) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <h4 className="font-semibold mb-2">{s.heading}</h4>
          <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{s.content}</ReactMarkdown></div>
          {s.takeaway && <p className="mt-2 text-xs italic text-primary">💡 {s.takeaway}</p>}
        </div>
      ))}
      {typeof c.transcript === 'string' && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Kaydedilen ders dökümünü göster</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{c.transcript}</p>
        </details>
      )}
    </div>
  );
};

const VideoViewer = ({ material }: { material: StudyMaterial }) => {
  const c = material.content || {};
  const scenes = Array.isArray(c.scenes) ? c.scenes : [];
  const [activeScene, setActiveScene] = useState(0);
  const [isNarrating, setIsNarrating] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const scene = scenes[activeScene];

  useEffect(() => () => {
    window.speechSynthesis.cancel();
  }, []);

  const narrateScene = (index: number) => {
    const nextScene = scenes[index];
    if (!nextScene || !('speechSynthesis' in window)) {
      toast.error('Tarayıcınız sesli anlatımı desteklemiyor.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(nextScene.narration);
    utterance.lang = 'tr-TR';
    utterance.rate = 0.95;
    utterance.onend = () => setIsNarrating(false);
    utterance.onerror = () => setIsNarrating(false);
    speechRef.current = utterance;
    setActiveScene(index);
    setIsNarrating(true);
    window.speechSynthesis.speak(utterance);
  };

  const stopNarration = () => {
    window.speechSynthesis.cancel();
    setIsNarrating(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Konu akışı</p>
        <p className="text-sm leading-relaxed">{c.outline}</p>
      </div>
      {scene && (
        <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-secondary/10">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
            <div className="flex items-center gap-2">
              <Badge>{scene.time}</Badge>
              <span className="text-xs text-muted-foreground">Sahne {activeScene + 1} / {scenes.length}</span>
            </div>
            <Button
              size="sm"
              variant={isNarrating ? 'destructive' : 'default'}
              className="gap-2"
              onClick={() => isNarrating ? stopNarration() : narrateScene(activeScene)}
            >
              {isNarrating ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {isNarrating ? 'Anlatımı durdur' : 'Sahneyi dinle'}
            </Button>
          </div>
          <div className="space-y-3 p-5">
            <h3 className="text-lg font-semibold">{scene.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{scene.narration}</p>
            {scene.visualCue && (
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs">
                <span className="font-semibold text-primary">Ekran önerisi: </span>{scene.visualCue}
              </div>
            )}
          </div>
        </div>
      )}
      {scenes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {scenes.map((s: any, i: number) => (
            <button
              key={i}
              type="button"
              onClick={() => { stopNarration(); setActiveScene(i); }}
              className={`rounded-xl border p-3 text-left transition-colors ${activeScene === i ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'}`}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">{s.time}</Badge>
                <span className="text-sm font-semibold">{s.title}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {c.suggestedSearches?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">İzleme önerileri</p>
          <div className="flex flex-wrap gap-2">
            {c.suggestedSearches.map((q: string, i: number) => (
              <a key={i} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-primary/10 hover:border-primary/30 transition">
                {q}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Study;
