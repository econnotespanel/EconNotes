import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Megaphone, User, Shield, MessageSquare, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const links = [
    { label: 'Ana Sayfa', icon: Home, path: '/' },
    { label: 'Notlar', icon: FileText, path: '/notes' },
    { label: 'Duyurular', icon: Megaphone, path: '/announcements' },
    { label: 'Profilim', icon: User, path: '/profile' },
    { label: 'Mesajlar', icon: MessageSquare, path: '/messages' },
    ...(isAdmin ? [{ label: 'Yönetici Paneli', icon: Shield, path: '/admin' }] : []),
  ];

  const NavContent = () => (
    <nav className="flex flex-col gap-1 p-3">
      {links.map((link) => {
        const Icon = link.icon;
        const active = location.pathname === link.path;
        return (
          <button
            key={link.path}
            onClick={() => { navigate(link.path); setOpen(false); }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-[60] md:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-16 z-50 h-[calc(100vh-4rem)] w-60 border-r border-border bg-card transition-transform duration-300 md:translate-x-0 flex flex-col justify-between",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <NavContent />
        <div className="p-3 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">EconNotes Panel</p>
          <p className="text-[10px] text-muted-foreground text-center mt-1">v1.0.0</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
