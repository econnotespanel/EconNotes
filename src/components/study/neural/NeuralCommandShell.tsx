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
    <div className="space-y-3.5">
      {/* Unified Compact Top Studio Header (NotebookLM × Astra AI Aesthetic) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-2xs backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-blue-500/15 to-violet-500/20 text-primary ring-1 ring-primary/25">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-tight text-foreground sm:text-base">
                Çalışma Stüdyosu
              </h1>
              <span className="hidden rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary sm:inline-flex">
                AI Notebook &amp; Tutor
              </span>
            </div>
            <p className="hidden text-[11px] text-muted-foreground md:block">
              Kaynaklarınla konuş, soru fotoğrafı çöz, tek tıkla özet · video · sınav · kavram haritası üret
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
                  'group relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all duration-150',
                  active
                    ? 'bg-primary/12 font-semibold text-primary ring-1 ring-primary/25 shadow-2xs'
                    : 'font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={active ? 2.15 : 1.85} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
                {item.badge !== undefined && (
                  <span className="inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="order-2 flex items-center gap-1 xl:order-3">
          <Button
            type="button"
            variant={normalizedTab === 'engine' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange(normalizedTab === 'engine' ? 'workspace' : 'engine')}
            title="AI Motor Tercihleri"
            className="h-8 gap-1.5 rounded-xl px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tercihler</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReportIssue}
            className="h-8 gap-1.5 rounded-xl px-2.5 text-xs text-muted-foreground hover:text-foreground"
            title="Sorun veya öneri bildir"
          >
            <Flag className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bildir</span>
          </Button>
        </div>
      </div>

      {/* Main Studio Stage */}
      <section className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={normalizedTab}
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
