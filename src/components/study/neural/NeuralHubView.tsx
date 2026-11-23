import { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  Compass,
  FileText,
  Flame,
  GraduationCap,
  Layers,
  MessageSquareText,
  Plus,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Video,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NeuralEngineState } from '@/lib/neural/neuralEngine';
import type { SrsCardState, TopicMasteryMetric } from '@/lib/neural/studyPlanner';
import type { ExamStudyMode, MaterialType, StudyMaterial, StudyProgressRow } from '@/types/study';
import type { NeuralTabId } from './NeuralCommandShell';
import NeuralLiveCapture from './NeuralLiveCapture';

interface NeuralHubViewProps {
  materials: StudyMaterial[];
  progress: StudyProgressRow[];
  dueCards: SrsCardState[];
  weakTopics: TopicMasteryMetric[];
  engine: NeuralEngineState;
  isAdmin: boolean;
  userId?: string;
  onSavedLiveMaterial: (mat: StudyMaterial) => void;
  onGoTab: (tab: NeuralTabId) => void;
  onOpenMaterial: (mat: StudyMaterial) => void;
  onQuickCreateType?: (type: MaterialType) => void;
  onQuickExamPreset?: (mode: ExamStudyMode) => void;
}

const TYPE_BADGE: Record<StudyMaterial['material_type'], string> = {
  summary: 'Ders Özeti',
  quiz: 'Deneme Sınavı',
  flashcards: 'Çalışma Kartları',
  video: 'Videolu Özet',
};

const QUICK_CREATE_FORMATS: Array<{
  type: MaterialType;
  title: string;
  desc: string;
  icon: typeof FileText;
  iconColor: string;
  bgColor: string;
}> = [
  {
    type: 'summary',
    title: 'Ayrıntılı Ders Özeti',
    desc: 'Kalın notları tam kapsamla özetler, "Hangi Konulara Bakmalıyım?" haritası çıkarır',
    icon: FileText,
    iconColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    type: 'video',
    title: 'Videolu Özet',
    desc: 'Yalnızca notuna sadık, net okunaklı slaytlar ve sesli anlatımla video ders',
    icon: Video,
    iconColor: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    type: 'quiz',
    title: 'Deneme Sınavı',
    desc: 'Çoktan seçmeli ve klasik sorularla kendini test et',
    icon: Sparkles,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    type: 'flashcards',
    title: 'Çalışma Kartları',
    desc: 'Kavram, tanım ve önemli ayrımlar için hızlı tekrar kartları',
    icon: Layers,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  },
];

