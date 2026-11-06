import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable, formatSocialAuthError } from '@/integrations/lovable';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { APP_VERSION_LABEL as APP_VERSION } from '@/lib/version';
import { Eye, EyeOff, Mail, Lock, User, GraduationCap, Building, ShieldCheck, UserPlus, BookOpen, Users, TrendingUp } from 'lucide-react';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useTheme } from '@/contexts/ThemeContext';
import SecurityCaptcha from '@/components/SecurityCaptcha';



const PANEL_RULES = [
  'Tüm kullanıcılar birbirine saygılı davranmalıdır.',
  'Hakaret, küfür, argo veya aşağılayıcı ifadeler kesinlikle yasaktır.',
  'Spam, reklam veya gereksiz tekrarlayan içerik paylaşmak yasaktır.',
  'Kişisel bilgileri (TC, telefon, adres vb.) paylaşmak yasaktır.',
  'Paylaşılan ders notları telif hakkına uygun olmalıdır. Başkasının notunu paylaşmadan önce izin alınmalıdır.',
  'Uygunsuz, müstehcen veya yasadışı içerik paylaşımı kesinlikle yasaktır.',
  'Not yükleme saatleri belirli saatlerle sınırlandırılmış olabilir (09:00-00:00). Yönetici ayarlarına tabidir.',
  'Diğer kullanıcıları rahatsız etmek, taciz veya tehdit etmek yasaktır.',
  'Mesajlaşma özelliğini kötüye kullanan kullanıcılar cezalandırılabilir.',
  'Kurallara uymayan kullanıcılar kademeli uyarı ve ceza alabilir (5 dk, 1 saat, 1 gün, 1 hafta, 4 hafta, süresiz).',
  'Yönetici ekibi, kuralları ihlal eden içerikleri düzenleme ve silme hakkına sahiptir.',
  'Platform yalnızca eğitim amaçlı kullanılmalıdır.',
];

