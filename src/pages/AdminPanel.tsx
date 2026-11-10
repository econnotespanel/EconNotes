import Layout from '@/components/Layout';
import { openSignedNote } from '@/lib/storageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useState } from 'react';
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
import { Shield, Users, FileText, Megaphone, AlertTriangle, Power, Trash2, Ban, Eye, Activity, Flag, UserCog, Check, Clock, Edit, GraduationCap, Plus, Image as ImageIcon, Sparkles, BookOpen, Sun, Palmtree, ArrowUpCircle, Palette, Download, CalendarDays, Search, SlidersHorizontal, KeyRound, Copy, Smartphone, RotateCcw, ArrowUpDown, Archive, RefreshCw, FolderArchive, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '@/lib/activityLogger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { NOTE_SELECT } from '@/lib/noteColumns';
import SiteDesignPanel from '@/components/admin/SiteDesignPanel';
import AdminNotePreviewDialog from '@/components/admin/AdminNotePreviewDialog';
import FatalErrorScreen from '@/components/FatalErrorScreen';
import { downloadLectureSummaryPdf } from '@/lib/liveLectureReport';
import { parseLoginLogDevice } from '@/lib/deviceInfo';
import { buildLoginAnalytics, formatRelativeLoginTime, type AuthAdminUserMeta } from '@/lib/adminLoginAnalytics';
import { normalizeUniversityName, POPULAR_UNIVERSITIES } from '@/lib/universityUtils';
import { toTurkishTitleCase } from '@/lib/stringUtils';
import { isLegacyUser } from '@/lib/approvalUtils';
import {
  AdminLoginLogTab,
  DeviceCategoryIcon,
  UserDevicesCell,
  UserLastLoginCell,
  UserLoginHistoryDialog,
} from '@/components/admin/UserLoginInsights';

const PENALTY_DURATIONS = [
  { warning: 1, label: '1. Uyarı - 5 Dakika', minutes: 5 },
  { warning: 2, label: '2. Uyarı - 1 Saat', minutes: 60 },
  { warning: 3, label: '3. Uyarı - 1 Gün', minutes: 1440 },
  { warning: 4, label: '4. Uyarı - 1 Hafta', minutes: 10080 },
  { warning: 5, label: '5. Uyarı - 4 Hafta', minutes: 40320 },
  { warning: 6, label: '6. Uyarı - Süresiz', minutes: 0 },
];

const AdminPanel = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userApprovalFilter, setUserApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [previewNote, setPreviewNote] = useState<any | null>(null);
  const [notesSubTab, setNotesSubTab] = useState<'active' | 'archive'>('active');
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
  const [studyLoading, setStudyLoading] = useState(true);
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
  const [showFatalPreview, setShowFatalPreview] = useState(false);
  const [closedUntilInput, setClosedUntilInput] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteDialog, setPromoteDialog] = useState(false);
  const [penaltyDialog, setPenaltyDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [penaltyLevel, setPenaltyLevel] = useState('1');
  const [penaltySaving, setPenaltySaving] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState('student');
  const [editUserDialog, setEditUserDialog] = useState(false);
  const [editUserData, setEditUserData] = useState<any>(null);
  const [editUserForm, setEditUserForm] = useState({ full_name: '', university: '', department: '', grade: 1, download_quota: '' });
  const [extendPenaltyDialog, setExtendPenaltyDialog] = useState(false);
  const [extendPenalty, setExtendPenalty] = useState<any>(null);
  const [extendMinutes, setExtendMinutes] = useState('60');
  const [reportPenaltyDialog, setReportPenaltyDialog] = useState(false);
  const [reportPenaltyUser, setReportPenaltyUser] = useState<any>(null);
  // Banner CRUD state
  const [bannerDialog, setBannerDialog] = useState(false);
  const [editingBanner, setEditingBanner] = useState<any>(null);
  const [bannerForm, setBannerForm] = useState({ title: '', content: '', bg_color: 'primary' });
  // Giriş & Cihaz analitiği state
  const [authMetaByUserId, setAuthMetaByUserId] = useState<Record<string, AuthAdminUserMeta>>({});
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [userPointsRows, setUserPointsRows] = useState<any[]>([]);
  const [userSortBy, setUserSortBy] = useState<'last_login' | 'created_at' | 'name'>('last_login');
  const [historyModalUserId, setHistoryModalUserId] = useState<string | null>(null);

  const { summariesByUserId, allEvents } = useMemo(
    () =>
      buildLoginAnalytics({
        users,
        userEmails,
        authMetaByUserId,
        loginLogs,
        activityLogs,
        userPoints: userPointsRows,
        currentUserId: user?.id,
      }),
    [users, userEmails, authMetaByUserId, loginLogs, activityLogs, userPointsRows, user?.id],
  );

  const activeTodayCount = useMemo(() => {
    let count = 0;
    for (const u of users) {
      const iso = summariesByUserId[u.user_id]?.effectiveLastLogin;
      if (iso && formatRelativeLoginTime(iso).isToday) count += 1;
    }
    return count;
  }, [users, summariesByUserId]);

  const trackedDeviceUsersCount = useMemo(() => {
    let count = 0;
    for (const u of users) {
      if ((summariesByUserId[u.user_id]?.devices?.length || 0) > 0) count += 1;
    }
    return count;
  }, [users, summariesByUserId]);

  const historyModalProfile = useMemo(() => {
    if (!historyModalUserId) return null;
    const found = users.find((u) => u.user_id === historyModalUserId);
    if (found) return found;
    const summary = summariesByUserId[historyModalUserId];
    const firstEv = summary?.events?.[0];
    return {
      user_id: historyModalUserId,
      full_name: firstEv?.userName || 'Kullanıcı',
      created_at: firstEv?.createdAt || null,
    };
  }, [historyModalUserId, users, summariesByUserId]);

  const pendingUsers = useMemo(
    () => users.filter((u) => u.approval_status === 'pending' && !isLegacyUser(u.created_at, null)),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase('tr-TR');
    const filtered = users.filter((u) => {
      const role = userRoles.find((item) => item.user_id === u.user_id)?.role || 'student';
      const email = userEmails[u.user_id] || '';
      const summary = summariesByUserId[u.user_id];
      const deviceTokens = (summary?.devices || [])
        .flatMap((d) => [d.deviceLabel, d.os, d.browser, d.isPwa ? 'pwa uygulama' : ''])
        .filter(Boolean)
        .join(' ');
      const providerTokens = (summary?.providers || []).join(' ');
      const searchable = [u.full_name, u.university, u.department, email, deviceTokens, providerTokens]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      const approvalStatus = isLegacyUser(u.created_at, null) ? 'approved' : (u.approval_status || 'approved');
      const matchesApproval =
        userApprovalFilter === 'all' ||
        (userApprovalFilter === 'pending' && approvalStatus === 'pending') ||
        (userApprovalFilter === 'approved' && approvalStatus === 'approved') ||
        (userApprovalFilter === 'rejected' && approvalStatus === 'rejected');

      return (!query || searchable.includes(query)) && (userRoleFilter === 'all' || role === userRoleFilter) && matchesApproval;
    });

    return filtered.sort((a, b) => {
      if (userSortBy === 'name') {
        return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'tr-TR');
      }
      if (userSortBy === 'created_at') {
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        return bCreated - aCreated;
      }
      // Varsayılan: en son giriş yapan kullanıcılar en üstte
      const aLoginIso = summariesByUserId[a.user_id]?.effectiveLastLogin || a.last_login;
      const bLoginIso = summariesByUserId[b.user_id]?.effectiveLastLogin || b.last_login;
      const aLoginMs = aLoginIso ? new Date(aLoginIso).getTime() : 0;
      const bLoginMs = bLoginIso ? new Date(bLoginIso).getTime() : 0;
      if (bLoginMs !== aLoginMs) return bLoginMs - aLoginMs;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      return bCreated - aCreated;
    });
  }, [users, userEmails, userSearch, userRoleFilter, userApprovalFilter, userRoles, summariesByUserId, userSortBy]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { navigate('/'); return; }
    fetchAll();
  }, [isAdmin, authLoading]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    const handleLoginRecorded = async () => {
      const [loginRes, profilesRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('*')
          .eq('action', 'user_login')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000),
      ]);
      if (!loginRes.error && loginRes.data) {
        setLoginLogs(loginRes.data);
      }
      if (!profilesRes.error && profilesRes.data) {
        setUsers((prev) => {
          const freshIds = new Set(profilesRes.data.map((p: any) => p.user_id));
          const merged = profilesRes.data.map((p: any) => {
            const au = authMetaByUserId[p.user_id];
            return !p.last_login && au?.last_sign_in_at ? { ...p, last_login: au.last_sign_in_at } : p;
          });
          const extraFromPrev = prev.filter((p) => !freshIds.has(p.user_id));
          return extraFromPrev.length > 0 ? [...merged, ...extraFromPrev] : merged;
        });
      }
    };
    window.addEventListener('econnotes:login-recorded', handleLoginRecorded);
    return () => window.removeEventListener('econnotes:login-recorded', handleLoginRecorded);
  }, [isAdmin, authLoading, authMetaByUserId]);

  /** Kayıt e-postalarını, son giriş zamanlarını ve OAuth sağlayıcılarını yönetici edge fonksiyonundan eşler. */
  const applyAuthUsers = (authUsers: AuthAdminUserMeta[]) => {
    const emailMap: Record<string, string> = {};
    const metaMap: Record<string, AuthAdminUserMeta> = {};
    for (const u of authUsers) {
      if (!u?.id) continue;
      metaMap[u.id] = u;
      if (u.email) emailMap[u.id] = u.email;
    }
    setUserEmails(emailMap);
    setAuthMetaByUserId(metaMap);

    if (Array.isArray(authUsers) && authUsers.length > 0) {
      setUsers((prev) => {
        const existingUserIds = new Set(prev.map((p) => p.user_id));
        const enrichedPrev = prev.map((p) => {
          const au = metaMap[p.user_id];
          if (!p.last_login && au?.last_sign_in_at) {
            return { ...p, last_login: au.last_sign_in_at };
          }
          return p;
        });
        const missingProfiles = authUsers
          .filter((au) => !existingUserIds.has(au.id))
          .map((au) => ({
            id: au.id,
            user_id: au.id,
            full_name: au.email ? au.email.split('@')[0] : 'Kayıtlı Kullanıcı',
            university: '—',
            department: '—',
            grade: 1,
            created_at: au.created_at,
            approval_status: au.confirmed ? 'approved' : 'pending',
            last_login: au.last_sign_in_at ?? null,
          }));
        return missingProfiles.length > 0 ? [...enrichedPrev, ...missingProfiles] : enrichedPrev;
      });
    }
  };

  /** Şifreli notun şifresini yalnızca yönetici için sunucudan çeker. */
  const revealNotePassword = async (noteId: string) => {
    const { data, error } = await supabase.rpc('admin_get_note_password', { _note_id: noteId });
    if (error) { toast.error('Şifre alınamadı.'); return; }
    setNotePasswords(prev => ({ ...prev, [noteId]: (data as string) || '(boş)' }));
  };

  const fetchAll = async () => {
    setUsersLoading(true);
    setNotesLoading(true);
    const usersPromise = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000);
    const notesPromise = supabase.from('notes').select(NOTE_SELECT).order('created_at', { ascending: false }).limit(1000);
    const emailsInvokePromise = supabase.functions
      .invoke('admin-user-emails')
      .catch((err) => ({ data: null, error: err }));
    setStudyLoading(true);
    const secondaryPromise = Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('penalties').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('activity_logs').select('*').eq('action', 'user_login').order('created_at', { ascending: false }).limit(1000),
      supabase.from('user_points').select('user_id, last_login_date, total_logins, updated_at').limit(1000),
      supabase.from('user_roles').select('*'),
      supabase.from('message_reports').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('banners').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('study_materials').select('*').order('created_at', { ascending: false }).limit(500),
    ]);

    try {
      const [usersRes, notesRes] = await Promise.all([usersPromise, notesPromise]);
      if (usersRes.error || notesRes.error) {
        console.error('Kullanıcı veya not verileri yüklenemedi:', usersRes.error || notesRes.error);
        toast.error('Kullanıcı veya not listesi yüklenemedi.');
      }
      setUsers(usersRes.data || []);
      setNotes((notesRes.data as any[]) || []);
      void emailsInvokePromise.then(({ data, error }) => {
        if (error) {
          console.error('admin-user-emails hatası:', error);
          return;
        }
        applyAuthUsers(((data as any)?.users as AuthAdminUserMeta[]) || []);
      });
    } catch (error) {
      console.error('Kullanıcı ve not sorguları başarısız:', error);
      toast.error('Kullanıcı ve not listesi yüklenemedi.');
      setUsers([]);
      setNotes([]);
    } finally {
      setUsersLoading(false);
      setNotesLoading(false);
    }

    try {
      const [announcementsRes, penaltiesRes, settingsRes, logsRes, loginLogsRes, pointsRes, rolesRes, reportsRes, bannersRes, studyRes] = await secondaryPromise;
      const failedLoads = [announcementsRes, penaltiesRes, settingsRes, logsRes, rolesRes, reportsRes, bannersRes, studyRes].filter((result) => result.error);
      if (failedLoads.length > 0) {
        console.error('Yönetici paneli ek verileri yüklenemedi:', failedLoads.map(({ error }) => error));
        toast.error('Panel verilerinin bir kısmı yüklenemedi. Lütfen tekrar deneyin.');
      }
      setAnnouncements(announcementsRes.data || []);
      setPenalties(penaltiesRes.data || []);
      setActivityLogs(logsRes.data || []);
      if (!loginLogsRes.error) setLoginLogs(loginLogsRes.data || []);
      if (!pointsRes.error) setUserPointsRows(pointsRes.data || []);
      setUserRoles(rolesRes.data || []);
      setMessageReports(reportsRes.data || []);
      setBanners(bannersRes.data || []);
      setStudyMaterials(studyRes.data || []);
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
    } catch (error) {
      console.error('Yönetici ek verileri yüklenemedi:', error);
    } finally {
      setStudyLoading(false);
    }
  };

  const toggleSystem = async () => {
    const newState = !systemOpen;
    const patch = newState
      ? { is_system_open: true }
      : {
          is_system_open: false,
          closure_title: closureTitle || 'EconNotes güncelleniyor',
          closure_message: closureMessage || 'Sunucu bakım güncellemesi yapılıyor. Lütfen daha sonra tekrar deneyin.',
          closure_mode: closureMode || 'maintenance',
        };
    const { error } = await supabase.from('system_settings').update(patch).not('id', 'is', null);
    if (error) {
      toast.error('Sistem durumu güncellenemedi.');
      return;
    }
    setSystemOpen(newState);
    window.dispatchEvent(new Event('econnotes:system-changed'));
    try {
      await supabase.channel('public-system-status').send({
        type: 'broadcast',
        event: 'system-maintenance',
        payload: { is_system_open: newState },
      });
    } catch (broadcastError) {
      console.warn('Sistem bakım yayını gönderilemedi; istemciler periyodik kontrolle durumu alacak.', broadcastError);
    }
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
    window.dispatchEvent(new Event('econnotes:system-changed'));
    try {
      await supabase.channel('public-system-status').send({
        type: 'broadcast',
        event: 'system-maintenance',
        payload: { is_system_open: patch.is_system_open ?? systemOpen },
      });
    } catch (broadcastError) {
      console.warn('Sistem bakım yayını gönderilemedi; istemciler periyodik kontrolle durumu alacak.', broadcastError);
    }
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
    if (penaltySaving) return;
    if (!selectedUser || !penaltyReason.trim()) { toast.error('Lütfen ceza sebebini yazın.'); return; }
    if (!user) { toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.'); return; }
    setPenaltySaving(true);
    try {
    const level = parseInt(penaltyLevel);
    const duration = PENALTY_DURATIONS.find(p => p.warning === level);
    const isPermanent = level >= 6;
    const penaltyUntil = isPermanent ? null : new Date(Date.now() + (duration?.minutes || 0) * 60000).toISOString();
    const { error } = await supabase.from('penalties').insert({
      user_id: selectedUser.user_id, issued_by: user.id, reason: penaltyReason.trim(),
      warning_number: level, penalty_until: penaltyUntil, is_permanent: isPermanent,
    });
    if (error) { toast.error('Ceza verilemedi: ' + error.message); return; }
    toast.success(`Ceza verildi: ${duration?.label}`);
    setPenaltyDialog(false); setPenaltyReason(''); fetchAll();

    // Instant eviction broadcast to kick out the user immediately if online
    try {
      const evictChannel = supabase.channel(`penalty-monitor-${selectedUser.user_id}`);
      evictChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await evictChannel.send({ type: 'broadcast', event: 'evict', payload: { reason: penaltyReason } });
          supabase.removeChannel(evictChannel);
        }
      });
      setTimeout(() => supabase.removeChannel(evictChannel), 8000);
    } catch (broadcastErr) {
      console.warn('Eviction broadcast error:', broadcastErr);
    }
    logActivity(user.id, 'Admin', user.email || '', 'penalty_issued', `${selectedUser.full_name} - ${duration?.label}. Sebep: ${penaltyReason}`, 'penalty').catch(() => {});
    } catch (err: any) {
      toast.error('Ceza verilemedi: ' + (err?.message || 'Bilinmeyen hata.'));
    } finally {
      setPenaltySaving(false);
    }
  };

  const removePenalty = async (penaltyId: string) => {
    const { error } = await supabase.from('penalties').delete().eq('id', penaltyId);
    if (error) { toast.error('Ceza kaldırılamadı.'); return; }
    toast.success('Ceza kaldırıldı!'); fetchAll();
  };

  const extendPenaltyTime = async () => {
    if (!extendPenalty) return;
    const newUntil = new Date(Date.now() + parseInt(extendMinutes) * 60000).toISOString();
    const { error } = await supabase.from('penalties').update({ penalty_until: newUntil, is_permanent: false } as any).eq('id', extendPenalty.id);
    if (error) { toast.error('Ceza süresi güncellenemedi.'); return; }
    toast.success('Ceza süresi güncellendi!');
    setExtendPenaltyDialog(false); fetchAll();
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) { toast.error('Not silinemedi.'); return; }
    toast.success('Not silindi!'); fetchAll();
  };
  const approveNote = async (id: string) => {
    const { error } = await supabase.from('notes').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id,
      rejection_reason: null,
      revision_deadline: null,
    } as any).eq('id', id);
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
  const requestNoteRevision = async (id: string, reason: string) => {
    const now = new Date();
    const deadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('notes').update({
      status: 'revision_requested',
      revision_requested_at: now.toISOString(),
      revision_deadline: deadline,
      rejection_reason: reason,
      revision_notes: reason,
    } as any).eq('id', id);
    if (error) {
      toast.error('Düzeltme talebi gönderilemedi: ' + error.message);
      return;
    }
    toast.success('Not kullanıcıya düzeltme için geri gönderildi (72 saat süre verildi).');
    void logActivity(user!.id, 'Admin', user!.email || '', 'note_revision_requested', `Not ID ${id} için 72 saatlik revizyon istendi: ${reason}`, 'note', id).catch(() => {});
    fetchAll();
  };
  const archiveNote = async (id: string) => {
    const { error } = await supabase.from('notes').update({
      status: 'archived',
      visibility_status: 'permanent',
    } as any).eq('id', id);
    if (error) { toast.error('Not arşivlenemedi: ' + error.message); return; }
    toast.success('Not yönetici arşivine kaldırıldı.');
    fetchAll();
  };
  const restoreArchivedNote = async (id: string) => {
    const { error } = await supabase.from('notes').update({
      status: 'pending',
      visibility_status: 'visible',
    } as any).eq('id', id);
    if (error) { toast.error('Not arşivden çıkarılamadı: ' + error.message); return; }
    toast.success('Not arşivden çıkarıldı ve onay listesine alındı.');
    fetchAll();
  };
  const approveUser = async (userId: string, userName: string) => {
    const { error } = await supabase.from('profiles').update({
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id,
    } as any).eq('user_id', userId);
    if (error) {
      toast.error('Kullanıcı onaylanamadı: ' + error.message);
      return;
    }
    toast.success(`"${userName}" başarıyla onaylandı ve erişimi açıldı!`);
    void logActivity(user!.id, 'Admin', user!.email || '', 'user_approved', `"${userName}" kullanıcısı onaylandı`, 'user', userId).catch(() => {});
    fetchAll();
  };
  const approveAllLegacyUsers = async () => {
    const t = toast.loading('Önceki kayıtlı kullanıcılar onaylanıyor...');
    const { error } = await supabase.from('profiles').update({
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user!.id,
    } as any).eq('approval_status', 'pending');
    toast.dismiss(t);
    if (error) {
      toast.error('Onaylama işlemi başarısız: ' + error.message);
      return;
    }
    toast.success('Mevcut tüm kayıtlı kullanıcılar başarıyla onaylandı!');
    fetchAll();
  };
  const rejectUser = async (userId: string, userName: string) => {
    const { error } = await supabase.from('profiles').update({
      approval_status: 'rejected',
    } as any).eq('user_id', userId);
    if (error) {
      toast.error('Kullanıcı başvurusu reddedilemedi: ' + error.message);
      return;
    }
    toast.success(`"${userName}" başvurusu reddedildi.`);
    void logActivity(user!.id, 'Admin', user!.email || '', 'user_rejected', `"${userName}" başvurusu reddedildi`, 'user', userId).catch(() => {});
    fetchAll();
  };
  const deleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) { toast.error('Duyuru silinemedi.'); return; }
    toast.success('Duyuru silindi!'); fetchAll();
  };
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


  const [tempPassword, setTempPassword] = useState<{ email: string; password: string; name?: string } | null>(null);
  const createTempPassword = async (userId: string, userName?: string, userEmail?: string) => {
    const t = toast.loading('Geçici anahtar şifre oluşturuluyor...');
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { userId, user_id: userId }
      });
      toast.dismiss(t);
      if (error || (data as any)?.error || !(data as any)?.temp_password) {
        toast.error((data as any)?.error || error?.message || 'Geçici anahtar şifre oluşturulamadı.');
        return;
      }
      setTempPassword({
        name: userName || '',
        email: (data as any).email || userEmail || '',
        password: (data as any).temp_password,
      });
      toast.success('Geçici anahtar şifre başarıyla oluşturuldu!');
    } catch (err: any) {
      toast.dismiss(t);
      toast.error('Bağlantı hatası: ' + (err.message || 'Hata oluştu.'));
    }
  };

  const getUserRole = (userId: string) => { const role = userRoles.find(r => r.user_id === userId); return role?.role || 'student'; };
  const getRoleLabel = (role: string) => ({ admin: 'Admin', student: 'Öğrenci', akademisyen: 'Akademisyen' }[role] || role);

  const changeUserRole = async () => {
    if (!roleUser) return;
    const existingRole = userRoles.find(r => r.user_id === roleUser.user_id);
    const { error } = existingRole
      ? await supabase.from('user_roles').update({ role: selectedRole as any }).eq('user_id', roleUser.user_id)
      : await supabase.from('user_roles').insert({ user_id: roleUser.user_id, role: selectedRole as any });
    if (error) { toast.error('Rol güncellenemedi.'); return; }
    toast.success(`Rol güncellendi!`); setRoleDialogOpen(false); fetchAll();
  };

  const [savingUser, setSavingUser] = useState(false);
  const updateUserProfile = async () => {
    if (!editUserData || savingUser) return;
    setSavingUser(true);
    try { await doUpdateUserProfile(); }
    catch (e: any) { toast.error('Kaydedilemedi: ' + (e?.message || 'Sunucuya ulaşılamadı.')); }
    finally { setSavingUser(false); }
  };
  const doUpdateUserProfile = async () => {
    if (!editUserData) return;
    const { error } = await supabase.from('profiles').update({
      full_name: toTurkishTitleCase(editUserForm.full_name.trim()),
      university: normalizeUniversityName(editUserForm.university.trim()),
      department: toTurkishTitleCase(editUserForm.department.trim()),
      grade: editUserForm.grade,
    }).eq('user_id', editUserData.user_id);
    if (error) { toast.error('Güncelleme başarısız: ' + error.message); return; }
    const selectedQuota = editUserForm.download_quota === '' ? null : Number(editUserForm.download_quota);
    const originalQuota = editUserData.manual_download_quota ?? null;

    if (selectedQuota !== originalQuota) {
      const { data: quotaSaved, error: quotaError } = await supabase.rpc('admin_set_download_quota', {
        _user_id: editUserData.user_id,
        _quota: selectedQuota,
      });
      if (quotaError) {
        if (quotaError.code === 'PGRST202' || (quotaError.message && quotaError.message.includes('schema cache'))) {
          toast.error('Profil güncellendi ancak özel kota kaydedilemedi: Veritabanında kota fonksiyonu (admin_set_download_quota) henüz tanımlanmamış.');
        } else {
          toast.error('Not kotası güncellenemedi: ' + quotaError.message);
        }
        return;
      }
      if (quotaSaved !== true) {
        toast.error('Not kotası kaydedilemedi. Kullanıcı kaydı bulunamadı.');
        return;
      }
    }
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

  const deleteBanner = async (id: string) => {
    const { error } = await supabase.from('banners').delete().eq('id', id);
    if (error) { toast.error('Banner silinemedi.'); return; }
    toast.success('Banner silindi!'); fetchAll();
  };
  const toggleBannerActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('banners').update({ is_active: !current }).eq('id', id);
    if (error) { toast.error('Banner durumu güncellenemedi.'); return; }
    fetchAll();
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Yönetici yetkisi doğrulanıyor…</span>
        </div>
      </Layout>
    );
  }

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
          <CardContent className="grid min-w-0 grid-cols-2 items-end gap-3 p-4 sm:grid-cols-[auto_5rem_7rem_minmax(0,1fr)_auto]">
            <GraduationCap className="h-5 w-5 text-primary" />
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Hafta No</Label>
              <Input type="number" value={academicWeek} onChange={e => setAcademicWeek(e.target.value)} className="h-9 w-full sm:h-8" min="1" max="14" placeholder="—" />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Dönem</Label>
              <Select value={academicSemester} onValueChange={setAcademicSemester}>
                <SelectTrigger className="h-9 w-full sm:h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Güz">Güz</SelectItem>
                  <SelectItem value="Bahar">Bahar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
              <Label className="text-xs">Etiket</Label>
              <Input value={academicWeekLabel} onChange={e => setAcademicWeekLabel(e.target.value)} className="h-9 w-full sm:h-8" placeholder="ör: Vize Haftası" />
            </div>
            <Button size="sm" className="col-span-2 w-full sm:col-span-1 sm:w-auto" onClick={updateAcademicWeek}>Kaydet</Button>
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
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Kapanış Türü</Label>
                  {closureMode === 'fatal_error' && (
                    <button
                      type="button"
                      onClick={() => setShowFatalPreview(true)}
                      className="text-[11px] font-mono text-red-600 dark:text-red-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      <AlertTriangle className="h-3 w-3" /> Ekranı Aç / Önizle
                    </button>
                  )}
                </div>
                <Select
                  value={closureMode}
                  onValueChange={(val) => {
                    setClosureMode(val);
                    if (val === 'fatal_error') {
                      setShowFatalPreview(true);
                    }
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summer">🌴 Yaz Tatili</SelectItem>
                    <SelectItem value="maintenance">🛠️ Bakım</SelectItem>
                    <SelectItem value="announcement">📣 Duyuru</SelectItem>
                    <SelectItem value="fatal_error">🔴 Sunucu Hatası (Fatal Error)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tekrar Açılış Tarihi (opsiyonel)</Label>
                <Input type="datetime-local" value={closedUntilInput} onChange={e => setClosedUntilInput(e.target.value)} className="h-9 w-full min-w-0" />
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
              {closureMode === 'fatal_error' && (
                <Button
                  size="sm"
                  type="button"
                  variant="destructive"
                  className="bg-red-700 hover:bg-red-800 text-white font-mono text-xs gap-1.5 shadow-md"
                  onClick={() => setShowFatalPreview(true)}
                >
                  <AlertTriangle className="h-4 w-4" /> 🔴 Kırmızı Fatal Error Ekranını Aç
                </Button>
              )}
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



        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Kullanıcılar', sub: !usersLoading && activeTodayCount > 0 ? `Bugün ${activeTodayCount} aktif` : undefined, value: usersLoading ? '…' : users.length, icon: Users, tone: 'from-blue-500/20 to-cyan-500/5' },
            { label: 'Notlar', value: notesLoading ? '…' : notes.length, icon: FileText, tone: 'from-violet-500/20 to-fuchsia-500/5' },
            { label: 'Duyurular', value: announcements.length, icon: Megaphone, tone: 'from-amber-500/20 to-orange-500/5' },
            { label: 'Cezalar', value: penalties.length, icon: AlertTriangle, tone: 'from-rose-500/20 to-red-500/5' },
          ].map(({ label, sub, value, icon: Icon, tone }) => (
            <Card key={label} className={`glass-card overflow-hidden bg-gradient-to-br ${tone}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-2xl font-bold tracking-tight">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  {sub && <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">{sub}</p>}
                </div>
                <Icon className="h-5 w-5 text-muted-foreground/70" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users">
          <TabsList className="flex h-auto w-full max-w-full gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/80 p-1.5 shadow-sm backdrop-blur-md">
            <TabsTrigger className="shrink-0 rounded-xl px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm" value="users"><Users className="mr-1.5 hidden h-4 w-4 sm:inline" />Kullanıcılar</TabsTrigger>
            {([
              ['logins', Smartphone, 'Giriş & Cihazlar'],
              ['notes', FileText, 'Notlar'], ['announcements', Megaphone, 'Duyurular'], ['banners', ImageIcon, 'Bannerlar'],
              ['penalties', AlertTriangle, 'Cezalar'], ['reports', Flag, 'Raporlar'], ['activity', Activity, 'Aktiviteler'],
              ['audit', Shield, 'Denetim'], ['design', Palette, 'Tasarım'], ['study', Sparkles, 'Stüdyo'],
            ] as [string, React.ElementType, string][]).map(([value, Icon, label]) => (
              <TabsTrigger key={value as string} className="shrink-0 rounded-xl px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm" value={value as string}>
                <Icon className="mr-1.5 hidden h-4 w-4 sm:inline" />{label}
                {value === 'reports' && messageReports.filter(r => r.status === 'pending').length > 0 && <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">{messageReports.filter(r => r.status === 'pending').length}</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users">
            <Card className="glass-card">
              <CardContent className="p-4 space-y-4">
                {/* Bekleme Odası (Onay Bekleyen Kullanıcılar) Vurgulu Alanı */}
                {!usersLoading && pendingUsers.length > 0 && (
                  <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 sm:p-5 space-y-3 shadow-lg shadow-amber-500/5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30">
                          <Clock className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm sm:text-base text-foreground flex items-center gap-2">
                            <span>Bekleme Odası — Onay Bekleyen Yeni Kayıtlar</span>
                            <Badge variant="outline" className="border-amber-500/50 bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                              {pendingUsers.length} Kullanıcı
                            </Badge>
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Aşağıdaki kullanıcılar sisteme yeni kayıt olmuş olup EconNotes'a erişebilmek için yönetici onayı beklemektedir.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={approveAllLegacyUsers}
                        className="rounded-xl border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Tümünü Otomatik Onayla</span>
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {pendingUsers.map((u) => (
                        <div
                          key={u.user_id || u.id}
                          className="rounded-xl border border-amber-500/30 bg-card/90 p-3.5 space-y-2.5 shadow-sm transition-all hover:border-amber-500/60 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-foreground truncate">{u.full_name || 'İsimsiz'}</p>
                              <p className="text-xs text-muted-foreground truncate" title={userEmails[u.user_id]}>
                                {userEmails[u.user_id] || '—'}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-amber-500/15 border-amber-500/40 text-amber-500 shrink-0">
                              Beklemede
                            </Badge>
                          </div>

                          <div className="rounded-lg bg-muted/40 p-2 text-xs space-y-1 text-muted-foreground">
                            <div className="flex items-center gap-1.5 truncate">
                              <GraduationCap className="h-3 w-3 text-primary shrink-0" />
                              <span className="truncate">{u.university || 'Üniversite yok'} • {u.department || 'Bölüm yok'}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span>Sınıf: {u.grade || 1}. Sınıf</span>
                              <span>{u.created_at ? new Date(u.created_at).toLocaleDateString('tr-TR') : '—'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                            <Button
                              size="sm"
                              onClick={() => approveUser(u.user_id, u.full_name || '')}
                              className="flex-1 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Onayla ve Aç</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectUser(u.user_id, u.full_name || '')}
                              className="h-8 rounded-lg text-destructive border-destructive/40 hover:bg-destructive/10 text-xs px-2.5"
                              title="Başvuruyu Reddet"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Ad, e-posta, cihaz (iPhone, Android, Windows, Safari), üniversite ara..."
                        className="h-10 border-border/60 bg-background pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Select value={userApprovalFilter} onValueChange={(v) => setUserApprovalFilter(v as any)}>
                          <SelectTrigger className="h-10 w-[170px] bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tüm Durumlar</SelectItem>
                            <SelectItem value="pending">Bekleme Odası ({pendingUsers.length})</SelectItem>
                            <SelectItem value="approved">Onaylılar</SelectItem>
                            <SelectItem value="rejected">Reddedilenler</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                          <SelectTrigger className="h-10 w-[140px] bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tüm roller</SelectItem>
                            <SelectItem value="student">Öğrenci</SelectItem>
                            <SelectItem value="akademisyen">Akademisyen</SelectItem>
                            <SelectItem value="admin">Yönetici</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Select value={userSortBy} onValueChange={(v) => setUserSortBy(v as any)}>
                          <SelectTrigger className="h-10 w-[195px] bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="last_login">Son Giriş (En Yeni)</SelectItem>
                            <SelectItem value="created_at">Kayıt Tarihi (En Yeni)</SelectItem>
                            <SelectItem value="name">Ad Soyad (A–Z)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="outline" size="sm" onClick={fetchAll} className="h-10 rounded-xl gap-1.5" title="Listeyi ve giriş kayıtlarını yenile">
                        <RotateCcw className="h-3.5 w-3.5" /> Yenile
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="h-7 rounded-full px-3">
                      {usersLoading ? 'Kullanıcılar yükleniyor…' : `${filteredUsers.length} kullanıcı`}
                    </Badge>
                    {!usersLoading && (
                      <>
                        {pendingUsers.length > 0 && (
                          <Badge variant="outline" className="h-7 rounded-full border-amber-500/40 bg-amber-500/15 px-3 text-amber-500 font-semibold animate-pulse">
                            ⏳ Bekleme Odası: {pendingUsers.length}
                          </Badge>
                        )}
                        <Badge variant="outline" className="h-7 rounded-full border-emerald-500/35 bg-emerald-500/10 px-3 text-emerald-600 dark:text-emerald-400">
                          Bugün aktif: {activeTodayCount}
                        </Badge>
                        <Badge variant="outline" className="h-7 rounded-full border-primary/30 bg-primary/[0.08] px-3 text-primary">
                          Cihazı kayıtlı: {trackedDeviceUsersCount}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                <table className="min-w-[1440px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left p-3">Ad Soyad</th>
                        <th className="text-left p-3">E-posta</th>
                        <th className="text-left p-3">Son Giriş</th>
                        <th className="text-left p-3">Giriş Cihazları</th>
                        <th className="text-left p-3 hidden md:table-cell">Üniversite</th>
                        <th className="text-left p-3 hidden md:table-cell">Bölüm</th>
                        <th className="text-left p-3">Rol & Durum</th>
                        <th className="text-left p-3">Kayıt Tarihi</th>
                        <th className="text-left p-3">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersLoading && <tr><td colSpan={9} className="p-10 text-center text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Kullanıcılar yükleniyor…</span></td></tr>}
                      {filteredUsers.map((u) => {
                        const userSummary = summariesByUserId[u.user_id];
                        const isPending = u.approval_status === 'pending';
                        const isRej = u.approval_status === 'rejected';
                        return (
                        <tr key={u.user_id || u.id} className={`border-b border-border/50 transition-colors hover:bg-primary/[0.04] ${
                          isPending ? 'bg-amber-500/[0.03]' : ''
                        }`}>
                          <td className="p-3 font-medium align-top">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{u.full_name || '-'}</span>
                              {isPending && (
                                <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 border-amber-500/40 bg-amber-500/15 text-amber-500">
                                  Beklemede
                                </Badge>
                              )}
                              {isRej && (
                                <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 border-destructive/40 bg-destructive/15 text-destructive">
                                  Reddedildi
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3 min-w-[210px] max-w-[270px] align-top text-xs whitespace-normal break-all" title={userEmails[u.user_id] || undefined}>{userEmails[u.user_id] || '—'}</td>
                          <td className="p-3 min-w-[165px] align-top whitespace-nowrap">
                            <UserLastLoginCell
                              summary={userSummary}
                              onOpenHistory={() => setHistoryModalUserId(u.user_id)}
                            />
                          </td>
                          <td className="p-3 min-w-[230px] align-top">
                            <UserDevicesCell
                              summary={userSummary}
                              onOpenHistory={() => setHistoryModalUserId(u.user_id)}
                            />
                          </td>
                          <td className="p-3 min-w-[170px] max-w-[240px] align-top whitespace-normal break-words hidden md:table-cell" title={u.university || undefined}>{u.university || '-'}</td>
                          <td className="p-3 min-w-[170px] max-w-[250px] align-top whitespace-normal break-words hidden md:table-cell" title={u.department || undefined}>{u.department || '-'}</td>
                          <td className="p-3 align-top">
                            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">{getRoleLabel(getUserRole(u.user_id))}</Badge>
                          </td>
                          <td className="p-3 align-top whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5 text-primary" />{u.created_at ? new Date(u.created_at).toLocaleString('tr-TR') : '-'}</span></td>
                          <td className="p-3 align-top">
                            <div className="flex gap-1 flex-wrap">
                              {isPending && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => approveUser(u.user_id, u.full_name || '')}
                                    title="Onayla ve Erişimi Aç"
                                    className="text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/40"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => rejectUser(u.user_id, u.full_name || '')}
                                    title="Reddet"
                                    className="text-destructive hover:bg-destructive/10 hover:border-destructive/40"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {isRej && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveUser(u.user_id, u.full_name || '')}
                                  title="Yeniden Onayla"
                                  className="text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/40"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => setHistoryModalUserId(u.user_id)} title="Giriş ve Cihaz Geçmişi" className="hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"><Smartphone className="h-3.5 w-3.5 text-primary" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setEditUserData(u); setEditUserForm({ full_name: u.full_name || '', university: u.university || '', department: u.department || '', grade: u.grade || 1, download_quota: u.manual_download_quota ? String(u.manual_download_quota) : '' }); setEditUserDialog(true); }} title="Düzenle"><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setRoleUser(u); setSelectedRole(getUserRole(u.user_id)); setRoleDialogOpen(true); }} title="Rol"><UserCog className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => { setSelectedUser(u); setPenaltyDialog(true); }} title="Ceza"><Ban className="h-3 w-3" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors" title="Geçici Giriş Anahtarı / Şifresi Oluştur" aria-label="Geçici Giriş Anahtarı / Şifresi Oluştur">
                                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-2xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2 text-primary">
                                      <KeyRound className="h-5 w-5" /> Geçici Giriş Anahtarı Oluştur
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-sm leading-relaxed space-y-2">
                                      <span>
                                        <strong>{u.full_name || 'Bu kullanıcı'}</strong> ({userEmails[u.user_id] || '—'}) şifresini unuttuğu için tek kullanımlık geçici bir giriş anahtarı üretilecek.
                                      </span>
                                      <span className="block text-xs text-muted-foreground">
                                        Kullanıcı bu geçici şifre ile sisteme giriş yaptığında, güvenliği sağlamak için ilk adımda kendi yeni şifresini belirleyecektir.
                                      </span>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl">Vazgeç</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                                      onClick={() => createTempPassword(u.user_id, u.full_name || '', userEmails[u.user_id] || '')}
                                    >
                                      Anahtar Şifre Oluştur
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu kullanıcıyı silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteUser(u.user_id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {!usersLoading && filteredUsers.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">{users.length === 0 ? 'Kullanıcı bulunamadı.' : 'Aramanızla eşleşen kullanıcı yok.'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logins">
            <AdminLoginLogTab
              users={users}
              summariesByUserId={summariesByUserId}
              allEvents={allEvents}
              loading={usersLoading && loginLogs.length === 0}
              getRoleLabelForUser={(uid) => getRoleLabel(getUserRole(uid))}
              onRefresh={fetchAll}
              onInspectUser={(uid) => setHistoryModalUserId(uid)}
            />
          </TabsContent>

          <TabsContent value="notes">
            <Card className="glass-card">
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Alt Sekmeler (Aktif & Onay vs. Yönetici Not Arşivi) */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/40 border border-border/50">
                    <Button
                      size="sm"
                      variant={notesSubTab === 'active' ? 'default' : 'ghost'}
                      onClick={() => setNotesSubTab('active')}
                      className="rounded-lg h-8 px-3 text-xs gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Aktif & Bekleyen Notlar ({notes.filter(n => n.status !== 'archived').length})</span>
                    </Button>
                    <Button
                      size="sm"
                      variant={notesSubTab === 'archive' ? 'default' : 'ghost'}
                      onClick={() => setNotesSubTab('archive')}
                      className="rounded-lg h-8 px-3 text-xs gap-1.5"
                    >
                      <FolderArchive className="h-3.5 w-3.5" />
                      <span>Yönetici Not Arşivi ({notes.filter(n => n.status === 'archived').length})</span>
                    </Button>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchAll}
                    className="h-8 rounded-xl gap-1 text-xs"
                    title="Notları yenile"
                  >
                    <RotateCcw className="h-3 w-3" /> Yenile
                  </Button>
                </div>

                {notesLoading && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-10 text-sm text-muted-foreground">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Notlar yükleniyor…
                  </div>
                )}

                {/* AKTİF & BEKLEYEN NOTLAR GÖRÜNÜMÜ */}
                {!notesLoading && notesSubTab === 'active' && (
                  <div className="space-y-5">
                    {/* 1. Onay Bekleyen Notlar */}
                    {notes.filter(n => n.status === 'pending').length > 0 && (
                      <div className="space-y-3 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 sm:p-5">
                        <div className="flex items-center justify-between border-b border-amber-500/30 pb-2.5">
                          <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                            <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
                            <span>Onay Bekleyen Notlar</span>
                            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/20 text-amber-500 text-xs">
                              {notes.filter(n => n.status === 'pending').length} Not
                            </Badge>
                          </h3>
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            Notları inceleyip onaylayabilir veya 72 saat süreyle düzeltmeye gönderebilirsiniz.
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {notes.filter(n => n.status === 'pending').map((n) => {
                            const isMissingUni = !n.university || !n.university.trim();
                            const isMissingDept = !n.department || !n.department.trim();
                            return (
                              <div
                                key={n.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-amber-500/30 shadow-xs hover:border-amber-500/60 transition-colors"
                              >
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-sm text-foreground truncate">{n.title}</p>
                                    <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/40">
                                      Beklemede
                                    </Badge>
                                    {(isMissingUni || isMissingDept) && (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                        ⚠️ Eksik Bilgi {isMissingUni ? '(Üniversite)' : ''} {isMissingDept ? '(Bölüm)' : ''}
                                      </Badge>
                                    )}
                                    {n.has_password && (
                                      notePasswords[n.id] ? (
                                        <Badge variant="outline" className="text-[10px] border-amber-500/40">
                                          🔒 {notePasswords[n.id]}
                                        </Badge>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1.5 text-[10px]"
                                          onClick={() => revealNotePassword(n.id)}
                                        >
                                          🔒 Şifreyi göster
                                        </Button>
                                      )
                                    )}
                                  </div>

                                  <p className="text-xs text-muted-foreground truncate">
                                    {n.uploader_name} • {n.course} • {n.department || 'Bölüm yok'} • {n.university || 'Üniversite yok'} • {new Date(n.created_at).toLocaleString('tr-TR')}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPreviewNote(n)}
                                    className="h-8 rounded-lg gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/10"
                                    title="Not İçeriğini Önizle"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span>İçeriği İncele</span>
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPreviewNote(n)}
                                    className="h-8 rounded-lg text-amber-500 border-amber-500/40 hover:bg-amber-500/10 text-xs px-2.5"
                                    title="Düzeltme İste (72 Saat)"
                                  >
                                    <Clock className="h-3.5 w-3.5 mr-1" />
                                    <span className="hidden sm:inline">Düzeltme İste</span>
                                  </Button>

                                  <Button
                                    size="sm"
                                    onClick={() => approveNote(n.id)}
                                    className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5"
                                    title="Hızlı Onayla"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => rejectNote(n.id)}
                                    className="h-8 rounded-lg text-destructive border-destructive/40 hover:bg-destructive/10 text-xs px-2"
                                    title="Reddet"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Düzeltme / Revizyon Bekleyen Notlar (72 Saat Süre) */}
                    {notes.filter(n => n.status === 'revision_requested').length > 0 && (
                      <div className="space-y-3 rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent p-4 sm:p-5">
                        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2.5">
                          <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                            <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin" />
                            <span>Kullanıcı Düzeltmesi Bekleyen Notlar (72 Saatlik Süre)</span>
                            <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/20 text-cyan-400 text-xs">
                              {notes.filter(n => n.status === 'revision_requested').length} Not
                            </Badge>
                          </h3>
                        </div>

                        <div className="space-y-2.5">
                          {notes.filter(n => n.status === 'revision_requested').map((n) => {
                            const isExpired = n.revision_deadline && new Date(n.revision_deadline).getTime() <= Date.now();
                            return (
                              <div
                                key={n.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-cyan-500/30 shadow-xs"
                              >
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-sm text-foreground truncate">{n.title}</p>
                                    <Badge variant="outline" className="text-[10px] bg-cyan-500/20 text-cyan-400 border-cyan-500/40">
                                      {isExpired ? 'Süresi Doldu (Arşive Alınabilir)' : 'Revizyonda'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {n.uploader_name} • {n.course} • Talep Tarihi: {n.revision_requested_at ? new Date(n.revision_requested_at).toLocaleString('tr-TR') : '—'}
                                  </p>
                                  <p className="text-xs text-cyan-500 dark:text-cyan-300 bg-cyan-500/10 rounded-lg p-1.5 border border-cyan-500/20">
                                    <strong>İstenen Düzeltme:</strong> {n.rejection_reason || n.revision_notes || 'Eksik bilgileri tamamlayınız'}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPreviewNote(n)}
                                    className="h-8 rounded-lg gap-1 text-xs"
                                  >
                                    <Eye className="h-3.5 w-3.5" /> İncele
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => archiveNote(n.id)}
                                    className="h-8 rounded-lg text-amber-500 border-amber-500/40 hover:bg-amber-500/10 text-xs"
                                    title="Doğrudan Arşive Kaldır"
                                  >
                                    <Archive className="h-3.5 w-3.5 mr-1" /> Arşive Kaldır
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => approveNote(n.id)}
                                    className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                    title="Onayla ve Yayınla"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3. Yayınlanan & Diğer Notlar */}
                    <div className="space-y-2.5">
                      <h3 className="text-sm font-semibold pt-2 text-foreground">
                        Yayınlanan & Kayıtlı Notlar ({notes.filter(n => n.status !== 'pending' && n.status !== 'revision_requested' && n.status !== 'archived').length})
                      </h3>

                      {notes.filter(n => n.status !== 'pending' && n.status !== 'revision_requested' && n.status !== 'archived').map((n) => (
                        <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/40 border border-border/40">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm truncate">{n.title}</p>
                              {n.status === 'rejected' && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">Reddedildi</Badge>}
                              {n.status === 'approved' && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Onaylı</Badge>}
                              {n.has_password && (
                                notePasswords[n.id] ? (
                                  <Badge variant="outline" className="text-[10px]">🔒 {notePasswords[n.id]}</Badge>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => revealNotePassword(n.id)}>🔒 Şifreyi göster</Button>
                                )
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{n.uploader_name} • {n.course} • {n.university || 'Üniversite yok'} • {new Date(n.created_at).toLocaleDateString('tr-TR')}</p>
                          </div>

                          <div className="flex items-center gap-1 ml-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => setPreviewNote(n)} className="h-7 text-xs rounded-md" title="Önizle"><Eye className="h-3 w-3" /></Button>
                            {n.status === 'rejected' && <Button size="sm" variant="outline" className="h-7 text-emerald-500" onClick={() => approveNote(n.id)} title="Onayla"><Check className="h-3 w-3" /></Button>}
                            <Button size="sm" variant="outline" className="h-7 text-xs text-amber-500" onClick={() => archiveNote(n.id)} title="Arşive Taşı"><Archive className="h-3 w-3" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="h-7 text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bu notu silmek istediğinize emin misiniz?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>İptal</AlertDialogCancel><AlertDialogAction onClick={() => deleteNote(n.id)}>Sil</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* YÖNETİCİ NOT ARŞİVİ GÖRÜNÜMÜ */}
                {!notesLoading && notesSubTab === 'archive' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-1">
                      <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                        <FolderArchive className="h-4 w-4 text-primary" />
                        <span>Yönetici Not Arşivi</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Kullanıcıya 72 saat süre verilip bu süre zarfında düzenlenmeyen notlar ile yöneticiler tarafından arşive kaldırılan notlar burada tutulur. <strong>Bu notlar platformdaki kullanıcılara tamamen kapalıdır ve görünmez.</strong>
                      </p>
                    </div>

                    {notes.filter(n => n.status === 'archived').length === 0 ? (
                      <p className="p-10 text-center text-muted-foreground text-sm">Arşivde henüz not bulunmuyor.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {notes.filter(n => n.status === 'archived').map((n) => (
                          <div
                            key={n.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/70 shadow-xs"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-foreground truncate">{n.title}</span>
                                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Arşivde / Kapalı</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {n.uploader_name} • {n.course} • {n.university || 'Üniversite yok'} • {n.department || 'Bölüm yok'}
                              </p>
                              <p className="text-[11px] text-amber-500 bg-amber-500/10 rounded px-2 py-1 inline-block">
                                Arşiv Sebebi: {n.rejection_reason || '72 saat içerisinde düzenlenmedi veya yönetici tarafından arşivlendi'}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPreviewNote(n)}
                                className="h-8 rounded-lg text-xs gap-1"
                                title="İçeriği İncele"
                              >
                                <Eye className="h-3.5 w-3.5" /> İncele
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => restoreArchivedNote(n.id)}
                                className="h-8 rounded-lg text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 text-xs gap-1"
                                title="Arşivden Çıkar ve Onay Bekleyenlere Al"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Onaya Al
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 text-xs">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Bu arşiv notunu kalıcı olarak silmek istiyor musunuz?</AlertDialogTitle>
                                    <AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>İptal</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteNote(n.id)}>Kalıcı Olarak Sil</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
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
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-2">
                  {activityLogs.map((log) => {
                    const actionLabels: Record<string, { label: string; color: string }> = {
                      note_created: { label: 'Not Paylaşıldı', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' },
                      note_updated: { label: 'Not Güncellendi', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25' },
                      note_deleted: { label: 'Not Silindi', color: 'bg-red-500/10 text-red-500 border-red-500/25' },
                      user_login: { label: 'Oturum Açtı', color: 'bg-primary/10 text-primary border-primary/25' },
                      user_registered: { label: 'Kayıt Oldu', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25' },
                      profile_updated: { label: 'Profil Güncelledi', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25' },
                      avatar_updated: { label: 'Fotoğraf Güncelledi', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25' },
                      password_changed: { label: 'Şifre Değiştirdi', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' },
                      announcement_created: { label: 'Duyuru Yayınladı', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' },
                      announcement_deleted: { label: 'Duyuru Sildi', color: 'bg-red-500/10 text-red-500 border-red-500/25' },
                      user_deleted: { label: 'Kullanıcı Silindi', color: 'bg-red-500/10 text-red-500 border-red-500/25' },
                      penalty_issued: { label: 'Ceza Verildi', color: 'bg-red-500/10 text-red-500 border-red-500/25' },
                    };
                    const actionInfo = actionLabels[log.action] || { label: log.action, color: 'bg-muted text-muted-foreground' };
                    const parsedLoginDevice = log.action === 'user_login' ? parseLoginLogDevice(log) : null;
                    const resolvedName =
                      users.find((u) => u.user_id === log.user_id)?.full_name ||
                      log.user_name ||
                      (log.user_email ? log.user_email.split('@')[0] : '?');
                    const resolvedEmail = userEmails[log.user_id] || log.user_email || '';
                    return (
                      <div
                        key={log.id}
                        onClick={log.action === 'user_login' && log.user_id ? () => setHistoryModalUserId(log.user_id) : undefined}
                        className={`flex items-start justify-between gap-3 p-3 rounded-xl border border-border/50 bg-accent/40 ${
                          log.action === 'user_login' && log.user_id ? 'cursor-pointer hover:bg-primary/[0.05] hover:border-primary/30 transition-colors' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{resolvedName}</span>
                            {resolvedEmail && <span className="text-[11px] text-muted-foreground">({resolvedEmail})</span>}
                            <Badge variant="outline" className={`text-[10px] ${actionInfo.color}`}>{actionInfo.label}</Badge>
                          </div>
                          {parsedLoginDevice ? (
                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground">
                                <DeviceCategoryIcon type={parsedLoginDevice.deviceType} className="h-3 w-3 text-primary" />
                                {parsedLoginDevice.deviceLabel}
                                {parsedLoginDevice.os ? ` · ${parsedLoginDevice.os}` : ''}
                              </span>
                              <Badge variant="outline" className="text-[10px] rounded-md">{parsedLoginDevice.browser}</Badge>
                              {parsedLoginDevice.isPwa && (
                                <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-primary/30 text-[10px] rounded-md">PWA Uygulama</Badge>
                              )}
                            </div>
                          ) : (
                            log.details && <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap ml-2">{new Date(log.created_at).toLocaleString('tr-TR')}</span>
                      </div>
                    );
                  })}
                  {activityLogs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Henüz aktivite kaydı yok.</p>}
                </div>
              </ScrollArea>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="study">
            <Card className="glass-card"><CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Yüklenen Ders Notları ve Stüdyo Üretimleri</h3>
                  <p className="text-xs text-muted-foreground">Toplam {studyMaterials.length} materyal · kullanıcıların yüklediği notlar ve oluşturduğu içerikler burada listelenir.</p>
                </div>
                <Input placeholder="Kullanıcı, ders veya başlık ara..." value={studyFilter} onChange={(e) => setStudyFilter(e.target.value)} className="sm:max-w-xs" />
              </div>
              <ScrollArea className="h-[520px]">
                <div className="space-y-2">
                  {studyLoading && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-10 text-sm text-muted-foreground">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Ders notları yükleniyor…
                    </div>
                  )}
                  {!studyLoading && studyMaterials
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
                  {!studyLoading && studyMaterials.length === 0 && (
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
                  {studyDetail.material_type === 'summary' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => downloadLectureSummaryPdf({
                        title: studyDetail.title,
                        course: studyDetail.course,
                        createdAt: new Date(studyDetail.created_at).toLocaleDateString('tr-TR'),
                        overview: studyDetail.content?.overview,
                        keyPoints: studyDetail.content?.keyPoints,
                        sections: studyDetail.content?.sections,
                        instructorEmphasis: studyDetail.content?.instructorEmphasis,
                        examLikelihood: studyDetail.content?.examLikelihood,
                        transcript: studyDetail.content?.transcript,
                      })}
                    >
                      <Download className="mr-1 h-3 w-3" /> PDF indir
                    </Button>
                  )}
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
                <Select value={penaltyLevel} onValueChange={setPenaltyLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="z-[90]">{PENALTY_DURATIONS.map(p => <SelectItem key={p.warning} value={String(p.warning)}>{p.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Sebep *</Label><Textarea value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} placeholder="Ceza sebebi..." /></div>
              <Button type="button" className="w-full" disabled={penaltySaving} onClick={issuePenalty}>{penaltySaving ? 'Uygulanıyor…' : 'Cezayı Uygula'}</Button>
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
          <DialogContent className="overflow-y-auto"><DialogHeader><DialogTitle>Kullanıcı Düzenle - {editUserData?.full_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ad Soyad</Label>
                <Input
                  value={editUserForm.full_name}
                  onChange={e => setEditUserForm({...editUserForm, full_name: e.target.value})}
                  onBlur={() => {
                    if (editUserForm.full_name.trim()) {
                      setEditUserForm(prev => ({ ...prev, full_name: toTurkishTitleCase(prev.full_name) }));
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Üniversite</Label>
                <Input
                  value={editUserForm.university}
                  onChange={e => setEditUserForm({...editUserForm, university: e.target.value})}
                  onBlur={() => {
                    if (editUserForm.university.trim()) {
                      setEditUserForm(prev => ({ ...prev, university: normalizeUniversityName(prev.university) }));
                    }
                  }}
                  list="admin-popular-universities-list"
                />
                <datalist id="admin-popular-universities-list">
                  {POPULAR_UNIVERSITIES.map((uni) => (
                    <option key={uni} value={uni} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Bölüm</Label>
                <Input
                  value={editUserForm.department}
                  onChange={e => setEditUserForm({...editUserForm, department: e.target.value})}
                  onBlur={() => {
                    if (editUserForm.department.trim()) {
                      setEditUserForm(prev => ({ ...prev, department: toTurkishTitleCase(prev.department) }));
                    }
                  }}
                />
              </div>
              <div className="space-y-2"><Label>Sınıf</Label>
                <Select value={String(editUserForm.grade)} onValueChange={v => setEditUserForm({...editUserForm, grade: parseInt(v)})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[90]">
                    <SelectItem value="1">1. Sınıf</SelectItem>
                    <SelectItem value="2">2. Sınıf</SelectItem>
                    <SelectItem value="3">3. Sınıf</SelectItem>
                    <SelectItem value="4">4. Sınıf</SelectItem>
                    <SelectItem value="5">Mezun</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Özel not indirme kotası</Label>
                <Select value={editUserForm.download_quota || 'auto'} onValueChange={(value) => setEditUserForm({...editUserForm, download_quota: value === 'auto' ? '' : value})}>
                  <SelectTrigger><SelectValue placeholder="Otomatik hesapla" /></SelectTrigger>
                  <SelectContent className="z-[90]">
                    <SelectItem value="auto">Otomatik hesapla</SelectItem>
                    {Array.from({ length: 9 }, (_, index) => String(index + 1)).map((quota) => (
                      <SelectItem key={quota} value={quota}>{quota} indirme hakkı</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Seçilen değer, kullanıcının toplam indirme hakkını belirler.</p>
              </div>
              <Button type="button" className="w-full" disabled={savingUser} onClick={updateUserProfile}>{savingUser ? 'Kaydediliyor…' : 'Kaydet'}</Button>
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

        <UserLoginHistoryDialog
          open={!!historyModalUserId}
          onOpenChange={(open) => {
            if (!open) setHistoryModalUserId(null);
          }}
          userProfile={historyModalProfile}
          email={historyModalUserId ? userEmails[historyModalUserId] || summariesByUserId[historyModalUserId]?.events?.[0]?.userEmail || '' : ''}
          roleLabel={historyModalUserId ? getRoleLabel(getUserRole(historyModalUserId)) : 'Öğrenci'}
          summary={historyModalUserId ? summariesByUserId[historyModalUserId] : undefined}
        />
      </div>
    <AlertDialog open={!!tempPassword} onOpenChange={(o) => { if (!o) setTempPassword(null); }}>
      <AlertDialogContent className="rounded-2xl max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-primary">
            <KeyRound className="h-5 w-5" /> Geçici Giriş Anahtarı Hazır
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {tempPassword?.name ? <strong>{tempPassword.name}</strong> : null} ({tempPassword?.email}) için üretilen tek kullanımlık geçici giriş şifresi:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center font-mono text-xl font-bold tracking-wider text-primary select-all shadow-inner">
            {tempPassword?.password}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bu şifreyi kullanıcıya iletin. Kullanıcı giriş yaptığında sistem otomatik olarak yeni şifre belirleme ekranına yönlendirecektir.
          </p>
        </div>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <Button
            variant="outline"
            className="rounded-xl font-medium"
            onClick={() => {
              if (tempPassword) {
                const messageText = `Merhaba ${tempPassword.name || ''},\nEconNotes hesabınız için geçici giriş anahtarınız: ${tempPassword.password}\n\nBu şifre ile giriş yaptıktan sonra kendinize ait yeni şifrenizi belirleyebilirsiniz.`;
                void navigator.clipboard?.writeText(messageText);
                toast.success('Kullanıcı mesajı ve anahtar şifre kopyalandı!');
              }
            }}
          >
            <Copy className="mr-1.5 h-4 w-4" /> Mesajı & Şifreyi Kopyala
          </Button>
          <AlertDialogAction className="rounded-xl" onClick={() => setTempPassword(null)}>Tamam</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
      {showFatalPreview && (
        <div className="fixed inset-0 z-[99999] overflow-auto bg-[#1b0307]">
          {/* Admin Floating Controls */}
          <div className="fixed top-4 right-4 z-[100000] flex flex-wrap items-center gap-2 bg-black/85 backdrop-blur-md border border-red-500/60 p-2.5 rounded-xl shadow-2xl">
            <div className="flex items-center gap-2 px-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono text-red-200 font-bold uppercase tracking-wider">
                FATAL ERROR CANLI GÖRÜNÜM (YÖNETİCİ)
              </span>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs font-bold bg-gradient-to-r from-red-600 to-rose-700 hover:opacity-90 text-white"
              onClick={() => {
                saveClosureSettings({ close: true });
                setShowFatalPreview(false);
              }}
            >
              <Power className="h-3.5 w-3.5 mr-1" />
              Sistemi Kapat & Bu Ekranı Yayınla
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/30"
              onClick={() => setShowFatalPreview(false)}
            >
              ← Yönetim Paneline Dön
            </Button>
          </div>

          <FatalErrorScreen
            errorCode="ECON-FATAL-500"
            application="ECONNOTES-WEB"
            status="SERVICE_UNAVAILABLE"
            request="ACCESS_BLOCKED_FOR_MAINTENANCE"
            title={closureTitle || '500 — Sunucu Hatası'}
            message={
              closureMessage ||
              'EconNotes şu anda beklenmeyen bir sunucu hatası nedeniyle kullanılamıyor. Teknik ekip bilgilendirildi ve hizmetin yeniden başlatılması için çalışmalar sürdürülüyor.'
            }
            onGoHome={() => setShowFatalPreview(false)}
            onReload={() => window.location.reload()}
          />
        </div>
      )}
      <AdminNotePreviewDialog
        note={previewNote}
        open={Boolean(previewNote)}
        onOpenChange={(open) => {
          if (!open) setPreviewNote(null);
        }}
        onApprove={approveNote}
        onRequestRevision={requestNoteRevision}
        onReject={rejectNote}
        notePassword={previewNote ? notePasswords[previewNote.id] : undefined}
        onRevealPassword={revealNotePassword}
      />
      </Layout>
  );
};

export default AdminPanel;
