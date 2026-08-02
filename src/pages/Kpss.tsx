import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import {
  Target, Sparkles, ListChecks, FileText, Layers, Loader2, Trash2, Play, Check, X,
  ChevronLeft, ChevronRight, Trophy, Lightbulb, AlertTriangle, BookOpen, Percent, Plus,
  SlidersHorizontal, BarChart3, FileDown, Wand2, Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import KpssPerformance, { type AttemptRow } from '@/components/kpss/KpssPerformance';
import { downloadKpssReport } from '@/lib/kpssReport';

type KpssType = 'topics' | 'summary' | 'quiz' | 'flashcards';

interface KpssMaterial {
  id: string;
  user_id: string;
  subject: string;
  topic: string | null;
  material_type: KpssType;
  difficulty: string;
  title: string;
  content: any;
  created_at: string;
}


const SUBJECT_GROUPS: { group: string; subjects: string[] }[] = [
  { group: 'Genel Yetenek', subjects: ['Türkçe', 'Matematik', 'Geometri'] },
  { group: 'Genel Kültür', subjects: ['Tarih', 'Coğrafya', 'Vatandaşlık (Anayasa)', 'Güncel Bilgiler'] },
  { group: 'Eğitim Bilimleri', subjects: ['Gelişim Psikolojisi', 'Öğrenme Psikolojisi', 'Rehberlik', 'Program Geliştirme', 'Öğretim Yöntemleri', 'Ölçme ve Değerlendirme'] },
  { group: 'Alan Bilgisi (A Grubu)', subjects: ['İktisat', 'Maliye', 'Hukuk', 'İşletme', 'Muhasebe', 'İstatistik', 'Uluslararası İlişkiler', 'Kamu Yönetimi', 'Çalışma Ekonomisi', 'Ekonometri'] },
];

const TYPE_META: Record<KpssType, { label: string; icon: any; desc: string; tone: string; tint: string; code: string }> = {
  topics: { label: 'Çıkabilecek Konular', icon: Target, desc: 'Olasılık yüzdeli konu analizi + çalışma planı', tone: 'text-primary', tint: 'bg-primary/10', code: 'TP-01' },
  summary: { label: 'Konu Özeti', icon: FileText, desc: 'Sınav notu, hafıza teknikleri, sık hatalar', tone: 'text-success', tint: 'bg-success/10', code: 'SM-02' },
  quiz: { label: 'Çözümlü Test', icon: ListChecks, desc: 'ÖSYM tarzı 5 şıklı, tam çözümlü sorular', tone: 'text-accent', tint: 'bg-accent/10', code: 'QZ-03' },
  flashcards: { label: 'Bilgi Kartları', icon: Layers, desc: 'Hızlı tekrar için çevrilebilir kartlar', tone: 'text-warning', tint: 'bg-warning/10', code: 'FC-04' },
};

const EXAM_GROUPS = ['KPSS Lisans', 'KPSS Önlisans', 'KPSS Ortaöğretim', 'KPSS A Grubu', 'KPSS Eğitim Bilimleri (ÖABT dahil)'];

const Kpss = () => {
  const { user, profile } = useAuth();

  const [materials, setMaterials] = useState<KpssMaterial[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<KpssType | null>(null);
  const [active, setActive] = useState<KpssMaterial | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupType, setSetupType] = useState<KpssType>('quiz');

  // session settings
  const [examGroup, setExamGroup] = useState(EXAM_GROUPS[0]);
  const [subject, setSubject] = useState('Tarih');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState(10);
  const [focus, setFocus] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | KpssType>('all');

  const load = async () => {
    if (!user) return;
    const [m, a] = await Promise.all([
      supabase.from('kpss_materials').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kpss_attempts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60),
    ]);
    setMaterials((m.data as KpssMaterial[]) || []);
    setAttempts(((a.data as any[]) || []) as AttemptRow[]);
    setLoading(false);
  };


  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const generate = async (type: KpssType) => {
    if (!user) return;
    setGenerating(type);
    try {
      const { data, error } = await supabase.functions.invoke('generate-kpss', {
        body: { type, subject, topic: topic.trim() || undefined, examGroup, difficulty, count, extraFocus: focus.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const title = `${TYPE_META[type].label}: ${subject}${topic.trim() ? ' · ' + topic.trim() : ''}`;
      const { error: insErr } = await supabase.from('kpss_materials').insert({
        user_id: user.id,
        subject,
        topic: topic.trim() || null,
        material_type: type,
        difficulty,
        title,
        content: data.content,
        model: data.model,
      });
      if (insErr) throw insErr;
      toast.success('Materyal hazır.');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Materyal üretilemedi.');
    } finally {
      setGenerating(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Bu materyal silinsin mi?')) return;
    await supabase.from('kpss_materials').delete().eq('id', id);
    toast.success('Silindi.');
    void load();
  };

  const openSetup = (type: KpssType) => {
    setSetupType(type);
    setSetupOpen(true);
  };

  const startSession = async () => {
    setSetupOpen(false);
    await generate(setupType);
  };

  const filtered = materials.filter(m => typeFilter === 'all' || m.material_type === typeFilter);


  const netAvg = useMemo(() => {
    const quizAttempts = attempts.filter(a => a.total_questions > 0);
    if (!quizAttempts.length) return 0;
    const ratio = quizAttempts.reduce((s, a) => s + a.score / a.total_questions, 0) / quizAttempts.length;
    return Math.round(ratio * 100);
  }, [attempts]);

  const stats = [
    { code: 'MAT', label: 'Materyal', value: materials.length, tone: 'text-primary' },
    { code: 'TST', label: 'Test', value: attempts.length, tone: 'text-accent' },
    { code: 'AVG', label: 'Ortalama', value: `${netAvg}%`, tone: 'text-success' },
    { code: 'DRS', label: 'Ders', value: new Set(materials.map(m => m.subject)).size, tone: 'text-warning' },
  ];

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Command band */}
        <div className="hud-panel p-5 md:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(hsl(var(--neon-cyan))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--neon-cyan))_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="hud-bar mt-1 h-14 w-1.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                ÖSYM odaklı · AI çevrimiçi
              </div>
              <h1 className="mt-1.5 flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight md:text-4xl">
                <Target className="h-7 w-7 text-primary" />
                <span className="holo-text">KPSS Çalışma Merkezi</span>
                <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Yeni</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Dersini seç, sınav grubunu belirt. Yapay zeka çıkabilecek konuları olasılık yüzdesiyle çıkarır, konu özeti hazırlar ve ÖSYM tarzı tam çözümlü testler üretir.
              </p>
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(s => (
              <div key={s.code} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-3">
                <div className="hud-scanline" />
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{s.code}</span>
                  <Percent className={`h-3.5 w-3.5 ${s.tone}`} />
                </div>
                <div className="mt-1 flex items-end gap-1.5">
                  <span className="font-display text-2xl font-bold leading-none">{s.value}</span>
                  <span className="text-[11px] text-muted-foreground">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Tabs defaultValue="olustur" className="space-y-5">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="olustur" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Üretim</TabsTrigger>
            <TabsTrigger value="performans" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Performansım</TabsTrigger>
          </TabsList>

          <TabsContent value="olustur" className="space-y-5">
            {/* Active session summary */}
            <div className="hud-panel p-4 md:p-5">
              <div className="relative flex flex-wrap items-center gap-3">
                <div className="hud-bar h-10 w-1.5 shrink-0" aria-hidden="true" />
                <div className="min-w-[180px] flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Aktif oturum</p>
                  <p className="mt-0.5 font-display text-base font-semibold">
                    {subject}{topic.trim() ? ` · ${topic.trim()}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{examGroup}</Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {difficulty === 'easy' ? 'Kolay' : difficulty === 'hard' ? 'Zor' : 'Orta'}
                    </Badge>
                    <Badge variant="outline" className="gap-1 text-[10px]"><Timer className="h-3 w-3" /> {count} soru / kart</Badge>
                  </div>
                </div>
                <Button variant="outline" className="gap-2" onClick={() => setSetupOpen(true)}>
                  <SlidersHorizontal className="h-4 w-4" /> Oturum ayarları
                </Button>
              </div>
            </div>

            {/* Generators */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(Object.keys(TYPE_META) as KpssType[]).map(t => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                const busy = generating === t;
                return (
                  <button
                    key={t}
                    disabled={!!generating}
                    onClick={() => openSetup(t)}
                    className="hud-panel group p-5 text-left transition-transform duration-300 hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <div className="hud-scanline" />
                    <div className="relative">
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <span>{meta.code}</span>
                        <span className={`h-1.5 w-1.5 rounded-full bg-current ${meta.tone}`} />
                      </div>
                      <div className={`mt-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 ${meta.tint} ${meta.tone} transition-transform duration-300 group-hover:scale-110`}>
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <h3 className="mt-3 font-display font-semibold transition-colors group-hover:text-primary">{meta.label}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meta.desc}</p>
                      <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-primary">
                        {busy ? 'Üretiliyor…' : <>Ayarla ve üret <ChevronRight className="h-3 w-3" /></>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Materyal türü filtresi">
              {([['all', 'Tümü'], ...(Object.keys(TYPE_META) as KpssType[]).map(t => [t, TYPE_META[t].label] as const)] as [string, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTypeFilter(val as 'all' | KpssType)}
                  aria-pressed={typeFilter === val}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${typeFilter === val ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Library */}
            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="hud-panel p-12 text-center">
                <BookOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">Henüz KPSS materyali yok. Yukarıdan bir modül seçip üretmeye başla.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map(m => {
                  const meta = TYPE_META[m.material_type];
                  const Icon = meta.icon;
                  return (
                    <div key={m.id} className="hud-panel group flex flex-col p-4 transition-transform duration-300 hover:-translate-y-1">
                      <div className="hud-scanline" />
                      <div className="relative flex items-start justify-between gap-2">
                        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 ${meta.tint} ${meta.tone}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{meta.code}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => void remove(m.id)} aria-label="Materyali sil">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <h3 className="relative mt-3 line-clamp-2 font-display text-base font-semibold">{m.title}</h3>
                      <div className="relative mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{m.subject}</Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {m.difficulty === 'easy' ? 'Kolay' : m.difficulty === 'hard' ? 'Zor' : 'Orta'}
                        </Badge>
                      </div>
                      <div className="relative mt-auto pt-4">
                        <Button variant="secondary" className="w-full gap-2" onClick={() => setActive(m)}>
                          <Play className="h-3.5 w-3.5" /> Aç
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="performans">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-64 rounded-2xl" />
              </div>
            ) : (
              <KpssPerformance attempts={attempts} userName={profile?.full_name} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Session setup */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Oturum ayarları
            </DialogTitle>
            <DialogDescription>
              {TYPE_META[setupType].label} üretilecek. Ders, konu, zorluk ve soru sayısını buradan belirle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sınav grubu</Label>
                <Select value={examGroup} onValueChange={setExamGroup}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXAM_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ders</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECT_GROUPS.map(g => (
                      <div key={g.group}>
                        <div className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{g.group}</div>
                        {g.subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Konu seçimi (opsiyonel)</Label>
                <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Örn. Kurtuluş Savaşı, Temel Haklar" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Zorluk seviyesi</Label>
              <div className="grid grid-cols-3 gap-2">
                {([['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDifficulty(val)}
                    aria-pressed={difficulty === val}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${difficulty === val ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {difficulty === 'easy' ? 'Temel kavram ve tanım ağırlıklı sorular.' : difficulty === 'hard' ? 'Çıkmış soru seviyesinde, yorum ve ayırt etme gerektiren sorular.' : 'ÖSYM ortalamasına yakın dengeli seviye.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Soru / kart sayısı</Label>
                <span className="font-display text-lg font-bold text-primary">{count}</span>
              </div>
              <Slider value={[count]} min={5} max={30} step={1} onValueChange={v => setCount(v[0])} />
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground"><span>5</span><span>30</span></div>
            </div>

            <div className="space-y-1.5">
              <Label>Özel odak (opsiyonel)</Label>
              <Input value={focus} onChange={e => setFocus(e.target.value)} placeholder="Örn. sürekli karıştırdığım kavramlar" />
            </div>

            <Button className="w-full gap-2 gradient-primary border-0 text-primary-foreground" disabled={!!generating} onClick={() => void startSession()}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Oturumu başlat
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={!!active} onOpenChange={o => { if (!o) setActive(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{active?.title}</DialogTitle>
            <DialogDescription>{active?.subject} · {active?.topic || 'Genel'}</DialogDescription>
          </DialogHeader>
          {active && <MaterialViewer material={active} onSaved={load} />}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

/* ------------------------------- Viewer ---------------------------------- */

const MaterialViewer = ({ material, onSaved }: { material: KpssMaterial; onSaved: () => void }) => {
  if (material.material_type === 'topics') return <TopicsView content={material.content} />;
  if (material.material_type === 'summary') return <SummaryView content={material.content} />;
  if (material.material_type === 'flashcards') return <CardsView content={material.content} />;
  return <QuizView material={material} onSaved={onSaved} />;
};

const TopicsView = ({ content }: { content: any }) => (
  <div className="space-y-5">
    <p className="text-sm text-muted-foreground">{content.overview}</p>
    <div className="space-y-3">
      {(content.topics || []).map((t: any, i: number) => (
        <div key={i} className="rounded-2xl border border-border/70 bg-card/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-display font-semibold">{t.name}</h4>
            <Badge variant={t.probability >= 70 ? 'default' : 'secondary'} className="shrink-0">
              %{t.probability} olasılık
            </Badge>
          </div>
          <Progress value={t.probability} className="mt-2 h-1.5" />
          <p className="mt-2 text-sm text-muted-foreground">{t.whyImportant}</p>
          {t.expectedQuestions && <p className="mt-1 text-xs text-primary">Beklenen: {t.expectedQuestions}</p>}
          {t.trap && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t.trap}
            </p>
          )}
          {!!t.subTopics?.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.subTopics.map((s: string, j: number) => <Badge key={j} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>
          )}
        </div>
      ))}
    </div>
    {!!content.studyPlan?.length && (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <h4 className="mb-2 flex items-center gap-2 font-display font-semibold"><ListChecks className="h-4 w-4 text-primary" /> Çalışma planı</h4>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {content.studyPlan.map((s: string, i: number) => <li key={i}>{s}</li>)}
        </ol>
      </div>
    )}
  </div>
);

const SummaryView = ({ content }: { content: any }) => (
  <div className="space-y-5">
    <p className="text-sm text-muted-foreground">{content.overview}</p>
    {!!content.keyPoints?.length && (
      <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <h4 className="mb-2 font-display font-semibold">Anahtar noktalar</h4>
        <ul className="space-y-1.5 text-sm">
          {content.keyPoints.map((k: string, i: number) => (
            <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />{k}</li>
          ))}
        </ul>
      </div>
    )}
    {(content.sections || []).map((s: any, i: number) => (
      <div key={i} className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <h4 className="font-display font-semibold">{s.heading}</h4>
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{s.content}</p>
        {s.examNote && <p className="mt-2 rounded-lg bg-primary/10 p-2 text-xs text-primary">Sınav notu: {s.examNote}</p>}
      </div>
    ))}
    {!!content.mnemonics?.length && (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
        <h4 className="mb-2 flex items-center gap-2 font-display font-semibold"><Lightbulb className="h-4 w-4 text-accent" /> Hafıza teknikleri</h4>
        <ul className="space-y-1 text-sm text-muted-foreground">{content.mnemonics.map((m: string, i: number) => <li key={i}>• {m}</li>)}</ul>
      </div>
    )}
    {!!content.commonMistakes?.length && (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <h4 className="mb-2 flex items-center gap-2 font-display font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" /> Sık yapılan hatalar</h4>
        <ul className="space-y-1 text-sm text-muted-foreground">{content.commonMistakes.map((m: string, i: number) => <li key={i}>• {m}</li>)}</ul>
      </div>
    )}
  </div>
);

const CardsView = ({ content }: { content: any }) => {
  const cards = content.cards || [];
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards.length) return <p className="text-muted-foreground">Kart bulunamadı.</p>;
  const card = cards[i];
  return (
    <div className="space-y-4">
      <button
        onClick={() => setFlipped(f => !f)}
        className="hud-panel flex min-h-48 w-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {flipped ? 'Cevap' : 'Soru'} · {i + 1}/{cards.length}
        </span>
        <p className="font-display text-lg font-semibold">{flipped ? card.back : card.front}</p>
        {!flipped && card.hint && <p className="text-xs text-muted-foreground">İpucu: {card.hint}</p>}
        <span className="text-[11px] text-primary">Çevirmek için tıkla</span>
      </button>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={i === 0} onClick={() => { setI(i - 1); setFlipped(false); }} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Önceki
        </Button>
        <Button variant="outline" size="sm" disabled={i === cards.length - 1} onClick={() => { setI(i + 1); setFlipped(false); }} className="gap-1">
          Sonraki <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const QuizView = ({ material, onSaved }: { material: KpssMaterial; onSaved: () => void }) => {
  const { user, profile } = useAuth();
  const questions: any[] = material.content?.questions || [];
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  const score = questions.reduce((s, q, i) => s + (answers[i] === q.correctIndex ? 1 : 0), 0);
  const answeredCount = Object.keys(answers).length;

  const detailed = () =>
    questions.map((q, i) => ({
      question: q.question,
      options: q.options || [],
      correctIndex: q.correctIndex,
      picked: answers[i] ?? null,
      solution: q.solution || '',
      optionAnalysis: q.optionAnalysis || [],
      topic: q.topic || material.topic || material.subject,
    }));

  const wrongTopics = () => {
    const map = new Map<string, { wrong: number; total: number }>();
    detailed().forEach(q => {
      const k = String(q.topic || 'Genel');
      const cur = map.get(k) || { wrong: 0, total: 0 };
      cur.total += 1;
      if (q.picked == null || q.picked !== q.correctIndex) cur.wrong += 1;
      map.set(k, cur);
    });
    return [...map.entries()]
      .filter(([, v]) => v.wrong > 0)
      .map(([topic, v]) => ({ topic, ...v }))
      .sort((a, b) => b.wrong - a.wrong);
  };

  const exportPdf = () => {
    downloadKpssReport({
      title: material.title,
      subject: material.subject,
      topic: material.topic,
      difficulty: material.difficulty,
      score,
      total: questions.length,
      date: new Date().toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      userName: profile?.full_name,
      questions: detailed(),
      weakTopics: wrongTopics(),
    });
  };

  const finish = async () => {
    setSaving(true);
    setFinished(true);
    if (user) {
      await supabase.from('kpss_attempts').insert({
        user_id: user.id,
        material_id: material.id,
        subject: material.subject,
        topic: material.topic,
        difficulty: material.difficulty,
        score,
        total_questions: questions.length,
        answers: detailed() as any,
      });
      onSaved();
    }
    setSaving(false);
  };

  if (!questions.length) return <p className="text-muted-foreground">Soru bulunamadı.</p>;

  const weak = finished ? wrongTopics() : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Progress value={(answeredCount / questions.length) * 100} className="h-1.5 flex-1" />
        <span className="font-mono text-xs text-muted-foreground">{answeredCount}/{questions.length}</span>
      </div>

      {finished && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-center">
            <Trophy className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="font-display text-xl font-bold">{score} / {questions.length} doğru</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {score / questions.length >= 0.8 ? 'Mükemmel. Bu konuyu kavradın.'
                : score / questions.length >= 0.5 ? 'İyi gidiyorsun. Yanlışların çözümlerini oku.'
                : 'Konuyu tekrar et, çözümler aşağıda açık.'}
            </p>
            <Button variant="secondary" className="mt-3 gap-2" onClick={exportPdf}>
              <FileDown className="h-4 w-4" /> Sonuç raporunu PDF indir
            </Button>
          </div>

          {weak.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warning">
                <Lightbulb className="h-3.5 w-3.5" /> Tekrar etmen gereken konular
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {weak.map(w => (
                  <li key={w.topic}>• <span className="font-medium text-foreground">{w.topic}</span> — {w.wrong}/{w.total} hatalı</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}


      {questions.map((q, i) => {
        const picked = answers[i];
        const show = revealed[i] || finished;
        return (
          <div key={i} className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{i + 1}. {q.question}</p>
              {q.topic && <Badge variant="outline" className="shrink-0 text-[10px]">{q.topic}</Badge>}
            </div>
            <div className="mt-3 space-y-2">
              {(q.options || []).map((opt: string, oi: number) => {
                const isCorrect = oi === q.correctIndex;
                const isPicked = picked === oi;
                const state = show
                  ? isCorrect ? 'border-success bg-success/10 text-foreground'
                    : isPicked ? 'border-destructive bg-destructive/10 text-foreground' : 'border-border'
                  : isPicked ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50';
                return (
                  <button
                    key={oi}
                    disabled={show}
                    onClick={() => setAnswers(a => ({ ...a, [i]: oi }))}
                    className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${state}`}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + oi)})</span>
                    <span className="flex-1">{opt}</span>
                    {show && isCorrect && <Check className="h-4 w-4 shrink-0 text-success" />}
                    {show && isPicked && !isCorrect && <X className="h-4 w-4 shrink-0 text-destructive" />}
                  </button>
                );
              })}
            </div>

            {!show ? (
              <Button variant="ghost" size="sm" className="mt-3 gap-1.5 text-primary" onClick={() => setRevealed(r => ({ ...r, [i]: true }))}>
                <Sparkles className="h-3.5 w-3.5" /> Çözümü göster
              </Button>
            ) : (
              <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Tam çözüm</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{q.solution}</p>
                {!!q.optionAnalysis?.length && (
                  <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
                    {q.optionAnalysis.map((a: string, ai: number) => (
                      <li key={ai}><span className="font-mono">{String.fromCharCode(65 + ai)})</span> {a}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!finished && (
        <Button className="w-full gap-2 gradient-primary border-0 text-primary-foreground" disabled={answeredCount === 0 || saving} onClick={() => void finish()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Testi bitir ve kaydet
        </Button>
      )}
    </div>
  );
};

export default Kpss;
