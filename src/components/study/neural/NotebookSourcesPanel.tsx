import { useMemo, useRef, useState } from 'react';
import {
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
import {
  buildPastedSourceItem,
  classifyStudyDomain,
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

  const inspectOutline = useMemo(() => {
    if (!inspectSource?.text) return [];
    return extractFullDocumentOutline(inspectSource.text, 10);
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
        'flex h-full min-h-[540px] flex-col rounded-2xl border bg-card/95 shadow-xs transition-colors lg:h-[calc(100vh-12.5rem)] lg:min-h-[620px]',
        dragging
          ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/25'
          : 'border-border/75',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-foreground">Kaynaklar</h2>
            <p className="text-[11px] text-muted-foreground">
              {allCount > 0 ? `${activeCount} / ${allCount} aktif` : 'PDF, slayt veya ders notu ekle'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onAddDialogOpenChange(true)}
          className="h-8 gap-1 rounded-xl px-2.5 text-xs font-semibold shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Ekle
        </Button>
      </div>

      {/* Master Select All Bar (NotebookLM style) */}
      {sources.length > 0 && (
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground">
            <Checkbox
              checked={allSourcesChecked}
              onCheckedChange={(v) => onToggleAllSources(Boolean(v))}
              aria-label="Tüm kaynakları seç"
            />
            <span className="font-medium">Tüm kaynakları seç</span>
          </label>
          <span className="text-[10.5px] text-muted-foreground tabular-nums">
            {checkedSourceIds.length}/{sources.length}
          </span>
        </div>
      )}

      {/* Sources Scroll List */}
      <ScrollArea className="flex-1 px-3 py-3">
        {extracting && (
          <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5 text-xs text-primary">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span className="font-medium">Kaynak okunuyor ve indeksleniyor...</span>
          </div>
        )}

        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileUp className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-foreground">
              Kayıtlı kaynakların burada görünür
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              PDF, PPTX, DOCX, görsel sürükleyip bırak ya da EconNotes ders notlarından doğrudan seç.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddDialogOpenChange(true)}
              className="mt-3.5 h-8 gap-1.5 rounded-xl text-xs"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              İlk Kaynağını Ekle
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((src) => {
              const Icon = getSourceIcon(src);
              const checked = checkedSourceIds.includes(src.id);
              const domain = classifyStudyDomain(src.text || '', src.course || undefined, src.name);
              return (
                <div
                  key={src.id}
                  className={cn(
                    'group relative flex items-start gap-2.5 rounded-xl border p-2.5 transition-all',
                    checked
                      ? 'border-primary/30 bg-primary/[0.04] shadow-[0_2px_10px_hsl(var(--primary)/0.05)]'
                      : 'border-border/60 bg-background/50 opacity-70 hover:opacity-100',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleSource(src.id)}
                    className="mt-1 shrink-0"
                    aria-label={`${src.name} kaynağını seç`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => setInspectSource(src)}
                        className="flex min-w-0 items-center gap-1.5 text-left"
                        title="Kaynak özetini ve başlıklarını incele"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {src.name}
                        </span>
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      <span>~{src.pagesOrSlides} syf</span>
                      <span>·</span>
                      <span>{src.wordCount.toLocaleString('tr-TR')} kelime</span>
                      {domain.discipline && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[110px] text-primary/80 font-medium">
                            {domain.discipline}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setInspectSource(src)}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="İçeriği incele"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(src.id)}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Kaynağı kaldır"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Optional: Include existing saved Study Materials as RAG context */}
        {materials.length > 0 && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => setShowSavedMaterials((s) => !s)}
              className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-500" />
                Kayıtlı Stüdyo Materyalleri ({materials.length})
              </span>
              <span>{showSavedMaterials ? 'Gizle' : 'Bağla'}</span>
            </button>

            {showSavedMaterials && (
              <div className="mt-2 space-y-1.5">
                {materials.slice(0, 12).map((mat) => {
                  const checked = checkedMaterialIds.includes(mat.id);
                  return (
                    <label
                      key={mat.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition-colors',
                        checked
                          ? 'border-violet-500/35 bg-violet-500/[0.06]'
                          : 'border-border/50 bg-background/40 hover:bg-muted/40',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onToggleMaterialSource(mat.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-medium text-foreground">
                          {mat.title}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
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
      </ScrollArea>

      {/* Bottom quick drag hint */}
      <div className="border-t border-border/50 bg-muted/15 px-3.5 py-2 text-[10.5px] text-muted-foreground">
        Seçili kaynaklar hem <strong>AI Öğretmen</strong> hem de <strong>Stüdyo</strong> üretimlerinde tek kaynak olarak kullanılır.
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
                            ? 'bg-background text-foreground shadow-xs'
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
            {inspectOutline.length > 0 && (
              <div className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Tespit Edilen Konu Başlıkları
                </p>
                <ul className="space-y-1 text-xs text-foreground/90">
                  {inspectOutline.map((o, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-mono text-[10px] text-primary mt-0.5">{idx + 1}.</span>
                      <span>{o.heading}</span>
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
