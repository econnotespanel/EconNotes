import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit,
  CalendarClock,
  Cpu,
  Flag,
  FolderKanban,
  Home,
  MessageSquareText,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { APP_VERSION_LABEL } from '@/lib/version';
import type { NeuralEngineState } from '@/lib/neural/neuralEngine';
import { NeuralStatusPill } from './NeuralStatusPill';

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
  engine,
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
      label: 'GPU & Performans',
      shortLabel: 'Motor',
      icon: Cpu,
      badge: engine.llmStatus === 'ready' ? 'GPU' : undefined,
    },
  ];

  const hw = engine.hardware;

  return (
    <div className="neural-shell p-3 sm:p-5 lg:p-6">
      {/* Top Neural Telemetry Bar */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/25">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold tracking-tight sm:text-lg">
                EconNotes Neural Studio
              </h1>
              <Badge variant="outline" className="neural-glow-pill text-[11px] font-semibold">
                {hw?.tierLabel || 'Donanım taranıyor...'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {hw?.webgpuSupported && hw.adapter
                ? `${hw.adapter.device} · ${hw.cpuCores} Çekirdek CPU${hw.deviceMemoryGb ? ` · ${hw.deviceMemoryGb} GB RAM` : ''}`
                : 'Hibrit Bulut Akademik AI + Çok Aşamalı Sentez'}
              {' · '}
              <span>{APP_VERSION_LABEL}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NeuralStatusPill engine={engine} onClick={() => onTabChange('engine')} />
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
            className="neural-rail sticky top-20 space-y-1.5 p-2.5"
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
                    'group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all',
                    active
                      ? 'bg-gradient-to-r from-primary to-blue-600 text-white shadow-md shadow-primary/25'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className={cn('h-4 w-4 shrink-0', active && 'text-white')} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <Badge
                      variant={active ? 'secondary' : 'outline'}
                      className={cn(
                        'h-5 px-1.5 text-[10px]',
                        active && 'border-transparent bg-white/20 text-white',
                      )}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}

            <div className="mt-3 rounded-xl border border-border/60 bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                Motor Politikası
              </div>
              <p>
                {engine.prefs.routingPolicy === 'auto'
                  ? 'Akıllı Hibrit: Hızlı işler GPU, derin özetler bulut.'
                  : engine.prefs.routingPolicy === 'gpu_prefer'
                  ? 'Önce Yerel GPU, yedekte bulut.'
                  : engine.prefs.routingPolicy === 'local_privacy'
                  ? 'Tam Gizlilik: Dış ağa veri çıkmaz.'
                  : 'Yalnızca Bulut Akademik AI.'}
              </p>
            </div>
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
