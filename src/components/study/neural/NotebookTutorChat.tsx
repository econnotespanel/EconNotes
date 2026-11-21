import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookOpenCheck,
  BookmarkPlus,
  Camera,
  Check,
  Copy,
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
import type { CanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
import { cn } from '@/lib/utils';
import type {
  CoachMode,
  ExtractedSourceItem,
  NotebookAttachmentImage,
  NotebookChatMessage,
  StudyMaterial,
} from '@/types/study';
import { toast } from 'sonner';

interface NotebookTutorChatProps {
  notebookTitle: string;
  notebookEmoji: string;
  activeSources: ExtractedSourceItem[];
  activeMaterials: StudyMaterial[];
  canonicalAnalysis: CanonicalSourceAnalysis;
  messages: NotebookChatMessage[];
  coachMode: CoachMode;
  onCoachModeChange: (mode: CoachMode) => void;
  busy: boolean;
  streamingText: string;
  onSendMessage: (params: {
    text: string;
    mode?: CoachMode;
    images?: NotebookAttachmentImage[];
  }) => Promise<void> | void;
  onPinMessage: (msg: NotebookChatMessage) => void;
  onClearChat: () => void;
  onOpenAddSource: (tab: 'upload' | 'notes' | 'paste' | 'live') => void;
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
  canonicalAnalysis,
  messages,
  coachMode,
  onCoachModeChange,
  busy,
  streamingText,
  onSendMessage,
  onPinMessage,
  onClearChat,
  onOpenAddSource,
  onRequestCourseConfirm,
}: NotebookTutorChatProps) {
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
    <div className="flex h-full min-h-[540px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/75 bg-card/95 shadow-xs xl:h-[calc(100vh-11.5rem)] xl:min-h-[600px]">
      {/* Center Panel Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-primary/[0.04] via-transparent to-violet-500/[0.04] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-base">
            {notebookEmoji}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">{notebookTitle}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {totalActiveCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <BookOpenCheck className="h-3 w-3 shrink-0" />
                  {totalActiveCount} kaynak bağlı · Kaynağa sadık
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  AI Öğretmen &amp; Snap-Solve Hazır
                </span>
              )}
              {briefing.courseLabel && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[220px] font-medium text-foreground/80">
                    {briefing.courseLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            className="h-8 shrink-0 gap-1 rounded-xl px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
            title="Sohbeti temizle"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Temizle</span>
          </Button>
        )}
      </div>

      {/* Chat & Briefing Body (native overflow-x-hidden keeps wide tables inside bubbles) */}
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-4">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl space-y-4 py-1">
            {totalActiveCount > 0 ? (
              /* NotebookLM-style Auto Briefing Card when sources are selected */
              <div className="space-y-4">
                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-violet-500/[0.05] p-4 shadow-xs sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-primary">
                          <Sparkles className="h-3 w-3" />
                          Ortak Kaynak Analizi Hazır
                        </div>
                        {briefing.distinctCourses.map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10.5px] font-semibold">
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <h3 className="break-words text-base font-bold text-foreground sm:text-lg">
                        {notebookTitle}
                      </h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <strong>{totalActiveCount} aktif kaynak</strong>
                        {briefing.words > 0
                          ? ` (~${briefing.pages} sayfa · ${briefing.words.toLocaleString('tr-TR')} kelime)`
                          : ''}{' '}
                        bağlandı.{' '}
                        {briefing.isMultiCourse
                          ? 'Birden fazla farklı ders seçili; her dersin içeriği kendi kaynağı altında ayrı korunur.'
                          : 'Tüm yanıtlar ve Stüdyo araçları seçili kaynaklarının gerçek içeriğine dayanır.'}
                      </p>
                    </div>
                  </div>

                  {briefing.hasUnconfirmed && onRequestCourseConfirm && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Bazı kaynakların dersi kesin tespit edilemedi; otomatik tahminde bulunulmadı.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onRequestCourseConfirm}
                        className="h-7 rounded-lg border-amber-500/45 bg-background/80 px-2.5 text-[11px] font-semibold"
                      >
                        Doğru Dersi Seç
                      </Button>
                    </div>
                  )}

                  {briefing.warnings.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Belge Okuma Notu:</p>
                      <p className="mt-0.5 text-muted-foreground">{briefing.warnings[0]}</p>
                    </div>
                  )}

                  {briefing.topics.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-border/60 pt-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Kaynaklarda Tespit Edilen Ana Başlıklar (Tıkla &amp; Öğren)
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
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                          >
                            <BookOpen className="h-3 w-3 text-primary" />
                            <span className="truncate max-w-[230px]">{topic}</span>
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
                      className="group rounded-xl border border-border/75 bg-background/60 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-sm"
                    >
                      <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
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
              /* NotebookLM × Astra AI Empty Welcome Hero */
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-blue-500/15 to-violet-500/20 text-primary shadow-sm ring-1 ring-primary/20">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
                  Kişisel AI Çalışma Defterin Hazır
                </h3>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Notlarını yükleyip kaynaklarına sadık özet, video ders, test ve zihin haritası üret — ya da{' '}
                  <strong className="text-foreground">soru fotoğrafı çekip adım adım çözüm</strong> iste.
                </p>

                <div className="mt-5 grid w-full max-w-xl gap-2.5 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => onOpenAddSource('upload')}
                    className="group flex flex-col items-center rounded-2xl border border-border/75 bg-background/70 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/[0.04] hover:shadow-sm"
                  >
                    <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/12 text-blue-600 dark:text-blue-400">
                      <FileUp className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-bold text-foreground">PDF / Slayt Yükle</span>
                    <span className="mt-0.5 text-[10.5px] text-muted-foreground">
                      PDF, PPTX, DOCX, TXT
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenAddSource('notes')}
                    className="group flex flex-col items-center rounded-2xl border border-border/75 bg-background/70 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-violet-500/45 hover:bg-violet-500/[0.04] hover:shadow-sm"
                  >
                    <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
                      <Layers className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-bold text-foreground">EconNotes Notu Seç</span>
                    <span className="mt-0.5 text-[10.5px] text-muted-foreground">
                      Paylaşılan tüm ders notları
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="group flex flex-col items-center rounded-2xl border border-border/75 bg-background/70 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-500/45 hover:bg-emerald-500/[0.04] hover:shadow-sm"
                  >
                    <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                      <Camera className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-bold text-foreground">Soru Fotoğrafı Çöz</span>
                    <span className="mt-0.5 text-[10.5px] text-muted-foreground">
                      Snap &amp; Solve adım adım
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
                      className="rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
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
                      'max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs sm:max-w-[88%]',
                      isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border/75 bg-background/90 text-foreground',
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
                                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
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

      {/* Bottom Astra AI Mode Selector + Multimodal Composer */}
      <div className="shrink-0 border-t border-border/60 bg-background/80 p-3 backdrop-blur-md">
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
                  'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                  active
                    ? 'border-primary/40 bg-primary/12 text-primary font-semibold shadow-2xs'
                    : 'border-border/70 bg-card/70 text-muted-foreground hover:border-primary/30 hover:text-foreground',
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
                  <p className="text-[10px] text-primary">Snap &amp; Solve hazır</p>
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
        <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => imageInputRef.current?.click()}
            className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Soru fotoğrafı çek / yükle (Snap & Solve)"
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
                void handleSubmit();
              }
            }}
            placeholder={
              attachments.length > 0
                ? 'Görselle ilgili notun varsa yaz veya direkt Gönder’e bas...'
                : totalActiveCount > 0
                ? `${activeModeMeta.label}: Seçili ${totalActiveCount} kaynak hakkında sor...`
                : `${activeModeMeta.label}: Ders sorusu sor veya kamera ile soru fotoğrafı yükle...`
            }
            rows={1}
            className="max-h-28 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-xs shadow-none focus-visible:ring-0 sm:text-sm"
          />

          <Button
            type="button"
            size="icon"
            disabled={busy || (!input.trim() && attachments.length === 0)}
            onClick={() => void handleSubmit()}
            className="h-9 w-9 shrink-0 rounded-xl shadow-sm"
            aria-label="Mesaj gönder"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          {activeModeMeta.shortDesc}
        </p>
      </div>
    </div>
  );
}
