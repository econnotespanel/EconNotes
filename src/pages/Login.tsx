import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable, formatSocialAuthError } from '@/integrations/lovable';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertTriangle,
  Download,
  ShieldCheck,
  Megaphone,
  X,
  Sparkles,
  Ban,
  Clock,
  CheckCircle,
  Info,
  ArrowLeft,
  Sun,
  Moon,
  BookOpen,
  Users,
  TrendingUp,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_VERSION_LABEL as APP_VERSION } from '@/lib/version';
import SecurityCaptcha from '@/components/SecurityCaptcha';
import { getReturningAccountName, rememberReturningAccount } from '@/lib/returningAccount';
import { AmbientShaderBackground } from '@/components/landing/AmbientShaderBackground';

const Login = () => {
  const AUXILIARY_REQUEST_TIMEOUT = 5000;
  const [email, setEmail] = useState('');
  const [returningName, setReturningName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [penaltyInfo, setPenaltyInfo] = useState<{
    reason: string;
    until: string | null;
    is_permanent: boolean;
    warning_number?: number;
    created_at?: string;
    expired?: boolean;
    evicted?: boolean;
  } | null>(null);
  const [remainingTimeStr, setRemainingTimeStr] = useState<string>('');
  const [penaltyCountdown, setPenaltyCountdown] = useState(0);
  const [loginBanners, setLoginBanners] = useState<any[]>([]);
  const [dismissedLoginBanners, setDismissedLoginBanners] = useState<Set<string>>(new Set());
  const [expandedLoginBanners, setExpandedLoginBanners] = useState<Set<string>>(new Set());
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user: currentUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (currentUser && !authLoading && !loading && !oauthLoading && !penaltyInfo) {
      navigate('/', { replace: true });
    }
  }, [currentUser, authLoading, loading, oauthLoading, penaltyInfo, navigate]);

  // Load evicted penalty notification from session if user was just kicked out
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('econnotes_active_penalty');
      if (stored) {
        const parsed = JSON.parse(stored);
        setPenaltyInfo(parsed);
        sessionStorage.removeItem('econnotes_active_penalty');
      }
    } catch (e) {
      console.warn('Penalty parse error:', e);
    }
  }, []);

  // Real-time live countdown timer for penalty
  useEffect(() => {
    if (!penaltyInfo || penaltyInfo.is_permanent || !penaltyInfo.until || penaltyInfo.expired) {
      setRemainingTimeStr('');
      return;
    }

    const updateTimer = () => {
      const targetTime = new Date(penaltyInfo.until!).getTime();
      const diff = targetTime - Date.now();
      if (diff <= 0) {
        setRemainingTimeStr('Süre doldu');
        setPenaltyInfo((prev) => (prev ? { ...prev, expired: true } : null));
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days} gün`);
      if (hours > 0 || days > 0) parts.push(`${hours} saat`);
      if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes} dk`);
      parts.push(`${seconds} sn`);
      setRemainingTimeStr(parts.join(' ') + ' kaldı');
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [penaltyInfo?.until, penaltyInfo?.is_permanent, penaltyInfo?.expired]);

  useEffect(() => {
    let cancelled = false;
    setReturningName(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;

    const timer = window.setTimeout(() => {
      void getReturningAccountName(email).then((name) => {
        if (!cancelled) setReturningName(name);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email]);

  useEffect(() => {
    const fetchBanners = async () => {
      const { data } = await supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setLoginBanners(data || []);
    };
    fetchBanners();
  }, []);

  // Penalty countdown timer
  useEffect(() => {
    if (penaltyCountdown > 0) {
      const timer = setTimeout(() => setPenaltyCountdown(penaltyCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (penaltyCountdown === 0 && penaltyInfo?.expired) {
      const profileFetch = async () => {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', session.session.user.id)
            .single();
          const fullName =
            profileData?.full_name || session.session.user.user_metadata?.full_name || '';
          toast.success(`Giriş Başarılı! Hoş Geldiniz, ${fullName}`, {
            style: { background: 'hsl(142, 76%, 36%)', color: 'white', border: 'none' },
          });
          navigate('/');
        }
      };
      profileFetch();
    }
  }, [penaltyCountdown, penaltyInfo, navigate]);

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    if (oauthLoading || loading) return;
    const label = provider === 'google' ? 'Google' : 'Apple';
    setOauthLoading(provider);
    setPenaltyInfo(null);

    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });

    if (result?.redirected) {
      return;
    }

    setOauthLoading(null);

    if (result?.error) {
      const formatted = formatSocialAuthError(label, result.error.message);
      if (formatted.level === 'info') {
        toast.info(formatted.title, { description: formatted.description, duration: 5000 });
      } else {
        toast.error(formatted.title, { description: formatted.description, duration: 6000 });
      }
      return;
    }

    let welcomePending = false;
    try {
      welcomePending = localStorage.getItem('econnotes_welcome_pending') === '1';
      if (welcomePending) localStorage.removeItem('econnotes_welcome_pending');
    } catch {}
    toast.success(`${label} ile giriş başarılı! Hoş Geldiniz`, {
      style: { background: 'hsl(142, 76%, 36%)', color: 'white', border: 'none' },
    });
    navigate(welcomePending ? '/welcome' : '/');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 11) return 'Günaydın! ☀️';
    if (hour >= 12 && hour <= 16) return 'İyi Günler! ☀️';
    if (hour >= 17 && hour <= 20) return 'İyi Akşamlar! 🌆';
    return 'İyi Geceler! 🌙';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;
    if (!cleanEmail || !cleanPassword) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }
    if (!captchaOk) {
      toast.error('Lütfen güvenlik kodunu doğru şekilde girin.');
      setCaptchaReset((v) => v + 1);
      return;
    }
    setLoading(true);
    setPenaltyInfo(null);

    let data;
    let error;
    try {
      ({ data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword }),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('Giriş sunucusu zaman aşımına uğradı.')),
            30000
          );
        }),
      ]));
    } catch (requestError) {
      console.error('Giriş isteği başarısız:', requestError);
      setLoading(false);
      setCaptchaReset((v) => v + 1);
      toast.error(
        'Giriş sunucusuna veya veritabanına ulaşılamadı. Lütfen sunucu durumunu kontrol edip tekrar deneyin.'
      );
      return;
    }

    if (error) {
      setLoading(false);
      setCaptchaReset((v) => v + 1);
      const rawMsg = (error.message || '').toLowerCase();
      const status = (error as any).status;
      if (rawMsg.includes('email not confirmed')) {
        toast.error(
          'E-posta adresinizi doğrulamanız gerekmektedir. Lütfen mail kutunuzu ve spam klasörünüzü kontrol edin.'
        );
      } else if (
        rawMsg.includes('failed to fetch') ||
        rawMsg.includes('network') ||
        rawMsg.includes('timeout') ||
        rawMsg.includes('zaman aşımı') ||
        rawMsg.includes('abort') ||
        rawMsg.includes('load failed') ||
        status === 504 ||
        status === 503 ||
        status === 502
      ) {
        toast.error(
          'Giriş sunucusuna veya veritabanına ulaşılamadı. Sunucu yanıt vermiyor, lütfen birazdan tekrar deneyin.'
        );
      } else if (
        rawMsg.includes('invalid login credentials') ||
        rawMsg.includes('invalid_grant')
      ) {
        const isGmail = cleanEmail.endsWith('@gmail.com');
        toast.error('Giriş başarısız. E-posta veya şifre hatalı.', {
          description: isGmail
            ? 'Google ile kayıt olduysanız lütfen aşağıdaki Google butonunu kullanın.'
            : 'Şifrenizi unuttuysanız "Şifremi Unuttum" bağlantısından sıfırlayabilirsiniz.',
          duration: 6000,
        });
      } else if (rawMsg.includes('too many') || rawMsg.includes('rate limit')) {
        toast.error(
          'Çok fazla başarısız deneme yapıldı. Güvenlik nedeniyle lütfen birkaç dakika bekleyin.'
        );
      } else if (
        rawMsg.includes('database error') ||
        rawMsg.includes('schema') ||
        rawMsg.includes('unexpected_failure')
      ) {
        toast.error('Giriş sunucusu geçici olarak yanıt veremedi.', {
          description: 'Lütfen birkaç saniye sonra bilgilerinizi tekrar girerek giriş yapın.',
          duration: 6000,
        });
      } else {
        toast.error('Giriş başarısız: ' + error.message);
      }
      return;
    }

    if (data.user) {
      let penalties: any[] | null = null;
      try {
        const penaltyResult = await Promise.race([
          supabase
            .from('penalties')
            .select('*')
            .eq('user_id', data.user.id)
            .order('created_at', { ascending: false })
            .limit(1),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error('Ceza kontrolü zaman aşımına uğradı.')),
              AUXILIARY_REQUEST_TIMEOUT
            );
          }),
        ]);
        penalties = penaltyResult.data;
      } catch (requestError) {
        console.warn('Ceza kontrolü atlandı:', requestError);
      }

      if (penalties && penalties.length > 0) {
        const latest = penalties[0];
        const now = new Date();
        const isPermanent = latest.is_permanent;
        const penaltyUntil = latest.penalty_until ? new Date(latest.penalty_until) : null;

        if (isPermanent || (penaltyUntil && penaltyUntil > now)) {
          await supabase.auth.signOut();
          setPenaltyInfo({
            reason: latest.reason || 'Topluluk kurallarına aykırı işlem',
            until: latest.penalty_until,
            is_permanent: isPermanent,
            warning_number: latest.warning_number || 1,
            created_at: latest.created_at,
          });
          setLoading(false);
          return;
        }

        if (penaltyUntil && penaltyUntil <= now && !isPermanent) {
          const warnedKey = `penalty_warned_${latest.id}`;
          const alreadyWarned = localStorage.getItem(warnedKey);
          if (!alreadyWarned) {
            localStorage.setItem(warnedKey, 'true');
            setPenaltyInfo({
              reason: latest.reason,
              until: latest.penalty_until,
              is_permanent: false,
              expired: true,
            });
            setPenaltyCountdown(5);
            setLoading(false);
            return;
          }
        }
      }
    }

    let fullName =
      data.user!.user_metadata?.full_name || data.user!.user_metadata?.name || '';
    try {
      const profileResult = await Promise.race([
        supabase.from('profiles').select('full_name').eq('user_id', data.user!.id).single(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('Profil sorgusu zaman aşımına uğradı.')),
            AUXILIARY_REQUEST_TIMEOUT
          );
        }),
      ]);
      fullName = profileResult.data?.full_name || fullName;
    } catch (requestError) {
      console.warn('Profil adı yüklenemedi, metadata adı kullanılacak:', requestError);
    }
    await rememberReturningAccount(data.user!.email || email, fullName);

    setLoading(false);
    toast.success(`Giriş Başarılı! Hoş Geldiniz, ${fullName}`, {
      style: { background: 'hsl(142, 76%, 36%)', color: 'white', border: 'none' },
    });

    let welcomePending = false;
    try {
      welcomePending = localStorage.getItem('econnotes_welcome_pending') === '1';
      if (welcomePending) localStorage.removeItem('econnotes_welcome_pending');
    } catch {}
    navigate(welcomePending ? '/welcome' : '/');
  };

  // Show penalty expired countdown screen
  if (penaltyInfo?.expired && penaltyCountdown > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4 animate-fade-in">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-warning/10">
              <AlertTriangle className="h-12 w-12 text-warning" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-foreground">Uzaklaştırma Cezan Sona Erdi</h2>
          <p className="text-sm text-muted-foreground">
            EconNotes kurallarına daha dikkatli olmayı unutma! Tekrar hoş geldin.
          </p>
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-primary flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{penaltyCountdown}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Platforma yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  const features = [
    { icon: BookOpen, title: 'Not Paylaşımı', desc: 'Ders notlarınızı arkadaşlarınızla kolayca paylaşın.' },
    { icon: Users, title: 'Topluluk', desc: 'Üniversite öğrencileriyle bilgi paylaşın.' },
    { icon: TrendingUp, title: 'Başarı', desc: 'Sınavlara hazırlanın, başarıya ulaşın.' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-x-clip bg-background text-foreground antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Left panel - Classic PlayStation-blue platform features (desktop) */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14 relative overflow-hidden z-10"
        style={{
          background:
            theme === 'dark'
              ? 'linear-gradient(145deg, #070b14 0%, #001f5c 50%, #003791 100%)'
              : 'linear-gradient(145deg, #001845 0%, #002d7a 45%, #00439c 100%)',
        }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <EconLogo allWhite className="h-8 w-36 sm:h-9 sm:w-40" />
          </div>

          <h2 className="text-white text-xl xl:text-2xl font-bold tracking-tight mb-8 leading-snug">
            EconNotes ile tüm ders notların yanında!
          </h2>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">
              Platform Özellikleri
            </p>
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 transition-all duration-300 hover:bg-white/15 hover:border-white/25 hover:translate-x-1 shadow-sm"
              >
                <div className="p-2.5 rounded-xl bg-white/10 text-white shadow-xs shrink-0">
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white text-sm">{f.title}</h3>
                  <p className="text-xs text-white/70 leading-relaxed mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between pt-6 border-t border-white/10">
          <p className="text-white/60 text-xs">
            EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
          <span className="text-white/40 text-xs font-mono">{APP_VERSION}</span>
        </div>

        {/* Decorative ambient lighting */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#00f0ff]/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#003791]/35 blur-3xl pointer-events-none" />
      </div>

      {/* Right panel - Frosted Glass Login Console */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-screen lg:min-h-0 overflow-hidden">
        {/* Ambient Background */}
        <AmbientShaderBackground intensity={0.9} />

        {/* Top Navigation Row */}
        <div className="relative z-20 w-full max-w-md flex items-center justify-between mb-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Ana Sayfa</span>
          </Link>

          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/60 border border-border/70 dark:border-white/15 backdrop-blur-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-all shadow-sm"
            aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-300" />
                <span>Açık Mod</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-blue-600" />
                <span>Koyu Mod</span>
              </>
            )}
          </button>
        </div>

        {/* Centered Mobile EconNotes Logo */}
        <div className="lg:hidden relative z-20 flex justify-center mb-6">
          <EconLogo className="h-8 w-36 sm:h-9 sm:w-40" />
        </div>

      {/* Frosted Glass Login Card */}
      <div className="relative z-20 w-full max-w-md rounded-3xl border border-border/70 dark:border-white/15 bg-card/85 dark:bg-black/50 p-6 sm:p-8 backdrop-blur-3xl shadow-[0_20px_70px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_70px_rgba(0,0,0,0.35)] space-y-5">
        {/* Announcement Banners */}
        {loginBanners.length > 0 && (
          <div className="space-y-2">
            {loginBanners
              .filter((banner) => !dismissedLoginBanners.has(banner.id))
              .map((banner) => (
                <div
                  key={banner.id}
                  role="status"
                  className="relative isolate flex items-start gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-primary/10 p-3.5 text-xs shadow-sm"
                >
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{banner.title}</p>
                    <p
                      className={`text-muted-foreground leading-relaxed ${
                        expandedLoginBanners.has(banner.id) ? '' : 'line-clamp-2'
                      }`}
                    >
                      {banner.content}
                    </p>
                    {banner.content.length > 100 && (
                      <button
                        type="button"
                        aria-expanded={expandedLoginBanners.has(banner.id)}
                        onClick={() =>
                          setExpandedLoginBanners((prev) => {
                            const next = new Set(prev);
                            if (next.has(banner.id)) next.delete(banner.id);
                            else next.add(banner.id);
                            return next;
                          })
                        }
                        className="mt-1 font-medium text-primary hover:underline"
                      >
                        {expandedLoginBanners.has(banner.id) ? 'Daha az göster' : 'Devamını oku'}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Duyuruyu kapat"
                    onClick={() =>
                      setDismissedLoginBanners((prev) => new Set(prev).add(banner.id))
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Console Header */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {getGreeting()}
            </h1>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              Güvenli Giriş
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            EconNotes hesabınıza giriş yaparak çalışmalarınıza devam edin.
          </p>
        </div>

        {/* Returning User Greeting */}
        {returningName && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-cyan-500/10 p-3.5 shadow-sm animate-fade-in"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground">
                Tekrar hoş geldin, {returningName}!
              </p>
              <p className="text-xs text-muted-foreground">
                Seni yeniden EconNotes’ta görmek güzel.
              </p>
            </div>
          </div>
        )}

        {/* Penalty / Ban Alert */}
        {penaltyInfo && !penaltyInfo.expired && (
          <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-500/15 via-rose-500/10 to-rose-500/5 p-4 space-y-3 backdrop-blur-md animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-500 shrink-0">
                <Ban className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-rose-500 leading-tight">
                    {penaltyInfo.is_permanent
                      ? 'Hesap Kalıcı Olarak Kapatıldı'
                      : 'Hesap Erişimi Geçici Kısıtlandı'}
                  </h2>
                  {penaltyInfo.warning_number && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      Uyarı #{penaltyInfo.warning_number}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Güvenlik ve topluluk kuralları gereği hesabınıza kısıtlama uygulanmıştır.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-background/60 p-3 space-y-1.5 text-xs">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" /> Ceza Sebebi
              </span>
              <p className="text-foreground font-medium">
                "{penaltyInfo.reason || 'Kurallara uygun olmayan işlem'}"
              </p>
              {penaltyInfo.until && (
                <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground">Ceza Bitiş:</span>
                  <span className="font-semibold text-foreground">
                    {new Date(penaltyInfo.until).toLocaleString('tr-TR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              )}
              {!penaltyInfo.is_permanent && remainingTimeStr && (
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Kalan Süre:
                  </span>
                  <span className="font-bold text-amber-500 font-mono">{remainingTimeStr}</span>
                </div>
              )}
            </div>

            <a
              href={`mailto:destek@econnotes.online?subject=${encodeURIComponent(
                `EconNotes Hesap Cezası İtirazı - ${email || 'Kullanıcı'}`
              )}&body=${encodeURIComponent(
                `Kullanıcı E-posta: ${email}\nCeza Sebebi: ${penaltyInfo.reason}\n\nİtiraz Açıklamam: `
              )}`}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              Cezaya İtiraz Et (destek@econnotes.online)
            </a>
          </div>
        )}

        {penaltyInfo?.expired && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 backdrop-blur-md animate-fade-in">
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
              <CheckCircle className="h-4 w-4" />
              <span>Ceza Süreniz Sona Erdi!</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Kısıtlama kalktı. Bilgilerinizi girerek giriş yapabilirsiniz.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-xl border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 text-xs"
              onClick={() => setPenaltyInfo(null)}
            >
              Giriş Yapmaya Devam Et
            </Button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-foreground/90">
              E-posta
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="ogrenci@ogr.duzce.edu.tr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-11 rounded-2xl bg-card/50 border-border/80 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:border-cyan-400 text-sm transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground/90">
                Şifre
              </Label>
              <Link
                to="/forgot-password"
                className="text-xs text-primary hover:text-cyan-400 hover:underline font-medium transition-colors"
              >
                Şifremi Unuttum
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 h-11 rounded-2xl bg-card/50 border-border/80 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:border-cyan-400 text-sm transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <SecurityCaptcha onVerifiedChange={setCaptchaOk} resetKey={captchaReset} />

          <Button
            type="submit"
            className="relative group w-full h-11 rounded-2xl border-0 bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#00c6ff] text-white font-bold text-sm shadow-[0_0_24px_rgba(0,112,243,0.35)] hover:shadow-[0_0_32px_rgba(0,198,255,0.5)] hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
            disabled={loading || Boolean(oauthLoading)}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Giriş Yapılıyor...</span>
              </div>
            ) : (
              <span>Güvenli Giriş Yap</span>
            )}
          </Button>
        </form>

        {/* Social OAuth Providers */}
        <div className="space-y-3 pt-1">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card/80 px-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                veya
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(oauthLoading) || loading}
              onClick={() => void handleSocialLogin('google')}
              className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border/70 dark:border-white/10 bg-muted/40 dark:bg-white/5 hover:bg-muted/70 dark:hover:bg-white/10 text-xs font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
            >
              <svg width="15" height="15" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09A6.96 6.96 0 0 1 5.46 12c0-.73.13-1.43.36-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
                />
              </svg>
              <span>{oauthLoading === 'google' ? 'Yönlendiriliyor...' : 'Google'}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(oauthLoading) || loading}
              onClick={() => void handleSocialLogin('apple')}
              className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border/70 dark:border-white/10 bg-muted/40 dark:bg-white/5 hover:bg-muted/70 dark:hover:bg-white/10 text-xs font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <span>{oauthLoading === 'apple' ? 'Yönlendiriliyor...' : 'Apple'}</span>
            </button>
          </div>
        </div>

        {/* Registration Link */}
        <div className="pt-1 text-center text-xs text-muted-foreground">
          Henüz hesabınız yok mu?{' '}
          <Link
            to="/register"
            className="font-bold text-primary dark:text-cyan-400 hover:underline transition-colors"
          >
            Ücretsiz Kayıt Olun
          </Link>
        </div>

        {/* Bottom App Download & Help */}
        <div className="pt-3 border-t border-border/50 dark:border-white/10 space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl border-border/70 dark:border-white/15 bg-card/40 hover:bg-muted/50 dark:hover:bg-white/10 text-xs font-semibold"
            onClick={() => navigate('/install')}
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            EconNotes Uygulamasını Yükle
          </Button>
          <p className="text-[11px] text-center text-muted-foreground/80">
            Destek:{' '}
            <a
              href="mailto:destek@econnotes.online"
              className="text-primary dark:text-cyan-400 hover:underline font-medium"
            >
              destek@econnotes.online
            </a>
            {' · '}
            <span className="font-mono opacity-75">{APP_VERSION}</span>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Login;
