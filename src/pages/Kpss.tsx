import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import EconLogo from '@/components/EconLogo';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Layers,
  ListChecks,
  Target,
  Trophy,
} from 'lucide-react';

const ECONKPSS_URL = 'https://econkpss.online';

const Kpss = () => {
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const handleGoEconKpss = () => {
    window.open(ECONKPSS_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6 py-2 sm:py-6 animate-fade-in">
        {/* Ana EconKPSS Taşınma & Yönlendirme Kartı */}
        <Card className="overflow-hidden rounded-[26px] border border-primary/30 bg-card/95 shadow-[0_20px_60px_rgba(0,55,145,0.14)] backdrop-blur-xl">
          {/* Üst EconNotes Kobalt-Mavi Başlık Alanı */}
          <div
            className={cn(
              'relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10 text-white',
              isNovember10
                ? 'bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900'
                : 'bg-gradient-to-br from-[#001845] via-[#003791] to-[#0070d1]',
            )}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-blue-400/20 blur-2xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

            <div className="relative z-10 flex flex-wrap items-center gap-3.5 sm:gap-4 mb-6">
              <EconLogo allWhite className="h-7 sm:h-8 w-auto" />
              <span className="h-6 w-px bg-white/30" aria-hidden="true" />
              <span className="inline-flex h-7 sm:h-8 shrink-0 items-center">
                <img
                  src="/econkpss-logo.png"
                  alt="EconKPSS"
                  className={cn(
                    'h-full w-auto max-h-full object-contain object-center select-none',
                    isNovember10 && 'grayscale contrast-125',
                  )}
                />
              </span>
            </div>

            <div className="relative z-10 max-w-2xl space-y-3">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/12 text-cyan-200 shadow-lg backdrop-blur-md mb-1">
                <Target className="h-7 w-7" />
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                KPSS Merkezi artık EconKPSS’e taşındı!
              </h1>
              <p className="text-sm sm:text-base leading-relaxed text-blue-100/90">
                KPSS hazırlıklarına artık tamamen KPSS öğrencileri için özel olarak geliştirilen{' '}
                <strong className="font-bold text-white">EconKPSS (econkpss.online)</strong> platformu
                üzerinden kesintisiz ve çok daha kapsamlı şekilde devam edebilirsin.
              </p>
            </div>
          </div>

          {/* Alt Özellikler ve Yönlendirme Butonu */}
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid gap-3.5 sm:grid-cols-2">
              {[
                {
                  icon: ListChecks,
                  title: 'ÖSYM Tarzı Soru Bankası & Denemeler',
                  desc: 'Genel Yetenek, Genel Kültür, Eğitim Bilimleri ve A Grubu Alan Bilgisi (İktisat, Maliye, Hukuk, Muhasebe) testleri.',
                },
                {
                  icon: BookOpen,
                  title: 'KPSS Odaklı Konu Özetleri',
                  desc: 'Sınavda en çok çıkan konular, kritik ayrımlar, tablolar ve nokta atışı ders notları.',
                },
                {
                  icon: Layers,
                  title: 'Bilgi Kartları & Akıllı Tekrar',
                  desc: 'Zayıf olduğun konuları tespit eden tekrar planlayıcısı ve hızlı ezber kartları.',
                },
                {
                  icon: Trophy,
                  title: 'Performans & Net Takibi',
                  desc: 'Çözdüğün denemelerin detaylı konu analizi ve hedef net ilerleme grafikleri.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-3.5 rounded-2xl border border-border/70 bg-background/60 p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.08] via-card to-cyan-500/[0.06] p-4 sm:p-5">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <CheckCircle2 className="hidden sm:block h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-bold text-foreground">
                    KPSS hazırlıklarına EconKPSS üzerinden devam et
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Butona tıkladığında doğrudan resmi <b>econkpss.online</b> adresine yönlendirileceksin.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={handleGoEconKpss}
                className={cn(
                  'w-full sm:w-auto shrink-0 gap-2 rounded-xl px-6 font-bold text-white shadow-lg',
                  isNovember10
                    ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] hover:opacity-95 shadow-blue-600/25',
                )}
              >
                <span>EconKPSS’e Git</span>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Kpss;
