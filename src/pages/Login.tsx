import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Eye, EyeOff, Mail, Lock, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [penaltyInfo, setPenaltyInfo] = useState<{ reason: string; until: string | null; is_permanent: boolean; expired?: boolean } | null>(null);
  const navigate = useNavigate();

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

    // Check for active penalty
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
          // User is penalized, sign them out
          await supabase.auth.signOut();
          setPenaltyInfo({
            reason: latest.reason,
            until: latest.penalty_until,
            is_permanent: latest.is_permanent,
          });
          setLoading(false);
          return;
        }

        // Penalty expired - show info message
        if (penaltyUntil && penaltyUntil <= now && !isPermanent) {
          setPenaltyInfo({
            reason: latest.reason,
            until: latest.penalty_until,
            is_permanent: false,
            expired: true,
          });
        }
      }
    }

    // Fetch profile name for welcome message
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-primary relative overflow-hidden">
      <div className="absolute inset-0 decorative-lines opacity-10" />
      <Card className="w-full max-w-md glass-card animate-fade-in relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="EconNotes" className="h-16 w-16 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">EconNotes</CardTitle>
          <CardDescription className="text-base">{getGreeting()}</CardDescription>
          <p className="text-sm text-muted-foreground">EconNotes, Not Paylaşım Paneline Hoş Geldiniz!</p>
          <div className="flex items-center justify-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Güvenli Giriş</span>
          </div>
        </CardHeader>
        <CardContent>
          {penaltyInfo && !penaltyInfo.expired && (
            <Alert variant="destructive" className="mb-4">
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
            <Alert className="mb-4 border-warning/30 bg-warning/5">
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
              <Label htmlFor="password">Şifre</Label>
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
            <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap!'}
            </Button>
            <div className="flex justify-between text-sm">
              <Link to="/forgot-password" className="text-primary hover:underline">Şifremi Unuttum</Link>
              <Link to="/register" className="text-primary hover:underline">Kayıt Ol</Link>
            </div>
          </form>
          <div className="mt-4 pt-3 border-t border-border/40 text-center">
            <p className="text-xs text-muted-foreground">
              Yardım ve Teknik Destek için: <a href="mailto:econnotespanel@gmail.com" className="text-primary hover:underline">econnotespanel@gmail.com</a>
            </p>
          </div>
        </CardContent>
    </Card>
      <p className="absolute bottom-4 right-4 text-xs text-white/60 z-10">Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
    </div>
  );
};

export default Login;
