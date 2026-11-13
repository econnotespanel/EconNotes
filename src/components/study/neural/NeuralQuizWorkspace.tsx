import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  GraduationCap,
  HelpCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { routedGradeOpenEnded } from '@/lib/neural/engineRouter';
import { cn } from '@/lib/utils';
import type { OpenEndedGradeResult, QuizQuestion, StudyMaterial } from '@/types/study';
import { toast } from 'sonner';

interface NeuralQuizWorkspaceProps {
  material: StudyMaterial;
  onRecordProgress: (score: number, total: number) => Promise<void> | void;
  onAskCoach: (prompt: string) => void;
}

export function NeuralQuizWorkspace({
  material,
  onRecordProgress,
  onAskCoach,
}: NeuralQuizWorkspaceProps) {
  const questions: QuizQuestion[] = useMemo(
    () => (Array.isArray(material.content?.questions) ? material.content.questions : []),
    [material.content],
  );

  const [mode, setMode] = useState<'study' | 'exam'>('study');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedMc, setSelectedMc] = useState<Record<number, number>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<number, string>>({});
  const [openGrades, setOpenGrades] = useState<Record<number, OpenEndedGradeResult>>({});
  const [gradingIdx, setGradingIdx] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setCurrentIdx(0);
    setSelectedMc({});
    setOpenAnswers({});
    setOpenGrades({});
    setFinished(false);
    setElapsedSec(0);
  }, [material.id]);

  useEffect(() => {
    if (finished || questions.length === 0) return;
    const t = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [finished, questions.length]);

  if (questions.length === 0) {
    return (
      <div className="neural-card p-8 text-center text-sm text-muted-foreground">
        Bu materyalde henüz soru bulunmuyor.
      </div>
    );
  }

  const q = questions[currentIdx];
  const isMc = q.type !== 'short_answer' && Array.isArray(q.options) && q.options.length > 0;
  const chosenOption = selectedMc[currentIdx];
  const openText = openAnswers[currentIdx] || '';
  const openGrade = openGrades[currentIdx];
  const showInstantFeedback =
    finished || (mode === 'study' && (isMc ? chosenOption !== undefined : Boolean(openGrade)));

  const computeTotalCorrect = () => {
    let score = 0;
    questions.forEach((item, idx) => {
      if (item.type !== 'short_answer' && Array.isArray(item.options) && item.options.length > 0) {
        if (selectedMc[idx] === item.correctIndex) score += 1;
      } else if ((openGrades[idx]?.score ?? 0) >= 60) {
        score += 1;
      }
    });
    return score;
  };

  const handleGradeOpen = async (idx: number) => {
    const target = questions[idx];
    const ans = (openAnswers[idx] || '').trim();
    if (ans.length < 8) {
      toast.error('Puanlama için lütfen biraz daha açıklayıcı bir cevap yazın.');
      return;
    }
    setGradingIdx(idx);
    try {
      const res = await routedGradeOpenEnded({
        course: material.course,
        topic: target.topic,
        question: target.question,
        rubricAnswer: target.sampleAnswer || target.explanation || '',
        studentAnswer: ans,
      });
      setOpenGrades((prev) => ({ ...prev, [idx]: res }));
    } finally {
      setGradingIdx(null);
    }
  };

  const handleFinish = async () => {
    setFinished(true);
    const totalScore = computeTotalCorrect();
    await onRecordProgress(totalScore, questions.length);
  };

  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const answeredCount = questions.filter((item, idx) =>
    item.type !== 'short_answer' && Array.isArray(item.options) && item.options.length > 0
      ? selectedMc[idx] !== undefined
      : Boolean(openGrades[idx]) || (openAnswers[idx] || '').trim().length > 0,
  ).length;

  return (
    <div className="space-y-4">
      {/* Top Quiz HUD */}
      <div className="neural-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <GraduationCap className="h-3.5 w-3.5 text-primary" />
            Soru {currentIdx + 1} / {questions.length}
          </Badge>
          {q.topic && (
            <Badge variant="secondary" className="text-xs">
              {q.topic}
            </Badge>
          )}
          {q.bloomLevel && (
            <Badge variant="outline" className="text-[11px] text-cyan-500">
              {q.bloomLevel}
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {timeStr}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border/60 bg-background/60 p-0.5">
            <button
              type="button"
              onClick={() => setMode('study')}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium',
                mode === 'study' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              Öğrenme Modu
            </button>
            <button
              type="button"
              onClick={() => setMode('exam')}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium',
                mode === 'exam' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              Sınav Modu
            </button>
          </div>
          {finished ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFinished(false);
                setSelectedMc({});
                setOpenAnswers({});
                setOpenGrades({});
                setCurrentIdx(0);
                setElapsedSec(0);
              }}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Yeniden Çöz
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleFinish()}
              className="gradient-cta gap-1.5 text-xs"
            >
              <Award className="h-3.5 w-3.5" />
              Sınavı Bitir & Kaydet
            </Button>
          )}
        </div>
      </div>

      {/* Question Navigator Strip */}
      <div className="neural-card p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>İlerleme ({answeredCount}/{questions.length} yanıtlandı)</span>
          <span>%{Math.round((answeredCount / questions.length) * 100)}</span>
        </div>
        <Progress value={Math.round((answeredCount / questions.length) * 100)} className="mb-3 h-1.5" />
        <div className="flex flex-wrap gap-1.5">
          {questions.map((item, idx) => {
            const isItemMc =
              item.type !== 'short_answer' && Array.isArray(item.options) && item.options.length > 0;
            const answered = isItemMc ? selectedMc[idx] !== undefined : Boolean(openGrades[idx]);
            const isCorrect =
              finished && isItemMc && selectedMc[idx] === item.correctIndex;
            const isWrong =
              finished && isItemMc && selectedMc[idx] !== undefined && selectedMc[idx] !== item.correctIndex;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={cn(
                  'h-7 min-w-[28px] rounded-lg border px-2 text-xs font-semibold transition-colors',
                  currentIdx === idx
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isCorrect
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : isWrong
                    ? 'border-destructive/50 bg-destructive/15 text-destructive'
                    : answered
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300'
                    : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted',
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Question Stage */}
      <div className="neural-card space-y-4 p-5 sm:p-6">
        <div className="prose-sm max-w-none">
          <AcademicMarkdown content={q.question} className="text-sm font-semibold leading-relaxed sm:text-base" />
        </div>

        {isMc && q.options ? (
          <div className="space-y-2.5">
            {q.options.map((opt, oIdx) => {
              const isSelected = chosenOption === oIdx;
              const isRight = oIdx === q.correctIndex;
              const reveal = showInstantFeedback;
              return (
                <button
                  key={oIdx}
                  type="button"
                  disabled={finished}
                  onClick={() => setSelectedMc((prev) => ({ ...prev, [currentIdx]: oIdx }))}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left text-xs transition-all sm:text-sm',
                    reveal && isRight
                      ? 'border-emerald-500/60 bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300'
                      : reveal && isSelected && !isRight
                      ? 'border-destructive/60 bg-destructive/15 text-destructive'
                      : isSelected
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-border/60 bg-background/60 hover:border-primary/40 hover:bg-muted/60',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-current/25 text-xs font-bold">
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <span>{opt}</span>
                  </span>
                  {reveal && isRight && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {reveal && isSelected && !isRight && (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              rows={5}
              placeholder="Akademik cevabınızı yazın..."
              value={openText}
              onChange={(e) => setOpenAnswers((prev) => ({ ...prev, [currentIdx]: e.target.value }))}
              className="text-xs sm:text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                disabled={gradingIdx === currentIdx}
                onClick={() => void handleGradeOpen(currentIdx)}
                className="gap-1.5 text-xs"
              >
                {gradingIdx === currentIdx ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Cevabımı AI ile Puanla
              </Button>
              {openGrade && (
                <Badge variant="default" className="text-xs font-bold">
                  {openGrade.score} / 100 Puan · {openGrade.verdict}
                </Badge>
              )}
            </div>

            {openGrade && (
              <div className="space-y-2 rounded-xl border border-primary/35 bg-primary/5 p-4 text-xs">
                <p className="font-semibold text-foreground">{openGrade.feedback}</p>
                {openGrade.strengths.length > 0 && (
                  <p className="text-emerald-600 dark:text-emerald-300">
                    Güçlü Yönler: {openGrade.strengths.join(' · ')}
                  </p>
                )}
                {openGrade.missingConcepts.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-300">
                    Eksik Kavramlar: {openGrade.missingConcepts.join(' · ')}
                  </p>
                )}
                {openGrade.improvedAnswer && (
                  <div className="rounded-lg border border-border/60 bg-background/70 p-2.5 text-muted-foreground">
                    <span className="font-semibold text-foreground">Örnek Tam Cevap: </span>
                    {openGrade.improvedAnswer}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Instant Explanation + Coach Action */}
        {showInstantFeedback && q.explanation && (
          <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3.5 text-xs">
            <p className="mb-1 font-bold text-cyan-600 dark:text-cyan-300">Akademik Çözüm & Açıklama</p>
            <AcademicMarkdown content={q.explanation} className="text-xs leading-relaxed" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="text-xs"
            >
              ← Önceki
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentIdx >= questions.length - 1}
              onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
              className="text-xs"
            >
              Sonraki Soru →
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onAskCoach(
                `"${q.question}" sorusunu adım adım analiz edip sınav tuzağını açıklar mısın?`,
              )
            }
            className="gap-1.5 text-xs text-primary"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Bu Soruyu Koça Sor
          </Button>
        </div>
      </div>

      {/* Results Banner */}
      {finished && (
        <div className="neural-card border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
          <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-300">
            Sınav Tamamlandı: {computeTotalCorrect()} / {questions.length} Doğru
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Skorunuz Çalışma Stüdyosu ilerlemenize ve Zayıf Konu Isı Haritasına işlendi.
          </p>
        </div>
      )}
    </div>
  );
}
