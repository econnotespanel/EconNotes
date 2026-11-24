import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  BookOpenCheck,
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
import type { CanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
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
  SummaryJobState,
} from '@/types/study';
import {
  STUDIO_BADGE_WARN,
  STUDIO_BTN_GHOST,
  STUDIO_BTN_ICON,
  STUDIO_BTN_SECONDARY,
  STUDIO_CARD_SUBTLE,
  STUDIO_PANEL_BODY,
  STUDIO_PANEL_FOOTER,
  STUDIO_PANEL_HEADER,
  STUDIO_PANEL_HEADER_ICON,
  STUDIO_PANEL_SHELL,
  STUDIO_SEGMENTED_ITEM_ACTIVE,
  STUDIO_SEGMENTED_ITEM_IDLE,
  STUDIO_SEGMENTED_WRAP,
  STUDIO_TOOL_TILE,
  STUDIO_TOOL_TILE_PRIMARY,
} from './studioDesign';

interface NotebookToolsPanelProps {
  activeSourceCount: number;
  canonicalAnalysis: CanonicalSourceAnalysis;
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
  activeSummaryJob?: SummaryJobState | null;
  onOpenSummaryProgress?: () => void;
  onGenerateType: (type: MaterialType) => void;
  onRequestCourseConfirm?: () => void;
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
    label: 'Ayrıntılı Özet',
    icon: FileText,
    color: 'text-primary',
    bg: 'bg-primary/10 border-primary/20',
  },
  video: {
    label: 'Videolu Ders',
    icon: Video,
    color: 'text-primary',
    bg: 'bg-primary/[0.07] border-border/80',
  },
  quiz: {
    label: 'Deneme Sınavı',
    icon: Sparkles,
    color: 'text-primary',
    bg: 'bg-primary/[0.07] border-border/80',
  },
  flashcards: {
    label: 'Çalışma Kartları',
    icon: Layers,
    color: 'text-primary',
    bg: 'bg-primary/[0.07] border-border/80',
  },
};

