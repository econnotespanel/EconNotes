import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  FileDown,
  FlaskConical,
  Layers,
  Loader2,
  Network,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Video,
  Zap,
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
import { buildTopicPriorityGuide } from '@/lib/studySourceProcessor';
import { cn } from '@/lib/utils';
import type {
  CoachMode,
  MaterialType,
  StudyMaterial,
  StudyTopicPriorityItem,
  SummaryContent,
  TopicPriorityLevel,
} from '@/types/study';
import { toast } from 'sonner';

interface NeuralSummaryWorkspaceProps {
  material: StudyMaterial;
  onConvertTo: (targetType: MaterialType) => void;
  convertingTo: MaterialType | null;
  onExpandSection: (sectionIdx: number) => Promise<void>;
  expandingSectionIdx: number | null;
  onRegenerateDeep: () => Promise<void>;
  isRegenerating: boolean;
  onAskCoach: (prompt: string, mode?: CoachMode) => void;
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
      studyPriorityMap: Array.isArray(material.content?.studyPriorityMap)
        ? material.content.studyPriorityMap
        : undefined,
      metadata: material.content?.metadata,
    }),
    [material.content],
  );

  const priorityGuide = useMemo<StudyTopicPriorityItem[]>(() => {
    if (Array.isArray(c.studyPriorityMap) && c.studyPriorityMap.length > 0) {
      return c.studyPriorityMap;
    }
    return buildTopicPriorityGuide({
      sections: c.sections,
      keyTerms: c.keyTerms,
      teacherEmphasis: c.teacherEmphasis,
      overview: c.overview,
      disciplineTag: c.disciplineTag,
    });
  }, [c]);

  const [completedSections, setCompletedSections] = useState<Record<number, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`econnotes_summary_done_${material.id}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [checkpointChosen, setCheckpointChosen] = useState<Record<number, number>>({});
  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({});
  const [termQuery, setTermQuery] = useState('');
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [showPriorityGuide, setShowPriorityGuide] = useState(
    () => Boolean(c.metadata?.isLargeBundle || c.metadata?.examMode === 'cram_24h'),
  );
  const [priorityFilter, setPriorityFilter] = useState<'all' | TopicPriorityLevel>('all');
  const [examFocusMode, setExamFocusMode] = useState(() => c.metadata?.examMode === 'cram_24h');
  const [expandedInFocus, setExpandedInFocus] = useState<Record<number, boolean>>({});
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    try {
      localStorage.setItem(`econnotes_summary_done_${material.id}`, JSON.stringify(completedSections));
    } catch {
      // ignore storage quota errors
    }
  }, [completedSections, material.id]);

  const criticalPriorityCount = useMemo(
    () => priorityGuide.filter((p) => p.priority === 'critical').length,
    [priorityGuide],
  );
  const totalEstimatedMin = useMemo(
    () => priorityGuide.reduce((sum, item) => sum + (item.estimatedMinutes || 6), 0),
    [priorityGuide],
  );
  const filteredPriorityItems = useMemo(
    () =>
      priorityFilter === 'all'
        ? priorityGuide
        : priorityGuide.filter((item) => item.priority === priorityFilter),
    [priorityGuide, priorityFilter],
  );

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
    if (examFocusMode) {
      setExpandedInFocus((prev) => ({ ...prev, [idx]: true }));
    }
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
            variant={showPriorityGuide ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowPriorityGuide((v) => !v)}
            className={cn(
              'gap-1.5 text-xs font-semibold',
              !showPriorityGuide && 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10',
            )}
          >
            <Compass className="h-3.5 w-3.5" />
            Hangi Konulara Bakmalıyım?
            {criticalPriorityCount > 0 && (
              <span className="ml-0.5 rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                {criticalPriorityCount} Kritik
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant={examFocusMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setExamFocusMode((v) => !v)}
            className={cn(
              'gap-1.5 text-xs',
              examFocusMode && 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold',
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            {examFocusMode ? 'Sınav Odak Modu: Açık' : 'Sınav Odak Modu'}
          </Button>
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

      {/* İsteğe Bağlı Açılır: Hangi Konulara Bakmalıyım? (Sınav Öncelik Haritası) */}
      {showPriorityGuide && priorityGuide.length > 0 && (
        <div className="neural-card space-y-4 border-primary/30 bg-gradient-to-br from-primary/[0.04] via-card to-cyan-500/[0.04] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1 bg-primary text-primary-foreground text-[11px]">
                  <Target className="h-3 w-3" />
                  Sınav Öncelik Haritası
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Tahmini tekrar: ~{totalEstimatedMin} dk
                </span>
                {c.metadata?.sourceStats?.wordCount && c.metadata.sourceStats.wordCount >= 2800 && (
                  <Badge variant="outline" className="text-[10px]">
                    Büyük Not Analizi · {c.metadata.sourceStats.wordCount.toLocaleString('tr-TR')} kelime tarandı
                  </Badge>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-bold">
                Hangi Konulara Bakmalıyım? — Öncelikli Çalışma Sıran
              </h3>
              <p className="text-xs text-muted-foreground">
                Sınavda çıkma potansiyeli, kavram yoğunluğu ve ayırt edici ayrımlara göre konuların derecelendirildi.
                Önce <strong>Kesin Bak</strong> konularını bitir, ardından diğerlerini hızla tara.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Tümü (${priorityGuide.length})` },
                  { id: 'critical', label: `🔴 Kesin Bak (${criticalPriorityCount})` },
                  {
                    id: 'important',
                    label: `🟡 Pekiştir (${priorityGuide.filter((i) => i.priority === 'important').length})`,
                  },
                  {
                    id: 'review',
                    label: `🟢 Hızlı Geç (${priorityGuide.filter((i) => i.priority === 'review').length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPriorityFilter(tab.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    priorityFilter === tab.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-background/70 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {filteredPriorityItems.map((item, idx) => {
              const secIdx = typeof item.sectionIndex === 'number' ? item.sectionIndex : -1;
              const isDone = secIdx >= 0 ? Boolean(completedSections[secIdx]) : false;
              const priMeta =
                item.priority === 'critical'
                  ? {
                      badge: '🔴 Kesin Bak',
                      cls: 'border-rose-500/35 bg-rose-500/5',
                      pillCls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
                    }
                  : item.priority === 'important'
                  ? {
                      badge: '🟡 Pekiştir',
                      cls: 'border-amber-500/35 bg-amber-500/5',
                      pillCls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
                    }
                  : {
                      badge: '🟢 Hızlı Göz Gezdir',
                      cls: 'border-emerald-500/30 bg-emerald-500/5',
                      pillCls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                    };

              return (
                <div
                  key={`${item.topic}-${idx}`}
                  className={cn(
                    'flex flex-col justify-between gap-2.5 rounded-2xl border p-3.5 transition-all',
                    isDone ? 'border-emerald-500/40 bg-emerald-500/10 opacity-85' : priMeta.cls,
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold', priMeta.pillCls)}>
                        {priMeta.badge}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {item.likelyQuestionType && (
                          <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
                            {item.likelyQuestionType}
                          </span>
                        )}
                        <span className="font-mono font-semibold">~{item.estimatedMinutes} dk</span>
                      </div>
                    </div>

                    <h4 className={cn('text-xs sm:text-sm font-bold leading-snug', isDone && 'line-through text-muted-foreground')}>
                      {item.topic}
                    </h4>

                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">Neden bakmalısın:</strong> {item.reason}
                    </p>

                    {item.focusConcepts.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.focusConcepts.map((fc, fi) => (
                          <Badge key={fi} variant="secondary" className="text-[10px] font-normal">
                            {fc}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
                    <div className="flex items-center gap-1.5">
                      {secIdx >= 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => scrollToSection(secIdx)}
                          className="h-7 gap-1 px-2.5 text-[11px]"
                        >
                          Bölüme Git
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onAskCoach(
                            `"${item.topic}" konusundan sınavda çıkabilecek en kritik 3 noktayı ve örnek 1 sınav sorusunu özetler misin?`,
                          )
                        }
                        className="h-7 px-2 text-[11px] text-primary"
                      >
                        Sınav Tüyosu Al
                      </Button>
                    </div>
                    {secIdx >= 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant={isDone ? 'default' : 'ghost'}
                        onClick={() =>
                          setCompletedSections((prev) => ({ ...prev, [secIdx]: !prev[secIdx] }))
                        }
                        className="h-7 px-2.5 text-[11px]"
                      >
                        {isDone ? 'Çalıştım ✓' : 'Çalıştım İşaretle'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onAskCoach(
                          `"${sec.heading}" bölümünü tam anlayamadım. Yalnızca ders notuma dayanarak en basit haliyle, somut örnekle ve 1 mini kontrol sorusuyla pekiştirerek anlatır mısın?`,
                          'reinforce',
                        )
                      }
                      className="gap-1.5 border-primary/35 bg-primary/5 text-xs text-primary hover:bg-primary/15"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      Anlamadım, Pekiştir
                    </Button>
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

                {(!examFocusMode || expandedInFocus[idx]) ? (
                  <AcademicMarkdown content={sec.content} className="text-sm leading-relaxed" />
                ) : (
                  <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      <strong>Sınav Odak Modu:</strong> Uzun anlatım gizlendi — aşağıdaki kritik çıkarımlar, kavram tuzakları ve kontrol sorusuna odaklanın.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedInFocus((p) => ({ ...p, [idx]: true }))}
                      className="h-7 shrink-0 gap-1 text-[11px] text-primary"
                    >
                      Tam Metni Aç
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {examFocusMode && expandedInFocus[idx] && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedInFocus((p) => ({ ...p, [idx]: false }))}
                    className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                  >
                    <ChevronUp className="h-3 w-3" />
                    Sınav Odak Görünümüne Daralt
                  </Button>
                )}

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

          {/* Deep Academic Research Context */}
          {c.deepResearchTopics && c.deepResearchTopics.length > 0 && (
            <div className="neural-card space-y-3 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <FlaskConical className="h-4 w-4 text-indigo-500" />
                Derin Literatür & Uygulama Bağlamı
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {c.deepResearchTopics.map((dt, di) => (
                  <div
                    key={di}
                    className="space-y-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3.5 text-xs"
                  >
                    <p className="font-bold text-indigo-600 dark:text-indigo-300">{dt.topic}</p>
                    <AcademicMarkdown content={dt.literatureContext} className="text-xs leading-relaxed" />
                    {dt.realWorldApplication && (
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        <strong>Uygulama / Sınav Yansıması:</strong> {dt.realWorldApplication}
                      </p>
                    )}
                  </div>
                ))}
              </div>
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
          {/* Exam Period Next-Step Flow */}
          <div className="neural-card border-primary/25 bg-gradient-to-r from-primary/5 via-card to-violet-500/5 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Sınav Dönemi Sonraki Adımın (Bilimsel Pekiştirme Akışı)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Özeti okuduktan sonra aktif hatırlama kartları ve süreli testle bilgini kalıcı hale getir.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px]">
                İlerleme: %{completionPct}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowPriorityGuide(true)}
                className="gap-1.5 text-xs"
              >
                <Compass className="h-3.5 w-3.5 text-primary" />
                1. Kritik Konuları Kontrol Et
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(convertingTo)}
                onClick={() => onConvertTo('flashcards')}
                className="gap-1.5 text-xs"
              >
                <Layers className="h-3.5 w-3.5 text-emerald-500" />
                2. Aktif Tekrar Kartları Üret
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(convertingTo)}
                onClick={() => onConvertTo('quiz')}
                className="gap-1.5 text-xs"
              >
                <Target className="h-3.5 w-3.5 text-amber-500" />
                3. Sınav Provası Çöz
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(convertingTo)}
                onClick={() => onConvertTo('video')}
                className="gap-1.5 text-xs"
              >
                <Video className="h-3.5 w-3.5 text-violet-500" />
                4. Videolu Özet İzle
              </Button>
            </div>
          </div>
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
