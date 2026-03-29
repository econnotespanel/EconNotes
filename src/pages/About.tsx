import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Users, Shield, Zap, GraduationCap, MessageSquare, FileText, Megaphone } from 'lucide-react';
import logo from '@/assets/econnotes-logo.png';

const About = () => {
  const features = [
    { icon: FileText, title: 'Ders Notu Paylaşımı', desc: 'PDF, PNG, JPG, PPTX formatlarında ders notlarınızı paylaşın ve keşfedin.' },
    { icon: GraduationCap, title: 'Ders Klasörleri', desc: 'Notlar derslerine göre organize edilir, kolayca bulabilirsiniz.' },
    { icon: MessageSquare, title: 'Mesajlaşma', desc: 'Arkadaşlarınızla güvenli özel mesajlaşma imkanı.' },
    { icon: Megaphone, title: 'Duyurular', desc: 'Önemli akademik duyuruları anlık olarak takip edin.' },
    { icon: Shield, title: 'Güvenlik', desc: 'Şifreli not paylaşımı ve gelişmiş moderasyon sistemi.' },
    { icon: Users, title: 'Topluluk', desc: 'Arkadaşlık sistemi ile akademik ağınızı genişletin.' },
  ];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="EconNotes" className="h-20 w-20 object-contain" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">EconNotes Panel</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            EconNotes Panel, üniversite öğrencilerinin ders notlarına daha iyi, hızlı ve pratik bir şekilde ulaşabilmesini sağlayan bir ders notu paylaşım modülüdür.
          </p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Hakkımızda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiş bir akademik platform olup, 
              öğrencilerin ders notlarını organize bir şekilde paylaşmalarını, akademik kaynaklara kolayca 
              erişmelerini ve birbirleriyle iletişim kurmalarını sağlamaktadır.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Platformumuz, ders notlarının sınıf, bölüm ve ders bazında sınıflandırılmasını, 
              güvenli mesajlaşma sistemini, duyuru takibini ve akademik asistan desteğini 
              tek bir çatı altında sunmaktadır.
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
                Teknik destek ve önerileriniz için: <a href="mailto:econnotespanel@gmail.com" className="text-primary hover:underline">econnotespanel@gmail.com</a>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2026 EconNotes Panel — Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
        </p>
      </div>
    </Layout>
  );
};

export default About;
