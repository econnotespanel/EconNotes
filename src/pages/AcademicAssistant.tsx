import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, User, Loader2, Upload, FileText, X, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

const AcademicAssistant = () => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'Merhaba! 🎓 Ben EconNotes Akademik Asistanınızım. Size ders notlarınız hakkında yardımcı olabilirim. Bir konu veya ders adı yazın, size açıklama yapayım! Ayrıca dosya yükleyerek ders özetleri çıkartabilirim.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchNotes = async () => {
      const { data } = await supabase.from('notes').select('title, course, description, department, semester').limit(50);
      setNotes(data || []);
    };
    fetchNotes();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 2 * 1024 * 1024; // 2MB for text extraction
    if (file.size > maxSize) {
      toast.error('Dosya boyutu 2MB\'dan küçük olmalıdır.');
      return;
    }

    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
      const text = await file.text();
      setUploadedFile({ name: file.name, content: text.slice(0, 10000) });
      toast.success(`${file.name} yüklendi. Soru sorabilirsiniz.`);
    } else {
      // For non-text files, just note the filename
      setUploadedFile({ name: file.name, content: `[Dosya yüklendi: ${file.name} - ${(file.size / 1024).toFixed(1)}KB]` });
      toast.success(`${file.name} yüklendi.`);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput('');

    let fullMessage = userMessage;
    if (uploadedFile) {
      fullMessage = `[Yüklenen dosya: ${uploadedFile.name}]\n\nDosya içeriği:\n${uploadedFile.content}\n\nKullanıcının sorusu: ${userMessage}`;
    }

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const notesContext = notes.map(n => `- ${n.title} (${n.course}, ${n.department}, ${n.semester}): ${n.description || 'Açıklama yok'}`).join('\n');

      const response = await supabase.functions.invoke('academic-assistant', {
        body: {
          message: fullMessage,
          notesContext,
          history: messages.slice(-10),
          hasFile: !!uploadedFile,
          fileName: uploadedFile?.name,
        },
      });

      if (response.error) throw response.error;
      setMessages(prev => [...prev, { role: 'assistant', content: response.data.reply || 'Yanıt alınamadı.' }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto flex min-h-[min(680px,calc(100dvh-10rem))] w-full max-w-4xl flex-col gap-4 animate-fade-in">
        <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">Akademik Asistan</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Ders notlarınla ilgili sorular sor, dosya yükle ve sana özel açıklamalar al.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {['Bu konuyu özetle', 'Önemli kavramları açıkla', 'Bana çalışma soruları hazırla'].map((prompt) => (
              <Button key={prompt} type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal rounded-full px-3 py-1.5 text-left text-xs" onClick={() => setInput(prompt)}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {prompt}
              </Button>
            ))}
          </div>
        </div>

        <Card className="glass-card flex min-h-[24rem] flex-1 flex-col overflow-hidden rounded-2xl">
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3 sm:p-5">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[88%] break-words rounded-2xl p-3 text-sm sm:max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'border border-border bg-accent/70 rounded-bl-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span>{msg.content}</span>
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
                <div className="flex gap-3 justify-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-accent/70 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Yanıt hazırlanıyor...
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
            </div>
          </ScrollArea>

          {/* Uploaded file indicator */}
          {uploadedFile && (
            <div className="px-3 pt-2">
              <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-2 text-xs">
                <FileText className="h-3 w-3 text-primary" />
                <span className="flex-1 truncate">{uploadedFile.name}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setUploadedFile(null)}><X className="h-3 w-3" /></Button>
              </div>
            </div>
          )}

          <div className="border-t border-border bg-card/70 p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.csv,.doc,.docx,.pdf" onChange={handleFileUpload} />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()} title="Dosya yükle" aria-label="Dosya yükle">
                <Upload className="h-4 w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Bir ders konusu veya soru yazın..."
                className="min-h-10 flex-1 resize-none rounded-xl py-2.5"
                rows={1}
              />
              <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" aria-label="Mesajı gönder" className="h-10 w-10 shrink-0 rounded-xl gradient-primary text-primary-foreground">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default AcademicAssistant;
