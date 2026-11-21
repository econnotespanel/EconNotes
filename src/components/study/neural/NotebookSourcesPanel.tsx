import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Check,
  ClipboardPaste,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ACCEPTED_FILES } from '@/lib/extractFile';
import { analyzeSingleSource } from '@/lib/studySourceAnalysis';
import {
  buildPastedSourceItem,
  extractFullDocumentOutline,
  extractUploadedSource,
} from '@/lib/studySourceProcessor';
import { cn } from '@/lib/utils';
import type {
  ExtractedSourceItem,
  NoteSourceOption,
  StudyMaterial,
} from '@/types/study';
import { toast } from 'sonner';
import NeuralLiveCapture from './NeuralLiveCapture';
import {
  STUDIO_BADGE_COURSE,
  STUDIO_BADGE_WARN,
  STUDIO_BTN_ICON,
  STUDIO_BTN_PRIMARY,
  STUDIO_BTN_SECONDARY,
  STUDIO_CARD_ACTIVE,
  STUDIO_CARD_SUBTLE,
  STUDIO_PANEL_BODY,
  STUDIO_PANEL_FOOTER,
  STUDIO_PANEL_HEADER,
  STUDIO_PANEL_HEADER_ICON,
  STUDIO_PANEL_SHELL,
} from './studioDesign';

interface NotebookSourcesPanelProps {
  userId: string;
  sources: ExtractedSourceItem[];
  checkedSourceIds: string[];
  checkedMaterialIds: string[];
  ownNotes: NoteSourceOption[];
  platformNotes: NoteSourceOption[];
  materials: StudyMaterial[];
  addDialogOpen: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
  addDialogInitialTab?: 'upload' | 'notes' | 'paste' | 'live';
  onAddSources: (items: ExtractedSourceItem[]) => Promise<void> | void;
  onRemoveSource: (sourceId: string) => void;
  onToggleSource: (sourceId: string) => void;
  onToggleAllSources: (selectAll: boolean) => void;
  onToggleMaterialSource: (materialId: string) => void;
  onEditSourceCourse: (source: ExtractedSourceItem) => void;
  onExtractRemoteNoteFile: (note: NoteSourceOption) => Promise<ExtractedSourceItem>;
  onSavedLiveMaterial: (mat: StudyMaterial) => void;
}

function getSourceIcon(src: ExtractedSourceItem) {
  const lower = src.name.toLowerCase();
  if (src.kind === 'pasted') return ClipboardPaste;
  if (src.kind === 'note') return BookMarked;
  if (/\.(png|jpe?g|webp|gif)$/i.test(lower) || src.isScannedOcr) return FileImage;
  if (/\.pptx?$/i.test(lower)) return FileSpreadsheet;
  return FileText;
}