export function NotebookToolsPanel({
  activeSourceCount,
  canonicalAnalysis,
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
  activeSummaryJob,
  onOpenSummaryProgress,
  onGenerateType,
  onRequestCourseConfirm,
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
      title: 'Ayrıntılı Özet Oluştur',
      subtitle: '10 aşamalı derin analiz & PDF',
      icon: FileText,
      primary: true,
      onClick: () => onGenerateType('summary'),
    },
    {
      id: 'video',
      title: 'Videolu Ders',
      subtitle: 'Slaytlı & sesli anlatım',
      icon: Video,
      primary: false,
      onClick: () => onGenerateType('video'),
    },
    {
      id: 'quiz',
      title: 'Deneme Sınavı',
      subtitle: `${settings.questionCount} soruluk test`,
      icon: Sparkles,
      primary: false,
      onClick: () => onGenerateType('quiz'),
    },
    {
      id: 'flashcards',
      title: 'Çalışma Kartları',
      subtitle: `${settings.cardCount} tekrar kartı`,
      icon: Layers,
      primary: false,
      onClick: () => onGenerateType('flashcards'),
    },
    {
      id: 'mindmap',
      title: 'Kavram Haritası',
      subtitle: 'İnteraktif kavram ağı',
      icon: Network,
      primary: false,
      onClick: onOpenMindMap,
    },
    {
      id: 'planner',
      title: 'Sınav Planı',
      subtitle: dueCardsCount > 0 ? `${dueCardsCount} tekrar kartı` : 'Günlük yol haritası',
      icon: CalendarClock,
      primary: false,
      onClick: onOpenPlanner,
    },
  ];

  return (
    <div className={STUDIO_PANEL_SHELL}>
      {/* Unified Right Panel Header */}
      <div className={STUDIO_PANEL_HEADER}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={STUDIO_PANEL_HEADER_ICON}>
            <Sparkles className="h-4 w-4" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
              Yapay Zekâ Araçları
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">
              Tek tıkla çalışma materyali üret
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
              className={cn(STUDIO_BTN_SECONDARY, 'h-8 shrink-0 gap-1.5 px-2.5')}
              title="Üretim ve sınav ayarlarını özelleştir"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Ayarlar</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-3.5 rounded-2xl p-4">
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
      <div className={STUDIO_PANEL_BODY}>
        <div className="min-w-0 space-y-3.5">
          {/* Shared Canonical Analysis Status Card */}
          {activeSourceCount > 0 && (
            <div className={cn(STUDIO_CARD_SUBTLE, 'bg-muted/25 px-3 py-2.5 text-xs')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
                  <BookOpenCheck className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.85} />
                  <span className="truncate">
                    {canonicalAnalysis.primaryCourseLabel
                      ? canonicalAnalysis.isMultiCourse
                        ? `${canonicalAnalysis.distinctCourses.length} Ayrı Ders Senkron`
                        : canonicalAnalysis.primaryCourseLabel
                      : 'Ders seçimi bekleniyor'}
                  </span>
                </span>
                {canonicalAnalysis.syncedSummaryMaterial && (
                  <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Ortak Analiz
                  </span>
                )}
              </div>
              {canonicalAnalysis.isMultiCourse && (
                <p className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">
                  {canonicalAnalysis.distinctCourses.join(' · ')} — her ders kendi kaynağında ayrı korunur.
                </p>
              )}
              {canonicalAnalysis.hasUnconfirmedCourses && onRequestCourseConfirm && (
                <button
                  type="button"
                  onClick={onRequestCourseConfirm}
                  className={cn(
                    STUDIO_BADGE_WARN,
                    'mt-2 flex w-full justify-center py-1.5 text-[11px] transition-colors hover:bg-amber-500/20',
                  )}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {canonicalAnalysis.unconfirmedSources.length} kaynağın dersini seç
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Unified Minimalist AI Tool Tiles — consistent EconNotes blue/slate hierarchy */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
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
                  className={tile.primary ? STUDIO_TOOL_TILE_PRIMARY : STUDIO_TOOL_TILE}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                        tile.primary
                          ? 'border-transparent bg-[#003791] text-white'
                          : 'border-border/80 bg-muted/40 text-primary group-hover:border-primary/30 group-hover:bg-primary/10',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.85} />
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-2.5 min-w-0">
                    <p className="break-words text-xs font-semibold leading-snug text-foreground">
                      {tile.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                      {tile.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {activeSourceCount === 0 && (
            <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Materyal üretmek için sol panelden en az <strong className="text-foreground">1 kaynak</strong> ekleyip seç.
            </p>
          )}

          {/* Background Multi-Stage Summary Job Live Card */}
          {activeSummaryJob &&
            (activeSummaryJob.status === 'queued' ||
              activeSummaryJob.status === 'processing' ||
              activeSummaryJob.status === 'failed') && (
              <div className="space-y-2 rounded-xl border border-primary/35 bg-primary/[0.06] p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold text-primary">
                    {activeSummaryJob.status === 'failed' ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    )}
                    <span className="truncate">
                      {activeSummaryJob.status === 'failed'
                        ? 'Özet analizi durakladı'
                        : `Aşama ${activeSummaryJob.currentStage}/10 · ${activeSummaryJob.title}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-primary tabular-nums">
                    %{Math.min(99, activeSummaryJob.progressPct)}
                  </span>
                </div>
                <Progress value={Math.min(99, activeSummaryJob.progressPct)} className="h-1.5" />
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    Sayfa: {activeSummaryJob.processedPages}/{activeSummaryJob.totalPages} · Bölüm:{' '}
                    {activeSummaryJob.completedChunks}/{activeSummaryJob.totalChunks}
                  </span>
                  {onOpenSummaryProgress && (
                    <button
                      type="button"
                      onClick={onOpenSummaryProgress}
                      className="shrink-0 font-semibold text-primary hover:underline"
                    >
                      İlerlemeyi Aç →
                    </button>
                  )}
                </div>
              </div>
            )}

          {/* Live Generation Progress (Quiz / Flashcards / Video) */}
          {isGenerating && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 font-semibold text-primary">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span className="truncate">Materyal oluşturuluyor...</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-primary tabular-nums">
                  {generationPct}%
                </span>
              </div>
              <Progress value={generationPct} className="h-1.5" />
              <p className="break-words text-[11px] text-muted-foreground">
                {generationLabel || 'Kaynaklar analiz ediliyor...'}
              </p>
            </div>
          )}

          {/* Generated Artifacts & Pinned Notes Section */}
          <div className="min-w-0 space-y-2.5 border-t border-border/70 pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className={cn(STUDIO_SEGMENTED_WRAP, 'text-[11px]')}>
                {(
                  [
                    ['all', 'Tümü'],
                    ['materials', `Çıktı (${visibleMaterials.length})`],
                    ['notes', `Not (${pinnedNotes.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFeedFilter(id)}
                    className={cn(
                      feedFilter === id
                        ? STUDIO_SEGMENTED_ITEM_ACTIVE
                        : STUDIO_SEGMENTED_ITEM_IDLE,
                      'px-2 py-1 text-[11px]',
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
                className={cn(STUDIO_BTN_GHOST, 'h-8 shrink-0 gap-1 px-2 text-primary hover:bg-primary/10 hover:text-primary')}
                title="Deftere hızlı not yaz"
              >
                <Plus className="h-3.5 w-3.5" />
                Not Al
              </Button>
            </div>

            {/* Pinned Notes */}
            {(feedFilter === 'all' || feedFilter === 'notes') && pinnedNotes.length > 0 && (
              <div className="space-y-2">
                {pinnedNotes.map((pn) => (
                  <div
                    key={pn.id}
                    className={cn(
                      STUDIO_CARD_SUBTLE,
                      'group p-2.5 hover:border-primary/40 hover:bg-card',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingNote(pn)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <StickyNote className="h-3.5 w-3.5 shrink-0 text-primary" />
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
                        className={cn(
                          STUDIO_BTN_ICON,
                          'h-7 w-7 opacity-65 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100',
                        )}
                        title="Notu sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generated Materials */}
            {(feedFilter === 'all' || feedFilter === 'materials') && (
              <div className="space-y-2">
                {notebookMaterials.length > 0 && allMaterials.length > notebookMaterials.length && (
                  <div className="flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
                    <span>
                      {showAllLibrary ? 'Tüm Kitaplık' : 'Bu Defterin Çıktıları'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllLibrary((s) => !s)}
                      className="font-medium text-primary hover:underline"
                    >
                      {showAllLibrary ? 'Sadece bu defter' : `Tümünü gör (${allMaterials.length})`}
                    </button>
                  </div>
                )}

                {visibleMaterials.length === 0 && pinnedNotes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-6 text-center">
                    <Bookmark className="mx-auto h-5 w-5 text-muted-foreground/70" />
                    <p className="mt-1.5 text-xs font-semibold text-foreground">
                      Oluşturulan materyaller burada toplanır
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Yukarıdaki araçlarla özet, sınav veya çalışma kartı üretebilirsin.
                    </p>
                  </div>
                ) : (
                  visibleMaterials.map((mat) => {
                    const meta = MATERIAL_META[mat.material_type] || MATERIAL_META.summary;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={mat.id}
                        className={cn(
                          STUDIO_CARD_SUBTLE,
                          'group flex items-center justify-between gap-2 p-2.5 hover:border-primary/40 hover:bg-card',
                        )}
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
                            <Icon className="h-4 w-4" strokeWidth={1.85} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                              {mat.title}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {meta.label}
                              {mat.course ? ` · ${mat.course}` : ''} ·{' '}
                              {new Date(mat.created_at).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMaterial(mat.id)}
                          className={cn(
                            STUDIO_BTN_ICON,
                            'h-7 w-7 opacity-65 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100',
                          )}
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
      </div>

      {/* Unified Footer: Sınav Hazırlık Quick Bar */}
      <div className={STUDIO_PANEL_FOOTER}>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
            <Target className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Sınav Hazırlık</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-primary">
            {avgScore !== null ? `%${avgScore} başarı` : 'Hazır'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenPlanner}
            className={cn(STUDIO_BTN_SECONDARY, 'h-8 min-w-0 gap-1.5 px-2.5 text-[11px]')}
          >
            <Flame className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">SM-2 ({dueCardsCount})</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenExamSim}
            className={cn(STUDIO_BTN_SECONDARY, 'h-8 min-w-0 gap-1.5 px-2.5 text-[11px]')}
          >
            <Timer className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">Sınav Modu</span>
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
