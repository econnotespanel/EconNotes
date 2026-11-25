import { useState } from 'react';
import { ArrowLeft, Bot, Expand, Flag, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Shrink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { CoachMode, MaterialType, StudyMaterial } from '@/types/study';
import { NeuralCoachPanel } from './NeuralCoachPanel';
import { NeuralFlashcardWorkspace } from './NeuralFlashcardWorkspace';
import { NeuralQuizWorkspace } from './NeuralQuizWorkspace';
import { NeuralSummaryWorkspace } from './NeuralSummaryWorkspace';
import {
  STUDIO_BADGE_COURSE,
  STUDIO_BTN_GHOST,
  STUDIO_BTN_SECONDARY,
} from './studioDesign';

interface NeuralWorkspaceFrameProps {
  material: StudyMaterial;
  onBack: () => void;
  onConvertTo: (targetType: MaterialType) => void;
  convertingTo: MaterialType | null;
  onExpandSection: (sectionIdx: number) => Promise<void>;
  expandingSectionIdx: number | null;
  onRegenerateDeep: () => Promise<void>;
  isRegenerating: boolean;
  onSaveToAccount?: (material: StudyMaterial) => Promise<void>;
  isSavingToAccount?: boolean;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  isBrowserFullscreen?: boolean;
  onToggleBrowserFullscreen?: () => void;
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
  onSaveToAccount,
  isSavingToAccount,
  focusMode = false,
  onToggleFocusMode,
  isBrowserFullscreen = false,
  onToggleBrowserFullscreen,
  onRecordProgress,
  onReportIssue,
}: NeuralWorkspaceFrameProps) {
  const [coachOpen, setCoachOpen] = useState(false);
  const [injectedPrompt, setInjectedPrompt] = useState<{ id: number; text: string; mode?: CoachMode } | null>(null);

  const handleAskCoach = (prompt: string, mode?: CoachMode) => {
    setCoachOpen(true);
    setInjectedPrompt({ id: Date.now(), text: prompt, mode });
  };

  return (
    <div className="neural-shell min-w-0 space-y-5 p-3 sm:p-5 lg:p-6">
      {/* Unified Minimalist Workspace Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className={cn(STUDIO_BTN_SECONDARY, 'shrink-0 gap-1.5')}
          >
            <ArrowLeft className="h-4 w-4" />
            Stüdyoya Dön
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">
              {material.title}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className={STUDIO_BADGE_COURSE}>
                {material.course || 'Ders Notu'}
              </span>
              <span>{new Date(material.created_at).toLocaleDateString('tr-TR')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onToggleFocusMode && (
            <Button
              type="button"
              variant={focusMode ? 'default' : 'outline'}
              size="sm"
              onClick={onToggleFocusMode}
              className={cn(
                'h-9 gap-1.5 rounded-full px-3 text-xs font-semibold',
                focusMode
                  ? 'bg-gradient-to-r from-[#0b2a6e] to-[#1d63ed] text-white'
                  : STUDIO_BTN_SECONDARY,
              )}
            >
              {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{focusMode ? 'Odaktan Çık' : 'Odak Modu'}</span>
            </Button>
          )}
          {onToggleBrowserFullscreen && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleBrowserFullscreen}
              className={cn(STUDIO_BTN_GHOST, 'hidden gap-1 sm:inline-flex')}
            >
              {isBrowserFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </Button>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(STUDIO_BTN_SECONDARY, 'gap-1.5 lg:hidden')}
              >
                <Bot className="h-4 w-4 text-primary" />
                Sor &amp; Pekiştir
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
            className={cn(STUDIO_BTN_SECONDARY, 'hidden gap-1.5 lg:inline-flex')}
          >
            {coachOpen ? (
              <PanelRightClose className="h-4 w-4 text-primary" />
            ) : (
              <PanelRightOpen className="h-4 w-4 text-primary" />
            )}
            {coachOpen ? 'Asistanı Gizle' : 'Notu Sor & Pekiştir'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReportIssue}
            className={cn(STUDIO_BTN_GHOST, 'gap-1.5')}
          >
            <Flag className="h-4 w-4" />
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
              onSaveToAccount={onSaveToAccount}
              isSavingToAccount={isSavingToAccount}
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
          <aside className="hidden min-w-0 lg:col-span-4 lg:block">
            <div className="sticky top-20">
              <NeuralCoachPanel material={material} injectedPrompt={injectedPrompt} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
