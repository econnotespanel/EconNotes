import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Flame,
  RotateCw,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  analyzeWeakTopics,
  buildExamStudyPlan,
  loadPlannerConfig,
  reviewSrsCard,
  savePlannerConfig,
  type PlannerConfig,
  type ReviewQuality,
  type SrsCardState,
} from '@/lib/neural/studyPlanner';
import { cn } from '@/lib/utils';
import type { StudyMaterial, StudyProgressRow } from '@/types/study';
import { toast } from 'sonner';

interface NeuralPlannerViewProps {
  materials: StudyMaterial[];
  progress: StudyProgressRow[];
  srsCards: SrsCardState[];
  dueCards: SrsCardState[];
  onSrsUpdated: () => void;
  onOpenMaterial: (mat: StudyMaterial) => void;
  onStartExamSim: () => void;
}

export function NeuralPlannerView({
  materials,
  progress,
  srsCards,
  dueCards,
  onSrsUpdated,
  onOpenMaterial,
  onStartExamSim,
}: NeuralPlannerViewProps) {
  const [cfg, setCfg] = useState<PlannerConfig>(() => loadPlannerConfig());
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const updateCfg = (patch: Partial<PlannerConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    savePlannerConfig(next);
  };

  const weakTopics = useMemo(
    () => analyzeWeakTopics(materials, progress, srsCards),
    [materials, progress, srsCards],
  );

  const schedule = useMemo(
    () =>
      buildExamStudyPlan({
        examDateIso: cfg.examDateIso,
        dailyMinutes: cfg.dailyMinutes,
        materials,
        weakTopics,
        dueCardsCount: dueCards.length,
        completedTaskIds: cfg.completedTaskIds,
      }),
    [cfg, materials, weakTopics, dueCards.length],
  );

  const currentDueCard = dueCards[activeCardIdx] || null;

  const handleGradeDueCard = (q: ReviewQuality) => {
    if (!currentDueCard) return;
    const updated = reviewSrsCard(currentDueCard.id, q);
    setFlipped(false);
    setActiveCardIdx(0);
    onSrsUpdated();
    if (updated) {
      toast.success(`SM-2 planlandı: ${updated.intervalDays} gün sonra tekrar`);
    }
  };

  const toggleTask = (taskId: string) => {
    const exists = cfg.completedTaskIds.includes(taskId);
    updateCfg({
      completedTaskIds: exists
        ? cfg.completedTaskIds.filter((id) => id !== taskId)
        : [...cfg.completedTaskIds, taskId],
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Planner Settings */}
      <div className="neural-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <CalendarClock className="h-5 w-5 text-cyan-500" />
              Akıllı Çalışma Planlayıcı & SM-2 Aralıklı Tekrar
            </h2>
            <p className="text-xs text-muted-foreground">
              Sınav tarihine göre günlük bloklar oluşturur; quiz skorlarından zayıf konularını tespit eder.
            </p>
          </div>
          <Button type="button" size="sm" onClick={onStartExamSim} className="gap-1.5 text-xs">
            <Target className="h-3.5 w-3.5" />
            Sınav Simülasyonunu Başlat
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="planner-exam-date" className="text-xs">
              Hedef Sınav Tarihi
            </Label>
            <Input
              id="planner-exam-date"
              type="date"
              value={cfg.examDateIso}
              onChange={(e) => updateCfg({ examDateIso: e.target.value })}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Günlük Çalışma Süresi: {cfg.dailyMinutes} dk</Label>
            <Slider
              min={20}
              max={180}
              step={10}
              value={[cfg.dailyMinutes]}
              onValueChange={([v]) => updateCfg({ dailyMinutes: v })}
              className="pt-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="planner-goal" className="text-xs">
              Çalışma Hedefi
            </Label>
            <Input
              id="planner-goal"
              value={cfg.targetGoalLabel}
              onChange={(e) => updateCfg({ targetGoalLabel: e.target.value })}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* SM-2 Due Review Runner + Weak Topic Heatmap */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="neural-card flex flex-col justify-between p-5 lg:col-span-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Flame className="h-4 w-4 text-amber-500" />
                Bugünün SM-2 Tekrar Kuyruğu
              </h3>
              <Badge variant={dueCards.length > 0 ? 'default' : 'outline'} className="text-xs">
                {dueCards.length} Kart Bekliyor
              </Badge>
            </div>

            {!currentDueCard ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm font-semibold">Bugünkü tüm tekrarlar tamam!</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {srsCards.length > 0
                    ? `Toplam ${srsCards.length} kartın tekrar tarihleri optimum düzeyde.`
                    : 'Özet veya Flashcard materyali oluşturduğunda kartlar burada otomatik sıralanır.'}
                </p>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFlipped((f) => !f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setFlipped((f) => !f);
                }}
                className="min-h-[180px] cursor-pointer rounded-xl border border-border/70 bg-background/70 p-4 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{currentDueCard.materialTitle}</span>
                  <span className="flex items-center gap-1">
                    <RotateCw className="h-3 w-3" />
                    {flipped ? 'Ön Yüzü Gör' : 'Cevabı Göster'}
                  </span>
                </div>
                <p className="my-4 text-sm font-semibold leading-relaxed">
                  {flipped ? currentDueCard.back : currentDueCard.front}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  Aralık: {currentDueCard.intervalDays} gün · EF: {currentDueCard.easeFactor}
                </span>
              </div>
            )}
          </div>

          {currentDueCard && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleGradeDueCard(1)} className="text-xs">
                Unuttum
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleGradeDueCard(3)} className="text-xs">
                Zor
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => handleGradeDueCard(4)} className="text-xs">
                İyi
              </Button>
              <Button type="button" size="sm" onClick={() => handleGradeDueCard(5)} className="gradient-cta text-xs">
                Çok Kolay
              </Button>
            </div>
          )}
        </div>

        {/* Weak Topic Heatmap */}
        <div className="neural-card space-y-3 p-5 lg:col-span-6">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Zayıf Konu & Ustalık Isı Haritası
          </h3>
          {weakTopics.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Quiz çözdükçe ve kart tekrarladıkça konu başarı haritanız burada oluşur.
            </p>
          ) : (
            <div className="space-y-2.5">
              {weakTopics.slice(0, 6).map((wt) => {
                const targetMat = materials.find((m) => m.id === wt.relatedMaterialId);
                return (
                  <div
                    key={wt.topic}
                    className={cn(
                      'rounded-xl border p-3 text-xs',
                      wt.status === 'critical'
                        ? 'border-destructive/50 bg-destructive/10'
                        : wt.status === 'review'
                        ? 'border-amber-500/40 bg-amber-500/10'
                        : 'border-emerald-500/40 bg-emerald-500/10',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{wt.topic}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          %{wt.avgScorePct} Ustalık
                        </Badge>
                        {targetMat && (
                          <button
                            type="button"
                            onClick={() => onOpenMaterial(targetMat)}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Aç →
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{wt.recommendedAction}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Multi-Day Exam Schedule */}
      <div className="neural-card space-y-3 p-5">
        <h3 className="text-sm font-bold">Sınava Kadar Günlük Çalışma Programı</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schedule.map((day) => (
            <div
              key={day.dateIso}
              className={cn(
                'rounded-xl border p-3.5',
                day.isToday ? 'border-primary/60 bg-primary/5' : 'border-border/60 bg-background/60',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold">{day.dayLabel}</span>
                <Badge variant="outline" className="text-[10px]">
                  {day.totalMinutes} dk
                </Badge>
              </div>
              <div className="space-y-2">
                {day.tasks.map((task) => {
                  const done = cfg.completedTaskIds.includes(task.id);
                  return (
                    <label
                      key={task.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/40 bg-card/70 p-2 text-xs"
                    >
                      <Checkbox
                        checked={done}
                        onCheckedChange={() => toggleTask(task.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-medium', done && 'line-through text-muted-foreground')}>
                          {task.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {task.durationMinutes} dk
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
