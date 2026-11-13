import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Play,
  RotateCcw,
  Timer,
  XCircle,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { QuizQuestion, StudyMaterial } from '@/types/study';
import { toast } from 'sonner';

interface ExamQuestionItem extends QuizQuestion {
  sourceMaterialId: string;
  sourceTitle: string;
}

interface NeuralExamSimViewProps {
  materials: StudyMaterial[];
  onRecordExamProgress: (materialId: string, score: number, total: number) => Promise<void> | void;
  onGoWeakPlanner: () => void;
}

export function NeuralExamSimView({
  materials,
  onRecordExamProgress,
  onGoWeakPlanner,
}: NeuralExamSimViewProps) {
  const availableQuestions = useMemo<ExamQuestionItem[]>(() => {
    const pool: ExamQuestionItem[] = [];
    for (const mat of materials) {
      if (Array.isArray(mat.content?.questions)) {
        for (const q of mat.content.questions) {
          if (q.type !== 'short_answer' && Array.isArray(q.options) && q.options.length > 0) {
            pool.push({
              ...q,
              topic: q.topic || mat.course || mat.title,
              sourceMaterialId: mat.id,
              sourceTitle: mat.title,
            });
          }
        }
      }
      if (Array.isArray(mat.content?.sections)) {
        for (const sec of mat.content.sections) {
          const cp = sec.checkpointQuestion;
          if (cp && cp.options?.length > 1) {
            pool.push({
              type: 'multiple_choice',
              question: cp.question,
              options: cp.options,
              correctIndex: cp.correctIndex,
              explanation: cp.explanation || '',
              topic: mat.course || sec.heading,
              difficulty: 'medium',
              sourceMaterialId: mat.id,
              sourceTitle: mat.title,
            });
          }
        }
      }
    }
    return pool;
  }, [materials]);

  const materialOptions = useMemo(() => {
    const ids = new Set(availableQuestions.map((q) => q.sourceMaterialId));
    return materials.filter((m) => ids.has(m.id));
  }, [materials, availableQuestions]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [questionLimit, setQuestionLimit] = useState(10);
  const [minutesLimit, setMinutesLimit] = useState(15);

  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [examQuestions, setExamQuestions] = useState<ExamQuestionItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [remainingSec, setRemainingSec] = useState(0);

  const finalizeExam = async () => {
    setRunning(false);
    setSubmitted(true);
    let correct = 0;
    const byMaterial = new Map<string, { score: number; total: number }>();
    examQuestions.forEach((q, idx) => {
      const ok = answers[idx] === q.correctIndex;
      if (ok) correct += 1;
      const cur = byMaterial.get(q.sourceMaterialId) || { score: 0, total: 0 };
      cur.total += 1;
      if (ok) cur.score += 1;
      byMaterial.set(q.sourceMaterialId, cur);
    });

    const primaryId = examQuestions[0]?.sourceMaterialId;
    if (primaryId) {
      await onRecordExamProgress(primaryId, correct, examQuestions.length);
    }
    toast.success(`Sınav Simülasyonu tamamlandı: ${correct}/${examQuestions.length}`);
  };

  useEffect(() => {
    if (!running || remainingSec <= 0) return;
    const t = window.setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) {
          void finalizeExam();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remainingSec]);

  const handleStart = () => {
    const filteredPool =
      selectedIds.length > 0
        ? availableQuestions.filter((q) => selectedIds.includes(q.sourceMaterialId))
        : availableQuestions;

    if (filteredPool.length === 0) {
      toast.error('Sınav için en az 1 soru içeren özet veya quiz materyali gerekir.');
      return;
    }

    const shuffled = [...filteredPool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(questionLimit, shuffled.length));
    setExamQuestions(chosen);
    setAnswers({});
    setFlagged({});
    setCursor(0);
    setSubmitted(false);
    setRemainingSec(minutesLimit * 60);
    setRunning(true);
  };

  if (!running && !submitted) {
    return (
      <div className="neural-card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Timer className="h-5 w-5 text-violet-500" />
              Zamanlı Karma Sınav Simülatörü
            </h2>
            <p className="text-xs text-muted-foreground">
              Kütüphanendeki quizlerden ve özet ara kontrol sorularından gerçek vize/final süreli karma sınav oluşturur.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Havuzda {availableQuestions.length} Soru Hazır
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-4">
            <Label className="text-xs font-bold">
              Soru Sayısı: {Math.min(questionLimit, Math.max(1, availableQuestions.length))}
            </Label>
            <Slider
              min={3}
              max={25}
              step={1}
              value={[questionLimit]}
              onValueChange={([v]) => setQuestionLimit(v)}
            />
          </div>
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-4">
            <Label className="text-xs font-bold">Süre Sınırı: {minutesLimit} Dakika</Label>
            <Slider
              min={3}
              max={60}
              step={1}
              value={[minutesLimit]}
              onValueChange={([v]) => setMinutesLimit(v)}
            />
          </div>
        </div>

        {materialOptions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-bold">Kaynak Dersler (Boş bırakılırsa tümü dahil edilir)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {materialOptions.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 p-2.5 text-xs"
                >
                  <Checkbox
                    checked={selectedIds.includes(m.id)}
                    onCheckedChange={(v) =>
                      setSelectedIds((prev) =>
                        v ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <span className="truncate font-medium">{m.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Button
          type="button"
          disabled={availableQuestions.length === 0}
          onClick={handleStart}
          className="gradient-cta h-11 gap-2 px-6 text-sm font-semibold"
        >
          <Play className="h-4 w-4" />
          Sınav Simülasyonunu Başlat
        </Button>
      </div>
    );
  }

  if (submitted) {
    let correct = 0;
    const topicBreakdown = new Map<string, { ok: number; total: number }>();
    examQuestions.forEach((q, idx) => {
      const ok = answers[idx] === q.correctIndex;
      if (ok) correct += 1;
      const t = q.topic || 'Genel';
      const cur = topicBreakdown.get(t) || { ok: 0, total: 0 };
      cur.total += 1;
      if (ok) cur.ok += 1;
      topicBreakdown.set(t, cur);
    });
    const pct = Math.round((correct / Math.max(1, examQuestions.length)) * 100);

    return (
      <div className="space-y-4">
        <div className="neural-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <Badge className="mb-2 bg-primary text-xs">Sınav Raporu</Badge>
            <h2 className="text-2xl font-extrabold">
              Başarı Puanı: %{pct} ({correct} / {examQuestions.length})
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sonuçlar Zayıf Konu Isı Haritanıza işlendi.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSubmitted(false)} className="gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              Yeni Sınav Kur
            </Button>
            <Button type="button" size="sm" onClick={onGoWeakPlanner} className="text-xs">
              Zayıf Konu Planını Aç →
            </Button>
          </div>
        </div>

        <div className="neural-card space-y-2.5 p-5">
          <h3 className="text-sm font-bold">Konu Bazlı Performans Dökümü</h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Array.from(topicBreakdown.entries()).map(([topic, stat]) => {
              const tPct = Math.round((stat.ok / stat.total) * 100);
              return (
                <div key={topic} className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>{topic}</span>
                    <span className={tPct < 60 ? 'text-destructive' : 'text-emerald-500'}>
                      %{tPct} ({stat.ok}/{stat.total})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          {examQuestions.map((q, idx) => {
            const chosen = answers[idx];
            const ok = chosen === q.correctIndex;
            return (
              <div key={idx} className="neural-card space-y-2 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Soru {idx + 1} · {q.topic}</span>
                  {ok ? (
                    <Badge className="gap-1 bg-emerald-600 text-[10px] text-white">
                      <CheckCircle2 className="h-3 w-3" /> Doğru
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <XCircle className="h-3 w-3" /> Hatalı
                    </Badge>
                  )}
                </div>
                <AcademicMarkdown content={q.question} className="text-xs font-medium" />
                {!ok && q.options && q.correctIndex !== undefined && (
                  <p className="text-emerald-600 dark:text-emerald-300">
                    Doğru Şık: {q.options[q.correctIndex]}
                  </p>
                )}
                {q.explanation && <p className="text-muted-foreground">{q.explanation}</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const current = examQuestions[cursor];
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  return (
    <div className="space-y-4">
      <div className="neural-card flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            Soru {cursor + 1} / {examQuestions.length}
          </Badge>
          <span className="flex items-center gap-1 font-mono text-sm font-bold text-amber-500">
            <Clock className="h-4 w-4" />
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFlagged((p) => ({ ...p, [cursor]: !p[cursor] }))}
            className="gap-1.5 text-xs"
          >
            <Flag className={cn('h-3.5 w-3.5', flagged[cursor] && 'fill-amber-500 text-amber-500')} />
            İşaretle
          </Button>
          <Button type="button" size="sm" onClick={() => void finalizeExam()} className="gradient-cta gap-1.5 text-xs">
            <Award className="h-3.5 w-3.5" />
            Sınavı Bitir
          </Button>
        </div>
      </div>

      <div className="neural-card space-y-4 p-5">
        <AcademicMarkdown content={current.question} className="text-sm font-semibold sm:text-base" />
        <div className="space-y-2">
          {(current.options || []).map((opt, oi) => (
            <button
              key={oi}
              type="button"
              onClick={() => setAnswers((p) => ({ ...p, [cursor]: oi }))}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left text-xs sm:text-sm',
                answers[cursor] === oi
                  ? 'border-primary bg-primary/15 font-semibold'
                  : 'border-border/60 bg-background/60 hover:bg-muted',
              )}
            >
              <span className="font-bold">{String.fromCharCode(65 + oi)}.</span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cursor === 0}
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            className="text-xs"
          >
            ← Önceki
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cursor >= examQuestions.length - 1}
            onClick={() => setCursor((c) => Math.min(examQuestions.length - 1, c + 1))}
            className="text-xs"
          >
            Sonraki →
          </Button>
        </div>
      </div>
    </div>
  );
}
