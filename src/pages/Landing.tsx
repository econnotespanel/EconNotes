import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Brain,
  GraduationCap,
  MessageSquare,
  BookOpen,
  Megaphone,
  Lock,
  ShieldCheck,
  KeyRound,
  EyeOff,
  ServerCog,
  Sparkles,
  ArrowRight,
  Download,
  CheckCircle2,
  Layers,
  Zap,
} from 'lucide-react';
import { APP_VERSION_LABEL } from '@/lib/version';
import { AmbientShaderBackground } from '@/components/landing/AmbientShaderBackground';
import { ScrolltideNavbar } from '@/components/landing/ScrolltideNavbar';

const modules = [
  {
    icon: FileText,
    badge: 'Organize Arşiv',
    title: 'Ders Notu Paylaşımı',
    desc: 'PDF, PNG, JPG ve PPTX ders notlarını sınıf, bölüm ve ders bazında kategorilendirilmiş olarak kolayca paylaşın ve filtreleyin.',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    iconColor: 'text-cyan-400',
  },
  {
    icon: Brain,
    badge: 'AI Destekli',
    title: 'Çalışma Stüdyosu',
    desc: 'Yüklediğiniz ders notlarından otomatik bilgi kartları (flashcards), interaktif quizler ve hap konu özetleri üretin.',
    gradient: 'from-cyan-500/20 to-teal-500/20',
    iconColor: 'text-teal-300',
  },
  {
    icon: GraduationCap,
    badge: 'Sınav Hazırlığı',
    title: 'KPSS & Sınav Merkezi',
    desc: 'Yapay zekâ destekli denemeler, açıklamalı çözümlü sorular ve net takibiyle hedeflerinize emin adımlarla ilerleyin.',
    gradient: 'from-indigo-500/20 to-blue-500/20',
    iconColor: 'text-indigo-400',
  },
  {
    icon: MessageSquare,
    badge: 'Güvenli İletişim',
    title: 'Öğrenci Mesajlaşması',
    desc: 'Arkadaşlık tabanlı, yapay zekâ moderasyonlu ve şikâyet mekanizmalı korumalı özel mesajlaşma sistemi.',
    gradient: 'from-purple-500/20 to-indigo-500/20',
    iconColor: 'text-purple-300',
  },
  {
    icon: BookOpen,
    badge: '7/24 Rehber',
    title: 'Akademik AI Asistan',
    desc: 'Ders içeriklerinizi ve slaytlarınızı anında tarayan, zorlandığınız konuları açıklayan kişisel akademik koçunuz.',
    gradient: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-300',
  },
  {
    icon: Megaphone,
    badge: 'Anlık Bildirim',
    title: 'Duyurular & Kampüs',
    desc: 'Bölüm, fakülte ve üniversite duyurularını anlık takip edin, sınav veya program değişikliklerini kaçırmayın.',
    gradient: 'from-rose-500/20 to-pink-500/20',
    iconColor: 'text-rose-400',
  },
];

const securityItems = [
  {
    icon: Lock,
    title: '256-Bit SSL/TLS Şifreleme',
    desc: 'Tüm veri aktarımı 256-bit AES ve TLS 1.3 protokolüyle korunur; HTTP istekleri zorunlu olarak HTTPS’e yönlendirilir.',
  },
  {
    icon: ShieldCheck,
    title: 'Satır Bazlı Güvenlik (RLS)',
    desc: 'Veritabanındaki her kayıt, satır bazlı güvenlik politikalarıyla (RLS) yalnızca yetkilendirilmiş öğrenciye açılır.',
  },
  {
    icon: KeyRound,
    title: 'Bot Koruması & Captcha',
    desc: 'Yapay zekâ servisleri istek boyutu, oturum ve captcha doğrulamalarıyla kötüye kullanıma karşı 7/24 izlenir.',
  },
  {
    icon: EyeOff,
    title: 'Şifreli Not & Filigran',
    desc: 'Ders notları şifrelenebilir; görüntülenen içerikler dinamik filigranlanarak izinsiz sızdırmalar engellenir.',
  },
  {
    icon: ServerCog,
    title: 'Zaman Damgalı Denetim Kayıtları',
    desc: 'Kritik işlemler ve hesap hareketleri değiştirilemez denetim kayıtlarında güvenle saklanır.',
  },
  {
    icon: Sparkles,
    title: '6698 Sayılı KVKK Uyumu',
    desc: 'Veri minimizasyonu esasıyla yalnızca eğitim deneyiminizi geliştirmek için gerekli olan veriler işlenir.',
  },
];

