import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Send, MessageSquare, UserPlus, Check, X, Search, Paperclip, Smile, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EMOJIS = ['😀','😂','😍','👍','👎','❤️','🔥','💯','🎓','📚','✅','❌','🙏','👏','🤔','😊','🥳','💪','📝','⭐'];

const Messages = () => {
  const { user, profile, isAdmin } = useAuth();
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFriends = async () => {
    if (!user) return;
    // Get accepted friend requests
    const { data: requests } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (requests) {
      const friendIds = requests.map(r => r.sender_id === user.id ? r.receiver_id : r.sender_id);
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', friendIds);
        setFriends(profiles || []);
      } else {
        setFriends([]);
      }
    }

    // Pending requests received
    const { data: pending } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', user.id)
      .eq('status', 'pending');
    
    if (pending && pending.length > 0) {
      const senderIds = pending.map(p => p.sender_id);
      const { data: senderProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', senderIds);
      setPendingRequests(pending.map(p => ({
        ...p,
        sender_profile: senderProfiles?.find(sp => sp.user_id === p.sender_id)
      })));
    } else {
      setPendingRequests([]);
    }

    // Sent requests
    const { data: sent } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('sender_id', user.id)
      .eq('status', 'pending');
    setSentRequests(sent || []);

    setLoading(false);
  };

  const fetchAllUsers = async () => {
    const { data } = await supabase.from('profiles').select('*');
    setAllUsers((data || []).filter(p => p.user_id !== user?.id));
  };

  const fetchMessages = async (friendUserId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${friendUserId}),and(sender_id.eq.${friendUserId},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchAllUsers();
    }
  }, [user]);

  useEffect(() => {
    if (selectedFriend) {
      fetchMessages(selectedFriend.user_id);
      const interval = setInterval(() => fetchMessages(selectedFriend.user_id), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedFriend]);

  const sendFriendRequest = async (receiverId: string) => {
    const { error } = await supabase.from('friend_requests').insert({
      sender_id: user!.id,
      receiver_id: receiverId,
    });
    if (error) {
      if (error.code === '23505') toast.error('Zaten istek gönderilmiş.');
      else toast.error('İstek gönderilemedi.');
      return;
    }
    toast.success('Arkadaşlık isteği gönderildi!');
    fetchFriends();
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    if (accept) {
      await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
      toast.success('İstek kabul edildi!');
    } else {
      await supabase.from('friend_requests').delete().eq('id', requestId);
      toast.info('İstek reddedildi.');
    }
    fetchFriends();
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedFriend) return;
    const { error } = await supabase.from('messages').insert({
      sender_id: user!.id,
      receiver_id: selectedFriend.user_id,
      content: newMessage,
    });
    if (error) { toast.error('Mesaj gönderilemedi.'); return; }
    setNewMessage('');
    fetchMessages(selectedFriend.user_id);
  };

  const sendFileMessage = async (file: File) => {
    const ext = file.name.split('.').pop();
    const path = `messages/${user!.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('notes').upload(path, file);
    if (uploadErr) { toast.error('Dosya gönderilemedi.'); return; }
    const { data: urlData } = supabase.storage.from('notes').getPublicUrl(path);
    
    const { error } = await supabase.from('messages').insert({
      sender_id: user!.id,
      receiver_id: selectedFriend.user_id,
      content: `📎 [Dosya: ${file.name}](${urlData.publicUrl})`,
    });
    if (error) { toast.error('Mesaj gönderilemedi.'); return; }
    fetchMessages(selectedFriend.user_id);
  };

  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const isFriend = (userId: string) => friends.some(f => f.user_id === userId);
  const hasSentRequest = (userId: string) => sentRequests.some(r => r.receiver_id === userId);

  const filteredUsers = allUsers.filter(u =>
    u.full_name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.university.toLowerCase().includes(searchUser.toLowerCase())
  );

  const renderMessageContent = (content: string) => {
    const fileMatch = content.match(/📎 \[Dosya: (.+?)\]\((.+?)\)/);
    if (fileMatch) {
      const [, fileName, fileUrl] = fileMatch;
      const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);
      return (
        <div>
          {isImage ? (
            <img src={fileUrl} alt={fileName} className="max-w-[200px] rounded-lg mb-1" />
          ) : null}
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
            📎 {fileName}
          </a>
        </div>
      );
    }
    return <span>{content}</span>;
  };

  return (
    <Layout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mesajlar</h1>
            <p className="text-sm text-muted-foreground">Arkadaşlarınızla özel mesajlaşın</p>
          </div>
          <Dialog open={addFriendOpen} onOpenChange={setAddFriendOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <UserPlus className="h-4 w-4 mr-2" /> Arkadaş Ekle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Kullanıcı Bul & Arkadaş Ekle</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="İsim veya üniversite ara..." value={searchUser} onChange={e => setSearchUser(e.target.value)} className="pl-10" />
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {filteredUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                          <AvatarFallback className="text-xs">{u.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{u.full_name}</p>
                          <p className="text-xs text-muted-foreground">{u.university} • {u.department}</p>
                        </div>
                      </div>
                      {isFriend(u.user_id) ? (
                        <span className="text-xs text-green-500">Arkadaş</span>
                      ) : hasSentRequest(u.user_id) ? (
                        <span className="text-xs text-muted-foreground">İstek Gönderildi</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => sendFriendRequest(u.user_id)}>
                          <UserPlus className="h-3 w-3 mr-1" /> Ekle
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-16rem)]">
          {/* Left: Friends & Requests */}
          <Card className="glass-card md:col-span-1 overflow-hidden">
            <Tabs defaultValue="friends" className="h-full flex flex-col">
              <TabsList className="w-full rounded-none">
                <TabsTrigger value="friends" className="flex-1">
                  <Users className="h-3 w-3 mr-1" /> Arkadaşlar
                </TabsTrigger>
                <TabsTrigger value="requests" className="flex-1 relative">
                  İstekler
                  {pendingRequests.length > 0 && (
                    <span className="ml-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center">
                      {pendingRequests.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="friends" className="flex-1 overflow-y-auto p-2 space-y-1 m-0">
                {friends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4">Henüz arkadaş yok. Kullanıcı ekleyin!</p>
                ) : (
                  friends.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFriend(f)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        selectedFriend?.user_id === f.user_id ? 'bg-primary/10' : 'hover:bg-accent'
                      }`}
                    >
                      <Avatar className="h-9 w-9">
                        {f.avatar_url && <AvatarImage src={f.avatar_url} />}
                        <AvatarFallback className="text-xs">{f.full_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{f.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{f.department}</p>
                      </div>
                    </button>
                  ))
                )}
              </TabsContent>
              <TabsContent value="requests" className="flex-1 overflow-y-auto p-2 space-y-2 m-0">
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4">Bekleyen istek yok.</p>
                ) : (
                  pendingRequests.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                      <div>
                        <p className="text-sm font-medium">{r.sender_profile?.full_name || 'Kullanıcı'}</p>
                        <p className="text-xs text-muted-foreground">{r.sender_profile?.university}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-green-500 h-7 w-7 p-0" onClick={() => respondToRequest(r.id, true)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => respondToRequest(r.id, false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </Card>

          {/* Right: Chat Area */}
          <Card className="glass-card md:col-span-2 flex flex-col overflow-hidden">
            {!selectedFriend ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Bir arkadaş seçin</p>
                <p className="text-sm">Mesajlaşmaya başlamak için sol taraftan bir arkadaş seçin.</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="p-4 border-b border-border flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    {selectedFriend.avatar_url && <AvatarImage src={selectedFriend.avatar_url} />}
                    <AvatarFallback className="text-xs">{selectedFriend.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{selectedFriend.full_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedFriend.university} • {selectedFriend.department}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm">Henüz mesaj yok. İlk mesajı gönderin!</p>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] p-3 rounded-xl text-sm ${
                          msg.sender_id === user?.id
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-accent rounded-bl-sm'
                        }`}>
                          {renderMessageContent(msg.content)}
                          <p className="text-[10px] mt-1 opacity-60">
                            {new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="p-3 border-t border-border">
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) sendFileMessage(file);
                        e.target.value = '';
                      }}
                    />
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0">
                          <Smile className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" side="top">
                        <div className="grid grid-cols-5 gap-1">
                          {EMOJIS.map(e => (
                            <button key={e} onClick={() => addEmoji(e)} className="text-lg hover:bg-accent rounded p-1 transition-colors">
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Mesajınızı yazın..."
                      className="resize-none flex-1"
                      rows={1}
                    />
                    <Button onClick={sendMessage} className="gradient-primary text-primary-foreground shrink-0">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Messages;
