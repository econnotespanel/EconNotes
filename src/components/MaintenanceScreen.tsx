import { AlertTriangle, Sun, Palmtree, Waves, Sailboat } from 'lucide-react';
import EconLogo from '@/components/EconLogo';

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
    <div
      className={`min-h-screen flex items-center justify-center p-4 relative overflow-hidden ${
        isSummer ? 'summer-scene' : 'bg-slate-950'
      }`}
    >
      {isSummer && (
        <>
          {/* Sun */}
          <div className="absolute top-8 right-10 h-24 w-24 rounded-full bg-yellow-300 shadow-[0_0_80px_30px_rgba(253,224,71,0.6)] animate-pulse-glow" />
          {/* Clouds */}
          <div className="absolute top-16 left-10 h-10 w-28 rounded-full bg-white/80 blur-sm animate-cloud-drift" />
          <div className="absolute top-32 left-1/3 h-8 w-24 rounded-full bg-white/70 blur-sm animate-cloud-drift-slow" />
          {/* Ocean waves */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-cyan-500/60 via-cyan-400/30 to-transparent" />
          <Waves className="absolute bottom-6 left-6 h-10 w-10 text-white/70 animate-pulse" />
          <Waves className="absolute bottom-10 right-16 h-8 w-8 text-white/60 animate-pulse" style={{ animationDelay: '0.5s' }} />
          <Sailboat className="absolute bottom-20 right-8 h-12 w-12 text-white drop-shadow-lg animate-boat-bob" />
          {/* Palm silhouettes */}
          <Palmtree className="absolute bottom-4 left-4 h-24 w-24 text-emerald-700/80 drop-shadow-xl" />
        </>
      )}

      <div className="relative z-10 mx-auto w-full max-w-md space-y-5 text-center">
        <div className={`rounded-3xl p-8 backdrop-blur-2xl shadow-2xl ${
          isSummer
            ? 'border border-white/60 bg-white/40'
            : 'border border-white/10 bg-slate-900/60 shadow-black/30'
        }`}>
          <div className="mb-8 flex w-full justify-center">
            <EconLogo allWhite={isSummer ? false : true} className="h-10 w-56 max-w-full justify-center sm:h-11 sm:w-64" />
          </div>

          {imageUrl ? (
            <div className="flex justify-center mb-4">
              <img
                src={imageUrl}
                alt="Bilgilendirme görseli"
                className="max-h-64 rounded-2xl border border-white/60 shadow-xl object-cover"
              />
            </div>
          ) : (
            <div className="mb-5 flex justify-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${isSummer ? 'bg-yellow-400/30' : 'border-2 border-amber-300/70 bg-amber-500/20 shadow-[0_0_24px_rgba(252,211,77,0.25)]'}`}>
                {isSummer ? (
                  <Sun className="h-12 w-12 text-yellow-500 animate-spin-slow drop-shadow" />
                ) : (
                  <AlertTriangle className="h-8 w-8 stroke-[2.5] text-amber-200" />
                )}
              </div>
            </div>
          )}

          <h1 className={`flex items-center justify-center gap-2 text-3xl font-bold drop-shadow-sm ${isSummer ? 'text-slate-900 dark:text-white' : 'text-white'}`}>
            {isSummer && <Palmtree className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />}
            {heading}
          </h1>
          <p className={`mt-3 text-sm leading-relaxed whitespace-pre-line ${isSummer ? 'text-slate-800 dark:text-slate-100' : 'text-slate-300'}`}>
            {body}
          </p>

          {closedUntil && (
            <p className={`mt-4 text-sm ${isSummer ? 'text-slate-800 dark:text-slate-100' : 'text-slate-300'}`}>
              {isSummer ? 'Tekrar açılış tarihi:' : 'Tahmini açılış:'}{' '}
              <strong className={isSummer ? 'text-slate-900 dark:text-white' : 'text-white'}>
                {new Date(closedUntil).toLocaleString('tr-TR')}
              </strong>
            </p>
          )}
          <p className={`mt-4 text-xs ${isSummer ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
            Yardım ve teknik destek talepleriniz için{' '}
            <a
              href="mailto:destek@econnotes.online"
              className="text-primary font-semibold hover:underline"
            >
              destek@econnotes.online
            </a>{' '}
            adresi üzerinden bizimle iletişime geçebilirsiniz.
          </p>
          <p className={`mt-3 text-xs ${isSummer ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500'}`}>
            EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceScreen;
