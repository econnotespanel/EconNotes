import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileDown,
  FlaskConical,
  Layers,
  Loader2,
  Network,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Video,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { ConceptKnowledgeMap } from '@/components/study/video/ConceptKnowledgeMap';
import { buildStudioContent } from '@/components/study/video/sceneModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { downloadLectureSummary, downloadLectureSummaryPdf } from '@/lib/liveLectureReport';
import { cn } from '@/lib/utils';
import type { MaterialType, StudyMaterial, SummaryContent } from '@/types/study';
import { toast } from 'sonner';

interface NeuralSummaryWorkspaceProps {
  material: StudyMaterial;
  onConvertTo: (targetType: MaterialType) => void;
  convertingTo: MaterialType | null;
  onExpandSection: (sectionIdx: number) => Promise<void>;
  expandingSectionIdx: number | null;
  onRegenerateDeep: () => Promise<void>;
  isRegenerating: boolean;
  onAskCoach: (prompt: string) => void;
}

export function NeuralSummaryWorkspace({
  material,
  onConvertTo,
  convertingTo,
  onExpandSection,
  expandingSectionIdx,
  onRegenerateDeep,
  isRegenerating,
  onAskCoach,
}: NeuralSummaryWorkspaceProps) {
  const c: SummaryContent = useMemo(
    () => ({
      overview: material.content?.overview || '',
      disciplineTag: material.content?.disciplineTag,
      keyPoints: Array.isArray(material.content?.keyPoints) ? material.content.keyPoints : [],
      sections: Array.isArray(material.content?.sections) ? material.content.sections : [],
      teacherEmphasis: Array.isArray(material.content?.teacherEmphasis)
        ? material.content.teacherEmphasis
        : [],
      comparativeMatrix: material.content?.comparativeMatrix,
      deepResearchTopics: Array.isArray(material.content?.deepResearchTopics)
        ? material.content.deepResearchTopics
        : [],
      keyTerms: Array.isArray(material.content?.keyTerms) ? material.content.keyTerms : [],
      studyChecklist: Array.isArray(material.content?.studyChecklist)
        ? material.content.studyChecklist
        : [],
      metadata: material.content?.metadata,
    }),
    [material.content],
  );

  const [completedSections, setCompletedSections] = useState<Record<number, boolean>>({});
  const [checkpointChosen, setCheckpointChosen] = useState<Record<number, number>>({});
  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({});
  const [termQuery, setTermQuery] = useState('');
  const [showConceptMap, setShowConceptMap] = useState(false);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);

  const completedCount = Object.values(completedSections).filter(Boolean).length;
  const completionPct =
    c.sections.length > 0 ? Math.round((completedCount / c.sections.length) * 100) : 0;

  const filteredTerms = useMemo(() => {
    const q = termQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return c.keyTerms || [];
    return (c.keyTerms || []).filter((t) =>
      `${t.term} ${t.definition} ${t.formula || ''}`.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [c.keyTerms, termQuery]);

  const knowledgeMapData = useMemo(() => {
    const studio = buildStudioContent(
      {
        videoTitle: material.title,
        scenes: c.sections.map((sec, idx) => ({
          id: `sum-${idx + 1}`,
          title: sec.heading,
          text: sec.content,
          keyTakeaways: sec.takeaways || [],
          keyTerms: idx === 0 ? c.keyTerms || [] : [],
        })),
      },
      material.title,
      material.course || undefined,
      { disableCurriculumExpansion: true },
    );
    const allTerms = (c.keyTerms || []).map((kt, idx) => ({
      term: kt.term,
      definition: kt.definition,
      sceneIdx: Math.min(Math.max(0, studio.scenes.length - 1), idx),
    }));
    return { scenes: studio.scenes, allTerms };
  }, [c.sections, c.keyTerms, material.title, material.course]);

  const scrollToSection = (idx: number) => {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const buildExportReport = () => ({
    title: material.title,
    course: material.course || c.disciplineTag || undefined,
    generatedAt: material.created_at,
    overview: c.overview,
    keyPoints: c.keyPoints,
    sections: c.sections,
    teacherEmphasis: c.teacherEmphasis,
    comparativeMatrix: c.comparativeMatrix,
    deepResearchTopics: c.deepResearchTopics,
    keyTerms: c.keyTerms,
    studyChecklist: c.studyChecklist,
    metadata: { model: material.model || undefined },
  });

  return (
    <div className="space-y-5">
      {/* Action Toolbar */}
      <div className="neural-card flex flex-wrap items-center justify-between gap-2 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(convertingTo)}
            onClick={() => onConvertTo('quiz')}
            className="gap-1.5 text-xs"
          >
            {convertingTo === 'quiz' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
            Sınava Dönüştür
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(convertingTo)}
            onClick={() => onConvertTo('flashcards')}
            className="gap-1.5 text-xs"
          >
            {convertingTo === 'flashcards' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5 text-emerald-500" />}
            Kart Üret
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(convertingTo)}
            onClick={() => onConvertTo('video')}
            className="gap-1.5 text-xs"
          >
            {convertingTo === 'video' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5 text-violet-500" />}
            Video Ders Yap
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowConceptMap(true)}
            className="gap-1.5 text-xs"
          >
            <Network className="h-3.5 w-3.5 text-cyan-500" />
            Kavram Haritası
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegenerating}
            onClick={() => void onRegenerateDeep()}
            className="gap-1.5 text-xs"
          >
            {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Derin Yenile
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              downloadLectureSummary(buildExportReport());
              toast.success('HTML çalışma raporu indirildi.');
            }}
            className="gap-1.5 text-xs"
          >
            <FileDown className="h-3.5 w-3.5" />
            HTML
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadLectureSummaryPdf(buildExportReport())}
            className="gap-1.5 text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Sticky Chapter Navigator */}
        <aside className="neural-card h-fit space-y-3 p-4 xl:sticky xl:top-20 xl:col-span-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <BookOpen className="h-4 w-4 text-primary" />
              Bölüm İçindekiler
            </span>
            <span className="text-[11px] font-semibold text-primary">%{completionPct}</span>
          </div>
          <Progress value={completionPct} className="h-1.5" />

          <div className="space-y-1.5">
            {c.sections.map((sec, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollToSection(idx)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                  completedSections[idx]
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-border/50 bg-background/60 hover:bg-muted/60',
                )}
              >
                <span className="line-clamp-2 font-medium">{sec.heading}</span>
                {completedSections[idx] && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Academic Body */}
        <div className="space-y-5 xl:col-span-8">
          {/* Executive Overview */}
          <div className="neural-card space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              {c.disciplineTag && (
                <Badge variant="outline" className="text-xs text-cyan-600 dark:text-cyan-300">
                  {c.disciplineTag}
                </Badge>
              )}
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Yönetici Özeti & Çerçeve
              </span>
            </div>
            <AcademicMarkdown content={c.overview} className="text-sm leading-relaxed" />
            {c.keyPoints.length > 0 && (
              <ul className="space-y-1.5 rounded-xl border border-border/60 bg-background/50 p-3.5 text-xs">
                {c.keyPoints.map((kp, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                    <AcademicMarkdown content={kp} className="text-xs" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Chapters */}
          {c.sections.map((sec, idx) => {
            const picked = checkpointChosen[idx];
            const cp = sec.checkpointQuestion;
            return (
              <div
                key={idx}
                ref={(el) => {
                  sectionRefs.current[idx] = el;
                }}
                className="neural-card space-y-4 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-primary">{sec.heading}</h3>
                    {sec.pageRange && (
                      <span className="text-[11px] text-muted-foreground">{sec.pageRange}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={expandingSectionIdx === idx}
                      onClick={() => void onExpandSection(idx)}
                      className="gap-1.5 text-xs"
                    >
                      {expandingSectionIdx === idx ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
                      )}
                      Bölümü Derinleştir
                    </Button>
                    <Button
                      type="button"
                      variant={completedSections[idx] ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() =>
                        setCompletedSections((p) => ({ ...p, [idx]: !p[idx] }))
                      }
                      className="text-xs"
                    >
                      {completedSections[idx] ? 'Tamamlandı ✓' : 'Okundu'}
                    </Button>
                  </div>
                </div>

                <AcademicMarkdown content={sec.content} className="text-sm leading-relaxed" />

                {sec.deepResearchNote && (
                  <div className="rounded-xl border border-indigo-500/35 bg-indigo-500/10 p-3.5 text-xs">
                    <p className="mb-1 flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-300">
                      <FlaskConical className="h-3.5 w-3.5" />
                      Derin Akademik Araştırma & Vaka Bağlamı
                    </p>
                    <AcademicMarkdown content={sec.deepResearchNote} className="text-xs leading-relaxed" />
                  </div>
                )}

                {sec.commonPitfalls && sec.commonPitfalls.length > 0 && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs">
                    <p className="mb-1 flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Sık Yapılan Kavram Tuzakları
                    </p>
                    <ul className="space-y-1">
                      {sec.commonPitfalls.map((pit, pi) => (
                        <li key={pi}>• {pit}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {sec.takeaways && sec.takeaways.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {sec.takeaways.map((tk, ti) => (
                      <Badge key={ti} variant="secondary" className="py-1 text-[11px] font-normal">
                        {tk}
                      </Badge>
                    ))}
                  </div>
                )}

                {cp && (
                  <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/5 p-4">
                    <p className="mb-2 text-xs font-bold text-cyan-600 dark:text-cyan-300">
                      Hızlı Anlama Kontrolü
                    </p>
                    <p className="mb-2.5 text-xs font-semibold">{cp.question}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {cp.options.map((opt, oi) => {
                        const isPicked = picked === oi;
                        const isRight = oi === cp.correctIndex;
                        return (
                          <button
                            key={oi}
                            type="button"
                            onClick={() => setCheckpointChosen((p) => ({ ...p, [idx]: oi }))}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                              picked !== undefined && isRight
                                ? 'border-emerald-500 bg-emerald-500/15 font-semibold'
                                : isPicked
                                ? 'border-destructive bg-destructive/15'
                                : 'border-border/60 bg-background/70 hover:bg-muted',
                            )}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {picked !== undefined && cp.explanation && (
                      <p className="mt-2.5 text-xs text-muted-foreground">{cp.explanation}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Comparative Matrix */}
          {c.comparativeMatrix && c.comparativeMatrix.columns?.length > 0 && (
            <div className="neural-card space-y-3 p-5">
              <h3 className="text-sm font-bold">{c.comparativeMatrix.title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/40">
                      {c.comparativeMatrix.columns.map((col, ci) => (
                        <th key={ci} className="p-2.5 font-bold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.comparativeMatrix.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border/40">
                        {row.map((cell, ci) => (
                          <td key={ci} className="p-2.5">
                            <AcademicMarkdown content={cell} className="text-xs" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Teacher Emphasis */}
          {c.teacherEmphasis && c.teacherEmphasis.length > 0 && (
            <div className="neural-card space-y-2.5 p-5">
              <h3 className="text-sm font-bold">Sınav Odaklı Kritik Noktalar</h3>
              {c.teacherEmphasis.map((emp, ei) => (
                <div
                  key={ei}
                  className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{emp.point}</span>
                    {emp.examProbability && (
                      <Badge variant="outline" className="text-[10px]">
                        {emp.examProbability}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">{emp.whyImportant}</p>
                </div>
              ))}
            </div>
          )}

          {/* Key Terms Glossary */}
          {c.keyTerms && c.keyTerms.length > 0 && (
            <div className="neural-card space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">Kavram & Formül Sözlüğü</h3>
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Terim ara..."
                    value={termQuery}
                    onChange={(e) => setTermQuery(e.target.value)}
                    className="h-7 pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredTerms.map((kt, ki) => (
                  <div
                    key={ki}
                    className="space-y-1.5 rounded-xl border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{kt.term}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onAskCoach(`"${kt.term}" kavramını sınav sorusuyla açıklar mısın?`)
                        }
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        Hocaya Sor →
                      </button>
                    </div>
                    <AcademicMarkdown content={kt.definition} className="text-xs text-muted-foreground" />
                    {kt.formula && (
                      <div className="rounded-lg border border-border/60 bg-card p-2 text-xs">
                        <AcademicMarkdown content={`$$${kt.formula.replace(/^\$+|\$+$/g, '')}$$`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Self Mastery Checklist */}
          {c.studyChecklist && c.studyChecklist.length > 0 && (
            <div className="neural-card space-y-2.5 p-5">
              <h3 className="text-sm font-bold">Konu Hakimiyet Kontrol Listesi</h3>
              {c.studyChecklist.map((task, idx) => (
                <label
                  key={idx}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 p-2.5 text-xs hover:bg-muted/40"
                >
                  <Checkbox
                    checked={Boolean(checkedTasks[idx])}
                    onCheckedChange={(v) => setCheckedTasks((p) => ({ ...p, [idx]: Boolean(v) }))}
                    className="mt-0.5"
                  />
                  <span className={checkedTasks[idx] ? 'line-through text-muted-foreground' : ''}>
                    {task}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {showConceptMap && (
        <ConceptKnowledgeMap
          scenes={knowledgeMapData.scenes}
          allTerms={knowledgeMapData.allTerms}
          courseTitle={material.course || material.title}
          onClose={() => setShowConceptMap(false)}
          onJumpToScene={(sceneIdx) => {
            setShowConceptMap(false);
            scrollToSection(sceneIdx);
          }}
        />
      )}
    </div>
  );
}
