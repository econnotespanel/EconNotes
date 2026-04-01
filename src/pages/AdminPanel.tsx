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
import { Shield, Users, FileText, Megaphone, AlertTriangle, Power, Trash2, Ban, Eye, Activity, Flag, UserCog, Check, Clock, Edit, GraduationCap, Plus, Image as ImageIcon } from 'lucide-react';
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
  const [banners, setBanners] = useState<any[]>([]);
  const [systemOpen, setSystemOpen] = useState(true);
  const [noteUploadRestricted, setNoteUploadRestricted] = useState(true);
  const [academicWeek, setAcademicWeek] = useState<string>('');
  const [academicWeekLabel, setAcademicWeekLabel] = useState('');
  const [academicSemester, setAcademicSemester] = useState('Güz');
  const [penaltyDialog, setPenaltyDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [penaltyLevel, setPenaltyLevel] = useState('1');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState('student');
  const [editUserDialog, setEditUserDialog] = useState(false);
  const [editUserData, setEditUserData] = useState<any>(null);
  const [editUserForm, setEditUserForm] = useState({ full_name: '', university: '', department: '', grade: 1 });
  const [extendPenaltyDialog, setExtendPenaltyDialog] = useState(false);
  const [extendPenalty, setExtendPenalty] = useState<any>(null);
  const [extendMinutes, setExtendMinutes] = useState('60');
  const [reportPenaltyDialog, setReportPenaltyDialog] = useState(false);
  const [reportPenaltyUser, setReportPenaltyUser] = useState<any>(null);
  // Banner CRUD state
  const [bannerDialog, setBannerDialog] = useState(false);
  const [editingBanner, setEditingBanner] = useState<any>(null);
  const [bannerForm, setBannerForm] = useState({ title: '', content: '', bg_color: 'primary' });

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return; }
    fetchAll();
  }, [isAdmin]);

  const fetchAll = async () => {
    const [usersRes, notesRes, announcementsRes, penaltiesRes, settingsRes, logsRes, rolesRes, reportsRes, bannersRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('penalties').select('*').order('created_at', { ascending: false }),
      supabase.from('system_settings').select('*').limit(1).single(),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_roles').select('*'),
      supabase.from('message_reports').select('*').order('created_at', { ascending: false }),
      supabase.from('banners').select('*').order('created_at', { ascending: false }),
    ]);
    setUsers(usersRes.data || []);
    setNotes(notesRes.data || []);
    setAnnouncements(announcementsRes.data || []);
    setPenalties(penaltiesRes.data || []);
    setActivityLogs(logsRes.data || []);
    setUserRoles(rolesRes.data || []);
    setMessageReports(reportsRes.data || []);
    setBanners(bannersRes.data || []);
    if (settingsRes.data) {
      setSystemOpen(settingsRes.data.is_system_open);
      setNoteUploadRestricted((settingsRes.data as any).note_upload_restricted ?? true);
      setAcademicWeek(String((settingsRes.data as any).academic_week || ''));
      setAcademicWeekLabel((settingsRes.data as any).academic_week_label || '');
      setAcademicSemester((settingsRes.data as any).academic_semester || 'Güz');
    }
  };

  const toggleSystem = async () => {
    const newState = !systemOpen;
    await supabase.from('system_settings').update({ is_system_open: newState }).not('id', 'is', null);
    setSystemOpen(newState);
    toast.success(newState ? 'Sistem açıldı!' : 'Sistem kapatıldı!');
  };

  const toggleUploadRestriction = async () => {
    const newState = !noteUploadRestricted;
    await supabase.from('system_settings').update({ note_upload_restricted: newState } as any).not('id', 'is', null);
    setNoteUploadRestricted(newState);
    toast.success(newState ? 'Saat kısıtı açıldı' : 'Saat kısıtı kaldırıldı');
  };

  const updateAcademicWeek = async () => {
    await supabase.from('system_settings').update({ 
      academic_week: academicWeek ? parseInt(academicWeek) : null, 
      academic_week_label: academicWeekLabel || null,
      academic_semester: academicSemester || 'Güz',
    } as any).not('id', 'is', null);
    toast.success('Akademik hafta güncellendi!');
  };

  const issuePenalty = async () => {
    if (!selectedUser || !penaltyReason) { toast.error('Lütfen tüm alanları doldurun.'); return; }
    const level = parseInt(penaltyLevel);
    const duration = PENALTY_DURATIONS.find(p => p.warning === level);
    const isPermanent = level >= 6;
    const penaltyUntil = isPermanent ? null : new Date(Date.now() + (duration?.minutes || 0) * 60000).toISOString();
    const { error } = await supabase.from('penalties').insert({
      user_id: selectedUser.user_id, issued_by: user!.id, reason: penaltyReason,
      warning_number: level, penalty_until: penaltyUntil, is_permanent: isPermanent,
    });
    if (error) { toast.error('Ceza verilemedi.'); return; }
    await logActivity(user!.id, 'Admin', user!.email || '', 'penalty_issued', `${selectedUser.full_name} - ${duration?.label}. Sebep: ${penaltyReason}`, 'penalty');
    toast.success(`Ceza verildi: ${duration?.label}`);
    setPenaltyDialog(false); setPenaltyReason(''); fetchAll();
  };

  const removePenalty = async (penaltyId: string) => {
    await supabase.from('penalties').delete().eq('id', penaltyId);
    toast.success('Ceza kaldırıldı!'); fetchAll();
  };

  const extendPenaltyTime = async () => {
    if (!extendPenalty) return;
    const newUntil = new Date(Date.now() + parseInt(extendMinutes) * 60000).toISOString();
    await supabase.from('penalties').update({ penalty_until: newUntil, is_permanent: false } as any).eq('id', extendPenalty.id);
    toast.success('Ceza süresi güncellendi!');
    setExtendPenaltyDialog(false); fetchAll();
  };

  const deleteNote = async (id: string) => { await supabase.from('notes').delete().eq('id', id); toast.success('Not silindi!'); fetchAll(); };
  const deleteAnnouncement = async (id: string) => { await supabase.from('announcements').delete().eq('id', id); toast.success('Duyuru silindi!'); fetchAll(); };
  const deleteUser = async (userId: string) => { await supabase.from('profiles').delete().eq('user_id', userId); toast.success('Kullanıcı silindi!'); fetchAll(); };

  const getUserRole = (userId: string) => { const role = userRoles.find(r => r.user_id === userId); return role?.role || 'student'; };
  const getRoleLabel = (role: string) => ({ admin: 'Admin', student: 'Öğrenci', akademisyen: 'Akademisyen' }[role] || role);

  const changeUserRole = async () => {
    if (!roleUser) return;
    const existingRole = userRoles.find(r => r.user_id === roleUser.user_id);
    if (existingRole) { await supabase.from('user_roles').update({ role: selectedRole as any }).eq('user_id', roleUser.user_id); }
    else { await supabase.from('user_roles').insert({ user_id: roleUser.user_id, role: selectedRole as any }); }
    toast.success(`Rol güncellendi!`); setRoleDialogOpen(false); fetchAll();
  };

  const updateUserProfile = async () => {
    if (!editUserData) return;
    const { error } = await supabase.from('profiles').update({
      full_name: editUserForm.full_name,
      university: editUserForm.university,
      department: editUserForm.department,
      grade: editUserForm.grade,
    }).eq('user_id', editUserData.user_id);
    if (error) { toast.error('Güncelleme başarısız: ' + error.message); return; }
    toast.success('Kullanıcı bilgileri güncellendi!');
    setEditUserDialog(false); fetchAll();
  };

  const penalizeFromReport = async () => {
    if (!reportPenaltyUser) return;
    setReportPenaltyDialog(false);
    setSelectedUser(reportPenaltyUser);
    setPenaltyDialog(true);
  };

  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Yönetici Paneli</h1>
            <p className="text-sm text-muted-foreground">Sistem yönetimi ve kullanıcı kontrolü</p>
          </div>
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Saat Kısıtı</span>
              <Switch checked={noteUploadRestricted} onCheckedChange={toggleUploadRestriction} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sistem</span>
              <Switch checked={systemOpen} onCheckedChange={toggleSystem} />
              <Power className={`h-4 w-4 ${systemOpen ? 'text-green-500' : 'text-destructive'}`} />
            </div>
          </div>
        </div>

        {/* Academic Week Setting */}
        <Card className="glass-card">
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <GraduationCap className="h-5 w-5 text-primary" />
            <div className="space-y-1">
              <Label className="text-xs">Hafta No</Label>
              <Input type="number" value={academicWeek} onChange={e => setAcademicWeek(e.target.value)} className="w-20 h-8" min="1" max="14" placeholder="—" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dönem</Label>
              <Select value={academicSemester} onValueChange={setAcademicSemester}>
                <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Güz">Güz</SelectItem>
                  <SelectItem value="Bahar">Bahar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[150px]">
              <Label className="text-xs">Etiket</Label>
              <Input value={academicWeekLabel} onChange={e => setAcademicWeekLabel(e.target.value)} className="h-8" placeholder="ör: Vize Haftası" />
            </div>
            <Button size="sm" onClick={updateAcademicWeek}>Kaydet</Button>
          </CardContent>
        </Card>

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
                    <thead><tr className="border-b border-border"><th className="text-left p-2">Ad Soyad</th><th className="text-left p-2 hidden md:table-cell">Üniversite</th><th className="text-left p-2 hidden md:table-cell">Bölüm</th><th className="text-left p-2">Rol</th><th className="text-left p-2 hidden lg:table-cell">Son Giriş</th><th className="text-left p-2">İşlemler</th></tr></thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="p-2 font-medium">{u.full_name || '-'}</td>
                          <td className="p-2 hidden md:table-cell">{u.university || '-'}</td>
                          <td className="p-2 hidden md:table-cell">{u.department || '-'}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{getRoleLabel(getUserRole(u.user_id))}</Badge></td>
                          <td className="p-2 hidden lg:table-cell">{u.last_login ? new Date(u.last_login).toLocaleString('tr-TR') : '-'}</td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => { setEditUserData(u); setEditUserForm({ full_name: u.full_name || '', university: u.university || '', department: u.department || '', grade: u.grade || 1 }); setEditUserDialog(true); }} title="Düzenle"><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setRoleUser(u); setSelectedRole(getUserRole(u.user_id)); setRoleDialogOpen(true); }} title="Rol"><UserCog className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setSelectedUser(u); setPenaltyDialog(true); }} title="Ceza"><Ban className="h-3 w-3" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu kullanıcıyı silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteUser(u.user_id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
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
            <Card className="glass-card"><CardContent className="p-4 space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                  <div>
                    <p className="font-medium text-sm">{n.title} {n.note_password && <Badge variant="outline" className="text-[10px] ml-1">🔒 Şifre: {n.note_password}</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{n.uploader_name} • {n.course} • {new Date(n.created_at).toLocaleString('tr-TR')}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu notu silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteNote(n.id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {notes.length === 0 && <p className="text-center text-muted-foreground">Not yok.</p>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="announcements">
            <Card className="glass-card"><CardContent className="p-4 space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                  <div><p className="font-medium text-sm">{a.title}</p><p className="text-xs text-muted-foreground">{a.author_name} • {new Date(a.created_at).toLocaleString('tr-TR')}</p></div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu duyuruyu silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteAnnouncement(a.id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {announcements.length === 0 && <p className="text-center text-muted-foreground">Duyuru yok.</p>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="penalties">
            <Card className="glass-card"><CardContent className="p-4 space-y-3">
              {penalties.map((p) => {
                const penaltyUser = users.find(u => u.user_id === p.user_id);
                const isActive = p.is_permanent || (p.penalty_until && new Date(p.penalty_until) > new Date());
                return (
                  <div key={p.id} className={`p-3 rounded-lg border ${isActive ? 'bg-destructive/10 border-destructive/20' : 'bg-accent/50 border-border/50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{penaltyUser?.full_name || 'Bilinmiyor'}</p>
                          <Badge variant="outline" className={`text-[10px] ${isActive ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-500'}`}>
                            {isActive ? 'Aktif' : 'Sona Erdi'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Uyarı #{p.warning_number} • {p.is_permanent ? 'Süresiz' : `Bitiş: ${new Date(p.penalty_until).toLocaleString('tr-TR')}`}</p>
                        <p className="text-xs text-muted-foreground mt-1">Sebep: {p.reason}</p>
                      </div>
                      <div className="flex gap-1">
                        {isActive && (
                          <Button size="sm" variant="outline" onClick={() => { setExtendPenalty(p); setExtendPenaltyDialog(true); }} title="Süre Değiştir">
                            <Clock className="h-3 w-3" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-green-500" title="Cezayı Kaldır"><Check className="h-3 w-3" /></Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cezayı kaldırmak istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => removePenalty(p.id)}>Kaldır</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })}
              {penalties.length === 0 && <p className="text-center text-muted-foreground">Ceza kaydı yok.</p>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card className="glass-card"><CardContent className="p-4 space-y-3">
              {messageReports.length === 0 ? (<p className="text-center text-muted-foreground">Henüz rapor yok.</p>) : (
                messageReports.map((r) => {
                  const reporter = users.find(u => u.user_id === r.reporter_id);
                  const reported = users.find(u => u.user_id === r.reported_user_id);
                  return (
                    <div key={r.id} className={`p-3 rounded-lg border ${r.status === 'pending' ? 'bg-destructive/10 border-destructive/20' : 'bg-accent/50 border-border/50'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">Raporlayan: {reporter?.full_name || '?'}</p>
                            <Badge variant="outline" className={`text-[10px] ${r.status === 'pending' ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-500'}`}>{r.status === 'pending' ? 'Bekliyor' : 'İncelendi'}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">Raporlanan: {reported?.full_name || '?'}</p>
                          <p className="text-xs text-muted-foreground mt-1">Sebep: {r.reason}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString('tr-TR')}</p>
                        </div>
                        <div className="flex gap-1">
                          {r.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" onClick={async () => {
                                await supabase.from('message_reports').update({ status: 'reviewed' } as any).eq('id', r.id);
                                toast.success('İncelendi.'); fetchAll();
                              }}><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="text-destructive" onClick={() => {
                                setReportPenaltyUser(reported);
                                setReportPenaltyDialog(true);
                              }} title="Ceza Ver"><Ban className="h-3 w-3" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card className="glass-card"><CardContent className="p-4">
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {activityLogs.map((log) => {
                    const actionLabels: Record<string, { label: string; color: string }> = {
                      note_created: { label: 'Not Paylaşıldı', color: 'bg-green-500/10 text-green-500' },
                      note_updated: { label: 'Not Güncellendi', color: 'bg-blue-500/10 text-blue-500' },
                      note_deleted: { label: 'Not Silindi', color: 'bg-red-500/10 text-red-500' },
                      user_login: { label: 'Giriş', color: 'bg-gray-500/10 text-gray-500' },
                      penalty_issued: { label: 'Ceza', color: 'bg-red-500/10 text-red-500' },
                    };
                    const actionInfo = actionLabels[log.action] || { label: log.action, color: 'bg-gray-500/10 text-gray-500' };
                    return (
                      <div key={log.id} className="flex items-start justify-between p-3 rounded-lg bg-accent/50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{log.user_name || '?'}</span>
                            <Badge variant="outline" className={`text-[10px] ${actionInfo.color}`}>{actionInfo.label}</Badge>
                          </div>
                          {log.details && <p className="text-xs text-muted-foreground mt-1">{log.details}</p>}
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">{new Date(log.created_at).toLocaleString('tr-TR')}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <Dialog open={penaltyDialog} onOpenChange={setPenaltyDialog}>
          <DialogContent><DialogHeader><DialogTitle>Ceza Ver - {selectedUser?.full_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Ceza Seviyesi</Label>
                <Select value={penaltyLevel} onValueChange={setPenaltyLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PENALTY_DURATIONS.map(p => <SelectItem key={p.warning} value={String(p.warning)}>{p.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Sebep *</Label><Textarea value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} placeholder="Ceza sebebi..." /></div>
              <Button className="w-full" onClick={issuePenalty}>Cezayı Uygula</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>Rol Değiştir - {roleUser?.full_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={selectedRole} onValueChange={setSelectedRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student">Öğrenci</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="akademisyen">Akademisyen</SelectItem></SelectContent></Select>
              <Button className="w-full" onClick={changeUserRole}>Güncelle</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editUserDialog} onOpenChange={setEditUserDialog}>
          <DialogContent><DialogHeader><DialogTitle>Kullanıcı Düzenle - {editUserData?.full_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Ad Soyad</Label><Input value={editUserForm.full_name} onChange={e => setEditUserForm({...editUserForm, full_name: e.target.value})} /></div>
              <div className="space-y-2"><Label>Üniversite</Label><Input value={editUserForm.university} onChange={e => setEditUserForm({...editUserForm, university: e.target.value})} /></div>
              <div className="space-y-2"><Label>Bölüm</Label><Input value={editUserForm.department} onChange={e => setEditUserForm({...editUserForm, department: e.target.value})} /></div>
              <div className="space-y-2"><Label>Sınıf</Label>
                <Select value={String(editUserForm.grade)} onValueChange={v => setEditUserForm({...editUserForm, grade: parseInt(v)})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1. Sınıf</SelectItem>
                    <SelectItem value="2">2. Sınıf</SelectItem>
                    <SelectItem value="3">3. Sınıf</SelectItem>
                    <SelectItem value="4">4. Sınıf</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={updateUserProfile}>Kaydet</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={extendPenaltyDialog} onOpenChange={setExtendPenaltyDialog}>
          <DialogContent><DialogHeader><DialogTitle>Ceza Süresini Değiştir</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={extendMinutes} onValueChange={setExtendMinutes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 Dakika</SelectItem>
                  <SelectItem value="60">1 Saat</SelectItem>
                  <SelectItem value="1440">1 Gün</SelectItem>
                  <SelectItem value="10080">1 Hafta</SelectItem>
                  <SelectItem value="40320">4 Hafta</SelectItem>
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={extendPenaltyTime}>Süreyi Güncelle</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={reportPenaltyDialog} onOpenChange={setReportPenaltyDialog}>
          <DialogContent><DialogHeader><DialogTitle>Raporlanan Kullanıcıya Ceza Ver</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Raporlanan kullanıcı: <strong>{reportPenaltyUser?.full_name}</strong></p>
              <Button className="w-full" onClick={penalizeFromReport}>Ceza Menüsünü Aç</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AdminPanel;
