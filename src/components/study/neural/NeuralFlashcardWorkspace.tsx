import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  HelpCircle,
  Layers,
  Lightbulb,
  RotateCw,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { reviewSrsCard, syncSrsCardsFromMaterials, type ReviewQuality } from '@/lib/neural/studyPlanner';
import { cn } from '@/lib/utils';
import type { FlashcardItem, StudyMaterial } from '@/types/study';

interface NeuralFlashcardWorkspaceProps {
  material: StudyMaterial;
  onRecordProgress: (score: number, total: number) => Promise<void> | void;
  onAskCoach: (prompt: string) => void;
}

export function NeuralFlashcardWorkspace({
  material,
  onRecordProgress,
  onAskCoach,
}: NeuralFlashcardWorkspaceProps) {
  const sourceCards: FlashcardItem[] = useMemo(
    () => (Array.isArray(material.content?.cards) ? material.content.cards : []),
    [material.content],
  );

  const [order, setOrder] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [mastered, setMastered] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setOrder(sourceCards.map((_, i) => i));
    setCursor(0);
    setFlipped(false);
    setShowHint(false);
    setMastered({});
    syncSrsCardsFromMaterials([material]);
  }, [material, sourceCards]);

  if (sourceCards.length === 0) {
    return (
      <div className="neural-card p-8 text-center text-sm text-muted-foreground">
        Bu materyalde henüz flashcard bulunmuyor.
      </div>
    );
  }

  const cardIdx = order[cursor] ?? 0;
  const card = sourceCards[cardIdx];
  const masteredCount = Object.values(mastered).filter(Boolean).length;
  const pct = Math.round((masteredCount / sourceCards.length) * 100);

  const handleShuffle = () => {
    const copy = [...order];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setOrder(copy);
    setCursor(0);
    setFlipped(false);
  };

  const advanceCard = () => {
    setFlipped(false);
    setShowHint(false);
    setCursor((c) => (c + 1 < sourceCards.length ? c + 1 : 0));
  };

  const handleSm2Rate = (quality: ReviewQuality) => {
    reviewSrsCard(`${material.id}::fc::${cardIdx}`, quality);
    if (quality >= 4) {
      const nextMap = { ...mastered, [cardIdx]: true };
      setMastered(nextMap);
      const count = Object.values(nextMap).filter(Boolean).length;
      void onRecordProgress(count, sourceCards.length);
    } else {
      setMastered((prev) => ({ ...prev, [cardIdx]: false }));
    }
    advanceCard();
  };

  return (
    <div className="space-y-4">
      {/* Header Progress HUD */}
      <div className="neural-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Layers className="h-3.5 w-3.5 text-emerald-500" />
            Kart {cursor + 1} / {sourceCards.length}
          </Badge>
          {card.topic && (
            <Badge variant="secondary" className="text-xs">
              {card.topic}
            </Badge>
          )}
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-300">
            {masteredCount}/{sourceCards.length} öğrenildi (%{pct})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleShuffle} className="gap-1.5 text-xs">
            <Shuffle className="h-3.5 w-3.5" />
            Karıştır
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onAskCoach(`"${card.front}" kartındaki kavramı gerçek ekonomi örneğiyle anlatır mısın?`)
            }
            className="gap-1.5 text-xs text-primary"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Koça Sor
          </Button>
        </div>
      </div>

      <Progress value={pct} className="h-1.5" />

      {/* 3D GPU-Composited Flip Card Stage */}
      <div style={{ perspective: '1200px' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          className={cn(
            'neural-card relative min-h-[260px] cursor-pointer p-6 sm:p-8 flex flex-col justify-between transition-transform duration-300',
            flipped && 'border-cyan-500/45 bg-cyan-500/5',
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-primary">
              {flipped ? 'Akademik Cevap & Açıklama' : 'Soru / Kavram'}
            </span>
            <span className="flex items-center gap-1">
              <RotateCw className="h-3.5 w-3.5" />
              Çevirmek için tıkla
            </span>
          </div>

          <div className="my-6 flex-1 flex flex-col items-center justify-center text-center">
            {!flipped ? (
              <div className="max-w-xl space-y-3">
                <AcademicMarkdown
                  content={card.front}
                  className="text-base font-bold leading-relaxed sm:text-xl"
                />
                {showHint && card.hint && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                    İpucu: {card.hint}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-xl space-y-3 text-left sm:text-center">
                <AcademicMarkdown
                  content={card.back}
                  className="text-sm font-medium leading-relaxed sm:text-base"
                />
                {card.examTip && (
                  <div className="rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-xs">
                    <span className="font-bold text-primary">Sınav İpucu: </span>
                    {card.examTip}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            {card.hint && !flipped ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHint((s) => !s);
                }}
                className="gap-1.5 text-xs text-amber-500"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                {showHint ? 'İpucunu Gizle' : 'İpucu Göster'}
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                SM-2 aralıklı tekrar ile senkronize
              </span>
            )}
            <Badge variant="outline" className="text-[10px]">
              {card.difficulty === 'hard' ? 'İleri' : card.difficulty === 'easy' ? 'Temel' : 'Orta'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Mastery & SM-2 Rating Controls */}
      <div className="neural-card flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => handleSm2Rate(1)} className="text-xs">
            Tekrar Et (1g)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleSm2Rate(3)} className="text-xs">
            Zorlandım
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleSm2Rate(4)}
            className="gap-1.5 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
            İyi Hatırladım
          </Button>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => handleSm2Rate(5)}
          className="gradient-cta gap-1.5 text-xs"
        >
          <CheckCircle2 className="h-4 w-4" />
          Bunu Tam Öğrendim
        </Button>
      </div>
    </div>
  );
}
