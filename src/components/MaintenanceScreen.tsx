import { AlertTriangle } from 'lucide-react';
import logo from '@/assets/econnotes-logo.png';

interface MaintenanceScreenProps {
  closedUntil: string | null;
}

const MaintenanceScreen = ({ closedUntil }: MaintenanceScreenProps) => {
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
        <h1 className="text-2xl font-bold text-foreground">EconNotes Bakımda</h1>
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
          <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">destek@econnotes.online</a>{' '}
          adresi üzerinden bizimle iletişime geçebilirsiniz.
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
        </p>
      </div>
    </div>
  );
};

export default MaintenanceScreen;
