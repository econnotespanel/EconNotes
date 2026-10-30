import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Shuffle,
  RotateCcw,
  Play,
  FileDown,
  Sparkles,
  ArrowRight,
  GraduationCap,
  Puzzle,
  HelpCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExamQuestion, MatchPair, StudioScene } from './sceneModel';

interface LessonWrapUpProps {
  title: string;
  courseLabel?: string;
  scenes: StudioScene[];
  matchingPairs: MatchPair[];
  examQuestions: ExamQuestion[];
  keyFacts: string[];
  onClose: () => void;
  onReplayLesson: () => void;
  onJumpToScene: (sceneIndex: number) => void;
  onDownloadNotes: () => void;
}

type WrapTab = 'matching' | 'questions' | 'summary';

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = (seed * 9301 + 49297) >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const LessonWrapUp: React.FC<LessonWrapUpProps> = ({
  title,
  courseLabel,
  scenes,
  matchingPairs,
  examQuestions,
  keyFacts,
  onClose,
  onReplayLesson,
  onJumpToScene,
  onDownloadNotes,
}) => {
  const [activeTab, setActiveTab] = useState<WrapTab>(
    matchingPairs.length >= 2 ? 'matching' : examQuestions.length > 0 ? 'questions' : 'summary',
  );

  // ---------------- 1. KAVRAM EŞLEŞTİRME DURUMLARI ----------------
  const [roundSeed, setRoundSeed] = useState(1);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [matchedPairIds, setMatchedPairIds] = useState<number[]>([]);
  const [wrongFlash, setWrongFlash] = useState<{ left: number; right: number; sceneIdx: number } | null>(null);
  const [matchAttempts, setMatchAttempts] = useState(0);
  const [streak, setStreak] = useState(0);

  const pairs = useMemo(() => matchingPairs.slice(0, 6), [matchingPairs]);

  const leftOrder = useMemo(
    () => shuffleWithSeed(pairs.map((_, idx) => idx), roundSeed * 7 + 3),
    [pairs, roundSeed],
  );
  const rightOrder = useMemo(
    () => shuffleWithSeed(pairs.map((_, idx) => idx), roundSeed * 13 + 11),
    [pairs, roundSeed],
  );

  const tryMatch = (leftPairIdx: number, rightPairIdx: number) => {
    setMatchAttempts(a => a + 1);
    if (leftPairIdx === rightPairIdx) {
      setMatchedPairIds(prev => (prev.includes(leftPairIdx) ? prev : [...prev, leftPairIdx]));
      setSelectedLeft(null);
      setSelectedRight(null);
      setWrongFlash(null);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
      setWrongFlash({
        left: leftPairIdx,
        right: rightPairIdx,
        sceneIdx: pairs[leftPairIdx]?.sceneIndex ?? 0,
      });
      window.setTimeout(() => {
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 420);
    }
  };

  const handleSelectLeft = (pairIdx: number) => {
    if (matchedPairIds.includes(pairIdx)) return;
    setWrongFlash(null);
    if (selectedLeft === pairIdx) {
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(pairIdx);
    if (selectedRight !== null) {
      tryMatch(pairIdx, selectedRight);
    }
  };

  const handleSelectRight = (pairIdx: number) => {
    if (matchedPairIds.includes(pairIdx)) return;
    setWrongFlash(null);
    if (selectedRight === pairIdx) {
      setSelectedRight(null);
      return;
    }
    setSelectedRight(pairIdx);
    if (selectedLeft !== null) {
      tryMatch(selectedLeft, pairIdx);
    }
  };

  const resetMatching = () => {
    setRoundSeed(s => s + 1);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedPairIds([]);
    setWrongFlash(null);
    setMatchAttempts(0);
    setStreak(0);
  };

  const allMatched = pairs.length > 0 && matchedPairIds.length === pairs.length;
  const matchAccuracy =
    matchAttempts > 0 ? Math.min(100, Math.round((matchedPairIds.length / matchAttempts) * 100)) : 100;

  // ---------------- 2. HOCANIN SORABİLECEĞİ SORULAR DURUMLARI ----------------
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const currentQ: ExamQuestion | undefined = examQuestions[qIndex];
  const answeredCount = Object.keys(answers).length;
  const correctCount = examQuestions.reduce(
    (sum, q, idx) => sum + (answers[idx] === q.correctIndex ? 1 : 0),
    0,
  );

  const selectOption = (optIdx: number) => {
    if (answers[qIndex] !== undefined) return;
    setAnswers(prev => ({ ...prev, [qIndex]: optIdx }));
  };

  const resetQuiz = () => {
    setAnswers({});
    setQIndex(0);
  };

  // ---------------- 3. SINAV ÖZETİ VERİSİ ----------------
  const examHighlights = useMemo(() => {
    const items: Array<{ text: string; sceneIdx: number; sceneTitle: string }> = [];
    const seen = new Set<string>();
    scenes.forEach((sc, idx) => {
      if (sc.examTip) {
        const key = sc.examTip.slice(0, 40).toLocaleLowerCase('tr-TR');
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ text: sc.examTip, sceneIdx: idx, sceneTitle: sc.title });
        }
      }
    });
    keyFacts.forEach(f => {
      const key = f.slice(0, 40).toLocaleLowerCase('tr-TR');
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ text: f, sceneIdx: 0, sceneTitle: 'Genel Sınav Notu' });
      }
    });
    return items.slice(0, 10);
  }, [scenes, keyFacts]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#040711]/92 p-3 sm:p-6 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-[#0b1326] to-[#070c18] shadow-[0_32px_90px_rgba(0,0,0,0.85)]">
        {/* Üst Başlık ve İlerleme Şeridi */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#080f1f]/90 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-blue-600/25 text-cyan-300 ring-1 ring-cyan-400/30">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  Ders Sonu Pekiştirme & Sınav Merkezi
                </span>
                {courseLabel && (
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    {courseLabel}
                  </span>
                )}
              </div>
              <h2 className="truncate text-base sm:text-lg font-bold text-white">{title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs">
              <span className="text-slate-400">Eşleşme:</span>
              <span className="font-mono font-bold text-emerald-300">
                {matchedPairIds.length}/{pairs.length}
              </span>
              <span className="text-white/15">|</span>
              <span className="text-slate-400">Soru:</span>
              <span className="font-mono font-bold text-cyan-300">
                {correctCount}/{examQuestions.length}
              </span>
            </div>

            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="Video Sahnesine Dön"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sekme Menüsü */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#060b16] px-5 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {pairs.length >= 2 && (
              <button
                onClick={() => setActiveTab('matching')}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'matching'
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                <Puzzle className="h-3.5 w-3.5" />
                <span>Kavram Eşleştirme</span>
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                  {matchedPairIds.length}/{pairs.length}
                </span>
              </button>
            )}

            {examQuestions.length > 0 && (
              <button
                onClick={() => setActiveTab('questions')}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'questions'
                    ? 'bg-purple-500/20 text-purple-200 ring-1 ring-purple-400/40'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Hocanın Sorabileceği Sorular</span>
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                  {answeredCount}/{examQuestions.length}
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('summary')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === 'summary'
                  ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>Sınav Odak Özeti</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onDownloadNotes}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08]"
            >
              <FileDown className="h-3.5 w-3.5 text-emerald-400" />
              <span>Notları İndir</span>
            </button>
            <button
              onClick={onReplayLesson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08]"
            >
              <RotateCcw className="h-3.5 w-3.5 text-cyan-400" />
              <span>Baştan İzle</span>
            </button>
          </div>
        </div>

        {/* İçerik Gövdesi */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* ==================== 1. KAVRAM EŞLEŞTİRME SİSTEMİ ==================== */}
          {activeTab === 'matching' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-300">
                  Soldaki kavramı seçip sağdaki doğru açıklamayla eşleştirin.
                </p>
                <div className="flex items-center gap-2 text-xs">
                  {streak >= 2 && (
                    <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                      {streak}x Seri
                    </span>
                  )}
                  <button
                    onClick={resetMatching}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    <span>Karıştır</span>
                  </button>
                </div>
              </div>

              {/* Yanlış eşleştirme ipucu */}
              {wrongFlash && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
                  <span>
                    Bu kavram ve açıklama eşleşmedi. Doğru bağlantıyı kurmak için tekrar deneyin.
                  </span>
                  <button
                    onClick={() => onJumpToScene(wrongFlash.sceneIdx)}
                    className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:underline"
                  >
                    <Play className="h-3 w-3" />
                    <span>Bölüm {wrongFlash.sceneIdx + 1}&apos;de İzle</span>
                  </button>
                </div>
              )}

              {/* Tamamlanma Kartı */}
              {allMatched ? (
                <div className="rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-transparent p-6 text-center space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Tüm Kavramları Doğru Eşleştirdiniz!
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Doğruluk oranı: <strong className="text-emerald-300">%{matchAccuracy}</strong> · {pairs.length} temel kavram pekiştirildi.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <Button
                      variant="outline"
                      onClick={resetMatching}
                      className="rounded-xl border-white/15 bg-white/[0.04] text-white hover:bg-white/10 gap-1.5"
                    >
                      <Shuffle className="h-4 w-4" />
                      Tekrar Eşleştir
                    </Button>
                    {examQuestions.length > 0 && (
                      <Button
                        onClick={() => setActiveTab('questions')}
                        className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 gap-1.5"
                      >
                        <span>Hocanın Sorularına Geç</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[0.9fr_1.35fr]">
                  {/* Sol Sütun: Kavramlar */}
                  <div className="space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 px-1">
                      Kavramlar
                    </div>
                    {leftOrder.map(pairIdx => {
                      const item = pairs[pairIdx];
                      const isMatched = matchedPairIds.includes(pairIdx);
                      const isSelected = selectedLeft === pairIdx;
                      const isWrong = wrongFlash?.left === pairIdx;

                      return (
                        <button
                          key={`L-${pairIdx}`}
                          onClick={() => handleSelectLeft(pairIdx)}
                          disabled={isMatched}
                          className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all flex items-center justify-between gap-2 ${
                            isMatched
                              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200 opacity-75'
                              : isWrong
                              ? 'border-rose-500/60 bg-rose-500/15 text-rose-100'
                              : isSelected
                              ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-[0_0_24px_rgba(34,211,238,0.22)]'
                              : 'border-white/10 bg-white/[0.03] text-slate-100 hover:border-cyan-400/40 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="text-xs sm:text-sm font-semibold leading-snug">
                            {item.term}
                          </span>
                          {isMatched && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sağ Sütun: Tanımlar / İşlevler */}
                  <div className="space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300 px-1">
                      Açıklamalar ve Sınav Karşılıkları
                    </div>
                    {rightOrder.map(pairIdx => {
                      const item = pairs[pairIdx];
                      const isMatched = matchedPairIds.includes(pairIdx);
                      const isSelected = selectedRight === pairIdx;
                      const isWrong = wrongFlash?.right === pairIdx;

                      return (
                        <button
                          key={`R-${pairIdx}`}
                          onClick={() => handleSelectRight(pairIdx)}
                          disabled={isMatched}
                          className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all flex items-center justify-between gap-3 ${
                            isMatched
                              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-100 opacity-75'
                              : isWrong
                              ? 'border-rose-500/60 bg-rose-500/15 text-rose-100'
                              : isSelected
                              ? 'border-purple-400 bg-purple-500/20 text-white shadow-[0_0_24px_rgba(168,85,247,0.22)]'
                              : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-purple-400/40 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="text-xs leading-relaxed">{item.definition}</span>
                          {isMatched && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== 2. HOCANIN SORABİLECEĞİ SORULAR ==================== */}
          {activeTab === 'questions' && currentQ && (
            <div className="space-y-5">
              {/* Soru Numarası Seçici */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {examQuestions.map((_, idx) => {
                    const ans = answers[idx];
                    const isAnswered = ans !== undefined;
                    const isRight = isAnswered && ans === examQuestions[idx].correctIndex;
                    return (
                      <button
                        key={idx}
                        onClick={() => setQIndex(idx)}
                        className={`h-8 w-8 rounded-xl font-mono text-xs font-bold transition ${
                          idx === qIndex
                            ? 'bg-white text-slate-950 shadow'
                            : isRight
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                            : isAnswered
                            ? 'bg-rose-500/25 text-rose-300 border border-rose-400/40'
                            : 'bg-white/[0.05] text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onJumpToScene(currentQ.sceneIndex)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                  >
                    <Play className="h-3 w-3" />
                    <span>Bölüm {currentQ.sceneIndex + 1}&apos;i İzle</span>
                  </button>
                  {answeredCount > 0 && (
                    <button
                      onClick={resetQuiz}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                    >
                      Sıfırla
                    </button>
                  )}
                </div>
              </div>

              {/* Soru Kartı */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-purple-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    Soru {qIndex + 1} / {examQuestions.length} · Sınav Odak Sorusu
                  </span>
                </div>

                <h3 className="text-sm sm:text-base font-bold leading-relaxed text-white">
                  {currentQ.question}
                </h3>

                <div className="space-y-2.5">
                  {currentQ.options.map((opt, optIdx) => {
                    const chosen = answers[qIndex];
                    const revealed = chosen !== undefined;
                    const isCorrect = optIdx === currentQ.correctIndex;
                    const isPicked = chosen === optIdx;
                    const letter = String.fromCharCode(65 + optIdx);

                    return (
                      <button
                        key={optIdx}
                        onClick={() => selectOption(optIdx)}
                        disabled={revealed}
                        className={`w-full rounded-2xl border p-3.5 text-left transition flex items-start gap-3 ${
                          !revealed
                            ? 'border-white/10 bg-white/[0.025] text-slate-200 hover:border-purple-400/50 hover:bg-white/[0.06]'
                            : isCorrect
                            ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100'
                            : isPicked
                            ? 'border-rose-400/60 bg-rose-500/15 text-rose-100'
                            : 'border-white/[0.06] bg-white/[0.015] text-slate-400 opacity-70'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                            revealed && isCorrect
                              ? 'bg-emerald-400 text-slate-950'
                              : revealed && isPicked
                              ? 'bg-rose-400 text-slate-950'
                              : 'bg-white/10 text-slate-200'
                          }`}
                        >
                          {letter}
                        </span>
                        <span className="flex-1 text-xs sm:text-sm leading-relaxed">{opt}</span>
                        {revealed && isCorrect && (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        )}
                        {revealed && isPicked && !isCorrect && (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Çözüm ve Hoca Vurgusu */}
                {answers[qIndex] !== undefined && (
                  <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4 space-y-2">
                    <div className="text-xs font-bold text-cyan-300">
                      {answers[qIndex] === currentQ.correctIndex
                        ? 'Doğru Cevap! Hoca Notu:'
                        : 'Çözüm & Hoca Notu:'}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-200">{currentQ.explanation}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={qIndex === 0}
                    onClick={() => setQIndex(i => Math.max(0, i - 1))}
                    className="rounded-xl border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  >
                    Önceki Soru
                  </Button>

                  {qIndex + 1 < examQuestions.length ? (
                    <Button
                      size="sm"
                      onClick={() => setQIndex(i => Math.min(examQuestions.length - 1, i + 1))}
                      className="rounded-xl bg-white text-slate-950 hover:bg-cyan-50 gap-1.5"
                    >
                      <span>Sonraki Soru</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setActiveTab('summary')}
                      className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white gap-1.5"
                    >
                      <span>Sınav Özetini Gör ({correctCount}/{examQuestions.length})</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 3. SINAV ODAK ÖZETİ ==================== */}
          {activeTab === 'summary' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                Ders boyunca vurgulanan ve sınavlarda doğrudan sorulabilecek kilit noktalar:
              </p>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {examHighlights.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => onJumpToScene(item.sceneIdx)}
                    className="group cursor-pointer rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 transition hover:border-amber-400/40 hover:bg-white/[0.05] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold uppercase tracking-wider text-amber-300">
                        Sınav Noktası {idx + 1}
                      </span>
                      <span className="text-cyan-300 opacity-80 group-hover:opacity-100">
                        ▶ Bölüm {item.sceneIdx + 1}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-200">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonWrapUp;
