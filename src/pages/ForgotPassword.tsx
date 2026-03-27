import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Mail, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Lütfen e-posta adresinizi girin.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (error) {
      toast.error('Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar deneyin.');
    } else {
      setSent(true);
      toast.success('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-primary relative overflow-hidden">
      <div className="absolute inset-0 decorative-lines opacity-10" />
      <Card className="w-full max-w-md glass-card animate-fade-in relative z-10">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src={logo} alt="EconNotes" className="h-14 w-14 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">Şifremi Unuttum</CardTitle>
          <CardDescription>Kayıtlı e-posta adresinize şifre sıfırlama bağlantısı göndereceğiz</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-foreground">
                Şifre sıfırlama bağlantısı <strong>{email}</strong> adresine gönderildi. Lütfen e-posta kutunuzu kontrol edin.
              </p>
              <p className="text-xs text-muted-foreground">
                E-posta gelmedi mi? Spam/gereksiz klasörünü de kontrol edin.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Kayıtlı E-posta Adresiniz</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="ornek@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                </div>
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
                {loading ? 'Gönderiliyor...' : 'Şifre Sıfırlama Bağlantısı Gönder'}
              </Button>
            </form>
          )}
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">Giriş sayfasına dön</Link>
          </p>
        </CardContent>
      </Card>
      <p className="absolute bottom-4 right-4 text-xs text-white/60 z-10">Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</p>
    </div>
  );
};

export default ForgotPassword;