const Register = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    university: '',
    department: '',
    grade: '1',
  });
  const [acceptRules, setAcceptRules] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const navigate = useNavigate();
  const { systemOpen, closedUntil, closureTitle, closureMessage, closureImageUrl, closureMode } = useSystemStatus();
  const { theme, toggleTheme } = useTheme();
  const { user: currentUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (currentUser && !authLoading && !loading && !oauthLoading) {
      navigate('/', { replace: true });
    }
  }, [currentUser, authLoading, loading, oauthLoading, navigate]);

  const handleSocialRegister = async (provider: 'google' | 'apple') => {
    if (oauthLoading || loading) return;
    const label = provider === 'google' ? 'Google' : 'Apple';
    setOauthLoading(provider);
    try {
      localStorage.setItem('econnotes_welcome_pending', '1');
    } catch {}

    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });

    if (result?.redirected) {
      return;
    }

    setOauthLoading(null);

    if (result?.error) {
      try {
        localStorage.removeItem('econnotes_welcome_pending');
      } catch {}
      const formatted = formatSocialAuthError(label, result.error.message);
      if (formatted.level === 'info') {
        toast.info(formatted.title, { description: formatted.description, duration: 5000 });
      } else {
        toast.error(formatted.title, { description: formatted.description, duration: 6000 });
      }
      return;
    }

    try {
      localStorage.removeItem('econnotes_welcome_pending');
    } catch {}
    toast.success(`${label} ile kayıt başarılı! Hoş Geldiniz`);
    navigate('/welcome');
  };

  const validatePassword = (password: string) => {
    if (password.length < 6) return 'Şifre en az 6 karakter olmalıdır.';
    if (!/[A-Z]/.test(password)) return 'Şifre en az 1 büyük harf içermelidir.';
    if (!/[0-9]/.test(password)) return 'Şifre en az 1 rakam içermelidir.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.password || !formData.university || !formData.department) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }
    // Name validation: only letters (incl. Turkish), spaces, hyphens, apostrophes. No ?, @, #, digits, emoji.
    const nameRegex = /^[A-Za-zÇĞİıÖŞÜçğıiöşü\s'’\-]{2,60}$/;
    if (!nameRegex.test(formData.fullName.trim())) {
      toast.error('Ad Soyad yalnızca harflerden oluşmalıdır. Özel karakter, rakam veya soru işareti içeremez.');
      return;
    }
    const uniDeptRegex = /^[A-Za-zÇĞİıÖŞÜçğıiöşü0-9\s'’\-\.\,\(\)]{2,100}$/;
    if (!uniDeptRegex.test(formData.university.trim()) || !uniDeptRegex.test(formData.department.trim())) {
      toast.error('Üniversite ve bölüm bilgileri geçersiz karakter içeremez.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (!acceptRules) {
      toast.error('Panel kurallarını kabul etmeniz gerekmektedir.');
      return;
    }
    if (!captchaOk) {
      toast.error('Lütfen güvenlik kodunu doğru şekilde girin.');
      setCaptchaReset((v) => v + 1);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          university: formData.university,
          department: formData.department,
          grade: parseInt(formData.grade),
        },
      },
    });
    setLoading(false);
    if (error) {
      setCaptchaReset((v) => v + 1);
      toast.error(error.message);
    } else {
      // Yeni kullanıcı bayrağı — ilk girişte /welcome kurulum ekranına yönlendirilecek
      try { localStorage.setItem('econnotes_welcome_pending', '1'); } catch {}
      toast.success('Kayıt Başarıyla Tamamlandı. Giriş yapabilirsiniz.', { duration: 6000 });
      navigate('/login');
    }
  };

  const features = [
    { icon: BookOpen, title: 'Not Paylaşımı', desc: 'Ders notlarınızı arkadaşlarınızla kolayca paylaşın.' },
    { icon: Users, title: 'Topluluk', desc: 'Üniversite öğrencileriyle bilgi paylaşın.' },
    { icon: TrendingUp, title: 'Başarı', desc: 'Sınavlara hazırlanın, başarıya ulaşın.' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {/* Left panel - PlayStation aesthetic features */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14 relative overflow-hidden"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(145deg, #070b14 0%, #001f5c 50%, #003791 100%)'
            : 'linear-gradient(145deg, #001845 0%, #002d7a 45%, #00439c 100%)'
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">Platform Özellikleri</p>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 transition-all duration-300 hover:bg-white/15 hover:border-white/25 hover:translate-x-1 shadow-sm">
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
          <p className="text-white/60 text-xs">EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
          <span className="text-white/40 text-xs font-mono">{APP_VERSION}</span>
        </div>

        {/* Decorative ambient lighting */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#00f0ff]/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#003791]/35 blur-3xl pointer-events-none" />
      </div>

      {/* Right panel - register form */}
      <div className="flex-1 flex flex-col items-center justify-center p-5 pt-16 sm:p-6 sm:pt-20 bg-background relative min-h-screen lg:min-h-0 lg:pt-6">
        {/* Mobile back to home */}
        <Link
          to="/"
          className="lg:hidden absolute top-4 left-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>← Ana Sayfa</span>
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 border border-border/70 backdrop-blur-md shadow-xs hover:shadow-sm transition-all duration-200 text-xs font-semibold text-muted-foreground hover:text-foreground"
          aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
        >
          <span className={`transition-transform duration-300 ${theme === 'dark' ? 'rotate-0' : '-rotate-90 scale-0 absolute'}`}>☀️</span>
          <span className={`transition-transform duration-300 ${theme === 'light' ? 'rotate-0' : 'rotate-90 scale-0 absolute'}`}>🌙</span>
          <span>{theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}</span>
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-4">
          <EconLogo className="h-8 w-36" />
        </div>

        <div className="w-full max-w-sm space-y-4 lg:max-h-[85vh] lg:overflow-y-auto lg:pr-1">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-5 w-5 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">Kayıt Ol</h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">EconNotes topluluğuna katılarak ders notlarına anında erişin.</p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mt-2.5 shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Hızlı ve Güvenli Kayıt</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-semibold text-foreground/90">Ad Soyad</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  placeholder="Ad Soyad"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  className="pl-10 h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground/90">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@mail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="pl-10 h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="university" className="text-xs font-semibold text-foreground/90">Üniversite</Label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="university"
                    placeholder="Üniversite"
                    value={formData.university}
                    onChange={(e) => setFormData({...formData, university: e.target.value})}
                    className="pl-10 h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department" className="text-xs font-semibold text-foreground/90">Bölüm</Label>
                <div className="relative">
                  <GraduationCap className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="department"
                    placeholder="Bölüm"
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                    className="pl-10 h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground/90">Sınıf</Label>
              <Select value={formData.grade} onValueChange={(v) => setFormData({...formData, grade: v})}>
                <SelectTrigger className="h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="1">1. Sınıf</SelectItem>
                  <SelectItem value="2">2. Sınıf</SelectItem>
                  <SelectItem value="3">3. Sınıf</SelectItem>
                  <SelectItem value="4">4. Sınıf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground/90">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="pl-10 pr-10 h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">En az 6 karakter, 1 büyük harf ve 1 rakam gereklidir.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground/90">Şifre Tekrar</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  className="pl-10 h-10 sm:h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="rules" checked={acceptRules} onCheckedChange={(v) => setAcceptRules(v as boolean)} className="mt-0.5 rounded-md" />
              <Label htmlFor="rules" className="text-xs leading-tight cursor-pointer text-muted-foreground select-none">
                <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
                  <DialogTrigger asChild>
                    <span className="underline text-primary cursor-pointer hover:text-primary/80 font-medium">Panel Kuralları</span>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" /> EconNotes Panel Kuralları
                      </DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-[400px] rounded-xl border border-border p-4">
                      <ol className="space-y-3 list-decimal list-inside text-sm">
                        {PANEL_RULES.map((rule, i) => (
                          <li key={i} className="leading-relaxed">{rule}</li>
                        ))}
                      </ol>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
                'nı okudum ve kabul ediyorum. Paylaşılan içeriklerden sorumluluk tarafıma aittir.
              </Label>
            </div>
            <SecurityCaptcha onVerifiedChange={setCaptchaOk} resetKey={captchaReset} />
            <Button
              type="submit"
              className="w-full h-11 rounded-xl border-0 bg-no-repeat bg-gradient-to-r from-[#003791] via-[#004fb8] to-[#0070d1] hover:from-[#002f7a] hover:via-[#0043a0] hover:to-[#005fb8] text-white font-semibold shadow-md shadow-blue-500/20 active:scale-[0.99] transition-all duration-200 cursor-pointer"
              disabled={loading}
            >
              {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
            </Button>
          </form>

          {/* Sosyal kayıt */}
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-[11px] text-muted-foreground uppercase tracking-wider">veya</span></div>
            </div>
            <button
              type="button"
              className="social-btn disabled:opacity-60 disabled:pointer-events-none"
              disabled={Boolean(oauthLoading) || loading}
              onClick={() => void handleSocialRegister('google')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.96 6.96 0 0 1 5.46 12c0-.73.13-1.43.36-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              {oauthLoading === 'google' ? 'Google’a yönlendiriliyor...' : 'Google ile devam et'}
            </button>
            <button
              type="button"
              className="social-btn disabled:opacity-60 disabled:pointer-events-none"
              disabled={Boolean(oauthLoading) || loading}
              onClick={() => void handleSocialRegister('apple')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              {oauthLoading === 'apple' ? 'Apple’a yönlendiriliyor...' : 'Apple ile devam et'}
            </button>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Hesabınız var mı? <Link to="/login" className="text-primary hover:underline font-medium">Giriş Yap</Link>
          </p>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground text-center">
              Yardım ve Teknik Destek: <a href="mailto:destek@econnotes.online" className="text-primary hover:underline font-medium">destek@econnotes.online</a>
            </p>
            <p className="text-xs text-muted-foreground/60 text-center lg:hidden">EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
            <p className="text-xs text-muted-foreground/40 text-center lg:hidden">{APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
