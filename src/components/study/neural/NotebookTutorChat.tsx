import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  BookOpenCheck,
  BookmarkPlus,
  Camera,
  Check,
  Copy,
  FileText,
  FileUp,
  HelpCircle,
  Layers,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { analyzeSingleSource, type CanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
import { extractFullDocumentOutline } from '@/lib/studySourceProcessor';
import { cn } from '@/lib/utils';
import type {
  CoachMode,
  ExtractedSourceItem,
  MaterialType,
  NotebookAttachmentImage,
  NotebookChatMessage,
  StudyMaterial,
} from '@/types/study';
import { toast } from 'sonner';
import {
  STUDIO_BADGE_COURSE,
  STUDIO_BADGE_WARN,
  STUDIO_BTN_GHOST,
  STUDIO_BTN_PRIMARY,
  STUDIO_BTN_SECONDARY,
  STUDIO_CARD_ACTIVE,
  STUDIO_CARD_SUBTLE,
  STUDIO_PANEL_BODY,
  STUDIO_PANEL_HEADER,
  STUDIO_PANEL_SHELL,
  STUDIO_SEGMENTED_ITEM_ACTIVE,
  STUDIO_SEGMENTED_ITEM_IDLE,
  STUDIO_SEGMENTED_WRAP,
} from './studioDesign';

interface NotebookTutorChatProps {
  notebookTitle: string;
  notebookEmoji: string;
  activeSources: ExtractedSourceItem[];
  activeMaterials: StudyMaterial[];
  notebookMaterials?: StudyMaterial[];
  canonicalAnalysis: CanonicalSourceAnalysis;
  messages: NotebookChatMessage[];
  coachMode: CoachMode;
  onCoachModeChange: (mode: CoachMode) => void;
  busy: boolean;
  streamingText: string;
  isGenerating?: boolean;
  onSendMessage: (params: {
    text: string;
    mode?: CoachMode;
    images?: NotebookAttachmentImage[];
  }) => Promise<void> | void;
  onPinMessage: (msg: NotebookChatMessage) => void;
  onClearChat: () => void;
  onOpenAddSource: (tab: 'upload' | 'notes' | 'paste' | 'live') => void;
  onOpenMaterial?: (mat: StudyMaterial) => void;
  onGenerateType?: (type: MaterialType) => void;
  onRequestCourseConfirm?: () => void;
}

const TUTOR_MODES: Array<{
  id: CoachMode;
  label: string;
  shortDesc: string;
}> = [
  { id: 'step_by_step', label: 'Adım Adım Çöz', shortDesc: 'Astra AI tarzı verilenler → formül → tam çözüm' },
  { id: 'reinforce', label: 'Pekiştir', shortDesc: 'Sade anlatım + nottan örnek + mini kontrol sorusu' },
  { id: 'socratic', label: 'Sokratik', shortDesc: 'Hazır cevap yerine ipucu ve soruyla düşündürür' },
  { id: 'feynman', label: 'Sıfırdan Basitçe', shortDesc: 'Karmaşık kavramı en yalın mantıkla açar' },
  { id: 'tutor', label: 'Kaynaklı Net', shortDesc: 'NotebookLM tarzı doğrudan kaynak atıflı yanıt' },
  { id: 'deep_research', label: 'Derin Analiz', shortDesc: 'Kürsü düzeyinde teori, formül ve vaka bağlantısı' },
];

function fileToAttachmentImage(file: File): Promise<NotebookAttachmentImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Görsel okunamadı.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      const base64 = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
      resolve({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        dataUrl,
        base64,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function NotebookTutorChat({
  notebookTitle,
  notebookEmoji,
  activeSources,
  activeMaterials,
  notebookMaterials = [],
  canonicalAnalysis,
  messages,
  coachMode,
  onCoachModeChange,
  busy,
  streamingText,
  isGenerating = false,
  onSendMessage,
  onPinMessage,
  onClearChat,
  onOpenAddSource,
  onOpenMaterial,
  onGenerateType,
  onRequestCourseConfirm,
}: NotebookTutorChatProps) {
  const [centerTab, setCenterTab] = useState<'study' | 'document' | 'summaries'>('study');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<NotebookAttachmentImage[]>([]);
  const [expandedCitationKey, setExpandedCitationKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Record<string, boolean>>({});
  const [listening, setListening] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const totalActiveCount = activeSources.length + activeMaterials.length;

  const summaryMaterials = useMemo(
    () => notebookMaterials.filter((m) => m.material_type === 'summary'),
    [notebookMaterials],
  );

  const selectedDocument = useMemo(() => {
    if (activeSources.length === 0) return null;
    return activeSources.find((s) => s.id === selectedDocId) || activeSources[0];
  }, [activeSources, selectedDocId]);

  const selectedDocProfile = useMemo(
    () => (selectedDocument ? analyzeSingleSource(selectedDocument) : null),
    [selectedDocument],
  );

  const selectedDocOutline = useMemo(
    () => (selectedDocument?.text ? extractFullDocumentOutline(selectedDocument.text, 24) : []),
    [selectedDocument],
  );

  const briefing = useMemo(() => {
    const topics: string[] = [];
    for (const item of canonicalAnalysis.masterOutline) {
      if (!topics.includes(item.heading) && topics.length < 6) {
        topics.push(item.heading);
      }
    }
    for (const mat of activeMaterials) {
      const secs = mat.content?.sections || [];
      for (const sec of secs) {
        if (sec?.heading && !topics.includes(sec.heading) && topics.length < 6) {
          topics.push(sec.heading);
        }
      }
    }
    return {
      words: canonicalAnalysis.totalWords,
      pages: canonicalAnalysis.totalPagesOrSlides,
      courseLabel: canonicalAnalysis.primaryCourseLabel,
      distinctCourses: canonicalAnalysis.distinctCourses,
      isMultiCourse: canonicalAnalysis.isMultiCourse,
      warnings: canonicalAnalysis.extractionWarnings,
      hasUnconfirmed: canonicalAnalysis.hasUnconfirmedCourses,
      topics,
    };
  }, [canonicalAnalysis, activeMaterials]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingText, busy]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleAttachImages = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = Math.max(0, 3 - attachments.length);
    if (remaining === 0) {
      toast.info('Tek mesajda en fazla 3 soru fotoğrafı ekleyebilirsin.');
      return;
    }
    const picked = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, remaining);

    if (picked.length === 0) {
      toast.error('Lütfen PNG, JPG veya WEBP formatında görsel seçin.');
      return;
    }

    try {
      const converted = await Promise.all(picked.map(fileToAttachmentImage));
      setAttachments((prev) => [...prev, ...converted]);
      // Automatically suggest Astra AI step-by-step mode when snapping a question photo
      if (coachMode !== 'step_by_step' && coachMode !== 'socratic') {
        onCoachModeChange('step_by_step');
      }
      toast.success(`${converted.length} soru fotoğrafı eklendi. Adım adım çözüm için gönderebilirsin.`);
    } catch {
      toast.error('Görsel yüklenemedi.');
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const toggleVoiceInput = () => {
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      toast.info('Tarayıcınız sesli soru girişini desteklemiyor. Yazarak veya fotoğraf ekleyerek sorabilirsiniz.');
      return;
    }

    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = 'tr-TR';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (typeof transcript === 'string' && transcript.trim()) {
          setInput((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        }
      };
      rec.onerror = () => {
        setListening(false);
      };
      rec.onend = () => {
        setListening(false);
      };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      toast.error('Mikrofon başlatılamadı.');
    }
  };

  const handleSubmit = async (overrideText?: string, overrideMode?: CoachMode) => {
    const text = (overrideText ?? input).trim();
    const currentImages = overrideText ? [] : attachments;
    if ((!text && currentImages.length === 0) || busy) return;

    if (!overrideText) {
      setInput('');
      setAttachments([]);
    }

    await onSendMessage({
      text: text || 'Bu görseldeki soruyu adım adım, her basamağını açıklayarak çöz.',
      mode: overrideMode || coachMode,
      images: currentImages.length > 0 ? currentImages : undefined,
    });
  };

  const handleCopy = async (msg: NotebookChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((cur) => (cur === msg.id ? null : cur)), 1800);
    } catch {
      toast.error('Kopyalanamadı.');
    }
  };

  const activeModeMeta = TUTOR_MODES.find((m) => m.id === coachMode) || TUTOR_MODES[0];

  return (
    <div className={STUDIO_PANEL_SHELL}>
      {/* Unified Center Panel Header */}
      <div className={STUDIO_PANEL_HEADER}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-sm">
            {notebookEmoji}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {notebookTitle}
              </h2>
              {briefing.courseLabel && (
                <span
                  className={cn(STUDIO_BADGE_COURSE, 'hidden max-w-[200px] sm:inline-flex')}
                  title={briefing.courseLabel}
                >
                  <span className="truncate">{briefing.courseLabel}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {totalActiveCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <BookOpenCheck className="h-3.5 w-3.5 shrink-0" />
                  {totalActiveCount} kaynak bağlı · Kaynağa sadık çalışma alanı
                </span>
              ) : (
                <span>Kaynak ekleyerek çalışmaya başla veya doğrudan soru sor</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {messages.length > 0 && centerTab === 'study' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearChat}
              className={cn(STUDIO_BTN_GHOST, 'h-8 gap-1 px-2.5 text-[11px]')}
              title="Sohbeti temizle"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Temizle</span>
            </Button>
          )}
        </div>
      </div>

      {/* Minimalist Center Workspace View Switcher: Çalışma Alanı · Kaynak İçeriği · Özetler */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-4 py-2">
        <div className={STUDIO_SEGMENTED_WRAP}>
          <button
            type="button"
            onClick={() => setCenterTab('study')}
            className={
              centerTab === 'study' ? STUDIO_SEGMENTED_ITEM_ACTIVE : STUDIO_SEGMENTED_ITEM_IDLE
            }
          >
            Çalışma Alanı
          </button>
          <button
            type="button"
            onClick={() => setCenterTab('document')}
            className={
              centerTab === 'document' ? STUDIO_SEGMENTED_ITEM_ACTIVE : STUDIO_SEGMENTED_ITEM_IDLE
            }
          >
            Kaynak İçeriği{activeSources.length > 0 ? ` (${activeSources.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setCenterTab('summaries')}
            className={
              centerTab === 'summaries' ? STUDIO_SEGMENTED_ITEM_ACTIVE : STUDIO_SEGMENTED_ITEM_IDLE
            }
          >
            Özetler{summaryMaterials.length > 0 ? ` (${summaryMaterials.length})` : ''}
          </button>
        </div>

        {totalActiveCount > 0 && onGenerateType && (
          <Button
            type="button"
            size="sm"
            disabled={isGenerating}
            onClick={() => onGenerateType('summary')}
            className={cn(STUDIO_BTN_PRIMARY, 'h-8 gap-1.5 px-3 text-[11px]')}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span>Ayrıntılı Özet Üret</span>
          </Button>
        )}
      </div>

      {/* Center Panel Main Body */}
      <div className={cn(STUDIO_PANEL_BODY, 'px-4 py-4')}>
        {centerTab === 'document' ? (
          <div className="mx-auto max-w-3xl space-y-4">
            {activeSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-5 py-10 text-center">
                <FileText className="mb-2.5 h-6 w-6 text-primary" />
                <p className="text-sm font-semibold text-foreground">Seçili kaynak bulunmuyor</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Sol panelden PDF, PowerPoint, Word belgesi veya EconNotes ders notu eklediğinde belge içeriğini burada okuyabilirsin.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onOpenAddSource('upload')}
                  className={cn(STUDIO_BTN_PRIMARY, 'mt-4 gap-1.5')}
                >
                  <FileUp className="h-4 w-4" />
                  Kaynak Ekle
                </Button>
              </div>
            ) : (
              <>
                {activeSources.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeSources.map((src) => {
                      const active = selectedDocument?.id === src.id;
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => setSelectedDocId(src.id)}
                          className={cn(
                            'inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors',
                            active
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/80 bg-background text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{src.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedDocument && (
                  <div className="space-y-4">
                    <div className={cn(STUDIO_CARD_ACTIVE, 'p-4')}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedDocProfile?.resolvedCourse ? (
                              <span className={STUDIO_BADGE_COURSE}>
                                {selectedDocProfile.resolvedCourse}
                              </span>
                            ) : (
                              <span className={STUDIO_BADGE_WARN}>Ders Doğrulaması Bekleniyor</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              ~{selectedDocument.pagesOrSlides} sayfa ·{' '}
                              {selectedDocument.wordCount.toLocaleString('tr-TR')} kelime
                            </span>
                          </div>
                          <h3 className="break-words text-sm font-semibold text-foreground sm:text-base">
                            {selectedDocument.name}
                          </h3>
                        </div>
                      </div>

                      {selectedDocOutline.length > 0 && (
                        <div className="mt-3 border-t border-border/70 pt-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Belgedeki Ana Başlıklar ({selectedDocOutline.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedDocOutline.slice(0, 14).map((item, idx) => (
                              <button
                                key={`${item.heading}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setCenterTab('study');
                                  void handleSubmit(
                                    `"${item.heading}" başlığını yalnızca "${selectedDocument.name}" belgeme dayanarak ayrıntılı ve anlaşılır şekilde açıkla.`,
                                    'reinforce',
                                  );
                                }}
                                className="inline-flex max-w-[260px] items-center gap-1 rounded-lg border border-border/80 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/45 hover:text-primary"
                              >
                                <span className="truncate">{item.heading}</span>
                                {item.pageHint && (
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    ({item.pageHint})
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={cn(STUDIO_CARD_SUBTLE, 'p-4')}>
                      <div className="mb-2.5 flex items-center justify-between border-b border-border/60 pb-2">
                        <span className="text-xs font-semibold text-foreground">
                          Çıkarılan Belge Metni
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          İlk {Math.min(selectedDocument.text.length, 32000).toLocaleString('tr-TR')} karakter
                        </span>
                      </div>
                      <pre className="max-h-[460px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">
                        {selectedDocument.text.slice(0, 32000)}
                        {selectedDocument.text.length > 32000
                          ? '\n\n... (Belgenin tamamı ayrıntılı özet üretiminde parçalara bölünerek işlenir.)'
                          : ''}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : centerTab === 'summaries' ? (
          <div className="mx-auto max-w-3xl space-y-3.5">
            {summaryMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-5 py-10 text-center">
                <FileText className="mb-2.5 h-6 w-6 text-primary" />
                <p className="text-sm font-semibold text-foreground">
                  Bu çalışma defterinde henüz ayrıntılı özet oluşturulmadı
                </p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Seçili kaynaklarından tüm sayfaları, kavramları, teorileri, formülleri ve sınav ayrımlarını kapsayan 9 bölümlü çalışma rehberi oluşturabilirsin.
                </p>
                {onGenerateType && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={isGenerating || totalActiveCount === 0}
                    onClick={() => onGenerateType('summary')}
                    className={cn(STUDIO_BTN_PRIMARY, 'mt-4 gap-1.5')}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Ayrıntılı Özet Oluştur
                  </Button>
                )}
              </div>
            ) : (
              summaryMaterials.map((mat) => {
                const secCount = Array.isArray(mat.content?.sections)
                  ? mat.content.sections.length
                  : 0;
                const overview = String(mat.content?.overview || '');
                return (
                  <div
                    key={mat.id}
                    className={cn(STUDIO_CARD_SUBTLE, 'space-y-3 p-4 hover:border-primary/40')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={STUDIO_BADGE_COURSE}>
                            {mat.course || mat.content?.disciplineTag || 'Ders Özeti'}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {secCount} bölüm · {new Date(mat.created_at).toLocaleDateString('tr-TR')}
                          </span>
                        </div>
                        <h3 className="break-words text-sm font-semibold text-foreground">
                          {mat.title}
                        </h3>
                      </div>
                      {onOpenMaterial && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onOpenMaterial(mat)}
                          className={cn(STUDIO_BTN_PRIMARY, 'h-8 shrink-0 gap-1.5 px-3')}
                        >
                          <span>Tam Özeti Aç</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {overview && (
                      <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                        {overview.replace(/[*#_`]/g, '')}
                      </p>
                    )}
                    {Array.isArray(mat.content?.sections) && mat.content.sections.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                        {mat.content.sections.slice(0, 6).map((s: any, si: number) => (
                          <span
                            key={si}
                            className="rounded-lg border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {si + 1}. {String(s?.heading || `Bölüm ${si + 1}`).slice(0, 42)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-2xl space-y-4 py-1">
            {totalActiveCount > 0 ? (
              /* Clean Academic Briefing Card */
              <div className="space-y-4">
                <div className={cn(STUDIO_CARD_ACTIVE, 'p-4 sm:p-5')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={STUDIO_BADGE_COURSE}>
                          <BookOpenCheck className="h-3.5 w-3.5" />
                          Ortak Kaynak Analizi Hazır
                        </span>
                        {briefing.distinctCourses.map((c) => (
                          <Badge key={c} variant="secondary" className="rounded-lg text-[11px] font-medium">
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <h3 className="break-words text-base font-semibold text-foreground sm:text-lg">
                        {notebookTitle}
                      </h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">{totalActiveCount} aktif kaynak</strong>
                        {briefing.words > 0
                          ? ` (~${briefing.pages} sayfa · ${briefing.words.toLocaleString('tr-TR')} kelime)`
                          : ''}{' '}
                        bağlandı.{' '}
                        {briefing.isMultiCourse
                          ? 'Birden fazla farklı ders seçili; her dersin içeriği kendi kaynağı altında ayrı korunur.'
                          : 'Özet, sınav, çalışma kartı ve AI yanıtları yalnızca seçili kaynakların gerçek içeriğine dayanır.'}
                      </p>
                    </div>
                  </div>

                  {briefing.hasUnconfirmed && onRequestCourseConfirm && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Bazı kaynakların dersi kesin belirlenemedi; otomatik tahminde bulunulmadı.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onRequestCourseConfirm}
                        className="h-8 rounded-xl border-amber-500/45 bg-background px-3 text-xs font-semibold"
                      >
                        Doğru Dersi Seç
                      </Button>
                    </div>
                  )}

                  {briefing.warnings.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Belge Okuma Notu:</p>
                      <p className="mt-0.5 text-muted-foreground">{briefing.warnings[0]}</p>
                    </div>
                  )}

                  {briefing.topics.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-border/70 pt-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Tespit Edilen Ana Başlıklar (Tıkla &amp; Çalış)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {briefing.topics.map((topic) => (
                          <button
                            key={topic}
                            type="button"
                            onClick={() =>
                              void handleSubmit(
                                `"${topic}" konusunu seçili kaynaklarıma göre sade adımlarla pekiştirerek anlat, somut örnek ver ve sonunda 1 kısa kontrol sorusu sor.`,
                                'reinforce',
                              )
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/45 hover:bg-primary/[0.04] hover:text-primary"
                          >
                            <BookOpen className="h-3.5 w-3.5 text-primary" />
                            <span className="max-w-[230px] truncate">{topic}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Smart Starter Prompts */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {[
                    {
                      title: 'Sınavda Çıkabilecek Kritik Konular',
                      prompt:
                        'Seçili kaynaklarımda vize/final sınavında çıkması en olası 5 konuyu öncelik sırasıyla, neden önemli olduklarıyla çıkar.',
                      mode: 'tutor' as CoachMode,
                    },
                    {
                      title: 'Adım Adım Pekiştirme Dersi',
                      prompt:
                        'Bu kaynaklardaki en zor kavramı sıfırdan, adım adım ve somut bir örnekle öğret.',
                      mode: 'step_by_step' as CoachMode,
                    },
                    {
                      title: 'Sokratik Aktif Hatırlama',
                      prompt:
                        'Seçili kaynaklarımdan bana 1 kısa soru sorarak başla; ben cevapladıkça ipucu verip pekiştir.',
                      mode: 'socratic' as CoachMode,
                    },
                    {
                      title: 'Karşılaştırma & Tuzak Özeti',
                      prompt:
                        'Kaynaklardaki birbiriyle en çok karıştırılan kavramları tablo halinde karşılaştır ve sınav tuzaklarını vurgula.',
                      mode: 'reinforce' as CoachMode,
                    },
                  ].map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => void handleSubmit(card.prompt, card.mode)}
                      className={cn(
                        STUDIO_CARD_SUBTLE,
                        'group p-3.5 text-left hover:border-primary/45 hover:bg-primary/[0.03]',
                      )}
                    >
                      <p className="text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                        {card.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {card.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Clean Minimalist Empty Welcome Hero */
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#003791] text-white shadow-sm">
                  <BookOpen className="h-6 w-6" strokeWidth={1.85} />
                </div>
                <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                  Çalışma Alanın Hazır
                </h3>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Ders notlarını yükleyip ayrıntılı özet, deneme sınavı ve çalışma kartları oluştur — ya da soru fotoğrafı yükleyip adım adım çözüm iste.
                </p>

                <div className="mt-5 grid w-full max-w-xl gap-2.5 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => onOpenAddSource('upload')}
                    className={cn(
                      STUDIO_CARD_SUBTLE,
                      'group flex flex-col items-center p-4 text-center hover:border-primary/45 hover:bg-primary/[0.04]',
                    )}
                  >
                    <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <FileUp className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs font-semibold text-foreground">PDF / Slayt Yükle</span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      PDF, PPTX, DOCX, TXT
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenAddSource('notes')}
                    className={cn(
                      STUDIO_CARD_SUBTLE,
                      'group flex flex-col items-center p-4 text-center hover:border-primary/45 hover:bg-primary/[0.04]',
                    )}
                  >
                    <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <Layers className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs font-semibold text-foreground">EconNotes Notu Seç</span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      Paylaşılan ders notları
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className={cn(
                      STUDIO_CARD_SUBTLE,
                      'group flex flex-col items-center p-4 text-center hover:border-primary/45 hover:bg-primary/[0.04]',
                    )}
                  >
                    <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <Camera className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs font-semibold text-foreground">Soru Fotoğrafı Çöz</span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      Adım adım çözüm
                    </span>
                  </button>
                </div>

                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {[
                    'IS-LM dengesini adım adım ve grafik mantığıyla anlat',
                    'Vize öncesi 3 günde en verimli nasıl çalışmalıyım?',
                    'Anayasa hukukunda normlar hiyerarşisini örneklerle açıkla',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleSubmit(q, 'step_by_step')}
                      className="rounded-xl border border-border/80 bg-background px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/45 hover:text-primary"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 pb-2">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[88%]',
                      isUser
                        ? 'bg-[#003791] text-white'
                        : 'border border-border/80 bg-background text-foreground',
                    )}
                  >
                    {/* User image attachments (Snap & Solve) */}
                    {isUser && msg.attachmentPreviews && msg.attachmentPreviews.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {msg.attachmentPreviews.map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt={msg.attachmentNames?.[idx] || 'Soru fotoğrafı'}
                            className="h-24 w-auto max-w-[180px] rounded-xl border border-white/25 object-cover shadow-sm"
                          />
                        ))}
                      </div>
                    )}
                    {isUser && (!msg.attachmentPreviews || msg.attachmentPreviews.length === 0) && msg.attachmentNames && msg.attachmentNames.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {msg.attachmentNames.map((name, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px]"
                          >
                            <Camera className="h-3 w-3" /> {name}
                          </span>
                        ))}
                      </div>
                    )}

                    {isUser ? (
                      <p className="whitespace-pre-wrap break-words text-xs sm:text-sm">{msg.content}</p>
                    ) : (
                      <div className="prose-sm max-w-full min-w-0 overflow-x-auto break-words text-xs sm:text-[13.5px]">
                        <AcademicMarkdown content={msg.content} />
                      </div>
                    )}

                    {/* Assistant clickable NotebookLM Citations */}
                    {!isUser && msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10.5px] font-semibold text-muted-foreground">
                            Kaynak Atıfları:
                          </span>
                          {msg.citations.slice(0, 5).map((hit, idx) => {
                            const key = `${msg.id}-${idx}`;
                            const open = expandedCitationKey === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  setExpandedCitationKey(open ? null : key)
                                }
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors',
                                  open
                                    ? 'border-primary bg-primary/15 text-primary'
                                    : 'border-border/70 bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                                )}
                              >
                                <span className="font-bold text-primary">[{idx + 1}]</span>
                                <span className="max-w-[140px] truncate">{hit.docTitle}</span>
                              </button>
                            );
                          })}
                        </div>

                        {msg.citations.slice(0, 5).map((hit, idx) => {
                          const key = `${msg.id}-${idx}`;
                          if (expandedCitationKey !== key) return null;
                          return (
                            <div
                              key={`exp-${key}`}
                              className="rounded-xl border border-primary/25 bg-primary/[0.04] p-2.5 text-[11px] leading-relaxed text-foreground/90"
                            >
                              <p className="mb-1 font-semibold text-primary">
                                [{idx + 1}] {hit.docTitle} · {hit.sectionHeading}
                              </p>
                              <p className="text-muted-foreground">{hit.excerpt}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Meta + Action Bar under Assistant Messages (NotebookLM Save to Note + Astra follow-ups) */}
                    {!isUser && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onPinMessage(msg);
                              setPinnedIds((prev) => ({ ...prev, [msg.id]: true }));
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
                              pinnedIds[msg.id]
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            {pinnedIds[msg.id] ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <BookmarkPlus className="h-3 w-3 text-primary" />
                            )}
                            {pinnedIds[msg.id] ? 'Sabitlendi' : 'Notlara Sabitle'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopy(msg)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedId === msg.id ? 'Kopyalandı' : 'Kopyala'}
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleSubmit(
                                'Bunu biraz daha sade ve günlük bir örnekle adım adım tekrar anlatır mısın?',
                                'feynman',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          >
                            <Wand2 className="h-3 w-3" />
                            Basitleştir
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleSubmit(
                                'Az önce anlattığın kısımla ilgili beni 1 kısa pekiştirme sorusuyla test et.',
                                'socratic',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
                          >
                            <HelpCircle className="h-3 w-3" />
                            Test Et
                          </button>
                        </div>

                        {msg.meta && (
                          <span className="text-[10px] text-muted-foreground">{msg.meta}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {busy && (
              <div className="flex items-start">
                <div className="max-w-[88%] rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-3 text-xs text-foreground">
                  {streamingText ? (
                    <AcademicMarkdown content={streamingText} />
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>
                        {coachMode === 'step_by_step'
                          ? 'Adım adım çözüm hazırlanıyor...'
                          : totalActiveCount > 0
                          ? 'Seçili kaynakların taranıyor ve yanıt sentezleniyor...'
                          : 'AI Öğretmen yanıt hazırlıyor...'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Bottom Mode Selector + Multimodal Composer */}
      <div className="shrink-0 border-t border-border/70 bg-muted/20 p-3">
        {/* Learning Mode Pills */}
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TUTOR_MODES.map((m) => {
            const active = coachMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={m.shortDesc}
                onClick={() => onCoachModeChange(m.id)}
                className={cn(
                  'h-7 shrink-0 rounded-lg border px-2.5 text-[11px] font-medium transition-colors',
                  active
                    ? 'border-primary/35 bg-primary/10 font-semibold text-primary'
                    : 'border-border/80 bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Pending Snap & Solve image previews */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] p-1.5 pr-7"
              >
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  className="h-10 w-10 rounded-lg object-cover"
                />
                <div className="max-w-[130px]">
                  <p className="truncate text-[11px] font-semibold text-foreground">{att.name}</p>
                  <p className="text-[10px] text-primary">Çözüm için hazır</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
                  aria-label="Görseli kaldır"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Composer Input Bar */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void handleAttachImages(e.target.files)}
        />
        <div className="flex items-end gap-2 rounded-xl border border-border/80 bg-card p-1.5 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => imageInputRef.current?.click()}
            className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Soru fotoğrafı çek / yükle"
          >
            <Camera className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={toggleVoiceInput}
            className={cn(
              'h-9 w-9 shrink-0 rounded-xl',
              listening
                ? 'bg-rose-500/15 text-rose-500 animate-pulse'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary',
            )}
            title={listening ? 'Dinlemeyi durdur' : 'Mikrofonla soru sor'}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                setCenterTab('study');
                void handleSubmit();
              }
            }}
            placeholder={
              attachments.length > 0
                ? 'Görselle ilgili notun varsa yaz veya direkt Gönder’e bas...'
                : totalActiveCount > 0
                ? `${activeModeMeta.label}: Seçili ${totalActiveCount} kaynak hakkında sor...`
                : `${activeModeMeta.label}: Ders sorusu sor veya soru fotoğrafı yükle...`
            }
            rows={1}
            className="max-h-28 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-xs shadow-none focus-visible:ring-0 sm:text-sm"
          />

          <Button
            type="button"
            size="icon"
            disabled={busy || (!input.trim() && attachments.length === 0)}
            onClick={() => {
              setCenterTab('study');
              void handleSubmit();
            }}
            className={cn(STUDIO_BTN_PRIMARY, 'h-9 w-9 shrink-0 px-0')}
            aria-label="Mesaj gönder"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">
          {activeModeMeta.shortDesc}
        </p>
      </div>
    </div>
  );
}
