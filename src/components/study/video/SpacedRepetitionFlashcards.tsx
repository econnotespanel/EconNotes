import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Brain,
  Sparkles,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Flame,
  Award,
  Layers,
  Calendar,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudioScene } from './sceneModel';

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  hint?: string;
  category: 'term' | 'exam' | 'formula';
  sceneIdx: number;
  box: 1 | 2 | 3; // 1: 1 Gün (Zayıf), 2: 3 Gün (Gelişiyor), 3: 7 Gün (Usta)
  lastReviewed?: number;
  streak: number;
}

interface SpacedRepetitionFlashcardsProps {
  materialId: string;
  scenes: StudioScene[];
  keyFacts: string[];
  wrongQuestionIndexes?: number[];
  onClose: () => void;
  onJumpToScene: (sceneIdx: number) => void;
}

export const SpacedRepetitionFlashcards: React.FC<SpacedRepetitionFlashcardsProps> = ({
  materialId,
  scenes,
  keyFacts,
  wrongQuestionIndexes = [],
  onClose,
  onJumpToScene,
}) => {
  const storageKey = `econnotes_spaced_cards_${materialId}`;

  // Başlangıç Kartlarını Oluştur (Sahnelerden, Kavramlardan ve Sınav Sorularından)
  const [cards, setCards] = useState<FlashcardItem[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }

    const initialCards: FlashcardItem[] = [];

    // 1. Sahnelerdeki Kilit Terimler
    scenes.forEach((sc, scIdx) => {
      sc.keyTerms.forEach((kt, ktIdx) => {
        initialCards.push({
          id: `card-term-${scIdx}-${ktIdx}`,
          front: `${kt.term} nedir?`,
          back: kt.definition,
          hint: `${sc.title} bölümünde işlenmiştir.`,
          category: 'term',
          sceneIdx: scIdx,
          box: 1,
          streak: 0,
        });
      });

      // 2. Sınav Tüyosu Kartı
      if (sc.examTip) {
        initialCards.push({
          id: `card-exam-${scIdx}`,
          front: `Sınav Sorusu İhtimali: ${sc.title}`,
          back: sc.examTip,
          hint: `Hocanın sınavda yoklayabileceği püf nokta`,
          category: 'exam',
          sceneIdx: scIdx,
          box: 1,
          streak: 0,
        });
      }
    });

    // 3. Genel Hap Bilgiler
    keyFacts.slice(0, 5).forEach((fact, fIdx) => {
      initialCards.push({
        id: `card-fact-${fIdx}`,
        front: `Kritik Tarih/İlke #${fIdx + 1}`,
        back: fact,
        hint: `Dersin genel özetinde yer alan temel bilgi`,
        category: 'formula',
        sceneIdx: 0,
        box: 1,
        streak: 0,
      });
    });

    return initialCards;
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [filterBox, setFilterBox] = useState<'all' | 1 | 2 | 3>('all');

  // Değişiklikleri Kaydet
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cards));
    } catch {
      // ignore
    }
  }, [cards, storageKey]);

  const activeCards = useMemo(() => {
    if (filterBox === 'all') return cards;
    return cards.filter(c => c.box === filterBox);
  }, [cards, filterBox]);

  const currentCard: FlashcardItem | undefined = activeCards[currentIndex];

  // Ustalık İstatistikleri
  const stats = useMemo(() => {
    const total = cards.length;
    if (total === 0) return { box1: 0, box2: 0, box3: 0, masteryPct: 0 };
    const b1 = cards.filter(c => c.box === 1).length;
    const b2 = cards.filter(c => c.box === 2).length;
    const b3 = cards.filter(c => c.box === 3).length;
    const weighted = (b1 * 10 + b2 * 50 + b3 * 100) / (total * 100);
    return {
      box1: b1,
      box2: b2,
      box3: b3,
      masteryPct: Math.round(weighted * 100),
    };
  }, [cards]);

  const handleAnswer = (performance: 'hard' | 'good' | 'easy') => {
    if (!currentCard) return;

    setCards(prev =>
      prev.map(c => {
        if (c.id !== currentCard.id) return c;
        let nextBox = c.box;
        let nextStreak = c.streak;

        if (performance === 'hard') {
          nextBox = 1; // Tekrar et -> Başa dön
          nextStreak = 0;
        } else if (performance === 'good') {
          nextBox = Math.min(3, c.box + 1) as 1 | 2 | 3;
          nextStreak += 1;
        } else if (performance === 'easy') {
          nextBox = 3; // Kolay -> Usta seviyesi
          nextStreak += 2;
        }

        return {
          ...c,
          box: nextBox,
          streak: nextStreak,
          lastReviewed: Date.now(),
        };
      })
    );

    setIsFlipped(false);
    if (currentIndex + 1 < activeCards.length) {
      setCurrentIndex(i => i + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const resetAllProgress = () => {
    if (confirm('Tüm kart hafıza seviyelerini sıfırlamak istediğinize emin misiniz?')) {
      setCards(prev => prev.map(c => ({ ...c, box: 1, streak: 0 })));
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="relative flex h-full max-h-[850px] w-full max-w-[920px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#070c18] shadow-2xl">
        {/* Üst Bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090f20] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300 border border-purple-400/30">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Aralıklı Tekrar & Bilgi Kartları
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
            title="Kapat (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hafıza Seviyesi & İlerleme Çubuğu */}
        <div className="border-b border-white/[0.06] bg-[#050914] px-4 sm:px-6 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-white">Hafıza Ustalık Skoru</span>
              <span className="font-mono text-cyan-300 font-bold">%{stats.masteryPct}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-400" /> {stats.box1} Yeni/Tekrar
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> {stats.box2} Pekiştiriliyor
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> {stats.box3} Ustalaşıldı
              </span>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${stats.masteryPct}%` }}
            />
          </div>
        </div>

        {/* Kutu Filtreleri */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#070c18] px-4 sm:px-6 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: `Tüm Kartlar (${cards.length})` },
              { id: 1, label: `Kutu 1 (1 Gün - ${stats.box1})` },
              { id: 2, label: `Kutu 2 (3 Gün - ${stats.box2})` },
              { id: 3, label: `Kutu 3 (7 Gün - ${stats.box3})` },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => {
                  setFilterBox(b.id as any);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  filterBox === b.id
                    ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <button
            onClick={resetAllProgress}
            className="text-[10px] text-slate-500 hover:text-rose-400 transition"
          >
            İlerlemeyi Sıfırla
          </button>
        </div>

        {/* Kart Alanı (3D Flip Effect) */}
        <div className="relative flex flex-1 flex-col items-center justify-center p-4 sm:p-8 bg-[#040711]">
          {currentCard ? (
            <div className="w-full max-w-xl flex flex-col items-center space-y-4">
              {/* Kart Sayacı */}
              <div className="flex items-center justify-between w-full text-xs text-slate-400 px-1">
                <span>
                  Kart {currentIndex + 1} / {activeCards.length}
                </span>
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-cyan-300 font-mono">
                  Bölüm {currentCard.sceneIdx + 1}
                </span>
              </div>

              {/* 3D Bilgi Kartı */}
              <div
                onClick={() => setIsFlipped(f => !f)}
                className="group relative h-[320px] sm:h-[340px] w-full cursor-pointer rounded-3xl border border-white/[0.12] bg-gradient-to-br from-[#0c1429] to-[#070b18] p-6 shadow-2xl transition-all duration-300 hover:border-purple-400/40 hover:shadow-[0_0_35px_rgba(192,132,252,0.15)] flex flex-col justify-between"
              >
                {/* Kart Üst Bilgisi */}
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      currentCard.box === 3
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                        : currentCard.box === 2
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-400/30'
                    }`}
                  >
                    {currentCard.box === 3 ? 'Kutu 3 · Ustalaşıldı' : currentCard.box === 2 ? 'Kutu 2 · Pekiştiriliyor' : 'Kutu 1 · Tekrar Gerekiyor'}
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <RotateCw className="h-3 w-3" />
                    Çevirmek için tıkla
                  </span>
                </div>

                {/* Kart İçeriği */}
                <div className="flex flex-1 flex-col items-center justify-center text-center px-4">
                  {!isFlipped ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                        Soru / Kavram
                      </p>
                      <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
                        {currentCard.front}
                      </h3>
                      {currentCard.hint && (
                        <p className="text-xs text-slate-400 italic">
                          💡 İpucu: {currentCard.hint}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Akademik Açıklama & Çözüm
                      </p>
                      <p className="text-sm sm:text-base leading-relaxed text-slate-100 font-medium">
                        {currentCard.back}
                      </p>
                    </div>
                  )}
                </div>

                {/* Kart Altı */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onJumpToScene(currentCard.sceneIdx);
                      onClose();
                    }}
                    className="text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <span>▶ Bu konunun anlatıldığı bölüme git</span>
                  </button>
                  <span>Seri: {currentCard.streak} kez bilindi</span>
                </div>
              </div>

              {/* Değerlendirme Butonları (Kart çevrildikten sonra) */}
              <div className="flex items-center justify-center gap-3 w-full pt-1">
                <button
                  onClick={() => handleAnswer('hard')}
                  className="flex-1 rounded-2xl border border-rose-500/30 bg-rose-500/10 py-2.5 px-3 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
                >
                  🔴 Tekrar Et (1 Gün)
                </button>
                <button
                  onClick={() => handleAnswer('good')}
                  className="flex-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 py-2.5 px-3 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
                >
                  🟡 Hatırladım (3 Gün)
                </button>
                <button
                  onClick={() => handleAnswer('easy')}
                  className="flex-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 px-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  🟢 Kolay / Biliyorum (7 Gün)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <Award className="h-12 w-12 text-emerald-400 mb-3" />
              <h3 className="text-base font-bold text-white">Harika! Bu grupta kart kalmadı</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Filtreyi 'Tüm Kartlar' olarak değiştirip diğer aralıklı tekrar kartlarınıza çalışabilirsiniz.
              </p>
              <Button
                onClick={() => setFilterBox('all')}
                className="mt-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs text-white"
              >
                Tüm Kartları Göster
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpacedRepetitionFlashcards;
