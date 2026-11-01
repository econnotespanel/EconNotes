import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, Rocket, BookOpen, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteConfig, MANAGED_PAGES } from '@/contexts/SiteConfigContext';

/**
 * Yönetici panelinden kapatılan sayfaları engeller. Yöneticiler kapalı sayfalara
 * bilgilendirme şeridi ile erişmeye devam eder.
 */
const PageGuard = ({ path, children }: { path: string; children: React.ReactNode }) => {
  const { isPageEnabled, loading } = useSiteConfig();
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isPageEnabled(path)) return <>{children}</>;

  const isStudy = path === '/study';
  const pageMeta = MANAGED_PAGES.find(p => p.path === path);
  const pageLabel = pageMeta?.label || 'Bu bölüm';

  if (isAdmin) {
    return (
      <>
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-warning/40 bg-warning/15 px-4 py-1.5 text-xs font-medium text-warning shadow-lg backdrop-blur-md">
          {isStudy
            ? 'Çalışma Stüdyosu şu anda kullanıcılara "Yeni Özellikler Ekleniyor" olarak görünüyor. Yönetici olarak görüntülüyorsunuz.'
            : `${pageLabel} şu anda kullanıcılara kapalı. Yönetici olarak görüntülüyorsunuz.`}
        </div>
        {children}
      </>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        {isStudy ? (
          <Card className="glass-card w-full max-w-lg border border-cyan-500/25 bg-gradient-to-b from-card/95 via-card/90 to-card/95 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
            <CardContent className="space-y-6 p-6 sm:p-8 text-center">
              {/* Parlayan İkon Kutusu */}
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300 shadow-[0_0_35px_rgba(34,211,238,0.3)]">
                <Sparkles className="h-8 w-8 text-cyan-400 animate-pulse" />
              </div>

              {/* Başlık ve Durum Rozeti */}
              <div className="space-y-2.5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  <Rocket className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Büyük Güncelleme Sürüyor</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-display">
                  Çalışma Stüdyosu'na Yeni Özellikler Ekleniyor!
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  Ders çalışma ve sınavlara hazırlanma deneyiminizi üst seviyeye taşımak için Çalışma Stüdyosu'na yeni nesil akademik araçlar ve yapay zekâ destekli interaktif özellikler ekliyoruz. Kısa süre içinde sizlerle olacağız!
                </p>
              </div>

              {/* Gelecek Özellikler Özeti */}
              <div className="rounded-2xl border border-border/70 bg-background/50 p-4 text-left space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Geliştirilen Yeni Teknolojiler
                </span>
                <ul className="space-y-1.5 text-xs text-foreground/85">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>İnteraktif ikili video dersleri ve görsel animasyonlar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>Yapay zekâ destekli akademik akıl hocası ve sesli soru-cevap</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>Akademik simülasyon laboratuvarı ve akıllı kavram ağı</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>Aralıklı tekrar bilgi kartları ve sınav hazırlık modu</span>
                  </li>
                </ul>
              </div>

              {/* Butonlar */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                <Button
                  onClick={() => navigate('/notes')}
                  className="w-full sm:w-auto rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold shadow-md shadow-cyan-500/20 gap-1.5"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Ders Notlarına Git</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="w-full sm:w-auto rounded-xl border-border hover:bg-accent text-foreground"
                >
                  Ana Sayfaya Dön
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-card max-w-md w-full">
            <CardContent className="space-y-4 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
                <Lock className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold text-foreground">{pageLabel} Geçici Olarak Kapatıldı</h1>
                <p className="text-sm text-muted-foreground">
                  Yönetici ekibi bu sayfayı bakım veya güncelleme amacıyla geçici olarak kapattı. Kısa süre içinde tekrar açılacaktır.
                </p>
              </div>
              <Button onClick={() => navigate('/')} className="rounded-xl">
                Ana sayfaya dön.
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default PageGuard;
