import { useEffect, useState } from 'react';
import {
  Bot,
  Loader2,
  NotebookPen,
  Send,
  Sparkles,
  Square,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { neuralEngine } from '@/lib/neural/neuralEngine';
import { routedAskCoach } from '@/lib/neural/engineRouter';
import { cn } from '@/lib/utils';
import type { CoachMode, StudyMaterial } from '@/types/study';
import { useNeuralEngine } from './useNeuralEngine';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  meta?: string;
}

interface NeuralCoachPanelProps {
  material: StudyMaterial;
  injectedPrompt?: { id: number; text: string } | null;
}

const MODES: Array<{ id: CoachMode; label: string }> = [
  { id: 'tutor', label: 'Akademik Hoca' },
  { id: 'feynman', label: 'Feynman' },
  { id: 'socratic', label: 'Sokratik' },
  { id: 'deep_research', label: 'Derin Araştırma' },
];

export function NeuralCoachPanel({ material, injectedPrompt }: NeuralCoachPanelProps) {
  const engine = useNeuralEngine();
  const [coachMode, setCoachMode] = useState<CoachMode>('tutor');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Merhaba! **${material.title}** materyali üzerinde seninle birlikteyim. İstersen kavramları Feynman tekniğiyle sıfırdan açabilir veya vize sorusu türetebiliriz.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [liveTps, setLiveTps] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const scratchKey = `econnotes:study-scratch:${material.id}`;
  const [scratch, setScratch] = useState(() => {
    try {
      return localStorage.getItem(scratchKey) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(scratchKey, scratch);
    } catch {
      // ignore
    }
  }, [scratch, scratchKey]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || busy) return;

    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setBusy(true);
    setStreamingText('');
    setLiveTps(0);

    try {
      const res = await routedAskCoach({
        materialTitle: material.title,
        course: material.course,
        materialType: material.material_type,
        materialContent: material.content,
        messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        coachMode,
        onToken: (partial, tps) => {
          setStreamingText(partial);
          setLiveTps(tps);
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply,
          meta: res.model || 'Akademik AI Koçu',
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Koç yanıtı oluşturulamadı.',
        },
      ]);
    } finally {
      setBusy(false);
      setStreamingText('');
    }
  };

  useEffect(() => {
    if (injectedPrompt?.text) {
      void sendMessage(injectedPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedPrompt?.id]);

  return (
    <div className="neural-card flex h-[580px] flex-col p-4">
      <Tabs defaultValue="coach" className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="coach" className="gap-1.5 text-xs">
              <Bot className="h-3.5 w-3.5" />
              AI Çalışma Koçu
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5 text-xs">
              <NotebookPen className="h-3.5 w-3.5" />
              Çalışma Notum
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="coach" className="flex min-h-0 flex-1 flex-col space-y-2.5">
          {/* Coach Engine & Mode Pills */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCoachMode(m.id)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                    coachMode === m.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Sparkles className="h-3 w-3 text-cyan-500" />
              Akademik AI
            </Badge>
          </div>

          {/* Chat Feed */}
          <ScrollArea className="flex-1 rounded-xl border border-border/60 bg-background/50 p-3">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs leading-relaxed',
                    msg.role === 'user'
                      ? 'ml-6 bg-primary text-primary-foreground'
                      : 'mr-4 border border-border/60 bg-card',
                  )}
                >
                  <AcademicMarkdown content={msg.content} className="text-xs" />
                  {msg.meta && (
                    <p className="mt-1 text-[10px] opacity-70">{msg.meta}</p>
                  )}
                </div>
              ))}

              {busy && (
                <div className="mr-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs">
                  {streamingText ? (
                    <>
                      <AcademicMarkdown content={streamingText} className="text-xs" />
                      {liveTps > 0 && (
                        <p className="mt-1 font-mono text-[10px] text-cyan-500">
                          Yanıt sentezleniyor...
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analiz ediliyor...
                    </span>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Textarea
              rows={2}
              placeholder="Formül, kavram veya örnek soru iste..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              className="min-h-[56px] resize-none text-xs"
            />
            {busy && engine.llmStatus === 'generating' ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => void neuralEngine.abortGeneration()}
                className="h-14 w-10 shrink-0"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                disabled={busy || !input.trim()}
                onClick={() => void sendMessage(input)}
                className="gradient-cta h-14 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Notların tarayıcına otomatik kaydedilir.
          </p>
          <Textarea
            value={scratch}
            onChange={(e) => setScratch(e.target.value)}
            placeholder="Kendi formül özetini veya hoca notlarını buraya al..."
            className="flex-1 resize-none text-xs leading-relaxed"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
