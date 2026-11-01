import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { Eye, EyeOff, Mail, Lock, AlertTriangle, Download, BookOpen, Users, TrendingUp, ShieldCheck, Megaphone, X, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_VERSION_LABEL as APP_VERSION } from '@/lib/version';
import SecurityCaptcha from '@/components/SecurityCaptcha';
import { getReturningAccountName, rememberReturningAccount } from '@/lib/returningAccount';

const Login = () => {
  const AUXILIARY_REQUEST_TIMEOUT = 5000;
  const [email, setEmail] = useState('');
  const [returningName, setReturningName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [penaltyInfo, setPenaltyInfo] = useState<{ reason: string; until: string | null; is_permanent: boolean; expired?: boolean } | null>(null);
  const [penaltyCountdown, setPenaltyCountdown] = useState(0);
  const [loginBanners, setLoginBanners] = useState<any[]>([]);
  const [dismissedLoginBanners, setDismissedLoginBanners] = useState<Set<string>>(new Set());
  const [expandedLoginBanners, setExpandedLoginBanners] = useState<Set<string>>(new Set());
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

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
      const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('created_at', { ascending: false });
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
      // Auto-navigate after countdown
      const profileFetch = async () => {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', session.session.user.id)
            .single();
          const fullName = profileData?.full_name || session.session.user.user_metadata?.full_name || '';
          toast.success(`Giriş Başarılı! Hoş Geldiniz, ${fullName}`, {
            style: { background: 'hsl(142, 76%, 36%)', color: 'white', border: 'none' },
          });
          navigate('/');
        }
      };
      if (penaltyInfo?.expired) {
        profileFetch();
      }
    }
  }, [penaltyCountdown, penaltyInfo]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 11) return 'Günaydın! ☀️';
    if (hour >= 12 && hour <= 16) return 'İyi Günler! ☀️';
    if (hour >= 17 && hour <= 20) return 'İyi Akşamlar! 🌆';
    return 'İyi Geceler! 🌙';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
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
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Giriş sunucusu zaman aşımına uğradı.')), 15000);
        }),
      ]));
    } catch (requestError) {
      console.error('Giriş isteği başarısız:', requestError);
      setLoading(false);
      setCaptchaReset((v) => v + 1);
      toast.error('Giriş sunucusuna ulaşılamadı. Lütfen birkaç saniye sonra tekrar deneyin.');
      return;
    }
    
    if (error) {
      setLoading(false);
      setCaptchaReset((v) => v + 1);
      if (error.message?.includes('Email not confirmed')) {
        toast.error('E-posta adresinizi doğrulamanız gerekmektedir. Lütfen mail kutunuzu kontrol edin.');
      } else {
        toast.error('Giriş başarısız. E-posta veya şifre hatalı.');
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
            window.setTimeout(() => reject(new Error('Ceza kontrolü zaman aşımına uğradı.')), AUXILIARY_REQUEST_TIMEOUT);
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
          setPenaltyInfo({ reason: latest.reason, until: latest.penalty_until, is_permanent: latest.is_permanent });
          setLoading(false);
          return;
        }

        if (penaltyUntil && penaltyUntil <= now && !isPermanent) {
          const warnedKey = `penalty_warned_${latest.id}`;
          const alreadyWarned = localStorage.getItem(warnedKey);
          if (!alreadyWarned) {
            localStorage.setItem(warnedKey, 'true');
            setPenaltyInfo({ reason: latest.reason, until: latest.penalty_until, is_permanent: false, expired: true });
            setPenaltyCountdown(5);
            setLoading(false);
            return;
          }
        }
      }
    }

    let fullName = data.user!.user_metadata?.full_name || data.user!.user_metadata?.name || '';
    try {
      const profileResult = await Promise.race([
        supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', data.user!.id)
          .single(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Profil sorgusu zaman aşımına uğradı.')), AUXILIARY_REQUEST_TIMEOUT);
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

    // Yeni kayıt olan kullanıcı ise karşılama turuna yönlendir
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
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {/* Left panel - features */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 relative overflow-hidden" style={{ background: theme === 'dark' ? 'linear-gradient(135deg, hsl(217, 91%, 12%), hsl(221, 83%, 18%), hsl(213, 80%, 22%))' : 'linear-gradient(135deg, hsl(217, 91%, 20%), hsl(221, 83%, 30%), hsl(213, 80%, 35%))' }}>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <EconLogo allWhite className="h-12 w-56" />
          </div>
          <p className="text-white/80 text-lg mb-12">EconNotes ile notların hep yanında!</p>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Platform Özellikleri</h2>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                <div className="p-2 rounded-lg bg-white/10">
                  <f.icon className="h-6 w-6 text-white/90" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{f.title}</h3>
                  <p className="text-sm text-white/70">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <p className="text-white/50 text-sm">EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
          <span className="text-white/30 text-xs">{APP_VERSION}</span>
        </div>
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20" />
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 pt-20 bg-background relative min-h-screen lg:min-h-0 lg:pt-6">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm hover:shadow-md transition-all duration-300 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
        >
          <span className={`transition-transform duration-300 ${theme === 'dark' ? 'rotate-0' : '-rotate-90 scale-0 absolute'}`}>☀️</span>
          <span className={`transition-transform duration-300 ${theme === 'light' ? 'rotate-0' : 'rotate-90 scale-0 absolute'}`}>🌙</span>
          <span className="text-xs">{theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}</span>
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-6">
          <EconLogo className="h-12 w-48" />
        </div>

        <div className="w-full max-w-sm space-y-6">
          {/* Login banners */}
          {loginBanners.length > 0 && (
            <div className="space-y-2">
              {loginBanners.filter((banner) => !dismissedLoginBanners.has(banner.id)).map((banner) => (
                <div key={banner.id} role="status" className="relative isolate flex items-start gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary/[0.07] via-card to-accent/30 p-3.5 shadow-sm">
                  <div className="pointer-events-none absolute -right-8 -top-10 -z-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 break-words text-sm font-semibold leading-snug text-foreground">{banner.title}</p>
                    <p className={`text-xs leading-relaxed text-muted-foreground ${expandedLoginBanners.has(banner.id) ? '' : 'line-clamp-2'}`}>{banner.content}</p>
                    {banner.content.length > 100 && (
                      <button
                        type="button"
                        aria-expanded={expandedLoginBanners.has(banner.id)}
                        onClick={() => setExpandedLoginBanners((previous) => {
                          const next = new Set(previous);
                          if (next.has(banner.id)) next.delete(banner.id);
                          else next.add(banner.id);
                          return next;
                        })}
                        className="mt-1 text-xs font-medium text-primary hover:underline"
                      >
                        {expandedLoginBanners.has(banner.id) ? 'Daha az göster' : 'Devamını oku'}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Duyuruyu kapat"
                    onClick={() => setDismissedLoginBanners((previous) => new Set(previous).add(banner.id))}
                    className="-mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold text-foreground">{getGreeting()}</h2>
            <p className="text-sm text-primary font-medium mt-1">EconNotes'a Hoş Geldiniz.</p>
            <p className="text-sm text-muted-foreground mt-1">Hesabınıza giriş yapmak için bilgilerinizi girin.</p>
            <div className="flex items-center gap-2 mt-3">
              <div className="p-1.5 rounded-full bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Güvenli Giriş</span>
            </div>
          </div>

          {returningName && (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 p-3.5 shadow-sm animate-fade-in">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Tekrar hoş geldin, {returningName}!</p>
                <p className="text-xs text-muted-foreground">Seni yeniden EconNotes’ta görmek güzel.</p>
              </div>
            </div>
          )}

          {penaltyInfo && !penaltyInfo.expired && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Hesabınız Cezalı</AlertTitle>
              <AlertDescription className="space-y-1">
                <p><strong>Sebep:</strong> {penaltyInfo.reason}</p>
                {penaltyInfo.is_permanent ? (
                  <p><strong>Süre:</strong> Süresiz uzaklaştırma</p>
                ) : penaltyInfo.until ? (
                  <p><strong>Ceza Bitiş:</strong> {new Date(penaltyInfo.until).toLocaleString('tr-TR')}</p>
                ) : null}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Şifre</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">Şifremi Unuttum</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <SecurityCaptcha onVerifiedChange={setCaptchaOk} resetKey={captchaReset} />
            <Button type="submit" className="w-full" disabled={loading} style={{ background: 'hsl(221, 83%, 53%)', color: 'white' }}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </Button>
          </form>

          {/* Sosyal giriş */}
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-[11px] text-muted-foreground uppercase tracking-wider">veya</span></div>
            </div>
            <button type="button" className="social-btn" onClick={async () => {
              const r = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
              if (r.error) { toast.error('Google ile giriş başarısız.'); return; }
              if (r.redirected) return;
              navigate('/');
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.96 6.96 0 0 1 5.46 12c0-.73.13-1.43.36-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Google ile devam et
            </button>
            <button type="button" className="social-btn" onClick={async () => {
              const r = await lovable.auth.signInWithOAuth('apple', { redirect_uri: window.location.origin });
              if (r.error) { toast.error('Apple ile giriş başarısız.'); return; }
              if (r.redirected) return;
              navigate('/');
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple ile devam et
            </button>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Hesabınız yok mu? <Link to="/register" className="text-primary hover:underline font-medium">Kayıt Ol</Link>
          </p>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/install')}>
              <Download className="mr-2 h-4 w-4" />
              Uygulamayı İndir
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Yardım ve Teknik Destek: <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>
            </p>
            <p className="text-xs text-muted-foreground/60 text-center lg:hidden">EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
            <p className="text-xs text-muted-foreground/40 text-center lg:hidden">{APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
