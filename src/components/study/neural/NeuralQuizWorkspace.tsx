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
  const [onlyWrongFilter, setOnlyWrongFilter] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setCurrentIdx(0);
    setSelectedMc({});
    setOpenAnswers({});
    setOpenGrades({});
    setFinished(false);
    setOnlyWrongFilter(false);
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
          {q.difficulty && (
            <Badge
              variant="outline"
              className={cn(
                'text-[11px]',
                q.difficulty === 'easy'
                  ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                  : q.difficulty === 'hard'
                  ? 'border-rose-500/40 text-rose-600 dark:text-rose-400'
                  : 'border-amber-500/40 text-amber-600 dark:text-amber-400',
              )}
            >
              {q.difficulty === 'easy' ? 'Kolay' : q.difficulty === 'hard' ? 'Zor' : 'Orta'}
            </Badge>
          )}
          {q.bloomLevel && (
            <Badge variant="outline" className="text-[11px] text-cyan-500">
              {q.bloomLevel}
            </Badge>
          )}
          {(q.sourceSection || q.sourcePage) && (
            <Badge variant="outline" className="max-w-[220px] truncate text-[11px] text-muted-foreground">
              {q.sourceSection || 'Kaynak'}
              {q.sourcePage ? ` · ${q.sourcePage}` : ''}
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

        {/* Instant Explanation + Wrong Option Breakdown + Coach Action */}
        {showInstantFeedback && q.explanation && (
          <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3.5 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-cyan-600 dark:text-cyan-300">Akademik Çözüm &amp; Açıklama</p>
              {(q.sourceSection || q.sourcePage) && (
                <span className="text-[11px] text-muted-foreground">
                  Kaynak: {q.sourceSection || q.topic || 'Ders Notu'}
                  {q.sourcePage ? ` (${q.sourcePage})` : ''}
                </span>
              )}
            </div>
            <AcademicMarkdown content={q.explanation} className="text-xs leading-relaxed" />
            {q.distractorExplanations && Object.keys(q.distractorExplanations).length > 0 && (
              <div className="space-y-1.5 border-t border-cyan-500/20 pt-2">
                <p className="text-[11px] font-bold text-foreground">Yanlış Şıklar Neden Hatalı?</p>
                <div className="space-y-1">
                  {Object.entries(q.distractorExplanations).map(([letter, reason]) => {
                    const letterIdx = letter.charCodeAt(0) - 65;
                    const wasChosenWrong = chosenOption === letterIdx && letterIdx !== q.correctIndex;
                    return (
                      <div
                        key={letter}
                        className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed',
                          wasChosenWrong
                            ? 'border-destructive/40 bg-destructive/10 text-foreground'
                            : 'border-border/50 bg-background/60 text-muted-foreground',
                        )}
                      >
                        <span className="font-bold text-foreground">{letter} Şıkkı: </span>
                        {reason}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

      {/* Rich Post-Exam Performance & Topic Diagnostic Dashboard */}
      {finished && (() => {
        const totalCorrect = computeTotalCorrect();
        const scorePct = Math.round((totalCorrect / Math.max(1, questions.length)) * 100);
        const wrongIndices: number[] = [];
        const diffStats: Record<'easy' | 'medium' | 'hard', { correct: number; total: number }> = {
          easy: { correct: 0, total: 0 },
          medium: { correct: 0, total: 0 },
          hard: { correct: 0, total: 0 },
        };
        const topicMap = new Map<string, { correct: number; total: number }>();

        questions.forEach((item, idx) => {
          const itemMc =
            item.type !== 'short_answer' && Array.isArray(item.options) && item.options.length > 0;
          const ok = itemMc
            ? selectedMc[idx] === item.correctIndex
            : (openGrades[idx]?.score ?? 0) >= 60;
          if (!ok) wrongIndices.push(idx);
          const d = item.difficulty || 'medium';
          diffStats[d].total++;
          if (ok) diffStats[d].correct++;
          const topicKey = (item.topic || item.sourceSection || 'Genel Konu').trim();
          const cur = topicMap.get(topicKey) || { correct: 0, total: 0 };
          cur.total++;
          if (ok) cur.correct++;
          topicMap.set(topicKey, cur);
        });

        const topicRows = Array.from(topicMap.entries())
          .map(([topic, s]) => ({
            topic,
            correct: s.correct,
            total: s.total,
            pct: Math.round((s.correct / Math.max(1, s.total)) * 100),
          }))
          .sort((a, b) => a.pct - b.pct);

        return (
          <div
            data-testid="quiz-performance-dashboard"
            className="neural-card space-y-4 border-emerald-500/35 bg-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <p className="text-lg font-extrabold text-foreground">
                  Sınav Sonucu: {totalCorrect} / {questions.length} Doğru (%{scorePct})
                </p>
                <p className="text-xs text-muted-foreground">
                  Süre: {timeStr} · {wrongIndices.length} yanlış/boş · İlerlemeniz Çalışma Stüdyosu
                  analizlerine işlendi.
                </p>
              </div>
              {wrongIndices.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={onlyWrongFilter ? 'default' : 'outline'}
                  onClick={() => {
                    const next = !onlyWrongFilter;
                    setOnlyWrongFilter(next);
                    if (next && wrongIndices[0] !== undefined) {
                      setCurrentIdx(wrongIndices[0]);
                    }
                  }}
                  className="text-xs"
                >
                  {onlyWrongFilter
                    ? 'Tüm Soruları Göster'
                    : `Yanlış/Boş Sorulara Git (${wrongIndices.length})`}
                </Button>
              )}
            </div>

            {/* Difficulty Breakdown */}
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  ['easy', 'Kolay'],
                  ['medium', 'Orta'],
                  ['hard', 'Zor'],
                ] as const
              ).map(([lvl, label]) => {
                const st = diffStats[lvl];
                const p = st.total > 0 ? Math.round((st.correct / st.total) * 100) : null;
                return (
                  <div
                    key={lvl}
                    className="rounded-xl border border-border/70 bg-muted/20 p-3 text-center"
                  >
                    <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">
                      {st.total > 0 ? `${st.correct}/${st.total} (%${p})` : '—'}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Topic-by-Topic Breakdown */}
            {topicRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground">Konu Bazlı Başarı Dağılımı</p>
                <div className="space-y-1.5">
                  {topicRows.map((row) => (
                    <div
                      key={row.topic}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-foreground">{row.topic}</span>
                          <span
                            className={cn(
                              'shrink-0 font-bold',
                              row.pct >= 75
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.pct >= 50
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400',
                            )}
                          >
                            {row.correct}/{row.total} (%{row.pct})
                          </span>
                        </div>
                        <Progress value={row.pct} className="mt-1.5 h-1.5" />
                      </div>
                      {row.pct < 70 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onAskCoach(
                              `"${row.topic}" konusunda sınavda hata yaptım. Temel mantığını ve sınav tuzaklarını sade şekilde özetler misin?`,
                            )
                          }
                          className="h-7 shrink-0 px-2 text-[11px] text-primary"
                        >
                          Koçla Pekiştir
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
