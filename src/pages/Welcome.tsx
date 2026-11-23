import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_VERSION, APP_VERSION_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, BookOpen, Users, Rocket, MessageSquare, Bot, PartyPopper, ChevronRight, ChevronLeft, GraduationCap, Target, Trophy, Smartphone } from 'lucide-react';
import EconLogo from '@/components/EconLogo';

type Slide = {
  emoji: string;
  eyebrow: string;
  title: string;
  desc: string;
  color: string; // sticker var name
  icon: any;
  bullets?: string[];
};

const Welcome = () => {
  const navigate = useNavigate();
  const { profile, user, loading } = useAuth();
  const [step, setStep] = useState(0);
  const [params] = useSearchParams();
  const isReturn = params.get('mode') === 'return';

  const firstName = useMemo(() => {
    const name = profile?.full_name || (user?.user_metadata as any)?.full_name || '';
    return name.trim().split(' ')[0] || 'Öğrenci';
  }, [profile, user]);

  const newSlides: Slide[] = [
    {
      emoji: '👋',
      eyebrow: 'Aramıza hoş geldin',
      title: `Selam ${firstName}, EconNotes'a hoş geldin.`,
      desc: 'Bu kısa turda seni platformla tanıştıracağız. Sadece 30 saniyeni ayır.',
      color: 'sticker-pink',
      icon: Sparkles,
      bullets: ['Notlarını paylaş', 'Toplulukla tanış', 'Sınavlarda ezber boz'],
    },
    {
      emoji: '📚',
      eyebrow: 'Adım 1',
      title: 'Notların hep yanında.',
      desc: 'PDF, görsel ve döküman notlarını yükle, arkadaşlarınla paylaş. Her 2 indirmede 1 onaylı not yüklemen gerektiğini unutma.',
      color: 'sticker-cobalt',
      icon: BookOpen,
      bullets: ['Filigranlı güvenli PDF', 'Onaylı notlarla itibar kazan', 'Bölümüne özel içerikler'],
    },
    {
      emoji: '💬',
      eyebrow: 'Adım 2',
      title: 'Toplulukla bağlan.',
      desc: 'Arkadaşlarınla mesajlaş, canlı derslere katıl, duyuruları kaçırma. Kurallara uy, herkes için daha güzel bir alan yaratalım.',
      color: 'sticker-lime',
      icon: MessageSquare,
      bullets: ['Arkadaşlık tabanlı mesajlaşma', 'Canlı ders odaları', 'Anlık duyurular'],
    },
    {
      emoji: '🤖',
      eyebrow: 'Adım 3',
      title: 'Yapay zekâ arkadaşın hazır.',
      desc: 'Akademik Asistan ile notlarını özetle, Çalışma Stüdyosu\'nda flashcard ve quizler üret. Yapay zekâ senin için çalışsın.',
      color: 'sticker-cyan',
      icon: Bot,
      bullets: ['Notlardan otomatik özet', 'Flashcard & quiz üretimi', 'Video anlatımlı konu tekrarı'],
    },
    {
      emoji: '🚀',
      eyebrow: 'Hazırsın',
      title: 'Hadi başlayalım.',
      desc: 'Profiline uğrayıp fotoğrafını eklemeyi unutma. Panelde görüşmek üzere.',
      color: 'sticker-tangerine',
      icon: Rocket,
      bullets: ['Profil fotoğrafı ekle', 'İlk notunu yükle', 'Bir arkadaşına selam ver'],
    },
  ];

  const returnSlides: Slide[] = [
    {
      emoji: '👋', eyebrow: 'Tekrar hoş geldin', color: 'sticker-pink', icon: Sparkles,
      title: `${firstName}, seni özledik.`,
      desc: `Bir süredir görüşemedik. Bu sürede EconNotes epey değişti. ${APP_VERSION_LABEL} ile gelen yenilikleri kısaca gösterelim.`,
      bullets: ['Yenilenen tasarım', 'Yeni çalışma araçları', 'Daha güçlü güvenlik'],
    },
    {
      emoji: '🎓', eyebrow: 'Yeni', color: 'sticker-cobalt', icon: GraduationCap,
      title: 'Çalışma Stüdyosu yenilendi.',
      desc: 'Notlarından tek dokunuşla flashcard, test, özet ve infografik üret. İlerlemeni ve başarı oranını tek ekranda takip et.',
      bullets: ['Yapay zekâ ile materyal', 'İlerleme istatistikleri', 'Akıl Hocası desteği'],
    },
    {
      emoji: '🎯', eyebrow: 'Yeni', color: 'sticker-lime', icon: Target,
      title: 'KPSS Merkezi açıldı.',
      desc: 'Konu ve zorluk seçerek yapay zekâ destekli testler çöz, haftalık hedefler belirle ve tekrar planınla eksiklerini kapat.',
      bullets: ['Kişisel testler', 'PDF performans raporu', 'Akıllı tekrar planı'],
    },
    {
      emoji: '🏆', eyebrow: 'Yeni', color: 'sticker-tangerine', icon: Trophy,
      title: 'Puan, seri ve rozetler.',
      desc: 'Her gün giriş yaparak puan topla, serini koru, haftalık mini görevleri tamamla ve liderlik listesinde yüksel.',
      bullets: ['Günlük giriş puanı', 'Haftalık görevler', 'Liderlik listesi'],
    },
    {
      emoji: '📱', eyebrow: 'Hazırsın', color: 'sticker-cyan', icon: Smartphone,
      title: 'Telefonda da rahat.',
      desc: 'Mobil görünüm baştan düzenlendi. EconNotes’u ana ekranına ekleyerek uygulama gibi kullanabilirsin.',
      bullets: ['Yeni mobil menü', 'Ana ekrana ekle', 'Hızlı erişim kartları'],
    },
  ];
  const slides = isReturn ? returnSlides : newSlides;

  const total = slides.length;
  const current = slides[step];
  const Icon = current.icon;
  const progress = ((step + 1) / total) * 100;

  const next = () => {
    if (step < total - 1) setStep(step + 1);
    else finish();
  };
  const prev = () => step > 0 && setStep(step - 1);
  const finish = () => {
    try {
      localStorage.setItem('econnotes_welcome_seen', '1');
      if (user) localStorage.setItem(`econnotes_return_tour_${APP_VERSION}_${user.id}`, '1');
    } catch {}
    navigate('/');
  };

  useEffect(() => {
    // If somehow not authenticated, still allow guest preview but hint back to login
    if (!loading && !user) {
      const t = setTimeout(() => navigate('/login'), 4000);
      return () => clearTimeout(t);
    }
  }, [loading, user, navigate]);

  return (
    <div
      className="min-h-[100dvh] w-full relative overflow-x-clip flex items-center justify-center px-4 py-8"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      {/* Confetti stickers scattered around */}
      <FloatingStickers />

      <div className="relative w-full max-w-3xl">
        {/* Progress bar */}
        <div className="mb-5 flex items-center gap-3.5">
          <EconLogo className="h-8 w-auto shrink-0" />
          <div className="flex-1 h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#1b5ce5] via-[#2b73f5] to-[#5ba0ff] transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300 tabular-nums">
            {step + 1}/{total}
          </span>
        </div>

        {/* Clean 2026 onboarding card */}
        <div
          key={step}
          className="relative overflow-hidden rounded-[24px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-6 sm:p-9 shadow-[var(--panel-shadow)] animate-fade-in"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="rounded-full border border-blue-200/80 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300">
                {current.eyebrow}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
              {current.title}
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
              {current.desc}
            </p>

            {current.bullets && (
              <ul className="grid gap-3 pt-1 sm:grid-cols-3">
                {current.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-muted/40 px-3.5 py-3 text-xs sm:text-sm font-semibold text-foreground"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="leading-snug">{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Nav */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={finish}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Turu atla
              </button>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prev}
                    className="rounded-full"
                  >
                    <ChevronLeft className="h-4 w-4" /> Geri
                  </Button>
                )}
                <Button
                  type="button"
                  variant="cta"
                  onClick={next}
                  className="px-6"
                >
                  {step === total - 1 ? (
                    <>Panele Git <PartyPopper className="h-4 w-4" /></>
                  ) : (
                    <>Devam <ChevronRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Dots */}
        <div className="mt-5 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Adım ${i + 1}`}
              onClick={() => setStep(i)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-9 bg-primary'
                  : 'w-2.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const FloatingStickers = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div className="absolute -top-32 right-1/4 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
    <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
  </div>
);

export default Welcome;
