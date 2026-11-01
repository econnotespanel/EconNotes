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
  const isFatalError = mode === 'fatal_error';
  const heading = title || (isSummer ? 'EconNotes Yaz Tatilinde' : isFatalError ? '500 — Sunucu Hatası' : 'EconNotes Bakımda');
  const body =
    message ||
    (isSummer
      ? 'Üniversiteler yaz tatiline girdiği için EconNotes, yeni akademik dönem başlayana kadar dinlenmeye çekildi. Güneşin, denizin ve dinlenmenin tadını çıkar; güz döneminde daha güçlü ve yeni özelliklerle geri döneceğiz. İyi tatiller! 🌊☀️🌴'
      : isFatalError
        ? 'EconNotes şu anda beklenmeyen bir sunucu hatası nedeniyle kullanılamıyor. Teknik ekip bilgilendirildi ve hizmetin yeniden başlatılması için çalışmalar sürdürülüyor.'
        : "EconNotes'a şu anda bakım çalışmaları nedeniyle geçici olarak erişim sağlanamamaktadır. Yaşanan sorunun en kısa sürede giderilmesi için çalışmalarımız titizlikle sürdürülmektedir. Anlayışınız, sabrınız ve desteğiniz için teşekkür ederiz.");
  const errorTime = new Date().toLocaleString('tr-TR');

  if (isFatalError) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#2b0308] font-mono text-red-50">
        <div className="pointer-events-none absolute -left-20 top-1/3 h-80 w-[120%] rotate-[-12deg] rounded-[50%] border-t-[22px] border-red-500/25 shadow-[0_-8px_0_rgba(248,113,113,0.12)] sm:top-1/4" />
        <div className="pointer-events-none absolute -left-20 top-1/2 h-80 w-[120%] rotate-[-12deg] rounded-[50%] border-t-2 border-red-300/25" />
        <header className="relative flex items-center justify-between border-b border-red-200/25 px-6 py-6 sm:px-14">
          <div className="flex items-center gap-4">
            <EconLogo allWhite className="h-8 w-40 sm:h-10 sm:w-52" />
            <span className="hidden border-l border-red-200/30 pl-4 text-xs tracking-[0.3em] text-red-100/70 sm:block">SYSTEM STATUS</span>
          </div>
          <span className="text-xs tracking-widest text-red-200/70">ERR-NX500</span>
        </header>
        <main className="relative mx-auto grid min-h-[calc(100vh-145px)] max-w-6xl items-center gap-10 px-6 py-10 sm:px-14 lg:grid-cols-[1fr_1.2fr]">
          <section>
            <p className="mb-5 text-sm font-bold tracking-[0.35em] text-red-300">CRITICAL SERVICE INTERRUPTION</p>
            <h1 className="text-6xl font-light tracking-tight text-white sm:text-8xl">500</h1>
            <p className="mt-4 max-w-md text-lg leading-8 text-red-100/85">{heading}</p>
            <div className="mt-8 h-px w-40 bg-red-300/60" />
            <p className="mt-5 max-w-md font-sans text-sm leading-7 text-red-100/70">{body}</p>
          </section>
          <section className="border-l border-red-200/35 pl-6 sm:pl-10">
            <div className="grid gap-4 text-sm sm:grid-cols-[150px_1fr]">
              <span className="text-red-300/70">ERROR CODE</span><strong>ECON-FATAL-500</strong>
              <span className="text-red-300/70">TIMESTAMP</span><span>{errorTime}</span>
              <span className="text-red-300/70">APPLICATION</span><span>ECONNOTES-WEB</span>
              <span className="text-red-300/70">STATUS</span><span className="text-red-200">SERVICE_UNAVAILABLE</span>
              <span className="text-red-300/70">REQUEST</span><span>ACCESS_BLOCKED_FOR_MAINTENANCE</span>
            </div>
            <div className="mt-8 border border-red-200/25 bg-black/15 p-5 text-sm leading-7 text-red-100/75">
              <p className="mb-2 text-red-200">System diagnostic</p>
              <p>Runtime could not establish a healthy application session.</p>
              <p>Administrator intervention is required before access can resume.</p>
            </div>
          </section>
        </main>
        <footer className="relative flex flex-wrap items-center justify-between gap-3 border-t border-red-200/25 px-6 py-5 text-xs text-red-200/70 sm:px-14">
          <span>○ Back to EconNotes support</span>
          <a href="mailto:destek@econnotes.online" className="hover:text-white">destek@econnotes.online</a>
          <span>© EconNotes Operations</span>
        </footer>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-4 relative overflow-hidden ${
        isSummer ? 'summer-scene' : isFatalError ? 'bg-[#220307]' : 'bg-slate-950'
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
            : isFatalError
              ? 'border-2 border-red-500/80 bg-red-950/75 shadow-[0_0_80px_rgba(239,68,68,0.35)]'
              : 'border border-white/10 bg-slate-900/60 shadow-black/30'
        }`}>
          <div className="relative mb-8 h-10 w-full sm:h-11">
            <EconLogo allWhite={isSummer ? false : true} className="absolute left-1/2 top-0 h-10 w-56 max-w-full -translate-x-1/2 justify-center sm:h-11 sm:w-64" />
          </div>

          {imageUrl && !isFatalError ? (
            <div className="flex justify-center mb-4">
              <img
                src={imageUrl}
                alt="Bilgilendirme görseli"
                className="max-h-64 rounded-2xl border border-white/60 shadow-xl object-cover"
              />
            </div>
          ) : (
            <div className="mb-5 flex justify-center">
            <div className={`flex h-20 w-20 items-center justify-center rounded-full ${isSummer ? 'bg-yellow-400/30' : isFatalError ? 'border-4 border-red-400 bg-red-600/30 shadow-[0_0_45px_rgba(248,113,113,0.75)]' : 'border-2 border-amber-300/70 bg-amber-500/20 shadow-[0_0_24px_rgba(252,211,77,0.25)]'}`}>
                {isSummer ? (
                  <Sun className="h-12 w-12 text-yellow-500 animate-spin-slow drop-shadow" />
                ) : (
                  <AlertTriangle className={`h-10 w-10 stroke-[2.5] ${isFatalError ? 'text-red-100' : 'text-amber-200'}`} />
                )}
              </div>
            </div>
          )}

          <h1 className={`flex items-center justify-center gap-2 text-3xl font-bold drop-shadow-sm ${isSummer ? 'text-slate-900 dark:text-white' : 'text-white'}`}>
            {isSummer && <Palmtree className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />}
            {heading}
          </h1>
          {isFatalError && <p className="mb-2 rounded border border-red-400/50 bg-red-500/20 px-3 py-2 font-mono text-xs font-bold tracking-widest text-red-100">FATAL_ERROR · HTTP 500 · SERVICE_UNAVAILABLE</p>}
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
