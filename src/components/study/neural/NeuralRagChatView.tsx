import { useEffect, useRef, useState } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardPaste,
  Database,
  FileText,
  FileUp,
  HelpCircle,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { ACCEPTED_FILES } from '@/lib/extractFile';
import {
  extractSearchableTextFromMaterial,
  indexDocumentInVectorStore,
  routedRagAnswer,
} from '@/lib/neural/engineRouter';
import {
  getIndexedDocuments,
  removeDocumentIndex,
  type DocumentIndexSummary,
  type SearchHit,
} from '@/lib/neural/vectorIndex';
import {
  classifyStudyDomain,
  extractFullDocumentOutline,
  extractUploadedSource,
} from '@/lib/studySourceProcessor';
import { cn } from '@/lib/utils';
import type { CoachMode, ExtractedSourceItem, StudyMaterial } from '@/types/study';
import { toast } from 'sonner';
import { useNeuralEngine } from './useNeuralEngine';

interface RagMessage {
  role: 'user' | 'assistant';
  content: string;
  hits?: SearchHit[];
  meta?: string;
  suggestedTopics?: string[];
}

export interface IncomingInspectBatch {
  id: number;
  sources: ExtractedSourceItem[];
  course?: string;
}

interface NeuralRagChatViewProps {
  materials: StudyMaterial[];
  incomingBatch?: IncomingInspectBatch | null;
  onIndexChanged?: () => void;
  onOpenMaterial?: (mat: StudyMaterial) => void;
}

const TEACH_MODES: Array<{ id: CoachMode; label: string; hint: string }> = [
  {
    id: 'reinforce',
    label: 'Pekiştirerek Anlat',
    hint: 'Sade anlatım + nottan örnek + mini kontrol sorusu',
  },
  {
    id: 'tutor',
    label: 'Net & Kaynaklı',
    hint: 'Doğrudan not/slayt pasajına dayalı net cevap',
  },
  {
    id: 'feynman',
    label: 'Sıfırdan Basitçe',
    hint: 'Karmaşık kavramları en yalın dille açar',
  },
  {
    id: 'socratic',
    label: 'Beni Test Et',
    hint: 'Adım adım ipucu ve soruyla aktif hatırlama',
  },
];

const QUICK_REINFORCE_PROMPTS = [
  'Bu notta sınav için en kritik konular neler?',
  'Anlamadım, bu konuyu sıfırdan en basit haliyle pekiştirir misin?',
  'Nottaki kavramları somut bir örnekle ve farklarıyla açıkla',
  'Beni bu nottan 1 kısa pekiştirme sorusuyla test et',
];

