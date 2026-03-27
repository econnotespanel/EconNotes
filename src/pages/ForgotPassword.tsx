import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Mail, Info } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.info(
      'Şifre sıfırlama işlemi için lütfen yönetici ile iletişime geçin. E-posta: kaancolakogullari1@gmail.com',
      { duration: 8000 }
    );
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
          <CardDescription>Şifrenizi sıfırlamak için yönetici ile iletişime geçin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">
              Şifrenizi unuttuysanız, lütfen yönetici ile iletişime geçin. 
              Yönetici e-posta: <strong>kaancolakogullari1@gmail.com</strong>
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Kayıtlı E-posta Adresiniz</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="ornek@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
              </div>
            </div>
            <Button type="submit" className="w-full">Yönetici ile İletişime Geç</Button>
          </form>
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">Giriş sayfasına dön</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
