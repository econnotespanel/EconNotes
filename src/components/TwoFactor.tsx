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
import { cn } from '@/lib/utils';

type Factor = { id: string; factor_type: string; status: string };

/** Calls the SMS verification function and surfaces its real error message. */
const sms = async (action: string, extra: Record<string, string> = {}) => {
  const { error } = await supabase.functions.invoke('sms-2fa', { body: { action, ...extra } });
  if (!error) return null;
  try {
    const body = await (error as any).context?.json?.();
    if (body?.error) return String(body.error);
  } catch { /* ignore */ }
  return 'SMS servisine ulaşılamadı.';
};

const currentSessionId = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.session_id ?? '');
  } catch { return ''; }
};

const verifiedTotp = async () => {
  const { data } = await supabase.auth.mfa.listFactors();
  return ((data?.all ?? []) as Factor[]).filter((f) => f.status === 'verified' && f.factor_type === 'totp');
};

const smsPhone = async (uid: string) => {
  const { data } = await (supabase as any).from('sms_2fa').select('phone').eq('user_id', uid).maybeSingle();
  return (data?.phone as string) ?? null;
};

const CodeInput = ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) => (
  <Input
    id={id}
    aria-label="Doğrulama kodu"
    className="h-16 rounded-2xl border-2 border-input bg-muted/30 text-center font-mono text-[26px] font-bold tracking-[0.45em] shadow-inner [text-indent:0.45em] placeholder:font-normal placeholder:tracking-[0.28em] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25"
    value={value}
    maxLength={6}
    inputMode="numeric"
    autoComplete="one-time-code"
    placeholder="••••••"
    onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
  />
);

