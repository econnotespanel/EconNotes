import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  FileText,
  Flame,
  Layers,
  Loader2,
  Network,
  Plus,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Target,
  Timer,
  Trash2,
  Video,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  DifficultyLevel,
  ExamStudyMode,
  MaterialType,
  PinnedStudyNote,
  QuizFormat,
  StudioGenerationSettings,
  StudyMaterial,
  StudyProgressRow,
} from '@/types/study';

interface NotebookToolsPanelProps {
  activeSourceCount: number;
  notebookMaterials: StudyMaterial[];
  allMaterials: StudyMaterial[];
  pinnedNotes: PinnedStudyNote[];
  progress: StudyProgressRow[];
  dueCardsCount: number;
  settings: StudioGenerationSettings;
  onSettingsChange: (next: StudioGenerationSettings) => void;
  isGenerating: boolean;
  generationPct: number;
  generationLabel: string;
  onGenerateType: (type: MaterialType) => void;
  onOpenMindMap: () => void;
  onOpenPlanner: () => void;
  onOpenExamSim: () => void;
  onOpenMaterial: (mat: StudyMaterial) => void;
  onDeleteMaterial: (id: string) => void;
  onAddManualNote: (title: string, content: string) => void;
  onDeletePinnedNote: (noteId: string) => void;
  onPromotePinnedToSource: (note: PinnedStudyNote) => void;
}

const MATERIAL_META: Record<
  MaterialType,
  { label: string; icon: typeof FileText; color: string; bg: string }