export function NeuralHubView({
  materials,
  progress,
  dueCards,
  weakTopics,
  isAdmin,
  userId,
  onSavedLiveMaterial,
  onGoTab,
  onOpenMaterial,
  onQuickCreateType,
  onQuickExamPreset,
}: NeuralHubViewProps) {
  const avgScore = useMemo(() => {
    if (progress.length === 0) return null;
    const sum = progress.reduce(
      (acc, r) => acc + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0),
      0,
    );
    return Math.round(sum / progress.length);
  }, [progress]);

  const chartData = useMemo(() => {
    const recent = [...progress].slice(0, 8).reverse();
    return recent.map((r, i) => ({
      label: `${i + 1}. Test`,
      pct: r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0,
    }));
  }, [progress]);

  const criticalTopics = weakTopics.filter((t) => t.status === 'critical');

  const handleSelectFormat = (type: MaterialType) => {
    if (onQuickCreateType) {
      onQuickCreateType(type);
    } else {
      onGoTab('create');
    }
  };

  return (
    <div className="space-y-5">
      {/* Hızlı Başlangıç: Tek Tıkla Format Seçimi */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl text-foreground">
              Bugün nasıl çalışmak istersin?
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onGoTab('rag')}
              className="gap-1.5 text-xs"
            >
              <MessageSquareText className="h-3.5 w-3.5 text-primary" />
              Not / Slayt Yükle &amp; Soru Sor
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onGoTab('exam')}
              className="gap-1.5 text-xs"
            >
              <Timer className="h-3.5 w-3.5 text-violet-500" />
              Sınav Simülatörü
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_CREATE_FORMATS.map((fmt) => {
            const Icon = fmt.icon;
            return (
              <button
                key={fmt.type}
                type="button"
                onClick={() => handleSelectFormat(fmt.type)}
                className="group flex flex-col justify-between rounded-xl border border-border/70 bg-background/60 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${fmt.bgColor} ${fmt.iconColor}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {fmt.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {fmt.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sınav Dönemi Verimli Çalışma Stili (4 Adımda Vize & Final) */}
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.05] via-card to-violet-500/[0.04] p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="gap-1 bg-primary text-primary-foreground text-[10px]">
                <Target className="h-3 w-3" />
                Vize &amp; Final Çalışma Stili
              </Badge>
              <span className="text-[11px] font-medium text-muted-foreground">
                4 Adımlı Bilimsel Sınav Akışı
              </span>
            </div>
            <h3 className="mt-1 text-sm sm:text-base font-bold text-foreground">
              Sınav Haftasında En Yüksek Verimi Al
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => (onQuickExamPreset ? onQuickExamPreset('cram_24h') : handleSelectFormat('summary'))}
              className="h-8 gap-1.5 border-rose-500/35 bg-rose-500/5 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-500/15"
            >
              <Flame className="h-3.5 w-3.5" />
              Son 24 Saat Acil Özet
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => (onQuickExamPreset ? onQuickExamPreset('large_note') : handleSelectFormat('summary'))}
              className="h-8 gap-1.5 border-primary/35 bg-primary/5 text-xs text-primary hover:bg-primary/15"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Kalın Not Tam Analiz
            </Button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: '01',
              title: 'Tüm Notları Yükle',
              desc: 'Kalın PDF veya çoklu slaytları tek seferde birleştirip ayrıntılı özet çıkar.',
              actionLabel: 'Özet Oluştur',
              onClick: () => (onQuickExamPreset ? onQuickExamPreset('large_note') : handleSelectFormat('summary')),
            },
            {
              step: '02',
              title: 'Hangi Konulara Bakmalıyım?',
              desc: 'Özet içindeki Sınav Öncelik Haritasıyla 🔴 Kesin Bak konularından başla.',
              actionLabel: materials.some((m) => m.material_type === 'summary') ? 'Son Özete Git' : 'Özetle Başla',
              onClick: () => {
                const latestSummary = materials.find((m) => m.material_type === 'summary');
                if (latestSummary) onOpenMaterial(latestSummary);
                else handleSelectFormat('summary');
              },
            },
            {
              step: '03',
              title: 'Aktif Tekrar (SM-2)',
              desc: 'Bilgi kartlarıyla unutma eğrisini kır; eksik kaldığın konuları hafızaya kilitle.',
              actionLabel: dueCards.length > 0 ? `${dueCards.length} Kartı Tekrar Et` : 'Tekrar Planı',
              onClick: () => onGoTab('planner'),
            },
            {
              step: '04',
              title: 'Süreli Sınav Provası',
              desc: 'Gerçek sınav simülatöründe zamanla yarışarak zayıf noktalarını gör.',
              actionLabel: 'Simülatöre Gir',
              onClick: () => onGoTab('exam'),
            },
          ].map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={s.onClick}
              className="group flex flex-col justify-between rounded-xl border border-border/60 bg-background/70 p-3.5 text-left transition-all hover:border-primary/40 hover:bg-card"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-[11px] font-extrabold text-primary">
                    {s.step}
                  </span>
                  <Compass className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-xs font-bold text-foreground">{s.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
              <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                {s.actionLabel}
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Son Çalışma Materyallerim (En çok kullanılan alan doğrudan üstte) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            Hazırladığım Materyaller ({materials.length})
          </h3>
          {materials.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onGoTab('library')}
              className="text-xs"
            >
              Tümünü Gör →
            </Button>
          )}
        </div>

        {materials.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <GraduationCap className="h-9 w-9 text-primary/70" />
            <div>
              <p className="text-sm font-semibold text-foreground">Henüz bir çalışma seti oluşturmadın</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                PDF, slayt veya ders notunu seçerek özet, videolu anlatım veya deneme sınavı oluşturabilirsin.
              </p>
            </div>
            <Button type="button" onClick={() => onGoTab('create')} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              İlk Çalışma Setini Oluştur
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {materials.slice(0, 6).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenMaterial(m)}
                className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {TYPE_BADGE[m.material_type]}
                    </Badge>
                    {m.material_type === 'video' ? (
                      <Video className="h-4 w-4 text-violet-500" />
                    ) : m.material_type === 'quiz' ? (
                      <Sparkles className="h-4 w-4 text-amber-500" />
                    ) : m.material_type === 'flashcards' ? (
                      <Layers className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <h4 className="line-clamp-2 text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {m.title}
                  </h4>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {m.course || 'Genel Ders Notu'}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                  <span>{new Date(m.created_at).toLocaleDateString('tr-TR')}</span>
                  <span className="font-semibold text-primary">Aç →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gerçek Çalışma İstatistikleri & Tekrar Odağı */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Toplam Materyal</span>
            <Layers className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{materials.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Özet, Video, Sınav & Kart</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Ortalama Başarı</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {avgScore !== null ? `%${avgScore}` : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {progress.length > 0 ? `${progress.length} test tamamlandı` : 'Henüz test çözülmedi'}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tekrar Kartları</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{dueCards.length}</p>
          <button
            type="button"
            onClick={() => onGoTab('planner')}
            className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            Tekrar Planını Aç →
          </button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Videolu & Yazılı Özet</span>
            <GraduationCap className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {materials.filter((m) => m.material_type === 'summary' || m.material_type === 'video').length}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">konu anlatımı</p>
        </div>
      </div>

      {/* Yalnızca gerçek sınav geçmişi veya tekrar konusu varsa gösterilen ilerleme bölümü */}
      {(chartData.length > 0 || weakTopics.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="rounded-2xl border border-border/70 bg-card p-5 lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Son Deneme Sınavı Sonuçların</h3>
                <p className="text-xs text-muted-foreground">Çözdüğün testlerdeki doğruluk yüzdesi</p>
              </div>
            </div>
            {chartData.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Henüz tamamlanan bir deneme sınavı yok. Bir test çözdüğünde gelişim grafiğin burada görünecek.
              </div>
            ) : (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="neuralScoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="pct"
                      stroke="#3b82f6"
                      strokeWidth={2.2}
                      fill="url(#neuralScoreGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card flex flex-col justify-between p-5 lg:col-span-5">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <CalendarCheck2 className="h-4 w-4 text-primary" />
                  Tekrar Edilmesi Önerilen Konular
                </h3>
                {criticalTopics.length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {criticalTopics.length} Öncelikli
                  </Badge>
                )}
              </div>

              {weakTopics.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Tüm konularda dengeli ilerliyorsun.
                </div>
              ) : (
                <div className="space-y-2">
                  {weakTopics.slice(0, 3).map((wt) => (
                    <div
                      key={wt.topic}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-semibold">{wt.topic}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{wt.recommendedAction}</p>
                      </div>
                      <Badge
                        variant={
                          wt.status === 'critical'
                            ? 'destructive'
                            : wt.status === 'review'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="shrink-0 text-[10px]"
                      >
                        %{wt.avgScorePct}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onGoTab('planner')}
              className="mt-4 w-full justify-between text-xs"
            >
              Çalışma Planını Gör
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Admin Live Lecture Capture */}
      {isAdmin && userId && (
        <NeuralLiveCapture
          userId={userId}
          onSaved={(mat) => onSavedLiveMaterial(mat as unknown as StudyMaterial)}
        />
      )}
    </div>
  );
}
