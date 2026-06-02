import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  GraduationCap, Sparkles, Layers, ClipboardList, FileText as FileTextIcon, Video as VideoIcon,
  Loader2, RotateCw, ChevronLeft, ChevronRight, Check, X, Trash2, Play, Search, Plus, BookOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

type MaterialType = 'flashcards' | 'quiz' | 'summary' | 'video';

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
  source_type: 'own' | 'platform';
  source_note_id: string | null;
  material_type: MaterialType;
  title: string;
  course: string | null;
  content: any;
  created_at: string;
}

const TYPE_META: Record<MaterialType, { label: string; icon: any; color: string; desc: string }> = {
  flashcards: { label: 'Bilgi Kartları', icon: Layers, color: 'from-blue-500 to-indigo-600', desc: 'Hızlı tekrar için çevrilebilir kartlar' },
  quiz: { label: 'Quiz', icon: ClipboardList, color: 'from-violet-500 to-fuchsia-600', desc: 'Çoktan seçmeli sınav simülasyonu' },
  summary: { label: 'Konu Özeti', icon: FileTextIcon, color: 'from-emerald-500 to-teal-600', desc: 'Özet, anahtar noktalar, infografik' },
  video: { label: 'Video Özeti', icon: VideoIcon, color: 'from-orange-500 to-rose-600', desc: 'Sahne sahne anlatım + video önerileri' },
};

