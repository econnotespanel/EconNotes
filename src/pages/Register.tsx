import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import { Eye, EyeOff, Mail, Lock, User, GraduationCap, Building } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    university: '',
    department: '',
    grade: '1',
  });
  const [acceptRules, setAcceptRules] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.password || !formData.university || !formData.department) {
      toast.error('Lütfen tüm alanları doldurun.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }
    if (formData.password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (!acceptRules) {
      toast.error('Panel kurallarını kabul etmeniz gerekmektedir.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          university: formData.university,
          department: formData.department,
          grade: parseInt(formData.grade),
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Kayıt başarıyla tamamlandı! Giriş yapabilirsiniz.');
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-primary relative overflow-hidden">
      <div className="absolute inset-0 decorative-lines opacity-10" />
      <Card className="w-full max-w-md glass-card animate-fade-in relative z-10 max-h-[90vh] overflow-y-auto">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src={logo} alt="EconNotes" className="h-14 w-14 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold">Kayıt Ol</CardTitle>
          <CardDescription>EconNotes paneline katılın</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Ad Soyad</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="fullName" placeholder="Ad Soyad" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="ornek@mail.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="university">Üniversite</Label>
              <div className="relative">
                <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="university" placeholder="Üniversite adını yazın" value={formData.university} onChange={(e) => setFormData({...formData, university: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">Bölüm</Label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="department" placeholder="Bölüm adını yazın" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sınıf</Label>
              <Select value={formData.grade} onValueChange={(v) => setFormData({...formData, grade: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1. Sınıf</SelectItem>
                  <SelectItem value="2">2. Sınıf</SelectItem>
                  <SelectItem value="3">3. Sınıf</SelectItem>
                  <SelectItem value="4">4. Sınıf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="pl-10 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Şifre Tekrar</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} className="pl-10" />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="rules" checked={acceptRules} onCheckedChange={(v) => setAcceptRules(v as boolean)} />
              <Label htmlFor="rules" className="text-xs leading-tight cursor-pointer">
                Panel kurallarını okudum ve kabul ediyorum. Paylaşılan içeriklerden sorumluluk tarafıma aittir.
              </Label>
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
              {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Hesabınız var mı? <Link to="/login" className="text-primary hover:underline">Giriş Yap</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
