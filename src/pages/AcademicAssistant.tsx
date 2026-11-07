import Layout from '@/components/Layout';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Bot,
  Send,
  User,
  Loader2,
  Paperclip,
  FileText,
  X,
  Sparkles,
  ImagePlus,
  Calculator,
  CheckCircle2,
  BookOpen,
  Copy,
  Check,
  RotateCcw,
  ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AssistantDocumentItem,
  AssistantImageItem,
  isSupportedImageFile,
  isUnsupportedImageFormat,
  MAX_IMAGE_ATTACHMENTS,
  processDocumentOrScannedPdf,
  processImageAttachment,
} from '@/lib/assistantAttachments';

type SolveMode = 'step_by_step' | 'check_solution' | 'concept';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: Array<{ name: string; previewUrl: string }>;
  documentName?: string;
}

const MODE_OPTIONS: Array<{
  id: SolveMode;
  label: string;
  shortDesc: string;
  icon: typeof Calculator;
  quickPrompts: string[];
  defaultAttachmentPrompt: string;
}> = [
  {
    id: 'step_by_step',
    label: 'Adım Adım Soru Çözümü',
    shortDesc: 'Matematik, mühendislik ve sayısal soruları hiç adım atlamadan anlata anlata çözer.',
    icon: Calculator,
    quickPrompts: [
      'Görseldeki soruyu adım adım anlata anlata çöz',
      'İntegral / türev sorusunu ara işlemleri atlamadan çöz ve sağlamasını yap',
      'Devre / fizik sorusunu formüllerin mantığını açıklayarak çöz',
      'Lineer cebir / diferansiyel denklem sorusunu tane tane çöz',
    ],
    defaultAttachmentPrompt:
      'Yüklediğim görseldeki/dosyadaki soruyu dikkatlice incele; verilenleri, kullanılan formülleri ve her bir ara işlemi hiç atlamadan, anlata anlata adım adım çöz ve sonunda sağlamasını yap.',
  },
  {
    id: 'check_solution',
    label: 'Çözümümü Kontrol Et',
    shortDesc: 'Yüklediğin defter veya ekran fotoğrafındaki işlem hatasını bulur ve doğrusunu öğretir.',
    icon: CheckCircle2,
    quickPrompts: [
      'Fotoğraftaki çözümümü satır satır kontrol et, hatam varsa göster',
      'İşlem adımlarımda işaret veya formül hatası var mı?',
      'Bu soruda doğru sonuca ulaşmış mıyım, sağlamasını yapar mısın?',
    ],
    defaultAttachmentPrompt:
      'Yüklediğim görseldeki/dosyadaki çözümümü satır satır kontrol et. Doğru adımları belirt, hata yaptığım adımı neden hatalı olduğuyla birlikte açıkla ve doğru çözümü adım adım tamamla.',
  },
  {
    id: 'concept',
    label: 'Konu & Formül Anlatımı',
    shortDesc: 'Teoremlerin sezgisel mantığını, formüllerini ve sınav püf noktalarını anlatır.',
    icon: BookOpen,
    quickPrompts: [
      'Bu konunun temel formüllerini ve mantığını sıfırdan anlat',
      'Vize ve finalde bu konudan nasıl sorular çıkar?',
      'Yüklediğim ders notunu / görseli özetle ve örnek soru çöz',
    ],
    defaultAttachmentPrompt:
      'Yüklediğim görseldeki/dosyadaki konuyu, formüllerin sezgisel mantığını, önemli kavramları ve sınavda dikkat edilmesi gereken noktaları anlaşılır bir dille anlat.',
  },
];

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Merhaba! 🎓 Ben **EconNotes Akademik Asistanınızım**.\n\n**Matematik, Mühendislik, Fizik, İstatistik, Ekonometri** ve tüm üniversite derslerinizdeki soruları **hiçbir ara işlemi atlamadan, anlata anlata** çözmek için hazırım.\n\n- 🖼️ **Galeriden PNG / JPG Soru Resmi Gönderin:** Telefon galerinizden soru fotoğrafı veya ekran görüntüsü seçip doğrudan gönderebilirsiniz.\n- 📄 **PDF / Ders Notu Ekleyin:** PDF, Word veya slayt yükleyerek soru çözdürebilir ya da özet çıkarabilirsiniz.\n- ✍️ **Adım Adım Anlatım & Sağlama:** Her adımda hangi formülü *neden* kullandığımızı açıklar ve çözüm sonunda sağlama yaparım.',
};

