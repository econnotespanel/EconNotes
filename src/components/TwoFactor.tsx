import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Smartphone, MessageSquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EconLogo from '@/components/EconLogo';

type Factor = { id: string; factor_type: string; status: string; friendly_name?: string; phone?: string };

const smsError = (msg: string) =>
  /phone|sms|provider|disabled/i.test(msg)
    ? 'SMS doğrulaması henüz etkin değil. Lütfen doğrulayıcı uygulamayı kullanın.'
    : msg;

/** Enrollment UI: authenticator app (TOTP) or SMS. */
export const TwoFactorEnroll = ({ onDone }: { onDone: () => void }) => {
  const [mode, setMode] = useState<'totp' | 'phone' | null>(null);
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [phone, setPhone] = useState('+90');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const cleanupUnverified = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of (data?.all ?? []) as Factor[]) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  };

  const startTotp = async () => {
    setBusy(true);
    await cleanupUnverified();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Uygulama ${Date.now()}` });
    setBusy(false);
    if (error) return toast.error('Başlatılamadı: ' + error.message);
    setMode('totp');
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const startPhone = async () => {
    if (!/^\+\d{10,15}$/.test(phone)) return toast.error('Telefonu +905xxxxxxxxx biçiminde girin.');
    setBusy(true);
    await cleanupUnverified();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'phone', phone, friendlyName: `SMS ${Date.now()}` } as any);
    if (error) { setBusy(false); return toast.error(smsError(error.message)); }
    const ch = await supabase.auth.mfa.challenge({ factorId: data.id });
    setBusy(false);
    if (ch.error) return toast.error(smsError(ch.error.message));
    setFactorId(data.id);
    setChallengeId(ch.data.id);
    toast.success('Doğrulama kodu telefonunuza gönderildi.');
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return toast.error('6 haneli kodu girin.');
    setBusy(true);
    let cid = challengeId;
    if (!cid) {
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error) { setBusy(false); return toast.error(ch.error.message); }
      cid = ch.data.id;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: cid, code });
    setBusy(false);
    if (error) return toast.error('Kod hatalı: ' + error.message);
    toast.success('İki adımlı doğrulama etkinleştirildi.');
    onDone();
  };

  if (!mode) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" className="h-auto flex-col gap-1 py-4" disabled={busy} onClick={startTotp}>
          <Smartphone className="h-5 w-5" /> Doğrulayıcı uygulama
        </Button>
        <Button variant="outline" className="h-auto flex-col gap-1 py-4" disabled={busy} onClick={() => setMode('phone')}>
          <MessageSquare className="h-5 w-5" /> SMS kodu
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === 'totp' && qr && (
        <div className="space-y-2 text-sm">
          <p>Google Authenticator veya benzeri bir uygulamayla kodu tarayın.</p>
          <img src={qr} alt="Doğrulama QR kodu" className="mx-auto h-44 w-44 rounded bg-card p-2" />
          <p className="break-all text-center text-xs text-muted-foreground">Elle giriş: {secret}</p>
        </div>
      )}
      {mode === 'phone' && !factorId && (
        <div className="space-y-2">
          <Label htmlFor="mfa-phone">Telefon numarası</Label>
          <Input id="mfa-phone" value={phone} onChange={(e) => setPhone(e.target.value.trim())} inputMode="tel" />
          <Button className="w-full" disabled={busy} onClick={startPhone}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Kod gönder.
          </Button>
        </div>
      )}
      {factorId && (
        <div className="space-y-2">
          <Label htmlFor="mfa-code">6 haneli kod</Label>
          <Input id="mfa-code" value={code} maxLength={6} inputMode="numeric" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button className="w-full" disabled={busy} onClick={verify}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Doğrula.
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={() => { setMode(null); setFactorId(''); setChallengeId(''); setCode(''); }}>Geri.</Button>
    </div>
  );
};

/** Profile card: list, add and remove factors. */
export const TwoFactorCard = () => {
  const { isAdmin } = useAuth();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.status === 'verified'));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    if (isAdmin && factors.length <= 1) return toast.error('Yöneticiler için en az bir doğrulama yöntemi zorunludur.');
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error('Kaldırılamadı: ' + error.message);
    toast.success('Doğrulama yöntemi kaldırıldı.');
    void load();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> İki Adımlı Doğrulama</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {isAdmin ? 'Yönetici hesapları için zorunludur.' : 'İsteğe bağlıdır. Hesabınızı daha güvenli hale getirir.'}
        </p>
        {factors.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-md border-2 border-border p-3 text-sm">
            <span>{f.factor_type === 'phone' ? `SMS · ${f.phone ?? ''}` : 'Doğrulayıcı uygulama'}</span>
            <Button variant="ghost" size="icon" aria-label="Kaldır" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {adding ? (
          <TwoFactorEnroll onDone={() => { setAdding(false); void load(); }} />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>Yöntem ekle.</Button>
        )}
      </CardContent>
    </Card>
  );
};

/** Blocks the app until the user passes their second factor; forces enrollment for admins. */
export const MfaGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [state, setState] = useState<'checking' | 'ok' | 'challenge' | 'enroll'>('checking');
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!user) return setState('ok');
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: list } = await supabase.auth.mfa.listFactors();
    const verified = ((list?.all ?? []) as Factor[]).filter((f) => f.status === 'verified');
    setFactors(verified);
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      setFactorId(verified[0]?.id ?? '');
      setState('challenge');
    } else if (isAdmin && verified.length === 0) {
      setState('enroll');
    } else setState('ok');
  }, [user, isAdmin]);

  useEffect(() => { if (!loading) void check(); }, [loading, check]);

  const sendChallenge = async (id: string) => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: id });
    setBusy(false);
    if (error) return toast.error(smsError(error.message));
    setChallengeId(data.id);
    if (factors.find((f) => f.id === id)?.factor_type === 'phone') toast.success('Kod telefonunuza gönderildi.');
  };

  const verify = async () => {
    setBusy(true);
    let cid = challengeId;
    if (!cid) {
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error) { setBusy(false); return toast.error(smsError(ch.error.message)); }
      cid = ch.data.id;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: cid, code });
    setBusy(false);
    if (error) { setChallengeId(''); return toast.error('Kod hatalı: ' + error.message); }
    setState('ok');
  };

  if (loading || state === 'ok') return <>{children}</>;
  if (state === 'checking') return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const selected = factors.find((f) => f.id === factorId);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <EconLogo />
          <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5" />
            {state === 'enroll' ? 'İki adımlı doğrulamayı kurun' : 'İki adımlı doğrulama'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {state === 'enroll'
              ? 'Yönetici hesapları için iki adımlı doğrulama zorunludur. Devam etmek için bir yöntem ekleyin.'
              : 'Devam etmek için doğrulama kodunu girin.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'enroll' ? (
            <TwoFactorEnroll onDone={() => void check()} />
          ) : (
            <>
              {factors.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {factors.map((f) => (
                    <Button key={f.id} size="sm" variant={f.id === factorId ? 'default' : 'outline'} onClick={() => { setFactorId(f.id); setChallengeId(''); }}>
                      {f.factor_type === 'phone' ? 'SMS' : 'Uygulama'}
                    </Button>
                  ))}
                </div>
              )}
              {selected?.factor_type === 'phone' && (
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => sendChallenge(factorId)}>SMS kodu gönder.</Button>
              )}
              <Input aria-label="Doğrulama kodu" value={code} maxLength={6} inputMode="numeric" placeholder="6 haneli kod" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button className="w-full" disabled={busy || code.length !== 6} onClick={verify}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Doğrula.
              </Button>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={() => signOut()}>Çıkış yap.</Button>
        </CardContent>
      </Card>
    </div>
  );
};