> = {
  summary: {
    label: 'Ders Özeti',
    icon: FileText,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  video: {
    label: 'Videolu Ders',
    icon: Video,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  quiz: {
    label: 'Deneme Sınavı',
    icon: Sparkles,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  flashcards: {
    label: 'Çalışma Kartı',
    icon: Layers,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
};

export function NotebookToolsPanel({
  activeSourceCount,
  notebookMaterials,
  allMaterials,
  pinnedNotes,
  progress,
  dueCardsCount,
  settings,
  onSettingsChange,
  isGenerating,
  generationPct,
  generationLabel,
  onGenerateType,
  onOpenMindMap,
  onOpenPlanner,
  onOpenExamSim,
  onOpenMaterial,
  onDeleteMaterial,
  onAddManualNote,
  onDeletePinnedNote,
  onPromotePinnedToSource,
}: NotebookToolsPanelProps) {
  const [feedFilter, setFeedFilter] = useState<'all' | 'materials' | 'notes'>('all');
  const [showAllLibrary, setShowAllLibrary] = useState(false);
  const [manualNoteOpen, setManualNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [viewingNote, setViewingNote] = useState<PinnedStudyNote | null>(null);

  const visibleMaterials = useMemo(() => {
    if (showAllLibrary || notebookMaterials.length === 0) {
      return allMaterials.slice(0, 15);
    }
    return notebookMaterials;
  }, [notebookMaterials, allMaterials, showAllLibrary]);

  const avgScore = useMemo(() => {
    if (progress.length === 0) return null;
    const sum = progress.reduce(
      (acc, r) => acc + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0),
      0,
    );
    return Math.round(sum / progress.length);
  }, [progress]);

  const applyExamMode = (mode: ExamStudyMode) => {
    onSettingsChange({
      ...settings,
      examMode: mode,
      summaryDepth:
        mode === 'cram_24h'
          ? 'standard'
          : mode === 'large_note'
          ? 'textbook'
          : 'comprehensive',
      pedagogicalStyle:
        mode === 'cram_24h'
          ? 'exam_blitz'
          : mode === 'deep_mastery'
          ? 'feynman'
          : 'balanced',
      deepResearch: mode === 'deep_mastery',
    });
  };

  const handleSaveManualNote = () => {
    const cleanBody = noteBody.trim();
    if (!cleanBody) return;
    onAddManualNote(noteTitle.trim() || 'Çalışma Notu', cleanBody);
    setNoteTitle('');
    setNoteBody('');
    setManualNoteOpen(false);
  };

  const studioTiles = [
    {
      id: 'summary',
      title: 'Ayrıntılı Özet',
      subtitle: 'Rehber & öncelik haritası',
      icon: FileText,
      tone: 'border-blue-500/25 bg-blue-500/[0.06] hover:border-blue-500/50 hover:bg-blue-500/[0.11]',
      iconTone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
      onClick: () => onGenerateType('summary'),
    },
    {
      id: 'video',
      title: 'Videolu Ders',
      subtitle: 'Sesli & slaytlı anlatım',
      icon: Video,
      tone: 'border-violet-500/25 bg-violet-500/[0.06] hover:border-violet-500/50 hover:bg-violet-500/[0.11]',
      iconTone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      onClick: () => onGenerateType('video'),
    },
    {
      id: 'quiz',
      title: 'Deneme Sınavı',
      subtitle: `${settings.questionCount} soruluk test`,
      icon: Sparkles,
      tone: 'border-amber-500/25 bg-amber-500/[0.06] hover:border-amber-500/50 hover:bg-amber-500/[0.11]',
      iconTone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      onClick: () => onGenerateType('quiz'),
    },
    {
      id: 'flashcards',
      title: 'Çalışma Kartı',
      subtitle: `${settings.cardCount} SM-2 kart`,
      icon: Layers,
      tone: 'border-emerald-500/25 bg-emerald-500/[0.06] hover:border-emerald-500/50 hover:bg-emerald-500/[0.11]',
      iconTone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      onClick: () => onGenerateType('flashcards'),
    },
    {
      id: 'mindmap',
      title: 'Kavram Haritası',
      subtitle: 'İnteraktif zihin ağı',
      icon: Network,
      tone: 'border-cyan-500/25 bg-cyan-500/[0.06] hover:border-cyan-500/50 hover:bg-cyan-500/[0.11]',
      iconTone: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
      onClick: onOpenMindMap,
    },
    {
      id: 'planner',
      title: 'Sınav Planı',
      subtitle: dueCardsCount > 0 ? `${dueCardsCount} tekrar kartı` : 'Günlük yol haritası',
      icon: CalendarClock,
      tone: 'border-rose-500/25 bg-rose-500/[0.06] hover:border-rose-500/50 hover:bg-rose-500/[0.11]',
      iconTone: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
      onClick: onOpenPlanner,
    },
  ];

  return (
    <div className="flex h-full min-h-[540px] flex-col rounded-2xl border border-border/75 bg-card/95 shadow-xs lg:h-[calc(100vh-12.5rem)] lg:min-h-[620px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-foreground">Stüdyo</h2>
            <p className="text-[11px] text-muted-foreground">
              Tek tıkla çalışma aracı üret
            </p>
          </div>
        </div>

        {/* Compact Studio Settings Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 rounded-xl px-2.5 text-xs"
              title="Üretim ve sınav ayarlarını özelleştir"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ayarlar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3.5 rounded-2xl p-4">
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-foreground">Stüdyo Üretim Tercihleri</h4>
              <p className="text-[11px] text-muted-foreground">
                Özet, sınav ve çalışma kartı üretim derinliğini ayarla.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold">Sınav Hazırlık Modu</Label>
              <Select
                value={settings.examMode || 'balanced'}
                onValueChange={(v) => applyExamMode(v as ExamStudyMode)}
              >
                <SelectTrigger className="h-8 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Vize / Final Tam Kapsam (Önerilen)</SelectItem>
                  <SelectItem value="cram_24h">Sınava Son 24 Saat (Hızlı Kurtarma)</SelectItem>
                  <SelectItem value="large_note">Kalın / Çoklu Not Tam Tarama</SelectItem>
                  <SelectItem value="deep_mastery">Zor Konuyu Kavra (Feynman)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold">Zorluk</Label>
                <Select
                  value={settings.difficulty}
                  onValueChange={(v) =>
                    onSettingsChange({ ...settings, difficulty: v as DifficultyLevel })
                  }
                >
                  <SelectTrigger className="h-8 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Karma</SelectItem>
                    <SelectItem value="easy">Temel</SelectItem>
                    <SelectItem value="medium">Orta</SelectItem>
                    <SelectItem value="hard">Zor (Sınav)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold">Soru Formatı</Label>
                <Select
                  value={settings.quizFormat}
                  onValueChange={(v) =>
                    onSettingsChange({ ...settings, quizFormat: v as QuizFormat })
                  }
                >
                  <SelectTrigger className="h-8 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Çoktan Seçmeli</SelectItem>
                    <SelectItem value="mixed">Karma</SelectItem>
                    <SelectItem value="open_ended">Klasik / Açık Uçlu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">Soru Sayısı</span>
                <span className="font-mono text-primary font-bold">{settings.questionCount}</span>
              </div>
              <Slider
                min={5}
                max={25}
                step={1}
                value={[settings.questionCount]}
                onValueChange={([v]) => onSettingsChange({ ...settings, questionCount: v })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">Çalışma Kartı Sayısı</span>
                <span className="font-mono text-primary font-bold">{settings.cardCount}</span>
              </div>
              <Slider
                min={8}
                max={30}
                step={2}
                value={[settings.cardCount]}
                onValueChange={([v]) => onSettingsChange({ ...settings, cardCount: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold">Özel Odak Talimatı (Opsiyonel)</Label>
              <Input
                value={settings.customPrompt}
                onChange={(e) =>
                  onSettingsChange({ ...settings, customPrompt: e.target.value })
                }
                placeholder="Örn: Formüllere ve vize tuzaklarına ağırlık ver"
                className="h-8 rounded-xl text-xs"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Scrollable Studio Body */}
      <ScrollArea className="flex-1 px-3.5 py-3.5">
        <div className="space-y-4">
          {/* 2x3 NotebookLM Studio Production Tiles */}
          <div className="grid grid-cols-2 gap-2">
            {studioTiles.map((tile) => {
              const Icon = tile.icon;
              const disabled =
                isGenerating &&
                ['summary', 'video', 'quiz', 'flashcards'].includes(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={disabled}
                  onClick={tile.onClick}
                  className={cn(
                    'group flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs disabled:pointer-events-none disabled:opacity-55',
                    tile.tone,
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg',
                        tile.iconTone,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-bold leading-tight text-foreground">
                      {tile.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {tile.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {activeSourceCount === 0 && (
            <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              Materyal üretmek için sol panelden en az <strong>1 kaynak</strong> ekleyip işaretle.
            </p>
          )}

          {/* Live Generation Progress */}
          {isGenerating && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Üretiliyor...
                </span>
                <span className="font-mono text-[11px] font-bold text-primary tabular-nums">
                  {generationPct}%
                </span>
              </div>
              <Progress value={generationPct} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground">
                {generationLabel || 'Kaynaklar analiz ediliyor...'}
              </p>
            </div>
          )}

          {/* Generated Artifacts & Pinned Notes Section */}
          <div className="space-y-2.5 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5 text-[11px]">
                {(
                  [
                    ['all', 'Tümü'],
                    ['materials', `Üretilen (${visibleMaterials.length})`],
                    ['notes', `Notlar (${pinnedNotes.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFeedFilter(id)}
                    className={cn(
                      'rounded-md px-2 py-1 font-medium transition-colors',
                      feedFilter === id
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setManualNoteOpen(true)}
                className="h-7 gap-1 rounded-lg px-2 text-[11px] text-primary hover:bg-primary/10"
                title="Deftere hızlı not yaz"
              >
                <Plus className="h-3 w-3" />
                Not Al
              </Button>
            </div>

            {/* Pinned Notes */}
            {(feedFilter === 'all' || feedFilter === 'notes') && pinnedNotes.length > 0 && (
              <div className="space-y-1.5">
                {pinnedNotes.map((pn) => (
                  <div
                    key={pn.id}
                    className="group rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-2.5 transition-colors hover:border-amber-500/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingNote(pn)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <p className="truncate text-xs font-semibold text-foreground">
                            {pn.title}
                          </p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {pn.content.replace(/[#*_`]/g, '').slice(0, 140)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePinnedNote(pn.id)}
                        className="rounded-md p-1 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                        title="Notu sil"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generated Materials */}
            {(feedFilter === 'all' || feedFilter === 'materials') && (
              <div className="space-y-1.5">
                {notebookMaterials.length > 0 && allMaterials.length > notebookMaterials.length && (
                  <div className="flex items-center justify-between px-0.5 text-[10.5px] text-muted-foreground">
                    <span>
                      {showAllLibrary ? 'Tüm Kitaplık' : 'Bu Defterin Çıktıları'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllLibrary((s) => !s)}
                      className="text-primary hover:underline font-medium"
                    >
                      {showAllLibrary ? 'Sadece bu defter' : `Tümünü gör (${allMaterials.length})`}
                    </button>
                  </div>
                )}

                {visibleMaterials.length === 0 && pinnedNotes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-6 text-center">
                    <Bookmark className="mx-auto h-5 w-5 text-muted-foreground/70" />
                    <p className="mt-1.5 text-xs font-semibold text-foreground">
                      Stüdyo çıktıların burada toplanır
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Yukarıdaki araçlarla özet, video, test üret ya da AI yanıtlarını notlara sabitle.
                    </p>
                  </div>
                ) : (
                  visibleMaterials.map((mat) => {
                    const meta = MATERIAL_META[mat.material_type] || MATERIAL_META.summary;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={mat.id}
                        className="group flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/70 p-2.5 transition-all hover:border-primary/40 hover:bg-card"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenMaterial(mat)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                              meta.bg,
                              meta.color,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              {mat.title}
                            </p>
                            <p className="truncate text-[10.5px] text-muted-foreground">
                              {meta.label} · {new Date(mat.created_at).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMaterial(mat.id)}
                          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          title="Materyali sil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom Astra AI Mastery & Exam Sim Quick Bar */}
      <div className="border-t border-border/60 bg-gradient-to-r from-primary/[0.04] via-card to-emerald-500/[0.04] p-3">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Target className="h-3.5 w-3.5 text-primary" />
            Sınav Hazırlık Durumu
          </span>
          <span className="font-mono text-[11px] font-bold text-primary">
            {avgScore !== null ? `%${avgScore} başarı` : 'Hazır'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenPlanner}
            className="h-8 gap-1 rounded-xl text-[11px]"
          >
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            SM-2 ({dueCardsCount})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenExamSim}
            className="h-8 gap-1 rounded-xl text-[11px]"
          >
            <Timer className="h-3.5 w-3.5 text-violet-500" />
            Sınav Modu
          </Button>
        </div>
      </div>

      {/* Quick Manual Note Dialog */}
      <Dialog open={manualNoteOpen} onOpenChange={setManualNoteOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4 text-amber-500" />
              Yeni Çalışma Notu Ekle
            </DialogTitle>
            <DialogDescription className="text-xs">
              Defterine kendi özet notunu, formülünü veya sınav tüyonu kaydet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Not başlığı"
              className="rounded-xl text-xs"
            />
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Notunu buraya yaz..."
              className="min-h-[160px] rounded-xl text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManualNoteOpen(false)}>
              İptal
            </Button>
            <Button size="sm" disabled={!noteBody.trim()} onClick={handleSaveManualNote}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pinned Note Viewer + "Convert to Source" (NotebookLM signature!) */}
      <Dialog open={Boolean(viewingNote)} onOpenChange={(o) => !o && setViewingNote(null)}>
        <DialogContent className="max-h-[85dvh] max-w-2xl flex flex-col overflow-hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4 text-amber-500" />
              <span className="truncate">{viewingNote?.title}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {viewingNote?.sourceTag || 'Sabitlenen çalışma notu'} ·{' '}
              {viewingNote ? new Date(viewingNote.createdAt).toLocaleString('tr-TR') : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] rounded-xl border border-border/70 bg-muted/15 p-4">
            {viewingNote && <AcademicMarkdown content={viewingNote.content} />}
          </ScrollArea>
          <DialogFooter className="flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                if (!viewingNote) return;
                onPromotePinnedToSource(viewingNote);
                setViewingNote(null);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Kaynağa Dönüştür (NotebookLM)
            </Button>
            <Button type="button" size="sm" onClick={() => setViewingNote(null)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
