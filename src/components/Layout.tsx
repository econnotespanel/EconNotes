import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />
      <Sidebar />
      <main className="relative z-10 min-h-[calc(100vh-4rem)] min-w-0 px-3 py-5 pb-16 sm:px-4 md:ml-64 md:p-8 opacity-100 visible">
        <div className="mx-auto w-full max-w-7xl opacity-100 visible text-foreground">
          {children}
        </div>
      </main>
      <footer className="md:ml-64 text-center md:text-right px-6 py-3 text-xs text-muted-foreground border-t border-border/40">
        EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
      </footer>

    </div>
  );
};

export default Layout;
