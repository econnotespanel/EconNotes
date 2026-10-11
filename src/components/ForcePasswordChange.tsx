import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import EconLogo from '@/components/EconLogo';

/** Shown after an admin issued a one-time password; the user must set a new one. */
const ForcePasswordChange = () => {
  const { signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { toast.error('Şifre en az 8 karakter olmalı, harf ve rakam içermelidir.'); return; }
    if (pw !== pw2) { toast.error('Şifreler eşleşmiyor.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setBusy(false); toast.error('Şifre güncellenemedi. Lütfen farklı bir şifre deneyin.'); return; }
    const { error: fnErr } = await supabase.functions.invoke('complete-password-change');
    if (fnErr) { setBusy(false); toast.error('İşlem tamamlanamadı. Lütfen tekrar deneyin.'); return; }
    await supabase.auth.refreshSession();
    toast.success('Yeni şifreniz kaydedildi.');
    window.location.replace('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-xl">
        <EconLogo className="h-8 w-36" />
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold"><KeyRound className="h-5 w-5 text-primary" />Yeni şifre belirleyin.</h1>
          <p className="text-sm text-muted-foreground">Hesabınıza yönetici tarafından verilen tek kullanımlık parola ile giriş yaptınız. Devam etmek için kendinize ait yeni bir şifre belirleyin.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="np">Yeni şifre</Label>
          <Input id="np" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} maxLength={72} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="np2">Yeni şifre (tekrar)</Label>
          <Input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} maxLength={72} />
        </div>
        <p className="text-xs text-muted-foreground">En az 8 karakter, harf ve rakam içermelidir.</p>
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Şifreyi kaydet.</Button>
        <button type="button" onClick={() => signOut()} className="w-full text-center text-xs text-muted-foreground underline">Çıkış yap.</button>
      </form>
    </div>
  );
};

export default ForcePasswordChange;
