import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CalendarClock,
  Expand,
  Flag,
  FolderKanban,
  GraduationCap,
  Maximize2,
  Minimize2,
  Settings2,
  Shrink,
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
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  isBrowserFullscreen?: boolean;
  onToggleBrowserFullscreen?: () => void;
  onReportIssue: () => void;
  children: ReactNode;
}

export function NeuralCommandShell({
  activeTab,
  onTabChange,
  dueCardsCount,
  materialsCount,
  focusMode = false,
  onToggleFocusMode,
  isBrowserFullscreen = false,
  onToggleBrowserFullscreen,
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
    <div className="min-w-0 space-y-2.5">
      {/* Compact Unified EconNotes Çalışma Stüdyosu 2.0 Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-slate-200/85 dark:border-slate-800/90 bg-card px-3 py-2 shadow-[var(--panel-shadow)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b2a6e] to-[#1d63ed] text-white shadow-sm">
            <GraduationCap className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold tracking-tight text-foreground">
                Çalışma Stüdyosu
              </h1>
              {focusMode && (
                <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary sm:inline-flex">
                  Odak Modu
                </span>
              )}
            </div>
            <p className="hidden text-[11px] text-muted-foreground 2xl:block">
              Ders kaynaklarını analiz et, ayrıntılı özet, deneme sınavı ve çalışma kartları oluştur.
            </p>
          </div>
        </div>

        <nav
          aria-label="Çalışma Stüdyosu bölümleri"
          className="order-3 flex w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:order-2 xl:w-auto"
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
                  'group relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition-all',
                  active
                    ? 'bg-gradient-to-r from-[#1b5ce5] to-[#3b82f6] font-semibold text-white shadow-sm'
                    : 'font-medium text-slate-600 dark:text-slate-300 hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={active ? 2.1 : 1.85} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
                {item.badge !== undefined && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
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

        <div className="order-2 flex items-center gap-1 xl:order-3">
          {onToggleFocusMode && (
            <Button
              type="button"
              variant={focusMode ? 'default' : 'outline'}
              size="sm"
              data-testid="studio-focus-toggle"
              onClick={onToggleFocusMode}
              title={focusMode ? 'Odak Modundan Çık' : 'Tam Ekran / Odak Moduna Geç'}
              className={cn(
                'h-8 gap-1.5 rounded-full px-3 text-xs font-semibold',
                focusMode
                  ? 'bg-gradient-to-r from-[#0b2a6e] to-[#1d63ed] text-white hover:brightness-105'
                  : 'border-slate-200/90 dark:border-slate-800 bg-card text-foreground hover:border-primary/40 hover:text-primary',
              )}
            >
              {focusMode ? (
                <Minimize2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="hidden md:inline">
                {focusMode ? 'Odaktan Çık' : 'Odak Modu'}
              </span>
            </Button>
          )}
          {onToggleBrowserFullscreen && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="studio-browser-fullscreen-toggle"
              onClick={onToggleBrowserFullscreen}
              title={isBrowserFullscreen ? 'Tarayıcı Tam Ekrandan Çık' : 'Tarayıcı Tam Ekran (Fullscreen)'}
              className={cn(STUDIO_BTN_GHOST, 'hidden h-8 gap-1 px-2.5 sm:inline-flex')}
            >
              {isBrowserFullscreen ? (
                <Shrink className="h-3.5 w-3.5" />
              ) : (
                <Expand className="h-3.5 w-3.5" />
              )}
              <span className="hidden lg:inline">
                {isBrowserFullscreen ? 'Küçült' : 'Tam Ekran'}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onTabChange(normalizedTab === 'engine' ? 'workspace' : 'engine')}
            title="AI Motor Tercihleri"
            className={cn(
              STUDIO_BTN_GHOST,
              'h-8 gap-1 px-2.5',
              normalizedTab === 'engine' && 'border-primary/25 bg-primary/10 text-primary',
            )}
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden lg:inline">Tercihler</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReportIssue}
            className={cn(STUDIO_BTN_GHOST, 'h-8 gap-1 px-2.5')}
            title="Sorun veya öneri bildir"
          >
            <Flag className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden 2xl:inline">Bildir</span>
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