const Landing = () => {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* ─── SCROLLSHADERS AMBIENT BACKGROUND ─── */}
      <AmbientShaderBackground />

      {/* ─── FLOATING PILL NAVBAR ─── */}
      <ScrolltideNavbar />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20 space-y-24 sm:space-y-32">
        {/* ─── HERO SECTION ─── */}
        <section className="text-center pt-8 sm:pt-14 space-y-6">
          {/* Headline */}
          <div className="space-y-2 max-w-4xl mx-auto">
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-foreground">
              Daha iyi notlar,{' '}
              <span className="bg-gradient-to-r from-[#003791] via-[#0070d1] to-[#00f0ff] bg-clip-text text-transparent">
                daha güçlü bir sen.
              </span>
            </h1>
          </div>

          {/* Subtitle */}
          <p className="mx-auto max-w-2xl text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
            Ders notları, yapay zekâlı çalışma stüdyosu, sınav hazırlığı ve üniversite topluluğu.
            EconNotes ile akademik hayatını bir üst seviyeye taşı.
          </p>

          {/* Hero Action CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              asChild
              size="lg"
              className="relative group rounded-full bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#00c6ff] px-7 py-6 text-sm font-bold text-white shadow-[0_0_30px_rgba(0,112,243,0.4)] transition-all hover:shadow-[0_0_40px_rgba(0,198,255,0.6)] hover:scale-105 active:scale-95"
            >
              <Link to="/register" className="flex items-center gap-2">
                <span>Hemen Başlayalım</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/20 bg-background/50 backdrop-blur-xl px-6 py-6 text-sm font-semibold hover:bg-white/10"
            >
              <Link to="/login">Zaten Hesabım Var</Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="ghost"
              className="rounded-full border border-border/60 px-5 py-6 text-sm font-medium hover:bg-white/10"
            >
              <Link to="/install" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>Uygulamayı İndir</span>
              </Link>
            </Button>
          </div>
        </section>

        {/* ─── ABOUT / MANIFESTO SECTION ─── */}
        <section className="relative rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] via-card/60 to-card/40 p-6 sm:p-10 backdrop-blur-2xl shadow-xl">
          <div className="absolute -top-10 left-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
              <Zap className="h-3.5 w-3.5" />
              <span>ÖĞRENCİLER İÇİN, ÖĞRENCİLER TARAFINDAN</span>
            </div>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              EconNotes Nedir?
            </h2>
            <div className="space-y-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
              <p>
                EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilen, öğrencilerin akademik
                yaşamını tek bir çatı altında düzenli, erişilebilir ve etkileşimli hale getiren yeni nesil
                bir akademik ekosistemdir.
              </p>
              <p>
                Sadece ders notu paylaşmakla kalmaz; yapay zekâ destekli Çalışma Stüdyosu, akıllı flashcard
                üretimi, interaktif quizler, güvenli öğrenci mesajlaşması ve KPSS merkeziyle
                akademik yolculuğunuzun her anında yanınızda yer alır.
              </p>
            </div>
          </div>
        </section>

        {/* ─── FEATURES MODULES GRID (Platformda Neler Var?) ─── */}
        <section id="ozellikler" className="space-y-8 scroll-mt-24">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">
              KAPSAMLI MODÜLLER
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Platformda Neler Var?
            </h2>
            <p className="max-w-xl mx-auto text-sm sm:text-base text-muted-foreground">
              Akademik başarınızı katlamak için tasarlanan tüm araçlar elinizin altında.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m.title}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] via-card/50 to-card/30 p-6 backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-cyan-400/40 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgba(0,112,243,0.15)]"
              >
                {/* Micro card ambient glow */}
                <div
                  className={`pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br ${m.gradient} blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md">
                      <m.icon className={`h-6 w-6 ${m.iconColor}`} />
                    </div>
                    <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                      {m.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display text-lg font-bold text-foreground group-hover:text-cyan-300 transition-colors">
                      {m.title}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {m.desc}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100">
                  <span>Keşfet</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── SECURITY & RELIABILITY INFRASTRUCTURE ─── */}
        <section id="guvenlik" className="space-y-8 scroll-mt-24">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              SIFIR TAVİZ GÜVENLİK
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Endüstri Standardı Güvenlik Altyapısı
            </h2>
            <p className="max-w-xl mx-auto text-sm sm:text-base text-muted-foreground">
              Akademik verileriniz, paylaştığınız notlar ve mesajlarınız en yüksek güvenlik standartlarıyla korunur.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {securityItems.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-xl shadow-sm space-y-2.5 transition-all hover:border-emerald-500/30 hover:bg-card/60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── BOTTOM CONVERSION BANNER ─── */}
        <section className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-r from-[#002f7a]/80 via-[#0047b3]/70 to-[#0070d1]/60 p-8 sm:p-14 text-center backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,112,243,0.3)]">
          <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-blue-600/30 blur-3xl" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-5">
            <h2 className="font-display text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Notların Hep Yanında Olsun.
            </h2>
            <p className="text-sm sm:text-base text-white/80 leading-relaxed">
              Ücretsiz hesabını saniyeler içinde oluştur; ders notlarına eriş, çalışma stüdyosuyla
              sınavlara hazırlan ve üniversite topluluğuna katıl.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-white text-blue-900 hover:bg-white/90 font-bold px-8 shadow-xl"
              >
                <Link to="/register">Ücretsiz Kayıt Ol</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/30 text-white hover:bg-white/10"
              >
                <Link to="/login">Giriş Yap</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="relative z-10 border-t border-white/10 py-10 text-center text-xs text-muted-foreground backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 space-y-3">
          <p className="flex items-center justify-center gap-3">
            <span>
              Destek:{' '}
              <a href="mailto:destek@econnotes.online" className="text-cyan-400 hover:underline">
                destek@econnotes.online
              </a>
            </span>
            <span>•</span>
            <Link to="/about" className="text-cyan-400 hover:underline">
              Hakkında ve KVKK
            </Link>
            <span>•</span>
            <Link to="/install" className="text-cyan-400 hover:underline">
              Yükleme Rehberi
            </Link>
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            © 2026 EconNotes — Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.{' '}
            <span className="font-mono text-cyan-400/80">{APP_VERSION_LABEL}</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
