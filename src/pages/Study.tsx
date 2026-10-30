import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  MessageCircle, Send, Wand2, Copy, CheckCheck, FileDown, Presentation, FileSpreadsheet, ListChecks,
  Target, AlertTriangle, ArrowRight, Zap, CheckCircle2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { extractFile } from '@/lib/extractFile';
import { downloadLectureSummary } from '@/lib/liveLectureReport';
import { signedNoteUrl } from '@/lib/storageUrl';
import LiveLectureCapture from '@/components/study/LiveLectureCapture';
import InteractiveVideoStudio from '@/components/study/InteractiveVideoStudio';

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
  flashcards: { label: 'Bilgi Kartları', icon: Layers, color: 'from-primary to-secondary', desc: 'Aktif hatırlama için çift yüzlü akademik bilgi kartları', tone: 'text-primary', tint: 'bg-primary/10', code: 'KRT' },
  quiz: { label: 'Kısa Sınav', icon: ClipboardList, color: 'from-accent to-secondary', desc: 'Çözümlü test, klasik veya karma sınav simülasyonu', tone: 'text-accent', tint: 'bg-accent/10', code: 'SNV' },
  summary: { label: 'Konu Özeti', icon: FileTextIcon, color: 'from-success to-primary', desc: 'Yapılandırılmış özet, kilit kavramlar ve infografik notlar', tone: 'text-success', tint: 'bg-success/10', code: 'ÖZT' },
  video: { label: 'Video Dersi', icon: VideoIcon, color: 'from-cyan-500 to-blue-600', desc: 'Anlaşılır konu anlatımı, hocanın sorabileceği noktalar ve eşleştirme sistemi', tone: 'text-cyan-500', tint: 'bg-cyan-500/10', code: 'VİD' },
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

  // Hızlı Slayt & Ders Notu İstasyonu State
  const [quickFile, setQuickFile] = useState<File | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCourse, setQuickCourse] = useState('');
  const [quickType, setQuickType] = useState<MaterialType>('summary');
  const [quickPageCount, setQuickPageCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const progressTimer = useRef<number | null>(null);

  const uploadCenterRef = useRef<HTMLElement>(null);
  const scrollToUploadCenter = (targetType?: MaterialType) => {
    if (targetType) {
      setQuickType(targetType);
      setMaterialType(targetType);
    }
    uploadCenterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const createParam = searchParams.get('create');
    const noteIdParam = searchParams.get('noteId');
    const sourceModeParam = searchParams.get('sourceMode') as SourceMode;
    if (createParam === 'video' || noteIdParam) {
      if (createParam === 'video') {
        setQuickType('video');
        setMaterialType('video');
      }
      if (noteIdParam) setSelectedNoteId(noteIdParam);
      if (sourceModeParam && ['own', 'platform', 'upload'].includes(sourceModeParam)) {
        setSourceMode(sourceModeParam);
      }
      setTimeout(() => scrollToUploadCenter(createParam === 'video' ? 'video' : undefined), 120);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('create');
      nextParams.delete('noteId');
      nextParams.delete('sourceMode');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const handleQuickFileSelect = async (file: File) => {
    setQuickFile(file);
    const cleanBase = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setQuickTitle(cleanBase);
    try {
      const res = await extractFile(file);
      if (res.kind === 'text' && res.pages) {
        setQuickPageCount(res.pages);
        toast.success(`${res.pages} sayfa/slayt başarıyla tarandı.`);
      }
    } catch {
      // Tam döküm başlatma esnasında yapılacak
    }
  };

  const handleQuickStart = async () => {
    if (!quickFile || !quickTitle.trim()) {
      toast.error('Lütfen bir dosya ve başlık girin.');
      return;
    }
    await handleGenerate({
      file: quickFile,
      title: quickTitle,
      course: quickCourse,
      type: quickType,
    });
  };

  const convertMaterialTo = async (source: StudyMaterial, targetType: MaterialType) => {
    const cleanTitle = source.title.replace(/^[^:]+:\s*/, '');
    const c = source.content || {};
    let contextText = `${cleanTitle}\nDers: ${source.course || '-'}\n\n`;
    if (c.overview) contextText += `GENEL BAKIŞ:\n${c.overview}\n\n`;
    if (c.keyPoints?.length) contextText += `HAP BİLGİLER:\n${c.keyPoints.join('\n')}\n\n`;
    if (c.sections?.length) {
      contextText += c.sections.map((s: any) => `--- ${s.heading} ---\n${s.content}\nÇıkarım: ${s.takeaway || '-'}`).join('\n\n');
    }
    setActiveMaterial(null);
    setGenerating(true);
    startProgress(targetType === 'video' ? 'Video dersi hazırlanıyor...' : 'Kısa sınav hazırlanıyor...');
    try {
      const payload: any = {
        materialType: targetType,
        difficulty: 'medium',
        count: 10,
        examProfile: { examType: 'test', totalQuestions: 10, examDate: '', focus: '', level: 'medium' },
        noteTitle: cleanTitle,
        course: source.course || '-',
        noteContext: `--- ÖZET KAYNAKLI METİN ---\n${contextText.slice(0, 15000)}`,
      };
      const res = await supabase.functions.invoke('generate-study-material', { body: payload });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      const { data: inserted, error } = await supabase.from('study_materials').insert({
        user_id: user!.id,
        source_type: 'own',
        source_note_id: source.source_note_id || null,
        material_type: targetType,
        title: `${TYPE_META[targetType].label}: ${cleanTitle}`,
        course: source.course,
        content: res.data.content,
        model: res.data.model,
        exam_profile: payload.examProfile,
      }).select().single();
      if (error) throw error;

      stopProgress(true);
      toast.success(targetType === 'video' ? 'Video dersi hazırlandı.' : 'Kısa sınav hazırlandı.');
      setActiveMaterial(inserted as StudyMaterial);
      void load();
    } catch (e: any) {
      stopProgress(false);
      toast.error(e.message || 'Dönüştürme işlemi başarısız oldu.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async (overrides?: {
    file?: File;
    title?: string;
    course?: string;
    type?: MaterialType;
  }) => {
    const activeType = overrides?.type || materialType;
    const isDirectUpload = !!overrides?.file || sourceMode === 'upload';
    const activeFile = overrides?.file || uploadFile;
    const activeTitle = overrides?.title || uploadTitle;
    const activeCourse = overrides?.course || uploadCourse;

    const safeCount = Math.max(3, Math.min(30, Number.isFinite(count) ? count : 10));
    let payload: any = {
      materialType: activeType,
      difficulty,
      count: safeCount,
      examProfile: { examType, totalQuestions: safeCount, examDate, focus, level: difficulty },
    };
    let titleForMaterial = '';
    let courseForMaterial: string | null = null;
    let sourceNoteId: string | null = null;

    if (isDirectUpload) {
      if (!activeFile || !activeTitle.trim()) { toast.error('Dosya ve başlık zorunlu.'); return; }
      const max = 25 * 1024 * 1024;
      if (activeFile.size > max) { toast.error('Dosya 25MB sınırını aşıyor.'); return; }

      setGenerating(true);
      startProgress('Dosya okunuyor...');
      try {
        const ex = await extractFile(activeFile, (pct, label) => setProgressNow(Math.min(pct, 65), label));
        payload.noteTitle = activeTitle;
        payload.course = activeCourse || '-';
        if (ex.kind === 'text') {
          payload.noteContext =
            `Yüklenen materyal: ${activeFile.name}\nAçıklama: ${uploadDescription || '-'}\n` +
            `${ex.pages ? `Sayfa/Slayt sayısı: ${ex.pages}\n` : ''}` +
            `--- METİN İÇERİĞİ ---\n${ex.text}`;
        } else if (ex.kind === 'image') {
          payload.noteContext = `Yüklenen görsel: ${activeFile.name}\nAçıklama: ${uploadDescription || '-'}\n(Ekteki görseli birincil kaynak olarak kullan.)`;
          payload.document = { data: ex.data, mimeType: ex.mime };
        } else {
          payload.noteContext = `Yüklenen ses kaydı: ${activeFile.name}\nAçıklama: ${uploadDescription || '-'}\n(Ekteki ses kaydını birincil kaynak olarak kullan, dökümden konuları çıkar.)`;
          payload.audio = { data: ex.data, mimeType: ex.mime };
        }
        titleForMaterial = activeTitle;
        courseForMaterial = activeCourse || null;
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

    if (activeType === 'video') {
      const videoStages = [
        { cap: 28, label: 'Ders notundaki temel kavramlar ve konular analiz ediliyor...' },
        { cap: 58, label: 'Hocanın sorabileceği noktalar ve örnek sorular hazırlanıyor...' },
        { cap: 85, label: 'Görsel şemalar ve kavram eşleştirme kartları oluşturuluyor...' },
        { cap: 95, label: 'Video yükleniyor, lütfen bekleyiniz.' },
      ];
      let currentStageIdx = 0;
      setProgressLabel(videoStages[0].label);
      if (progressTimer.current) window.clearInterval(progressTimer.current);
      progressTimer.current = window.setInterval(() => {
        setProgress(p => {
          const currentStage = videoStages[currentStageIdx];
          if (!currentStage) return Math.min(95, p + 1);
          if (p < currentStage.cap) {
            return p + 1;
          } else if (currentStageIdx < videoStages.length - 1) {
            currentStageIdx++;
            setProgressLabel(videoStages[currentStageIdx].label);
            return p + 1;
          }
          return p;
        });
      }, 400);
    } else {
      rampProgressTo(95, 'Materyal hazırlanıyor...');
    }

    try {
      const res = await supabase.functions.invoke('generate-study-material', { body: payload });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      setProgressNow(100, 'Kaydediliyor...');
      const { data: inserted, error } = await supabase.from('study_materials').insert({
        user_id: user!.id,
        source_type: isDirectUpload ? 'own' : (sourceMode === 'platform' ? 'platform' : 'own'),
        source_note_id: sourceNoteId,
        material_type: activeType,
        title: `${TYPE_META[activeType].label}: ${titleForMaterial}`,
        course: courseForMaterial,
        content: res.data.content,
        model: res.data.model,
        exam_profile: payload.examProfile,
      }).select().single();
      if (error) throw error;

      stopProgress(true);
      toast.success(activeType === 'video' ? 'Video dersi hazır.' : 'Materyal hazır.');
      setActiveMaterial(inserted as StudyMaterial);
      if (overrides?.file) {
        setQuickFile(null);
        setQuickTitle('');
        setQuickCourse('');
        setQuickPageCount(null);
      }
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
        {/* Modern Studio Hero Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card/85 to-primary/5 p-6 md:p-8 shadow-sm">
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <GraduationCap className="h-4 w-4" />
                <span>Akademik Çalışma ve Öğrenme Merkezi</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl font-display">
                Çalışma Stüdyosu
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Ders slaytlarınızı, PDF notlarınızı ve ses kayıtlarınızı yükleyin; konu özetleri, çözümlü kısa sınavlar, bilgi kartları ve Dr. Deniz ile Barış'ın anlatımıyla zenginleşen interaktif video dersleri anında hazırlansın.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center shrink-0">
              <Button
                variant="outline"
                onClick={() => setReportOpen(true)}
                className="w-full gap-2 rounded-xl border-border/80 bg-background/50 hover:bg-background/80 shadow-sm sm:w-auto text-xs"
              >
                <Bug className="h-4 w-4" /> Platforma Bildir
              </Button>
              <Button
                onClick={() => scrollToUploadCenter()}
                className="w-full gap-2 rounded-xl border-0 bg-gradient-to-r from-primary via-blue-600 to-primary bg-[length:200%_100%] text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-[position:100%_0] sm:w-auto text-xs font-semibold"
              >
                <Plus className="h-4 w-4" /> Yeni Materyal Yükle
              </Button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="relative mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 border-t border-border/50 pt-5">
            {[
              { label: 'Tüm Materyaller', value: stats.total, icon: BookOpen, tone: 'text-primary', tint: 'bg-primary/10 border-primary/20' },
              { label: 'Konu Özetleri', value: stats.summary, icon: FileTextIcon, tone: 'text-emerald-500', tint: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Video Dersleri', value: stats.video, icon: VideoIcon, tone: 'text-cyan-500', tint: 'bg-cyan-500/10 border-cyan-500/20' },
              { label: 'Kısa Sınavlar', value: stats.quiz, icon: ClipboardList, tone: 'text-amber-500', tint: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'Bilgi Kartları', value: stats.flashcards, icon: Layers, tone: 'text-purple-500', tint: 'bg-purple-500/10 border-purple-500/20' },
              {
                label: 'Sınav Başarısı',
                value: averageQuizScore === null ? '—' : `%${averageQuizScore}`,
                icon: Trophy,
                tone: 'text-blue-500',
                tint: 'bg-blue-500/10 border-blue-500/20',
              },
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-3 transition-colors hover:border-primary/30 hover:bg-background/80"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${s.tint} ${s.tone}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold leading-tight tracking-tight text-foreground">{s.value}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <LiveLectureCapture
            userId={user!.id}
            onSaved={(material) => setMaterials((current) => [material, ...current])}
          />
        )}

        {quizAttempts.length > 0 && (
          <Card className="rounded-2xl border-border/70 bg-card/60 backdrop-blur shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-foreground">Haftalık Sınav Performansınız</h3>
                    <p className="text-[11px] text-muted-foreground">Son 7 günde tamamlanan {weeklyAttempts} sınav · Ortalama Başarı: %{averageQuizScore}</p>
                  </div>
                </div>
                <div className="flex h-10 items-end gap-2" role="img" aria-label="Son yedi gündeki kısa sınav tamamlama grafiği">
                  {weeklyStudy.map((day, index) => (
                    <div key={`${day.label}-${index}`} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-5 sm:w-6 rounded-t transition-all ${day.attempts ? 'bg-primary' : 'bg-muted'}`}
                        style={{ height: `${Math.max(4, (day.attempts / weeklyMax) * 24)}px` }}
                        title={`${day.label}: ${day.attempts} kısa sınav`}
                      />
                      <span className="text-[9px] uppercase font-mono text-muted-foreground">{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SLAYT, NOT YÜKLEME MERKEZİ (YENİ İÇERİK MATERYALİ İLE BİRLEŞTİRİLMİŞ HUB) */}
        <section
          ref={uploadCenterRef}
          id="upload-center"
          className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-card/95 via-card/85 to-primary/5 p-5 md:p-7 shadow-xl shadow-primary/5 backdrop-blur-xl transition-all"
        >
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    <Presentation className="h-3.5 w-3.5" /> Slayt, Not Yükleme Merkezi
                  </span>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">PPTX Slayt</Badge>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">PDF</Badge>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">DOCX</Badge>
                </div>
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground font-display">
                  Slaytlarınızı veya Ders Notlarınızı Yükleyin, Hemen Çalışmaya Başlayın
                </h2>
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  PowerPoint sunumları (.pptx), PDF veya Word notları; slayt slayt taranarak konu özeti, interaktif ikili video dersi, kısa sınav veya bilgi kartlarına dönüştürülür.
                </p>
              </div>
            </div>

            {/* Kaynak Seçim Sekmeleri */}
            <div className="flex border-b border-border/60 pb-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSourceMode('upload')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition ${
                    sourceMode === 'upload'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border/70 bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" /> Slayt / Dosya Yükle
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('own')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition ${
                    sourceMode === 'own'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border/70 bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" /> Notlarımdan Seç ({ownNotes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('platform')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition ${
                    sourceMode === 'platform'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border/70 bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" /> Platform Notları ({platformNotes.length})
                </button>
              </div>
            </div>

            {sourceMode === 'upload' ? (
              /* DOSYA / SLAYT YÜKLEME ALANI */
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleQuickFileSelect(f);
                }}
                className={`relative rounded-2xl border-2 border-dashed p-4 sm:p-6 transition-all text-center flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-primary bg-primary/10 scale-[1.01]'
                    : quickFile
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/80 bg-background/40 hover:border-primary/40 hover:bg-background/60'
                }`}
              >
                <input
                  type="file"
                  id="quick-slide-file-input"
                  className="hidden"
                  accept=".pdf,.pptx,.docx,.txt,.md,image/*,audio/*,text/*"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void handleQuickFileSelect(f);
                  }}
                />

                {quickFile ? (
                  <div className="w-full max-w-xl space-y-3.5">
                    <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          {quickFile.name.endsWith('.pptx') ? (
                            <Presentation className="h-5 w-5" />
                          ) : quickFile.name.endsWith('.docx') ? (
                            <FileTextIcon className="h-5 w-5" />
                          ) : (
                            <FileSpreadsheet className="h-5 w-5" />
                          )}
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-xs sm:text-sm font-semibold truncate text-foreground">{quickFile.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span>{(quickFile.size / 1024 / 1024).toFixed(1)} MB</span>
                            {quickPageCount && (
                              <span className="text-primary font-semibold">· {quickPageCount} Slayt/Sayfa Tespit Edildi</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setQuickFile(null); setQuickPageCount(null); }}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label="Dosyayı kaldır"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Materyal Başlığı</Label>
                        <Input
                          value={quickTitle}
                          onChange={e => setQuickTitle(e.target.value)}
                          placeholder="Örn: Mikro İktisat 1. Vize Slaytları"
                          className="h-9 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Ders Adı (İsteğe Bağlı)</Label>
                        <Input
                          value={quickCourse}
                          onChange={e => setQuickCourse(e.target.value)}
                          placeholder="Örn: Mikro İktisat"
                          className="h-9 text-xs mt-1"
                        />
                      </div>
                    </div>

                    {/* Mode Pill Selector */}
                    <div className="space-y-1.5 text-left">
                      <Label className="text-[11px] text-muted-foreground">Üretilecek Çıktı Türü</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { type: 'summary', label: 'Konu & Slayt Özeti', icon: FileTextIcon, badge: 'ÖNERİLEN' },
                          { type: 'video', label: 'İnteraktif Video Dersi', icon: VideoIcon, badge: 'İKİLİ ANLATIM' },
                          { type: 'quiz', label: 'Kısa Sınav', icon: ClipboardList, badge: 'TEST' },
                          { type: 'flashcards', label: 'Bilgi Kartları', icon: Layers, badge: 'TEKRAR' },
                        ].map(opt => (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => setQuickType(opt.type as MaterialType)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-start gap-1 transition text-left ${
                              quickType === opt.type
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-border/70 bg-card hover:bg-muted/40 text-muted-foreground'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <opt.icon className="h-3.5 w-3.5" />
                              <span className="text-[9px] px-1 rounded bg-muted font-mono">{opt.badge}</span>
                            </div>
                            <span className="text-foreground text-[11px] mt-0.5">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button
                      size="lg"
                      onClick={() => void handleQuickStart()}
                      disabled={generating}
                      className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary via-blue-600 to-primary bg-[length:200%_100%] text-white font-semibold shadow-lg shadow-primary/20 hover:bg-[position:100%_0] transition-all"
                    >
                      {generating ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> {progressLabel || 'Çözümleniyor...'}</>
                      ) : (
                        <><Zap className="h-4 w-4" /> {quickType === 'summary' ? 'Slaytların Özetini Çıkar' : quickType === 'video' ? 'Video Dersini Başlat' : quickType === 'quiz' ? 'Kısa Sınavı Başlat' : 'Kart Setini Başlat'}</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="quick-slide-file-input"
                    className="cursor-pointer flex flex-col items-center gap-2.5 py-4 w-full"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-inner transition-transform hover:scale-105">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        PowerPoint slaytlarını (.pptx), PDF veya Word notlarını buraya bırakın
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        veya dosya seçmek için tıklayın (otomatik slayt ve sayfa tespiti yapılır)
                      </p>
                    </div>
                  </label>
                )}
              </div>
            ) : (
              /* NOTLARIMDAN VEYA PLATFORMDAN SEÇİM ALANI */
              <div className="rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 space-y-3.5">
                <div className="space-y-1 text-left">
                  <Label className="text-xs font-semibold text-foreground">
                    {sourceMode === 'own' ? 'Çalışmak İstediğin Notunu Seç' : 'Platform Notları Havuzundan Seç'}
                  </Label>
                  <Select
                    value={selectedNoteId}
                    onValueChange={id => {
                      setSelectedNoteId(id);
                      const list = sourceMode === 'own' ? ownNotes : platformNotes;
                      const n = list.find(item => item.id === id);
                      if (n) {
                        setQuickTitle(n.title);
                        setQuickCourse(n.course || '');
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 text-xs">
                      <SelectValue placeholder={sourceMode === 'own' ? 'Kendi notunu seç...' : 'Onaylı platform notu seç...'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(sourceMode === 'own' ? ownNotes : platformNotes).map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          <span className="font-medium">{n.title}</span>
                          <span className="text-muted-foreground ml-2 text-xs">· {n.course}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Materyal Başlığı</Label>
                    <Input
                      value={quickTitle}
                      onChange={e => setQuickTitle(e.target.value)}
                      placeholder="Örn: Ders Notu Başlığı"
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Ders Adı (İsteğe Bağlı)</Label>
                    <Input
                      value={quickCourse}
                      onChange={e => setQuickCourse(e.target.value)}
                      placeholder="Örn: İktisat Tarihi"
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                </div>

                {/* Mode Pill Selector */}
                <div className="space-y-1.5 text-left">
                  <Label className="text-[11px] text-muted-foreground">Üretilecek Çıktı Türü</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { type: 'summary', label: 'Konu & Slayt Özeti', icon: FileTextIcon, badge: 'ÖNERİLEN' },
                      { type: 'video', label: 'İnteraktif Video Dersi', icon: VideoIcon, badge: 'İKİLİ ANLATIM' },
                      { type: 'quiz', label: 'Kısa Sınav', icon: ClipboardList, badge: 'TEST' },
                      { type: 'flashcards', label: 'Bilgi Kartları', icon: Layers, badge: 'TEKRAR' },
                    ].map(opt => (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => setQuickType(opt.type as MaterialType)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-start gap-1 transition text-left ${
                          quickType === opt.type
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border/70 bg-card hover:bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <opt.icon className="h-3.5 w-3.5" />
                          <span className="text-[9px] px-1 rounded bg-muted font-mono">{opt.badge}</span>
                        </div>
                        <span className="text-foreground text-[11px] mt-0.5">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  size="lg"
                  onClick={() => {
                    if (!selectedNoteId) {
                      toast.error('Lütfen bir not seçin.');
                      return;
                    }
                    void handleGenerate({
                      title: quickTitle,
                      course: quickCourse,
                      type: quickType,
                    });
                  }}
                  disabled={generating}
                  className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary via-blue-600 to-primary bg-[length:200%_100%] text-white font-semibold shadow-lg shadow-primary/20 hover:bg-[position:100%_0] transition-all"
                >
                  {generating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {progressLabel || 'Çözümleniyor...'}</>
                  ) : (
                    <><Zap className="h-4 w-4" /> {quickType === 'summary' ? 'Ders Özetini Çıkar' : quickType === 'video' ? 'Video Dersini Başlat' : quickType === 'quiz' ? 'Kısa Sınavı Başlat' : 'Kart Setini Başlat'}</>
                  )}
                </Button>
              </div>
            )}

            {generating && (
              <div className="w-full space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary">{progressLabel}</span>
                  <span className="font-mono font-bold text-foreground">%{progress}</span>
                </div>
                <Progress value={progress} className="h-2 rounded-full" />
              </div>
            )}
          </div>
        </section>

        {/* Materyallerim Header & Filters */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-foreground font-display">
                Kayıtlı Çalışma Materyalleriniz
              </h2>
              <Badge variant="secondary" className="rounded-full text-xs font-semibold px-2.5">
                {filtered.length}
              </Badge>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-3 sm:p-4 backdrop-blur shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Materyallerinizde arayın (örn. İktisat, Vize, Sınav)..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Materyal türü filtresi">
                {([['all', 'Tümü'], ...(Object.keys(TYPE_META) as MaterialType[]).map(t => [t, TYPE_META[t].label] as const)] as [string, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setTypeFilter(val as 'all' | MaterialType)}
                    aria-pressed={typeFilter === val}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      typeFilter === val
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border/70 bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zaman filtresi">
                {([['all', 'Tüm Zamanlar'], ['today', 'Bugün'], ['week', 'Son 7 Gün']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setTimeFilter(val)}
                    aria-pressed={timeFilter === val}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      timeFilter === val
                        ? 'border-secondary bg-secondary text-secondary-foreground shadow-sm'
                        : 'border-border/70 bg-card/60 text-muted-foreground hover:border-secondary/40 hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed rounded-2xl">
            <CardContent className="py-12 text-center">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Henüz materyal bulunmuyor. İlk çalışma setinizi hemen oluşturun.</p>
              <Button onClick={() => scrollToUploadCenter()} className="mt-4 gap-2 rounded-xl"><Plus className="h-4 w-4" /> Materyal Oluştur</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(m => {
              const meta = TYPE_META[m.material_type];
              const Icon = meta.icon;
              const createdLabel = m.created_at
                ? new Date(m.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
                : '';
              const detailPill =
                m.material_type === 'video'
                  ? `${Math.max(6, Array.isArray(m.content?.scenes) ? m.content.scenes.length : 6)} Bölüm · Eşleştirme & Sınav Odaklı`
                  : m.material_type === 'flashcards' && Array.isArray(m.content?.cards)
                  ? `${m.content.cards.length} Bilgi Kartı`
                  : m.material_type === 'quiz' && Array.isArray(m.content?.questions)
                  ? `${m.content.questions.length} Sınav Sorusu`
                  : m.material_type === 'summary' && Array.isArray(m.content?.sections)
                  ? `${m.content.sections.length} Alt Başlık`
                  : null;

              return (
                <div
                  key={m.id}
                  className={`group relative flex flex-col rounded-2xl border p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 bg-card/80 shadow-sm backdrop-blur ${
                    m.material_type === 'video'
                      ? 'border-cyan-500/30 hover:border-cyan-500/60 hover:shadow-[0_12px_36px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/10'
                      : 'border-border/70 hover:border-primary/40 hover:shadow-lg'
                  }`}
                >
                  <div className="relative flex items-start justify-between gap-2">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 ${meta.tint} ${meta.tone} shadow-sm`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {createdLabel && (
                        <span className="text-[11px] font-medium text-muted-foreground">{createdLabel}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => handleDelete(m.id)}
                        aria-label="Materyali sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <h3 className="relative mt-3 line-clamp-2 font-display text-base font-semibold leading-snug text-foreground">
                    {m.title}
                  </h3>

                  <div className="relative mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] font-medium border-border/80">
                      {meta.label}
                    </Badge>
                    {m.course && (
                      <span className="truncate max-w-[180px] rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                        {m.course}
                      </span>
                    )}
                    {m.exam_profile?.examType && (
                      <Badge variant="secondary" className="text-[10px]">
                        {m.exam_profile.examType === 'test' ? 'Test' : m.exam_profile.examType === 'classic' ? 'Klasik' : 'Karma'}
                      </Badge>
                    )}
                  </div>

                  {detailPill && (
                    <p className="relative mt-2.5 text-[11px] font-medium text-muted-foreground">
                      {detailPill}
                    </p>
                  )}

                  <div className="relative mt-auto pt-4">
                    <Button
                      variant={m.material_type === 'video' ? 'default' : 'secondary'}
                      className={`w-full gap-2 rounded-xl text-xs font-semibold ${
                        m.material_type === 'video'
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20'
                          : 'hover:bg-primary hover:text-primary-foreground'
                      }`}
                      onClick={() => setActiveMaterial(m)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {m.material_type === 'video' ? 'Stüdyoyu Başlat' : 'Çalışmaya Başla'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Video Studio - True Full Screen Cinema Overlay */}
      {activeMaterial && activeMaterial.material_type === 'video' && (
        <InteractiveVideoStudio
          key={activeMaterial.id}
          material={activeMaterial}
          onClose={() => setActiveMaterial(null)}
          onReport={() => setReportOpen(true)}
        />
      )}

      {/* Viewer Dialog for flashcards, quiz, summary */}
      <Dialog
        open={!!activeMaterial && activeMaterial.material_type !== 'video'}
        onOpenChange={(o) => !o && setActiveMaterial(null)}
      >
        <DialogContent className={`max-h-[92dvh] w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl p-3 sm:p-6 transition-all ${
          activeMaterial?.material_type === 'summary' ? 'max-w-4xl' : 'max-w-3xl'
        }`}>
          {activeMaterial && activeMaterial.material_type !== 'video' && (
            <MaterialViewer
              key={activeMaterial.id}
              material={activeMaterial}
              onClose={() => setActiveMaterial(null)}
              onReport={() => setReportOpen(true)}
              onProgressSaved={() => void load()}
              onConvertToVideo={() => void convertMaterialTo(activeMaterial, 'video')}
              onConvertToQuiz={() => void convertMaterialTo(activeMaterial, 'quiz')}
            />
          )}
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
      <DialogContent className="max-w-md z-[260]">
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
                <SelectItem value="video">Video Dersi</SelectItem>
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
const MaterialViewer = ({
  material,
  onClose,
  onReport,
  onProgressSaved,
  onConvertToVideo,
  onConvertToQuiz,
}: {
  material: StudyMaterial;
  onClose?: () => void;
  onReport: () => void;
  onProgressSaved: () => void;
  onConvertToVideo?: () => void;
  onConvertToQuiz?: () => void;
}) => {
  const [coachOpen, setCoachOpen] = useState(false);

  const renderer = () => {
    switch (material.material_type) {
      case 'flashcards': return <FlashcardViewer material={material} onProgressSaved={onProgressSaved} />;
      case 'quiz': return <QuizViewer material={material} onProgressSaved={onProgressSaved} />;
      case 'summary': return (
        <SummaryViewer
          material={material}
          onConvertToVideo={onConvertToVideo}
          onConvertToQuiz={onConvertToQuiz}
        />
      );
      default: return null;
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
              aria-label="Akademik Akıl Hocası"
              className="min-w-0 gap-1 bg-gradient-to-r from-primary to-fuchsia-500 text-primary-foreground hover:opacity-90"
            >
              <Wand2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Akademik Akıl Hocası</span>
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
            <p className="text-sm font-semibold leading-none">Akademik Akıl Hocası</p>
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

const SummaryViewer = ({
  material,
  onConvertToVideo,
  onConvertToQuiz,
}: {
  material: StudyMaterial;
  onConvertToVideo?: () => void;
  onConvertToQuiz?: () => void;
}) => {
  const c = material.content || {};
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'exam' | 'concepts'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedMd, setCopiedMd] = useState(false);
  const [checklist, setChecklist] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`econnotes_summary_checklist_${material.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleChecklistItem = (idx: number) => {
    setChecklist(prev => {
      const next = { ...prev, [idx]: !prev[idx] };
      try {
        localStorage.setItem(`econnotes_summary_checklist_${material.id}`, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleCopyMarkdown = () => {
    const lines: string[] = [
      `# ${material.title}`,
      material.course ? `**Ders:** ${material.course}` : '',
      `**Tarih:** ${new Date(material.created_at).toLocaleDateString('tr-TR')}`,
      '',
      '---',
      '## 📋 Genel Bakış',
      c.overview || '',
      '',
    ];

    if (c.keyPoints?.length) {
      lines.push('## ⚡ Kritik Hap Bilgiler');
      c.keyPoints.forEach((kp: string) => lines.push(`- ${kp}`));
      lines.push('');
    }

    if (c.instructorEmphasis?.length) {
      lines.push('## 🎯 Hocanın Sınav Vurguları & Çeldirici Uyarıları');
      c.instructorEmphasis.forEach((ie: string) => lines.push(`- ⚠️ ${ie}`));
      lines.push('');
    }

    if (c.examLikelihood?.length) {
      lines.push('## 📊 Sınavda Çıkma Olasılığı Yüksek Konular');
      c.examLikelihood.forEach((el: any) => {
        lines.push(`- **${el.topic}** [${(el.likelihood || 'yüksek').toUpperCase()} OLASILIK]`);
        lines.push(`  - Gerekçe: ${el.reason}`);
        if (el.studyPriority) lines.push(`  - Öncelik: ${el.studyPriority}`);
      });
      lines.push('');
    }

    if (c.sections?.length) {
      lines.push('## 📑 Bölüm & Slayt Çözümlemeleri');
      c.sections.forEach((s: any, i: number) => {
        lines.push(`### ${i + 1}. ${s.heading}`);
        lines.push(s.content);
        if (s.takeaway) lines.push(`> 💡 **Çıkarım:** ${s.takeaway}`);
        lines.push('');
      });
    }

    if (c.keyTerms?.length) {
      lines.push('## 💡 Kritik Kavram Sözlüğü');
      c.keyTerms.forEach((kt: any) => lines.push(`- **${kt.term}:** ${kt.definition}`));
      lines.push('');
    }

    if (c.studyChecklist?.length) {
      lines.push('## ✅ Sınava Hazırlık Kontrol Listesi');
      c.studyChecklist.forEach((item: string) => lines.push(`- [ ] ${item}`));
      lines.push('');
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedMd(true);
    toast.success('Ders özeti Markdown formatında panoya kopyalandı! (Notion & Obsidian için hazır)');
    setTimeout(() => setCopiedMd(false), 2500);
  };

  const filteredSections = (c.sections || []).filter((s: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (s.heading || '').toLowerCase().includes(q) || (s.content || '').toLowerCase().includes(q);
  });

  const checklistItems: string[] = c.studyChecklist || [];
  const completedCount = checklistItems.filter((_, i) => checklist[i]).length;
  const checklistProgress = checklistItems.length ? Math.round((completedCount / checklistItems.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Top action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/70 bg-card/60 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30 font-semibold gap-1">
            <FileTextIcon className="h-3 w-3" /> Konu &amp; Slayt Özeti
          </Badge>
          {material.course && (
            <span className="text-xs text-muted-foreground font-medium">· {material.course}</span>
          )}
          {c.sections?.length && (
            <span className="text-xs text-muted-foreground">· {c.sections.length} Bölüm</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onConvertToVideo && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-xl border-cyan-500/30 text-cyan-600 hover:bg-cyan-500/10 dark:text-cyan-400 text-xs font-semibold"
              onClick={onConvertToVideo}
              title="Bu ders özetini Dr. Deniz ve Barış ile interaktif videolu derse dönüştür"
            >
              <VideoIcon className="h-3.5 w-3.5" /> Videoya Dönüştür
            </Button>
          )}
          {onConvertToQuiz && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-xl border-accent/30 text-accent hover:bg-accent/10 text-xs font-semibold"
              onClick={onConvertToQuiz}
              title="Bu ders özetinden sınav soruları hazırla"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Sınava Dönüştür
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl text-xs"
            onClick={handleCopyMarkdown}
            title="Notion veya Obsidian için Markdown kopyala"
          >
            {copiedMd ? <CheckCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedMd ? 'Kopyalandı' : 'Markdown Kopyala'}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white text-xs font-semibold shadow-sm"
            onClick={() => downloadLectureSummary({
              title: material.title,
              course: material.course,
              createdAt: new Date(material.created_at).toLocaleDateString('tr-TR'),
              overview: c.overview,
              keyPoints: c.keyPoints,
              sections: c.sections,
              instructorEmphasis: c.instructorEmphasis,
              examLikelihood: c.examLikelihood,
              keyTerms: c.keyTerms,
              studyChecklist: c.studyChecklist,
              transcript: c.transcript,
            })}
          >
            <FileDown className="h-3.5 w-3.5" /> Cihaza İndir (HTML)
          </Button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-border/60 pb-1">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Genel Bakış & Hap Bilgiler', count: c.keyPoints?.length },
            { id: 'sections', label: 'Slayt & Konu Analizi', count: c.sections?.length },
            { id: 'exam', label: 'Hoca Vurguları & Sınav Tahmini', count: (c.instructorEmphasis?.length || 0) + (c.examLikelihood?.length || 0) },
            { id: 'concepts', label: 'Kavramlar & Kontrol Listesi', count: (c.keyTerms?.length || 0) + (c.studyChecklist?.length || 0) },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 -mb-[1px] whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {c.overview && (
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-secondary/5 p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Kuramsal Çerçeve ve Genel Bakış
              </p>
              <p className="text-sm leading-relaxed text-foreground/90 font-normal">{c.overview}</p>
            </div>
          )}

          {c.infographic?.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {c.infographic.map((it: any, i: number) => (
                <div key={i} className="rounded-xl border border-border/80 bg-card/80 p-3 shadow-sm hover:border-primary/40 transition">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{it.label}</p>
                  <p className="text-base sm:text-lg font-bold font-display text-foreground mt-1 truncate">{it.value}</p>
                </div>
              ))}
            </div>
          )}

          {c.keyPoints?.length > 0 && (
            <div className="rounded-2xl border border-border/80 bg-card/80 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Sınav Öncesi Kritik Hap Bilgiler
                </p>
                <span className="text-[11px] text-muted-foreground">{c.keyPoints.length} Madde</span>
              </div>
              <div className="grid gap-2">
                {c.keyPoints.map((kp: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition border border-transparent hover:border-border text-xs sm:text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-[11px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed text-foreground/90">{kp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SECTIONS */}
      {activeTab === 'sections' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Bölümlerde veya slaytlarda kavram ara..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            {searchQuery && (
              <Button size="sm" variant="ghost" onClick={() => setSearchQuery('')} className="h-9 px-2 text-xs">
                Temizle
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {filteredSections.map((s: any, i: number) => (
              <div key={i} className="rounded-2xl border border-border/80 bg-card/80 p-4 sm:p-5 shadow-sm hover:border-border transition space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary font-mono text-xs font-bold">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h4 className="font-semibold text-sm sm:text-base text-foreground">{s.heading}</h4>
                  </div>
                </div>

                <div className="prose prose-sm max-w-none dark:prose-invert text-xs sm:text-sm leading-relaxed text-foreground/90">
                  <ReactMarkdown>{s.content}</ReactMarkdown>
                </div>

                {s.takeaway && (
                  <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                    <span className="text-primary font-bold shrink-0 mt-0.5">💡 Çıkarım:</span>
                    <span className="text-foreground/90 font-medium leading-relaxed">{s.takeaway}</span>
                  </div>
                )}
              </div>
            ))}
            {filteredSections.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Aradığınız kriterlere uygun bölüm bulunamadı.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EXAM */}
      {activeTab === 'exam' && (
        <div className="space-y-4 animate-fade-in">
          {c.instructorEmphasis?.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Hocanın Özellikle Vurguladıkları &amp; Çeldirici Noktalar
                </p>
              </div>
              <div className="space-y-2">
                {c.instructorEmphasis.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-background/60 border border-amber-500/20 text-xs sm:text-sm leading-relaxed">
                    <span className="text-amber-500 font-bold text-base leading-none mt-0.5">⚠️</span>
                    <span className="text-foreground/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.examLikelihood?.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Sınavda Çıkma Olasılığı Yüksek Konular
                  </p>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">
                  {c.examLikelihood.length} Konu Analizi
                </Badge>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {c.examLikelihood.map((item: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-bold text-foreground truncate">{item.topic}</span>
                      <Badge className={
                        item.likelihood === 'yüksek'
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]'
                          : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]'
                      }>
                        {item.likelihood} olasılık
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.reason}</p>
                    {item.studyPriority && (
                      <p className="text-[11px] font-semibold text-primary pt-1 border-t border-border/40">
                        Çalışma önceliği: {item.studyPriority}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                * Bu değerlendirme ders dökümü ve slaytlardaki kavram yoğunluğuna dayanmaktadır; kesin sınav garantisi niteliği taşımaz.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONCEPTS & CHECKLIST */}
      {activeTab === 'concepts' && (
        <div className="space-y-4 animate-fade-in">
          {checklistItems.length > 0 && (
            <div className="rounded-2xl border border-primary/20 bg-card p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Sınava Hazırlık Kontrol Listesi
                  </p>
                </div>
                <span className="text-xs font-semibold text-primary">
                  {completedCount}/{checklistItems.length} Tamamlandı (%{checklistProgress})
                </span>
              </div>

              <Progress value={checklistProgress} className="h-2" />

              <div className="space-y-2 pt-1">
                {checklistItems.map((item: string, idx: number) => {
                  const done = !!checklist[idx];
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleChecklistItem(idx)}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl border text-left transition ${
                        done
                          ? 'border-success/30 bg-success/5 text-foreground/80'
                          : 'border-border/70 bg-card hover:bg-muted/40 text-foreground'
                      }`}
                    >
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded mt-0.5 border ${
                        done ? 'border-success bg-success text-white' : 'border-border bg-background'
                      }`}>
                        {done && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span className={`text-xs sm:text-sm leading-relaxed ${done ? 'line-through text-muted-foreground' : ''}`}>
                        {item}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {c.keyTerms?.length > 0 && (
            <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-primary" /> Kritik Kavram Sözlüğü
                </p>
                <span className="text-xs text-muted-foreground">{c.keyTerms.length} Terim</span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {c.keyTerms.map((kt: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-1 hover:border-primary/40 transition">
                    <p className="text-xs font-bold text-primary font-display">{kt.term}</p>
                    <p className="text-xs text-foreground/90 leading-relaxed">{kt.definition}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {typeof c.transcript === 'string' && (
            <details className="rounded-xl border border-border/70 bg-card/60 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                Ham ders dökümünü göster
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {c.transcript}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

const VideoViewer = InteractiveVideoStudio;

export default Study;
