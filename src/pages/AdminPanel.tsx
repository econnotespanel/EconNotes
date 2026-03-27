import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Shield, Users, FileText, Megaphone, AlertTriangle, Power, Trash2, Ban, Eye, Activity, Flag, UserCog, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/lib/activityLogger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const PENALTY_DURATIONS = [
  { warning: 1, label: '1. Uyarı - 5 Dakika', minutes: 5 },
  { warning: 2, label: '2. Uyarı - 1 Saat', minutes: 60 },
  { warning: 3, label: '3. Uyarı - 1 Gün', minutes: 1440 },
  { warning: 4, label: '4. Uyarı - 1 Hafta', minutes: 10080 },
  { warning: 5, label: '5. Uyarı - 4 Hafta', minutes: 40320 },
  { warning: 6, label: '6. Uyarı - Süresiz', minutes: 0 },
];

const AdminPanel = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [messageReports, setMessageReports] = useState<any[]>([]);
  const [systemOpen, setSystemOpen] = useState(true);
  const [penaltyDialog, setPenaltyDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [penaltyLevel, setPenaltyLevel] = useState('1');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState('student');

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return; }
    fetchAll();
  }, [isAdmin]);

  const fetchAll = async () => {
    const [usersRes, notesRes, announcementsRes, penaltiesRes, settingsRes, logsRes, rolesRes, reportsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('penalties').select('*').order('created_at', { ascending: false }),
      supabase.from('system_settings').select('*').limit(1).single(),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_roles').select('*'),
      supabase.from('message_reports').select('*').order('created_at', { ascending: false }),
    ]);
    setUsers(usersRes.data || []);
    setNotes(notesRes.data || []);
    setAnnouncements(announcementsRes.data || []);
    setPenalties(penaltiesRes.data || []);
    setActivityLogs(logsRes.data || []);
    setUserRoles(rolesRes.data || []);
    setMessageReports(reportsRes.data || []);
    if (settingsRes.data) setSystemOpen(settingsRes.data.is_system_open);
  };

  const toggleSystem = async () => {
    const newState = !systemOpen;
    await supabase.from('system_settings').update({ is_system_open: newState }).not('id', 'is', null);
    setSystemOpen(newState);
    toast.success(newState ? 'Sistem açıldı!' : 'Sistem kapatıldı!');
  };

  const issuePenalty = async () => {
    if (!selectedUser || !penaltyReason) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }
    const level = parseInt(penaltyLevel);
    const duration = PENALTY_DURATIONS.find(p => p.warning === level);
    const isPermanent = level >= 6;
    const penaltyUntil = isPermanent ? null : new Date(Date.now() + (duration?.minutes || 0) * 60000).toISOString();

    const { error } = await supabase.from('penalties').insert({
      user_id: selectedUser.user_id,
      issued_by: user!.id,
      reason: penaltyReason,
      warning_number: level,
      penalty_until: penaltyUntil,
      is_permanent: isPermanent,
    });

    if (error) { toast.error('Ceza verilemedi.'); return; }
    await logActivity(user!.id, 'Admin', user!.email || '', 'penalty_issued', `${selectedUser.full_name} kullanıcısına ${duration?.label} cezası verildi. Sebep: ${penaltyReason}`, 'penalty');
    toast.success(`Ceza verildi: ${duration?.label}`);
    setPenaltyDialog(false);
    setPenaltyReason('');
    fetchAll();
  };

  const deleteNote = async (id: string) => {
    await supabase.from('notes').delete().eq('id', id);
    toast.success('Not silindi!');
    fetchAll();
  };

  const deleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    toast.success('Duyuru silindi!');
    fetchAll();
  };

  const deleteUser = async (userId: string) => {
    await supabase.from('profiles').delete().eq('user_id', userId);
    toast.success('Kullanıcı silindi!');
    fetchAll();
  };

  const getUserRole = (userId: string) => {
    const role = userRoles.find(r => r.user_id === userId);
    return role?.role || 'student';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = { admin: 'Admin', student: 'Öğrenci', akademisyen: 'Akademisyen' };
    return labels[role] || role;
  };

  const changeUserRole = async () => {
    if (!roleUser) return;
    const existingRole = userRoles.find(r => r.user_id === roleUser.user_id);
    if (existingRole) {
      await supabase.from('user_roles').update({ role: selectedRole as any }).eq('user_id', roleUser.user_id);
    } else {
      await supabase.from('user_roles').insert({ user_id: roleUser.user_id, role: selectedRole as any });
    }
    toast.success(`${roleUser.full_name} kullanıcısının rolü ${getRoleLabel(selectedRole)} olarak güncellendi!`);
    setRoleDialogOpen(false);
    fetchAll();
  };

  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Yönetici Paneli</h1>
            <p className="text-sm text-muted-foreground">Sistem yönetimi ve kullanıcı kontrolü</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Sistem</span>
            <Switch checked={systemOpen} onCheckedChange={toggleSystem} />
            <Power className={`h-4 w-4 ${systemOpen ? 'text-success' : 'text-destructive'}`} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{users.length}</p><p className="text-xs text-muted-foreground">Kullanıcılar</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{notes.length}</p><p className="text-xs text-muted-foreground">Notlar</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{announcements.length}</p><p className="text-xs text-muted-foreground">Duyurular</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{penalties.length}</p><p className="text-xs text-muted-foreground">Cezalar</p></CardContent></Card>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-1.5 hidden sm:inline" />Kullanıcılar</TabsTrigger>
            <TabsTrigger value="notes"><FileText className="h-4 w-4 mr-1.5 hidden sm:inline" />Notlar</TabsTrigger>
            <TabsTrigger value="announcements"><Megaphone className="h-4 w-4 mr-1.5 hidden sm:inline" />Duyurular</TabsTrigger>
            <TabsTrigger value="penalties"><AlertTriangle className="h-4 w-4 mr-1.5 hidden sm:inline" />Cezalar</TabsTrigger>
            <TabsTrigger value="reports"><Flag className="h-4 w-4 mr-1.5 hidden sm:inline" />Raporlar{messageReports.filter(r => r.status === 'pending').length > 0 && <span className="ml-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center">{messageReports.filter(r => r.status === 'pending').length}</span>}</TabsTrigger>
            <TabsTrigger value="activity"><Activity className="h-4 w-4 mr-1.5 hidden sm:inline" />Aktiviteler</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2">Ad Soyad</th>
                        <th className="text-left p-2 hidden md:table-cell">Üniversite</th>
                        <th className="text-left p-2 hidden md:table-cell">Bölüm</th>
                        <th className="text-left p-2 hidden lg:table-cell">Sınıf</th>
                        <th className="text-left p-2">Rol</th>
                        <th className="text-left p-2 hidden lg:table-cell">Kayıt Tarihi</th>
                        <th className="text-left p-2 hidden xl:table-cell">Son Giriş</th>
                        <th className="text-left p-2">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="p-2 font-medium">{u.full_name || '-'}</td>
                          <td className="p-2 hidden md:table-cell">{u.university || '-'}</td>
                          <td className="p-2 hidden md:table-cell">{u.department || '-'}</td>
                          <td className="p-2 hidden lg:table-cell">{u.grade ? `${u.grade}. Sınıf` : '-'}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-[10px]">{getRoleLabel(getUserRole(u.user_id))}</Badge>
                          </td>
                          <td className="p-2 hidden lg:table-cell">{new Date(u.created_at).toLocaleDateString('tr-TR')}</td>
                          <td className="p-2 hidden xl:table-cell">{u.last_login ? new Date(u.last_login).toLocaleString('tr-TR') : '-'}</td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => { setRoleUser(u); setSelectedRole(getUserRole(u.user_id)); setRoleDialogOpen(true); }} title="Rol Değiştir">
                                <UserCog className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setSelectedUser(u); setPenaltyDialog(true); }} title="Ceza Ver">
                                <Ban className="h-3 w-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Bu kullanıcıyı silmek istediğinize emin misiniz?</AlertDialogTitle>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>İptal</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteUser(u.user_id)}>Sil</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                    <div>
                      <p className="font-medium text-sm">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.uploader_name} • {n.course} • {new Date(n.created_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Bu notu silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>İptal</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteNote(n.id)}>Sil</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-center text-muted-foreground">Not yok.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="announcements">
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                    <div>
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.author_name} • {new Date(a.created_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Bu duyuruyu silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>İptal</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteAnnouncement(a.id)}>Sil</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
                {announcements.length === 0 && <p className="text-center text-muted-foreground">Duyuru yok.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="penalties">
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                {penalties.map((p) => {
                  const penaltyUser = users.find(u => u.user_id === p.user_id);
                  return (
                    <div key={p.id} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{penaltyUser?.full_name || 'Bilinmiyor'}</p>
                          <p className="text-xs text-muted-foreground">
                            Uyarı #{p.warning_number} • {p.is_permanent ? 'Süresiz' : `Bitiş: ${new Date(p.penalty_until).toLocaleString('tr-TR')}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Sebep: {p.reason}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {penalties.length === 0 && <p className="text-center text-muted-foreground">Ceza kaydı yok.</p>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="reports">
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                {messageReports.length === 0 ? (
                  <p className="text-center text-muted-foreground">Henüz rapor yok.</p>
                ) : (
                  messageReports.map((r) => {
                    const reporter = users.find(u => u.user_id === r.reporter_id);
                    const reported = users.find(u => u.user_id === r.reported_user_id);
                    return (
                      <div key={r.id} className={`p-3 rounded-lg border ${r.status === 'pending' ? 'bg-destructive/10 border-destructive/20' : 'bg-accent/50 border-border/50'}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">Raporlayan: {reporter?.full_name || 'Bilinmiyor'}</p>
                              <Badge variant="outline" className={`text-[10px] ${r.status === 'pending' ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-500'}`}>
                                {r.status === 'pending' ? 'Bekliyor' : 'İncelendi'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Raporlanan: {reported?.full_name || 'Bilinmiyor'}</p>
                            <p className="text-xs text-muted-foreground mt-1">Sebep: {r.reason}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString('tr-TR')}</p>
                          </div>
                          {r.status === 'pending' && (
                            <Button size="sm" variant="outline" onClick={async () => {
                              await supabase.from('message_reports').update({ status: 'reviewed' } as any).eq('id', r.id);
                              toast.success('Rapor incelendi olarak işaretlendi.');
                              fetchAll();
                            }}>
                              <Check className="h-3 w-3 mr-1" /> İncelendi
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity">
            <Card className="glass-card">
              <CardContent className="p-4">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {activityLogs.map((log) => {
                      const actionLabels: Record<string, { label: string; color: string }> = {
                        note_created: { label: 'Not Paylaşıldı', color: 'bg-green-500/10 text-green-500' },
                        note_updated: { label: 'Not Güncellendi', color: 'bg-blue-500/10 text-blue-500' },
                        note_deleted: { label: 'Not Silindi', color: 'bg-red-500/10 text-red-500' },
                        announcement_created: { label: 'Duyuru Eklendi', color: 'bg-green-500/10 text-green-500' },
                        announcement_deleted: { label: 'Duyuru Silindi', color: 'bg-red-500/10 text-red-500' },
                        profile_updated: { label: 'Profil Güncellendi', color: 'bg-blue-500/10 text-blue-500' },
                        password_changed: { label: 'Şifre Değiştirildi', color: 'bg-yellow-500/10 text-yellow-500' },
                        avatar_updated: { label: 'Avatar Güncellendi', color: 'bg-blue-500/10 text-blue-500' },
                        user_registered: { label: 'Yeni Kayıt', color: 'bg-green-500/10 text-green-500' },
                        user_login: { label: 'Giriş Yaptı', color: 'bg-gray-500/10 text-gray-500' },
                        penalty_issued: { label: 'Ceza Verildi', color: 'bg-red-500/10 text-red-500' },
                        user_deleted: { label: 'Kullanıcı Silindi', color: 'bg-red-500/10 text-red-500' },
                      };
                      const actionInfo = actionLabels[log.action] || { label: log.action, color: 'bg-gray-500/10 text-gray-500' };
                      return (
                        <div key={log.id} className="flex items-start justify-between p-3 rounded-lg bg-accent/50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{log.user_name || 'Bilinmiyor'}</span>
                              <Badge variant="outline" className={`text-[10px] ${actionInfo.color}`}>{actionInfo.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{log.user_email}</p>
                            {log.details && <p className="text-xs text-muted-foreground mt-1">{log.details}</p>}
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                            {new Date(log.created_at).toLocaleString('tr-TR')}
                          </span>
                        </div>
                      );
                    })}
                    {activityLogs.length === 0 && <p className="text-center text-muted-foreground">Henüz aktivite kaydı yok.</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Penalty Dialog */}
        <Dialog open={penaltyDialog} onOpenChange={setPenaltyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ceza Ver - {selectedUser?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ceza Seviyesi</Label>
                <Select value={penaltyLevel} onValueChange={setPenaltyLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PENALTY_DURATIONS.map(p => (
                      <SelectItem key={p.warning} value={String(p.warning)}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sebep *</Label>
                <Textarea value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} placeholder="Ceza sebebini yazın..." />
              </div>
              <Button className="w-full" onClick={issuePenalty}>Cezayı Uygula</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Role Dialog */}
        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rol Değiştir - {roleUser?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Öğrenci</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="akademisyen">Akademisyen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={changeUserRole}>Rolü Güncelle</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AdminPanel;
