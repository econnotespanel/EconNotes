import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const AcademicAssistant = () => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'Merhaba! 🎓 Ben EconNotes Akademik Asistanınızım. Size ders notlarınız hakkında yardımcı olabilirim. Bir konu veya ders adı yazın, size açıklama yapayım!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const notesContext = notes.map(n => `- ${n.title} (${n.course}, ${n.department}, ${n.semester}): ${n.description || 'Açıklama yok'}`).join('\n');
      
      const response = await supabase.functions.invoke('academic-assistant', {
        body: {
          message: userMessage,
          notesContext,
          history: messages.slice(-10),
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
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in h-[calc(100vh-12rem)]">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> Akademik Asistan
          </h1>
          <p className="text-sm text-muted-foreground">Ders notlarınız hakkında sorular sorun, konuları öğrenin</p>
        </div>

        <Card className="glass-card flex flex-col h-[calc(100%-5rem)]">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-accent rounded-bl-sm'
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
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-accent p-3 rounded-xl rounded-bl-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Bir ders konusu veya soru yazın..."
                className="resize-none flex-1"
                rows={1}
              />
              <Button onClick={sendMessage} disabled={loading} className="gradient-primary text-primary-foreground shrink-0">
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
