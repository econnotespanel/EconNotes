import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Send, MessageSquare } from 'lucide-react';

const Messages = () => {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchMessages(); }, [user]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    // For students, messages go to admin. For admin, they reply in context.
    // Simple: all messages go between user and a fixed admin concept
    const { error } = await supabase.from('messages').insert({
      sender_id: user!.id,
      receiver_id: user!.id, // placeholder - would need admin user ID
      content: newMessage,
    });

    if (error) { toast.error('Mesaj gönderilemedi.'); return; }
    toast.success('Mesaj gönderildi!');
    setNewMessage('');
    fetchMessages();
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Mesajlar</h1>
        <p className="text-sm text-muted-foreground">Yönetici ile iletişim kurun</p>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="h-[400px] overflow-y-auto space-y-3 mb-4">
              {loading ? (
                <p className="text-center text-muted-foreground">Yükleniyor...</p>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-2 opacity-30" />
                  <p>Henüz mesaj yok</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] p-3 rounded-lg text-sm ${msg.sender_id === user?.id ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>
                      {msg.content}
                      <p className="text-[10px] mt-1 opacity-70">{new Date(msg.created_at).toLocaleString('tr-TR')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Mesajınızı yazın..."
                className="resize-none"
                rows={2}
              />
              <Button onClick={sendMessage} className="gradient-primary text-primary-foreground self-end">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Messages;
