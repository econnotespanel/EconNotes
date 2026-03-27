import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background decorative-lines">
      <Header />
      <Sidebar />
      <main className="md:ml-60 min-h-[calc(100vh-4rem)] p-4 md:p-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;