export function NotebookSourcesPanel({
  userId,
  sources,
  checkedSourceIds,
  checkedMaterialIds,
  ownNotes,
  platformNotes,
  materials,
  addDialogOpen,
  onAddDialogOpenChange,
  addDialogInitialTab = 'upload',
  onAddSources,
  onRemoveSource,
  onToggleSource,
  onToggleAllSources,
  onToggleMaterialSource,
  onEditSourceCourse,
  onExtractRemoteNoteFile,
  onSavedLiveMaterial,
}: NotebookSourcesPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteOriginTab, setNoteOriginTab] = useState<'all' | 'platform' | 'own'>('all');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [inspectSource, setInspectSource] = useState<ExtractedSourceItem | null>(null);
  const [showSavedMaterials, setShowSavedMaterials] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allCount = sources.length + checkedMaterialIds.length;
  const activeCount = checkedSourceIds.length + checkedMaterialIds.length;
  const allSourcesChecked = sources.length > 0 && checkedSourceIds.length === sources.length;

  const combinedNotes = useMemo(() => {
    const merged: NoteSourceOption[] = [];
    const seen = new Set<string>();
    const list =
      noteOriginTab === 'own'
        ? ownNotes
        : noteOriginTab === 'platform'
        ? platformNotes
        : [...ownNotes, ...platformNotes];

    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      merged.push(n);
    }

    const q = noteSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return merged;
    return merged.filter(
      (n) =>
        n.title.toLocaleLowerCase('tr-TR').includes(q) ||
        (n.course || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (n.department || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [ownNotes, platformNotes, noteOriginTab, noteSearch]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setExtracting(true);
    try {
      const extracted: ExtractedSourceItem[] = [];
      for (const file of Array.from(fileList)) {
        const item = await extractUploadedSource(file);
        extracted.push(item);
      }
      await onAddSources(extracted);
      onAddDialogOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dosya okunamadı.');
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePickEconNote = async (note: NoteSourceOption) => {
    if (sources.some((s) => s.originNoteId === note.id)) {
      toast.info('Bu ders notu zaten defterinde ekli.');
      return;
    }
    setLoadingNoteId(note.id);
    try {
      const item = await onExtractRemoteNoteFile(note);
      await onAddSources([item]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ders notu eklenemedi.');
    } finally {
      setLoadingNoteId(null);
    }
  };

  const handleAddPasted = async () => {
    const clean = pasteText.trim();
    if (clean.length < 25) {
      toast.error('Lütfen en az birkaç cümlelik ders notu veya metin yapıştırın.');
      return;
    }
    const item = buildPastedSourceItem(pasteTitle.trim() || 'Yapıştırılan Not', clean);
    await onAddSources([item]);
    setPasteTitle('');
    setPasteText('');
    onAddDialogOpenChange(false);
  };

  const inspectProfile = useMemo(() => {
    if (!inspectSource) return null;
    return analyzeSingleSource(inspectSource);
  }, [inspectSource]);

  const inspectOutline = useMemo(() => {
    if (!inspectSource?.text) return [];
    return extractFullDocumentOutline(inspectSource.text, 16);
  }, [inspectSource]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        STUDIO_PANEL_SHELL,
        'transition-colors',
        dragging && 'border-primary bg-primary/[0.04] ring-2 ring-primary/20',
      )}
    >
      {/* Unified Left Panel Header */}
      <div className={STUDIO_PANEL_HEADER}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={STUDIO_PANEL_HEADER_ICON}>
            <FolderOpen className="h-4 w-4" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">Kaynaklar</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {allCount > 0 ? `${activeCount} / ${allCount} seçili` : 'PDF, slayt veya ders notu'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onAddDialogOpenChange(true)}
          className={cn(STUDIO_BTN_PRIMARY, 'shrink-0 gap-1.5 px-3')}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Ekle
        </Button>
      </div>

      {/* Master Select All Bar */}
      {sources.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-muted/25 px-4 py-2 text-xs">
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground">
            <Checkbox
              checked={allSourcesChecked}
              onCheckedChange={(v) => onToggleAllSources(Boolean(v))}
              aria-label="Tüm kaynakları seç"
            />
            <span className="truncate font-medium">Tüm kaynakları seç</span>
          </label>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
            {checkedSourceIds.length}/{sources.length}
          </span>
        </div>
      )}

      {/* Sources Scroll List */}
      <div className={STUDIO_PANEL_BODY}>
        {extracting && (
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5 text-xs text-primary">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span className="font-medium">Kaynak okunuyor, ders bilgisi doğrulanıyor...</span>
          </div>
        )}

        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <FileUp className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <p className="text-xs font-semibold text-foreground">
              Ders kaynakların burada listelenir
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              PDF, PPTX, DOCX veya görsel sürükleyip bırak ya da EconNotes ders notlarından ekle.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddDialogOpenChange(true)}
              className={cn(STUDIO_BTN_SECONDARY, 'mt-3.5 gap-1.5')}
            >
              <Plus className="h-4 w-4 text-primary" />
              İlk Kaynağı Ekle
            </Button>
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            {sources.map((src) => {
              const Icon = getSourceIcon(src);
              const checked = checkedSourceIds.includes(src.id);
              const profile = analyzeSingleSource(src);
              return (
                <div
                  key={src.id}
                  className={cn(
                    'group relative flex min-w-0 w-full items-start gap-2.5 p-3',
                    checked
                      ? STUDIO_CARD_ACTIVE
                      : cn(STUDIO_CARD_SUBTLE, 'opacity-80 hover:border-border hover:opacity-100'),
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleSource(src.id)}
                    className="mt-0.5 shrink-0"
                    aria-label={`${src.name} kaynağını seç`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => setInspectSource(src)}
                        className="flex min-w-0 items-center gap-1.5 text-left"
                        title="Kaynak başlıklarını, ders analizini ve metnini incele"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.85} />
                        <span className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                          {src.name}
                        </span>
                      </button>
                    </div>

                    {/* Verified Independent Per-Source Course Badge */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {profile.needsConfirmation ? (
                        <button
                          type="button"
                          onClick={() => onEditSourceCourse(profile.source)}
                          className={cn(
                            STUDIO_BADGE_WARN,
                            'text-[10.5px] transition-colors hover:bg-amber-500/20',
                          )}
                          title="Bu kaynağın dersi kesin belirlenemedi; doğru dersi seçmek için tıkla"
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span className="truncate">Ders Seç</span>
                        </button>
                      ) : profile.resolvedCourse ? (
                        <button
                          type="button"
                          onClick={() => onEditSourceCourse(profile.source)}
                          className={cn(
                            STUDIO_BADGE_COURSE,
                            'text-[10.5px] transition-colors hover:bg-primary/15',
                          )}
                          title={`Ders: ${profile.resolvedCourse} (düzenlemek için tıkla)`}
                        >
                          <span className="max-w-[140px] truncate">{profile.resolvedCourse}</span>
                          <Pencil className="h-3 w-3 shrink-0 opacity-65" />
                        </button>
                      ) : null}

                      {profile.unreadablePages.length > 0 && (
                        <span
                          className={cn(STUDIO_BADGE_WARN, 'text-[10px]')}
                          title={profile.warnings.join(' ')}
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {profile.unreadablePages.length} görsel syf
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>~{src.pagesOrSlides} syf</span>
                      <span>·</span>
                      <span>{src.wordCount.toLocaleString('tr-TR')} kelime</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setInspectSource(src)}
                      className={cn(STUDIO_BTN_ICON, 'h-7 w-7')}
                      title="İçeriği incele"
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(src.id)}
                      className={cn(
                        STUDIO_BTN_ICON,
                        'h-7 w-7 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive',
                      )}
                      title="Kaynağı kaldır"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Saved Study Materials as Optional Context */}
        {materials.length > 0 && (
          <div className="mt-4 border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={() => setShowSavedMaterials((s) => !s)}
              className="flex h-8 w-full items-center justify-between rounded-xl px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Kayıtlı Materyaller ({materials.length})
              </span>
              <span className="text-[11px] font-semibold text-primary">
                {showSavedMaterials ? 'Gizle' : 'Göster'}
              </span>
            </button>

            {showSavedMaterials && (
              <div className="mt-2 space-y-1.5">
                {materials.slice(0, 12).map((mat) => {
                  const checked = checkedMaterialIds.includes(mat.id);
                  return (
                    <label
                      key={mat.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 p-2.5 text-xs',
                        checked
                          ? STUDIO_CARD_ACTIVE
                          : cn(STUDIO_CARD_SUBTLE, 'hover:bg-muted/40'),
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onToggleMaterialSource(mat.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {mat.title}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {mat.course || 'Materyal'} ·{' '}
                          {mat.material_type === 'summary'
                            ? 'Özet'
                            : mat.material_type === 'quiz'
                            ? 'Sınav'
                            : mat.material_type === 'flashcards'
                            ? 'Kartlar'
                            : 'Video'}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unified Footer */}
      <div className={cn(STUDIO_PANEL_FOOTER, 'text-[11px] leading-snug text-muted-foreground')}>
        Her kaynak kendi ders bilgisiyle eşleştirilir; seçili kaynaklar tüm araçlarda ortak kullanılır.
      </div>

      {/* Add Source Modal (NotebookLM style) */}
      <Dialog open={addDialogOpen} onOpenChange={onAddDialogOpenChange}>
        <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-border/60 bg-muted/20 px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Plus className="h-4 w-4" />
              </span>
              Deftere Kaynak Ekle
            </DialogTitle>
            <DialogDescription className="text-xs">
              PDF, PowerPoint, Word, fotoğraf, EconNotes ders notu veya canlı ses kaydı ekle. Tüm araçlar seçili kaynaklarla anında senkronize olur.
            </DialogDescription>
          </DialogHeader>

          <Tabs key={addDialogInitialTab} defaultValue={addDialogInitialTab} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/60 px-5 pt-3">
              <TabsList className="grid w-full grid-cols-4 rounded-xl">
                <TabsTrigger value="upload" className="gap-1.5 text-xs">
                  <FileUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dosya Yükle</span>
                  <span className="sm:hidden">Dosya</span>
                </TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5 text-xs">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">EconNotes Notları</span>
                  <span className="sm:hidden">Notlar</span>
                </TabsTrigger>
                <TabsTrigger value="paste" className="gap-1.5 text-xs">
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Metin Yapıştır</span>
                  <span className="sm:hidden">Metin</span>
                </TabsTrigger>
                <TabsTrigger value="live" className="gap-1.5 text-xs">
                  <Mic className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Canlı Ders</span>
                  <span className="sm:hidden">Ses</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {/* 1. File Upload */}
              <TabsContent value="upload" className="mt-0 space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILES}
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
                <button
                  type="button"
                  disabled={extracting}
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/35 bg-primary/[0.03] px-6 py-10 text-center transition-all hover:border-primary/60 hover:bg-primary/[0.06]"
                >
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-transform group-hover:scale-105">
                    {extracting ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <FileUp className="h-6 w-6" />
                    )}
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {extracting ? 'Dosyalar okunuyor...' : 'Bilgisayarından veya telefonundan dosya seç'}
                  </p>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    PDF ders notu, PowerPoint slaytı (PPTX), Word (DOCX), TXT veya ders fotoğrafı (PNG/JPG). Birden fazla dosyayı aynı anda yükleyebilirsin.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {['PDF', 'PPTX', 'DOCX', 'PNG / JPG', 'TXT'].map((tag) => (
                      <Badge key={tag} variant="outline" className="bg-background/80 text-[10.5px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </button>
              </TabsContent>

              {/* 2. EconNotes Catalog Picker (Fixed visibility query!) */}
              <TabsContent value="notes" className="mt-0 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={noteSearch}
                      onChange={(e) => setNoteSearch(e.target.value)}
                      placeholder="Ders adı, not başlığı veya bölüm ara..."
                      className="h-9 rounded-xl pl-9 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-muted/30 p-1">
                    {(
                      [
                        ['all', `Tümü (${new Set([...ownNotes, ...platformNotes].map((n) => n.id)).size})`],
                        ['platform', `Platform (${platformNotes.length})`],
                        ['own', `Benim (${ownNotes.length})`],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setNoteOriginTab(id)}
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
                          noteOriginTab === id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {combinedNotes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                    Aramana uygun EconNotes ders notu bulunamadı.
                  </div>
                ) : (
                  <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                    {combinedNotes.slice(0, 60).map((note) => {
                      const alreadyAdded = sources.some((s) => s.originNoteId === note.id);
                      const isLoadingThis = loadingNoteId === note.id;
                      return (
                        <div
                          key={note.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 p-3 transition-colors hover:border-primary/35"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {note.title}
                              </p>
                              <Badge variant="outline" className="shrink-0 text-[9.5px]">
                                {note.origin === 'own' ? 'Senin Notun' : 'Platform'}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {note.course || 'Genel'} · {note.department || 'Üniversite Notu'}
                              {note.semester ? ` · ${note.semester}` : ''}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={alreadyAdded ? 'secondary' : 'default'}
                            disabled={alreadyAdded || Boolean(loadingNoteId)}
                            onClick={() => void handlePickEconNote(note)}
                            className="h-8 shrink-0 gap-1 rounded-xl px-3 text-xs"
                          >
                            {isLoadingThis ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : alreadyAdded ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            {alreadyAdded ? 'Eklendi' : isLoadingThis ? 'Alınıyor' : 'Ekle'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* 3. Paste Text */}
              <TabsContent value="paste" className="mt-0 space-y-3">
                <Input
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="Kaynak başlığı (ör: Mikroekonomi 4. Hafta Ders Notları)"
                  className="rounded-xl text-xs"
                />
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Ders notlarını, kitap özetini veya slayt metnini buraya yapıştır..."
                  className="min-h-[200px] rounded-xl text-xs leading-relaxed"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {pasteText.trim().split(/\s+/).filter(Boolean).length} kelime
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleAddPasted()}
                    disabled={pasteText.trim().length < 25}
                    className="gap-1.5 rounded-xl text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Deftere Ekle
                  </Button>
                </div>
              </TabsContent>

              {/* 4. Live Voice Capture */}
              <TabsContent value="live" className="mt-0">
                <NeuralLiveCapture
                  userId={userId}
                  onSaved={(mat) => {
                    onSavedLiveMaterial(mat);
                    onAddDialogOpenChange(false);
                  }}
                />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Source Inspector Dialog (NotebookLM Source Guide) */}
      <Dialog open={Boolean(inspectSource)} onOpenChange={(o) => !o && setInspectSource(null)}>
        <DialogContent className="max-h-[84dvh] max-w-xl flex flex-col overflow-hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              <span className="truncate">{inspectSource?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {inspectSource
                ? `~${inspectSource.pagesOrSlides} sayfa/slayt · ${inspectSource.wordCount.toLocaleString('tr-TR')} kelime`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[58vh] pr-2">
            {inspectProfile && (
              <div className="mb-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-muted-foreground">Tanımlanan Ders:</span>
                    {inspectProfile.resolvedCourse ? (
                      <Badge variant="secondary" className="text-[11px] font-semibold">
                        {inspectProfile.resolvedCourse}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
                        Ders Onayı Gerekli
                      </Badge>
                    )}
                    {inspectProfile.formulas.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {inspectProfile.formulas.length} formül
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 rounded-lg px-2 text-[11px]"
                    onClick={() => {
                      const target = inspectProfile.source;
                      setInspectSource(null);
                      onEditSourceCourse(target);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Dersi Düzenle
                  </Button>
                </div>

                {inspectProfile.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                    <p className="mb-1 flex items-center gap-1 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Belge Okuma Uyarısı
                    </p>
                    <ul className="space-y-0.5">
                      {inspectProfile.warnings.map((w, wi) => (
                        <li key={wi}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {inspectOutline.length > 0 && (
              <div className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Tespit Edilen Konu Başlıkları ({inspectOutline.length})
                </p>
                <ul className="space-y-1 text-xs text-foreground/90">
                  {inspectOutline.map((o, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-mono text-[10px] text-primary mt-0.5">{idx + 1}.</span>
                      <span>
                        {o.heading}
                        {o.pageHint ? ` (${o.pageHint})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {(inspectSource?.text || 'Metin içeriği yok.').slice(0, 6000)}
              {(inspectSource?.text?.length || 0) > 6000 ? '\n\n...(devamı indekslendi)' : ''}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
