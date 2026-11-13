import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  FileUp,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Video,
  Wand2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import type { NeuralEngineState } from '@/lib/neural/neuralEngine';
import type {
  ExtractedSourceItem,
  MaterialType,
  NoteSourceOption,
  PedagogicalStyle,
  ProcessedStudyBundle,
  QuizFormat,
  StudioGenerationSettings,
  SummaryDepth,
} from '@/types/study';
import { toast } from 'sonner';

interface NeuralCreateViewProps {
  ownNotes: NoteSourceOption[];
  platformNotes: NoteSourceOption[];
  sources: ExtractedSourceItem[];
  onSourcesChange: (next: ExtractedSourceItem[]) => void;
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
  engine: NeuralEngineState;
}

const MATERIAL_CARDS: Array<{
  type: MaterialType;
  title: string;
  subtitle: string;
  icon: typeof FileText;
  accent: string;
}> = [
  {
    type: 'summary',
    title: 'Derin Akademik Özet',
    subtitle: 'Çok aşamalı bölüm analizi, LaTeX formüller, karşılaştırma matrisi & ara sorular',
    icon: FileText,
    accent: 'from-cyan-500/20 to-blue-600/15 border-cyan-500/40',
  },
  {
    type: 'video',
    title: 'İnteraktif Video Ders',
    subtitle: 'Dr. Deniz & Barış diyaloğu, akıllı tahta grafikleri ve Türkçe VITS seslendirme',
    icon: Video,
    accent: 'from-violet-500/20 to-indigo-600/15 border-violet-500/40',
  },
  {
    type: 'quiz',
    title: 'Sınav & Rubrik Bankası',
    subtitle: 'Çoktan seçmeli + açık uçlu klasik sorular ve AI rubrik değerlendirmesi',
    icon: Sparkles,
    accent: 'from-amber-500/20 to-orange-600/15 border-amber-500/40',
  },
  {
    type: 'flashcards',
    title: 'SM-2 Aktif Kartlar',
    subtitle: 'İpuçları, sınav tuzakları ve aralıklı tekrar takvimiyle 3D hafıza kartları',
    icon: Layers,
    accent: 'from-emerald-500/20 to-teal-600/15 border-emerald-500/40',
  },
];

const PROMPT_CHIPS = [
  'Sayısal örneklerle adım adım çöz',
  'Vize & final tuzaklarına özellikle vurgu yap',
  'Türkiye ekonomisi güncel verileriyle ilişkilendir',
  'Grafik ve denklem türetimlerini eksiksiz ekle',
];

const LIVE_PASTE_DRAFT_ID = 'live-pasted-draft';

