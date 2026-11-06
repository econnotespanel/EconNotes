import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  ShieldCheck,
  Smartphone,
  MessageSquare,
  Trash2,
  Plus,
  Lock,
  Copy,
  Check,
  ChevronRight,
  ArrowLeft,
  KeyRound,
  Fingerprint,
  RotateCw,
  LogOut,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { OTPInput, OTPInputContext } from 'input-otp';
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

const maskPhone = (p?: string | null) => (p ? `${p.slice(0, 5)} ••• ${p.slice(-2)}` : '');

/* ------------------------------------------------------------------ */
/* Visual building blocks                                              */
/* ------------------------------------------------------------------ */

const OtpSlot = ({ index, error }: { index: number; error: boolean }) => {
  const ctx = useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = ctx?.slots?.[index] ?? { char: null, hasFakeCaret: false, isActive: false };
  return (
    <div
      className={cn(
        'relative flex h-14 w-11 items-center justify-center rounded-xl border-2 bg-muted/30 font-mono text-2xl font-bold transition-all duration-200 sm:h-16 sm:w-12',
        char ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
        isActive && 'scale-105 border-primary bg-background shadow-[0_0_0_4px_hsl(var(--primary)/0.18),0_8px_24px_-8px_hsl(var(--primary)/0.6)]',
        error && 'border-destructive bg-destructive/10 text-destructive shadow-none',
      )}
    >
      {char ? (
        <span className="animate-in zoom-in-50 fade-in duration-150">{char}</span>
      ) : (
        !hasFakeCaret && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      )}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-7 w-0.5 animate-caret-blink rounded-full bg-primary" />
        </div>
      )}
    </div>
  );
};

/** 6-digit segmented code field with paste, autofill and auto-submit support. */
const CodeInput = ({
  value,
  onChange,
  onComplete,
  error = false,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
  disabled?: boolean;
  id?: string;
}) => (
  <div className={cn('flex justify-center', error && 'animate-shake')}>
    <OTPInput
      id={id}
      aria-label="Doğrulama kodu"
      maxLength={6}
      value={value}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="^\d*$"
      autoFocus
      onChange={(v) => onChange(v.replace(/\D/g, ''))}
      onComplete={onComplete}
      containerClassName="flex items-center gap-2 has-[:disabled]:opacity-60"
    >
      <div className="flex gap-1.5 sm:gap-2">
        {[0, 1, 2].map((i) => <OtpSlot key={i} index={i} error={error} />)}
      </div>
      <div className="mx-0.5 h-0.5 w-3 rounded-full bg-border" />
      <div className="flex gap-1.5 sm:gap-2">
        {[3, 4, 5].map((i) => <OtpSlot key={i} index={i} error={error} />)}
      </div>
    </OTPInput>
  </div>
);

/** Shield emblem. */
const ShieldEmblem = ({ success = false, size = 'lg' }: { success?: boolean; size?: 'lg' | 'sm' }) => {
  const lg = size === 'lg';
  return (
    <div className={cn('relative mx-auto flex items-center justify-center', lg ? 'h-20 w-20' : 'h-10 w-10')}>
      <div
        className={cn(
          'relative flex items-center justify-center text-white shadow-lg transition-colors duration-300',
          lg ? 'h-20 w-20 rounded-[1.4rem] border-4 border-card' : 'h-10 w-10 rounded-xl',
          success
            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/40'
            : 'bg-gradient-to-br from-sky-400 via-primary to-indigo-600 shadow-primary/40',
        )}
      >
        {success ? (
          <Check className={cn(lg ? 'h-9 w-9' : 'h-5 w-5')} strokeWidth={3} />
        ) : (
          <ShieldCheck className={lg ? 'h-9 w-9' : 'h-5 w-5'} />
        )}
      </div>
    </div>
  );
};

const Stepper = ({ step }: { step: 1 | 2 | 3 }) => {
  const labels = ['Yöntem', 'Kurulum', 'Doğrula'];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={l} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary/15 text-primary ring-2 ring-primary',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
            </div>
            <span className={cn('text-xs font-semibold', active ? 'text-foreground' : 'text-muted-foreground')}>{l}</span>
            {n < 3 && <div className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-border')} />}
          </div>
        );
      })}
    </div>
  );
};

