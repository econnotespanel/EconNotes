import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CalendarClock,
  Flag,
  FolderKanban,
  GraduationCap,
  Settings2,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NeuralEngineState } from '@/lib/neural/neuralEngine';
import { STUDIO_BTN_GHOST } from './studioDesign';

export type NeuralTabId =
  | 'workspace'
  | 'library'
  | 'planner'
  | 'exam'
  | 'engine'
  | 'hub'
  | 'create'
  | 'rag';

interface NavItem {
  id: 'workspace' | 'exam' | 'planner' | 'library';
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
  const normalizedTab =
    activeTab === 'hub' || activeTab === 'create' || activeTab === 'rag'
      ? 'workspace'
      : activeTab;

  const navItems: NavItem[] = [
    { id: 'workspace', label: 'Çalışma Defteri', shortLabel: 'Defter', icon: BookOpen },
    { id: 'exam', label: 'Sınav Simülatörü', shortLabel: 'Sınav', icon: Timer },
    {
      id: 'planner',
      label: 'Sınav Planı & SM-2',
      shortLabel: 'Plan',
      icon: CalendarClock,
      badge: dueCardsCount > 0 ? dueCardsCount : undefined,
    },
    {
      id: 'library',
      label: 'Kitaplığım',
      shortLabel: 'Kitaplık',
      icon: FolderKanban,
      badge: materialsCount > 0 ? materialsCount : undefined,
    },
  ];

  return (
    <div className="min-w-0 space-y-3.5">
      {/* Unified Minimalist EconNotes Study Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#003791] text-white shadow-sm">
            <GraduationCap className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
              Çalışma Stüdyosu
            </h1>
            <p className="hidden text-xs text-muted-foreground md:block">
              Ders kaynaklarını analiz et, ayrıntılı özet, deneme sınavı ve çalışma kartları oluştur
            </p>
          </div>
        </div>

        <nav
          aria-label="Çalışma Stüdyosu bölümleri"
          className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:order-2 xl:w-auto xl:pb-0"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = normalizedTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'group relative flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs transition-colors',
                  active
                    ? 'border-primary/25 bg-primary/10 font-semibold text-primary'
                    : 'border-transparent font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
                {item.badge !== undefined && (
                  <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="order-2 flex items-center gap-1.5 xl:order-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onTabChange(normalizedTab === 'engine' ? 'workspace' : 'engine')}
            title="AI Motor Tercihleri"
            className={cn(
              STUDIO_BTN_GHOST,
              'gap-1.5',
              normalizedTab === 'engine' && 'border-primary/25 bg-primary/10 text-primary',
            )}
          >
            <Settings2 className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Tercihler</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReportIssue}
            className={cn(STUDIO_BTN_GHOST, 'gap-1.5')}
            title="Sorun veya öneri bildir"
          >
            <Flag className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Bildir</span>
          </Button>
        </div>
      </div>

      {/* Main Studio Stage */}
      <section className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={normalizedTab}
            className="min-w-0"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