const Study = () => {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [ownNotes, setOwnNotes] = useState<Note[]>([]);
  const [platformNotes, setPlatformNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<StudyMaterial | null>(null);

  // Create form state
  const [sourceTab, setSourceTab] = useState<'own' | 'platform'>('own');
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [materialType, setMaterialType] = useState<MaterialType>('flashcards');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState(10);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [m, own, platform] = await Promise.all([
      supabase.from('study_materials').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('notes').select('id,title,course,description,department,semester,user_id,status,file_name').eq('user_id', user!.id).eq('status', 'approved'),
      supabase.from('notes').select('id,title,course,description,department,semester,user_id,status,file_name').eq('status', 'approved').limit(200),
    ]);
    setMaterials((m.data || []) as StudyMaterial[]);
    setOwnNotes((own.data || []) as Note[]);
    setPlatformNotes((platform.data || []) as Note[]);
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!selectedNoteId) { toast.error('Bir not seçin.'); return; }
    const allNotes = [...ownNotes, ...platformNotes];
    const note = allNotes.find(n => n.id === selectedNoteId);
    if (!note) return;

    setGenerating(true);
    try {
      const noteContext = `Ders: ${note.course}\nBölüm: ${note.department}\nDönem: ${note.semester}\nBaşlık: ${note.title}\nAçıklama: ${note.description || '-'}\nDosya: ${note.file_name || '-'}`;
      const res = await supabase.functions.invoke('generate-study-material', {
        body: { materialType, noteContext, noteTitle: note.title, course: note.course, count, difficulty },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      const { data: inserted, error } = await supabase.from('study_materials').insert({
        user_id: user!.id,
        source_type: sourceTab,
        source_note_id: note.id,
        material_type: materialType,
        title: `${TYPE_META[materialType].label}: ${note.title}`,
        course: note.course,
        content: res.data.content,
        model: res.data.model,
      }).select().single();
      if (error) throw error;

      toast.success('Materyal hazırlandı.');
      setCreateOpen(false);
      setActiveMaterial(inserted as StudyMaterial);
      void load();
    } catch (e: any) {
      toast.error(e.message || 'Üretim başarısız.');
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
    !search ||
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    (m.course || '').toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: materials.length,
    flashcards: materials.filter(m => m.material_type === 'flashcards').length,
    quiz: materials.filter(m => m.material_type === 'quiz').length,
    summary: materials.filter(m => m.material_type === 'summary').length,
    video: materials.filter(m => m.material_type === 'video').length,
  };

  const notesForSource = sourceTab === 'own' ? ownNotes : platformNotes;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 md:p-8">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="mb-3 gap-1.5"><Sparkles className="h-3 w-3" /> Yeni · Çalışma Stüdyosu</Badge>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
                <GraduationCap className="h-8 w-8 text-primary" /> Çalış
              </h1>
              <p className="text-muted-foreground mt-2 max-w-xl">
                Notlarından AI ile bilgi kartları, quizler, konu özetleri ve video taslakları üret. Sınavlara hazırlanırken zaman kazan.
              </p>
            </div>
            <Button size="lg" onClick={() => setCreateOpen(true)} className="gap-2 shadow-lg shadow-primary/30">
              <Plus className="h-4 w-4" /> Yeni Materyal
            </Button>
          </div>
          {/* Stat strip */}
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

        {/* Material list */}
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
                    <CardDescription className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                      {m.course && <span className="truncate">{m.course}</span>}
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Yeni Çalışma Materyali</DialogTitle>
            <DialogDescription>Bir not seçin, materyal türünü belirleyin. AI sizin için üretsin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Materyal Türü</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.keys(TYPE_META) as MaterialType[]).map(t => {
                  const Icon = TYPE_META[t].icon;
                  return (
                    <button key={t} onClick={() => setMaterialType(t)} className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition ${materialType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}>
                      <Icon className="h-4 w-4" />
                      {TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Kaynak</label>
              <Tabs value={sourceTab} onValueChange={(v: any) => { setSourceTab(v); setSelectedNoteId(''); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="own">Kendi Notlarım ({ownNotes.length})</TabsTrigger>
                  <TabsTrigger value="platform">Platform Notları ({platformNotes.length})</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={selectedNoteId} onValueChange={setSelectedNoteId}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Not seçin..." /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {notesForSource.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">Bu kategoride onaylı not yok.</div>
                  ) : notesForSource.map(n => (
                    <SelectItem key={n.id} value={n.id}>
                      <span className="font-medium">{n.title}</span>
                      <span className="text-muted-foreground ml-2 text-xs">· {n.course}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(materialType === 'flashcards' || materialType === 'quiz') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Adet</label>
                  <Input type="number" min={3} max={20} value={count} onChange={e => setCount(parseInt(e.target.value) || 10)} />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Zorluk</label>
                  <Select value={difficulty} onValueChange={(v: any) => setDifficulty(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Kolay</SelectItem>
                      <SelectItem value="medium">Orta</SelectItem>
                      <SelectItem value="hard">Zor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button onClick={handleGenerate} disabled={generating || !selectedNoteId} className="w-full gap-2" size="lg">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Üretiliyor...</> : <><Sparkles className="h-4 w-4" /> AI ile Üret</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material viewer */}
      <Dialog open={!!activeMaterial} onOpenChange={(o) => !o && setActiveMaterial(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {activeMaterial && <MaterialViewer material={activeMaterial} />}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

// ============= Viewers =============

const MaterialViewer = ({ material }: { material: StudyMaterial }) => {
  switch (material.material_type) {
    case 'flashcards': return <FlashcardViewer material={material} />;
    case 'quiz': return <QuizViewer material={material} />;
    case 'summary': return <SummaryViewer material={material} />;
    case 'video': return <VideoViewer material={material} />;
  }
};

const FlashcardViewer = ({ material }: { material: StudyMaterial }) => {
  const cards: Array<{ front: string; back: string; hint?: string }> = material.content?.cards || [];
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];
  if (!card) return <p className="text-muted-foreground">Kart bulunamadı.</p>;

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> {material.title}</DialogTitle>
        <DialogDescription>Kart {idx + 1} / {cards.length}</DialogDescription>
      </DialogHeader>
      <Progress value={((idx + 1) / cards.length) * 100} />
      <div
        onClick={() => setFlipped(f => !f)}
        className="cursor-pointer min-h-[260px] rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-8 flex flex-col items-center justify-center text-center shadow-xl transition-transform hover:scale-[1.01]"
      >
        <Badge variant="secondary" className="mb-4">{flipped ? 'Cevap' : 'Soru'}</Badge>
        <p className="text-xl font-medium leading-relaxed">{flipped ? card.back : card.front}</p>
        {!flipped && card.hint && <p className="text-xs text-muted-foreground mt-4 italic">İpucu: {card.hint}</p>}
        <p className="text-xs text-muted-foreground mt-6">Çevirmek için tıkla</p>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => { setIdx(i => Math.max(0, i - 1)); setFlipped(false); }} disabled={idx === 0} className="gap-2"><ChevronLeft className="h-4 w-4" /> Önceki</Button>
        <Button variant="ghost" onClick={() => setFlipped(f => !f)} className="gap-2"><RotateCw className="h-4 w-4" /> Çevir</Button>
        <Button onClick={() => { setIdx(i => Math.min(cards.length - 1, i + 1)); setFlipped(false); }} disabled={idx === cards.length - 1} className="gap-2">Sonraki <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};

const QuizViewer = ({ material }: { material: StudyMaterial }) => {
  const questions: Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> = material.content?.questions || [];
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [idx, setIdx] = useState(0);

  if (questions.length === 0) return <p className="text-muted-foreground">Soru bulunamadı.</p>;

  const score = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const q = questions[idx];

  const select = (i: number) => {
    const next = [...answers];
    next[idx] = i;
    setAnswers(next);
  };

  if (submitted) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> Sonuç</DialogTitle>
        </DialogHeader>
        <div className="text-center py-6 rounded-2xl bg-gradient-to-br from-primary/15 to-violet-500/10 border border-primary/20">
          <div className="text-5xl font-bold text-primary">{score}/{questions.length}</div>
          <p className="text-muted-foreground mt-2">Başarı: %{Math.round((score / questions.length) * 100)}</p>
        </div>
        <div className="space-y-3">
          {questions.map((qq, i) => {
            const ok = answers[i] === qq.correctIndex;
            return (
              <Card key={i} className={ok ? 'border-emerald-500/40' : 'border-destructive/40'}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    {ok ? <Check className="h-4 w-4 text-emerald-500 mt-1 shrink-0" /> : <X className="h-4 w-4 text-destructive mt-1 shrink-0" />}
                    <p className="font-medium text-sm">{i + 1}. {qq.question}</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">Doğru: <strong>{qq.options[qq.correctIndex]}</strong></p>
                  <p className="text-xs pl-6 italic">{qq.explanation}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Button onClick={() => { setAnswers([]); setSubmitted(false); setIdx(0); }} className="w-full gap-2"><RotateCw className="h-4 w-4" /> Tekrar Çöz</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> {material.title}</DialogTitle>
        <DialogDescription>Soru {idx + 1} / {questions.length}</DialogDescription>
      </DialogHeader>
      <Progress value={((idx + 1) / questions.length) * 100} />
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="font-medium text-lg">{q.question}</p>
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => select(i)}
                className={`w-full text-left p-3 rounded-lg border transition ${answers[idx] === i ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}
              >
                <span className="font-bold mr-2">{String.fromCharCode(65 + i)})</span> {opt}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} className="gap-2"><ChevronLeft className="h-4 w-4" /> Önceki</Button>
        {idx === questions.length - 1 ? (
          <Button onClick={() => setSubmitted(true)} disabled={answers.length < questions.length} className="gap-2"><Check className="h-4 w-4" /> Bitir & Sonuç</Button>
        ) : (
          <Button onClick={() => setIdx(i => i + 1)} disabled={answers[idx] === undefined} className="gap-2">Sonraki <ChevronRight className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );
};

const SummaryViewer = ({ material }: { material: StudyMaterial }) => {
  const c = material.content || {};
  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileTextIcon className="h-5 w-5 text-primary" /> {material.title}</DialogTitle>
      </DialogHeader>
      {c.overview && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm leading-relaxed">{c.overview}</p>
        </div>
      )}
      {c.infographic?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">İnfografik</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {c.infographic.map((item: any, i: number) => (
              <div key={i} className="rounded-xl border border-border bg-gradient-to-br from-card to-accent/30 p-3">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="font-bold text-lg mt-1">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {c.keyPoints?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Anahtar Noktalar</h3>
          <ul className="space-y-1.5">
            {c.keyPoints.map((p: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm"><span className="text-primary font-bold">•</span> {p}</li>
            ))}
          </ul>
        </div>
      )}
      {c.sections?.length > 0 && (
        <div className="space-y-3">
          {c.sections.map((s: any, i: number) => (
            <Card key={i}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{s.heading}</CardTitle></CardHeader>
              <CardContent className="text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{s.content}</ReactMarkdown>
                {s.takeaway && <p className="mt-2 text-xs italic text-primary">💡 {s.takeaway}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const VideoViewer = ({ material }: { material: StudyMaterial }) => {
  const c = material.content || {};
  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><VideoIcon className="h-5 w-5 text-primary" /> {material.title}</DialogTitle>
      </DialogHeader>
      {c.outline && (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-orange-500/10 to-rose-500/5 p-4">
          <p className="text-sm leading-relaxed">{c.outline}</p>
        </div>
      )}
      {c.scenes?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sahneler</h3>
          <div className="space-y-2">
            {c.scenes.map((s: any, i: number) => (
              <div key={i} className="flex gap-3 rounded-lg border border-border p-3">
                <div className="font-mono text-xs text-primary bg-primary/10 rounded px-2 py-1 h-fit">{s.time}</div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.narration}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {c.suggestedSearches?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">İlgili Video Önerileri</h3>
          <div className="grid gap-2">
            {c.suggestedSearches.map((q: string, i: number) => (
              <a
                key={i}
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent transition text-sm"
              >
                <Search className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1">{q}</span>
                <Badge variant="outline" className="text-[10px]">YouTube</Badge>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Study;
