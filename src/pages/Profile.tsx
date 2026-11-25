import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { User, Mail, Building, GraduationCap, Calendar, Camera, Trash2, Lock, ShieldAlert, Cake, Compass, RotateCcw, Play, CheckCircle2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import BadgesCard from '@/components/BadgesCard';
import { TwoFactorCard } from '@/components/TwoFactor';
import { Switch } from '@/components/ui/switch';
import { getBirthdayStatus, getUserBirthDate, saveUserBirthDate } from '@/lib/birthdayPerk';
import { openBirthdayCelebrationModal } from '@/components/BirthdayCelebrationPopup';

const Profile = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const {
    state: onboardingState,
    totalSteps,
    canResumeTour,
    startTour,
    resumeTour,
    resetTips,
  } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (location.hash === '#ayarlar') {
      const target = document.getElementById('ayarlar');
      if (target) {
        window.setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    }
  }, [location.hash]);
  const currentBirthDate = getUserBirthDate(user, profile) || '';
  const birthdayStatus = getBirthdayStatus(user, profile);
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    university: profile?.university || '',
    department: profile?.department || '',
    birth_date: currentBirthDate,
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'verify' | 'sent'>('idle');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const hideSurname = (profile as any)?.hide_surname !== false;
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  /** Liderlik tablosunda soyadının sansürlenip sansürlenmeyeceğini belirler. */
  const toggleHideSurname = async (value: boolean) => {
    setSavingPrivacy(true);
    const { error } = await supabase.from('profiles').update({ hide_surname: value } as any).eq('user_id', user!.id);
    setSavingPrivacy(false);
    if (error) { toast.error('Tercih kaydedilemedi.'); return; }
    toast.success(value ? 'Soyadın artık listelerde sansürlü görünecek.' : 'Soyadın listelerde tam görünecek.');
    window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
    refreshProfile();
  };

  const handleUpdate = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        university: form.university,
        department: form.department,
      })
      .eq('user_id', user!.id);
    if (error) { toast.error('Güncellenemedi.'); return; }
    if (form.birth_date && !currentBirthDate) {
      const bdayRes = await saveUserBirthDate(user!, form.birth_date);
      if (!bdayRes.ok) {
        toast.error(bdayRes.error || 'Doğum tarihi kaydedilemedi.');
        return;
      }
    }
    const { logActivity } = await import('@/lib/activityLogger');
    await logActivity(user!.id, form.full_name, user!.email || '', 'profile_updated', 'Profil bilgileri güncellendi');
    toast.success('Profil güncellendi!');
    setEditing(false);
    refreshProfile();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { validateUploadFile, buildSafeStoragePath } = await import('@/lib/fileSecurity');
    const validation = await validateUploadFile(file, 'avatar');
    if (!validation.ok || !validation.safeExtension) {
      toast.error(validation.error || 'Geçersiz görsel dosyası.');
      return;
    }
    const path = buildSafeStoragePath(user!.id, validation.safeExtension);
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: validation.normalizedMime });
    if (error) { toast.error('Yüklenemedi.'); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('user_id', user!.id);
    const { logActivity } = await import('@/lib/activityLogger');
    await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'avatar_updated', 'Profil fotoğrafı güncellendi');
    toast.success('Profil fotoğrafı güncellendi!');
    refreshProfile();
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPass !== passwordForm.confirm) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }
    const { validateStrongPassword } = await import('@/lib/fileSecurity');
    const pwErr = validateStrongPassword(passwordForm.newPass);
    if (pwErr) {
      toast.error(pwErr);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
    if (error) { toast.error('Şifre değiştirilemedi: ' + error.message); return; }
    const { logActivity } = await import('@/lib/activityLogger');
    await logActivity(user!.id, profile?.full_name || '', user!.email || '', 'password_changed', 'Hesap şifresi değiştirildi');
    toast.success('Şifre başarıyla değiştirildi!');
    setShowPasswordChange(false);
    setPasswordForm({ current: '', newPass: '', confirm: '' });
  };

  const [sendingCode, setSendingCode] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSendDeleteVerification = async () => {
    setSendingCode(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: user!.email!,
      options: { shouldCreateUser: false },
    });
    setSendingCode(false);
    if (error) {
      toast.error('Doğrulama kodu gönderilemedi: ' + error.message);
      return;
    }
    setDeleteStep('sent');
    toast.success('6 haneli doğrulama kodu e-posta adresinize gönderildi.');
  };

  const handleDeleteAccount = async () => {
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      toast.error('Lütfen e-postanıza gelen 6 haneli kodu girin.');
      return;
    }
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('delete-my-account', {
      body: { code: verificationCode.trim() },
    });
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || 'Hesap silinemedi. Kodu kontrol edip tekrar deneyin.');
      return;
    }
    await supabase.auth.signOut();
    toast.success('Hesabınız kalıcı olarak silindi.');
    navigate('/login');
  };


  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-5 animate-fade-in">
        <PageHeader
          title="Profilim & Ayarlar"
          description="Hesap bilgilerinizi, güvenlik tercihlerinizi, rozetlerinizi ve gizlilik ayarlarınızı yönetin."
          icon={User}
        />

        <Card className="glass-card">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-6 flex flex-col items-center gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative">
                  <Avatar className="h-20 w-20 ring-4 ring-primary/10">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="text-2xl font-bold gradient-primary text-white">
                      {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-primary text-white shadow-sm transition-transform hover:scale-105">
                    <Camera className="h-3.5 w-3.5" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                </div>
                <div className="text-center sm:text-left">
                  <h2 className="text-xl font-extrabold tracking-tight text-foreground">{profile?.full_name || 'Kullanıcı'}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">{user?.email || 'Öğrenci Hesabı'}</p>
                  {profile?.university && (
                    <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      <GraduationCap className="h-3 w-3" />
                      <span>{profile.university}</span>
                    </p>
                  )}
                </div>
              </div>
              {!editing && (
                <Button
                  variant="cta"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setForm({
                      full_name: profile?.full_name || '',
                      university: profile?.university || '',
                      department: profile?.department || '',
                      birth_date: currentBirthDate,
                    });
                    setEditing(true);
                  }}
                >
                  Profili Düzenle
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {editing ? (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Ad Soyad</Label><Input value={form.full_name} onChange={(e) => setForm({...form, full_name: e.target.value})} /></div>
                  <div className="space-y-1.5"><Label>Üniversite</Label><Input value={form.university} onChange={(e) => setForm({...form, university: e.target.value})} /></div>
                  <div className="space-y-1.5"><Label>Bölüm</Label><Input value={form.department} onChange={(e) => setForm({...form, department: e.target.value})} /></div>
                  <div className="space-y-1.5">
                    <Label>Doğum Tarihi (Doğum günü hediyesi)</Label>
                    <Input
                      type="date"
                      value={form.birth_date}
                      onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 sm:col-span-2">
                    <Button variant="cta" onClick={handleUpdate}>Kaydet</Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>İptal</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">E-posta</p>
                        <p className="truncate text-sm font-semibold text-foreground">{user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">Ad Soyad</p>
                        <p className="truncate text-sm font-semibold text-foreground">{profile?.full_name || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <Building className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">Üniversite</p>
                        <p className="truncate text-sm font-semibold text-foreground">{profile?.university || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <GraduationCap className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">Bölüm & Sınıf</p>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {profile?.department || '-'}
                          {profile?.grade ? ` • ${profile.grade === 5 ? 'Mezun' : `${profile.grade}. Sınıf`}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <Calendar className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">Kayıt Tarihi</p>
                        <p className="truncate text-sm font-semibold text-foreground">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('tr-TR') : '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <Calendar className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">Son Giriş</p>
                        <p className="truncate text-sm font-semibold text-foreground">{profile?.last_login ? new Date(profile.last_login).toLocaleString('tr-TR') : '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                        <Cake className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground">Doğum Tarihi</p>
                        <p className="text-sm font-semibold text-foreground">
                          {currentBirthDate
                            ? new Date(currentBirthDate).toLocaleDateString('tr-TR')
                            : 'Henüz eklenmedi (Doğum günü hediyesi için ekleyin)'}
                        </p>
                      </div>
                    </div>
                    {birthdayStatus.isUnlimitedActive && (
                      <button
                        type="button"
                        onClick={openBirthdayCelebrationModal}
                        className="w-fit rounded-full bg-primary/10 border border-primary/30 px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/15 transition-colors"
                      >
                        Doğum Günü Hediyen Aktif · Kutlamayı Gör
                      </button>
                    )}
                  </div>

                  <div
                    id="ayarlar"
                    className="scroll-mt-24 flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-muted/40 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Soyadımı listelerde gizle</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        Açık olduğunda liderlik tablosunda adın &quot;{(profile?.full_name || 'Kaan Çolakoğulları').split(' ')[0]} {(profile?.full_name || 'Kaan Çolakoğulları').split(' ')[1]?.charAt(0).toUpperCase() || 'Ç'}...&quot; biçiminde görünür.
                      </p>
                    </div>
                    <Switch checked={hideSurname} disabled={savingPrivacy} onCheckedChange={toggleHideSurname} />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="profile-platform-tour-card">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3.5 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2a6e] to-[#2563eb] text-white shadow-sm">
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold tracking-tight text-foreground">Platformu Tanı</h3>
                  {onboardingState.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Tur Tamamlandı
                    </span>
                  ) : canResumeTour ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                      Adım {onboardingState.currentStep + 1}/{totalSteps} kaydedildi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground dark:border-slate-700">
                      Rehberli Tur ({totalSteps} Adım)
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Ana Sayfa, Notlar, Çalışma Stüdyosu, Günlük Bilgi Yarışması ve hesap araçlarını gerçek arayüz üzerinde adım adım keşfet.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canResumeTour && (
                <Button
                  type="button"
                  onClick={resumeTour}
                  className="h-10 rounded-full bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb] px-5 text-xs font-semibold text-white hover:brightness-105"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Devam Et (Adım {onboardingState.currentStep + 1}/{totalSteps})</span>
                </Button>
              )}
              <Button
                type="button"
                variant={canResumeTour ? 'outline' : 'cta'}
                onClick={() => startTour({ fromBeginning: true })}
                className="h-10 rounded-full px-5 text-xs font-semibold"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>{onboardingState.status === 'completed' || canResumeTour ? 'Turu Baştan Başlat' : 'Platformu Tanı'}</span>
              </Button>
              {onboardingState.dismissedTips.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    resetTips();
                    toast.success('Sayfa içi ipuçları yeniden etkinleştirildi.');
                  }}
                  className="h-10 rounded-full px-3.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>İpuçlarını Sıfırla</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <TwoFactorCard />

        <BadgesCard />

        {/* Password Change */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Lock className="h-5 w-5" /> Şifre Değiştir</CardTitle>
          </CardHeader>
          <CardContent>
            {showPasswordChange ? (
              <div className="space-y-3">
                <div><Label>Yeni Şifre</Label><Input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm({...passwordForm, newPass: e.target.value})} /></div>
                <div><Label>Yeni Şifre Tekrar</Label><Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})} /></div>
                <div className="flex gap-2">
                  <Button onClick={handlePasswordChange}>Şifreyi Değiştir</Button>
                  <Button variant="outline" onClick={() => setShowPasswordChange(false)}>İptal</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowPasswordChange(true)}>Şifre Değiştir</Button>
            )}
          </CardContent>
        </Card>

        {/* Delete Account */}
        <Card className="glass-card border-destructive/20">
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2"><Trash2 className="h-5 w-5" /> Hesabı Sil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Hesabınızı silmek için e-posta adresinize gönderilen 6 haneli doğrulama kodunu girmeniz gerekir. Silme işlemi tüm verilerinizi kalıcı olarak kaldırır.</p>
            <Button variant="destructive" onClick={() => { setDeleteDialogOpen(true); setDeleteStep('verify'); setVerificationCode(''); }}>
              Hesabımı Sil
            </Button>
          </CardContent>
        </Card>

        <Dialog open={deleteDialogOpen} onOpenChange={(v) => { setDeleteDialogOpen(v); if (!v) { setDeleteStep('idle'); setVerificationCode(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" /> Hesap Silme Doğrulaması
              </DialogTitle>
            </DialogHeader>
            {deleteStep === 'verify' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <strong>{user?.email}</strong> adresine 6 haneli bir doğrulama kodu göndereceğiz. Kodu girmeden hesabınız silinmez.
                </p>
                <Button onClick={handleSendDeleteVerification} className="w-full" disabled={sendingCode}>
                  {sendingCode ? 'Gönderiliyor...' : 'Doğrulama Kodu Gönder'}
                </Button>
              </div>
            )}
            {deleteStep === 'sent' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <strong>{user?.email}</strong> adresine gönderilen 6 haneli kodu girin. Kod kısa süre içinde geçerliliğini yitirir.
                </p>
                <div>
                  <Label>Doğrulama Kodu</Label>
                  <Input
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="tracking-[0.5em] text-center text-lg font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleSendDeleteVerification} disabled={sendingCode}>
                    Kodu Tekrar Gönder
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="flex-1" disabled={verificationCode.length !== 6 || deleting}>
                        {deleting ? 'Siliniyor...' : 'Hesabımı Sil'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Son onay - Hesabınız kalıcı olarak silinecek.</AlertDialogTitle>
                        <AlertDialogDescription>Bu işlem geri alınamaz. Tüm verileriniz, notlarınız, puanlarınız ve mesajlarınız silinecektir.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>İptal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteAccount}>Evet, Hesabımı Sil</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}

          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Profile;
