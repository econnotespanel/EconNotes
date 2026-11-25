import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  FolderOpen,
  Layers,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { COMMON_UNIVERSITY_COURSES } from '@/lib/courseDetector';
import type { CanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
import { cn } from '@/lib/utils';
import type {
  CoachMode,
  ExtractedSourceItem,
  MaterialType,
  NotebookAttachmentImage,
  NotebookChatMessage,
  NoteSourceOption,
  PinnedStudyNote,
  StudioGenerationSettings,
  StudioNotebook,
  StudyMaterial,
  StudyProgressRow,
  SummaryJobState,
} from '@/types/study';
import { NotebookMindMapDialog } from './NotebookMindMapDialog';
import { NotebookSourcesPanel } from './NotebookSourcesPanel';
import { NotebookToolsPanel } from './NotebookToolsPanel';
import { NotebookTutorChat } from './NotebookTutorChat';
import {
  STUDIO_BADGE_COURSE,
  STUDIO_BADGE_WARN,
  STUDIO_BTN_ICON,
  STUDIO_BTN_SECONDARY,
} from './studioDesign';

const EMOJI_CHOICES = ['📘', '🧠', '🎯', '📐', '⚖️', '🧬', '💻', '📊', '📚', '✨'];
const PANEL_LAYOUT_STORAGE_KEY = 'econnotes_studio_panel_layout_v2';
const DEFAULT_LEFT_WIDTH = 252;
const DEFAULT_RIGHT_WIDTH = 284;
const MIN_LEFT_WIDTH = 220;
const MAX_LEFT_WIDTH = 420;
const MIN_RIGHT_WIDTH = 256;
const MAX_RIGHT_WIDTH = 440;

interface StudioPanelLayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

function loadPanelLayout(): StudioPanelLayoutState {
  if (typeof window === 'undefined') {
    return {
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftCollapsed: false,
      rightCollapsed: false,
    };
  }
  try {
    const raw = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as Partial<StudioPanelLayoutState>;
    return {
      leftWidth: Math.min(
        MAX_LEFT_WIDTH,
        Math.max(MIN_LEFT_WIDTH, Number(parsed.leftWidth) || DEFAULT_LEFT_WIDTH),
      ),
      rightWidth: Math.min(
        MAX_RIGHT_WIDTH,
        Math.max(MIN_RIGHT_WIDTH, Number(parsed.rightWidth) || DEFAULT_RIGHT_WIDTH),
      ),
      leftCollapsed: Boolean(parsed.leftCollapsed),
      rightCollapsed: Boolean(parsed.rightCollapsed),
    };
  } catch {
    return {
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftCollapsed: false,
      rightCollapsed: false,
    };
  }
}

interface NotebookStudioWorkspaceProps {
  userId: string;
  notebooks: StudioNotebook[];
  activeNotebook: StudioNotebook;
  canonicalAnalysis: CanonicalSourceAnalysis;
  focusMode?: boolean;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (params: { title: string; course: string; emoji: string }) => void;
  onRenameNotebook: (id: string, title: string, course: string) => void;
  onDeleteNotebook: (id: string) => void;
  ownNotes: NoteSourceOption[];
  platformNotes: NoteSourceOption[];
  allMaterials: StudyMaterial[];
  progress: StudyProgressRow[];
  dueCardsCount: number;
  settings: StudioGenerationSettings;
  onSettingsChange: (next: StudioGenerationSettings) => void;
  coachMode: CoachMode;
  onCoachModeChange: (mode: CoachMode) => void;
  chatBusy: boolean;
  streamingText: string;
  isGenerating: boolean;
  generationPct: number;
  generationLabel: string;
  activeSummaryJob?: SummaryJobState | null;
  onOpenSummaryProgress?: () => void;
  onAddSources: (items: ExtractedSourceItem[]) => Promise<void> | void;
  onRemoveSource: (sourceId: string) => void;
  onToggleSource: (sourceId: string) => void;
  onToggleAllSources: (selectAll: boolean) => void;
  onToggleMaterialSource: (materialId: string) => void;
  onUpdateSourceCourse: (sourceId: string, course: string) => void;
  pendingCourseConfirmType: MaterialType | null;
  onCancelPendingCourseConfirm: () => void;
  onConfirmCoursesAndContinue: (assignments: Record<string, string>) => void;
  pendingMultiCourseType?: MaterialType | null;
  onCancelMultiCourseConfirm?: () => void;
  onIsolateCourseAndContinue?: (courseName: string) => void;
  onConfirmMultiCourseAndContinue?: () => void;
  onExtractRemoteNoteFile: (note: NoteSourceOption) => Promise<ExtractedSourceItem>;
  onSavedLiveMaterial: (mat: StudyMaterial) => void;
  onSendMessage: (params: {
    text: string;
    mode?: CoachMode;
    images?: NotebookAttachmentImage[];
  }) => Promise<void> | void;
  onPinMessage: (msg: NotebookChatMessage) => void;
  onClearChat: () => void;
  onGenerateType: (type: MaterialType) => void;
  onOpenPlanner: () => void;
  onOpenExamSim: () => void;
  onOpenMaterial: (mat: StudyMaterial) => void;
  onDeleteMaterial: (id: string) => void;
  onAddManualNote: (title: string, content: string) => void;
  onDeletePinnedNote: (noteId: string) => void;
  onPromotePinnedToSource: (note: PinnedStudyNote) => void;
}

export function NotebookStudioWorkspace({
  userId,
  notebooks,
  activeNotebook,
  canonicalAnalysis,
  focusMode = false,
  onSelectNotebook,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  ownNotes,
  platformNotes,
  allMaterials,
  progress,
  dueCardsCount,
  settings,
  onSettingsChange,
  coachMode,
  onCoachModeChange,
  chatBusy,
  streamingText,
  isGenerating,
  generationPct,
  generationLabel,
  activeSummaryJob,
  onOpenSummaryProgress,
  onAddSources,
  onRemoveSource,
  onToggleSource,
  onToggleAllSources,
  onToggleMaterialSource,
  onUpdateSourceCourse,
  pendingCourseConfirmType,
  onCancelPendingCourseConfirm,
  onConfirmCoursesAndContinue,
  pendingMultiCourseType = null,
  onCancelMultiCourseConfirm,
  onIsolateCourseAndContinue,
  onConfirmMultiCourseAndContinue,
  onExtractRemoteNoteFile,
  onSavedLiveMaterial,
  onSendMessage,
  onPinMessage,
  onClearChat,
  onGenerateType,
  onOpenPlanner,
  onOpenExamSim,
  onOpenMaterial,
  onDeleteMaterial,
  onAddManualNote,
  onDeletePinnedNote,
  onPromotePinnedToSource,
}: NotebookStudioWorkspaceProps) {
  const [mobilePanel, setMobilePanel] = useState<'sources' | 'chat' | 'studio'>('chat');
  const [mobileDrawer, setMobileDrawer] = useState<'sources' | 'studio' | null>(null);
  const [panelLayout, setPanelLayout] = useState<StudioPanelLayoutState>(() => loadPanelLayout());
  const [draggingSide, setDraggingSide] = useState<'left' | 'right' | null>(null);
  const dragOriginRef = useRef<{ startX: number; startWidth: number }>({
    startX: 0,
    startWidth: DEFAULT_LEFT_WIDTH,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout));
    } catch {
      // ignore storage quota
    }
  }, [panelLayout]);

  const startResize = useCallback(
    (side: 'left' | 'right', clientX: number) => {
      dragOriginRef.current = {
        startX: clientX,
        startWidth: side === 'left' ? panelLayout.leftWidth : panelLayout.rightWidth,
      };
      setDraggingSide(side);
    },
    [panelLayout.leftWidth, panelLayout.rightWidth],
  );

  useEffect(() => {
    if (!draggingSide) return;
    const handlePointerMove = (e: PointerEvent) => {
      const delta = e.clientX - dragOriginRef.current.startX;
      if (draggingSide === 'left') {
        const nextWidth = Math.min(
          MAX_LEFT_WIDTH,
          Math.max(MIN_LEFT_WIDTH, Math.round(dragOriginRef.current.startWidth + delta)),
        );
        setPanelLayout((prev) => ({ ...prev, leftWidth: nextWidth, leftCollapsed: false }));
      } else {
        const nextWidth = Math.min(
          MAX_RIGHT_WIDTH,
          Math.max(MIN_RIGHT_WIDTH, Math.round(dragOriginRef.current.startWidth - delta)),
        );
        setPanelLayout((prev) => ({ ...prev, rightWidth: nextWidth, rightCollapsed: false }));
      }
    };
    const handlePointerUp = () => setDraggingSide(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [draggingSide]);

  const toggleLeftPanel = () =>
    setPanelLayout((prev) => ({ ...prev, leftCollapsed: !prev.leftCollapsed }));
  const toggleRightPanel = () =>
    setPanelLayout((prev) => ({ ...prev, rightCollapsed: !prev.rightCollapsed }));

  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceTab, setAddSourceTab] = useState<'upload' | 'notes' | 'paste' | 'live'>('upload');
  const [mindMapOpen, setMindMapOpen] = useState(false);

  // Create / Edit notebook modal
  const [newNbOpen, setNewNbOpen] = useState(false);
  const [newNbTitle, setNewNbTitle] = useState('');
  const [newNbCourse, setNewNbCourse] = useState('');
  const [newNbEmoji, setNewNbEmoji] = useState('📘');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameCourse, setRenameCourse] = useState('');

  // Per-source course editor / confirmation modal
  const [editingCourseSource, setEditingCourseSource] = useState<ExtractedSourceItem | null>(null);
  const [courseDrafts, setCourseDrafts] = useState<Record<string, string>>({});
  const [courseFilterQuery, setCourseFilterQuery] = useState('');

  const courseDialogSources = useMemo(() => {
    if (editingCourseSource) return [editingCourseSource];
    if (pendingCourseConfirmType && canonicalAnalysis.unconfirmedSources.length > 0) {
      return canonicalAnalysis.unconfirmedSources.map((p) => p.source);
    }
    return [];
  }, [editingCourseSource, pendingCourseConfirmType, canonicalAnalysis.unconfirmedSources]);

  const courseDialogOpen = courseDialogSources.length > 0;

  useEffect(() => {
    if (!courseDialogOpen) return;
    const next: Record<string, string> = {};
    for (const s of courseDialogSources) {
      next[s.id] = s.course || s.detectedCourse || '';
    }
    setCourseDrafts(next);
    setCourseFilterQuery('');
  }, [courseDialogOpen, courseDialogSources]);

  const filteredCourseOptions = useMemo(() => {
    const q = courseFilterQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return COMMON_UNIVERSITY_COURSES;
    return COMMON_UNIVERSITY_COURSES.filter((c) => c.toLocaleLowerCase('tr-TR').includes(q));
  }, [courseFilterQuery]);

  const closeCourseDialog = () => {
    setEditingCourseSource(null);
    if (pendingCourseConfirmType) {
      onCancelPendingCourseConfirm();
    }
  };

  const handleSaveCourseDialog = () => {
    const cleaned: Record<string, string> = {};
    for (const s of courseDialogSources) {
      const val = (courseDrafts[s.id] || '').trim();
      if (!val) return;
      cleaned[s.id] = val;
    }
    if (editingCourseSource) {
      onUpdateSourceCourse(editingCourseSource.id, cleaned[editingCourseSource.id]);
      setEditingCourseSource(null);
    } else if (pendingCourseConfirmType) {
      onConfirmCoursesAndContinue(cleaned);
    }
  };

  const openConfirmForUnconfirmed = () => {
    if (canonicalAnalysis.unconfirmedSources[0]) {
      setEditingCourseSource(canonicalAnalysis.unconfirmedSources[0].source);
    }
  };

  const activeSources = useMemo(
    () => activeNotebook.sources.filter((s) => activeNotebook.checkedSourceIds.includes(s.id)),
    [activeNotebook.sources, activeNotebook.checkedSourceIds],
  );

  const activeMaterials = useMemo(
    () => allMaterials.filter((m) => activeNotebook.checkedMaterialIds.includes(m.id)),
    [allMaterials, activeNotebook.checkedMaterialIds],
  );

  const notebookMaterials = useMemo(
    () => allMaterials.filter((m) => activeNotebook.materialIds.includes(m.id)),
    [allMaterials, activeNotebook.materialIds],
  );

  const mindMapMaterials = useMemo(() => {
    const merged = [...notebookMaterials, ...activeMaterials];
    const seen = new Set<string>();
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [notebookMaterials, activeMaterials]);

  const activeSourceCount = activeSources.length + activeMaterials.length;

  const openAddSource = (tab: 'upload' | 'notes' | 'paste' | 'live') => {
    setAddSourceTab(tab);
    setAddSourceOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!newNbTitle.trim()) return;
    onCreateNotebook({
      title: newNbTitle.trim(),
      course: newNbCourse.trim(),
      emoji: newNbEmoji,
    });
    setNewNbTitle('');
    setNewNbCourse('');
    setNewNbEmoji('📘');
    setNewNbOpen(false);
  };

  const openRenameDialog = () => {
    setRenameTitle(activeNotebook.title);
    setRenameCourse(activeNotebook.course || '');
    setRenameOpen(true);
  };

  const handleRenameSubmit = () => {
    if (!renameTitle.trim()) return;
    onRenameNotebook(activeNotebook.id, renameTitle.trim(), renameCourse.trim());
    setRenameOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Unified Notebook Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[20px] border border-slate-200/85 dark:border-slate-800/90 bg-card px-3.5 py-2.5 shadow-[var(--panel-shadow)]">
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  STUDIO_BTN_SECONDARY,
                  'max-w-[175px] gap-2 rounded-full font-semibold sm:max-w-[320px]',
                )}
              >
                <span className="text-sm leading-none">{activeNotebook.emoji}</span>
                <span className="truncate">{activeNotebook.title}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 rounded-2xl p-1.5">
              <div className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Çalışma Defterlerim ({notebooks.length})
              </div>
              {notebooks.map((nb) => {
                const isActive = nb.id === activeNotebook.id;
                return (
                  <DropdownMenuItem
                    key={nb.id}
                    onClick={() => onSelectNotebook(nb.id)}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm">{nb.emoji}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{nb.title}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {nb.sources.length} kaynak{nb.course ? ` · ${nb.course}` : ''}
                        </p>
                      </div>
                    </div>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setNewNbOpen(true)}
                className="cursor-pointer gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-primary"
              >
                <Plus className="h-4 w-4" />
                Yeni Çalışma Defteri Oluştur
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canonicalAnalysis.primaryCourseLabel ? (
            <span
              className={cn(STUDIO_BADGE_COURSE, 'hidden max-w-[260px] sm:inline-flex')}
              title={`Aktif kaynak dersi: ${canonicalAnalysis.primaryCourseLabel}`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{canonicalAnalysis.primaryCourseLabel}</span>
            </span>
          ) : canonicalAnalysis.hasUnconfirmedCourses ? (
            <button
              type="button"
              onClick={openConfirmForUnconfirmed}
              className={cn(
                STUDIO_BADGE_WARN,
                'hidden transition-colors hover:bg-amber-500/20 sm:inline-flex',
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Ders Seç ({canonicalAnalysis.unconfirmedSources.length})
            </button>
          ) : activeSourceCount === 0 && activeNotebook.course ? (
            <span className={cn(STUDIO_BADGE_COURSE, 'hidden max-w-[240px] sm:inline-flex')}>
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{activeNotebook.course}</span>
            </span>
          ) : null}

          <button
            type="button"
            onClick={openRenameDialog}
            className={STUDIO_BTN_ICON}
            title="Defter adını ve dersini düzenle"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
          </button>

          {notebooks.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteNotebook(activeNotebook.id)}
              className={cn(STUDIO_BTN_ICON, 'hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive')}
              title="Bu defteri sil"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Desktop panel collapse / expand controls */}
          <div className="hidden items-center gap-1 xl:flex">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="studio-toggle-left-panel"
              onClick={toggleLeftPanel}
              title={panelLayout.leftCollapsed ? 'Kaynaklar panelini aç' : 'Kaynaklar panelini daralt'}
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            >
              {panelLayout.leftCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5 text-primary" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
              <span className="hidden 2xl:inline">Kaynaklar</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="studio-toggle-right-panel"
              onClick={toggleRightPanel}
              title={panelLayout.rightCollapsed ? 'YZ Araçları panelini aç' : 'YZ Araçları panelini daralt'}
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            >
              {panelLayout.rightCollapsed ? (
                <PanelRightOpen className="h-3.5 w-3.5 text-primary" />
              ) : (
                <PanelRightClose className="h-3.5 w-3.5" />
              )}
              <span className="hidden 2xl:inline">YZ Araçları</span>
            </Button>
          </div>

          {/* Tablet/Mobile quick overlay drawer buttons */}
          <div className="flex items-center gap-1 xl:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="studio-mobile-sources-drawer-btn"
              onClick={() => setMobileDrawer('sources')}
              className={cn(STUDIO_BTN_SECONDARY, 'h-8 gap-1 px-2.5 text-[11px]')}
              title="Kaynaklar çekmecesini aç"
            >
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Kaynaklar</span>
              {activeNotebook.sources.length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {activeNotebook.sources.length}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="studio-mobile-tools-drawer-btn"
              onClick={() => setMobileDrawer('studio')}
              className={cn(STUDIO_BTN_SECONDARY, 'h-8 gap-1 px-2.5 text-[11px]')}
              title="Yapay Zekâ Araçları çekmecesini aç"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Araçlar</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewNbOpen(true)}
            className={cn(STUDIO_BTN_SECONDARY, 'h-8 gap-1.5')}
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Yeni Defter</span>
            <span className="sm:hidden">Yeni</span>
          </Button>
        </div>
      </div>

      {/* Mobile / Tablet / Compact Laptop (< 1280px) Oval 3-Panel Segmented Switcher */}
      <div className="grid grid-cols-3 gap-1 rounded-full border border-slate-200/85 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70 p-1 xl:hidden">
        {(
          [
            ['sources', 'Kaynaklar', FolderOpen, activeNotebook.sources.length],
            ['chat', 'Çalışma Alanı', MessageSquareText, activeNotebook.messages.length],
            ['studio', 'YZ Araçları', Sparkles, notebookMaterials.length + activeNotebook.pinnedNotes.length],
          ] as const
        ).map(([id, label, Icon, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePanel(id)}
            className={cn(
              'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold transition-all',
              mobilePanel === id
                ? 'bg-gradient-to-r from-[#174ec4] to-[#2e78f6] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
            {count > 0 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  mobilePanel === id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
                )}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Resizable & Collapsible 3-Panel Full-Width Desktop Stage (>= 1280px) */}
      <div
        data-testid="studio-workspace-stage"
        className={cn(
          'flex w-full min-w-0 flex-col gap-3 xl:flex-row xl:items-stretch xl:gap-0',
          focusMode
            ? 'xl:h-[calc(100dvh-8.2rem)] xl:min-h-[520px]'
            : 'xl:h-[calc(100dvh-11.2rem)] xl:min-h-[540px]',
        )}
      >
        {/* LEFT PANEL: Kaynaklar (or collapsed rail on desktop) */}
        {panelLayout.leftCollapsed ? (
          <div
            data-testid="studio-left-rail"
            className="hidden h-full w-11 shrink-0 flex-col items-center justify-between rounded-[20px] border border-slate-200/85 bg-card py-3 shadow-[var(--panel-shadow)] dark:border-slate-800/90 xl:mr-2 xl:flex"
          >
            <button
              type="button"
              onClick={toggleLeftPanel}
              title="Kaynaklar panelini genişlet"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {activeNotebook.sources.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddSource('upload')}
              title="Kaynak ekle"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary dark:border-slate-800"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div
          data-testid="studio-left-panel"
          style={{ ['--studio-left-w' as string]: `${panelLayout.leftWidth}px` }}
          className={cn(
            'min-w-0 overflow-hidden xl:h-full xl:w-[var(--studio-left-w)] xl:shrink-0',
            mobilePanel !== 'sources' && 'hidden xl:block',
            panelLayout.leftCollapsed && 'xl:hidden',
          )}
        >
          <NotebookSourcesPanel
            userId={userId}
            sources={activeNotebook.sources}
            checkedSourceIds={activeNotebook.checkedSourceIds}
            checkedMaterialIds={activeNotebook.checkedMaterialIds}
            ownNotes={ownNotes}
            platformNotes={platformNotes}
            materials={allMaterials}
            addDialogOpen={addSourceOpen}
            onAddDialogOpenChange={setAddSourceOpen}
            addDialogInitialTab={addSourceTab}
            onAddSources={onAddSources}
            onRemoveSource={onRemoveSource}
            onToggleSource={onToggleSource}
            onToggleAllSources={onToggleAllSources}
            onToggleMaterialSource={onToggleMaterialSource}
            onEditSourceCourse={(src) => setEditingCourseSource(src)}
            onExtractRemoteNoteFile={onExtractRemoteNoteFile}
            onSavedLiveMaterial={onSavedLiveMaterial}
          />
        </div>

        {/* Left Drag Resize Splitter */}
        {!panelLayout.leftCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kaynaklar paneli genişliğini ayarla"
            aria-valuenow={panelLayout.leftWidth}
            aria-valuemin={MIN_LEFT_WIDTH}
            aria-valuemax={MAX_LEFT_WIDTH}
            tabIndex={0}
            data-testid="studio-resize-left"
            onPointerDown={(e) => {
              e.preventDefault();
              startResize('left', e.clientX);
            }}
            onDoubleClick={() =>
              setPanelLayout((prev) => ({ ...prev, leftWidth: DEFAULT_LEFT_WIDTH }))
            }
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                setPanelLayout((prev) => ({
                  ...prev,
                  leftWidth: Math.min(MAX_LEFT_WIDTH, prev.leftWidth + 16),
                }));
              } else if (e.key === 'ArrowLeft') {
                setPanelLayout((prev) => ({
                  ...prev,
                  leftWidth: Math.max(MIN_LEFT_WIDTH, prev.leftWidth - 16),
                }));
              }
            }}
            title="Sürükleyerek boyutlandır (Çift tıkla: varsayılan)"
            className="group hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center focus:outline-none xl:flex"
          >
            <div
              className={cn(
                'h-12 w-1 rounded-full transition-all',
                draggingSide === 'left'
                  ? 'h-20 w-1.5 bg-primary'
                  : 'bg-slate-300/70 group-hover:h-16 group-hover:bg-primary/70 dark:bg-slate-700/80',
              )}
            />
          </div>
        )}

        {/* CENTER PANEL: Çalışma Alanı (Always widest flex-1 main workspace) */}
        <div
          data-testid="studio-center-panel"
          className={cn(
            'min-w-0 flex-1 overflow-hidden xl:h-full',
            mobilePanel !== 'chat' && 'hidden xl:block',
          )}
        >
          <NotebookTutorChat
            notebookTitle={activeNotebook.title}
            notebookEmoji={activeNotebook.emoji}
            activeSources={activeSources}
            activeMaterials={activeMaterials}
            notebookMaterials={notebookMaterials}
            canonicalAnalysis={canonicalAnalysis}
            messages={activeNotebook.messages}
            coachMode={coachMode}
            onCoachModeChange={onCoachModeChange}
            busy={chatBusy}
            streamingText={streamingText}
            isGenerating={isGenerating}
            onSendMessage={onSendMessage}
            onPinMessage={onPinMessage}
            onClearChat={onClearChat}
            onOpenAddSource={openAddSource}
            onOpenMaterial={onOpenMaterial}
            onGenerateType={onGenerateType}
            onRequestCourseConfirm={openConfirmForUnconfirmed}
          />
        </div>

        {/* Right Drag Resize Splitter */}
        {!panelLayout.rightCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Yapay Zekâ Araçları paneli genişliğini ayarla"
            aria-valuenow={panelLayout.rightWidth}
            aria-valuemin={MIN_RIGHT_WIDTH}
            aria-valuemax={MAX_RIGHT_WIDTH}
            tabIndex={0}
            data-testid="studio-resize-right"
            onPointerDown={(e) => {
              e.preventDefault();
              startResize('right', e.clientX);
            }}
            onDoubleClick={() =>
              setPanelLayout((prev) => ({ ...prev, rightWidth: DEFAULT_RIGHT_WIDTH }))
            }
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                setPanelLayout((prev) => ({
                  ...prev,
                  rightWidth: Math.min(MAX_RIGHT_WIDTH, prev.rightWidth + 16),
                }));
              } else if (e.key === 'ArrowRight') {
                setPanelLayout((prev) => ({
                  ...prev,
                  rightWidth: Math.max(MIN_RIGHT_WIDTH, prev.rightWidth - 16),
                }));
              }
            }}
            title="Sürükleyerek boyutlandır (Çift tıkla: varsayılan)"
            className="group hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center focus:outline-none xl:flex"
          >
            <div
              className={cn(
                'h-12 w-1 rounded-full transition-all',
                draggingSide === 'right'
                  ? 'h-20 w-1.5 bg-primary'
                  : 'bg-slate-300/70 group-hover:h-16 group-hover:bg-primary/70 dark:bg-slate-700/80',
              )}
            />
          </div>
        )}

        {/* RIGHT PANEL: Yapay Zekâ Araçları (or collapsed rail on desktop) */}
        <div
          data-testid="studio-right-panel"
          style={{ ['--studio-right-w' as string]: `${panelLayout.rightWidth}px` }}
          className={cn(
            'min-w-0 overflow-hidden xl:h-full xl:w-[var(--studio-right-w)] xl:shrink-0',
            mobilePanel !== 'studio' && 'hidden xl:block',
            panelLayout.rightCollapsed && 'xl:hidden',
          )}
        >
          <NotebookToolsPanel
            activeSourceCount={activeSourceCount}
            canonicalAnalysis={canonicalAnalysis}
            notebookMaterials={notebookMaterials}
            allMaterials={allMaterials}
            pinnedNotes={activeNotebook.pinnedNotes}
            progress={progress}
            dueCardsCount={dueCardsCount}
            settings={settings}
            onSettingsChange={onSettingsChange}
            isGenerating={isGenerating}
            generationPct={generationPct}
            generationLabel={generationLabel}
            activeSummaryJob={activeSummaryJob}
            onOpenSummaryProgress={onOpenSummaryProgress}
            onGenerateType={onGenerateType}
            onRequestCourseConfirm={openConfirmForUnconfirmed}
            onOpenMindMap={() => setMindMapOpen(true)}
            onOpenPlanner={onOpenPlanner}
            onOpenExamSim={onOpenExamSim}
            onOpenMaterial={onOpenMaterial}
            onDeleteMaterial={onDeleteMaterial}
            onAddManualNote={onAddManualNote}
            onDeletePinnedNote={onDeletePinnedNote}
            onPromotePinnedToSource={onPromotePinnedToSource}
          />
        </div>

        {panelLayout.rightCollapsed ? (
          <div
            data-testid="studio-right-rail"
            className="hidden h-full w-11 shrink-0 flex-col items-center justify-between rounded-[20px] border border-slate-200/85 bg-card py-3 shadow-[var(--panel-shadow)] dark:border-slate-800/90 xl:ml-2 xl:flex"
          >
            <button
              type="button"
              onClick={toggleRightPanel}
              title="YZ Araçları panelini genişlet"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {notebookMaterials.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onGenerateType('summary')}
              title="Hızlı Özet Başlat"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary dark:border-slate-800"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Tablet / Mobile Quick Slide-Over Drawers (< 1280px) */}
      <Sheet
        open={mobileDrawer === 'sources'}
        onOpenChange={(open) => !open && setMobileDrawer(null)}
      >
        <SheetContent
          side="left"
          className="flex h-[100dvh] w-[min(92vw,380px)] max-w-none flex-col p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Kaynaklar</SheetTitle>
            <SheetDescription>Yüklenen ders notları ve kaynak seçimi</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 pt-4">
            <NotebookSourcesPanel
              userId={userId}
              sources={activeNotebook.sources}
              checkedSourceIds={activeNotebook.checkedSourceIds}
              checkedMaterialIds={activeNotebook.checkedMaterialIds}
              ownNotes={ownNotes}
              platformNotes={platformNotes}
              materials={allMaterials}
              addDialogOpen={addSourceOpen}
              onAddDialogOpenChange={setAddSourceOpen}
              addDialogInitialTab={addSourceTab}
              onAddSources={onAddSources}
              onRemoveSource={onRemoveSource}
              onToggleSource={onToggleSource}
              onToggleAllSources={onToggleAllSources}
              onToggleMaterialSource={onToggleMaterialSource}
              onEditSourceCourse={(src) => {
                setMobileDrawer(null);
                setEditingCourseSource(src);
              }}
              onExtractRemoteNoteFile={onExtractRemoteNoteFile}
              onSavedLiveMaterial={onSavedLiveMaterial}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={mobileDrawer === 'studio'}
        onOpenChange={(open) => !open && setMobileDrawer(null)}
      >
        <SheetContent
          side="right"
          className="flex h-[100dvh] w-[min(92vw,390px)] max-w-none flex-col p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Yapay Zekâ Araçları</SheetTitle>
            <SheetDescription>Özet, Videolu Ders, Deneme Sınavı ve Çalışma Kartları</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 pt-4">
            <NotebookToolsPanel
              activeSourceCount={activeSourceCount}
              canonicalAnalysis={canonicalAnalysis}
              notebookMaterials={notebookMaterials}
              allMaterials={allMaterials}
              pinnedNotes={activeNotebook.pinnedNotes}
              progress={progress}
              dueCardsCount={dueCardsCount}
              settings={settings}
              onSettingsChange={onSettingsChange}
              isGenerating={isGenerating}
              generationPct={generationPct}
              generationLabel={generationLabel}
              activeSummaryJob={activeSummaryJob}
              onOpenSummaryProgress={() => {
                setMobileDrawer(null);
                onOpenSummaryProgress?.();
              }}
              onGenerateType={(type) => {
                setMobileDrawer(null);
                onGenerateType(type);
              }}
              onRequestCourseConfirm={() => {
                setMobileDrawer(null);
                openConfirmForUnconfirmed();
              }}
              onOpenMindMap={() => {
                setMobileDrawer(null);
                setMindMapOpen(true);
              }}
              onOpenPlanner={() => {
                setMobileDrawer(null);
                onOpenPlanner();
              }}
              onOpenExamSim={() => {
                setMobileDrawer(null);
                onOpenExamSim();
              }}
              onOpenMaterial={(mat) => {
                setMobileDrawer(null);
                onOpenMaterial(mat);
              }}
              onDeleteMaterial={onDeleteMaterial}
              onAddManualNote={onAddManualNote}
              onDeletePinnedNote={onDeletePinnedNote}
              onPromotePinnedToSource={onPromotePinnedToSource}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Multi-Course Merge Approval Dialog */}
      <Dialog
        open={Boolean(pendingMultiCourseType && canonicalAnalysis.isMultiCourse)}
        onOpenChange={(open) => !open && onCancelMultiCourseConfirm?.()}
      >
        <DialogContent
          data-testid="multi-course-confirm-dialog"
          className="flex max-h-[86dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-amber-500" />
              Farklı Derslere Ait Kaynaklar Seçildi
            </DialogTitle>
            <DialogDescription className="text-xs">
              Seçili kaynaklar {canonicalAnalysis.distinctCourses.length} farklı derse ait görünüyor.
              EconNotes farklı derslerin kavramlarını birbirine karıştırmaz; tek bir dersi izole edip
              devam edebilir veya tüm dersleri ayrı başlıklar altında birlikte analiz etmeyi
              onaylayabilirsin.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {canonicalAnalysis.distinctCourses.map((courseName) => {
              const matchingProfiles = canonicalAnalysis.profiles.filter(
                (p) => p.resolvedCourse === courseName,
              );
              return (
                <div
                  key={courseName}
                  className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">{courseName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {matchingProfiles.length} kaynak:{' '}
                      {matchingProfiles.map((p) => p.source.name).join(', ')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onIsolateCourseAndContinue?.(courseName)}
                    className="h-8 shrink-0 rounded-xl text-[11px] font-semibold"
                  >
                    Yalnızca Bu Dersi Analiz Et
                  </Button>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onCancelMultiCourseConfirm?.()}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="multi-course-merge-approve-btn"
              onClick={() => onConfirmMultiCourseAndContinue?.()}
              className="bg-gradient-to-r from-[#174ec4] to-[#2e78f6] text-white"
            >
              Ayrı Başlıklarla Birlikte Analiz Et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interactive Mind Map Dialog */}
      <NotebookMindMapDialog
        open={mindMapOpen}
        onOpenChange={setMindMapOpen}
        notebookTitle={activeNotebook.title}
        sources={activeSources}
        materials={mindMapMaterials}
        canonicalAnalysis={canonicalAnalysis}
        onAskTutor={(prompt) => {
          setMobilePanel('chat');
          void onSendMessage({ text: prompt, mode: 'reinforce' });
        }}
      />

      {/* Per-Source Course Confirmation & Editor Dialog */}
      <Dialog open={courseDialogOpen} onOpenChange={(o) => !o && closeCourseDialog()}>
        <DialogContent className="flex max-h-[86dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              {pendingCourseConfirmType
                ? 'Kaynak Dersini Doğrula'
                : 'Kaynak Dersini Seç / Düzenle'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pendingCourseConfirmType
                ? 'Sistem bu kaynağın dersini kesin tespit edemediği için otomatik atama yapmadı. Doğru dersi seçtiğinde analiz ve üretim yalnızca bu kaynağa göre başlatılacak.'
                : 'Her kaynak kendi gerçek dersine göre bağımsız analiz edilir ve diğer kaynakları etkilemez.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {courseDialogSources.map((src) => {
              const currentVal = courseDrafts[src.id] || '';
              return (
                <div
                  key={src.id}
                  className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{src.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      ~{src.pagesOrSlides} sayfa · {src.wordCount.toLocaleString('tr-TR')} kelime
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">Ders Adı *</Label>
                    <Input
                      value={currentVal}
                      onChange={(e) => {
                        setCourseDrafts((prev) => ({ ...prev, [src.id]: e.target.value }));
                        setCourseFilterQuery(e.target.value);
                      }}
                      placeholder="Örn: Para Teorisi ve Politikası, Borçlar Hukuku, İstatistik..."
                      className="h-9 rounded-xl text-xs"
                    />
                  </div>

                  {src.courseCandidates && src.courseCandidates.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10.5px] font-semibold text-muted-foreground">
                        İçerikten Önerilen Dersler:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {src.courseCandidates.map((cand) => (
                          <button
                            key={cand}
                            type="button"
                            onClick={() =>
                              setCourseDrafts((prev) => ({ ...prev, [src.id]: cand }))
                            }
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                              currentVal === cand
                                ? 'border-primary bg-primary/15 text-primary'
                                : 'border-border/70 bg-background text-foreground hover:border-primary/40',
                            )}
                          >
                            {cand}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[10.5px] font-semibold text-muted-foreground">
                      Üniversite Ders Kataloğundan Hızlı Seç:
                    </p>
                    <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border/50 bg-background/70 p-2">
                      {filteredCourseOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            setCourseDrafts((prev) => ({ ...prev, [src.id]: opt }))
                          }
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
                            currentVal === opt
                              ? 'border-primary bg-primary text-primary-foreground font-semibold'
                              : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={closeCourseDialog}>
              İptal
            </Button>
            <Button
              size="sm"
              disabled={courseDialogSources.some((s) => !(courseDrafts[s.id] || '').trim())}
              onClick={handleSaveCourseDialog}
            >
              {pendingCourseConfirmType ? 'Dersi Onayla ve Devam Et' : 'Dersi Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Notebook Dialog */}
      <Dialog open={newNbOpen} onOpenChange={setNewNbOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Yeni Çalışma Defteri
            </DialogTitle>
            <DialogDescription className="text-xs">
              Her ders veya sınav dönemi için ayrı bir defter açarak kaynaklarını ve sohbetlerini düzenli tut.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs">Simge</Label>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_CHOICES.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setNewNbEmoji(em)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl border text-base transition-all',
                      newNbEmoji === em
                        ? 'border-primary bg-primary/15 scale-105'
                        : 'border-border/70 bg-background hover:border-primary/40',
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Defter Adı *</Label>
              <Input
                value={newNbTitle}
                onChange={(e) => setNewNbTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                }}
                placeholder="Örn: Makroekonomi Vize Hazırlık"
                className="rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ders / Alan (Opsiyonel)</Label>
              <Input
                value={newNbCourse}
                onChange={(e) => setNewNbCourse(e.target.value)}
                placeholder="Örn: İktisada Giriş II"
                className="rounded-xl text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewNbOpen(false)}>
              İptal
            </Button>
            <Button size="sm" disabled={!newNbTitle.trim()} onClick={handleCreateSubmit}>
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Notebook Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Defteri Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Defter Adı</Label>
              <Input
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ders / Alan</Label>
              <Input
                value={renameCourse}
                onChange={(e) => setRenameCourse(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              İptal
            </Button>
            <Button size="sm" disabled={!renameTitle.trim()} onClick={handleRenameSubmit}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