/** Enrollment UI: authenticator app (TOTP) or SMS. */
export const TwoFactorEnroll = ({ onDone }: { onDone: () => void }) => {
  const [mode, setMode] = useState<'totp' | 'phone' | null>(null);
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [phone, setPhone] = useState('+90');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const startTotp = async () => {
    setBusy(true);
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of (list?.all ?? []) as Factor[]) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Uygulama ${Date.now()}` });
    setBusy(false);
    if (error) return toast.error('Başlatılamadı: ' + error.message);
    setMode('totp');
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const sendSms = async () => {
    if (!/^\+90\d{10}$/.test(phone)) return toast.error('Telefonu +905xxxxxxxxx biçiminde girin.');
    setBusy(true);
    const err = await sms('enroll_send', { phone });
    setBusy(false);
    if (err) return toast.error(err);
    setSent(true);
    toast.success('Doğrulama kodu telefonunuza gönderildi.');
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return toast.error('6 haneli kodu girin.');
    setBusy(true);
    if (mode === 'phone') {
      const err = await sms('enroll_confirm', { phone, code });
      setBusy(false);
      if (err) return toast.error(err);
    } else {
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error) { setBusy(false); return toast.error(ch.error.message); }
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
      setBusy(false);
      if (error) return toast.error('Kod hatalı.');
    }
    toast.success('İki adımlı doğrulama etkinleştirildi.');
    onDone();
  };

  if (!mode) {
    return (
      <div className="grid gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={startTotp}
          className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/60 disabled:opacity-60"
        >
          <span className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Smartphone className="h-5 w-5" /></span>
          <span>
            <span className="block text-sm font-bold">Doğrulayıcı uygulama</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">QR kodu tarayın, kodu uygulama üretsin.</span>
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode('phone')}
          className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/60 disabled:opacity-60"
        >
          <span className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><MessageSquare className="h-5 w-5" /></span>
          <span>
            <span className="block text-sm font-bold">SMS kodu</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">6 haneli kod telefonunuza gönderilsin.</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === 'totp' && qr && (
        <div className="space-y-3 text-sm">
          <p className="text-center text-muted-foreground">Google Authenticator veya benzeri bir uygulamayla kodu tarayın.</p>
          <div className="mx-auto w-fit rounded-2xl border-2 border-border bg-card p-3 shadow-inner">
            <img src={qr} alt="Doğrulama QR kodu" className="h-44 w-44" />
          </div>
          <p className="break-all text-center text-xs text-muted-foreground">Elle giriş: {secret}</p>
        </div>
      )}
      {mode === 'phone' && (
        <div className="space-y-2">
          <Label htmlFor="mfa-phone">Telefon numarası</Label>
          <Input id="mfa-phone" value={phone} disabled={sent} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))} inputMode="tel" className="h-12 rounded-xl" />
          <Button variant={sent ? 'outline' : 'cta'} className="h-11 w-full rounded-xl font-bold" disabled={busy} onClick={sendSms}>
            {busy && !sent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{sent ? 'Kodu tekrar gönder.' : 'Kod gönder.'}
          </Button>
        </div>
      )}
      {(mode === 'totp' || sent) && (
        <div className="space-y-2">
          <Label htmlFor="mfa-code">6 haneli kod</Label>
          <CodeInput id="mfa-code" value={code} onChange={setCode} />
          <Button variant="cta" className="h-11 w-full rounded-xl font-bold" disabled={busy || code.length !== 6} onClick={verify}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Doğrula.
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={() => { setMode(null); setFactorId(''); setSent(false); setCode(''); }}>Geri.</Button>
    </div>
  );
};

/** Profile card: list, add and remove methods. */
export const TwoFactorCard = () => {
  const { user, isAdmin } = useAuth();
  const [totp, setTotp] = useState<Factor[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setTotp(await verifiedTotp());
    setPhone(await smsPhone(user.id));
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  const count = totp.length + (phone ? 1 : 0);
  const guard = () => {
    if (isAdmin && count <= 1) { toast.error('Yöneticiler için en az bir doğrulama yöntemi zorunludur.'); return false; }
    return true;
  };
  const removeTotp = async (id: string) => {
    if (!guard()) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error('Kaldırılamadı: ' + error.message);
    toast.success('Doğrulama yöntemi kaldırıldı.');
    void load();
  };
  const removeSms = async () => {
    if (!guard() || !user) return;
    const { error } = await (supabase as any).from('sms_2fa').delete().eq('user_id', user.id);
    if (error) return toast.error('Kaldırılamadı: ' + error.message);
    toast.success('SMS doğrulaması kaldırıldı.');
    void load();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><ShieldCheck className="h-4 w-4" /></span> İki Adımlı Doğrulama
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Yeni</span>
          {count > 0 && <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Etkin</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {isAdmin ? 'Yönetici hesapları için zorunludur.' : 'İsteğe bağlıdır. Hesabınızı daha güvenli hale getirir.'}
        </p>
        {totp.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 p-3 text-sm">
            <span className="flex items-center gap-3">
              <span className="icon-tile flex h-8 w-8 items-center justify-center rounded-lg"><Smartphone className="h-4 w-4" /></span>
              Doğrulayıcı uygulama
            </span>
            <Button variant="ghost" size="icon" aria-label="Kaldır" onClick={() => removeTotp(f.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {phone && (
          <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 p-3 text-sm">
            <span className="flex items-center gap-3">
              <span className="icon-tile flex h-8 w-8 items-center justify-center rounded-lg"><MessageSquare className="h-4 w-4" /></span>
              SMS · {phone.slice(0, 5)}•••{phone.slice(-2)}
            </span>
            <Button variant="ghost" size="icon" aria-label="Kaldır" onClick={removeSms}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
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
  const [totp, setTotp] = useState<Factor[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [method, setMethod] = useState<'totp' | 'sms'>('totp');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!user) return setState('ok');
    const [t, p, aal, sid] = await Promise.all([
      verifiedTotp(),
      smsPhone(user.id),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      currentSessionId(),
    ]);
    setTotp(t);
    setPhone(p);
    if (t.length === 0 && !p) return setState(isAdmin ? 'enroll' : 'ok');
    if (aal.data?.currentLevel === 'aal2') return setState('ok');
    if (p && sid) {
      const { data } = await (supabase as any).from('sms_2fa_sessions').select('session_id').eq('session_id', sid).maybeSingle();
      if (data) return setState('ok');
    }
    setMethod(t.length ? 'totp' : 'sms');
    setState('challenge');
  }, [user, isAdmin]);

  useEffect(() => { if (!loading) void check(); }, [loading, check]);

  const sendSms = async () => {
    setBusy(true);
    const err = await sms('login_send');
    setBusy(false);
    if (err) return toast.error(err);
    setSent(true);
    toast.success('Kod telefonunuza gönderildi.');
  };

  const verify = async () => {
    setBusy(true);
    if (method === 'sms') {
      const err = await sms('login_check', { code });
      setBusy(false);
      if (err) return toast.error(err);
    } else {
      const ch = await supabase.auth.mfa.challenge({ factorId: totp[0].id });
      if (ch.error) { setBusy(false); return toast.error(ch.error.message); }
      const { error } = await supabase.auth.mfa.verify({ factorId: totp[0].id, challengeId: ch.data.id, code });
      setBusy(false);
      if (error) return toast.error('Kod hatalı.');
    }
    setState('ok');
  };

  if (loading || state === 'ok') return <>{children}</>;
  if (state === 'checking') return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(65% 45% at 50% 0%, hsl(var(--primary) / 0.16), transparent 70%), radial-gradient(45% 35% at 50% 100%, hsl(var(--neon-cyan) / 0.10), transparent 70%)' }}
      />
      <Card className="sticker-card relative w-full max-w-md overflow-hidden rounded-3xl p-0">
        <div className="auth-band px-6 pb-12 pt-8 text-center">
          <EconLogo allWhite className="relative z-10 mx-auto h-8 w-36 sm:h-9 sm:w-40" />
        </div>
        <CardHeader className="-mt-8 space-y-3 pb-2 text-center">
          <div className="icon-tile mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-card">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            {state === 'enroll' ? 'İki adımlı doğrulamayı kurun' : 'İki adımlı doğrulama'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {state === 'enroll'
              ? 'Yönetici hesapları için iki adımlı doğrulama zorunludur. Devam etmek için bir yöntem ekleyin.'
              : method === 'sms' ? 'Telefonunuza gelen 6 haneli kodu girin.' : 'Doğrulayıcı uygulamadaki 6 haneli kodu girin.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          {state === 'enroll' ? (
            <TwoFactorEnroll onDone={() => void check()} />
          ) : (
            <>
              {totp.length > 0 && phone && (
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted/50 p-1">
                  <button
                    type="button"
                    onClick={() => { setMethod('totp'); setCode(''); }}
                    className={cn(
                      'flex h-9 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all',
                      method === 'totp' ? 'icon-tile' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Smartphone className="h-4 w-4" /> Uygulama
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMethod('sms'); setCode(''); }}
                    className={cn(
                      'flex h-9 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all',
                      method === 'sms' ? 'icon-tile' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <MessageSquare className="h-4 w-4" /> SMS
                  </button>
                </div>
              )}
              {method === 'sms' && (
                <Button variant="outline" className="h-11 w-full rounded-xl" disabled={busy} onClick={sendSms}>
                  {sent ? 'Kodu tekrar gönder.' : `${phone?.slice(0, 5)}•••${phone?.slice(-2)} numarasına kod gönder.`}
                </Button>
              )}
              <CodeInput value={code} onChange={setCode} />
              <Button variant="cta" className="h-11 w-full rounded-xl font-bold" disabled={busy || code.length !== 6} onClick={verify}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Doğrula.
              </Button>
            </>
          )}
          <Button variant="link" className="w-full text-muted-foreground" onClick={() => signOut()}>Çıkış yap.</Button>
        </CardContent>
      </Card>
    </div>
  );
};
