import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import EconLogo from '@/components/EconLogo';

/** Shown after an admin issued a temporary password; the user must set their own new password. */
const ForcePasswordChange = () => {
  const { signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (!/[A-Z]/.test(pw) || !/\d/.test(pw)) {
      toast.error('Şifre en az 1 büyük harf ve 1 rakam içermelidir.');
      return;
    }
    if (pw !== pw2) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: pw,
        data: { must_change_password: false }
      });
      if (error) {
        setBusy(false);
        toast.error('Şifre güncellenemedi: ' + error.message);
        return;
      }
      try {
        await supabase.functions.invoke('complete-password-change');
      } catch (fnErr) {
        console.warn('complete-password-change error:', fnErr);
      }
      await supabase.auth.refreshSession();
      toast.success('Yeni şifreniz başarıyla kaydedildi! Panele yönlendiriliyorsunuz...');
      setTimeout(() => {
        window.location.replace('/');
      }, 500);
    } catch (err: any) {
      setBusy(false);
      toast.error('Bir hata oluştu: ' + (err.message || 'Lütfen tekrar deneyin.'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#00f0ff]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[#003791]/20 blur-3xl pointer-events-none" />

      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-border/80 bg-card/90 backdrop-blur-md p-6 sm:p-8 shadow-2xl relative z-10 animate-fade-in">
        <div className="flex items-center justify-between">
          <EconLogo className="h-8 w-36" />
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Güvenli Giriş</span>
          </div>
        </div>

        <div className="space-y-1.5 pt-2">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <KeyRound className="h-5 w-5 text-primary" /> Yeni Şifre Belirleyin
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Hesabınıza yönetici tarafından verilen geçici anahtar şifre ile giriş yaptınız. Hesabınızı güvenle kullanmaya devam etmek için lütfen kendinize ait yeni bir şifre belirleyin.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="np" className="text-xs font-semibold text-foreground/90">Yeni Şifre</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="np"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={pw}
                onChange={e => setPw(e.target.value)}
                maxLength={72}
                className="pl-10 pr-10 h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary text-sm"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np2" className="text-xs font-semibold text-foreground/90">Yeni Şifre (Tekrar)</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="np2"
                type={showPw2 ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                maxLength={72}
                className="pl-10 pr-10 h-11 rounded-xl bg-card/60 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary text-sm"
              />
              <button type="button" onClick={() => setShowPw2(!showPw2)} className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors">
                {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">En az 6 karakter, 1 büyük harf ve 1 rakam gereklidir.</p>
        </div>

        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-gradient-to-r from-[#003791] via-[#004fb8] to-[#0070d1] hover:from-[#002f7a] hover:via-[#0043a0] hover:to-[#005fb8] text-white font-semibold shadow-md shadow-blue-500/20 active:scale-[0.99] transition-all duration-200 cursor-pointer"
          disabled={busy}
        >
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaydediliyor...</> : 'Yeni Şifreyi Kaydet ve Devam Et'}
        </Button>

        <button type="button" onClick={() => signOut()} className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer pt-1">
          Farklı bir hesapla giriş yapmak için çıkış yap
        </button>
      </form>
    </div>
  );
};

export default ForcePasswordChange;
