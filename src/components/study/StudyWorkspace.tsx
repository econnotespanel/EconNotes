import { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Flag,
  HelpCircle,
  Layers,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { FlashcardWorkspace } from '@/components/study/FlashcardWorkspace';
import { QuizWorkspace } from '@/components/study/QuizWorkspace';
import { StudyCoachSidebar } from '@/components/study/StudyCoachSidebar';
import { SummaryWorkspace } from '@/components/study/SummaryWorkspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { MaterialType, StudyMaterial } from '@/types/study';

interface StudyWorkspaceProps {
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

export function StudyWorkspace({
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
}: StudyWorkspaceProps) {
  const [coachOpenDesktop, setCoachOpenDesktop] = useState(true);
  const [coachSheetMobile, setCoachSheetMobile] = useState(false);
  const [injectedPrompt, setInjectedPrompt] = useState<{ id: number; text: string } | null>(
    null,
  );

  const handleAskCoach = (promptText: string) => {
    setCoachOpenDesktop(true);
    setCoachSheetMobile(true);
    setInjectedPrompt({ id: Date.now(), text: promptText });
  };

  const TypeIcon =
    material.material_type === 'quiz'
      ? HelpCircle
      : material.material_type === 'flashcards'
      ? Layers
      : BookOpen;

  const typeLabel =
    material.material_type === 'quiz'
      ? 'Sınav Simülasyonu'
      : material.material_type === 'flashcards'
      ? 'Aktif Hatırlama Kartları'
      : 'Ders Kitabı Özeti';

  return (
    <div className="space-y-5">
      {/* Studio Workspace Top Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="mt-0.5 shrink-0 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Stüdyo Ana Sayfa
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1 text-xs">
                <TypeIcon className="h-3.5 w-3.5 text-primary" />
                {typeLabel}
              </Badge>
              {material.course && (
                <Badge variant="outline" className="text-xs">
                  {material.course}
                </Badge>
              )}
            </div>
            <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">
              {material.title}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Mobile Sheet Coach Trigger */}
          <Sheet open={coachSheetMobile} onOpenChange={setCoachSheetMobile}>
            <SheetTrigger asChild>
              <Button type="button" variant="secondary" size="sm" className="gap-1.5 lg:hidden">
                <Bot className="h-4 w-4 text-primary" />
                Akıl Hocası
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[92vw] sm:max-w-md p-3 overflow-y-auto">
              <SheetHeader className="sr-only">
                <SheetTitle>Akıl Hocası ve Ders Defteri</SheetTitle>
              </SheetHeader>
              <StudyCoachSidebar material={material} injectedPrompt={injectedPrompt} />
            </SheetContent>
          </Sheet>

          {/* Desktop Toggle Coach */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCoachOpenDesktop((v) => !v)}
            className="hidden lg:inline-flex gap-1.5"
          >
            {coachOpenDesktop ? (
              <>
                <PanelRightClose className="h-4 w-4 text-primary" />
                Koçu Gizle
              </>
            ) : (
              <>
                <PanelRightOpen className="h-4 w-4 text-primary" />
                Akıl Hocası
              </>
            )}
          </Button>

          <Button type="button" variant="ghost" size="sm" onClick={onReportIssue} className="gap-1.5">
            <Flag className="h-4 w-4" />
            Bildir
          </Button>
        </div>
      </div>

      {/* Main Responsive Split Workspace */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        <div className={coachOpenDesktop ? 'lg:col-span-8' : 'lg:col-span-12'}>
          {material.material_type === 'summary' && (
            <SummaryWorkspace
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
            <QuizWorkspace
              material={material}
              onRecordProgress={onRecordProgress}
              onAskCoach={handleAskCoach}
            />
          )}

          {material.material_type === 'flashcards' && (
            <FlashcardWorkspace
              material={material}
              onRecordProgress={onRecordProgress}
              onAskCoach={handleAskCoach}
            />
          )}
        </div>

        {coachOpenDesktop && (
          <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-4">
            <StudyCoachSidebar material={material} injectedPrompt={injectedPrompt} />
          </div>
        )}
      </div>
    </div>
  );
}
