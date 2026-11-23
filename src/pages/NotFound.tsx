import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import EconLogo from "@/components/EconLogo";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="safe-area-screen flex flex-col items-center justify-center bg-background px-4 py-10 text-foreground"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px) + 1.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
    >
      <div className="w-full max-w-md rounded-[24px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-7 text-center shadow-[var(--panel-shadow)] sm:p-9">
        <div className="mb-6 flex justify-center">
          <EconLogo className="h-8 w-auto" />
        </div>

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <Compass className="h-7 w-7" strokeWidth={1.85} />
        </div>

        <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Hata 404</p>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">
          Sayfa Bulunamadı
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Aradığınız sayfa taşınmış, silinmiş veya adres hatalı yazılmış olabilir.
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button variant="cta" onClick={() => navigate("/")} className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4" />
            Ana Sayfaya Dön
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
