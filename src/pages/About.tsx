import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Shield, Zap, GraduationCap, MessageSquare, FileText, Megaphone, Sparkles, Monitor, Target, Bot } from 'lucide-react';
import EconLogo from '@/components/EconLogo';

const About = () => {
  const features = [
    { icon: Sparkles, title: 'Çalışma Stüdyosu & Yapay Zeka', desc: 'İnteraktif ikili video dersleri, akıllı tahta şemaları, slayt özetleri ve sınav odaklı bilgi kartları.' },
    { icon: FileText, title: 'Ders Notu Paylaşımı', desc: 'PDF, slayt ve dokümanları lisanslı ve güvenli görüntüleyici ile kolayca keşfedin.' },
    { icon: GraduationCap, title: 'Ders & Sınıf Klasörleri', desc: 'Notlar fakülte, bölüm, sınıf ve derslerine göre anında organize edilir.' },
    { icon: Bot, title: 'Yapay Zeka Akademik Asistan', desc: 'Dersleriniz, formülleriniz ve sınav konularınız için 7/24 akıllı rehberlik.' },
    { icon: Target, title: 'KPSS & Sınav Hazırlık', desc: 'Hedef belirleme, deneme takibi ve kişiselleştirilmiş soru tekrarları.' },
    { icon: Monitor, title: 'Masaüstü & Mobil Uygulama', desc: 'Windows kurulumlu masaüstü istemcisi ve akıcı Apple Liquid Glass mobil deneyimi.' },
    { icon: MessageSquare, title: 'Güvenli Mesajlaşma', desc: 'Öğrenci arkadaşlarınızla anlık, şifreli ve güvenli akademik iletişim.' },
    { icon: Megaphone, title: 'Akademik Duyurular', desc: 'Bölüm ve ders duyurularını anlık bildirimlerle kaçırmadan takip edin.' },
    { icon: Shield, title: 'Veri & Lisans Güvenliği', desc: 'Gelişmiş moderasyon, kötüye kullanım filtreleri ve şifreli veri saklama.' },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#06183d] via-[#0b2a6e] to-[#0f3a8f] px-6 py-8 text-center text-white shadow-[0_16px_40px_-14px_rgba(7,26,66,0.45)] sm:px-10 sm:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="relative z-10 space-y-4">
            <div className="flex w-full justify-center">
              <EconLogo allWhite className="mx-auto h-11 w-48 max-w-full sm:h-12 sm:w-56" />
            </div>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-blue-100/90 sm:text-base">
              EconNotes, üniversite öğrencilerinin ders notlarına daha hızlı ulaşmasını ve yapay zekâ destekli Çalışma Stüdyosu ile sınavlara en verimli şekilde hazırlanmasını sağlayan kapsamlı bir akademik platformdur.
            </p>
          </div>
        </section>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> EconNotes Hakkında
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiş modern bir akademik platform olup, 
              öğrencilerin ders notlarını organize bir şekilde paylaşmalarını, akademik kaynaklara kolayca 
              erişmelerini, yapay zeka destekli Çalışma Stüdyosu ile sınavlara hazırlanmalarını ve birbirleriyle güvenle 
              iletişim kurmalarını sağlamaktadır.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              EconNotes yalnızca İktisat bölümü için değil; <strong>İktisat, Siyaset Bilimi ve Kamu Yönetimi, Uluslararası İlişkiler, Mühendislik, Eğitim, Tıp, Fen-Edebiyat, Sağlık Bilimleri, İşletme, Spor Bilimleri, Ziraat ve Hukuk</strong> başta olmak üzere tüm üniversite fakülte ve bölümlerinde okuyan öğrenciler için tasarlanmıştır.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Platformumuz; ders notlarının sınıf, bölüm ve ders bazında filtrelenmesini, interaktif video dersleri, 
              bilgi kartları, kısa sınavlar, KPSS hazırlık paneli, güvenli mesajlaşma sistemini, duyuru takibini ve 
              7/24 yapay zeka akademik asistan desteğini tek bir çatı altında sunmaktadır.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Windows masaüstü uygulaması ve iOS / Android tam ekran mobil uyumluluğu (PWA) ile öğrenciler internet 
              bağlantısı olan her cihazdan kesintisiz bir çalışma deneyimine ulaşabilirler.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="glass-card transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300/80 dark:hover:border-blue-500/40">
              <CardContent className="flex flex-col items-start gap-3 p-5 text-left">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                  <f.icon className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass-card">
          <CardContent className="p-5 flex items-center gap-4">
            <Zap className="h-8 w-8 text-warning shrink-0" />
            <div>
              <h3 className="font-semibold">İletişim & Destek</h3>
              <p className="text-sm text-muted-foreground">
                Teknik destek ve önerileriniz için: <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> KVKK Bilgilendirmesi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              EconNotes, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında 
              kullanıcılarının kişisel verilerini koruma altına almaktadır.
            </p>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Toplanan Bilgiler</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Ad-Soyad:</strong> Kullanıcı kimliğinin doğrulanması ve profil oluşturulması amacıyla toplanır.</li>
                <li><strong>E-posta Adresi:</strong> Hesap girişi, şifre sıfırlama ve iletişim amacıyla kullanılır.</li>
                <li><strong>Üniversite Adı:</strong> Akademik topluluk doğrulaması ve not sınıflandırması için toplanır.</li>
                <li><strong>Bölüm Bilgisi:</strong> Ders notu sınıflandırması ve öneriler için kullanılır.</li>
                <li><strong>Sınıf Bilgisi:</strong> Ders notlarının sınıf bazında filtrelenmesi amacıyla toplanır.</li>
                <li><strong>Aktivite Kayıtları:</strong> Platform güvenliği ve moderasyon amacıyla giriş, not yükleme/silme işlemleri kaydedilir.</li>
                <li><strong>IP Adresi:</strong> Güvenlik ve kötüye kullanım tespiti amacıyla işlenir.</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Verilerin Kullanım Amacı</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Platform hizmetlerinin sunulması ve iyileştirilmesi</li>
                <li>Kullanıcı hesap güvenliğinin sağlanması</li>
                <li>Ders notu paylaşım ve mesajlaşma hizmetlerinin yürütülmesi</li>
                <li>Platform kurallarının uygulanması ve moderasyon</li>
                <li>Yasal yükümlülüklerin yerine getirilmesi</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Verilerin Saklanması ve Paylaşımı</h4>
              <p>
                Kişisel verileriniz şifreli bağlantılar (SSL/TLS) üzerinden iletilmekte ve güvenli sunucularda 
                saklanmaktadır. Verileriniz, yasal zorunluluklar dışında üçüncü şahıslarla paylaşılmamaktadır.
                Hesabınızı sildiğinizde kişisel verileriniz sistemden kaldırılır.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Haklarınız</h4>
              <p>
                KVKK kapsamındaki haklarınız (kişisel verilerinize erişim, düzeltme, silme, işlenmesine itiraz, 
                veri taşınabilirliği) için{' '}
                <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>{' '}
                adresinden bizimle iletişime geçebilirsiniz.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center pt-2 pb-4">
          <p className="text-xs text-muted-foreground">
            © 2026 EconNotes — Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default About;
