import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Dashboard from './Dashboard';
import { AlertTriangle } from 'lucide-react';
import logo from '@/assets/econnotes-logo.png';
import { toast } from 'sonner';

const Index = () => {
  const { user, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [systemOpen, setSystemOpen] = useState<boolean | null>(null);
  const [closedUntil, setClosedUntil] = useState<string | null>(null);

  useEffect(() => {
    const checkSystem = async () => {
      const { data } = await supabase.from('system_settings').select('*').limit(1).single();
      if (data) {
        const isOpen = (data as any).is_system_open ?? true;
        setSystemOpen(isOpen);
        setClosedUntil((data as any).closed_until);

        // If system just closed and user is not admin, force logout
        if (!isOpen && user && !isAdmin) {
          toast.error('EconNotes Panel Hatası: Sistem bakıma alındı. Oturumunuz sonlandırıldı.', { duration: 6000 });
          await signOut();
          navigate('/login');
        }
      } else {
        setSystemOpen(true);
      }
    };
    checkSystem();

    // Poll system status every 15 seconds
    const interval = setInterval(checkSystem, 15000);
    return () => clearInterval(interval);
  }, [user, isAdmin]);

  if (loading || systemOpen === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-glow p-4 rounded-full">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!systemOpen && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src={logo} 
              alt="EconNotes" 
              className="h-20 w-20 object-contain"
              style={{ filter: 'var(--logo-filter)' }}
            />
          </div>
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-warning/10">
              <AlertTriangle className="h-12 w-12 text-warning" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">EconNotes Panel Bakımda</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            EconNotes'a şu anda bakım çalışmaları nedeniyle geçici olarak erişim sağlanamamaktadır. 
            Yaşanan sorunun en kısa sürede giderilmesi için çalışmalarımız titizlikle sürdürülmektedir. 
            Anlayışınız, sabrınız ve desteğiniz için teşekkür ederiz.
          </p>
          {closedUntil && (
            <p className="text-sm text-muted-foreground">
              Tahmini açılış: <strong>{new Date(closedUntil).toLocaleString('tr-TR')}</strong>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Yardım ve teknik destek talepleriniz için{' '}
            <a href="mailto:econnotespanel@gmail.com" className="text-primary hover:underline">econnotespanel@gmail.com</a>{' '}
            adresi üzerinden bizimle iletişime geçebilirsiniz.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
        </div>
      </div>
    );
  }

  return <Dashboard />;
};

export default Index;
