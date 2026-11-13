import { useEffect, useState } from 'react';
import {
  BookOpenCheck,
  Cpu,
  Database,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  extractSearchableTextFromMaterial,
  indexDocumentInVectorStore,
  routedRagAnswer,
} from '@/lib/neural/engineRouter';
import { getIndexedDocuments, type DocumentIndexSummary, type SearchHit } from '@/lib/neural/vectorIndex';
import { cn } from '@/lib/utils';
import type { StudyMaterial } from '@/types/study';
import { toast } from 'sonner';
import { useNeuralEngine } from './useNeuralEngine';

interface RagMessage {
  role: 'user' | 'assistant';
  content: string;
  hits?: SearchHit[];
  meta?: string;
}

interface NeuralRagChatViewProps {
  materials: StudyMaterial[];
  onIndexChanged?: () => void;
  onOpenMaterial?: (mat: StudyMaterial) => void;
}

export function NeuralRagChatView({
  materials,
  onIndexChanged,
  onOpenMaterial,
}: NeuralRagChatViewProps) {
  const engine = useNeuralEngine();
  const [indexedDocs, setIndexedDocs] = useState<DocumentIndexSummary[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [liveTps, setLiveTps] = useState(0);
  const [messages, setMessages] = useState<RagMessage[]>([
    {
      role: 'assistant',
      content:
        'Notların üzerinde kaynaklı arama (RAG) yapmaya hazırım. Sol taraftan materyallerini indeksle ve istediğin kavramı, formülü veya sınav sorusunu sor.',
    },
  ]);

  const refreshIndexList = async () => {
    const docs = await getIndexedDocuments();
    setIndexedDocs(docs);
    onIndexChanged?.();
  };

  useEffect(() => {
    void refreshIndexList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials.length]);

  const handleIndexMaterials = async () => {
    if (materials.length === 0) {
      toast.info('İndekslenecek materyal yok; önce bir ders notu oluşturun.');
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
      toast.success(`${materials.length} materyal (${chunksTotal} pasaj) vektör dizinine alındı.`);
    } finally {
      setIndexing(false);
    }
  };

  const toggleDoc = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    setBusy(true);
    setStreaming('');
    setLiveTps(0);

    try {
      const res = await routedRagAnswer({
        question: q,
        docIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        onToken: (partial, tps) => {
          setStreaming(partial);
          setLiveTps(tps);
        },
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer,
          hits: res.hits,
          meta: `${res.engineUsed === 'gpu' ? 'WebGPU' : res.engineUsed === 'cloud' ? 'Bulut AI' : 'Yerel Dizin'} · ${res.model}${
            res.tokensPerSec ? ` · ${res.tokensPerSec} tok/sn` : ''
          } · ${res.latencyMs}ms`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'RAG yanıtı alınamadı.',
        },
      ]);
    } finally {
      setBusy(false);
      setStreaming('');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Left Source Knowledge Base */}
      <aside className="neural-card space-y-4 p-4 lg:col-span-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Database className="h-4 w-4 text-cyan-500" />
            Bilgi Tabanı ({indexedDocs.length})
          </h2>
          <Badge variant="outline" className="text-[10px]">
            {engine.embedderStatus === 'ready' ? 'Dense Vektör' : 'BM25 + Vektör'}
          </Badge>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={indexing || materials.length === 0}
          onClick={() => void handleIndexMaterials()}
          className="w-full gap-1.5 text-xs"
        >
          {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {indexing ? 'İndeksleniyor...' : `Materyalleri İndeksle (${materials.length})`}
        </Button>

        <ScrollArea className="h-80 pr-1">
          {indexedDocs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Yukarıdaki düğmeye tıklayarak çalışma setlerini yerel RAG dizinine ekleyin.
            </div>
          ) : (
            <div className="space-y-2">
              {indexedDocs.map((doc) => {
                const active = selectedDocIds.includes(doc.docId);
                return (
                  <button
                    key={doc.docId}
                    type="button"
                    onClick={() => toggleDoc(doc.docId)}
                    className={cn(
                      'w-full rounded-xl border p-3 text-left text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-border/60 bg-background/60 hover:bg-muted/60',
                    )}
                  >
                    <p className="line-clamp-1 font-semibold">{doc.docTitle}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{doc.course || 'Genel'}</span>
                      <span>
                        {doc.chunkCount} pasaj {doc.hasVectors ? '· GPU Vektör' : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* Right RAG Chat Stage */}
      <section className="neural-card flex h-[540px] flex-col p-4 sm:p-5 lg:col-span-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Notlarıma Sor (Kaynaklı RAG Sohbeti)</span>
          </div>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Cpu className="h-3 w-3 text-cyan-500" />
            {engine.llmStatus === 'ready' ? `WebGPU (${engine.activeModelId})` : 'Hibrit AI'}
          </Badge>
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

                {m.hits && m.hits.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-cyan-600 dark:text-cyan-300">
                      <BookOpenCheck className="h-3 w-3" />
                      Atıf Yapılan Kaynak Pasajları
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
                        WebGPU akışı · {liveTps} tok/sn
                      </p>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pasajlar taranıyor ve yanıt sentezleniyor...
                  </span>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="mt-3 flex gap-2 border-t border-border/60 pt-3">
          <Textarea
            rows={2}
            placeholder="Örn: Notlarımda merkez bankası emisyon mekanizması nasıl açıklanıyor?"
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
