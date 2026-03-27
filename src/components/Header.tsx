import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { LogOut, Sun, Moon, Bell, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import logo from '@/assets/econnotes-logo.png';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const Header = () => {
  const { user, profile, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 16) return 'İyi Günler';
    if (hour >= 17 && hour <= 20) return 'İyi Akşamlar';
    return 'İyi Geceler';
  };

  const handleLogout = async () => {
    await signOut();
    toast.success('Çıkış başarılı!');
    navigate('/login');
  };

  const formatLastLogin = () => {
    if (!profile?.last_login) return '';
    const date = new Date(profile.last_login);
    return date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-card/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <img 
            src={logo} 
            alt="EconNotes" 
            className="h-8 w-8 object-contain"
            style={{ filter: 'var(--logo-filter)' }}
          />
          <span className="text-lg font-bold gradient-text hidden sm:block">EconNotes</span>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {profile && (
            <div className="hidden md:flex flex-col items-end text-xs">
              <span className="font-semibold text-foreground">
                {getGreeting()}, {profile.full_name}
              </span>
              {profile.last_login && (
                <span className="text-muted-foreground">Son giriş: {formatLastLogin()}</span>
              )}
            </div>
          )}

          <Button variant="ghost" size="icon" onClick={() => navigate('/announcements')}>
            <Bell className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
            <User className="h-5 w-5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                <LogOut className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Çıkış yapmak istediğinize emin misiniz?</AlertDialogTitle>
                <AlertDialogDescription>Panelden çıkış yapılacaktır.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Çıkış Yap
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </header>
  );
};

export default Header;
