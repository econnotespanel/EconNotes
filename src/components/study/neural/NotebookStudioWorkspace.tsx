import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  FolderOpen,
  MessageSquareText,
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
} from '@/types/study';
import { NotebookMindMapDialog } from './NotebookMindMapDialog';
import { NotebookSourcesPanel } from './NotebookSourcesPanel';
import { NotebookToolsPanel } from './NotebookToolsPanel';
import { NotebookTutorChat } from './NotebookTutorChat';

const EMOJI_CHOICES = ['📘', '🧠', '🎯', '📐', '⚖️', '🧬', '💻', '📊', '📚', '✨'];

interface NotebookStudioWorkspaceProps {
  userId: string;
  notebooks: StudioNotebook[];
  activeNotebook: StudioNotebook;
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
  onAddSources: (items: ExtractedSourceItem[]) => Promise<void> | void;
  onRemoveSource: (sourceId: string) => void;
  onToggleSource: (sourceId: string) => void;
  onToggleAllSources: (selectAll: boolean) => void;
  onToggleMaterialSource: (materialId: string) => void;
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
  onAddSources,
  onRemoveSource,
  onToggleSource,
  onToggleAllSources,
  onToggleMaterialSource,
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
      {/* Notebook Switcher & Mobile Panel Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2.5 shadow-2xs">
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 max-w-[260px] gap-2 rounded-xl border-border/80 bg-background/80 px-3 text-xs font-bold sm:max-w-[340px]"
              >
                <span className="text-base leading-none">{activeNotebook.emoji}</span>
                <span className="truncate">{activeNotebook.title}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                    className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs cursor-pointer"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm">{nb.emoji}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{nb.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {nb.sources.length} kaynak · {nb.course || 'Genel'}
                        </p>
                      </div>
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setNewNbOpen(true)}
                className="gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-primary cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Yeni Çalışma Defteri Oluştur
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {activeNotebook.course && (
            <Badge
              variant="outline"
              className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/[0.06] text-[11px] font-medium text-primary border-primary/20"
            >
              <BookOpen className="h-3 w-3" />
              {activeNotebook.course}
            </Badge>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={openRenameDialog}
            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
            title="Defter adını ve dersini düzenle"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          {notebooks.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDeleteNotebook(activeNotebook.id)}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Bu defteri sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewNbOpen(true)}
            className="h-8 gap-1.5 rounded-xl text-xs"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Yeni Defter</span>
            <span className="sm:hidden">Yeni</span>
          </Button>
        </div>
      </div>

      {/* Mobile / Tablet 3-Panel Segmented Switcher */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border/70 bg-muted/40 p-1 lg:hidden">
        {(
          [
            ['sources', 'Kaynaklar', FolderOpen, activeNotebook.sources.length],
            ['chat', 'AI Öğretmen', MessageSquareText, activeNotebook.messages.length],
            ['studio', 'Stüdyo', Sparkles, notebookMaterials.length + activeNotebook.pinnedNotes.length],
          ] as const
        ).map(([id, label, Icon, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePanel(id)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all',
              mobilePanel === id
                ? 'bg-card text-primary shadow-xs ring-1 ring-primary/20'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {count > 0 && (
              <span className="rounded-full bg-primary/12 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Synchronized 3-Panel NotebookLM × Astra AI Desktop Grid */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        {/* LEFT PANEL: Sources */}
        <div className={cn('lg:col-span-3', mobilePanel !== 'sources' && 'hidden lg:block')}>
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
            onExtractRemoteNoteFile={onExtractRemoteNoteFile}
            onSavedLiveMaterial={onSavedLiveMaterial}
          />
        </div>

        {/* CENTER PANEL: AI Tutor & Grounded Chat */}
        <div className={cn('lg:col-span-6', mobilePanel !== 'chat' && 'hidden lg:block')}>
          <NotebookTutorChat
            notebookTitle={activeNotebook.title}
            notebookEmoji={activeNotebook.emoji}
            activeSources={activeSources}
            activeMaterials={activeMaterials}
            messages={activeNotebook.messages}
            coachMode={coachMode}
            onCoachModeChange={onCoachModeChange}
            busy={chatBusy}
            streamingText={streamingText}
            onSendMessage={onSendMessage}
            onPinMessage={onPinMessage}
            onClearChat={onClearChat}
            onOpenAddSource={openAddSource}
          />
        </div>

        {/* RIGHT PANEL: Studio Production & Artifacts */}
        <div className={cn('lg:col-span-3', mobilePanel !== 'studio' && 'hidden lg:block')}>
          <NotebookToolsPanel
            activeSourceCount={activeSourceCount}
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
            onGenerateType={onGenerateType}
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
      </div>

      {/* Interactive Mind Map Dialog */}
      <NotebookMindMapDialog
        open={mindMapOpen}
        onOpenChange={setMindMapOpen}
        notebookTitle={activeNotebook.title}
        sources={activeSources}
        materials={mindMapMaterials}
        onAskTutor={(prompt) => {
          setMobilePanel('chat');
          void onSendMessage({ text: prompt, mode: 'reinforce' });
        }}
      />

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
