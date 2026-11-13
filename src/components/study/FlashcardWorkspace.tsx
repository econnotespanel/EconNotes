import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FlipHorizontal,
  Lightbulb,
  MessageSquarePlus,
  RotateCcw,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { FlashcardItem, StudyMaterial } from '@/types/study';

interface FlashcardWorkspaceProps {
  material: StudyMaterial;
  onRecordProgress: (score: number, total: number) => Promise<void> | void;
  onAskCoach: (prompt: string) => void;
}

export function FlashcardWorkspace({
  material,
  onRecordProgress,
  onAskCoach,
}: FlashcardWorkspaceProps) {
  const baseCards: FlashcardItem[] = useMemo(
    () => (Array.isArray(material.content?.cards) ? material.content.cards : []),
    [material.content],
  );

  const [order, setOrder] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [mastery, setMastery] = useState<Record<number, 'known' | 'review'>>({});
  const [reviewOnly, setReviewOnly] = useState(false);
  const [savedRound, setSavedRound] = useState(false);

  useEffect(() => {
    setOrder(baseCards.map((_, i) => i));
    setCursor(0);
    setFlipped(false);
    setShowHint(false);
    setMastery({});
    setReviewOnly(false);
    setSavedRound(false);
  }, [material.id, baseCards]);

  const activeIndices = useMemo(() => {
    if (!reviewOnly) return order;
    return order.filter((idx) => mastery[idx] !== 'known');
  }, [order, reviewOnly, mastery]);

  const currentRealIdx = activeIndices[cursor] ?? activeIndices[0] ?? 0;
  const currentCard = baseCards[currentRealIdx];

  const handleMark = useCallback(
    (status: 'known' | 'review') => {
      if (!currentCard) return;
      const updated = { ...mastery, [currentRealIdx]: status };
      setMastery(updated);
      setFlipped(false);
      setShowHint(false);

      const knownCount = Object.values(updated).filter((v) => v === 'known').length;
      if (Object.keys(updated).length >= baseCards.length && !savedRound) {
        setSavedRound(true);
        void onRecordProgress(knownCount, baseCards.length);
      }

      if (cursor < activeIndices.length - 1) {
        setCursor((c) => c + 1);
      } else {
        setCursor(0);
      }
    },
    [activeIndices.length, baseCards.length, currentCard, currentRealIdx, cursor, mastery, onRecordProgress, savedRound],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowRight') {
        setFlipped(false);
        setShowHint(false);
        setCursor((c) => (activeIndices.length > 0 ? (c + 1) % activeIndices.length : 0));
      } else if (e.code === 'ArrowLeft') {
        setFlipped(false);
        setShowHint(false);
        setCursor((c) =>
          activeIndices.length > 0 ? (c - 1 + activeIndices.length) % activeIndices.length : 0,
        );
      } else if (e.key === '1') {
        handleMark('review');
      } else if (e.key === '2') {
        handleMark('known');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndices.length, handleMark]);

  const handleShuffle = () => {
    const copy = [...order];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setOrder(copy);
    setCursor(0);
    setFlipped(false);
    setShowHint(false);
  };

  if (baseCards.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Bu sette bilgi kartı bulunamadı.
        </CardContent>
      </Card>
    );
  }

  const knownCount = Object.values(mastery).filter((v) => v === 'known').length;
  const masteryPct = Math.round((knownCount / baseCards.length) * 100);

  return (
    <div className="space-y-5">
      {/* Control Ribbon */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {activeIndices.length > 0 ? `${cursor + 1} / ${activeIndices.length}` : '0 / 0'} Kart
            </Badge>
            <Badge variant="outline" className="text-xs">
              Hakimiyet: %{masteryPct} ({knownCount}/{baseCards.length})
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={reversed ? 'default' : 'outline'}
              onClick={() => {
                setReversed((r) => !r);
                setFlipped(false);
              }}
              className="gap-1.5 text-xs"
            >
              <FlipHorizontal className="h-3.5 w-3.5" />
              {reversed ? 'Arka → Ön' : 'Ön → Arka'}
            </Button>

            <Button type="button" size="sm" variant="outline" onClick={handleShuffle} className="gap-1.5 text-xs">
              <Shuffle className="h-3.5 w-3.5" />
              Karıştır
            </Button>

            <Button
              type="button"
              size="sm"
              variant={reviewOnly ? 'default' : 'outline'}
              onClick={() => {
                setReviewOnly((r) => !r);
                setCursor(0);
                setFlipped(false);
              }}
              className="text-xs"
            >
              {reviewOnly ? 'Tüm Kartları Göster' : 'Yalnızca Bilmediklerim'}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMastery({});
                setReviewOnly(false);
                setSavedRound(false);
                setCursor(0);
                setFlipped(false);
              }}
              className="gap-1 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Sıfırla
            </Button>
          </div>
        </CardContent>
        <Progress value={masteryPct} className="h-1 rounded-none" />
      </Card>

      {activeIndices.length === 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center p-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Tüm kartlarda tam hakimiyet!</h3>
            <p className="text-xs text-muted-foreground">
              Bu destedeki bütün bilgi kartlarını bildin olarak işaretledin.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setReviewOnly(false);
                setCursor(0);
              }}
            >
              Tüm Kartlara Dön
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setFlipped((f) => !f);
            }}
            className="min-h-[300px] cursor-pointer border-2 border-border bg-card shadow-sm transition-all hover:border-primary/50"
          >
            <CardContent className="flex min-h-[300px] flex-col justify-between p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant={flipped ? 'default' : 'secondary'}>
                    {flipped
                      ? reversed
                        ? 'Soru / Kavram'
                        : 'Cevap & Açıklama'
                      : reversed
                      ? 'Cevaptan Kavrama'
                      : 'Soru / İstem'}
                  </Badge>
                  {currentCard.topic && <Badge variant="outline">{currentCard.topic}</Badge>}
                  {currentCard.difficulty && (
                    <Badge variant="outline" className="text-[11px]">
                      {currentCard.difficulty === 'hard'
                        ? 'Zor'
                        : currentCard.difficulty === 'easy'
                        ? 'Kolay'
                        : 'Orta'}
                    </Badge>
                  )}
                </div>

                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  Çevirmek için tıkla veya Boşluk tuşuna bas
                </span>
              </div>

              <div className="my-6 flex flex-1 items-center justify-center text-center">
                <div className="w-full max-w-2xl">
                  <AcademicMarkdown
                    content={
                      flipped
                        ? reversed
                          ? currentCard.front
                          : currentCard.back
                        : reversed
                        ? currentCard.back
                        : currentCard.front
                    }
                    className={
                      flipped
                        ? 'text-sm sm:text-base leading-relaxed text-foreground'
                        : 'text-base sm:text-xl font-semibold leading-snug text-foreground'
                    }
                  />
                </div>
              </div>

              <div
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  {currentCard.hint && !flipped && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowHint((h) => !h)}
                      className="h-8 gap-1 text-xs text-muted-foreground"
                    >
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      {showHint ? currentCard.hint : 'İpucu Göster'}
                    </Button>
                  )}
                  {flipped && currentCard.examTip && (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      Sınav Tüyosu: {currentCard.examTip}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAskCoach(
                      `Şu bilgi kartını derinlemesine açıklar mısın?\n\nKart Ön: ${currentCard.front}\nKart Arka: ${currentCard.back}`,
                    )
                  }
                  className="h-8 gap-1 text-xs"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                  Hocaya Sor
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFlipped(false);
                  setShowHint(false);
                  setCursor((c) => (c - 1 + activeIndices.length) % activeIndices.length);
                }}
              >
                ← Önceki
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFlipped(false);
                  setShowHint(false);
                  setCursor((c) => (c + 1) % activeIndices.length);
                }}
              >
                Sonraki →
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleMark('review')}
                className="border-amber-500/40 hover:bg-amber-500/10"
              >
                1 • Tekrar Etmem Lazım
              </Button>
              <Button type="button" onClick={() => handleMark('known')} className="gap-1.5">
                2 • Bunu Tam Öğrendim
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
