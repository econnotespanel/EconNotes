import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Users, Shield, Zap, GraduationCap, MessageSquare, FileText, Megaphone, Sparkles, Monitor, Target, Bot } from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import { APP_VERSION_LABEL } from '@/lib/version';

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
      <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <div className="flex w-full justify-center">
            <EconLogo className="mx-auto h-14 w-64 max-w-full sm:h-16 sm:w-72" />
          </div>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            EconNotes, üniversite öğrencilerinin ders notlarına daha hızlı ulaşmasını ve yapay zeka destekli Çalışma Stüdyosu ile sınavlara en verimli şekilde hazırlanmasını sağlayan kapsamlı bir akademik platformdur.
          </p>
        </div>

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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="glass-card hover:shadow-xl transition-shadow">
              <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
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

        <div className="text-center space-y-2 pt-2 pb-6">
          <p className="text-xs text-muted-foreground">
            © 2026 EconNotes — Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-xs font-semibold text-primary font-mono shadow-xs">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {APP_VERSION_LABEL}
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default About;
