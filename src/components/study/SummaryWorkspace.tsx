import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Film,
  GraduationCap,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquarePlus,
  Microscope,
  Network,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import { ConceptKnowledgeMap } from '@/components/study/video/ConceptKnowledgeMap';
import type { StudioScene } from '@/components/study/video/sceneModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  downloadLectureSummary,
  downloadLectureSummaryPdf,
  type LectureSummaryReport,
} from '@/lib/liveLectureReport';
import type { MaterialType, StudyMaterial, SummaryContent, SummarySection } from '@/types/study';
import { toast } from 'sonner';

interface SummaryWorkspaceProps {
  material: StudyMaterial;
  onConvertTo: (targetType: MaterialType) => void;
  convertingTo: MaterialType | null;
  onExpandSection: (sectionIdx: number) => Promise<void>;
  expandingSectionIdx: number | null;
  onRegenerateDeep: () => Promise<void>;
  isRegenerating: boolean;
  onAskCoach: (prompt: string) => void;
}

export function SummaryWorkspace({
  material,
  onConvertTo,
  convertingTo,
  onExpandSection,
  expandingSectionIdx,
  onRegenerateDeep,
  isRegenerating,
  onAskCoach,
}: SummaryWorkspaceProps) {
  const content: SummaryContent = useMemo(
    () => ({
      overview: String(material.content?.overview || ''),
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

  const [viewMode, setViewMode] = useState<'scroll' | 'focus'>('scroll');
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [completedSections, setCompletedSections] = useState<Record<number, boolean>>({});
  const [checkpointAnswers, setCheckpointAnswers] = useState<Record<number, number>>({});
  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({});
  const [termSearch, setTermSearch] = useState('');
  const [showConceptMap, setShowConceptMap] = useState(false);

  const totalSections = content.sections.length;
  const completedCount = Object.values(completedSections).filter(Boolean).length;
  const completionPct =
    totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

  const filteredTerms = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    if (!q) return content.keyTerms || [];
    return (content.keyTerms || []).filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q) ||
        (t.formula || '').toLowerCase().includes(q),
    );
  }, [content.keyTerms, termSearch]);

  const knowledgeMapData = useMemo(() => {
    const scenes: StudioScene[] = content.sections.map((sec, idx) => ({
      id: `sum-sec-${idx + 1}`,
      order: idx + 1,
      title: sec.heading,
      conceptTag: sec.pageRange || material.course || 'Kavram',
      visualType: 'concept_diagram',
      visualData: {
        bullets: (sec.takeaways || []).slice(0, 4),
      },
      narration: sec.content.slice(0, 260),
      subtitleChunks: [{ text: sec.heading, startOffsetSec: 0, endOffsetSec: 10 }],
      estimatedDurationSec: 45,
      keyTerms: (content.keyTerms || [])
        .slice(idx * 2, idx * 2 + 2)
        .map((k) => ({ term: k.term, definition: k.definition })),
    }));
    const allTerms = (content.keyTerms || []).map((k, i) => ({
      term: k.term,
      definition: k.definition,
      sceneIdx: totalSections > 0 ? i % totalSections : 0,
    }));
    return { scenes, allTerms };
  }, [content.sections, content.keyTerms, material.course, totalSections]);

  const buildReportPayload = (): LectureSummaryReport => ({
    title: material.title,
    course: material.course || undefined,
    generatedAt: new Date(material.created_at).toLocaleString('tr-TR'),
    overview: content.overview,
    keyPoints: content.keyPoints,
    sections: content.sections,
    teacherEmphasis: content.teacherEmphasis,
    comparativeMatrix: content.comparativeMatrix,
    deepResearchTopics: content.deepResearchTopics,
    keyTerms: content.keyTerms,
    studyChecklist: content.studyChecklist,
    metadata: {
      deepResearch: Boolean(content.metadata?.deepResearch),
      sourceMode: content.metadata?.sourceMode,
    },
  });

  const handleCopyMarkdown = async () => {
    const md = [
      `# ${material.title}`,
      material.course ? `**Ders:** ${material.course}` : '',
      '',
      '## Yönetici Özeti',
      content.overview,
      '',
      content.keyPoints.length
        ? `## Temel Çıkarımlar\n${content.keyPoints.map((k) => `- ${k}`).join('\n')}`
        : '',
      ...content.sections.flatMap((s) => [
        '',
        `## ${s.heading}${s.pageRange ? ` (${s.pageRange})` : ''}`,
        s.content,
        s.deepResearchNote ? `\n> **Derin Akademik Araştırma:** ${s.deepResearchNote}` : '',
        s.takeaways?.length ? `\n**Öne Çıkanlar:**\n${s.takeaways.map((t) => `- ${t}`).join('\n')}` : '',
      ]),
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    try {
      await navigator.clipboard.writeText(md);
      toast.success('Ders özeti Markdown olarak panoya kopyalandı.');
    } catch {
      toast.error('Panoya kopyalanamadı.');
    }
  };

  const scrollToSection = (idx: number) => {
    setActiveSectionIdx(idx);
    if (viewMode === 'scroll') {
      const el = document.getElementById(`summary-section-${idx}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggleSectionComplete = (idx: number) => {
    setCompletedSections((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const sectionsToRender: Array<{ sec: SummarySection; idx: number }> =
    viewMode === 'focus' && content.sections[activeSectionIdx]
      ? [{ sec: content.sections[activeSectionIdx], idx: activeSectionIdx }]
      : content.sections.map((sec, idx) => ({ sec, idx }));

  const isLocalFallback =
    content.metadata?.sourceMode === 'local' || content.metadata?.sourceMode === 'fallback';

  return (
    <div className="space-y-5">
      {/* Top Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('scroll')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'scroll'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tüm Kitapçık
            </button>
            <button
              type="button"
              onClick={() => setViewMode('focus')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'focus'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Bölüm Odaklı
            </button>
          </div>

          {totalSections > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowConceptMap(true)}
              className="gap-1.5 text-xs"
            >
              <Network className="h-3.5 w-3.5 text-primary" />
              Kavram Haritası
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRegenerating}
            onClick={() => void onRegenerateDeep()}
            className="gap-1.5 text-xs"
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-primary" />
            )}
            Derin Yeniden Üret
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={convertingTo !== null}
            onClick={() => onConvertTo('quiz')}
            className="gap-1.5 text-xs"
          >
            {convertingTo === 'quiz' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HelpCircle className="h-3.5 w-3.5 text-primary" />
            )}
            Sınav Üret
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={convertingTo !== null}
            onClick={() => onConvertTo('flashcards')}
            className="gap-1.5 text-xs"
          >
            {convertingTo === 'flashcards' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Layers className="h-3.5 w-3.5 text-primary" />
            )}
            Kart Üret
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={convertingTo !== null}
            onClick={() => onConvertTo('video')}
            className="gap-1.5 text-xs"
          >
            {convertingTo === 'video' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Film className="h-3.5 w-3.5 text-primary" />
            )}
            Video Ders
          </Button>

          <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

          <Button type="button" size="sm" variant="ghost" onClick={handleCopyMarkdown} className="gap-1 text-xs">
            <Copy className="h-3.5 w-3.5" />
            MD
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => downloadLectureSummary(buildReportPayload())}
            className="gap-1 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            HTML
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadLectureSummaryPdf(buildReportPayload())}
            className="gap-1 text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF / Yazdır
          </Button>
        </div>
      </div>

      {isLocalFallback && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">Yerel Yapısal Ayrıştırma Modu Kullanıldı</p>
              <p className="text-muted-foreground">
                Sunucu AI ağ geçidine o an ulaşılamadığı için metin doğrudan yapısal olarak ayrıştırıldı.
                Derin akademik sentez ve literatür araştırması için yeniden deneyebilirsiniz.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={isRegenerating} onClick={() => void onRegenerateDeep()}>
            AI ile Derin Sentezle
          </Button>
        </div>
      )}

      {/* Main Layout: Sticky Left TOC + Deep Reading Canvas */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Sticky Chapter TOC */}
        <aside className="lg:col-span-3">
          <Card className="sticky top-4 border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Bölüm Haritası</CardTitle>
                <Badge variant="secondary" className="text-[11px]">
                  {completedCount}/{totalSections}
                </Badge>
              </div>
              <Progress value={completionPct} className="mt-2 h-1.5" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Okuma ilerlemesi: %{completionPct}
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {content.sections.map((sec, idx) => {
                const isDone = Boolean(completedSections[idx]);
                const isActive = activeSectionIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => scrollToSection(idx)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border text-[9px]">
                        {idx + 1}
                      </span>
                    )}
                    <span className="line-clamp-2 leading-snug">{sec.heading}</span>
                  </button>
                );
              })}

              {content.keyTerms && content.keyTerms.length > 0 && (
                <a
                  href="#summary-glossary"
                  className="mt-2 flex items-center gap-2 rounded-lg border-t border-border px-2.5 pt-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <BookMarked className="h-3.5 w-3.5 text-primary" />
                  Kavram Sözlüğü ({content.keyTerms.length})
                </a>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Deep Textbook Content */}
        <div className="space-y-6 lg:col-span-9">
          {/* Executive Overview & Key Points */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-bold">Yönetici Özeti & Ana Çerçeve</CardTitle>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {content.disciplineTag && (
                    <Badge variant="outline" className="text-[11px]">
                      {content.disciplineTag}
                    </Badge>
                  )}
                  {content.metadata?.deepResearch && (
                    <Badge className="gap-1 text-[11px]">
                      <BrainCircuit className="h-3 w-3" />
                      Derin Akademik Araştırma
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <AcademicMarkdown content={content.overview} className="text-sm leading-relaxed" />

              {content.keyPoints.length > 0 && (
                <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                  <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    Temel Çıkarımlar
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {content.keyPoints.map((kp, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <AcademicMarkdown content={kp} className="text-sm" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comparative Matrix */}
          {content.comparativeMatrix?.columns?.length &&
          content.comparativeMatrix?.rows?.length ? (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <FileText className="h-4 w-4 text-primary" />
                  {content.comparativeMatrix.title || 'Karşılaştırmalı Analiz Matrisi'}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {content.comparativeMatrix.columns.map((col, idx) => (
                        <th key={idx} className="p-2.5 font-semibold text-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {content.comparativeMatrix.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-border/60 last:border-none">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2.5 align-top text-muted-foreground">
                            <AcademicMarkdown content={cell} className="text-xs sm:text-sm" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}

          {/* Sections (Full Scroll or Focus Mode) */}
          {viewMode === 'focus' && totalSections > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activeSectionIdx <= 0}
                onClick={() => setActiveSectionIdx((i) => Math.max(0, i - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Önceki Bölüm
              </Button>
              <span className="text-xs font-semibold text-muted-foreground">
                Bölüm {activeSectionIdx + 1} / {totalSections}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activeSectionIdx >= totalSections - 1}
                onClick={() => setActiveSectionIdx((i) => Math.min(totalSections - 1, i + 1))}
                className="gap-1"
              >
                Sonraki Bölüm
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {sectionsToRender.map(({ sec, idx }) => {
            const isCompleted = Boolean(completedSections[idx]);
            const selectedOpt = checkpointAnswers[idx];
            const cq = sec.checkpointQuestion;

            return (
              <Card
                key={idx}
                id={`summary-section-${idx}`}
                className={`border-border bg-card transition-all ${
                  isCompleted ? 'border-primary/40' : ''
                }`}
              >
                <CardHeader className="border-b border-border/60 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[11px]">
                          Bölüm {idx + 1}
                        </Badge>
                        {sec.pageRange && (
                          <Badge variant="outline" className="text-[11px]">
                            {sec.pageRange}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg font-bold text-foreground sm:text-xl">
                        {sec.heading}
                      </CardTitle>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={expandingSectionIdx === idx}
                        onClick={() => void onExpandSection(idx)}
                        className="h-8 gap-1.5 text-xs"
                      >
                        {expandingSectionIdx === idx ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Microscope className="h-3.5 w-3.5 text-primary" />
                        )}
                        Daha Derin Aç
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onAskCoach(
                            `"${sec.heading}" bölümünü bana temel mantığıyla özetle ve sınavda gelebilecek olası bir soru sor.`,
                          )
                        }
                        className="h-8 gap-1.5 text-xs"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                        Hocaya Sor
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant={isCompleted ? 'default' : 'ghost'}
                        onClick={() => toggleSectionComplete(idx)}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" />
                        {isCompleted ? 'Tamamlandı' : 'Okundu İşaretle'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 p-5 sm:p-6">
                  <AcademicMarkdown
                    content={sec.content}
                    className="prose-sm max-w-none leading-relaxed sm:prose-base"
                  />

                  {sec.deepResearchNote && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                        <BrainCircuit className="h-4 w-4" />
                        Derin Akademik Araştırma & Literatür Bağlamı
                      </div>
                      <AcademicMarkdown
                        content={sec.deepResearchNote}
                        className="text-xs sm:text-sm leading-relaxed"
                      />
                    </div>
                  )}

                  {sec.commonPitfalls && sec.commonPitfalls.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        Sınav Tuzakları & Sık Yapılan Hatalar
                      </p>
                      <ul className="space-y-1.5 text-xs sm:text-sm">
                        {sec.commonPitfalls.map((pit, pIdx) => (
                          <li key={pIdx} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                            <AcademicMarkdown content={pit} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sec.takeaways && sec.takeaways.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Bölüm Çıkarımları
                      </p>
                      <ul className="space-y-1.5 text-xs sm:text-sm">
                        {sec.takeaways.map((tk, tIdx) => (
                          <li key={tIdx} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <AcademicMarkdown content={tk} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Inline Checkpoint Mini-Quiz */}
                  {cq && cq.options?.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                        <GraduationCap className="h-4 w-4" />
                        Kendini Dene — Bölüm Kontrol Sorusu
                      </div>
                      <AcademicMarkdown content={cq.question} className="text-sm font-medium" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        {cq.options.map((opt, oIdx) => {
                          const answered = selectedOpt !== undefined;
                          const isPicked = selectedOpt === oIdx;
                          const isCorrect = cq.correctIndex === oIdx;
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() =>
                                setCheckpointAnswers((prev) => ({ ...prev, [idx]: oIdx }))
                              }
                              className={`flex items-start gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                                answered
                                  ? isCorrect
                                    ? 'border-emerald-500 bg-emerald-500/10 text-foreground'
                                    : isPicked
                                    ? 'border-destructive bg-destructive/10 text-foreground'
                                    : 'border-border bg-muted/20 text-muted-foreground'
                                  : 'border-border hover:border-primary/50 hover:bg-muted/40'
                              }`}
                            >
                              <span className="font-bold text-primary">
                                {String.fromCharCode(65 + oIdx)})
                              </span>
                              <AcademicMarkdown content={opt} className="text-xs" />
                            </button>
                          );
                        })}
                      </div>
                      {selectedOpt !== undefined && cq.explanation && (
                        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Açıklama: </span>
                          {cq.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Deep Research Topics */}
          {content.deepResearchTopics && content.deepResearchTopics.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Microscope className="h-4 w-4 text-primary" />
                  İleri Okuma & Literatür Araştırma Başlıkları
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {content.deepResearchTopics.map((topic, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                    <h4 className="text-sm font-bold text-foreground">{topic.topic}</h4>
                    <AcademicMarkdown
                      content={topic.literatureContext}
                      className="text-xs leading-relaxed text-muted-foreground"
                    />
                    {topic.realWorldApplication && (
                      <p className="border-t border-border/60 pt-2 text-xs text-foreground">
                        <span className="font-semibold text-primary">Uygulama / Vaka: </span>
                        {topic.realWorldApplication}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Teacher Emphasis & Exam Focus */}
          {content.teacherEmphasis && content.teacherEmphasis.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Target className="h-4 w-4 text-primary" />
                  Sınav Odaklı Kritik Noktalar
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {content.teacherEmphasis.map((item, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{item.point}</h4>
                      {item.examProbability && (
                        <Badge
                          variant={item.examProbability === 'Yüksek' ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {item.examProbability} Olasılık
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.whyImportant}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Searchable Key Terms Glossary */}
          {content.keyTerms && content.keyTerms.length > 0 && (
            <Card id="summary-glossary" className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <BookMarked className="h-4 w-4 text-primary" />
                    Akademik Kavram & Formül Sözlüğü ({content.keyTerms.length})
                  </CardTitle>
                  <div className="relative w-full sm:w-60">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Terim veya formül ara..."
                      value={termSearch}
                      onChange={(e) => setTermSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {filteredTerms.map((kt, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-foreground">{kt.term}</p>
                      <button
                        type="button"
                        onClick={() =>
                          onAskCoach(`"${kt.term}" kavramını örnek ve sınav sorusu ile açıklar mısın?`)
                        }
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        Hocaya Sor →
                      </button>
                    </div>
                    <AcademicMarkdown
                      content={kt.definition}
                      className="text-xs leading-relaxed text-muted-foreground"
                    />
                    {kt.formula && (
                      <div className="rounded-md bg-card p-2 text-xs border border-border/60">
                        <AcademicMarkdown content={`$$${kt.formula.replace(/^\$+|\$+$/g, '')}$$`} />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Self Mastery Checklist */}
          {content.studyChecklist && content.studyChecklist.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Konu Hakimiyet Kontrol Listesi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {content.studyChecklist.map((task, idx) => (
                  <label
                    key={idx}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-xs sm:text-sm hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={Boolean(checkedTasks[idx])}
                      onCheckedChange={(v) =>
                        setCheckedTasks((prev) => ({ ...prev, [idx]: Boolean(v) }))
                      }
                      className="mt-0.5"
                    />
                    <span className={checkedTasks[idx] ? 'line-through text-muted-foreground' : 'text-foreground'}>
                      {task}
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
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
