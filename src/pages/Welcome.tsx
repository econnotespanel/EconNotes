import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, BookOpen, Users, Rocket, MessageSquare, Bot, PartyPopper, ChevronRight, ChevronLeft } from 'lucide-react';
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

  const firstName = useMemo(() => {
    const name = profile?.full_name || (user?.user_metadata as any)?.full_name || '';
    return name.trim().split(' ')[0] || 'Öğrenci';
  }, [profile, user]);

  const slides: Slide[] = [
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
    try { localStorage.setItem('econnotes_welcome_seen', '1'); } catch {}
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
    <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center px-4 py-8">
      {/* Confetti stickers scattered around */}
      <FloatingStickers />

      <div className="relative w-full max-w-3xl">
        {/* Progress tape */}
        <div className="mb-4 flex items-center gap-3">
          <EconLogo className="h-10 w-40" />
          <div className="flex-1 h-3 border-2 border-foreground rounded-full bg-card overflow-hidden shadow-[3px_3px_0_0_hsl(var(--foreground))]">
            <div
              className="h-full transition-[width] duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, hsl(var(--sticker-pink)), hsl(var(--sticker-cyan)), hsl(var(--sticker-lime)))`,
              }}
            />
          </div>
          <span className="chip chip-cobalt !py-0.5">{step + 1}/{total}</span>
        </div>

        {/* Main sticker card */}
        <div
          key={step}
          className="relative sticker-card p-6 md:p-10 animate-fade-in"
          style={{ background: `linear-gradient(135deg, hsl(var(--card)) 60%, hsl(var(--${current.color}) / 0.35))` }}
        >
          {/* Corner sticker */}
          <div
            className="absolute -top-5 -left-5 w-16 h-16 rounded-2xl border-2 border-foreground grid place-items-center rotate-[-8deg] shadow-[4px_4px_0_0_hsl(var(--foreground))] text-3xl"
            style={{ background: `hsl(var(--${current.color}))` }}
            aria-hidden
          >
            {current.emoji}
          </div>

          {/* Tape decorations */}
          <span aria-hidden className="hidden md:block absolute -top-3 right-16 h-6 w-24 rotate-[8deg] tape-strip border-2 border-foreground" />

          <div className="pt-6 md:pt-4 md:pl-14">
            <div className="flex items-center gap-2 mb-3">
              <span className="chip chip-lilac !py-0.5">{current.eyebrow}</span>
              <Icon className="h-4 w-4 text-foreground/70" strokeWidth={2.5} />
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-[1.05]">
              <span className="wavy-underline">{current.title}</span>
            </h1>

            <p className="mt-4 md:mt-5 text-base md:text-lg text-foreground/80 max-w-2xl">
              {current.desc}
            </p>

            {current.bullets && (
              <ul className="mt-6 grid sm:grid-cols-3 gap-3">
                {current.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[3px_3px_0_0_hsl(var(--foreground))]"
                    style={{ transform: `rotate(${(i - 1) * 1.2}deg)` }}
                  >
                    <span
                      className="w-6 h-6 rounded-md border-2 border-foreground grid place-items-center text-[10px] font-black"
                      style={{ background: `hsl(var(--${current.color}))` }}
                    >
                      {i + 1}
                    </span>
                    <span className="leading-tight">{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Nav */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={finish}
                className="text-sm font-semibold text-foreground/60 hover:text-foreground underline underline-offset-4"
              >
                Turu atla
              </button>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button
                    variant="outline"
                    onClick={prev}
                    className="border-2 border-foreground shadow-[3px_3px_0_0_hsl(var(--foreground))] font-bold"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Geri
                  </Button>
                )}
                <Button
                  onClick={next}
                  className="gradient-primary font-black rounded-xl px-6"
                >
                  {step === total - 1 ? (
                    <>Panele Git <PartyPopper className="h-4 w-4 ml-2" /></>
                  ) : (
                    <>Devam <ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Dots */}
        <div className="mt-5 flex justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={i}
              aria-label={`Adım ${i + 1}`}
              onClick={() => setStep(i)}
              className={`h-3 rounded-full border-2 border-foreground transition-all duration-300 ${i === step ? 'w-10' : 'w-3 opacity-60 hover:opacity-100'}`}
              style={{ background: `hsl(var(--${s.color}))` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const FloatingStickers = () => {
  const items = [
    { emoji: '✨', top: '8%',  left: '6%',  color: 'sticker-pink',      rotate: -12, delay: 0 },
    { emoji: '📚', top: '18%', left: '88%', color: 'sticker-lime',      rotate: 10,  delay: 0.3 },
    { emoji: '🎓', top: '78%', left: '10%', color: 'sticker-cobalt',    rotate: -6,  delay: 0.6 },
    { emoji: '💡', top: '85%', left: '82%', color: 'sticker-tangerine', rotate: 14,  delay: 0.9 },
    { emoji: '🚀', top: '48%', left: '3%',  color: 'sticker-lilac',     rotate: -18, delay: 1.2 },
    { emoji: '🎯', top: '52%', left: '92%', color: 'sticker-cyan',      rotate: 8,   delay: 1.5 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      {items.map((it, i) => (
        <div
          key={i}
          className="absolute w-12 h-12 md:w-14 md:h-14 rounded-2xl border-2 border-foreground grid place-items-center text-2xl md:text-3xl shadow-[4px_4px_0_0_hsl(var(--foreground))] animate-wiggle"
          style={{
            top: it.top,
            left: it.left,
            background: `hsl(var(--${it.color}))`,
            transform: `rotate(${it.rotate}deg)`,
            animationDelay: `${it.delay}s`,
          }}
        >
          {it.emoji}
        </div>
      ))}
    </div>
  );
};

export default Welcome;
