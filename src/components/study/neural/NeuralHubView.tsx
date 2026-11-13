import { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarCheck2,
  Flame,
  GraduationCap,
  Layers,
  MessageSquareText,
  Sparkles,
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
import type { StudyMaterial, StudyProgressRow } from '@/types/study';
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
}

const TYPE_BADGE: Record<StudyMaterial['material_type'], string> = {
  summary: 'Akademik Özet',
  quiz: 'Deneme Sınavı',
  flashcards: 'Aktif Kart',
  video: 'Video Ders',
};

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
    if (recent.length === 0) {
      return [
        { label: 'Gün 1', pct: 68 },
        { label: 'Gün 2', pct: 74 },
        { label: 'Gün 3', pct: 81 },
      ];
    }
    return recent.map((r, i) => ({
      label: `#${i + 1}`,
      pct: r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0,
    }));
  }, [progress]);

  const criticalTopics = weakTopics.filter((t) => t.status === 'critical');

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <div className="neural-card relative overflow-hidden p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Üniversite Düzeyi Akademik Çalışma Merkezi
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Ders notlarını derin üniversite kaynaklarına dönüştür
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              PDF, slayt veya sözel/sayısal ders notlarını yükle; derin akademik sentez ile ders
              kitabı düzeyinde özet ve etkileşimli video ders çıkar, notlarına anlık sorular sor ve
              vize-final sınavlarına hazırlan.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <Button
                type="button"
                onClick={() => onGoTab('create')}
                className="gradient-cta gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Yeni Materyal Üret
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onGoTab('rag')}
                className="gap-2"
              >
                <MessageSquareText className="h-4 w-4 text-cyan-500" />
                Notlarıma Sor (RAG)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onGoTab('exam')}
                className="gap-2"
              >
                <Timer className="h-4 w-4 text-violet-500" />
                Sınav Simülasyonu
              </Button>
            </div>
          </div>

          {/* Today's Academic Focus Card */}
          <div className="w-full shrink-0 rounded-2xl border border-border/70 bg-background/70 p-4 lg:w-72">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <BookOpen className="h-4 w-4 text-primary" />
                Günün Çalışma Odağı
              </span>
              <Badge variant="outline" className="text-[10px]">
                {dueCards.length > 0 ? `${dueCards.length} Tekrar` : 'Akademik Akış'}
              </Badge>
            </div>
            <p className="truncate text-xs font-medium text-foreground">
              {criticalTopics[0]
                ? `Odak Konu: ${criticalTopics[0].topic}`
                : materials.length > 0
                  ? 'Sınav Odaklı Özet & Pekiştirme'
                  : 'İlk Ders Setini Hazırla'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {criticalTopics[0]
                ? `Başarı oranı %${criticalTopics[0].avgScorePct}. Kavram özeti veya mini quiz ile güçlendirebilirsin.`
                : dueCards.length > 0
                  ? 'Aralıklı tekrar kartların bekliyor; kısa bir pekiştirme oturumu başlatabilirsin.'
                  : 'Ders notlarını ekle; kavram haritaları, karşılaştırma tabloları ve örnek sorular anında oluşsun.'}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onGoTab(dueCards.length > 0 ? 'planner' : 'create')}
              className="mt-3 w-full justify-between px-2 text-xs text-primary hover:bg-primary/10"
            >
              {dueCards.length > 0 ? 'Tekrar Planına Geç' : 'Hemen Özet Çıkar'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Live Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="neural-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Çalışma Setleri</span>
            <Layers className="h-4 w-4 text-cyan-500" />
          </div>
          <p className="mt-2 text-2xl font-bold">{materials.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Özet, Quiz, Kart & Video</p>
        </div>

        <div className="neural-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sınav Başarısı</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold">{avgScore !== null ? `%${avgScore}` : '—'}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {progress.length} tamamlanan oturum
          </p>
        </div>

        <div className="neural-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Bekleyen Tekrar</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold">{dueCards.length}</p>
          <button
            type="button"
            onClick={() => onGoTab('planner')}
            className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            SM-2 Tekrarına Başla →
          </button>
        </div>

        <div className="neural-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Özet & Video</span>
            <GraduationCap className="h-4 w-4 text-violet-500" />
          </div>
          <p className="mt-2 text-2xl font-bold">
            {materials.filter((m) => m.material_type === 'summary' || m.material_type === 'video').length}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            akademik rehber & ders
          </p>
        </div>
      </div>

      {/* Analytics + Today Priorities */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="neural-card p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Öğrenme İvmesi ve Sınav Trendi</h3>
              <p className="text-xs text-muted-foreground">Son quiz ve kart oturumlarının doğruluk seyri</p>
            </div>
            <Badge variant="outline" className="text-[11px]">
              Canlı Telemetri
            </Badge>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="neuralScoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
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
                  stroke="#06b6d4"
                  strokeWidth={2.2}
                  fill="url(#neuralScoreGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neural-card flex flex-col justify-between p-5 lg:col-span-5">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <CalendarCheck2 className="h-4 w-4 text-primary" />
                Bugünün Öncelikli Odakları
              </h3>
              {criticalTopics.length > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {criticalTopics.length} Kritik Konu
                </Badge>
              )}
            </div>

            {weakTopics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Henüz analiz edilecek materyal yok. Bir ders notu yükleyerek başla!
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
            Tam Çalışma Planı & Zayıf Konu Haritası
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Admin Live Lecture Capture */}
      {isAdmin && userId && (
        <NeuralLiveCapture
          userId={userId}
          onSaved={(mat) => onSavedLiveMaterial(mat as unknown as StudyMaterial)}
        />
      )}

      {/* Recent Materials Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <BookOpen className="h-4 w-4 text-primary" />
            Son Çalışma Materyalleri
          </h3>
          {materials.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onGoTab('library')} className="text-xs">
              Tümünü Gör ({materials.length}) →
            </Button>
          )}
        </div>

        {materials.length === 0 ? (
          <div className="neural-card flex flex-col items-center justify-center gap-3 p-8 text-center">
            <GraduationCap className="h-9 w-9 text-primary/70" />
            <div>
              <p className="text-sm font-semibold">Stüdyon Hazır</p>
              <p className="text-xs text-muted-foreground">
                İlk materyalini oluşturarak özet, video ders, quiz veya aktif hatırlama kartı üret.
              </p>
            </div>
            <Button type="button" onClick={() => onGoTab('create')} size="sm" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              İlk Materyali Oluştur
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {materials.slice(0, 6).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenMaterial(m)}
                className="neural-card group flex flex-col justify-between p-4 text-left"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {TYPE_BADGE[m.material_type]}
                    </Badge>
                    {m.material_type === 'video' ? (
                      <Video className="h-3.5 w-3.5 text-cyan-500" />
                    ) : (
                      <Brain className="h-3.5 w-3.5 text-primary/70" />
                    )}
                  </div>
                  <h4 className="line-clamp-2 text-sm font-bold group-hover:text-primary">
                    {m.title}
                  </h4>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {m.course || 'Genel Akademik'}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{m.model || 'EconNotes AI'}</span>
                  <span className="font-semibold text-primary">Aç →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
