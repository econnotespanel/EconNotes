import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Eye, EyeOff, Mail, Lock, AlertTriangle, Download, BookOpen, Users, TrendingUp, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useTheme } from '@/contexts/ThemeContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [penaltyInfo, setPenaltyInfo] = useState<{ reason: string; until: string | null; is_permanent: boolean; expired?: boolean } | null>(null);
  const [loginBanners, setLoginBanners] = useState<any[]>([]);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const fetchBanners = async () => {
      const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('created_at', { ascending: false });
      setLoginBanners(data || []);
    };
    fetchBanners();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 16) return 'İyi Günler! ☀️';
    if (hour >= 17 && hour <= 20) return 'İyi Akşamlar! 🌆';
    return 'İyi Geceler! 🌙';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    setPenaltyInfo(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setLoading(false);
      if (error.message?.includes('Email not confirmed')) {
        toast.error('E-posta adresinizi doğrulamanız gerekmektedir. Lütfen mail kutunuzu kontrol edin.');
      } else {
        toast.error('Giriş başarısız. E-posta veya şifre hatalı.');
      }
      return;
    }

    if (data.user) {
      const { data: penalties } = await supabase
        .from('penalties')
        .select('*')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

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
          setPenaltyInfo({ reason: latest.reason, until: latest.penalty_until, is_permanent: false, expired: true });
        }
      }
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', data.user!.id)
      .single();
    const fullName = profileData?.full_name || data.user!.user_metadata?.full_name || '';
    
    setLoading(false);
    toast.success(`Giriş Başarılı! Hoş Geldiniz, ${fullName}`, {
      style: { background: 'hsl(142, 76%, 36%)', color: 'white', border: 'none' },
    });
    navigate('/');
  };

  const features = [
    { icon: BookOpen, title: 'Not Paylaşımı', desc: 'Ders notlarınızı arkadaşlarınızla kolayca paylaşın.' },
    { icon: Users, title: 'Topluluk', desc: 'Üniversite öğrencileriyle bilgi paylaşın.' },
    { icon: TrendingUp, title: 'Başarı', desc: 'Sınavlara hazırlanın, başarıya ulaşın.' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {/* Left panel - features */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(217, 91%, 20%), hsl(221, 83%, 30%), hsl(213, 80%, 35%))' }}>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <img src={logo} alt="EconNotes" className="h-12 w-12 object-contain brightness-0 invert" />
            <h1 className="text-2xl font-bold text-white">EconNotes</h1>
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
        <p className="text-white/50 text-sm relative z-10">Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir. 🎓</p>
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20" />
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background relative min-h-screen lg:min-h-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground"
          title={theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-6">
          <img src={logo} alt="EconNotes" className="h-10 w-10 object-contain" style={{ filter: 'var(--logo-filter)' }} />
          <h1 className="text-xl font-bold text-foreground">EconNotes</h1>
        </div>

        <div className="w-full max-w-sm space-y-6">
          {/* Login banners */}
          {loginBanners.length > 0 && (
            <div className="space-y-2">
              {loginBanners.map((banner) => (
                <Alert key={banner.id} className="border-primary/30 bg-primary/5">
                  <AlertTitle className="text-sm font-semibold">{banner.title}</AlertTitle>
                  <AlertDescription className="text-xs">{banner.content}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold text-foreground">{getGreeting()}</h2>
            <p className="text-sm text-primary mt-1">Hesabınıza giriş yapmak için bilgilerinizi girin</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>🔒 Güvenli Giriş</span>
            </div>
          </div>

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
          {penaltyInfo?.expired && (
            <Alert className="border-warning/30 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning">Uzaklaştırma Cezan Sona Erdi</AlertTitle>
              <AlertDescription>
                <p className="text-sm">EconNotes Panel kurallarına daha dikkatli olmayı unutma! Tekrar hoş geldin. 🎓</p>
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
            <Button type="submit" className="w-full" disabled={loading} style={{ background: 'hsl(221, 83%, 53%)', color: 'white' }}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </Button>
          </form>

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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
