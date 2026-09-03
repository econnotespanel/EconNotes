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
import AuditLogPanel from '@/components/admin/AuditLogPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Shield, Users, FileText, Megaphone, AlertTriangle, Power, Trash2, Ban, Eye, Activity, Flag, UserCog, Check, Clock, Edit, GraduationCap, Plus, Image as ImageIcon, Sparkles, BookOpen, Sun, Palmtree, ArrowUpCircle, Palette } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/lib/activityLogger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { NOTE_SELECT } from '@/lib/noteColumns';
import SiteDesignPanel from '@/components/admin/SiteDesignPanel';

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
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [notePasswords, setNotePasswords] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [messageReports, setMessageReports] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<any[]>([]);
  const [studyFilter, setStudyFilter] = useState('');
  const [studyDetail, setStudyDetail] = useState<any>(null);
  const [systemOpen, setSystemOpen] = useState(true);
  const [noteUploadRestricted, setNoteUploadRestricted] = useState(true);
  const [noteViewRestricted, setNoteViewRestricted] = useState(false);
  const [academicWeek, setAcademicWeek] = useState<string>('');
  const [academicWeekLabel, setAcademicWeekLabel] = useState('');
  const [academicSemester, setAcademicSemester] = useState('Güz');
  const [closureTitle, setClosureTitle] = useState('');
  const [closureMessage, setClosureMessage] = useState('');
  const [closureImageUrl, setClosureImageUrl] = useState('');
  const [closureMode, setClosureMode] = useState('maintenance');
  const [closedUntilInput, setClosedUntilInput] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteDialog, setPromoteDialog] = useState(false);
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

  /** Kayıt e-postalarını yönetici yetkili edge fonksiyonu üzerinden getirir. */
  const fetchUserEmails = async () => {
    const { data, error } = await supabase.functions.invoke('admin-user-emails');
    if (error) { console.error('admin-user-emails', error); return; }
    const map: Record<string, string> = {};
    for (const u of (data as any)?.users || []) if (u.email) map[u.id] = u.email;
    setUserEmails(map);
  };

  /** Şifreli notun şifresini yalnızca yönetici için sunucudan çeker. */
  const revealNotePassword = async (noteId: string) => {
    const { data, error } = await supabase.rpc('admin_get_note_password', { _note_id: noteId });
    if (error) { toast.error('Şifre alınamadı.'); return; }
    setNotePasswords(prev => ({ ...prev, [noteId]: (data as string) || '(boş)' }));
  };

  const fetchAll = async () => {
    const [usersRes, notesRes, announcementsRes, penaltiesRes, settingsRes, logsRes, rolesRes, reportsRes, bannersRes, studyRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('notes').select(NOTE_SELECT).order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('penalties').select('*').order('created_at', { ascending: false }),
      supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_roles').select('*'),
      supabase.from('message_reports').select('*').order('created_at', { ascending: false }),
      supabase.from('banners').select('*').order('created_at', { ascending: false }),
      supabase.from('study_materials').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    setUsers(usersRes.data || []);
    setNotes((notesRes.data as any[]) || []);
    setAnnouncements(announcementsRes.data || []);
    setPenalties(penaltiesRes.data || []);
    setActivityLogs(logsRes.data || []);
    setUserRoles(rolesRes.data || []);
    setMessageReports(reportsRes.data || []);
    setBanners(bannersRes.data || []);
    setStudyMaterials(studyRes.data || []);
    void fetchUserEmails();
    if (settingsRes.data) {
      setSystemOpen(settingsRes.data.is_system_open);
      setNoteUploadRestricted((settingsRes.data as any).note_upload_restricted ?? true);
      setNoteViewRestricted((settingsRes.data as any).note_view_restricted ?? false);
      setAcademicWeek(String((settingsRes.data as any).academic_week || ''));
      setAcademicWeekLabel((settingsRes.data as any).academic_week_label || '');
      setAcademicSemester((settingsRes.data as any).academic_semester || 'Güz');
      setClosureTitle((settingsRes.data as any).closure_title || '');
      setClosureMessage((settingsRes.data as any).closure_message || '');
      setClosureImageUrl((settingsRes.data as any).closure_image_url || '');
      setClosureMode((settingsRes.data as any).closure_mode || 'maintenance');
      const cu = (settingsRes.data as any).closed_until;
      setClosedUntilInput(cu ? new Date(cu).toISOString().slice(0, 16) : '');
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

  const toggleViewRestriction = async () => {
    const newState = !noteViewRestricted;
    await supabase.from('system_settings').update({ note_view_restricted: newState } as any).not('id', 'is', null);
    setNoteViewRestricted(newState);
    toast.success(newState ? 'Önizleme kotası açıldı.' : 'Önizleme kotası kapatıldı.');
  };

  const updateAcademicWeek = async () => {
    await supabase.from('system_settings').update({ 
      academic_week: academicWeek ? parseInt(academicWeek) : null, 
      academic_week_label: academicWeekLabel || null,
      academic_semester: academicSemester || 'Güz',
    } as any).not('id', 'is', null);
    toast.success('Akademik hafta güncellendi!');
  };

  const saveClosureSettings = async (opts?: { close?: boolean; reopen?: boolean }) => {
    const patch: any = {
      closure_title: closureTitle || null,
      closure_message: closureMessage || null,
      closure_image_url: closureImageUrl || null,
      closure_mode: closureMode || 'maintenance',
      closed_until: closedUntilInput ? new Date(closedUntilInput).toISOString() : null,
    };
    if (opts?.close) patch.is_system_open = false;
    if (opts?.reopen) patch.is_system_open = true;
    const { error } = await supabase.from('system_settings').update(patch).not('id', 'is', null);
    if (error) { toast.error('Kapanış ayarları kaydedilemedi.'); return; }
    if (opts?.close) { setSystemOpen(false); toast.success('Sistem kapatıldı ve kapanış ekranı yayınlandı.'); }
    else if (opts?.reopen) { setSystemOpen(true); toast.success('Sistem yeniden açıldı. Herkese kolay gelsin!'); }
    else toast.success('Kapanış ayarları kaydedildi.');
  };

  const runPromotion = async () => {
    setPromoteLoading(true);
    const { data, error } = await (supabase as any).rpc('promote_students_annual');
    setPromoteLoading(false);
    setPromoteDialog(false);
    if (error) { toast.error('Sınıf atlatma başarısız: ' + error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`Sınıflar atlatıldı! Mezun olan: ${row?.graduated_total ?? 0}, aktif öğrenci: ${row?.promoted_total ?? 0}`);
    fetchAll();
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
  const approveNote = async (id: string) => {
    const { error } = await supabase.from('notes').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: user!.id, rejection_reason: null } as any).eq('id', id);
    if (error) { toast.error('Onaylanamadı: ' + error.message); return; }
    toast.success('Not onaylandı ve yayınlandı.');
    fetchAll();
  };
  const rejectNote = async (id: string) => {
    const reason = window.prompt('Reddetme sebebi (opsiyonel):') || 'Kurallara uygun değil';
    const { error } = await supabase.from('notes').update({ status: 'rejected', rejection_reason: reason } as any).eq('id', id);
    if (error) { toast.error('Reddedilemedi: ' + error.message); return; }
    toast.success('Not reddedildi.');
    fetchAll();
  };
  const deleteAnnouncement = async (id: string) => { await supabase.from('announcements').delete().eq('id', id); toast.success('Duyuru silindi!'); fetchAll(); };
  const deleteUser = async (userId: string) => {
    const t = toast.loading('Kullanıcı siliniyor...');
    const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId } });
    toast.dismiss(t);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || 'Kullanıcı silinemedi.');
      return;
    }
    toast.success('Kullanıcı ve tüm verileri kalıcı olarak silindi.');
    fetchAll();
  };


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

  // Banner CRUD
  const saveBanner = async () => {
    if (!bannerForm.title || !bannerForm.content) { toast.error('Lütfen tüm alanları doldurun.'); return; }
    if (editingBanner) {
      const { error } = await supabase.from('banners').update({ title: bannerForm.title, content: bannerForm.content, bg_color: bannerForm.bg_color }).eq('id', editingBanner.id);
      if (error) { toast.error('Güncellenemedi.'); return; }
      toast.success('Banner güncellendi!');
    } else {
      const { error } = await supabase.from('banners').insert({ title: bannerForm.title, content: bannerForm.content, bg_color: bannerForm.bg_color, user_id: user!.id });
      if (error) { toast.error('Eklenemedi.'); return; }
      toast.success('Banner oluşturuldu!');
    }
    setBannerDialog(false); setEditingBanner(null); setBannerForm({ title: '', content: '', bg_color: 'primary' }); fetchAll();
  };

  const deleteBanner = async (id: string) => { await supabase.from('banners').delete().eq('id', id); toast.success('Banner silindi!'); fetchAll(); };
  const toggleBannerActive = async (id: string, current: boolean) => { await supabase.from('banners').update({ is_active: !current }).eq('id', id); fetchAll(); };

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
              <span className="text-xs text-muted-foreground">Önizleme Kotası</span>
              <Switch checked={noteViewRestricted} onCheckedChange={toggleViewRestriction} />
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

        {/* Yaz Dönemi Kapanış Menüsü + Sınıf Atlatma */}
        <Card className="glass-card border-yellow-300/40 bg-gradient-to-br from-yellow-50/60 via-orange-50/40 to-cyan-50/60 dark:from-yellow-500/10 dark:via-orange-500/10 dark:to-cyan-500/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sun className="h-5 w-5 text-yellow-500" />
              Yaz Dönemi Yönetimi
              <Palmtree className="h-5 w-5 text-emerald-500 ml-auto" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kapanış Türü</Label>
                <Select value={closureMode} onValueChange={setClosureMode}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summer">🌴 Yaz Tatili</SelectItem>
                    <SelectItem value="maintenance">🛠️ Bakım</SelectItem>
                    <SelectItem value="announcement">📣 Duyuru</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tekrar Açılış Tarihi (opsiyonel)</Label>
                <Input type="datetime-local" value={closedUntilInput} onChange={e => setClosedUntilInput(e.target.value)} className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Başlık</Label>
              <Input value={closureTitle} onChange={e => setClosureTitle(e.target.value)} placeholder="ör: EconNotes Yaz Tatiline Girdi 🌊" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kapanış Metni</Label>
              <Textarea value={closureMessage} onChange={e => setClosureMessage(e.target.value)} rows={4} placeholder="Öğrencilere gösterilecek metni yazın..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Görsel URL (opsiyonel)</Label>
              <Input value={closureImageUrl} onChange={e => setClosureImageUrl(e.target.value)} placeholder="https://..." />
              {closureImageUrl && (
                <img src={closureImageUrl} alt="Önizleme" className="mt-2 max-h-40 rounded-lg border border-border object-cover" />
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => saveClosureSettings()}>Ayarları Kaydet</Button>
              {systemOpen ? (
                <Button size="sm" className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:opacity-90 text-white" onClick={() => saveClosureSettings({ close: true })}>
                  <Sun className="h-4 w-4 mr-1.5" /> Sistemi Kapat & Yayınla
                </Button>
              ) : (
                <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:opacity-90 text-white" onClick={() => saveClosureSettings({ reopen: true })}>
                  <Power className="h-4 w-4 mr-1.5" /> Sistemi Yeniden Aç
                </Button>
              )}
              <AlertDialog open={promoteDialog} onOpenChange={setPromoteDialog}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-emerald-400/60 text-emerald-700 dark:text-emerald-300">
                    <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Sınıfları Bir Üste Taşı (1 Ağustos)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tüm öğrencileri bir üst sınıfa taşımak istediğinize emin misiniz?</AlertDialogTitle>
                    <AlertDialogDescription>
                      1. Sınıf → 2, 2 → 3, 3 → 4 olacak. 4. sınıflar "Mezun" kategorisine geçecek. Bu işlem geri alınamaz.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>İptal</AlertDialogCancel>
                    <AlertDialogAction onClick={runPromotion} disabled={promoteLoading}>{promoteLoading ? 'Uygulanıyor...' : 'Evet, Taşı'}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>



        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{users.length}</p><p className="text-xs text-muted-foreground">Kullanıcılar</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{notes.length}</p><p className="text-xs text-muted-foreground">Notlar</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{announcements.length}</p><p className="text-xs text-muted-foreground">Duyurular</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{penalties.length}</p><p className="text-xs text-muted-foreground">Cezalar</p></CardContent></Card>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-10">
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-1.5 hidden sm:inline" />Kullanıcılar</TabsTrigger>
            <TabsTrigger value="notes"><FileText className="h-4 w-4 mr-1.5 hidden sm:inline" />Notlar</TabsTrigger>
            <TabsTrigger value="announcements"><Megaphone className="h-4 w-4 mr-1.5 hidden sm:inline" />Duyurular</TabsTrigger>
            <TabsTrigger value="banners"><ImageIcon className="h-4 w-4 mr-1.5 hidden sm:inline" />Bannerlar</TabsTrigger>
            <TabsTrigger value="penalties"><AlertTriangle className="h-4 w-4 mr-1.5 hidden sm:inline" />Cezalar</TabsTrigger>
            <TabsTrigger value="reports"><Flag className="h-4 w-4 mr-1.5 hidden sm:inline" />Raporlar{messageReports.filter(r => r.status === 'pending').length > 0 && <span className="ml-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center">{messageReports.filter(r => r.status === 'pending').length}</span>}</TabsTrigger>
            <TabsTrigger value="activity"><Activity className="h-4 w-4 mr-1.5 hidden sm:inline" />Aktiviteler</TabsTrigger>
            <TabsTrigger value="audit"><Shield className="h-4 w-4 mr-1.5 hidden sm:inline" />Denetim</TabsTrigger>
            <TabsTrigger value="design"><Palette className="h-4 w-4 mr-1.5 hidden sm:inline" />Tasarım</TabsTrigger>
            <TabsTrigger value="study"><Sparkles className="h-4 w-4 mr-1.5 hidden sm:inline" />Stüdyo</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border"><th className="text-left p-2">Ad Soyad</th><th className="text-left p-2">E-posta</th><th className="text-left p-2 hidden md:table-cell">Üniversite</th><th className="text-left p-2 hidden md:table-cell">Bölüm</th><th className="text-left p-2">Rol</th><th className="text-left p-2 hidden lg:table-cell">Son Giriş</th><th className="text-left p-2">İşlemler</th></tr></thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="p-2 font-medium">{u.full_name || '-'}</td>
                          <td className="p-2 text-xs break-all">{userEmails[u.user_id] || '—'}</td>
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
              {/* Onay bekleyen notlar */}
              {notes.filter(n => n.status === 'pending').length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-warning">
                    <Clock className="h-4 w-4" /> Onay Bekleyen Notlar ({notes.filter(n => n.status === 'pending').length})
                  </h3>
                  {notes.filter(n => n.status === 'pending').map((n) => (
                    <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/30">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{n.title} <Badge variant="outline" className="text-[10px] ml-1 bg-warning/20 text-warning">Beklemede</Badge> {n.has_password && (notePasswords[n.id]
                          ? <Badge variant="outline" className="text-[10px] ml-1">🔒 {notePasswords[n.id]}</Badge>
                          : <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] ml-1" onClick={() => revealNotePassword(n.id)}>🔒 Şifreyi göster</Button>)}</p>
                        <p className="text-xs text-muted-foreground">{n.uploader_name} • {n.course} • {n.department} • {new Date(n.created_at).toLocaleString('tr-TR')}</p>
                        {n.file_url && <a href={n.file_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">Dosyayı görüntüle</a>}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button size="sm" variant="outline" className="text-green-500" onClick={() => approveNote(n.id)} title="Onayla"><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => rejectNote(n.id)} title="Reddet"><Ban className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Diğer notlar */}
              <h3 className="text-sm font-semibold pt-2">Tüm Notlar</h3>
              {notes.filter(n => n.status !== 'pending').map((n) => (
                <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                  <div>
                    <p className="font-medium text-sm">{n.title}
                      {n.status === 'rejected' && <Badge variant="outline" className="text-[10px] ml-1 bg-destructive/10 text-destructive">Reddedildi</Badge>}
                      {n.status === 'approved' && <Badge variant="outline" className="text-[10px] ml-1 bg-green-500/10 text-green-500">Onaylı</Badge>}
                      {n.has_password && (notePasswords[n.id]
                        ? <Badge variant="outline" className="text-[10px] ml-1">🔒 {notePasswords[n.id]}</Badge>
                        : <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] ml-1" onClick={() => revealNotePassword(n.id)}>🔒 Şifreyi göster</Button>)}
                    </p>
                    <p className="text-xs text-muted-foreground">{n.uploader_name} • {n.course} • {new Date(n.created_at).toLocaleString('tr-TR')}</p>
                  </div>
                  <div className="flex gap-1">
                    {n.status === 'rejected' && <Button size="sm" variant="outline" className="text-green-500" onClick={() => approveNote(n.id)} title="Onayla"><Check className="h-3 w-3" /></Button>}
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu notu silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteNote(n.id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                    </AlertDialog>
                  </div>
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

          <TabsContent value="banners">
            <Card className="glass-card">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Banner Yönetimi</CardTitle>
                <Button size="sm" onClick={() => { setEditingBanner(null); setBannerForm({ title: '', content: '', bg_color: 'primary' }); setBannerDialog(true); }}>
                  <Plus className="h-3 w-3 mr-1" /> Yeni Banner
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {banners.map((b) => (
                  <div key={b.id} className={`flex items-center justify-between p-3 rounded-lg border ${b.is_active ? 'bg-primary/5 border-primary/20' : 'bg-accent/50 border-border/50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{b.title}</p>
                        <Badge variant="outline" className={`text-[10px] ${b.is_active ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                          {b.is_active ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{b.content}</p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button size="sm" variant="outline" onClick={() => toggleBannerActive(b.id, b.is_active)} title={b.is_active ? 'Pasif yap' : 'Aktif yap'}>
                        <Power className={`h-3 w-3 ${b.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingBanner(b); setBannerForm({ title: b.title, content: b.content, bg_color: b.bg_color || 'primary' }); setBannerDialog(true); }}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu banner'ı silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteBanner(b.id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
                {banners.length === 0 && <p className="text-center text-muted-foreground">Henüz banner yok.</p>}
              </CardContent>
            </Card>
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

          <TabsContent value="design">
            <SiteDesignPanel />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogPanel />
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

          <TabsContent value="study">
            <Card className="glass-card"><CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Çalışma Stüdyosu Üretimleri</h3>
                  <p className="text-xs text-muted-foreground">Toplam {studyMaterials.length} materyal · güvenlik denetimi için tüm üretimler listelenir.</p>
                </div>
                <Input placeholder="Kullanıcı, ders veya başlık ara..." value={studyFilter} onChange={(e) => setStudyFilter(e.target.value)} className="sm:max-w-xs" />
              </div>
              <ScrollArea className="h-[520px]">
                <div className="space-y-2">
                  {studyMaterials
                    .filter((m) => {
                      if (!studyFilter.trim()) return true;
                      const q = studyFilter.toLowerCase();
                      const u = users.find(x => x.user_id === m.user_id);
                      return [m.title, m.course, m.material_type, u?.full_name, u?.university, u?.department]
                        .filter(Boolean).some((v: string) => v.toLowerCase().includes(q));
                    })
                    .map((m) => {
                      const u = users.find(x => x.user_id === m.user_id);
                      const typeMeta: Record<string, { label: string; color: string }> = {
                        flashcards: { label: 'Bilgi Kartları', color: 'bg-blue-500/10 text-blue-500' },
                        quiz: { label: 'Test', color: 'bg-purple-500/10 text-purple-500' },
                        summary: { label: 'Özet', color: 'bg-emerald-500/10 text-emerald-500' },
                        video: { label: 'Video', color: 'bg-pink-500/10 text-pink-500' },
                      };
                      const t = typeMeta[m.material_type] || { label: m.material_type, color: 'bg-muted text-muted-foreground' };
                      const src = m.source_type === 'platform' ? 'Platform notu' : (m.source_note_id ? 'Kendi notu' : 'Dış yükleme');
                      return (
                        <div key={m.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-accent/50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] ${t.color}`}>{t.label}</Badge>
                              <Badge variant="outline" className="text-[10px]">{src}</Badge>
                              {m.course && <Badge variant="outline" className="text-[10px]">{m.course}</Badge>}
                            </div>
                            <p className="font-medium text-sm mt-1 truncate">{m.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                              <BookOpen className="h-3 w-3" />
                              {u?.full_name || 'Bilinmiyor'}
                              {u?.university && <span>· {u.university}</span>}
                              {u?.department && <span>· {u.department}</span>}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString('tr-TR')}</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStudyDetail(m)}>
                              <Eye className="h-3 w-3 mr-1" />İncele
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  {studyMaterials.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Henüz üretim yok.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!studyDetail} onOpenChange={(o) => !o && setStudyDetail(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{studyDetail?.title}</DialogTitle>
            </DialogHeader>
            {studyDetail && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Kullanıcı:</span> {users.find(u => u.user_id === studyDetail.user_id)?.full_name || '-'}</div>
                  <div><span className="text-muted-foreground">Ders:</span> {studyDetail.course || '-'}</div>
                  <div><span className="text-muted-foreground">Tür:</span> {studyDetail.material_type}</div>
                  <div><span className="text-muted-foreground">Kaynak:</span> {studyDetail.source_type}</div>
                  <div><span className="text-muted-foreground">Model:</span> {studyDetail.model || '-'}</div>
                  <div><span className="text-muted-foreground">Tarih:</span> {new Date(studyDetail.created_at).toLocaleString('tr-TR')}</div>
                </div>
                <ScrollArea className="h-[360px] rounded-lg border bg-muted/30 p-3">
                  <pre className="text-[11px] whitespace-pre-wrap break-words font-mono">
                    {JSON.stringify(studyDetail.content, null, 2)}
                  </pre>
                </ScrollArea>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const { error } = await supabase.from('study_materials').delete().eq('id', studyDetail.id);
                      if (error) { toast.error('Silinemedi.'); return; }
                      toast.success('Materyal silindi.');
                      setStudyMaterials(prev => prev.filter(x => x.id !== studyDetail.id));
                      setStudyDetail(null);
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Materyali Sil
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

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
                    <SelectItem value="5">Mezun</SelectItem>
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

        <Dialog open={bannerDialog} onOpenChange={(v) => { setBannerDialog(v); if (!v) setEditingBanner(null); }}>
          <DialogContent><DialogHeader><DialogTitle>{editingBanner ? 'Banner Düzenle' : 'Yeni Banner'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Başlık</Label><Input value={bannerForm.title} onChange={e => setBannerForm({...bannerForm, title: e.target.value})} placeholder="Banner başlığı" /></div>
              <div className="space-y-2"><Label>İçerik</Label><Textarea value={bannerForm.content} onChange={e => setBannerForm({...bannerForm, content: e.target.value})} placeholder="Banner içeriği" rows={3} /></div>
              <div className="space-y-2"><Label>Renk</Label>
                <Select value={bannerForm.bg_color} onValueChange={v => setBannerForm({...bannerForm, bg_color: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Mavi</SelectItem>
                    <SelectItem value="warning">Turuncu</SelectItem>
                    <SelectItem value="destructive">Kırmızı</SelectItem>
                    <SelectItem value="success">Yeşil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={saveBanner}>{editingBanner ? 'Güncelle' : 'Oluştur'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AdminPanel;
