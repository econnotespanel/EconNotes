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
  Upload, Mic, FileUp, Bug, Coffee, Award, Flame, Brain, Trophy, RefreshCw, RotateCw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { extractFile } from '@/lib/extractFile';

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

const TYPE_META: Record<MaterialType, { label: string; icon: any; color: string; desc: string }> = {
  flashcards: { label: 'Bilgi Kartları', icon: Layers, color: 'from-blue-500 to-indigo-600', desc: 'Hızlı tekrar için çevrilebilir kartlar' },
  quiz: { label: 'Quiz', icon: ClipboardList, color: 'from-violet-500 to-fuchsia-600', desc: 'Test veya klasik sınav simülasyonu' },
  summary: { label: 'Konu Özeti', icon: FileTextIcon, color: 'from-emerald-500 to-teal-600', desc: 'Özet, anahtar noktalar, infografik' },
  video: { label: 'Video Özeti', icon: VideoIcon, color: 'from-orange-500 to-rose-600', desc: 'Sahne sahne anlatım + öneriler' },
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
  const { user } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
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
    const [m, own, platform] = await Promise.all([
      supabase.from('study_materials').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('notes').select('id,title,course,description,department,semester,user_id,status,file_name').eq('user_id', user!.id),
      supabase.from('notes').select('id,title,course,description,department,semester,user_id,status,file_name').eq('status', 'approved').limit(200),
    ]);
    setMaterials((m.data || []) as StudyMaterial[]);
    setOwnNotes((own.data || []) as Note[]);
    setPlatformNotes((platform.data || []) as Note[]);
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
      startProgress();
    }

    rampProgressTo(95, 'Yapay zeka materyali üretiyor...');
    try {
      const res = await supabase.functions.invoke('generate-study-material', { body: payload });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      setProgressNow(97, 'Kaydediliyor...');
      const { data: inserted, error } = await supabase.from('study_materials').insert({
        user_id: user!.id,
        source_type: sourceMode,
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

  const filtered = materials.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase()) ||
    (m.course || '').toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: materials.length,
    flashcards: materials.filter(m => m.material_type === 'flashcards').length,
    quiz: materials.filter(m => m.material_type === 'quiz').length,
    summary: materials.filter(m => m.material_type === 'summary').length,
    video: materials.filter(m => m.material_type === 'video').length,
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 md:p-8">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="mb-3 gap-1.5">
                <Sparkles className="h-3 w-3" /> Yeni nesil · Çalışma Stüdyosu
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
                <GraduationCap className="h-8 w-8 text-primary" /> Çalışma Stüdyosu
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white shadow">YENİ</span>
              </h1>
              <p className="text-muted-foreground mt-2 max-w-xl">
                Notlarını, PDF'leri ve sesli kayıtları yükle. Sınav türünü ve hedefini söyle — Çalışma Stüdyosu sana özel kart, quiz, özet ve video taslakları üretsin.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={() => setReportOpen(true)} className="gap-2">
                <Bug className="h-4 w-4" /> Platforma Bildir
              </Button>
              <Button size="lg" onClick={() => setCreateOpen(true)} className="gap-2 shadow-lg shadow-primary/30">
                <Plus className="h-4 w-4" /> Yeni Materyal
              </Button>
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Toplam', value: stats.total, icon: BookOpen },
              { label: 'Kart', value: stats.flashcards, icon: Layers },
              { label: 'Quiz', value: stats.quiz, icon: ClipboardList },
              { label: 'Özet', value: stats.summary, icon: FileTextIcon },
              { label: 'Video', value: stats.video, icon: VideoIcon },
            ].map((s, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-2xl font-bold mt-1">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Type quick picker */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(TYPE_META) as MaterialType[]).map(t => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            return (
              <button
                key={t}
                onClick={() => { setMaterialType(t); setCreateOpen(true); }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-br ${meta.color} transition-opacity`} style={{ filter: 'blur(40px)', opacity: 0.15 }} />
                <div className="relative">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${meta.color} text-white shadow-md`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-semibold">{meta.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meta.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Materyal ara..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
                <Card key={m.id} className="group overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${meta.color} text-white`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => handleDelete(m.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <CardTitle className="text-base line-clamp-2">{m.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2 text-xs flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                      {m.course && <span className="truncate">{m.course}</span>}
                      {m.exam_profile?.examType && (
                        <Badge variant="secondary" className="text-[10px]">
                          {m.exam_profile.examType === 'test' ? 'Test' : m.exam_profile.examType === 'classic' ? 'Klasik' : 'Karma'}
                        </Badge>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button variant="secondary" className="w-full gap-2" onClick={() => setActiveMaterial(m)}>
                      <Play className="h-3.5 w-3.5" /> Çalışmaya Başla
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!generating) setCreateOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Başlık (örn. Mikro 1. Vize)" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                    <Input placeholder="Ders (opsiyonel)" value={uploadCourse} onChange={e => setUploadCourse(e.target.value)} />
                  </div>
                  <Textarea placeholder="Kısa açıklama (opsiyonel)" rows={2} value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} />
                  <label className="flex items-center gap-3 px-3 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition">
                    <FileUp className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{uploadFile ? uploadFile.name : 'Dosya seç (PDF, görsel, ses)'}</p>
                      <p className="text-[11px] text-muted-foreground">PDF, PNG, JPG, MP3, WAV, M4A — maks 25MB</p>
                    </div>
                    {uploadFile?.type.startsWith('audio/') && <Mic className="h-4 w-4 text-fuchsia-500" />}
                    <input type="file" className="hidden" accept=".pdf,image/*,audio/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
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
                  <Label className="text-xs">Sınav tarihi (ops.)</Label>
                  <Input type="date" className="h-9" value={examDate} onChange={e => setExamDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Odaklanmak istediğin konu (ops.)</Label>
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
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Üretiliyor...</> : <><Sparkles className="h-4 w-4" /> AI ile Üret</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Viewer */}
      <Dialog open={!!activeMaterial} onOpenChange={(o) => !o && setActiveMaterial(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {activeMaterial && <MaterialViewer material={activeMaterial} onReport={() => setReportOpen(true)} />}
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
          const { data } = supabase.storage.from('notes').getPublicUrl(path);
          screenshotUrl = data.publicUrl;
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
                <SelectItem value="quiz">Quiz</SelectItem>
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
const MaterialViewer = ({ material, onReport }: { material: StudyMaterial; onReport: () => void }) => {
  const renderer = () => {
    switch (material.material_type) {
      case 'flashcards': return <FlashcardViewer material={material} />;
      case 'quiz': return <QuizViewer material={material} />;
      case 'summary': return <SummaryViewer material={material} />;
      case 'video': return <VideoViewer material={material} />;
    }
  };
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between gap-2 pr-6">
          <span className="line-clamp-2">{material.title}</span>
          <Button size="sm" variant="ghost" onClick={onReport} className="gap-1 shrink-0">
            <Bug className="h-3.5 w-3.5" /> Bildir
          </Button>
        </DialogTitle>
      </DialogHeader>
      {renderer()}
    </div>
  );
};

const FlashcardViewer = ({ material }: { material: StudyMaterial }) => {
  const cards: Array<{ front: string; back: string; hint?: string }> = material.content?.cards || [];
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards[idx]) return <p className="text-muted-foreground">Kart bulunamadı.</p>;
  const card = cards[idx];
  const next = () => { setIdx((idx + 1) % cards.length); setFlipped(false); };
  const prev = () => { setIdx((idx - 1 + cards.length) % cards.length); setFlipped(false); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Kart {idx + 1} / {cards.length}</span>
        <Progress value={((idx + 1) / cards.length) * 100} className="w-32 h-1.5" />
      </div>
      <div onClick={() => setFlipped(f => !f)} className="cursor-pointer min-h-[260px] rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 p-8 flex items-center justify-center text-center transition hover:shadow-lg">
        <div>
          <Badge variant="outline" className="mb-3">{flipped ? 'Cevap' : 'Soru'}</Badge>
          <p className="text-xl font-medium whitespace-pre-wrap">{flipped ? card.back : card.front}</p>
          {!flipped && card.hint && <p className="text-xs text-muted-foreground mt-4 italic">İpucu: {card.hint}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={prev} className="flex-1 gap-2"><ChevronLeft className="h-4 w-4" /> Önceki</Button>
        <Button variant="outline" onClick={() => setFlipped(f => !f)} className="gap-2"><RotateCw className="h-4 w-4" /> Çevir</Button>
        <Button onClick={next} className="flex-1 gap-2">Sonraki <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};

const QuizViewer = ({ material }: { material: StudyMaterial }) => {
  const questions: Array<any> = material.content?.questions || [];
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [streak, setStreak] = useState(0);
  const [motiv, setMotiv] = useState<{ text: string; ok: boolean } | null>(null);

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

  const score = questions.filter((qq: any, i: number) => qq.type !== 'open_ended' && answers[i] === qq.correctIndex).length;
  const answeredMC = questions.filter((qq: any, i: number) => qq.type !== 'open_ended' && revealed[i]).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <Badge variant="outline">Soru {idx + 1} / {questions.length}</Badge>
          {streak > 1 && <Badge className="gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30"><Flame className="h-3 w-3" /> {streak}'li seri</Badge>}
        </div>
        <span className="text-muted-foreground">Doğru: <strong className="text-foreground">{score}/{answeredMC || 0}</strong></span>
      </div>
      <Progress value={((idx + 1) / questions.length) * 100} className="h-1.5" />

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <p className="font-medium text-base">{q.question}</p>

        {isOpen ? (
          <div className="space-y-3">
            <Textarea rows={5} placeholder="Cevabını yaz..." value={openAnswers[idx] || ''} onChange={e => setOpenAnswers({ ...openAnswers, [idx]: e.target.value })} disabled={isRevealed} />
            {!isRevealed && <Button onClick={revealOpen} className="gap-2"><Check className="h-4 w-4" /> Model cevabı göster</Button>}
            {isRevealed && (
              <div className="space-y-2 animate-fade-in">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">MODEL CEVAP</p>
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
                  <span className="text-sm flex-1">{opt}</span>
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

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => { setIdx(Math.max(0, idx - 1)); setMotiv(null); }} disabled={idx === 0} className="flex-1 gap-2"><ChevronLeft className="h-4 w-4" /> Önceki</Button>
        <Button onClick={() => { setIdx(Math.min(questions.length - 1, idx + 1)); setMotiv(null); }} disabled={idx === questions.length - 1} className="flex-1 gap-2">Sonraki <ChevronRight className="h-4 w-4" /></Button>
      </div>

      {idx === questions.length - 1 && answeredMC > 0 && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-fuchsia-500/10 p-4 text-center">
          <Trophy className="h-8 w-8 mx-auto text-primary mb-2" />
          <p className="font-bold text-lg">Quiz tamamlandı!</p>
          <p className="text-sm text-muted-foreground">{score} / {answeredMC} doğru. Yanlışlarını gözden geçir — bu seferki çalışman gerçek bir kazanım.</p>
        </div>
      )}
    </div>
  );
};

const SummaryViewer = ({ material }: { material: StudyMaterial }) => {
  const c = material.content || {};
  return (
    <div className="space-y-4">
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
    </div>
  );
};

const VideoViewer = ({ material }: { material: StudyMaterial }) => {
  const c = material.content || {};
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Outline</p>
        <p className="text-sm leading-relaxed">{c.outline}</p>
      </div>
      {c.scenes?.map((s: any, i: number) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{s.time}</Badge>
            <h4 className="font-semibold">{s.title}</h4>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.narration}</p>
        </div>
      ))}
      {c.suggestedSearches?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">YouTube önerileri</p>
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
