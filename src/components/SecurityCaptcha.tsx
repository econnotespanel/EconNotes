import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, RefreshCw, Check } from 'lucide-react';

interface Props {
  /** Called whenever the verification state changes. */
  onVerifiedChange: (verified: boolean) => void;
  /** Increment to force a new question (e.g. after a failed submit). */
  resetKey?: number;
}

const randomInt = (min: number, max: number) => {
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
};

const SecurityCaptcha = ({ onVerifiedChange, resetKey = 0 }: Props) => {
  const [a, setA] = useState(() => randomInt(2, 9));
  const [b, setB] = useState(() => randomInt(2, 9));
  const [value, setValue] = useState('');

  const regenerate = useCallback(() => {
    setA(randomInt(2, 9));
    setB(randomInt(2, 9));
    setValue('');
    onVerifiedChange(false);
  }, [onVerifiedChange]);

  useEffect(() => {
    if (resetKey > 0) regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const verified = value.trim() !== '' && Number(value.trim()) === a + b;

  useEffect(() => {
    onVerifiedChange(verified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="captcha" className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Güvenlik Kodu
      </Label>
      <div className="flex items-center gap-2">
        <div
          className="select-none rounded-lg border border-border bg-muted px-3 py-2 font-display text-base font-semibold tracking-widest text-foreground"
          aria-hidden="true"
        >
          {a} + {b} = ?
        </div>
        <Input
          id="captcha"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Sonuç"
          aria-label={`Güvenlik doğrulaması: ${a} artı ${b} kaçtır?`}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          className="flex-1"
        />
        <button
          type="button"
          onClick={regenerate}
          title="Yeni soru"
          aria-label="Yeni güvenlik sorusu oluştur"
          className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {verified ? (
        <p className="flex items-center gap-1 text-xs text-success">
          <Check className="h-3 w-3" /> Doğrulama başarılı.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Otomatik botlara karşı koruma. Toplama işleminin sonucunu yazın.
        </p>
      )}
    </div>
  );
};

export default SecurityCaptcha;
