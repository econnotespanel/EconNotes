import { AlertTriangle, Sun, Palmtree } from 'lucide-react';
import logo from '@/assets/econnotes-logo.png';

interface MaintenanceScreenProps {
  closedUntil: string | null;
  title?: string | null;
  message?: string | null;
  imageUrl?: string | null;
  mode?: string | null;
}

const MaintenanceScreen = ({ closedUntil, title, message, imageUrl, mode }: MaintenanceScreenProps) => {
  const isSummer = mode === 'summer';
  const heading = title || (isSummer ? 'EconNotes Yaz Tatilinde' : 'EconNotes Bakımda');
  const body =
    message ||
    (isSummer
      ? 'Üniversiteler yaz tatiline girdiği için EconNotes, yeni akademik dönem başlayana kadar dinlenmeye çekildi. Güneşin, denizin ve dinlenmenin tadını çıkar; güz döneminde daha güçlü ve yeni özelliklerle geri döneceğiz. İyi tatiller! 🌊☀️🌴'
      : "EconNotes'a şu anda bakım çalışmaları nedeniyle geçici olarak erişim sağlanamamaktadır. Yaşanan sorunun en kısa sürede giderilmesi için çalışmalarımız titizlikle sürdürülmektedir. Anlayışınız, sabrınız ve desteğiniz için teşekkür ederiz.");

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 relative overflow-hidden ${isSummer ? 'summer-scene' : 'bg-background'}`}>
      {isSummer && (
        <>
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-yellow-300/50 blur-3xl animate-pulse" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-cyan-300/40 blur-3xl animate-pulse" />
        </>
      )}
      <div className="max-w-lg text-center space-y-5 relative z-10">
        <div className="flex justify-center">
          <img
            src={logo}
            alt="EconNotes"
            className="h-20 w-20 object-contain"
            style={{ filter: 'var(--logo-filter)' }}
          />
        </div>

        {imageUrl ? (
          <div className="flex justify-center">
            <img
              src={imageUrl}
              alt="Bilgilendirme görseli"
              className="max-h-64 rounded-2xl border border-white/40 shadow-xl object-cover"
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <div className={`p-4 rounded-full ${isSummer ? 'bg-yellow-400/20' : 'bg-warning/10'}`}>
              {isSummer ? (
                <Sun className="h-12 w-12 text-yellow-500 animate-spin-slow" />
              ) : (
                <AlertTriangle className="h-12 w-12 text-warning" />
              )}
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold text-foreground flex items-center justify-center gap-2">
          {isSummer && <Palmtree className="h-7 w-7 text-emerald-500" />}
          {heading}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{body}</p>

        {closedUntil && (
          <p className="text-sm text-muted-foreground">
            {isSummer ? 'Tekrar açılış tarihi:' : 'Tahmini açılış:'}{' '}
            <strong>{new Date(closedUntil).toLocaleString('tr-TR')}</strong>
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Yardım ve teknik destek talepleriniz için{' '}
          <a href="mailto:destek@econnotes.online" className="text-primary hover:underline">
            destek@econnotes.online
          </a>{' '}
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
