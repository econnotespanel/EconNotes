import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background decorative-lines">
      <Header />
      <Sidebar />
      <main className="md:ml-60 min-h-[calc(100vh-4rem)] p-4 md:p-6 pb-16">
        {children}
      </main>
      <footer className="md:ml-60 text-center md:text-right px-6 py-3 text-xs text-muted-foreground border-t border-border/40">
        Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
      </footer>
    </div>
  );
};

export default Layout;
