import React, { useEffect, useMemo, useState } from 'react';
import { Cake, CalendarDays, CheckCircle2, Info, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  needsBirthDateCompletion,
  parseBirthMonthDay,
  saveUserBirthDate,
} from '@/lib/birthdayPerk';

const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

function formatTurkishBirthDate(value: string): string | null {
  const parsed = parseBirthMonthDay(value);
  if (!parsed) return null;
  const monthName = TURKISH_MONTHS[parsed.month - 1];
  if (!monthName) return null;
  return `${parsed.day} ${monthName} ${parsed.year}`;
}

export const BirthDatePromptModal: React.FC = () => {
  const { user, profile, isApproved, loading, refreshProfile, signOut } = useAuth();
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Kullanıcı değiştiğinde yerel tamamlanma durumunu sıfırla
  useEffect(() => {
    setCompleted(false);
    setBirthDate('');
    setErrorMsg(null);
  }, [user?.id]);

  // Profil sayfası veya başka bir ekrandan doğum tarihi kaydedilirse anında kapan
  useEffect(() => {
    const onUpdated = () => setCompleted(true);
    window.addEventListener('econnotes:birthdate-updated', onUpdated);
    return () => window.removeEventListener('econnotes:birthdate-updated', onUpdated);
  }, []);

  const maxBirthDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d.toISOString().slice(0, 10);
  }, []);

  const shouldShow =
    !loading &&
    Boolean(user) &&
    Boolean(profile) &&
    isApproved &&
    !completed &&
    needsBirthDateCompletion(user, profile);

  const formattedPreview = useMemo(() => formatTurkishBirthDate(birthDate), [birthDate]);

  if (!shouldShow || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!birthDate.trim()) {
      setErrorMsg('Lütfen doğum tarihinizi seçin.');
      return;
    }

    setSaving(true);
    try {
      const res = await saveUserBirthDate(user, birthDate.trim());
      if (!res.ok) {
        setErrorMsg(res.error || 'Doğum tarihi kaydedilemedi. Lütfen tekrar deneyin.');
        return;
      }
      setCompleted(true);
      await refreshProfile();
      toast.success('Doğum tarihiniz EconNotes hesabınıza kaydedildi!', {
        description: 'Hesap bilgileriniz güncellendi. İyi çalışmalar dileriz.',
      });
    } catch {
      setErrorMsg('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={shouldShow} onOpenChange={() => {}}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-[94vw] sm:max-w-md rounded-3xl border border-primary/25 bg-background/95 p-5 sm:p-6 shadow-2xl backdrop-blur-2xl [&>button]:hidden"
      >
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-indigo-500 to-cyan-500 text-white shadow-lg shadow-primary/25">
              <Cake className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <Info className="h-3 w-3" />
                Bilgi Güncellemesi Gereklidir
              </span>
              <DialogTitle className="mt-1 text-lg font-bold tracking-tight">
                Doğum Tarihinizi Sisteme Girin
              </DialogTitle>
            </div>
          </div>

          <DialogDescription className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
            <strong>19 Kasım 2026</strong> tarihinden önce EconNotes&apos;a kayıt olan veya giriş yapan
            kullanıcılarımızın profil bilgilerini tamamlaması gerekmektedir. Devam edebilmek için
            lütfen doğum tarihinizi aşağıdan seçip sisteme kaydedin.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3.5 text-xs text-muted-foreground space-y-1.5">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="leading-relaxed">
              Doğum tarihiniz yalnızca hesabınızın güncel tutulması ve doğum gününüze özel
              <strong className="text-foreground"> sınırsız ders notu indirme &amp; sürpriz EconNotes haklarınızın</strong>{' '}
              tanımlanması amacıyla güvenle saklanır.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="legacy-birth-date-input" className="text-xs font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              Doğum Tarihiniz *
            </Label>
            <Input
              id="legacy-birth-date-input"
              type="date"
              required
              min="1940-01-01"
              max={maxBirthDate}
              value={birthDate}
              onChange={(e) => {
                setBirthDate(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              className="h-11 rounded-xl text-sm font-medium"
            />
            {formattedPreview && !errorMsg && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Seçilen tarih: {formattedPreview}
              </p>
            )}
            {errorMsg && (
              <p className="text-xs font-medium text-destructive">{errorMsg}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={saving || !birthDate}
            className="w-full h-11 rounded-2xl gradient-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20 gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Doğum Tarihimi Kaydet ve Devam Et
              </>
            )}
          </Button>
        </form>

        <div className="flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <span className="truncate max-w-[68%]">
            Hesap: <strong className="text-foreground">{user.email}</strong>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Çıkış Yap
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BirthDatePromptModal;
