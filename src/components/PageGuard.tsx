import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteConfig } from '@/contexts/SiteConfigContext';

/**
 * Yönetici panelinden kapatılan sayfaları engeller. Yöneticiler kapalı sayfalara
 * bilgilendirme şeridi ile erişmeye devam eder.
 */
const PageGuard = ({ path, children }: { path: string; children: React.ReactNode }) => {
  const { isPageEnabled, loading } = useSiteConfig();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  if (loading || isPageEnabled(path)) return <>{children}</>;

  if (isAdmin) {
    return (
      <>
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-warning/40 bg-warning/15 px-4 py-1.5 text-xs font-medium text-warning">
          Bu sayfa şu anda kullanıcılara kapalı. Yönetici olarak görüntülüyorsunuz.
        </div>
        {children}
      </>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="glass-card max-w-md">
          <CardContent className="space-y-4 p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Bu bölüm geçici olarak kapatıldı.</h1>
            <p className="text-sm text-muted-foreground">
              Yönetici ekibi bu sayfayı bakım veya güncelleme amacıyla kapattı. Kısa süre içinde tekrar açılacaktır.
            </p>
            <Button onClick={() => navigate('/')}>Ana sayfaya dön.</Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default PageGuard;