export function NeuralRagChatView({
  materials,
  incomingBatch,
  onIndexChanged,
  onOpenMaterial,
}: NeuralRagChatViewProps) {
  const engine = useNeuralEngine();
  const [indexedDocs, setIndexedDocs] = useState<DocumentIndexSummary[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteBody, setPasteBody] = useState('');
  const [coachMode, setCoachMode] = useState<CoachMode>('reinforce');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [liveTps, setLiveTps] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastHandledBatchRef = useRef<number>(0);

  const [messages, setMessages] = useState<RagMessage[]>([
    {
      role: 'assistant',
      content:
        'Merhaba! Sol taraftan **ders notunu veya slaytını (PDF, PPTX, DOCX)** doğrudan yükle ya da metin yapıştır. Notunu inceleyip içindeki başlıklardan istediğin soruyu **yalnızca kaynağına sadık kalarak** yanıtlayayım ve anlamadığın konuları adım adım pekiştirerek anlatayım.',
    },
  ]);

  const refreshIndexList = async () => {
    const docs = await getIndexedDocuments();
    setIndexedDocs(docs);
    onIndexChanged?.();
    return docs;
  };

  useEffect(() => {
    void refreshIndexList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials.length]);

  const indexAndInspectSources = async (items: ExtractedSourceItem[], courseOverride?: string) => {
    const valid = items.filter((it) => it.text && it.text.trim().length >= 20);
    if (valid.length === 0) {
      toast.error('İncelenecek okunabilir metin bulunamadı.');
      return;
    }

    setUploading(true);
    try {
      const addedIds: string[] = [];
      const inspectedLines: string[] = [];
      const collectedTopics: string[] = [];

      for (const src of valid) {
        const docId = `direct-${src.id}`;
        const domain = classifyStudyDomain(src.text, courseOverride || src.course || undefined, src.name);
        const chunks = await indexDocumentInVectorStore({
          docId,
          title: src.name,
          course: courseOverride || src.course || domain.discipline,
          text: src.text,
          computeEmbeddings: engine.embedderStatus === 'ready',
        });

        if (chunks > 0) {
          addedIds.push(docId);
          const outline = extractFullDocumentOutline(src.text, 8).map((o) => o.heading);
          outline.forEach((h) => {
            if (!collectedTopics.includes(h) && collectedTopics.length < 6) {
              collectedTopics.push(h);
            }
          });
          inspectedLines.push(
            `- **${src.name}** (${domain.discipline} · ~${src.pagesOrSlides} sayfa/slayt · ~${src.wordCount.toLocaleString('tr-TR')} kelime · ${chunks} pasaj tarandı)`,
          );
        }
      }

      if (addedIds.length === 0) {
        toast.error('Dosyadan metin pasajı çıkarılamadı.');
        return;
      }

      await refreshIndexList();
      setSelectedDocIds((prev) => Array.from(new Set([...addedIds, ...prev])));

      const topicSection =
        collectedTopics.length > 0
          ? `\n\n**Notunda tespit ettiğim ana başlıklar:**\n${collectedTopics
              .map((t, i) => `${i + 1}. ${t}`)
              .join('\n')}\n\nAşağıdaki başlıklardan birine tıklayabilir ya da anlamadığın herhangi bir kısmı doğrudan sorabilirsin; konu dışı bilgi eklemeden adım adım pekiştirerek anlatacağım.`
          : '\n\nNotunu inceledim. İçinden istediğin kavramı sorabilir veya anlamadığın bir yeri söyleyip pekiştirerek anlatmamı isteyebilirsin.';

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `**Ders notun / slaytın incelendi ve soru-cevap için hazırlandı:**\n${inspectedLines.join('\n')}${topicSection}`,
          meta: 'Not İnceleme Tamamlandı · Kaynağa %100 Sadık Mod',
          suggestedTopics: collectedTopics,
        },
      ]);
      toast.success(`${addedIds.length} ders notu/slayt incelendi ve soru sormaya hazır.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dosya incelenemedi.');
    } finally {
      setUploading(false);
    }
  };

  // Yeni Çalışma Seti ekranından "Notu Hemen İncele & Soru Sor" ile gelen kaynakları otomatik incele
  useEffect(() => {
    if (incomingBatch && incomingBatch.id !== lastHandledBatchRef.current && incomingBatch.sources.length > 0) {
      lastHandledBatchRef.current = incomingBatch.id;
      void indexAndInspectSources(incomingBatch.sources, incomingBatch.course);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingBatch?.id]);

  const handleDirectFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const extracted: ExtractedSourceItem[] = [];
      for (const file of Array.from(fileList)) {
        const item = await extractUploadedSource(file);
        extracted.push(item);
      }
      await indexAndInspectSources(extracted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dosya okunamadı.');
      setUploading(false);
    }
  };

  const handlePasteInspect = async () => {
    const clean = pasteBody.trim();
    if (clean.length < 30) {
      toast.error('Lütfen incelenecek en az birkaç cümlelik ders notu yapıştırın.');
      return;
    }
    const title = pasteTitle.trim() || 'Yapıştırılan Ders Notu';
    const item: ExtractedSourceItem = {
      id: `paste-${Date.now()}`,
      name: title,
      kind: 'pasted',
      text: clean,
      pagesOrSlides: Math.max(1, Math.ceil(clean.split(/\s+/).length / 280)),
      wordCount: clean.split(/\s+/).filter(Boolean).length,
      charCount: clean.length,
    };
    setPasteTitle('');
    setPasteBody('');
    setShowPasteBox(false);
    await indexAndInspectSources([item]);
  };

  const handleIndexMaterials = async () => {
    if (materials.length === 0) {
      toast.info('Kitaplığında henüz kayıtlı materyal yok; sol üstten doğrudan PDF veya slayt yükleyebilirsin.');
      return;
    }
    setIndexing(true);
    try {
      let chunksTotal = 0;
      for (const m of materials) {
        const text = extractSearchableTextFromMaterial(m);
        if (text.trim().length > 20) {
          chunksTotal += await indexDocumentInVectorStore({
            docId: m.id,
            title: m.title,
            course: m.course,
            text,
            computeEmbeddings: engine.embedderStatus === 'ready',
          });
        }
      }
      await refreshIndexList();
      toast.success(`${materials.length} materyal (${chunksTotal} pasaj) incelenmek üzere eklendi.`);
    } finally {
      setIndexing(false);
    }
  };

  const handleRemoveDoc = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await removeDocumentIndex(docId);
    setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
    await refreshIndexList();
    toast.success('Kaynak dizinden kaldırıldı.');
  };

  const toggleDoc = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
  };

  const handleAsk = async (overrideQuestion?: string, modeOverride?: CoachMode) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || busy) return;

    const effectiveMode = modeOverride || coachMode;
    const historyForModel = messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    if (!overrideQuestion) setQuestion('');
    setBusy(true);
    setStreaming('');
    setLiveTps(0);

    try {
      const res = await routedRagAnswer({
        question: q,
        docIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        history: historyForModel,
        coachMode: effectiveMode,
        onToken: (partial, tps) => {
          setStreaming(partial);
          setLiveTps(tps);
        },
      });
      const modeLabel = TEACH_MODES.find((m) => m.id === effectiveMode)?.label || 'Akademik Rehber';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer,
          hits: res.hits,
          meta: `${modeLabel} · ${res.model}`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Yanıt oluşturulamadı. Lütfen tekrar deneyin.',
        },
      ]);
    } finally {
      setBusy(false);
      setStreaming('');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Sol Panel: Doğrudan Not/Slayt Yükle & İncelenen Kaynaklar */}
      <aside className="neural-card space-y-4 p-4 lg:col-span-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Database className="h-4 w-4 text-cyan-500" />
            Not &amp; Slayt Kaynakları ({indexedDocs.length})
          </h2>
          <Badge variant="outline" className="text-[10px]">
            Kaynağa Sadık
          </Badge>
        </div>

        {/* Doğrudan Dosya / Slayt Sürükle-Bırak Alanı */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleDirectFiles(e.dataTransfer.files);
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            'cursor-pointer rounded-2xl border-2 border-dashed p-4 text-center transition-colors',
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-primary/35 bg-primary/[0.03] hover:border-primary/60 hover:bg-primary/[0.06]',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILES}
            onChange={(e) => {
              void handleDirectFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          {uploading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          ) : (
            <FileUp className="mx-auto h-6 w-6 text-primary" />
          )}
          <p className="mt-2 text-xs font-bold text-foreground">
            {uploading ? 'Not / Slayt İnceleniyor...' : 'Ders Notu veya Slayt Yükle'}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            PDF, PowerPoint (.pptx), Word (.docx), görsel veya TXT — anında incelenir
          </p>
        </div>

        {/* Hızlı Metin Yapıştırma & Kitaplık İndeksleme Butonları */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowPasteBox((v) => !v)}
            className="h-8 gap-1.5 text-[11px]"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-primary" />
            Metin Yapıştır
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={indexing || materials.length === 0}
            onClick={() => void handleIndexMaterials()}
            className="h-8 gap-1.5 text-[11px]"
          >
            {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-cyan-500" />}
            Kitaplık ({materials.length})
          </Button>
        </div>

        {showPasteBox && (
          <div className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-3">
            <Input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Not başlığı (Örn: 4. Hafta Biyokimya)"
              className="h-8 text-xs"
            />
            <Textarea
              rows={4}
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
              placeholder="İncelememi ve soru yanıtlamamı istediğin ders notunu buraya yapıştır..."
              className="text-xs"
            />
            <Button
              type="button"
              size="sm"
              disabled={uploading || pasteBody.trim().length < 30}
              onClick={() => void handlePasteInspect()}
              className="w-full h-8 text-xs"
            >
              Notu İncele ve Sohbete Ekle
            </Button>
          </div>
        )}

        {/* İncelenen Kaynaklar Listesi */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Aktif Kaynak Filtresi</span>
            {selectedDocIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedDocIds([])}
                className="text-primary hover:underline"
              >
                Tümünü Tara
              </button>
            ) : (
              <span>Tümü taranır</span>
            )}
          </div>

          <ScrollArea className="h-64 pr-1">
            {indexedDocs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Henüz incelenmiş bir not veya slayt yok. Yukarıdan PDF/slayt yükleyebilir veya kitaplığındaki notları ekleyebilirsin.
              </div>
            ) : (
              <div className="space-y-2">
                {indexedDocs.map((doc) => {
                  const active = selectedDocIds.includes(doc.docId);
                  return (
                    <div
                      key={doc.docId}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleDoc(doc.docId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleDoc(doc.docId);
                        }
                      }}
                      className={cn(
                        'w-full cursor-pointer rounded-xl border p-2.5 text-left text-xs transition-colors',
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-border/60 bg-background/60 hover:bg-muted/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 font-semibold">
                            {active ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">{doc.docTitle}</span>
                          </p>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">{doc.course || 'Ders Notu'}</span>
                            <span className="shrink-0">{doc.chunkCount} pasaj</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => void handleRemoveDoc(doc.docId, e)}
                          title="Kaynağı kaldır"
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </aside>

      {/* Sağ Panel: Notu İncele, Soru Sor & Pekiştirerek Öğren Sohbeti */}
      <section className="neural-card flex h-[600px] flex-col p-4 sm:p-5 lg:col-span-8">
        <div className="mb-3 space-y-2.5 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">Notlarıma Sor &amp; Konu Pekiştir</span>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/5">
              <CheckCircle2 className="h-3 w-3" />
              Sıfır Konu Dışı · Kaynaklı Anlatım
            </Badge>
          </div>

          {/* Anlatım & Pekiştirme Modları */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TEACH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                onClick={() => setCoachMode(m.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  coachMode === m.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-2xl p-3.5 text-xs sm:text-sm',
                  m.role === 'user'
                    ? 'ml-8 bg-primary text-primary-foreground'
                    : 'mr-4 border border-border/60 bg-background/70',
                )}
              >
                <AcademicMarkdown content={m.content} className="text-xs leading-relaxed sm:text-sm" />
                {m.meta && <p className="mt-2 text-[10px] opacity-70">{m.meta}</p>}

                {/* Not İnceleme Sonrası Tek Tıkla Pekiştirilecek Konu Başlıkları */}
                {m.suggestedTopics && m.suggestedTopics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
                    {m.suggestedTopics.map((topic, ti) => (
                      <button
                        key={ti}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleAsk(
                            `"${topic}" konusunu yüklediğim nota dayanarak adım adım ve örnekle pekiştirerek anlatır mısın?`,
                            'reinforce',
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                      >
                        <HelpCircle className="h-3 w-3" />
                        {topic}
                      </button>
                    ))}
                  </div>
                )}

                {m.hits && m.hits.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-cyan-600 dark:text-cyan-300">
                      <BookOpenCheck className="h-3 w-3" />
                      Yanıtın Dayandığı Not / Slayt Pasajları
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {m.hits.slice(0, 4).map((hit, hi) => {
                        const targetMat = materials.find((x) => x.id === hit.chunk.docId);
                        return (
                          <button
                            key={hit.chunk.id}
                            type="button"
                            onClick={() => targetMat && onOpenMaterial?.(targetMat)}
                            className="rounded-lg border border-border/60 bg-card/80 p-2 text-left text-[11px] hover:border-primary/40"
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span className="truncate">
                                [Kaynak {hi + 1}] {hit.chunk.sectionHeading}
                              </span>
                              <span className="text-[10px] text-cyan-500">
                                %{Math.round(hit.score * 100)}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                              {hit.chunk.text}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="mr-4 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-3.5 text-xs">
                {streaming ? (
                  <>
                    <AcademicMarkdown content={streaming} className="text-xs leading-relaxed sm:text-sm" />
                    {liveTps > 0 && (
                      <p className="mt-1.5 font-mono text-[10px] text-cyan-500">
                        Notundaki pasajlara göre hazırlanıyor...
                      </p>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Yüklediğin not / slayt taranıyor ve pekiştirici yanıt hazırlanıyor...
                  </span>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Tek Tıkla Hızlı Pekiştirme Çipleri */}
        {indexedDocs.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {QUICK_REINFORCE_PROMPTS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void handleAsk(chip)}
                className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] text-muted-foreground hover:border-primary/45 hover:text-foreground transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex gap-2 border-t border-border/60 pt-3">
          <Textarea
            rows={2}
            placeholder="Notundan bir soru sor veya anlamadığın konuyu yaz (Örn: 3. slayttaki mekanizmayı anlamadım, basitçe pekiştirir misin?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleAsk();
              }
            }}
            className="min-h-[54px] resize-none text-xs"
          />
          <Button
            type="button"
            disabled={busy || !question.trim()}
            onClick={() => void handleAsk()}
            className="gradient-cta h-14 px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
