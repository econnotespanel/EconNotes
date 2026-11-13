import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { gradeOpenEndedAnswer } from '@/lib/studyAiClient';
import type { OpenEndedGradeResult, QuizQuestion, StudyMaterial } from '@/types/study';

interface QuizWorkspaceProps {
  material: StudyMaterial;
  onRecordProgress: (score: number, total: number) => Promise<void> | void;
  onAskCoach: (prompt: string) => void;
}

export function QuizWorkspace({
  material,
  onRecordProgress,
  onAskCoach,
}: QuizWorkspaceProps) {
  const questions: QuizQuestion[] = useMemo(
    () => (Array.isArray(material.content?.questions) ? material.content.questions : []),
    [material.content],
  );

  const [mode, setMode] = useState<'study' | 'exam'>('study');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedChoices, setSelectedChoices] = useState<Record<number, number>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<number, string>>({});
  const [openGrades, setOpenGrades] = useState<Record<number, OpenEndedGradeResult>>({});
  const [gradingIdx, setGradingIdx] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [wrongOnlyFilter, setWrongOnlyFilter] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setCurrentIdx(0);
    setSelectedChoices({});
    setOpenAnswers({});
    setOpenGrades({});
    setFlagged({});
    setSubmitted(false);
    setElapsedSec(0);
  }, [material.id]);

  useEffect(() => {
    if (submitted) return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [submitted, material.id]);

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Bu sınavda gösterilecek soru bulunamadı.
        </CardContent>
      </Card>
    );
  }

  const currentQ = questions[currentIdx] || questions[0];
  const isOpen = currentQ.type === 'short_answer' || !currentQ.options?.length;
  const userChoice = selectedChoices[currentIdx];
  const openGrade = openGrades[currentIdx];
  const showFeedbackNow =
    submitted || (mode === 'study' && (userChoice !== undefined || Boolean(openGrade)));

  const computeScore = () => {
    let correct = 0;
    questions.forEach((q, idx) => {
      if (q.type === 'short_answer' || !q.options?.length) {
        if ((openGrades[idx]?.score ?? 0) >= 60) correct += 1;
      } else if (selectedChoices[idx] === (q.correctIndex ?? 0)) {
        correct += 1;
      }
    });
    return correct;
  };

  const answeredCount = questions.filter((q, idx) =>
    q.type === 'short_answer' || !q.options?.length
      ? (openAnswers[idx] || '').trim().length > 0
      : selectedChoices[idx] !== undefined,
  ).length;

  const handleGradeOpen = async (idx: number) => {
    const q = questions[idx];
    const studentAnswer = (openAnswers[idx] || '').trim();
    if (!studentAnswer) return;
    setGradingIdx(idx);
    try {
      const result = await gradeOpenEndedAnswer({
        course: material.course,
        topic: q.topic,
        question: q.question,
        rubricAnswer: q.sampleAnswer || q.explanation || q.question,
        studentAnswer,
      });
      setOpenGrades((prev) => ({ ...prev, [idx]: result }));
    } finally {
      setGradingIdx(null);
    }
  };

  const handleFinishQuiz = async () => {
    setSubmitted(true);
    const finalScore = computeScore();
    await onRecordProgress(finalScore, questions.length);
  };

  const handleReset = () => {
    setSelectedChoices({});
    setOpenAnswers({});
    setOpenGrades({});
    setFlagged({});
    setSubmitted(false);
    setWrongOnlyFilter(false);
    setCurrentIdx(0);
    setElapsedSec(0);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const finalScore = computeScore();
  const scorePct = Math.round((finalScore / questions.length) * 100);

  return (
    <div className="space-y-5">
      {/* Top Mode & Progress Bar */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                disabled={submitted}
                onClick={() => setMode('study')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'study'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Öğrenme Modu (Anında Çözüm)
              </button>
              <button
                type="button"
                disabled={submitted}
                onClick={() => setMode('exam')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'exam'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sınav Simülasyonu
              </button>
            </div>

            <Badge variant="outline" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {formatDuration(elapsedSec)}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {answeredCount}/{questions.length} Cevaplandı
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {!submitted ? (
              <Button size="sm" onClick={() => void handleFinishQuiz()} className="gap-1.5">
                <Award className="h-4 w-4" />
                Sınavı Bitir & Kaydet
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleReset} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Yeniden Çöz
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {submitted && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="text-xs">Sınav Tamamlandı</Badge>
                <span className="text-xs text-muted-foreground">Süre: {formatDuration(elapsedSec)}</span>
              </div>
              <h3 className="text-2xl font-bold text-foreground">
                %{scorePct} Başarı ({finalScore} / {questions.length} Doğru)
              </h3>
              <p className="text-xs text-muted-foreground">
                Sonucunuz ilerleme grafiğinize kaydedildi. Aşağıdan tüm soruları ve çözümleri inceleyebilirsiniz.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={wrongOnlyFilter ? 'default' : 'outline'}
                onClick={() => {
                  const next = !wrongOnlyFilter;
                  setWrongOnlyFilter(next);
                  if (next) {
                    const firstWrong = questions.findIndex((q, idx) =>
                      q.type === 'short_answer' || !q.options?.length
                        ? (openGrades[idx]?.score ?? 0) < 60
                        : selectedChoices[idx] !== (q.correctIndex ?? 0),
                    );
                    if (firstWrong >= 0) setCurrentIdx(firstWrong);
                  }
                }}
              >
                {wrongOnlyFilter ? 'Tüm Soruları Göster' : 'Yalnızca Yanlış / Boşlar'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onAskCoach(
                    `Bu sınavda ${questions.length} sorudan ${finalScore} doğru yaptım (%${scorePct}). Zayıf kaldığım konulara odaklanan kısa bir çalışma planı hazırlar mısın?`,
                  )
                }
              >
                Zayıf Konular İçin Plan İste
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Question Navigator Grid */}
        <aside className="lg:col-span-3">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Soru Paleti</CardTitle>
              <Progress
                value={Math.round((answeredCount / questions.length) * 100)}
                className="mt-2 h-1.5"
              />
            </CardHeader>
            <CardContent className="grid grid-cols-5 gap-1.5 pt-2">
              {questions.map((q, idx) => {
                const answered =
                  q.type === 'short_answer' || !q.options?.length
                    ? Boolean((openAnswers[idx] || '').trim())
                    : selectedChoices[idx] !== undefined;
                const reveal = submitted || (mode === 'study' && answered);
                const isCorrect =
                  q.type === 'short_answer' || !q.options?.length
                    ? (openGrades[idx]?.score ?? 0) >= 60
                    : selectedChoices[idx] === (q.correctIndex ?? 0);

                if (wrongOnlyFilter && submitted && isCorrect) return null;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition-all ${
                      currentIdx === idx
                        ? 'border-primary bg-primary text-primary-foreground'
                        : reveal
                        ? isCorrect
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-foreground'
                          : 'border-destructive/60 bg-destructive/15 text-foreground'
                        : answered
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {idx + 1}
                    {flagged[idx] && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        {/* Active Question Card */}
        <div className="space-y-4 lg:col-span-9">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">
                    Soru {currentIdx + 1} / {questions.length}
                  </Badge>
                  {currentQ.topic && <Badge variant="outline">{currentQ.topic}</Badge>}
                  {currentQ.bloomLevel && (
                    <Badge variant="outline" className="text-[11px]">
                      {currentQ.bloomLevel}
                    </Badge>
                  )}
                  {currentQ.difficulty && (
                    <Badge variant="outline" className="text-[11px]">
                      {currentQ.difficulty === 'hard'
                        ? 'Zor'
                        : currentQ.difficulty === 'easy'
                        ? 'Kolay'
                        : 'Orta'}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={flagged[currentIdx] ? 'secondary' : 'ghost'}
                    onClick={() =>
                      setFlagged((prev) => ({ ...prev, [currentIdx]: !prev[currentIdx] }))
                    }
                    className="h-8 gap-1 text-xs"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {flagged[currentIdx] ? 'İşaretli' : 'İşaretle'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onAskCoach(
                        `Sınavdaki şu soruyu adım adım mantığıyla açıklar mısın?\n\nSoru: ${currentQ.question}`,
                      )
                    }
                    className="h-8 gap-1 text-xs"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                    Hocaya Sor
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 p-5 sm:p-6">
              <AcademicMarkdown
                content={currentQ.question}
                className="text-base font-medium leading-relaxed text-foreground"
              />

              {isOpen ? (
                <div className="space-y-3">
                  <Textarea
                    rows={5}
                    placeholder="Akademik cevabınızı yazın (formül, varsayım ve gerekçenizi belirtin)..."
                    value={openAnswers[currentIdx] || ''}
                    onChange={(e) =>
                      setOpenAnswers((prev) => ({ ...prev, [currentIdx]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Yapay Zekâ Rubrik Değerlendirici cevabınızı ideal akademik çözümle karşılaştırır.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={gradingIdx === currentIdx || !(openAnswers[currentIdx] || '').trim()}
                      onClick={() => void handleGradeOpen(currentIdx)}
                      className="gap-1.5"
                    >
                      {gradingIdx === currentIdx ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Cevabımı AI ile Puanla
                    </Button>
                  </div>

                  {openGrade && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">
                          Değerlendirme: {openGrade.verdict}
                        </span>
                        <Badge>{openGrade.score} / 100 Puan</Badge>
                      </div>
                      <AcademicMarkdown content={openGrade.feedback} className="text-xs sm:text-sm" />
                      {openGrade.strengths.length > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                            Güçlü Yönler:
                          </p>
                          <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                            {openGrade.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {openGrade.missingConcepts.length > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold text-amber-700 dark:text-amber-400">
                            Tam Puan İçin Eklenebilecek Noktalar:
                          </p>
                          <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                            {openGrade.missingConcepts.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {openGrade.improvedAnswer && (
                        <div className="rounded-lg bg-card p-3 border border-border text-xs">
                          <p className="font-semibold text-foreground mb-1">Örnek Mükemmel Cevap:</p>
                          <AcademicMarkdown content={openGrade.improvedAnswer} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(currentQ.options || []).map((opt, oIdx) => {
                    const picked = userChoice === oIdx;
                    const isCorrectOpt = (currentQ.correctIndex ?? 0) === oIdx;

                    let cardStyle =
                      'border-border bg-card hover:border-primary/50 hover:bg-muted/30';
                    if (showFeedbackNow) {
                      if (isCorrectOpt) {
                        cardStyle = 'border-emerald-500 bg-emerald-500/10 text-foreground';
                      } else if (picked && !isCorrectOpt) {
                        cardStyle = 'border-destructive bg-destructive/10 text-foreground';
                      } else {
                        cardStyle = 'border-border/60 bg-muted/20 text-muted-foreground';
                      }
                    } else if (picked) {
                      cardStyle = 'border-primary bg-primary/10 ring-1 ring-primary';
                    }

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={submitted}
                        onClick={() =>
                          setSelectedChoices((prev) => ({ ...prev, [currentIdx]: oIdx }))
                        }
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition-all ${cardStyle}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-xs font-bold">
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <AcademicMarkdown content={opt} className="text-sm leading-snug" />
                        </div>
                        {showFeedbackNow && isCorrectOpt && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        )}
                        {showFeedbackNow && picked && !isCorrectOpt && (
                          <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {showFeedbackNow && (currentQ.explanation || currentQ.sampleAnswer) && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    Akademik Çözüm Analizi
                  </p>
                  <AcademicMarkdown
                    content={currentQ.explanation || currentQ.sampleAnswer || ''}
                    className="text-xs sm:text-sm leading-relaxed text-foreground"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentIdx <= 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                >
                  ← Önceki Soru
                </Button>
                <Button
                  type="button"
                  disabled={currentIdx >= questions.length - 1}
                  onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Sonraki Soru →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
