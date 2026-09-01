import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  BookOpen, Brain, MessageSquare, Megaphone, GraduationCap, FileText,
  ShieldCheck, Lock, KeyRound, EyeOff, ServerCog, ArrowRight, Sparkles, Download,
} from 'lucide-react';
import logo from '@/assets/econnotes-logo.png';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_VERSION } from '@/lib/version';

const modules = [
  { icon: FileText, title: 'Ders Notu Paylaşımı', desc: 'PDF, PNG, JPG ve PPTX notları sınıf, bölüm ve ders bazında kategorilendirilmiş biçimde paylaşın.' },
  { icon: Brain, title: 'Çalışma Stüdyosu', desc: 'Yüklediğiniz notlardan bilgi kartları, quizler ve konu özetleri üretin.' },
  { icon: GraduationCap, title: 'KPSS Merkezi', desc: 'Yapay zeka destekli denemeler, çözümlü sorular ve performans takibi.' },
  { icon: MessageSquare, title: 'Güvenli Mesajlaşma', desc: 'Arkadaşlık tabanlı, moderasyonlu ve şikayet mekanizmalı özel mesajlaşma.' },
  { icon: BookOpen, title: 'Akademik Asistan', desc: 'Ders içeriklerinizi tarayıp özetleyen, sorularınızı yanıtlayan akademik destek.' },
  { icon: Megaphone, title: 'Duyurular', desc: 'Akademik duyuruları anlık olarak takip edin, hiçbir gelişmeyi kaçırmayın.' },
];

const security = [
  { icon: Lock, title: '256 Bit SSL/TLS Şifreleme', desc: 'Tüm veri aktarımı 256 bit AES şifreleme ve TLS 1.3 protokolü ile korunur. HTTP istekleri otomatik olarak HTTPS üzerine yönlendirilir.' },
  { icon: ShieldCheck, title: 'Satır Bazlı Erişim Denetimi', desc: 'Veritabanındaki her kayıt, satır bazlı güvenlik politikaları (RLS) ile yalnızca yetkili kullanıcıya açılır.' },
  { icon: KeyRound, title: 'Bot Koruması ve Doğrulama', desc: 'Giriş ve kayıt adımlarında güvenlik kodu doğrulaması, e-posta onayı ve hesap silme için tek kullanımlık kod zorunluluğu.' },
  { icon: EyeOff, title: 'Şifreli Not ve Filigran', desc: 'Notlar şifre ile korunabilir; görüntülenen içerikler filigranlanarak izinsiz dağıtım engellenir.' },
  { icon: ServerCog, title: 'Denetim Kayıtları', desc: 'Kritik yönetici işlemleri ve hesap hareketleri zaman damgalı denetim kayıtlarında saklanır.' },
  { icon: Sparkles, title: 'KVKK Uyumu', desc: '6698 sayılı KVKK kapsamında veri minimizasyonu ilkesiyle yalnızca gerekli veriler işlenir.' },
];

const Landing = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="EconNotes logosu" className="h-9 w-9 object-contain" style={{ filter: 'var(--logo-filter)' }} />
            <span className="font-display text-lg font-bold text-foreground">EconNotes</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              title={theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}
            >
              {theme === 'dark' ? '☀️ Açık Mod' : '🌙 Koyu Mod'}
            </button>
            <Button asChild variant="outline" size="sm"><Link to="/login">Giriş Yap</Link></Button>
            <Button asChild size="sm"><Link to="/register">Kayıt Ol</Link></Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-12">
        {/* Hero */}
        <section className="space-y-6 text-center animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> 256 bit SSL ile korunan akademik platform
          </span>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight text-foreground md:text-5xl">
            Akademik hayatının tamamı <span className="gradient-text">tek bir platformda</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Ders notları, çalışma araçları, sınav hazırlığı ve iletişim. EconNotes, öğrencilerin akademik süreçlerini
            düzenli, erişilebilir ve etkileşimli hale getirir.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">Ücretsiz Hesap Oluştur <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/login">Zaten Hesabım Var</Link></Button>
          </div>
        </section>

        {/* EconNotes Nedir */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-foreground">EconNotes Nedir?</h2>
          <Card className="glass-card">
            <CardContent className="space-y-4 p-6 text-sm leading-relaxed text-muted-foreground md:text-base">
              <p>
                EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilen, öğrencilerin akademik yaşamını tek bir
                platform üzerinden daha düzenli, erişilebilir ve etkileşimli hale getirmeyi amaçlayan kapsamlı bir
                akademik platformdur. Öğrencilerin ders notlarını organize bir şekilde paylaşmalarını, akademik
                kaynaklara kolayca ulaşmalarını, birbirleriyle iletişim kurmalarını ve ders çalışmalarını tek bir çatı
                altında yürütmelerini sağlamaktadır.
              </p>
              <p>
                Platform; ders notlarının sınıf, bölüm ve ders bazında kategorilendirilmesinin yanı sıra Çalışma
                Stüdyosu, bilgi kartları, quizler, konu özetleri, güvenli mesajlaşma ve akademik asistan desteği gibi
                farklı çalışma ve iletişim araçlarını bir araya getirmektedir. Öğrencilerin yalnızca kaynaklara
                ulaşmasını değil, aynı zamanda öğrendiklerini pekiştirmesini, sınavlara hazırlanmasını ve akademik
                süreçlerini daha verimli şekilde yönetmesini hedeflemektedir.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Ne yapılıyor */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-foreground">Platformda Neler Var?</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <Card key={m.title} className="glass-card">
                <CardContent className="space-y-3 p-5">
                  <div className="w-fit rounded-xl bg-primary/10 p-2.5">
                    <m.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">{m.title}</h3>
                  <p className="text-sm text-muted-foreground">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Güvenlik */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-foreground">Güvenlik Altyapısı</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            EconNotes, akademik verilerinizi endüstri standardı güvenlik teknolojileriyle korur.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {security.map((s) => (
              <Card key={s.title} className="glass-card">
                <CardContent className="space-y-3 p-5">
                  <div className="w-fit rounded-xl bg-success/10 p-2.5">
                    <s.icon className="h-5 w-5 text-success" />
                  </div>
                  <h3 className="font-semibold text-foreground">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-border p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">Notların hep yanında olsun.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Hesabını oluştur, ders notlarını paylaş ve Çalışma Stüdyosu ile sınavlara hazırlanmaya hemen başla.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg"><Link to="/register">Kayıt Ol</Link></Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/install"><Download className="mr-2 h-4 w-4" /> Uygulamayı İndir</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <p>
          Destek: <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>
          {' · '}
          <Link to="/about" className="text-primary hover:underline">Hakkında ve KVKK</Link>
        </p>
        <p className="mt-1">© 2026 EconNotes — Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir. {APP_VERSION}</p>
      </footer>
    </div>
  );
};

export default Landing;
