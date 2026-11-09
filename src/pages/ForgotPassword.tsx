import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { APP_VERSION_LABEL as APP_VERSION } from '@/lib/version';
import { Mail, CheckCircle, KeyRound, BookOpen, Users, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useSiteConfig, getSeasonalTheme } from '@/contexts/SiteConfigContext';
import { cn } from '@/lib/utils';



const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const { systemOpen, closedUntil, closureTitle, closureMessage, closureImageUrl, closureMode } = useSystemStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Lütfen e-posta adresinizi girin.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error('Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar deneyin.');
      toast.info('Hesabınıza erişemiyorsanız güvenlik nedeniyle yöneticinizle iletişime geçin.', { duration: 6000 });
    } else {
      setSent(true);
      toast.success('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi!');
    }
  };

  const features = [
    { icon: BookOpen, title: 'Not Paylaşımı', desc: 'Ders notlarınızı arkadaşlarınızla kolayca paylaşın.' },
    { icon: Users, title: 'Topluluk', desc: 'Üniversite öğrencileriyle bilgi paylaşın.' },
    { icon: TrendingUp, title: 'Başarı', desc: 'Sınavlara hazırlanın, başarıya ulaşın.' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14 relative overflow-hidden"
        style={{
          background: isNovember10
            ? (theme === 'dark'
                ? 'linear-gradient(145deg, #09090b 0%, #18181b 50%, #27272a 100%)'
                : 'linear-gradient(145deg, #18181b 0%, #27272a 50%, #3f3f46 100%)')
            : (theme === 'dark'
                ? 'linear-gradient(145deg, #070b14 0%, #001f5c 50%, #003791 100%)'
                : 'linear-gradient(145deg, #001845 0%, #002d7a 45%, #00439c 100%)')
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
                <div>
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
        <div className={cn(
          "absolute -top-24 -right-24 h-96 w-96 rounded-full blur-3xl pointer-events-none",
          isNovember10 ? "bg-white/5" : "bg-[#00f0ff]/15"
        )} />
        <div className={cn(
          "absolute bottom-0 right-0 h-80 w-80 rounded-full blur-3xl pointer-events-none",
          isNovember10 ? "bg-white/5" : "bg-[#003791]/35"
        )} />
      </div>

      {/* Right panel */}
      <div
        className="flex-1 flex flex-col items-center px-6 bg-background relative min-h-screen lg:min-h-0"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        }}
      >
        <div className="my-auto w-full max-w-sm flex flex-col items-center">
          <div className="w-full flex items-center justify-between lg:justify-end mb-5">
            <Link
              to="/login"
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 border border-border/70 backdrop-blur-md text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors shadow-xs"
            >
              <span>← Giriş</span>
            </Link>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 border border-border/70 backdrop-blur-md shadow-xs hover:shadow-sm transition-all duration-200 text-xs font-semibold text-muted-foreground hover:text-foreground"
              aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
            >
              <span className={`transition-transform duration-300 ${theme === 'dark' ? 'rotate-0' : '-rotate-90 scale-0 absolute'}`}>☀️</span>
              <span className={`transition-transform duration-300 ${theme === 'light' ? 'rotate-0' : 'rotate-90 scale-0 absolute'}`}>🌙</span>
              <span>{theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}</span>
            </button>
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <EconLogo className="h-8 w-36" />
          </div>

          <div className="w-full space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="h-5 w-5 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">Şifremi Unuttum</h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Kayıtlı e-posta adresinize şifre sıfırlama bağlantısı göndereceğiz.</p>
          </div>

          {sent ? (
            <div className="text-center space-y-3 py-4 rounded-2xl bg-card border border-border/80 p-5 shadow-xs">
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
                <Label htmlFor="email" className="text-xs font-semibold text-foreground/90">Kayıtlı E-posta Adresiniz</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="ornek@mail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary transition-all text-sm"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className={cn(
                  "w-full h-11 rounded-xl border-0 font-semibold active:scale-[0.99] transition-all duration-200 cursor-pointer text-white",
                  isNovember10
                    ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-950 shadow-none"
                    : "bg-no-repeat bg-gradient-to-r from-[#003791] via-[#004fb8] to-[#0070d1] hover:from-[#002f7a] hover:via-[#0043a0] hover:to-[#005fb8] shadow-md shadow-blue-500/20"
                )}
                disabled={loading}
              >
                {loading ? 'Gönderiliyor...' : 'Şifre Sıfırlama Bağlantısı Gönder'}
              </Button>
            </form>
          )}

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
              <KeyRound className="h-3.5 w-3.5 text-primary" /> E-posta Alamıyor musunuz?
            </span>
            E-postanıza erişemiyorsanız veya posta gelmiyorsa, yöneticiniz ile iletişime geçerek hesabınız için <strong>Geçici Giriş Anahtarı</strong> talep edebilir ve hemen oturum açabilirsiniz.
          </div>

          <p className="text-sm text-center text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline font-medium">Giriş sayfasına dön</Link>
          </p>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground text-center">
              Yardım ve Teknik Destek: <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>
            </p>
            <p className="text-xs text-muted-foreground/60 text-center lg:hidden">EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
