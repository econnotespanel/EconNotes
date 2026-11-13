import { useState } from 'react';
import { ArrowLeft, Bot, Flag, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import type { MaterialType, StudyMaterial } from '@/types/study';
import { NeuralCoachPanel } from './NeuralCoachPanel';
import { NeuralFlashcardWorkspace } from './NeuralFlashcardWorkspace';
import { NeuralQuizWorkspace } from './NeuralQuizWorkspace';
import { NeuralStatusPill } from './NeuralStatusPill';
import { NeuralSummaryWorkspace } from './NeuralSummaryWorkspace';
import { useNeuralEngine } from './useNeuralEngine';

interface NeuralWorkspaceFrameProps {
  material: StudyMaterial;
  onBack: () => void;
  onConvertTo: (targetType: MaterialType) => void;
  convertingTo: MaterialType | null;
  onExpandSection: (sectionIdx: number) => Promise<void>;
  expandingSectionIdx: number | null;
  onRegenerateDeep: () => Promise<void>;
  isRegenerating: boolean;
  onRecordProgress: (score: number, total: number) => Promise<void> | void;
  onReportIssue: () => void;
}

export function NeuralWorkspaceFrame({
  material,
  onBack,
  onConvertTo,
  convertingTo,
  onExpandSection,
  expandingSectionIdx,
  onRegenerateDeep,
  isRegenerating,
  onRecordProgress,
  onReportIssue,
}: NeuralWorkspaceFrameProps) {
  const engine = useNeuralEngine();
  const [coachOpen, setCoachOpen] = useState(true);
  const [injectedPrompt, setInjectedPrompt] = useState<{ id: number; text: string } | null>(null);

  const handleAskCoach = (prompt: string) => {
    setCoachOpen(true);
    setInjectedPrompt({ id: Date.now(), text: prompt });
  };

  return (
    <div className="neural-shell space-y-5 p-3 sm:p-5 lg:p-6">
      {/* Workspace Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onBack} className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Stüdyo Ana Sayfa
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold sm:text-base">{material.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{material.course || 'Genel Akademik'}</span>
              {material.model && (
                <Badge variant="outline" className="text-[10px]">
                  {material.model}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NeuralStatusPill engine={engine} compact />

          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs lg:hidden">
                <Bot className="h-3.5 w-3.5 text-primary" />
                AI Koç
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] max-w-md p-3">
              <NeuralCoachPanel material={material} injectedPrompt={injectedPrompt} />
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCoachOpen((o) => !o)}
            className="hidden gap-1.5 text-xs lg:inline-flex"
          >
            {coachOpen ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
            {coachOpen ? 'Koçu Gizle' : 'AI Koç'}
          </Button>

          <Button type="button" variant="ghost" size="sm" onClick={onReportIssue} className="gap-1.5 text-xs">
            <Flag className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bildir</span>
          </Button>
        </div>
      </header>

      {/* Main 12-Col Content + Coach */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className={coachOpen ? 'min-w-0 lg:col-span-8' : 'min-w-0 lg:col-span-12'}>
          {material.material_type === 'summary' && (
            <NeuralSummaryWorkspace
              material={material}
              onConvertTo={onConvertTo}
              convertingTo={convertingTo}
              onExpandSection={onExpandSection}
              expandingSectionIdx={expandingSectionIdx}
              onRegenerateDeep={onRegenerateDeep}
              isRegenerating={isRegenerating}
              onAskCoach={handleAskCoach}
            />
          )}
          {material.material_type === 'quiz' && (
            <NeuralQuizWorkspace
              material={material}
              onRecordProgress={onRecordProgress}
              onAskCoach={handleAskCoach}
            />
          )}
          {material.material_type === 'flashcards' && (
            <NeuralFlashcardWorkspace
              material={material}
              onRecordProgress={onRecordProgress}
              onAskCoach={handleAskCoach}
            />
          )}
        </div>

        {coachOpen && (
          <aside className="hidden lg:col-span-4 lg:block">
            <div className="sticky top-20">
              <NeuralCoachPanel material={material} injectedPrompt={injectedPrompt} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