const MethodTile = ({ icon: Icon, tone = 'primary' }: { icon: typeof Smartphone; tone?: 'primary' | 'violet' }) => (
  <span
    className={cn(
      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md',
      tone === 'primary'
        ? 'bg-gradient-to-br from-sky-400 to-primary shadow-primary/30'
        : 'bg-gradient-to-br from-violet-400 to-indigo-600 shadow-indigo-500/30',
    )}
  >
    <Icon className="h-5 w-5" />
  </span>
);

/* ------------------------------------------------------------------ */
/* Enrollment                                                          */
/* ------------------------------------------------------------------ */

/** Enrollment UI: authenticator app (TOTP) or SMS. */
export const TwoFactorEnroll = ({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) => {
  const [mode, setMode] = useState<'totp' | 'phone' | null>(null);
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [phone, setPhone] = useState('+90');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return toast.error('6 haneli kodu girin.');
    setBusy(true);
    if (mode === 'phone') {
      const err = await sms('enroll_confirm', { phone, code: value });
      setBusy(false);
      if (err) { setError(true); return toast.error(err); }
    } else {
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error) { setBusy(false); return toast.error(ch.error.message); }
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: value });
      setBusy(false);
      if (error) { setError(true); return toast.error('Kod hatalı.'); }
    }
    toast.success('İki adımlı doğrulama etkinleştirildi.');
    onDone();
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Kopyalanamadı.');
    }
  };

  const reset = () => { setMode(null); setFactorId(''); setSent(false); setCode(''); setError(false); };
  const step: 1 | 2 | 3 = !mode ? 1 : mode === 'totp' || sent ? 3 : 2;

  if (!mode) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <Stepper step={1} />
        <div className="grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={startTotp}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-muted/30 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/10 disabled:opacity-60"
          >
            <MethodTile icon={Smartphone} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-bold">
                Doğrulayıcı uygulama
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-500">Önerilen</span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Google Authenticator, Authy veya Microsoft Authenticator ile çalışır.</span>
            </span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('phone')}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-muted/30 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/10 disabled:opacity-60"
          >
            <MethodTile icon={MessageSquare} tone="violet" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">SMS kodu</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Her girişte 6 haneli kod telefonunuza gönderilsin.</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </button>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onCancel}>Vazgeç</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <Stepper step={step} />

      {mode === 'totp' && qr && (
        <div className="space-y-4 text-sm">
          <p className="text-center text-muted-foreground">Doğrulayıcı uygulamanızla aşağıdaki QR kodu tarayın.</p>
          <div className="relative mx-auto w-fit rounded-3xl bg-white p-4 shadow-xl shadow-primary/20">
            {/* corner accents */}
            <span className="absolute left-1.5 top-1.5 h-5 w-5 rounded-tl-xl border-l-4 border-t-4 border-primary" />
            <span className="absolute right-1.5 top-1.5 h-5 w-5 rounded-tr-xl border-r-4 border-t-4 border-primary" />
            <span className="absolute bottom-1.5 left-1.5 h-5 w-5 rounded-bl-xl border-b-4 border-l-4 border-primary" />
            <span className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-br-xl border-b-4 border-r-4 border-primary" />
            <span className="pointer-events-none absolute left-4 right-4 h-0.5 animate-scan-line rounded-full bg-primary/70 shadow-[0_0_12px_2px_hsl(var(--primary)/0.6)]" />
            <img src={qr} alt="Doğrulama QR kodu" className="h-44 w-44" />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-2 pl-3">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate font-mono text-xs tracking-wider text-muted-foreground">{secret}</code>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs" onClick={copySecret}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'phone' && (
        <div className="space-y-2">
          <Label htmlFor="mfa-phone" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefon numarası</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg">🇹🇷</span>
            <Input
              id="mfa-phone"
              value={phone}
              disabled={sent}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
              inputMode="tel"
              className="h-12 rounded-xl pl-11 font-mono text-base tracking-wide"
            />
          </div>
          <Button
            variant={sent ? 'outline' : 'cta'}
            className="h-11 w-full gap-2 rounded-xl font-bold"
            disabled={busy}
            onClick={sendSms}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <RotateCw className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            {sent ? 'Kodu tekrar gönder' : 'Kod gönder'}
          </Button>
        </div>
      )}

      {(mode === 'totp' || sent) && (
        <div className="space-y-3">
          <Label htmlFor="mfa-code" className="block text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">6 haneli kod</Label>
          <CodeInput
            id="mfa-code"
            value={code}
            error={error}
            disabled={busy}
            onChange={(v) => { setCode(v); setError(false); }}
            onComplete={(v) => void verify(v)}
          />
          <Button variant="cta" className="h-12 w-full gap-2 rounded-xl font-bold" disabled={busy || code.length !== 6} onClick={() => verify()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Doğrula ve etkinleştir
          </Button>
        </div>
      )}

      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={reset}>
        <ArrowLeft className="h-4 w-4" /> Geri
      </Button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Profile card                                                        */
/* ------------------------------------------------------------------ */

const MethodRow = ({
  icon,
  tone,
  title,
  subtitle,
  onRemove,
}: {
  icon: typeof Smartphone;
  tone?: 'primary' | 'violet';
  title: string;
  subtitle: string;
  onRemove: () => Promise<void> | void;
}) => {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3 transition-all hover:border-primary/40 hover:bg-muted/50">
      <MethodTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
            <Check className="h-3 w-3" strokeWidth={3} /> Aktif
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {confirm ? (
        <Button
          size="sm"
          variant="destructive"
          className="h-8 rounded-lg px-3 text-xs font-bold animate-in fade-in zoom-in-95"
          disabled={busy}
          onClick={async () => { setBusy(true); await onRemove(); setBusy(false); setConfirm(false); }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Kaldır?'}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Kaldır"
          className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

const SecurityMeter = ({ count }: { count: number }) => {
  const level = Math.min(count, 2);
  const meta = [
    { label: 'Düşük', hint: 'Hesabınız yalnızca şifreyle korunuyor.', color: 'bg-amber-500', text: 'text-amber-500' },
    { label: 'İyi', hint: 'Yedek bir yöntem eklemek erişimi garantiye alır.', color: 'bg-sky-500', text: 'text-sky-500' },
    { label: 'Güçlü', hint: 'Hesabınız en üst seviyede korunuyor.', color: 'bg-emerald-500', text: 'text-emerald-500' },
  ][level];
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/50 to-muted/10 p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          <Fingerprint className="h-4 w-4" /> Güvenlik seviyesi
        </span>
        <span className={cn('font-bold', meta.text)}>{meta.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-1.5 overflow-hidden rounded-full bg-border">
            <div className={cn('h-full rounded-full transition-all duration-700', i <= level ? cn('w-full', meta.color) : 'w-0')} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{meta.hint}</p>
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
    if (error) return void toast.error('Kaldırılamadı: ' + error.message);
    toast.success('Doğrulama yöntemi kaldırıldı.');
    void load();
  };
  const removeSms = async () => {
    if (!guard() || !user) return;
    const { error } = await (supabase as any).from('sms_2fa').delete().eq('user_id', user.id);
    if (error) return void toast.error('Kaldırılamadı: ' + error.message);
    toast.success('SMS doğrulaması kaldırıldı.');
    void load();
  };

  return (
    <Card className="glass-card relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-3 text-lg">
          <ShieldEmblem size="sm" success={count > 0} />
          <span className="flex flex-col">
            <span className="flex items-center gap-2">
              İki Adımlı Doğrulama
              <span className="rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-sm">Yeni</span>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {isAdmin ? 'Yönetici hesapları için zorunludur.' : 'İsteğe bağlı · Hesabınızı ekstra güvenli hale getirir.'}
            </span>
          </span>
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              count > 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground',
            )}
          >
            <span className="relative flex h-2 w-2">
              {count > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', count > 0 ? 'bg-emerald-500' : 'bg-muted-foreground')} />
            </span>
            {count > 0 ? 'Etkin' : 'Kapalı'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-3">
        <SecurityMeter count={count} />

        {totp.map((f) => (
          <MethodRow
            key={f.id}
            icon={Smartphone}
            title="Doğrulayıcı uygulama"
            subtitle="Uygulamanızdaki 30 saniyelik kodlar"
            onRemove={() => removeTotp(f.id)}
          />
        ))}
        {phone && (
          <MethodRow
            icon={MessageSquare}
            tone="violet"
            title="SMS"
            subtitle={`Kodlar ${maskPhone(phone)} numarasına gönderilir`}
            onRemove={removeSms}
          />
        )}

        {adding ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <TwoFactorEnroll onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-3.5 text-sm font-semibold text-muted-foreground transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Plus className="h-4 w-4" />
            </span>
            {count > 0 ? 'Yedek yöntem ekle' : 'Yöntem ekle'}
          </button>
        )}
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* Login gate                                                          */
/* ------------------------------------------------------------------ */

/** Time allowed to enter the second-factor code before the session is closed. */
const CODE_WINDOW_SECONDS = 120;

const SessionTimer = ({ left, total }: { left: number; total: number }) => {
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const tone = left <= 10 ? 'danger' : left <= 30 ? 'warn' : 'ok';
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const r = 11;
  const circ = 2 * Math.PI * r;

  return (
    <div
      role="timer"
      aria-live={left <= 10 ? 'assertive' : 'off'}
      className={cn(
        'relative overflow-hidden rounded-2xl border px-3.5 py-2.5 transition-colors animate-in fade-in slide-in-from-top-1 duration-300',
        tone === 'ok' && 'border-primary/25 bg-primary/[0.06]',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/10',
        tone === 'danger' && 'border-destructive/50 bg-destructive/10',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            <svg className="h-7 w-7 -rotate-90" viewBox="0 0 28 28" aria-hidden>
              <circle cx="14" cy="14" r={r} fill="none" strokeWidth="2.5" className="stroke-border/70" />
              <circle
                cx="14"
                cy="14"
                r={r}
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct / 100)}
                className={cn(
                  'transition-[stroke-dashoffset] duration-300 ease-linear',
                  tone === 'ok' && 'stroke-primary',
                  tone === 'warn' && 'stroke-amber-500',
                  tone === 'danger' && 'stroke-destructive',
                )}
              />
            </svg>
            <Timer
              className={cn(
                'absolute h-3.5 w-3.5',
                tone === 'ok' && 'text-primary',
                tone === 'warn' && 'text-amber-500',
                tone === 'danger' && 'animate-pulse text-destructive',
              )}
            />
          </div>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-foreground">
              {tone === 'danger' ? 'Oturum kapanmak üzere' : 'Kalan doğrulama süresi'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Süre dolduğunda oturum otomatik kapatılır
            </p>
          </div>
        </div>
        <span
          className={cn(
            'rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums tracking-wider',
            tone === 'ok' && 'bg-primary/15 text-primary',
            tone === 'warn' && 'bg-amber-500/20 text-amber-500',
            tone === 'danger' && 'bg-destructive/20 text-destructive',
          )}
        >
          {mm}:{ss}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-border/50">
        <div
          className={cn(
            'h-full transition-[width] duration-300 ease-linear',
            tone === 'ok' && 'bg-gradient-to-r from-sky-400 to-primary',
            tone === 'warn' && 'bg-amber-500',
            tone === 'danger' && 'bg-destructive',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/** Blocks the app until the user passes their second factor; forces enrollment for admins. */
export const MfaGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [state, setState] = useState<'checking' | 'ok' | 'challenge' | 'enroll'>('checking');
  const [totp, setTotp] = useState<Factor[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [method, setMethod] = useState<'totp' | 'sms'>('totp');
  const [started, setStarted] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(CODE_WINDOW_SECONDS);
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  // Security window: starts as soon as the user initiates verification (`started`),
  // giving CODE_WINDOW_SECONDS before automatically terminating the session.
  useEffect(() => {
    if (state !== 'challenge' || !started || success) return;
    const deadline = Date.now() + CODE_WINDOW_SECONDS * 1000;
    setTimeLeft(CODE_WINDOW_SECONDS);
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        clearInterval(id);
        setCode('');
        setSent(false);
        setStarted(false);
        toast.error('Doğrulama süresi doldu. Güvenliğiniz için oturumunuz kapatıldı.');
        void signOutRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [state, started, success]);

  const check = useCallback(async () => {
    if (!user) {
      setStarted(false);
      setSent(false);
      setCode('');
      setError(false);
      setSuccess(false);
      setTimeLeft(CODE_WINDOW_SECONDS);
      return setState('ok');
    }
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
    setStarted(false);
    setSent(false);
    setCode('');
    setError(false);
    setSuccess(false);
    setTimeLeft(CODE_WINDOW_SECONDS);
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
    setStarted(true);
    toast.success('Kod telefonunuza gönderildi.');
  };

  const startTotpVerification = () => {
    setCode('');
    setError(false);
    setStarted(true);
  };

  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return;
    if (!started || timeLeft <= 0) return;
    setBusy(true);
    if (method === 'sms') {
      const err = await sms('login_check', { code: value });
      setBusy(false);
      if (err) { setError(true); return toast.error(err); }
    } else {
      const ch = await supabase.auth.mfa.challenge({ factorId: totp[0].id });
      if (ch.error) { setBusy(false); return toast.error(ch.error.message); }
      const { error } = await supabase.auth.mfa.verify({ factorId: totp[0].id, challengeId: ch.data.id, code: value });
      setBusy(false);
      if (error) { setError(true); return toast.error('Kod hatalı.'); }
    }
    setSuccess(true);
    setTimeout(() => setState('ok'), 900);
  };

  const switchMethod = (m: 'totp' | 'sms') => { setMethod(m); setCode(''); setError(false); };

  if (loading || state === 'ok') return <>{children}</>;
  if (state === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <ShieldEmblem size="sm" />
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Güvenlik kontrolü yapılıyor…</p>
      </div>
    );
  }

  const both = totp.length > 0 && !!phone;
  const canEnterCode = started && (method === 'totp' || sent);
  const description =
    state === 'enroll'
      ? 'Yönetici hesapları için iki adımlı doğrulama zorunludur. Devam etmek için bir yöntem ekleyin.'
      : success
        ? 'Kimliğiniz doğrulandı. Yönlendiriliyorsunuz…'
        : !started
          ? method === 'sms'
            ? 'Devam etmek için kayıtlı telefonunuza tek kullanımlık doğrulama kodu gönderin.'
            : 'Devam etmek için doğrulayıcı uygulamanız ile güvenlik doğrulamasını başlatın.'
          : method === 'sms'
            ? sent ? `${maskPhone(phone)} numarasına gönderilen 6 haneli kodu girin.` : 'Kayıtlı numaranıza doğrulama kodu gönderin.'
            : 'Doğrulayıcı uygulamanızdaki 6 haneli kodu girin.';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(65% 45% at 50% 0%, hsl(var(--primary) / 0.22), transparent 70%), radial-gradient(45% 35% at 50% 100%, hsl(var(--neon-cyan) / 0.12), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        style={{ backgroundImage: 'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '44px 44px' }}
      />

      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        {/* glow border */}
        <div aria-hidden className="absolute -inset-px rounded-[1.6rem] bg-gradient-to-b from-primary/50 via-primary/10 to-transparent opacity-70 blur-[1px]" />
        <Card className="sticker-card relative overflow-hidden rounded-3xl p-0">
          <div className="auth-band relative border-b border-white/10 px-5 pb-14 pt-5 sm:px-6 sm:pb-16 sm:pt-6">
            <div className="relative z-10 flex items-center justify-between gap-2.5">
              <EconLogo allWhite className="h-6 w-24 shrink-0 sm:h-7 sm:w-32 [&_img]:object-left" />
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white/95 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25),0_4px_14px_-4px_hsl(0_0%_0%/0.35)] backdrop-blur-md sm:px-3 sm:py-1.5 sm:text-[11px]">
                <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="whitespace-nowrap">Çift Faktörlü Güvenlik Modülü</span>
              </div>
            </div>
          </div>

          <CardHeader className="-mt-10 space-y-3 pb-2 text-center">
            <ShieldEmblem success={success} />
            <CardTitle className="pt-1 text-2xl font-extrabold tracking-tight">
              {state === 'enroll' ? 'İki adımlı doğrulamayı kurun' : success ? 'Doğrulandı!' : 'Kimliğinizi doğrulayın'}
            </CardTitle>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pb-6">
            {state === 'enroll' ? (
              <TwoFactorEnroll onDone={() => void check()} />
            ) : success ? (
              <div className="flex justify-center py-2">
                <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-full origin-left animate-in slide-in-from-left duration-700 rounded-full bg-emerald-500" />
                </div>
              </div>
            ) : (
              <>
                {both && (
                  <div className="relative grid grid-cols-2 rounded-2xl border border-border bg-muted/50 p-1">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute bottom-1 top-1 w-[calc(50%-0.25rem)] rounded-xl bg-gradient-to-r from-sky-500 to-primary shadow-lg shadow-primary/30 transition-transform duration-300 ease-out',
                        method === 'sms' ? 'translate-x-full' : 'translate-x-0',
                      )}
                      style={{ left: '0.25rem' }}
                    />
                    {(['totp', 'sms'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMethod(m)}
                        className={cn(
                          'relative z-10 flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors',
                          method === m ? 'text-white' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {m === 'totp' ? <Smartphone className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                        {m === 'totp' ? 'Uygulama' : 'SMS'}
                      </button>
                    ))}
                  </div>
                )}

                {started && <SessionTimer left={timeLeft} total={CODE_WINDOW_SECONDS} />}

                {method === 'totp' && !started && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3.5">
                      <MethodTile icon={Smartphone} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">Doğrulayıcı uygulama</p>
                        <p className="text-xs text-muted-foreground">Uygulamanızdaki 6 haneli tek kullanımlık kod</p>
                      </div>
                    </div>
                    <Button
                      variant="cta"
                      className="h-12 w-full gap-2 rounded-xl text-base font-bold"
                      onClick={startTotpVerification}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Doğrulamayı Başlat
                    </Button>
                  </div>
                )}

                {method === 'sms' && !sent && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3.5">
                      <MethodTile icon={MessageSquare} tone="violet" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kayıtlı numara</p>
                        <p className="font-mono text-sm font-bold tracking-wide">{maskPhone(phone)}</p>
                      </div>
                    </div>
                    <Button
                      variant="cta"
                      className="h-12 w-full gap-2 rounded-xl text-base font-bold"
                      disabled={busy}
                      onClick={sendSms}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Doğrulama Kodu Gönder
                    </Button>
                  </div>
                )}

                {method === 'sms' && sent && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2 text-xs">
                    <span className="truncate text-muted-foreground">
                      Kod <strong className="font-mono font-semibold text-foreground">{maskPhone(phone)}</strong> numarasına iletildi
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 gap-1 rounded-lg px-2 text-xs font-semibold"
                      disabled={busy}
                      onClick={sendSms}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                      Tekrar gönder
                    </Button>
                  </div>
                )}

                {canEnterCode && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CodeInput
                      key={method}
                      value={code}
                      error={error}
                      disabled={busy}
                      onChange={(v) => { setCode(v); setError(false); }}
                      onComplete={(v) => void verify(v)}
                    />
                    <Button
                      variant="cta"
                      className="h-12 w-full gap-2 rounded-xl text-base font-bold"
                      disabled={busy || code.length !== 6}
                      onClick={() => verify()}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Doğrula
                    </Button>
                  </div>
                )}

                {!started && (
                  <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                    <Timer className="h-3.5 w-3.5 text-primary" />
                    Doğrulama başlatıldığında kodu girmek için 2 dakika süreniz vardır.
                  </p>
                )}
              </>
            )}

            <div className="flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Şifreli bağlantı</span>
              <button type="button" onClick={() => signOut()} className="flex items-center gap-1 font-semibold transition-colors hover:text-destructive">
                <LogOut className="h-3.5 w-3.5" /> Çıkış yap
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
