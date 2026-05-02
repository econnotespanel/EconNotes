import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Eye, EyeOff, Mail, Lock, User, GraduationCap, Building, ShieldCheck, UserPlus, BookOpen, Users, TrendingUp } from 'lucide-react';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { useTheme } from '@/contexts/ThemeContext';

const APP_VERSION = 'v2.5.0';

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
  const navigate = useNavigate();
  const { systemOpen, closedUntil } = useSystemStatus();
  const { theme, toggleTheme } = useTheme();

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
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: formData.email,
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
      toast.error(error.message);
    } else {
      toast.success('Kayıt başarılı. Şimdi giriş yapabilirsiniz.', { duration: 6000 });
      navigate('/login');
    }
  };

  if (systemOpen === false) {
    return <MaintenanceScreen closedUntil={closedUntil} />;
  }

  const features = [
    { icon: BookOpen, title: 'Not Paylaşımı', desc: 'Ders notlarınızı arkadaşlarınızla kolayca paylaşın.' },
    { icon: Users, title: 'Topluluk', desc: 'Üniversite öğrencileriyle bilgi paylaşın.' },
    { icon: TrendingUp, title: 'Başarı', desc: 'Sınavlara hazırlanın, başarıya ulaşın.' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 relative overflow-hidden" style={{ background: theme === 'dark' ? 'linear-gradient(135deg, hsl(217, 91%, 12%), hsl(221, 83%, 18%), hsl(213, 80%, 22%))' : 'linear-gradient(135deg, hsl(217, 91%, 20%), hsl(221, 83%, 30%), hsl(213, 80%, 35%))' }}>
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
        <div className="relative z-10 flex items-center justify-between">
          <p className="text-white/50 text-sm">Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
          <span className="text-white/30 text-xs">{APP_VERSION}</span>
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20" />
      </div>

      {/* Right panel - register form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background relative min-h-screen lg:min-h-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm hover:shadow-md transition-all duration-300 text-sm font-medium text-muted-foreground hover:text-foreground"
          title={theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}
        >
          <span className={`transition-transform duration-300 ${theme === 'dark' ? 'rotate-0' : '-rotate-90 scale-0 absolute'}`}>☀️</span>
          <span className={`transition-transform duration-300 ${theme === 'light' ? 'rotate-0' : 'rotate-90 scale-0 absolute'}`}>🌙</span>
          <span className="text-xs">{theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}</span>
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-4">
          <img src={logo} alt="EconNotes" className="h-10 w-10 object-contain" style={{ filter: 'var(--logo-filter)' }} />
          <h1 className="text-xl font-bold text-foreground">EconNotes</h1>
        </div>

        <div className="w-full max-w-sm space-y-4 max-h-[85vh] overflow-y-auto pr-1">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Kayıt Ol</h2>
            </div>
            <p className="text-sm text-primary font-medium">EconNotes'a Hoş Geldiniz.</p>
            <p className="text-sm text-muted-foreground mt-1">Hesap oluşturmak için bilgilerinizi girin.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Ad Soyad</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="fullName" placeholder="Ad Soyad" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="ornek@mail.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="university">Üniversite</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="university" placeholder="Üniversite" value={formData.university} onChange={(e) => setFormData({...formData, university: e.target.value})} className="pl-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">Bölüm</Label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="department" placeholder="Bölüm" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} className="pl-10" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sınıf</Label>
              <Select value={formData.grade} onValueChange={(v) => setFormData({...formData, grade: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1. Sınıf</SelectItem>
                  <SelectItem value="2">2. Sınıf</SelectItem>
                  <SelectItem value="3">3. Sınıf</SelectItem>
                  <SelectItem value="4">4. Sınıf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="pl-10 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">En az 6 karakter, 1 büyük harf ve 1 rakam gereklidir.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Şifre Tekrar</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="rules" checked={acceptRules} onCheckedChange={(v) => setAcceptRules(v as boolean)} />
              <Label htmlFor="rules" className="text-xs leading-tight cursor-pointer">
                <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
                  <DialogTrigger asChild>
                    <span className="underline text-primary cursor-pointer hover:text-primary/80">Panel Kuralları</span>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" /> EconNotes Panel Kuralları
                      </DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-[400px] rounded-lg border border-border p-4">
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
            <Button type="submit" className="w-full" disabled={loading} style={{ background: 'hsl(221, 83%, 53%)', color: 'white' }}>
              {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
            </Button>
          </form>

          {/* Sosyal kayıt */}
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-[11px] text-muted-foreground uppercase tracking-wider">veya</span></div>
            </div>
            <button type="button" className="social-btn" onClick={async () => {
              const r = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
              if (r.error) { toast.error('Google ile kayıt başarısız.'); return; }
              if (r.redirected) return;
              navigate('/');
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.96 6.96 0 0 1 5.46 12c0-.73.13-1.43.36-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Google ile devam et
            </button>
            <button type="button" className="social-btn" onClick={async () => {
              const r = await lovable.auth.signInWithOAuth('apple', { redirect_uri: window.location.origin });
              if (r.error) { toast.error('Apple ile kayıt başarısız.'); return; }
              if (r.redirected) return;
              navigate('/');
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple ile devam et
            </button>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Hesabınız var mı? <Link to="/login" className="text-primary hover:underline font-medium">Giriş Yap</Link>
          </p>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground text-center">
              Yardım ve Teknik Destek: <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>
            </p>
            <p className="text-xs text-muted-foreground/60 text-center lg:hidden">Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
            <p className="text-xs text-muted-foreground/40 text-center lg:hidden">{APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
