import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  Lightbulb,
  Loader2,
  NotebookPen,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { askStudyCoach } from '@/lib/studyAiClient';
import type { CoachMode, StudyMaterial } from '@/types/study';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StudyCoachSidebarProps {
  material: StudyMaterial;
  injectedPrompt?: { id: number; text: string } | null;
}

const MODE_LABELS: Array<{ id: CoachMode; label: string; desc: string }> = [
  { id: 'tutor', label: 'Koç', desc: 'Net ve yapılandırılmış açıklama' },
  { id: 'feynman', label: 'Feynman', desc: 'Analoji + sıfırdan sezgi' },
  { id: 'socratic', label: 'Sokratik', desc: 'Sorularla düşündürerek sına' },
  { id: 'deep_research', label: 'Araştırma', desc: 'Teori, formül & literatür' },
];

export function StudyCoachSidebar({
  material,
  injectedPrompt,
}: StudyCoachSidebarProps) {
  const [tab, setTab] = useState<'coach' | 'notes'>('coach');
  const [coachMode, setCoachMode] = useState<CoachMode>('tutor');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personalNote, setPersonalNote] = useState('');

  const lastHandledInjectId = useRef<number>(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Load saved personal scratchpad per material
  useEffect(() => {
    setMessages([]);
    setError(null);
    try {
      const saved = localStorage.getItem(`econnotes:study-scratch:${material.id}`) || '';
      setPersonalNote(saved);
    } catch {
      setPersonalNote('');
    }
  }, [material.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`econnotes:study-scratch:${material.id}`, personalNote);
    } catch {
      // ignore storage quota error
    }
  }, [material.id, personalNote]);

  const sendMessage = async (textToSend: string, forcedMode?: CoachMode) => {
    const clean = textToSend.trim();
    if (!clean || sending) return;

    setError(null);
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: clean }];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await askStudyCoach({
        materialTitle: material.title,
        course: material.course,
        materialType: material.material_type,
        materialContent: material.content,
        messages: nextHistory,
        coachMode: forcedMode || coachMode,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Koça şu an ulaşılamadı.');
    } finally {
      setSending(false);
    }
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (injectedPrompt && injectedPrompt.id !== lastHandledInjectId.current) {
      lastHandledInjectId.current = injectedPrompt.id;
      setTab('coach');
      void sendMessageRef.current(injectedPrompt.text);
    }
  }, [injectedPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, sending]);

  return (
    <Card className="flex h-full flex-col border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 p-3.5 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Bot className="h-4 w-4 text-primary" />
            Akıl Hocası & Ders Defteri
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {material.course || 'Akademik AI'}
          </Badge>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'coach' | 'notes')} className="mt-2">
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="coach" className="gap-1.5 text-xs">
              <BrainCircuit className="h-3.5 w-3.5" />
              Akıl Hocası
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5 text-xs">
              <NotebookPen className="h-3.5 w-3.5" />
              Ders Defterim
            </TabsTrigger>
          </TabsList>

          <TabsContent value="coach" className="mt-2.5 space-y-2.5">
            {/* Teaching Mode Selector */}
            <div className="grid grid-cols-4 gap-1">
              {MODE_LABELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.desc}
                  onClick={() => setCoachMode(m.id)}
                  className={`rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors ${
                    coachMode === m.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="notes" className="mt-0" />
        </Tabs>
      </CardHeader>

      {tab === 'coach' ? (
        <CardContent className="flex flex-1 flex-col justify-between gap-3 p-3.5">
          <ScrollArea className="h-[390px] pr-2">
            {messages.length === 0 ? (
              <div className="space-y-3 py-4">
                <div className="rounded-xl border border-border bg-muted/25 p-3.5 text-xs leading-relaxed text-muted-foreground">
                  <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Nasıl yardımcı olayım?
                  </p>
                  Seçili mod:{' '}
                  <span className="font-medium text-foreground">
                    {MODE_LABELS.find((m) => m.id === coachMode)?.desc}
                  </span>
                  . Materyaldeki kavramları, formül türetimlerini ve sınav senaryolarını sorabilirsin.
                </div>

                <div className="space-y-1.5">
                  {[
                    'Bu konudaki en zor 3 kavramı Feynman yöntemiyle açıkla',
                    'Beni bu materyalden 1 açık uçlu sınav sorusuyla Sokratik sına',
                    'Literatürdeki ana formülleri ve karşılaştırmalı mantığı özetle',
                  ].map((quick, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void sendMessage(quick)}
                      className="flex w-full items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{quick}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'ml-6 bg-primary text-primary-foreground'
                        : 'mr-2 border border-border bg-muted/30 text-foreground'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <AcademicMarkdown content={msg.content} className="text-xs leading-relaxed" />
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Akademik yanıt hazırlanıyor...
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </ScrollArea>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2 border-t border-border/60 pt-2.5">
            <Textarea
              rows={2}
              placeholder="Sorunu, takıldığın denklemi veya cevabını yaz..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              className="resize-none text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              {messages.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMessages([])}
                  className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                  Temizle
                </Button>
              ) : (
                <span className="text-[10px] text-muted-foreground">Enter = Gönder</span>
              )}
              <Button
                type="button"
                size="sm"
                disabled={sending || !input.trim()}
                onClick={() => void sendMessage(input)}
                className="h-8 gap-1.5 text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                Gönder
              </Button>
            </div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="flex flex-1 flex-col gap-2.5 p-3.5">
          <p className="text-xs text-muted-foreground">
            Bu çalışma materyaline özel kişisel notlarınız tarayıcınızda otomatik kaydedilir.
          </p>
          <Textarea
            rows={15}
            placeholder="Hocanın vurguladığı noktalar, kendi özetlerin, unutmak istemediğin formüller..."
            value={personalNote}
            onChange={(e) => setPersonalNote(e.target.value)}
            className="flex-1 resize-none text-xs leading-relaxed"
          />
        </CardContent>
      )}
    </Card>
  );
}
