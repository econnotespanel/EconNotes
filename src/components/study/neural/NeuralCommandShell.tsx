import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit,
  CalendarClock,
  Flag,
  FolderKanban,
  Home,
  MessageSquareText,
  Settings2,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { APP_VERSION_LABEL } from '@/lib/version';
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
  icon: typeof Home;
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
  indexedDocsCount,
  onReportIssue,
  children,
}: NeuralCommandShellProps) {
  const navItems: NavItem[] = [
    { id: 'hub', label: 'Komuta Merkezi', shortLabel: 'Merkez', icon: Home },
    { id: 'create', label: 'Materyal Üret', shortLabel: 'Oluştur', icon: Sparkles },
    {
      id: 'library',
      label: 'Kütüphane',
      shortLabel: 'Kitaplık',
      icon: FolderKanban,
      badge: materialsCount > 0 ? materialsCount : undefined,
    },
    {
      id: 'rag',
      label: 'Notlarıma Sor',
      shortLabel: 'RAG Sor',
      icon: MessageSquareText,
      badge: indexedDocsCount > 0 ? indexedDocsCount : undefined,
    },
    {
      id: 'planner',
      label: 'Plan & Tekrar',
      shortLabel: 'Plan',
      icon: CalendarClock,
      badge: dueCardsCount > 0 ? dueCardsCount : undefined,
    },
    { id: 'exam', label: 'Sınav Simülatörü', shortLabel: 'Sınav', icon: Timer },
    {
      id: 'engine',
      label: 'AI & Gizlilik',
      shortLabel: 'Ayarlar',
      icon: Settings2,
    },
  ];

  return (
    <div className="neural-shell p-3 sm:p-5 lg:p-6">
      {/* Top Academic Studio Header */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/25">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight sm:text-lg">
              EconNotes Neural Studio
            </h1>
            <p className="text-xs text-muted-foreground">
              Derin Akademik Özet, Sınav Hazırlığı ve Etkileşimli Video Stüdyosu ·{' '}
              <span>{APP_VERSION_LABEL}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReportIssue}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Flag className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bildir</span>
          </Button>
        </div>
      </header>

      {/* Mobile & Tablet Horizontal Command Tabs */}
      <nav
        aria-label="Neural Studio gezinme"
        className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
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
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                active
                  ? 'border-primary/50 bg-primary text-primary-foreground shadow-sm'
                  : 'border-border/60 bg-card/70 text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.shortLabel}</span>
              {item.badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                    active ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Desktop 12-Col Layout: Persistent Left Command Rail + Stage */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <aside className="hidden lg:col-span-3 lg:block xl:col-span-2">
          <nav
            aria-label="Stüdyo Komuta Rayı"
            className="sticky top-20 flex flex-col gap-1 rounded-[24px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#14171c]/95 dark:shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
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
                    'group relative flex w-full min-h-[42px] items-center justify-between rounded-[14px] px-3.5 py-2.5 text-left text-[13.5px] transition-all duration-200',
                    active
                      ? 'bg-blue-500/12 font-semibold text-blue-600 dark:bg-[#19283e] dark:text-[#5b9cf6]'
                      : 'font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-[#8e96a4] dark:hover:bg-white/[0.05] dark:hover:text-[#e2e8f0]',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-colors',
                        active
                          ? 'text-blue-600 dark:text-[#5b9cf6]'
                          : 'text-slate-500 group-hover:text-slate-800 dark:text-[#8e96a4] dark:group-hover:text-[#e2e8f0]',
                      )}
                      strokeWidth={active ? 2.1 : 1.85}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="inline-flex h-[20px] min-w-[24px] items-center justify-center rounded-full bg-[#f05252] px-2 text-[11px] font-bold text-white shadow-xs">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 lg:col-span-9 xl:col-span-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
