import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    // Listen for auth state changes (recovery event)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }
    if (password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error('Şifre güncellenemedi. Lütfen tekrar deneyin.');
    } else {
      setDone(true);
      toast.success('Şifreniz başarıyla güncellendi!');
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  if (!isRecovery && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 decorative-lines opacity-10" />
        <Card className="w-full max-w-md glass-card animate-fade-in relative z-10">
          <CardHeader className="text-center space-y-3">
            <div className="flex justify-center">
              <img src={logo} alt="EconNotes" className="h-14 w-14 object-contain" style={{ filter: 'var(--logo-filter)' }} />
            </div>
            <CardTitle className="text-2xl font-bold">Geçersiz Bağlantı</CardTitle>
            <CardDescription>Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/login')} className="gradient-primary text-primary-foreground">
              Giriş Sayfasına Dön
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-primary relative overflow-hidden">
      <div className="absolute inset-0 decorative-lines opacity-10" />
      <Card className="w-full max-w-md glass-card animate-fade-in relative z-10">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
              <img src={logo} alt="EconNotes" className="h-14 w-14 object-contain" style={{ filter: 'var(--logo-filter)' }} />
            </div>
            <CardTitle className="text-2xl font-bold">Yeni Şifre Belirle</CardTitle>
          <CardDescription>Yeni şifrenizi girin</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-foreground">Şifreniz başarıyla güncellendi! Giriş sayfasına yönlendiriliyorsunuz...</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Yeni Şifre</Label>
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
              <div className="space-y-2">
                <Label htmlFor="confirm">Şifre Tekrar</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
                {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
