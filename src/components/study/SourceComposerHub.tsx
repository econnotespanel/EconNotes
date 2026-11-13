import { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  FileAudio,
  FileImage,
  FilePlus2,
  FileText,
  Film,
  GraduationCap,
  HelpCircle,
  Layers,
  Loader2,
  Microscope,
  NotebookPen,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ACCEPTED_FILES } from '@/lib/extractFile';
import {
  buildNoteSourceItem,
  buildPastedSourceItem,
  combineStudySources,
  extractUploadedSource,
} from '@/lib/studySourceProcessor';
import type {
  DifficultyLevel,
  ExtractedSourceItem,
  MaterialType,
  NoteSourceOption,
  PedagogicalStyle,
  ProcessedStudyBundle,
  QuizFormat,
  StudioGenerationSettings,
  SummaryDepth,
} from '@/types/study';

interface SourceComposerHubProps {
  ownNotes: NoteSourceOption[];
  platformNotes: NoteSourceOption[];
  sources: ExtractedSourceItem[];
  onSourcesChange: (sources: ExtractedSourceItem[]) => void;
  settings: StudioGenerationSettings;
  onSettingsChange: (next: StudioGenerationSettings) => void;
  customTitle: string;
  onCustomTitleChange: (val: string) => void;
  customCourse: string;
  onCustomCourseChange: (val: string) => void;
  isGenerating: boolean;
  generationPct: number;
  generationLabel: string;
  onGenerate: (bundle: ProcessedStudyBundle) => void;
  onExtractRemoteNoteFile?: (note: NoteSourceOption) => Promise<ExtractedSourceItem>;
}

const PROMPT_CHIPS = [
  'Karşılaştırma tabloları ve formül türetimleri ekle',
  'Vize/final sınavında hocanın sorabileceği tuzak noktaları vurgula',
  'Güncel Türkiye ve dünya örnekleriyle somutlaştır',
  'Kavramları Feynman yöntemiyle sıfırdan sezgisel anlat',
];

const MATERIAL_CARDS: Array<{
  type: MaterialType;
  label: string;
  desc: string;
  icon: typeof BookOpen;
}> = [
  {
    type: 'summary',
    label: 'Ders Kitabı Özeti',
    desc: 'Bölüm bölüm derin sentez, formüller, tablolar ve mini testler',
    icon: BookOpen,
  },
  {
    type: 'quiz',
    label: 'Sınav Simülasyonu',
    desc: 'Çoktan seçmeli + AI rubrik puanlamalı açık uçlu sorular',
    icon: HelpCircle,
  },
  {
    type: 'flashcards',
    label: 'Aktif Hatırlama Kartları',
    desc: 'İpuçlu ve sınav tüyolu 3D çalışma kartları',
    icon: Layers,
  },
  {
    type: 'video',
    label: 'İnteraktif Video Ders',
    desc: 'Diyagram, altyazı ve sahne içi sorulu sesli anlatım',
    icon: Film,
  },
];

