import Layout from '@/components/Layout';
import SignedImage from '@/components/SignedImage';
import { openSignedNote } from '@/lib/storageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Send, MessageSquare, UserPlus, Check, X, Search, Paperclip, Smile, Users, ShieldCheck, Flag, UserMinus, Ban, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { getSupportMessageBody } from '@/lib/support';

const EMOJIS = ['😀','😂','😍','👍','👎','❤️','🔥','💯','🎓','📚','✅','❌','🙏','👏','🤔','😊','🥳','💪','📝','⭐'];

const MESSAGING_RULES = [
  'Mesajlaşma sırasında saygılı ve nazik olunmalıdır.',
  'Hakaret, küfür, argo veya aşağılayıcı ifadeler kesinlikle yasaktır.',
  'Spam, reklam veya gereksiz tekrarlayan mesajlar göndermek yasaktır.',
  'Kişisel bilgileri (TC, telefon, adres vb.) paylaşmak yasaktır.',
  'Ders notları ve akademik içerikler mesaj yerine not paylaşım bölümünden paylaşılmalıdır.',
  'Uygunsuz, müstehcen veya yasadışı içerik paylaşımı kesinlikle yasaktır.',
  'Diğer kullanıcıları rahatsız etmek, taciz veya tehdit etmek yasaktır.',
  'Kurallara uymayan kullanıcılar uyarı ve ceza alabilir.',
];