export function NeuralCreateView({
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
  engine,
}: NeuralCreateViewProps) {
  const [pasteText, setPasteText] = useState('');
  const [pasteLabel, setPasteLabel] = useState('');
  const [noteQuery, setNoteQuery] = useState('');
  const [extractingNoteId, setExtractingNoteId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync live pasted text directly as a draft source so typing enables generation immediately
  useEffect(() => {
    const trimmed = pasteText.trim();
    if (trimmed.length >= 25) {
      const draftItem = {
        ...buildPastedSourceItem(pasteLabel.trim() || customTitle.trim() || 'Yapıştırılan Not', trimmed, customCourse),
        id: LIVE_PASTE_DRAFT_ID,
      };
      const others = sources.filter((s) => s.id !== LIVE_PASTE_DRAFT_ID);
      onSourcesChange([draftItem, ...others]);
    } else if (sources.some((s) => s.id === LIVE_PASTE_DRAFT_ID)) {
      onSourcesChange(sources.filter((s) => s.id !== LIVE_PASTE_DRAFT_ID));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteText, pasteLabel]);

  const bundle = useMemo(
    () => combineStudySources(sources, customTitle.trim(), customCourse.trim()),
    [sources, customTitle, customCourse],
  );

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingFiles(true);
    const added: ExtractedSourceItem[] = [];
    try {
      for (const file of Array.from(fileList)) {
        const item = await extractUploadedSource(file);
        added.push(item);
      }
      onSourcesChange([...sources, ...added]);
      if (!customTitle.trim() && added[0]) {
        onCustomTitleChange(added[0].name.replace(/\.[^.]+$/, ''));
      }
      toast.success(`${added.length} dosya kaynak havuzuna eklendi.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dosya okunamadı.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleAddNoteFromLibrary = async (note: NoteSourceOption) => {
    if (sources.some((s) => s.originNoteId === note.id)) {
      onSourcesChange(sources.filter((s) => s.originNoteId !== note.id));
      return;
    }
    setExtractingNoteId(note.id);
    try {
      const item = onExtractRemoteNoteFile
        ? await onExtractRemoteNoteFile(note)
        : buildNoteSourceItem(note);
      onSourcesChange([...sources, item]);
      if (!customTitle.trim()) onCustomTitleChange(note.title);
      if (!customCourse.trim() && note.course) onCustomCourseChange(note.course);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Not yüklenemedi.');
    } finally {
      setExtractingNoteId(null);
    }
  };

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLocaleLowerCase('tr-TR');
    const combined = [...ownNotes, ...platformNotes];
    if (!q) return combined.slice(0, 30);
    return combined
      .filter((n) =>
        `${n.title} ${n.course || ''} ${n.department || ''}`.toLocaleLowerCase('tr-TR').includes(q),
      )
      .slice(0, 30);
  }, [ownNotes, platformNotes, noteQuery]);

  const canGenerate =
    !isGenerating &&
    (bundle.combinedText.trim().length >= 30 || bundle.images.length > 0 || Boolean(bundle.audio));

  return (
    <div className="space-y-5">
      {/* Header Metadata Row */}
      <div className="neural-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Çoklu Kaynak & AI Sentez İstasyonu</h2>
            <p className="text-xs text-muted-foreground">
              Dosya, yapıştırılan metin veya EconNotes kütüphanesindeki notları tek bir havuzda birleştir.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5 text-cyan-500" />
            {engine.prefs.routingPolicy === 'local_privacy'
              ? 'Yerel GPU Gizlilik Hattı'
              : 'Çok Aşamalı Bulut + GPU'}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="neural-study-title" className="text-xs">
              Çalışma Seti Başlığı
            </Label>
            <Input
              id="neural-study-title"
              placeholder="Örn: Para Teorisi 5. Hafta — Merkez Bankası"
              value={customTitle}
              onChange={(e) => onCustomTitleChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="neural-study-course" className="text-xs">
              Ders / Bilim Dalı (Otomatik algılanır)
            </Label>
            <Input
              id="neural-study-course"
              placeholder="Örn: Makroekonomi, Ekonometri, Hukuk..."
              value={customCourse}
              onChange={(e) => onCustomCourseChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main 12-Col Composer Grid */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Source Intake Panel */}
        <div className="neural-card p-5 lg:col-span-7">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="gap-1.5 text-xs">
                <FileUp className="h-3.5 w-3.5" />
                Bilgisayardan Yükle
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5 text-xs">
                <ClipboardPaste className="h-3.5 w-3.5" />
                Metin Yapıştır
              </TabsTrigger>
              <TabsTrigger value="library" className="gap-1.5 text-xs">
                <BookMarked className="h-3.5 w-3.5" />
                Not Kütüphanem
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-3">
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
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
                  dragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border/80 bg-muted/25 hover:border-primary/50 hover:bg-muted/45',
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILES}
                  onChange={(e) => void handleFiles(e.target.files)}
                  className="hidden"
                />
                {uploadingFiles ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <FileUp className="h-8 w-8 text-primary" />
                )}
                <p className="mt-3 text-sm font-semibold">
                  PDF, Word (.docx), PowerPoint (.pptx), Görsel veya Ses Sürükleyin
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Birden fazla hafta veya slayt aynı anda birleştirilebilir
                </p>
              </div>
            </TabsContent>

            <TabsContent value="paste" className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Yapıştırılan Bölüm Başlığı (İsteğe bağlı)</Label>
                <Input
                  placeholder="Örn: 3. Hafta Ders Notları"
                  value={pasteLabel}
                  onChange={(e) => setPasteLabel(e.target.value)}
                />
              </div>
              <Textarea
                rows={8}
                placeholder="Ders notunuzu, makale özetini veya amfi transkriptini buraya yapıştırın..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="font-mono text-xs leading-relaxed"
              />
            </TabsContent>

            <TabsContent value="library" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Kendi notların veya platform notları içinde ara..."
                  value={noteQuery}
                  onChange={(e) => setNoteQuery(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
              <ScrollArea className="h-56 rounded-xl border border-border/60 p-2">
                {filteredNotes.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Eşleşen ders notu bulunamadı.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {filteredNotes.map((note) => {
                      const selected = sources.some((s) => s.originNoteId === note.id);
                      const busy = extractingNoteId === note.id;
                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => void handleAddNoteFromLibrary(note)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                            selected
                              ? 'border-primary/50 bg-primary/10'
                              : 'border-border/50 bg-background/60 hover:bg-muted/60',
                          )}
                        >
                          <div className="min-w-0 pr-2">
                            <p className="truncate font-semibold">{note.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {note.course || 'Genel'} · {note.origin === 'own' ? 'Kendi Notun' : 'Platform'}
                            </p>
                          </div>
                          {busy ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : selected ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          ) : (
                            <span className="shrink-0 text-[11px] font-medium text-primary">+ Ekle</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Live Source X-Ray Box */}
          <div className="mt-4 rounded-2xl border border-border/70 bg-muted/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">Canlı Kaynak Röntgeni</span>
                {sources.length > 0 && (
                  <Badge variant="outline" className="text-[11px] text-cyan-600 dark:text-cyan-300">
                    {bundle.detectedDiscipline}
                  </Badge>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {bundle.sourceCount} kaynak · {bundle.totalWords} kelime · ~{bundle.totalPagesOrSlides} sayfa
              </span>
            </div>

            {sources.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Henüz kaynak eklenmedi. Dosya yükleyin, metin yapıştırın veya kütüphaneden not seçin.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-1.5 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="block truncate font-medium">{src.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {src.wordCount} kelime · {src.pagesOrSlides} sayfa/slayt
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (src.id === LIVE_PASTE_DRAFT_ID) setPasteText('');
                        onSourcesChange(sources.filter((item) => item.id !== src.id));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Configuration & Generation Panel */}
        <div className="neural-card flex flex-col justify-between p-5 lg:col-span-5">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Üretilecek Materyal Türü
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {MATERIAL_CARDS.map((card) => {
                  const Icon = card.icon;
                  const active = settings.materialType === card.type;
                  return (
                    <button
                      key={card.type}
                      type="button"
                      onClick={() => onSettingsChange({ ...settings, materialType: card.type })}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all',
                        active
                          ? `bg-gradient-to-br ${card.accent} shadow-sm`
                          : 'border-border/60 bg-background/50 hover:bg-muted/60',
                      )}
                    >
                      <Icon className={cn('mb-1.5 h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                      <p className="text-xs font-bold leading-snug">{card.title}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                        {card.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {settings.materialType === 'summary' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Özet Derinliği</Label>
                  <Select
                    value={settings.summaryDepth}
                    onValueChange={(v) => onSettingsChange({ ...settings, summaryDepth: v as SummaryDepth })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Hızlı Tekrar</SelectItem>
                      <SelectItem value="standard">Standart Fakülte</SelectItem>
                      <SelectItem value="comprehensive">Kapsamlı Derin</SelectItem>
                      <SelectItem value="textbook">Ders Kitabı Düzeyi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Pedagojik Stil</Label>
                  <Select
                    value={settings.pedagogicalStyle}
                    onValueChange={(v) =>
                      onSettingsChange({ ...settings, pedagogicalStyle: v as PedagogicalStyle })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balanced">Dengeli Akademik</SelectItem>
                      <SelectItem value="academic_rigor">Teorik & Formül</SelectItem>
                      <SelectItem value="feynman">Feynman Sezgisel</SelectItem>
                      <SelectItem value="case_study">Vaka & Türkiye</SelectItem>
                      <SelectItem value="quantitative">Sayısal Problem</SelectItem>
                      <SelectItem value="exam_blitz">Vize / Final Hızlı</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {settings.materialType === 'quiz' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <Label className="text-xs">Soru Sayısı: {settings.questionCount}</Label>
                  <Select
                    value={settings.quizFormat}
                    onValueChange={(v) => onSettingsChange({ ...settings, quizFormat: v as QuizFormat })}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mixed">Karma (Test+Klasik)</SelectItem>
                      <SelectItem value="multiple_choice">Yalnızca Test</SelectItem>
                      <SelectItem value="open_ended">Açık Uçlu Rubrik</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Slider
                  min={4}
                  max={25}
                  step={1}
                  value={[settings.questionCount]}
                  onValueChange={([v]) => onSettingsChange({ ...settings, questionCount: v })}
                />
              </div>
            )}

            {settings.materialType === 'flashcards' && (
              <div className="space-y-2">
                <Label className="text-xs">Kart Sayısı: {settings.cardCount}</Label>
                <Slider
                  min={6}
                  max={30}
                  step={2}
                  value={[settings.cardCount]}
                  onValueChange={([v]) => onSettingsChange({ ...settings, cardCount: v })}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Derin Akademik Araştırma & Vaka</p>
                <p className="text-[10px] text-muted-foreground">
                  Teori, formül sezgisini ve Türkiye vaka bağlantılarını zenginleştirir
                </p>
              </div>
              <Switch
                checked={settings.deepResearch}
                onCheckedChange={(v) => onSettingsChange({ ...settings, deepResearch: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                Özel Talimat & Hoca Odakları
              </Label>
              <Input
                placeholder="Örn: Özellikle Taylor kuralı ve IS-LM kaymalarını detaylandır"
                value={settings.customPrompt}
                onChange={(e) => onSettingsChange({ ...settings, customPrompt: e.target.value })}
                className="text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
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
                    className="rounded-full border border-border/60 bg-background/70 px-2.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-border/60 pt-4">
            {isGenerating && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium text-primary">
                    {generationLabel || 'Sentezleniyor...'}
                  </span>
                  <span className="font-mono text-[11px]">{generationPct}%</span>
                </div>
                <Progress value={generationPct} className="h-2" />
              </div>
            )}

            <Button
              type="button"
              disabled={!canGenerate}
              onClick={() => onGenerate(bundle)}
              className="gradient-cta h-11 w-full gap-2 text-sm font-semibold"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? 'Üretiliyor...' : 'Çalışma Materyalini Oluştur'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