const AcademicAssistant = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<SolveMode>('step_by_step');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingAttachment, setProcessingAttachment] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [attachedImages, setAttachedImages] = useState<AssistantImageItem[]>([]);
  const [attachedDocument, setAttachedDocument] = useState<AssistantDocumentItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewLightbox, setPreviewLightbox] = useState<{ url: string; name: string } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const activeModeConfig = MODE_OPTIONS.find((m) => m.id === mode) ?? MODE_OPTIONS[0];

  useEffect(() => {
    const fetchNotes = async () => {
      const { data } = await supabase
        .from('notes')
        .select('title, course, description, department, semester')
        .limit(50);
      setNotes(data || []);
    };
    fetchNotes();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleIncomingFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setProcessingAttachment(true);
    try {
      let currentImgCount = attachedImages.length;
      const newImages: AssistantImageItem[] = [];

      for (const file of files) {
        if (isSupportedImageFile(file)) {
          if (currentImgCount >= MAX_IMAGE_ATTACHMENTS) {
            toast.warning(`En fazla ${MAX_IMAGE_ATTACHMENTS} adet soru görseli ekleyebilirsiniz.`);
            continue;
          }
          const processed = await processImageAttachment(file);
          newImages.push(processed);
          currentImgCount++;
        } else if (isUnsupportedImageFormat(file)) {
          toast.error('Lütfen galeriden PNG, JPG/JPEG veya WebP formatında bir görsel seçin.');
        } else {
          const result = await processDocumentOrScannedPdf(file);
          if (result.scannedImages && result.scannedImages.length > 0) {
            const slotsLeft = Math.max(0, MAX_IMAGE_ATTACHMENTS - currentImgCount);
            const toAdd = result.scannedImages.slice(0, slotsLeft || 1);
            newImages.push(...toAdd);
            currentImgCount += toAdd.length;
            toast.success(`${file.name} görsel olarak çözümlendi (${toAdd.length} sayfa hazır).`);
          } else if (result.document) {
            setAttachedDocument(result.document);
            toast.success(`${file.name} yüklendi. Sorunuzu yazabilir veya doğrudan gönderebilirsiniz.`);
          }
        }
      }

      if (newImages.length > 0) {
        setAttachedImages((prev) => [...prev, ...newImages].slice(0, MAX_IMAGE_ATTACHMENTS));
        toast.success(
          newImages.length === 1
            ? `${newImages[0].name} eklendi. Doğrudan gönderebilir veya not ekleyebilirsiniz.`
            : `${newImages.length} soru görseli eklendi.`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Dosya yüklenirken bir hata oluştu.');
    } finally {
      setProcessingAttachment(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (documentInputRef.current) documentInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));

    if (imageFiles.length > 0) {
      e.preventDefault();
      await handleIncomingFiles(imageFiles);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      await handleIncomingFiles(e.dataTransfer.files);
    }
  };

  const removeImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const resetConversation = () => {
    if (loading) return;
    setMessages([INITIAL_ASSISTANT_MESSAGE]);
    setAttachedImages([]);
    setAttachedDocument(null);
    setInput('');
  };

  const copyMessageContent = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      toast.success('Çözüm panoya kopyalandı.');
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error('Kopyalama başarısız oldu.');
    }
  };

  const hasAttachments = attachedImages.length > 0 || Boolean(attachedDocument);
  const canSend = !loading && !processingAttachment && (input.trim().length > 0 || hasAttachments);

  const sendMessage = async () => {
    if (!canSend) return;

    const typedText = input.trim();
    const effectivePrompt = typedText || activeModeConfig.defaultAttachmentPrompt;

    const currentImages = [...attachedImages];
    const currentDocument = attachedDocument;

    setInput('');
    setAttachedImages([]);
    setAttachedDocument(null);

    let fullMessage = effectivePrompt;
    if (currentDocument) {
      fullMessage = `[Yüklenen belge: ${currentDocument.name}]\n\nBelge içeriği:\n${currentDocument.textContent}\n\nKullanıcının isteği: ${effectivePrompt}`;
    }

    const userBubbleText =
      typedText ||
      (currentImages.length > 0
        ? 'Görseldeki soruyu adım adım anlata anlata çöz.'
        : `${currentDocument?.name} belgesini incele ve açıkla.`);

    const historySnapshot = messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userBubbleText,
        images:
          currentImages.length > 0
            ? currentImages.map((img) => ({ name: img.name, previewUrl: img.previewUrl }))
            : undefined,
        documentName: currentDocument?.name,
      },
    ]);
    setLoading(true);

    try {
      const notesContext = notes
        .map(
          (n) =>
            `- ${n.title} (${n.course}, ${n.department}, ${n.semester}): ${n.description || 'Açıklama yok'}`,
        )
        .join('\n');

      const response = await supabase.functions.invoke('academic-assistant', {
        body: {
          message: fullMessage,
          mode,
          notesContext,
          history: historySnapshot,
          hasFile: Boolean(currentDocument) || currentImages.length > 0,
          fileName: currentDocument?.name || currentImages[0]?.name,
          images:
            currentImages.length > 0
              ? currentImages.map((img) => ({
                  name: img.name,
                  mimeType: img.mimeType,
                  data: img.base64Data,
                }))
              : undefined,
        },
      });

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.data?.reply || 'Yanıt alınamadı.',
        },
      ]);
    } catch (error: any) {
      const errMsg =
        typeof error?.message === 'string' && error.message.length < 180
          ? error.message
          : 'Üzgünüm, şu anda yanıt oluşturulamadı. Lütfen bağlantınızı kontrol edip tekrar deneyin.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errMsg,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div
        className="mx-auto flex min-h-[min(720px,calc(100dvh-9.5rem))] w-full max-w-4xl flex-col gap-3.5 animate-fade-in"
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        {/* Header & Problem Solving Modes */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner">
                <Bot className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Akademik Asistan</h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    <Calculator className="h-3 w-3" />
                    Matematik & Mühendislik Çözücü
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Galeriden <strong>PNG / JPG</strong> soru fotoğrafı seçin veya <strong>PDF</strong> yükleyin; en zor soruları adım adım, formüllerin mantığını anlata anlata çözelim.
                </p>
              </div>
            </div>

            {messages.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetConversation}
                disabled={loading}
                className="h-8 rounded-xl text-xs"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Yeni Soru
              </Button>
            )}
          </div>

          {/* Mode Selector Tabs */}
          <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/25'
                      : 'border-border/70 bg-card/60 hover:border-primary/40 hover:bg-card'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground">{opt.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {opt.shortDesc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Starter Prompts */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeModeConfig.quickPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto min-h-8 whitespace-normal rounded-full bg-background/70 px-3 py-1 text-left text-[11px] sm:text-xs"
                onClick={() => setInput(prompt)}
              >
                <Sparkles className="mr-1.5 h-3 w-3 shrink-0 text-primary" />
                {prompt}
              </Button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <Card
          className={`glass-card relative flex min-h-[25rem] flex-1 flex-col overflow-hidden rounded-2xl transition-colors ${
            isDragging ? 'border-2 border-dashed border-primary bg-primary/5' : ''
          }`}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/85 backdrop-blur-sm">
              <ImagePlus className="h-10 w-10 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                PNG, JPG soru görselini veya PDF dosyasını buraya bırakın
              </p>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3 sm:p-5">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2.5 sm:gap-3 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={`max-w-[90%] break-words rounded-2xl p-3.5 text-sm shadow-sm sm:max-w-[84%] ${
                        msg.role === 'user'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm border border-border/80 bg-card/95 text-foreground'
                      }`}
                    >
                      {/* User uploaded images inside message bubble */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="mb-2.5 flex flex-wrap gap-2">
                          {msg.images.map((img, imgIdx) => (
                            <button
                              key={imgIdx}
                              type="button"
                              onClick={() => setPreviewLightbox({ url: img.previewUrl, name: img.name })}
                              className="group relative overflow-hidden rounded-xl border border-white/25 bg-black/10"
                              title="Görseli büyüt"
                            >
                              <img
                                src={img.previewUrl}
                                alt={img.name}
                                className="max-h-44 max-w-[220px] object-contain transition-transform group-hover:scale-[1.02]"
                              />
                              <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <ZoomIn className="h-3.5 w-3.5" />
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.documentName && (
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-black/15 px-2.5 py-1 text-xs font-medium">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[220px]">{msg.documentName}</span>
                        </div>
                      )}

                      {msg.role === 'assistant' ? (
                        <div>
                          <AcademicMarkdown content={msg.content} />
                          {i > 0 && (
                            <div className="mt-3 flex items-center justify-end border-t border-border/50 pt-2">
                              <button
                                type="button"
                                onClick={() => copyMessageContent(msg.content, i)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                {copiedIndex === i ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>Kopyalandı</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span>Çözümü Kopyala</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-sm border border-border/80 bg-card/95 px-4 py-3 text-xs sm:text-sm text-muted-foreground shadow-sm">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      <span>
                        Soru analiz ediliyor, formüller ve adım adım anlatımlı çözüm hazırlanıyor...
                      </span>
                    </div>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>
            </div>
          </ScrollArea>

          {/* Attached Images & Document Preview Strip */}
          {(attachedImages.length > 0 || attachedDocument || processingAttachment) && (
            <div className="border-t border-border/60 bg-muted/35 px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-2.5">
                {attachedImages.map((img) => (
                  <div
                    key={img.id}
                    className="group relative flex items-center gap-2 rounded-xl border border-primary/25 bg-card p-1.5 pr-2.5 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewLightbox({ url: img.previewUrl, name: img.name })}
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                      title="Önizlemeyi büyüt"
                    >
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <div className="min-w-0 max-w-[130px]">
                      <p className="truncate text-xs font-medium text-foreground">{img.name}</p>
                      <p className="text-[10px] text-muted-foreground">{img.sizeLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      aria-label={`${img.name} görselini kaldır`}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {attachedDocument && (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-card px-3 py-2 text-xs shadow-sm">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 max-w-[180px]">
                      <p className="truncate font-medium text-foreground">{attachedDocument.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {attachedDocument.pages ? `${attachedDocument.pages} sayfa · ` : ''}
                        {attachedDocument.sizeLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedDocument(null)}
                      aria-label="Belgeyi kaldır"
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {processingAttachment && (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>Görsel / dosya hazırlanıyor...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Input Composer */}
          <div className="border-t border-border bg-card/80 p-3 sm:p-4">
            <div className="flex items-end gap-2">
              {/* Hidden Gallery Image Input (PNG, JPG, JPEG, WebP - opens mobile photo gallery directly) */}
              <input
                type="file"
                ref={galleryInputRef}
                className="hidden"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                multiple
                onChange={(e) => {
                  if (e.target.files) void handleIncomingFiles(e.target.files);
                }}
              />

              {/* Hidden Document + Image Input (PDF, DOCX, PPTX, TXT, PNG, JPG) */}
              <input
                type="file"
                ref={documentInputRef}
                className="hidden"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.pptx,.txt,.md,.csv,image/png,image/jpeg,application/pdf"
                onChange={(e) => {
                  if (e.target.files) void handleIncomingFiles(e.target.files);
                }}
              />

              <Button
                type="button"
                variant="outline"
                disabled={loading || processingAttachment}
                className="h-10 shrink-0 gap-1.5 rounded-xl border-primary/30 bg-primary/5 px-2.5 text-primary hover:bg-primary/15 hover:text-primary sm:px-3"
                onClick={() => galleryInputRef.current?.click()}
                title="Galeriden PNG veya JPG soru resmi seç"
                aria-label="Galeriden PNG veya JPG soru resmi seç"
              >
                <ImagePlus className="h-4 w-4 shrink-0" />
                <span className="hidden text-xs font-semibold sm:inline">Resim Seç</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={loading || processingAttachment}
                className="h-10 w-10 shrink-0 rounded-xl"
                onClick={() => documentInputRef.current?.click()}
                title="PDF, Word, Slayt veya Resim yükle"
                aria-label="PDF veya dosya yükle"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={
                  hasAttachments
                    ? 'İsterseniz ek not yazın (örn. "Sadece b şıkkını çöz") veya doğrudan gönderin...'
                    : 'Matematik/mühendislik sorunuzu yazın veya galeriden PNG/JPG soru resmi seçin...'
                }
                className="min-h-10 max-h-36 flex-1 resize-none rounded-xl py-2.5 text-sm"
                rows={1}
              />

              <Button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!canSend}
                size="icon"
                aria-label="Soruyu gönder"
                className="h-10 w-10 shrink-0 rounded-xl gradient-primary text-primary-foreground"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              💡 <strong>İpucu:</strong> Galeriden <strong>PNG / JPG</strong> soru fotoğrafı seçebilir, ekran görüntüsünü doğrudan yapıştırabilir (<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl+V</kbd>) veya <strong>PDF</strong> ekleyebilirsiniz.
            </p>
          </div>
        </Card>
      </div>

      {/* Full-size Image Lightbox */}
      <Dialog
        open={Boolean(previewLightbox)}
        onOpenChange={(open) => {
          if (!open) setPreviewLightbox(null);
        }}
      >
        <DialogContent className="max-w-3xl overflow-hidden rounded-2xl p-3 sm:p-4">
          <DialogTitle className="truncate pr-6 text-sm font-semibold">
            {previewLightbox?.name || 'Soru Görseli'}
          </DialogTitle>
          {previewLightbox && (
            <div className="flex max-h-[78dvh] items-center justify-center overflow-auto rounded-xl bg-muted/40 p-2">
              <img
                src={previewLightbox.url}
                alt={previewLightbox.name}
                className="max-h-[74dvh] w-auto rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default AcademicAssistant;