const Messages = () => {
  const { user, profile, isAdmin } = useAuth();
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [rulesChecked, setRulesChecked] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingMessage, setReportingMessage] = useState<any>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportUserDialogOpen, setReportUserDialogOpen] = useState(false);
  const [reportUserReason, setReportUserReason] = useState('');
  const [reportingUserId, setReportingUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBlocks = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id);
    setBlockedUsers((data || []).map((b: any) => b.blocked_id));
  };

  const fetchFriends = async () => {
    if (!user) return;
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
        setFriends((profiles || []).filter(p => !blockedUsers.includes(p.user_id)));
      } else {
        setFriends([]);
      }
    }

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
    const { data, error } = await supabase
      .from('messages')
      .select('id,sender_id,receiver_id,content,created_at,is_read')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${friendUserId}),and(sender_id.eq.${friendUserId},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      toast.error(`Mesajlar yüklenemedi: ${error.message}`);
      return;
    }
    setMessages((data || []).reverse());
    
    // Mark received messages as read
    await supabase.from('messages')
      .update({ is_read: true })
      .eq('sender_id', friendUserId)
      .eq('receiver_id', user!.id)
      .eq('is_read', false);
    
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (user) {
      const accepted = localStorage.getItem(`messaging_rules_${user.id}`);
      if (accepted === 'true') setRulesAccepted(true);
      fetchBlocks().then(() => {
        fetchFriends();
        fetchAllUsers();
      });
    }
  }, [user]);

  useEffect(() => {
    if (blockedUsers.length >= 0 && user) fetchFriends();
  }, [blockedUsers]);

  useEffect(() => {
    if (selectedFriend) {
      const friendId = selectedFriend.user_id;
      const channel = supabase
        .channel(`messages-${user!.id}-${friendId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${friendId}`,
        }, () => { void fetchMessages(friendId); })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${friendId}`,
        }, () => { void fetchMessages(friendId); })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void fetchMessages(friendId);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            toast.error('Canlı mesaj bağlantısı kurulamadı. Sayfayı yenileyip tekrar deneyin.');
          }
        });
      return () => { void supabase.removeChannel(channel); };
    }
  }, [selectedFriend, user]);

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

  const removeFriend = async (friendUserId: string) => {
    await supabase.from('friend_requests').delete().or(
      `and(sender_id.eq.${user!.id},receiver_id.eq.${friendUserId}),and(sender_id.eq.${friendUserId},receiver_id.eq.${user!.id})`
    );
    if (selectedFriend?.user_id === friendUserId) setSelectedFriend(null);
    toast.success('Arkadaşlıktan çıkarıldı.');
    fetchFriends();
  };

  const blockUser = async (userId: string) => {
    await supabase.from('user_blocks').insert({ blocker_id: user!.id, blocked_id: userId });
    // Also remove friendship
    await supabase.from('friend_requests').delete().or(
      `and(sender_id.eq.${user!.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user!.id})`
    );
    if (selectedFriend?.user_id === userId) setSelectedFriend(null);
    toast.success('Kullanıcı engellendi.');
    await fetchBlocks();
  };

  const reportUser = async () => {
    if (!reportingUserId || !reportUserReason.trim()) {
      toast.error('Lütfen rapor sebebini yazın.');
      return;
    }
    const { error } = await supabase.from('message_reports').insert({
      reporter_id: user!.id,
      reported_user_id: reportingUserId,
      message_id: reportingUserId, // using as general report
      reason: `[Kullanıcı Raporu] ${reportUserReason}`,
    });
    if (error) { toast.error('Rapor gönderilemedi.'); return; }
    toast.success('Kullanıcı rapor edildi! Yöneticiler inceleyecektir.');
    setReportUserDialogOpen(false);
    setReportingUserId(null);
    setReportUserReason('');
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

    const { error } = await supabase.from('messages').insert({
      sender_id: user!.id,
      receiver_id: selectedFriend.user_id,
      content: `📎 [Dosya: ${file.name}](${path})`,
    });
    if (error) { toast.error('Mesaj gönderilemedi.'); return; }
    fetchMessages(selectedFriend.user_id);
  };

  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const reportMessage = async () => {
    if (!reportingMessage || !reportReason.trim()) {
      toast.error('Lütfen rapor sebebini yazın.');
      return;
    }
    const { error } = await supabase.from('message_reports').insert({
      reporter_id: user!.id,
      reported_user_id: reportingMessage.sender_id,
      message_id: reportingMessage.id,
      reason: reportReason,
    });
    if (error) { toast.error('Rapor gönderilemedi.'); return; }
    toast.success('Mesaj rapor edildi! Yöneticiler inceleyecektir.');
    setReportDialogOpen(false);
    setReportingMessage(null);
    setReportReason('');
  };

  const isFriend = (userId: string) => friends.some(f => f.user_id === userId);
  const hasSentRequest = (userId: string) => sentRequests.some(r => r.receiver_id === userId);
  const isBlocked = (userId: string) => blockedUsers.includes(userId);

  const filteredUsers = allUsers.filter(u =>
    !isBlocked(u.user_id) &&
    (u.full_name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.university.toLowerCase().includes(searchUser.toLowerCase()))
  );

  const formatLastOnline = (lastLogin: string | null) => {
    if (!lastLogin) return 'Bilinmiyor';
    const d = new Date(lastLogin);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Çevrimiçi';
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)} saat önce`;
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageContent = (content: string) => {
    const visibleContent = getSupportMessageBody(content);
    const fileMatch = visibleContent.match(/📎 \[Dosya: (.+?)\]\((.+?)\)/);
    if (fileMatch) {
      const [, fileName, fileUrl] = fileMatch;
      const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);
      return (
        <div>
          {isImage ? (
            <SignedImage source={fileUrl} alt={fileName} className="max-w-[200px] rounded-lg mb-1" />
          ) : null}
          <button type="button" onClick={() => { void openSignedNote(fileUrl); }} className="text-xs underline">
            📎 {fileName}
          </button>
        </div>
      );
    }
    return <span>{visibleContent}</span>;
  };

  const handleAcceptRules = () => {
    if (!rulesChecked) {
      toast.error('Lütfen mesajlaşma kurallarını kabul edin.');
      return;
    }
    localStorage.setItem(`messaging_rules_${user!.id}`, 'true');
    setRulesAccepted(true);
    toast.success('Kurallar kabul edildi. Artık mesajlaşabilirsiniz!');
  };

  if (!rulesAccepted) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-10 animate-fade-in">
          <Card className="glass-card">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <h2 className="text-xl font-bold">Mesajlaşma Kuralları</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Mesajlaşma özelliğini kullanabilmek için aşağıdaki kuralları okumanız ve kabul etmeniz gerekmektedir.
              </p>
              <ScrollArea className="h-[300px] rounded-lg border border-border p-4">
                <ol className="space-y-3 list-decimal list-inside text-sm">
                  {MESSAGING_RULES.map((rule, i) => (
                    <li key={i} className="leading-relaxed">{rule}</li>
                  ))}
                </ol>
              </ScrollArea>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="accept-rules"
                  checked={rulesChecked}
                  onCheckedChange={(v) => setRulesChecked(v as boolean)}
                />
                <label htmlFor="accept-rules" className="text-sm cursor-pointer leading-tight">
                  Yukarıdaki mesajlaşma kurallarını okudum ve kabul ediyorum.
                </label>
              </div>
              <Button onClick={handleAcceptRules} className="w-full gradient-primary text-primary-foreground">
                Kabul Et ve Devam Et
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-7xl space-y-4 animate-fade-in sm:space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mesajlar</h1>
            <p className="text-sm text-muted-foreground">Arkadaşlarınızla özel mesajlaşın</p>
          </div>
          <Dialog open={addFriendOpen} onOpenChange={setAddFriendOpen}>
            <DialogTrigger asChild>
              <Button className="w-full gap-2 rounded-xl gradient-primary text-primary-foreground sm:w-auto">
                <UserPlus className="h-4 w-4" /> Arkadaş Ekle
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg rounded-2xl">
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
                          <p className="text-xs text-muted-foreground">{u.grade ? `${u.grade}. Sınıf` : ''}</p>
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

        <div className="grid min-h-[min(620px,calc(100dvh-13rem))] grid-cols-1 gap-3 md:min-h-[32rem] md:grid-cols-3 md:gap-4">
          {/* Left: Friends & Requests — hidden on mobile when a chat is open */}
          <Card className={`glass-card min-h-0 overflow-hidden rounded-2xl md:col-span-1 ${selectedFriend ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
            <Tabs defaultValue="friends" className="flex h-full min-h-0 flex-col">
              <TabsList className="grid h-auto min-h-12 w-full shrink-0 grid-cols-2 rounded-none border-0 border-b border-border bg-muted/60 p-1 shadow-none">
                <TabsTrigger value="friends" className="min-h-10 flex-1 rounded-lg border-0 px-2 text-xs font-semibold data-[state=active]:border-0 data-[state=active]:shadow-sm sm:text-sm">
                  <Users className="h-3 w-3 mr-1" /> Arkadaşlar
                </TabsTrigger>
                <TabsTrigger value="requests" className="relative min-h-10 flex-1 rounded-lg border-0 px-2 text-xs font-semibold data-[state=active]:border-0 data-[state=active]:shadow-sm sm:text-sm">
                  İstekler
                  {pendingRequests.length > 0 && (
                    <span className="ml-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center">
                      {pendingRequests.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="friends" className="m-0 min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {friends.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4">Henüz arkadaş yok. Kullanıcı ekleyin!</p>
                ) : (
                  friends.map(f => (
                    <div key={f.id} className="group relative">
                      <button
                        onClick={() => setSelectedFriend(f)}
                        className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                          selectedFriend?.user_id === f.user_id ? 'border-primary/30 bg-primary/10' : 'border-transparent hover:border-border hover:bg-accent/70'
                        }`}
                      >
                        <Avatar className="h-9 w-9">
                          {f.avatar_url && <AvatarImage src={f.avatar_url} />}
                          <AvatarFallback className="text-xs">{f.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{f.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{f.department}</p>
                          <p className="text-[10px] text-muted-foreground">{formatLastOnline(f.last_login)}</p>
                        </div>
                      </button>
                      {/* Friend actions popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button aria-label={`${f.full_name} için işlemler`} className="absolute right-2 top-2 rounded-lg p-2 opacity-100 transition-opacity hover:bg-accent sm:opacity-0 sm:group-hover:opacity-100">
                            <span className="text-xs">⋮</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" side="right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left">
                                <UserMinus className="h-3 w-3" /> Çıkar
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{f.full_name} arkadaşlıktan çıkarılsın mı?</AlertDialogTitle>
                                <AlertDialogDescription>Bu işlem geri alınabilir, tekrar istek gönderebilirsiniz.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>İptal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeFriend(f.user_id)}>Çıkar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left text-destructive">
                                <Ban className="h-3 w-3" /> Engelle
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{f.full_name} engellensin mi?</AlertDialogTitle>
                                <AlertDialogDescription>Bu kullanıcı engellendikten sonra size mesaj gönderemez ve arkadaş listenizden çıkarılır.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>İptal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => blockUser(f.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Engelle</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left text-warning"
                            onClick={() => { setReportingUserId(f.user_id); setReportUserDialogOpen(true); }}
                          >
                            <AlertTriangle className="h-3 w-3" /> Raporla
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))
                )}
              </TabsContent>
              <TabsContent value="requests" className="m-0 min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4">Bekleyen istek yok.</p>
                ) : (
                  pendingRequests.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                      <div>
                        <p className="text-sm font-medium">{r.sender_profile?.full_name || 'Kullanıcı'}</p>
                        <p className="text-xs text-muted-foreground">{r.sender_profile?.university} • {r.sender_profile?.department}</p>
                        <p className="text-xs text-muted-foreground">{r.sender_profile?.grade ? `${r.sender_profile.grade}. Sınıf` : ''}</p>
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
          <Card className={`glass-card min-h-0 flex-col overflow-hidden rounded-2xl md:col-span-2 ${selectedFriend ? 'flex' : 'hidden md:flex'}`}>
            {!selectedFriend ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Bir arkadaş seçin</p>
                <p className="px-4 text-center text-sm">Mesajlaşmaya başlamak için arkadaş listesinden birini seçin.</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 border-b border-border bg-card/60 p-3 sm:p-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden shrink-0 -ml-1"
                    onClick={() => setSelectedFriend(null)}
                    aria-label="Geri"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <Avatar className="h-9 w-9 shrink-0">
                    {selectedFriend.avatar_url && <AvatarImage src={selectedFriend.avatar_url} />}
                    <AvatarFallback className="text-xs">{selectedFriend.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{selectedFriend.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedFriend.university} • {selectedFriend.department}</p>
                    <p className="text-[10px] text-muted-foreground">Son görülme: {formatLastOnline(selectedFriend.last_login)}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm">Henüz mesaj yok. İlk mesajı gönderin!</p>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`group flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                        <div className="group/bubble relative max-w-[85%] sm:max-w-[80%]">
                          <div className={`w-fit max-w-full break-words rounded-2xl p-3 text-sm [overflow-wrap:anywhere] ${
                            msg.sender_id === user?.id
                              ? 'bg-primary text-primary-foreground rounded-br-sm shadow-sm'
                              : 'border border-border bg-muted/70 rounded-bl-sm shadow-sm'
                          }`}>
                            {renderMessageContent(msg.content)}
                            <p className="text-[10px] mt-1 opacity-60">
                              {new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {msg.sender_id !== user?.id && (
                            <button
                              onClick={() => { setReportingMessage(msg); setReportDialogOpen(true); }}
                              aria-label="Mesajı raporla"
                              className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-100 transition-colors hover:text-destructive sm:-right-9 sm:top-0 sm:opacity-0 sm:group-hover/bubble:opacity-100"
                              title="Mesajı raporla"
                            >
                              <Flag className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="border-t border-border bg-card/80 p-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-3">
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
                    <Button variant="outline" size="icon" aria-label="Dosya ekle" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" aria-label="Emoji ekle" className="h-10 w-10 shrink-0 rounded-xl">
                          <Smile className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-2" side="top">
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
                      className="min-h-10 max-h-32 flex-1 resize-none rounded-xl text-base md:text-sm"
                      rows={1}
                    />
                    <Button onClick={sendMessage} disabled={!newMessage.trim()} className="h-10 w-10 shrink-0 rounded-xl gradient-primary text-primary-foreground" aria-label="Gönder" size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Report Message Dialog */}
        <Dialog open={reportDialogOpen} onOpenChange={(v) => { setReportDialogOpen(v); if (!v) { setReportingMessage(null); setReportReason(''); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Mesajı Raporla</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Bu mesajı uygunsuz bulduysanız sebebini yazarak yöneticilere bildirebilirsiniz.</p>
              {reportingMessage && (
                <div className="p-3 rounded-lg bg-accent text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Raporlanan mesaj:</p>
                  <p>{reportingMessage.content}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Rapor Sebebi *</Label>
                <Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Raporlama sebebinizi yazın..." />
              </div>
              <Button className="w-full" onClick={reportMessage}>Raporu Gönder</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Report User Dialog */}
        <Dialog open={reportUserDialogOpen} onOpenChange={(v) => { setReportUserDialogOpen(v); if (!v) { setReportingUserId(null); setReportUserReason(''); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Kullanıcıyı Raporla</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Bu kullanıcıyı uygunsuz davranış nedeniyle yöneticilere bildirebilirsiniz.</p>
              <div className="space-y-2">
                <Label>Rapor Sebebi *</Label>
                <Textarea value={reportUserReason} onChange={(e) => setReportUserReason(e.target.value)} placeholder="Raporlama sebebinizi yazın..." />
              </div>
              <Button className="w-full" onClick={reportUser}>Raporu Gönder</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Messages;
