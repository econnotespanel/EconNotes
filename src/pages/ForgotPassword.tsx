import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { Mail, CheckCircle, KeyRound, BookOpen, Users, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';

const APP_VERSION = 'v2.5.0';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { systemOpen, closedUntil, closureTitle, closureMessage, closureImageUrl, closureMode } = useSystemStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Lütfen e-posta adresinizi girin.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error('Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar deneyin.');
    } else {
      setSent(true);
      toast.success('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi!');
    }
  };

  if (systemOpen === false) {
    return <MaintenanceScreen closedUntil={closedUntil} title={closureTitle} message={closureMessage} imageUrl={closureImageUrl} mode={closureMode} />;
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
            <EconLogo className="h-16 w-72" />
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

      {/* Right panel */}
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
        <div className="lg:hidden flex items-center gap-3 mb-6">
          <EconLogo className="h-14 w-56" />
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Şifremi Unuttum</h2>
            </div>
            <p className="text-sm text-primary font-medium">EconNotes'a Hoş Geldiniz.</p>
            <p className="text-sm text-muted-foreground mt-1">Kayıtlı e-posta adresinize şifre sıfırlama bağlantısı göndereceğiz.</p>
          </div>

          {sent ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-foreground">
                Şifre sıfırlama bağlantısı <strong>{email}</strong> adresine gönderildi. Lütfen e-posta kutunuzu kontrol edin.
              </p>
              <p className="text-xs text-muted-foreground">
                E-posta gelmedi mi? Spam/gereksiz klasörünü de kontrol edin.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Kayıtlı E-posta Adresiniz</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="ornek@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading} style={{ background: 'hsl(221, 83%, 53%)', color: 'white' }}>
                {loading ? 'Gönderiliyor...' : 'Şifre Sıfırlama Bağlantısı Gönder'}
              </Button>
            </form>
          )}

          <p className="text-sm text-center text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline font-medium">Giriş sayfasına dön</Link>
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

export default ForgotPassword;
