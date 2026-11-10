import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import EconLogo from '@/components/EconLogo';
import { APP_VERSION_LABEL } from '@/lib/version';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Clock,
  ShieldCheck,
  RotateCw,
  LogOut,
  HelpCircle,
  Building,
  GraduationCap,
  BookOpen,
  Mail,
  User,
  Calendar,
  Sparkles,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export const WaitingRoomScreen: React.FC = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  const isRejected = profile?.approval_status === 'rejected';

  const handleRefreshStatus = async () => {
    setChecking(true);
    try {
      await refreshProfile();
      toast.info('Başvuru durumunuz kontrol edildi.');
    } catch {
      toast.error('Durum kontrol edilemedi. Lütfen tekrar deneyin.');
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const fullName = profile?.full_name || user?.user_metadata?.full_name || 'Değerli Öğrencimiz';
  const email = user?.email || '—';
  const university = profile?.university || user?.user_metadata?.university || '—';
  const department = profile?.department || user?.user_metadata?.department || '—';
  const grade = profile?.grade || user?.user_metadata?.grade || 1;
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleString('tr-TR')
    : new Date().toLocaleDateString('tr-TR');

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-card/40 to-background flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      {/* Top Bar */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between pb-4 border-b border-border/40">
        <EconLogo className="h-8 w-36 sm:h-9 sm:w-40" />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="rounded-xl h-9 px-3 text-xs gap-1.5"
            title="Temayı Değiştir"
          >
            <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="hidden sm:inline">{theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="rounded-xl h-9 px-3 text-xs gap-1.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Çıkış Yap</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-3xl mx-auto my-auto py-6 sm:py-8 space-y-6">
        {/* Status Card */}
        <Card className={`glass-card border-2 shadow-2xl backdrop-blur-xl ${
          isRejected
            ? 'border-destructive/40 bg-gradient-to-b from-card/95 via-destructive/[0.04] to-card/95'
            : 'border-amber-500/40 bg-gradient-to-b from-card/95 via-amber-500/[0.04] to-card/95'
        }`}>
          <CardContent className="p-6 sm:p-8 space-y-6 text-center">
            {/* Status Icon */}
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border shadow-xl ${
              isRejected
                ? 'border-destructive/40 bg-destructive/15 text-destructive shadow-destructive/20'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-500 shadow-amber-500/20'
            }`}>
              {isRejected ? (
                <XCircle className="h-10 w-10 animate-pulse" />
              ) : (
                <Clock className="h-10 w-10 animate-pulse" />
              )}
            </div>

            {/* Badge & Title */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold shadow-xs border">
                {isRejected ? (
                  <Badge variant="destructive" className="rounded-full px-3 py-0.5 gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Başvuru Onaylanmadı</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-3 py-0.5 gap-1">
                    <Sparkles className="h-3 w-3 animate-spin" />
                    <span>Bekleme Odası • Yönetici Onayı Bekleniyor</span>
                  </Badge>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
                {isRejected
                  ? 'Kayıt Başvurunuz Onaylanmadı'
                  : `Hoş Geldiniz, ${fullName}`}
              </h1>

              {/* Bilgilendirme Duyurusu */}
              <div className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto space-y-2">
                {isRejected ? (
                  <p>
                    Kayıt başvurunuz EconNotes yönetici ekibi tarafından incelenmiş olup şu an için onaylanamamıştır.
                    Eksik veya hatalı bilgi olduğunu düşünüyorsanız lütfen <strong>Destek Merkezi</strong> üzerinden bizimle iletişime geçin.
                  </p>
                ) : (
                  <>
                    <p>
                      EconNotes topluluğuna katılım başvurunuz başarıyla alınmıştır. Platformumuzdaki akademik kalitenin,
                      ders notlarının güvenilirliğinin ve telif haklarının korunması amacıyla tüm yeni kayıtlar <strong>yönetici ekibimiz tarafından bizzat incelenmekte ve onaylanmaktadır.</strong>
                    </p>
                    <p className="text-xs sm:text-sm text-foreground/80 font-medium bg-muted/30 rounded-xl p-3 border border-border/50">
                      🔔 Yönetici ekibimiz bilgilerinizi onayladığı anda EconNotes'un tüm özelliklerine (ders notları, akademik asistan, çalışma stüdyosu, KPSS merkezi vb.) erişiminiz otomatik olarak açılacaktır.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* User Submitted Information Box */}
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-5 text-left space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Kayıt Bilgileriniz
                </span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {createdAt}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/40">
                  <User className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Ad Soyad</p>
                    <p className="font-semibold text-foreground truncate">{fullName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/40">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">E-posta</p>
                    <p className="font-semibold text-foreground truncate">{email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/40">
                  <Building className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Üniversite</p>
                    <p className="font-semibold text-foreground truncate">{university}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border/40">
                  <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium">Bölüm & Sınıf</p>
                    <p className="font-semibold text-foreground truncate">{department} • {grade}. Sınıf</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                onClick={handleRefreshStatus}
                disabled={checking}
                className="w-full sm:w-auto rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shadow-lg shadow-amber-500/20 gap-2 h-11 px-6"
              >
                <RotateCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                <span>{checking ? 'Kontrol Ediliyor…' : 'Onay Durumunu Yenile'}</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate('/support')}
                className="w-full sm:w-auto rounded-xl gap-2 h-11 px-5"
              >
                <HelpCircle className="h-4 w-4 text-primary" />
                <span>Destek Merkezi</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-border/40 text-xs text-muted-foreground text-center sm:text-left">
        <p>EconNotes — Üniversite Öğrencileri Akademik Platformu</p>
        <span className="font-mono text-[11px] text-muted-foreground/70">{APP_VERSION_LABEL}</span>
      </footer>
    </div>
  );
};

export default WaitingRoomScreen;
