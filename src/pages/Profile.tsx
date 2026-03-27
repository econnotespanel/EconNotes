import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { User, Mail, Building, GraduationCap, Calendar, Camera, Trash2, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    university: profile?.university || '',
    department: profile?.department || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const handleUpdate = async () => {
    const { error } = await supabase.from('profiles').update(form).eq('user_id', user!.id);
    if (error) { toast.error('Güncellenemedi.'); return; }
    toast.success('Profil güncellendi!');
    setEditing(false);
    refreshProfile();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${user!.id}/avatar.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) { toast.error('Yüklenemedi.'); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('user_id', user!.id);
    toast.success('Profil fotoğrafı güncellendi!');
    refreshProfile();
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPass !== passwordForm.confirm) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }
    if (passwordForm.newPass.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
    if (error) { toast.error('Şifre değiştirilemedi: ' + error.message); return; }
    toast.success('Şifre başarıyla değiştirildi!');
    setShowPasswordChange(false);
    setPasswordForm({ current: '', newPass: '', confirm: '' });
  };

  const handleDeleteAccount = async () => {
    // Sign out and delete profile
    await supabase.from('profiles').delete().eq('user_id', user!.id);
    await signOut();
    toast.success('Hesabınız silindi.');
    navigate('/login');
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Profilim</h1>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="text-2xl gradient-primary text-primary-foreground">
                    {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground cursor-pointer hover:opacity-80">
                  <Camera className="h-4 w-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">{profile?.full_name || 'Kullanıcı'}</h2>
                <p className="text-sm text-muted-foreground">Öğrenci</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">E-posta</p>
                  <p className="text-sm font-medium">{user?.email}</p>
                </div>
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div><Label>Ad Soyad</Label><Input value={form.full_name} onChange={(e) => setForm({...form, full_name: e.target.value})} /></div>
                  <div><Label>Üniversite</Label><Input value={form.university} onChange={(e) => setForm({...form, university: e.target.value})} /></div>
                  <div><Label>Bölüm</Label><Input value={form.department} onChange={(e) => setForm({...form, department: e.target.value})} /></div>
                  <div className="flex gap-2">
                    <Button onClick={handleUpdate}>Kaydet</Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>İptal</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Ad Soyad</p>
                      <p className="text-sm font-medium">{profile?.full_name || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Üniversite</p>
                      <p className="text-sm font-medium">{profile?.university || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Bölüm</p>
                      <p className="text-sm font-medium">{profile?.department || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Sınıf</p>
                      <p className="text-sm font-medium">{profile?.grade ? `${profile.grade}. Sınıf` : '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Kayıt Tarihi</p>
                      <p className="text-sm font-medium">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('tr-TR') : '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Son Giriş</p>
                      <p className="text-sm font-medium">{profile?.last_login ? new Date(profile.last_login).toLocaleString('tr-TR') : '-'}</p>
                    </div>
                  </div>
                  <Button onClick={() => { setForm({ full_name: profile?.full_name || '', university: profile?.university || '', department: profile?.department || '' }); setEditing(true); }}>
                    Profili Düzenle
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Lock className="h-5 w-5" /> Şifre Değiştir</CardTitle>
          </CardHeader>
          <CardContent>
            {showPasswordChange ? (
              <div className="space-y-3">
                <div><Label>Yeni Şifre</Label><Input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm({...passwordForm, newPass: e.target.value})} /></div>
                <div><Label>Yeni Şifre Tekrar</Label><Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})} /></div>
                <div className="flex gap-2">
                  <Button onClick={handlePasswordChange}>Şifreyi Değiştir</Button>
                  <Button variant="outline" onClick={() => setShowPasswordChange(false)}>İptal</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowPasswordChange(true)}>Şifre Değiştir</Button>
            )}
          </CardContent>
        </Card>

        {/* Delete Account */}
        <Card className="glass-card border-destructive/20">
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2"><Trash2 className="h-5 w-5" /> Hesabı Sil</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Hesabımı Sil</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hesabınızı silmek istediğinize emin misiniz?</AlertDialogTitle>
                  <AlertDialogDescription>Bu işlem geri alınamaz. Tüm verileriniz silinecektir.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>İptal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount}>Evet, Hesabımı Sil</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Profile;
