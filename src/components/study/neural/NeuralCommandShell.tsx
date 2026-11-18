import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CalendarClock,
  Flag,
  FolderKanban,
  GraduationCap,
  MessageSquareText,
  Settings2,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NeuralEngineState } from '@/lib/neural/neuralEngine';

export type NeuralTabId =
  | 'hub'
  | 'create'
  | 'library'
  | 'rag'
  | 'planner'
  | 'exam'
  | 'engine';

interface NavItem {
  id: NeuralTabId;
  label: string;
  shortLabel: string;
  icon: typeof BookOpen;
  badge?: number | string;
}

interface NeuralCommandShellProps {
  activeTab: NeuralTabId;
  onTabChange: (tab: NeuralTabId) => void;
  engine: NeuralEngineState;
  dueCardsCount: number;
  materialsCount: number;
  indexedDocsCount: number;
  onReportIssue: () => void;
  children: ReactNode;
}

export function NeuralCommandShell({
  activeTab,
  onTabChange,
  dueCardsCount,
  materialsCount,
  onReportIssue,
  children,
}: NeuralCommandShellProps) {
  const navItems: NavItem[] = [
    { id: 'hub', label: 'Genel Bakış', shortLabel: 'Özet', icon: BookOpen },
    { id: 'create', label: 'Yeni Çalışma Seti', shortLabel: 'Oluştur', icon: Sparkles },
    {
      id: 'library',
      label: 'Kitaplığım',
      shortLabel: 'Kitaplık',
      icon: FolderKanban,
      badge: materialsCount > 0 ? materialsCount : undefined,
    },
    {
      id: 'rag',
      label: 'Notlarıma Sor',
      shortLabel: 'Soru Sor',
      icon: MessageSquareText,
    },
    { id: 'exam', label: 'Sınav Simülatörü', shortLabel: 'Sınav', icon: Timer },
    {
      id: 'planner',
      label: 'Tekrar Planım',
      shortLabel: 'Plan',
      icon: CalendarClock,
      badge: dueCardsCount > 0 ? dueCardsCount : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Üst Başlık ve Birleşik Yatay Sekme Çubuğu (İkinci sol menü kaldırıldı, tam genişlik sağlandı) */}
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4 sm:p-5 shadow-xs backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight sm:text-lg text-foreground">
                Çalışma Stüdyosu
              </h1>
              <p className="text-xs text-muted-foreground">
                Ders notlarından özet, videolu anlatım, çalışma kartı ve deneme sınavı hazırla
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={activeTab === 'engine' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onTabChange('engine')}
              title="Çalışma Tercihleri"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tercihler</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReportIssue}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Flag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Geri Bildirim</span>
            </Button>
          </div>
        </div>

        {/* Tek ve Temiz Yatay Sekme Çubuğu */}
        <nav
          aria-label="Çalışma Stüdyosu bölümleri"
          className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'group relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-[13px] transition-all duration-200',
                  active
                    ? 'bg-blue-500/10 font-semibold text-blue-600 ring-1 ring-blue-500/25 dark:bg-[#19283e] dark:text-[#5b9cf6] dark:ring-[#5b9cf6]/30'
                    : 'font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-[#8e96a4] dark:hover:bg-white/[0.05] dark:hover:text-[#e2e8f0]',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    active
                      ? 'text-blue-600 dark:text-[#5b9cf6]'
                      : 'text-slate-500 group-hover:text-slate-800 dark:text-[#8e96a4] dark:group-hover:text-[#e2e8f0]',
                  )}
                  strokeWidth={active ? 2.1 : 1.85}
                />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
                {item.badge !== undefined && (
                  <span className="inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10.5px] font-bold text-primary">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tam Genişlikli Stüdyo Sahnesi */}
      <section className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