export function SourceComposerHub({
  ownNotes,
  platformNotes,
  sources,
  onSourcesChange,
  settings,
  onSettingsChange,
  customTitle,
  onCustomTitleChange,
  customCourse,
  onCustomCourseChange,
  isGenerating,
  generationPct,
  generationLabel,
  onGenerate,
  onExtractRemoteNoteFile,
}: SourceComposerHubProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceTab, setSourceTab] = useState<'upload' | 'paste' | 'library'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [extractStatus, setExtractStatus] = useState<{
    active: boolean;
    pct: number;
    label: string;
  }>({ active: false, pct: 0, label: '' });
  const [extractError, setExtractError] = useState<string | null>(null);

  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);

  const effectiveSources = useMemo(() => {
    const pastedTrim = pastedText.trim();
    if (pastedTrim.length >= 20 && !sources.some((s) => s.kind === 'pasted' && s.text === pastedTrim)) {
      return [...sources, buildPastedSourceItem(pastedTitle || customTitle || 'Yapıştırılan Not', pastedTrim, customCourse)];
    }
    return sources;
  }, [sources, pastedText, pastedTitle, customTitle, customCourse]);

  const bundle = useMemo(
    () => combineStudySources(effectiveSources, customTitle, customCourse),
    [effectiveSources, customTitle, customCourse],
  );

  const handleFilesSelected = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    setExtractError(null);
    const files = Array.from(fileList);
    const added: ExtractedSourceItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setExtractStatus({
        active: true,
        pct: 10,
        label: `(${i + 1}/${files.length}) ${f.name} işleniyor...`,
      });
      try {
        const item = await extractUploadedSource(f, (pct, lbl) => {
          setExtractStatus({
            active: true,
            pct,
            label: `(${i + 1}/${files.length}) ${f.name}: ${lbl}`,
          });
        });
        added.push(item);
      } catch (err) {
        setExtractError(
          err instanceof Error ? `${f.name}: ${err.message}` : `${f.name} okunamadı.`,
        );
      }
    }

    setExtractStatus({ active: false, pct: 0, label: '' });
    if (added.length > 0) {
      const merged = [...sources, ...added];
      onSourcesChange(merged);
      if (!customTitle.trim() && merged[0]) {
        onCustomTitleChange(
          merged.length === 1 ? merged[0].name : `${merged[0].name} + ${merged.length - 1} Kaynak`,
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddPasted = () => {
    if (pastedText.trim().length < 20) {
      setExtractError('En az birkaç cümle (20+ karakter) yapıştırın veya yazın.');
      return;
    }
    setExtractError(null);
    const item = buildPastedSourceItem(pastedTitle || 'Ders Notu Metni', pastedText, customCourse);
    const merged = [...sources, item];
    onSourcesChange(merged);
    if (!customTitle.trim()) onCustomTitleChange(item.name);
    setPastedTitle('');
    setPastedText('');
  };

  const toggleNoteSelection = async (note: NoteSourceOption) => {
    const existingIdx = sources.findIndex((s) => s.originNoteId === note.id);
    if (existingIdx >= 0) {
      onSourcesChange(sources.filter((s) => s.originNoteId !== note.id));
      return;
    }

    setExtractError(null);
    setLoadingNoteId(note.id);
    try {
      const item = onExtractRemoteNoteFile
        ? await onExtractRemoteNoteFile(note)
        : buildNoteSourceItem(note);
      if (!item.text.trim() && (!item.images || item.images.length === 0)) {
        setExtractError(`"${note.title}" notunda okunabilir metin bulunamadı.`);
        return;
      }
      const merged = [...sources, item];
      onSourcesChange(merged);
      if (!customTitle.trim()) onCustomTitleChange(note.title);
      if (!customCourse.trim() && note.course) onCustomCourseChange(note.course);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Not yüklenemedi.');
    } finally {
      setLoadingNoteId(null);
    }
  };

  const removeSource = (id: string) => {
    onSourcesChange(sources.filter((s) => s.id !== id));
  };

  const allLibraryNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    return [...ownNotes, ...platformNotes].filter((n) => {
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        (n.course || '').toLowerCase().includes(q) ||
        (n.description || '').toLowerCase().includes(q)
      );
    });
  }, [ownNotes, platformNotes, noteSearch]);

  const canGenerate =
    !isGenerating &&
    !extractStatus.active &&
    (bundle.combinedText.trim().length >= 20 || bundle.images.length > 0 || Boolean(bundle.audio));

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Microscope className="h-5 w-5 text-primary" />
              Çoklu Kaynak & Derin Öğrenme Atölyesi
            </CardTitle>
            <CardDescription className="mt-1">
              Birden fazla PDF, PowerPoint slaytı (konuşmacı notları dahil), Word, görsel, ses veya
              kendi notlarını birleştirip kapsamlı üniversite çalışma paketi oluştur.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {bundle.sourceCount} Kaynak Bağlı
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Multi-source notebook & live source X-Ray */}
        <div className="space-y-5 lg:col-span-6">
          <Tabs
            value={sourceTab}
            onValueChange={(v) => setSourceTab(v as 'upload' | 'paste' | 'library')}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="gap-1.5 text-xs sm:text-sm">
                <Upload className="h-3.5 w-3.5" />
                Dosya Yükle
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5 text-xs sm:text-sm">
                <NotebookPen className="h-3.5 w-3.5" />
                Metin Yapıştır
              </TabsTrigger>
              <TabsTrigger value="library" className="gap-1.5 text-xs sm:text-sm">
                <FileText className="h-3.5 w-3.5" />
                Not Seç ({ownNotes.length + platformNotes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-3 space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILES}
                  className="hidden"
                  onChange={(e) => void handleFilesSelected(e.target.files)}
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FilePlus2 className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Dosyaları buraya sürükleyin veya seçin (Çoklu yükleme açık)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF (taranmış PDF dahil), PPTX (slayt + hoca notu), DOCX, TXT/MD, Görsel (JPG/PNG) veya Ses (MP3/WAV)
                </p>
              </div>
            </TabsContent>

            <TabsContent value="paste" className="mt-3 space-y-3">
              <Input
                placeholder="Bölüm / Not Başlığı (Örn: Makroekonomi Hafta 4 - IS-LM)"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
              />
              <Textarea
                rows={7}
                placeholder="Ders notunuzu, makale özetini veya ses kaydı dökümünü buraya yapıştırın... (Otomatik algılanır veya '+ Kaynağa Ekle' ile birden fazla parça birleştirebilirsiniz)"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="resize-y font-normal"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {pastedText.trim().split(/\s+/).filter(Boolean).length} kelime yazıldı
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pastedText.trim().length < 20}
                  onClick={handleAddPasted}
                >
                  + Kaynak Sepetine Ekle
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="library" className="mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Kişisel veya platform notlarında ara..."
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-56 rounded-lg border border-border p-2">
                {allLibraryNotes.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    Eşleşen kayıtlı not bulunamadı.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {allLibraryNotes.map((note) => {
                      const selected = sources.some((s) => s.originNoteId === note.id);
                      const isLoading = loadingNoteId === note.id;
                      return (
                        <button
                          key={`${note.origin}-${note.id}`}
                          type="button"
                          onClick={() => void toggleNoteSelection(note)}
                          disabled={isLoading}
                          className={`flex w-full items-center justify-between rounded-lg border p-2.5 text-left transition-colors ${
                            selected
                              ? 'border-primary bg-primary/10'
                              : 'border-transparent hover:bg-muted/60'
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <p className="truncate text-sm font-medium text-foreground">
                              {note.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {note.course || 'Genel'} •{' '}
                              {note.origin === 'own' ? 'Kendi Notum' : 'Platform Notu'}
                            </p>
                          </div>
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : selected ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              Ekle
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {extractStatus.active && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {extractStatus.label}
                </span>
                <span>%{extractStatus.pct}</span>
              </div>
              <Progress value={extractStatus.pct} className="h-1.5" />
            </div>
          )}

          {extractError && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {extractError}
            </div>
          )}

          {/* Active Sources + Source X-Ray */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kaynak Röntgeni (Bağlı Materyaller)
              </h3>
              {sources.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSourcesChange([])}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Tümünü temizle
                </button>
              )}
            </div>

            {bundle.sourceCount === 0 ? (
              <p className="text-xs text-muted-foreground">
                Henüz kaynak eklenmedi. PDF, PowerPoint slaytı, görsel, ses kaydı veya metin ekleyerek
                başlayın.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {effectiveSources.map((src) => {
                    const isExplicit = sources.some((s) => s.id === src.id);
                    return (
                      <div
                        key={src.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {src.audio ? (
                            <FileAudio className="h-4 w-4 shrink-0 text-primary" />
                          ) : src.images && src.images.length > 0 ? (
                            <FileImage className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{src.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {src.wordCount.toLocaleString('tr-TR')} kelime • {src.pagesOrSlides}{' '}
                              sayfa/slayt
                              {src.isScannedOcr ? ' • Taranmış OCR / Görsel' : ''}
                            </p>
                          </div>
                        </div>
                        {isExplicit && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`${src.name} kaynağını kaldır`}
                            onClick={() => removeSource(src.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <p className="text-[10px] text-muted-foreground">Toplam Kelime</p>
                    <p className="text-sm font-bold text-foreground">
                      {bundle.totalWords.toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <p className="text-[10px] text-muted-foreground">Sayfa / Slayt</p>
                    <p className="text-sm font-bold text-foreground">{bundle.totalPagesOrSlides}</p>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <p className="text-[10px] text-muted-foreground">Disiplin</p>
                    <p className="truncate text-xs font-semibold text-primary mt-0.5">
                      {bundle.detectedDiscipline}
                    </p>
                  </div>
                </div>

                {bundle.outlinePreview.length > 0 && (
                  <div className="pt-1">
                    <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                      Tespit Edilen Başlık / Konu Akışı ({bundle.outlinePreview.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {bundle.outlinePreview.slice(0, 8).map((heading, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] font-normal">
                          {heading}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Academic Depth & Generation Settings */}
        <div className="space-y-4 lg:col-span-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="studio-title">Çalışma Seti Başlığı</Label>
              <Input
                id="studio-title"
                placeholder="Örn: Mikroekonomi Tüketici Teorisi"
                value={customTitle}
                onChange={(e) => onCustomTitleChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="studio-course">Ders / Alan</Label>
              <Input
                id="studio-course"
                placeholder={bundle.detectedDiscipline || 'Örn: İktisat 101'}
                value={customCourse}
                onChange={(e) => onCustomCourseChange(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Üretilecek Materyal Türü</Label>
            <div className="grid grid-cols-2 gap-2.5">
              {MATERIAL_CARDS.map((card) => {
                const Icon = card.icon;
                const active = settings.materialType === card.type;
                return (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() =>
                      onSettingsChange({ ...settings, materialType: card.type })
                    }
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                      <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                      {card.label}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {card.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deep Learning & Academic Research Toggle */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Derin Öğrenme & Akademik Araştırma Modu
                </span>
                <Badge className="text-[10px]">Önerilen</Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Yalnızca metni kısaltmakla kalmaz; çok aşamalı mimari ile her bölümü ayrıntılı açar,
                literatür bağlamı, LaTeX formül türetimi, karşılaştırma tablosu ve vaka örneği ekler.
              </p>
            </div>
            <Switch
              checked={settings.deepResearch}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, deepResearch: checked })
              }
              aria-label="Derin Öğrenme ve Akademik Araştırma Modu"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pedagojik Anlatım Stili</Label>
              <Select
                value={settings.pedagogicalStyle}
                onValueChange={(v) =>
                  onSettingsChange({ ...settings, pedagogicalStyle: v as PedagogicalStyle })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Dengeli Fakülte Ders Kitabı</SelectItem>
                  <SelectItem value="academic_rigor">Yüksek Lisans / Teorik Kesinlik</SelectItem>
                  <SelectItem value="feynman">Feynman (Önce Sezgi, Sonra Teori)</SelectItem>
                  <SelectItem value="quantitative">Sayısal & Formül Türetimi</SelectItem>
                  <SelectItem value="case_study">Vaka & Türkiye Uygulamaları</SelectItem>
                  <SelectItem value="exam_blitz">Vize / Final Sınav Stratejisi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings.materialType === 'summary' && (
              <div className="space-y-1.5">
                <Label>Özet Kapsamı ve Derinliği</Label>
                <Select
                  value={settings.summaryDepth}
                  onValueChange={(v) =>
                    onSettingsChange({ ...settings, summaryDepth: v as SummaryDepth })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Hızlı Tekrar (4–5 Bölüm)</SelectItem>
                    <SelectItem value="standard">Fakülte Standart (6–8 Bölüm)</SelectItem>
                    <SelectItem value="comprehensive">Kapsamlı Araştırma (7–10 Bölüm)</SelectItem>
                    <SelectItem value="textbook">Ders Kitabı Kürsü Modu (8–12 Bölüm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {settings.materialType === 'quiz' && (
              <div className="space-y-1.5">
                <Label>Soru Formatı</Label>
                <Select
                  value={settings.quizFormat}
                  onValueChange={(v) =>
                    onSettingsChange({ ...settings, quizFormat: v as QuizFormat })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Çoktan Seçmeli (4 Şıklı)</SelectItem>
                    <SelectItem value="mixed">Karma (Test + AI Açık Uçlu Rubrik)</SelectItem>
                    <SelectItem value="open_ended">Tamamı Klasik / Açık Uçlu (AI Puanlamalı)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(settings.materialType === 'quiz' || settings.materialType === 'flashcards') && (
              <div className="space-y-1.5">
                <Label>Zorluk Seviyesi</Label>
                <Select
                  value={settings.difficulty}
                  onValueChange={(v) =>
                    onSettingsChange({ ...settings, difficulty: v as DifficultyLevel })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Karışık (Kolay → Analiz)</SelectItem>
                    <SelectItem value="easy">Temel Kavrama</SelectItem>
                    <SelectItem value="medium">Üniversite Standart</SelectItem>
                    <SelectItem value="hard">Zor / Yorum & Türetim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {settings.materialType === 'quiz' && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Soru Sayısı</span>
                <Badge variant="secondary">{settings.questionCount} soru</Badge>
              </div>
              <Slider
                value={[settings.questionCount]}
                min={5}
                max={25}
                step={1}
                onValueChange={([v]) => onSettingsChange({ ...settings, questionCount: v })}
              />
            </div>
          )}

          {settings.materialType === 'flashcards' && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Bilgi Kartı Sayısı</span>
                <Badge variant="secondary">{settings.cardCount} kart</Badge>
              </div>
              <Slider
                value={[settings.cardCount]}
                min={8}
                max={32}
                step={2}
                onValueChange={([v]) => onSettingsChange({ ...settings, cardCount: v })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="studio-prompt">AI Özelleştirme Talimatı (İsteğe bağlı)</Label>
            <Textarea
              id="studio-prompt"
              rows={2}
              placeholder="Örn: Özellikle 3. ünitedeki elastikiyet türetimlerini detaylandır ve tablo ekle..."
              value={settings.customPrompt}
              onChange={(e) => onSettingsChange({ ...settings, customPrompt: e.target.value })}
            />
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    onSettingsChange({
                      ...settings,
                      customPrompt: settings.customPrompt
                        ? `${settings.customPrompt}; ${chip}`
                        : chip,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Wand2 className="h-3 w-3 text-primary" />
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {isGenerating && (
            <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {generationLabel || 'Akademik sentez çalıştırılıyor...'}
                </span>
                <span>%{generationPct}</span>
              </div>
              <Progress value={generationPct} className="h-2" />
            </div>
          )}

          <Button
            type="button"
            size="lg"
            disabled={!canGenerate}
            onClick={() => onGenerate(bundle)}
            className="w-full gap-2 text-base font-semibold shadow-sm"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Derin Öğrenme Materyali Hazırlanıyor...
              </>
            ) : (
              <>
                <GraduationCap className="h-5 w-5" />
                Çalışma Materyalini Oluştur
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
