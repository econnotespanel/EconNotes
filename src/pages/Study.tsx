import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Coffee } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { SourceComposerHub } from '@/components/study/SourceComposerHub';
import { StudyHeroAndStats } from '@/components/study/StudyHeroAndStats';
import { StudyMaterialLibrary } from '@/components/study/StudyMaterialLibrary';
import { StudyReportDialog } from '@/components/study/StudyReportDialog';
import { StudyWorkspace } from '@/components/study/StudyWorkspace';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { signedNoteUrl } from '@/lib/storageUrl';
import {
  expandSingleSummarySection,
  generateMaterialWithOrchestration,
} from '@/lib/studyAiClient';
import {
  buildNoteSourceItem,
  combineStudySources,
  extractUploadedSource,
} from '@/lib/studySourceProcessor';
import type {
  ExtractedSourceItem,
  MaterialType,
  NoteSourceOption,
  ProcessedStudyBundle,
  StudioGenerationSettings,
  StudyMaterial,
  StudyProgressRow,
  SummaryContent,
} from '@/types/study';
import { toast } from 'sonner';

const LiveLectureCaptureLazy = lazy(() => import('@/components/study/LiveLectureCapture'));
const InteractiveVideoStudioLazy = lazy(
  () => import('@/components/study/InteractiveVideoStudio'),
);

const StudyChunkFallback = () => (
  <div className="h-40 w-full animate-pulse rounded-xl bg-muted" aria-busy="true" />
);

interface LiveLectureCaptureProps {
  userId: string;
  onSaved: (material: StudyMaterial) => void;
}

interface InteractiveVideoStudioProps {
  material: StudyMaterial;
  onClose: () => void;
  onReport: () => void;
}

const LiveLectureCapture = (props: LiveLectureCaptureProps) => (
  <Suspense fallback={<StudyChunkFallback />}>
    <LiveLectureCaptureLazy {...(props as unknown as Record<string, never>)} />
  </Suspense>
);

const InteractiveVideoStudio = (props: InteractiveVideoStudioProps) => (
  <Suspense fallback={<StudyChunkFallback />}>
    <InteractiveVideoStudioLazy {...(props as unknown as Record<string, never>)} />
  </Suspense>
);

interface DbNoteRow {
  id: string;
  title: string;
  course: string | null;
  description?: string | null;
  department?: string | null;
  semester?: string | null;
  user_id: string;
  status?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  file_type?: string | null;
}

const DEFAULT_SETTINGS: StudioGenerationSettings = {
  materialType: 'summary',
  summaryDepth: 'comprehensive',
  deepResearch: true,
  pedagogicalStyle: 'balanced',
  questionCount: 12,
  cardCount: 16,
  difficulty: 'mixed',
  quizFormat: 'mixed',
  customPrompt: '',
  examFocus: '',
};

const Study = () => {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [ownNotes, setOwnNotes] = useState<NoteSourceOption[]>([]);
  const [platformNotes, setPlatformNotes] = useState<NoteSourceOption[]>([]);
  const [progressRows, setProgressRows] = useState<StudyProgressRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeMaterial, setActiveMaterial] = useState<StudyMaterial | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

  // Composer State
  const [showComposer, setShowComposer] = useState(true);
  const [sources, setSources] = useState<ExtractedSourceItem[]>([]);
  const [settings, setSettings] = useState<StudioGenerationSettings>(DEFAULT_SETTINGS);
  const [customTitle, setCustomTitle] = useState('');
  const [customCourse, setCustomCourse] = useState('');

  // Generation / Mutation Progress
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPct, setGenerationPct] = useState(0);
  const [generationLabel, setGenerationLabel] = useState('');
  const [convertingTo, setConvertingTo] = useState<MaterialType | null>(null);
  const [expandingSectionIdx, setExpandingSectionIdx] = useState<number | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const composerRef = useRef<HTMLDivElement | null>(null);
  const studyStartRef = useRef<number>(Date.now());
  const handledDeepLinkRef = useRef<string | null>(null);

  // 1-Hour study break reminder
  useEffect(() => {
    const timer = window.setInterval(() => {
      const mins = (Date.now() - studyStartRef.current) / 60000;
      if (mins >= 60) {
        setBreakOpen(true);
        studyStartRef.current = Date.now();
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mRes, ownRes, platRes, progRes] = await Promise.all([
        supabase
          .from('study_materials')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('notes')
          .select('id,title,course,description,department,semester,user_id,status,file_name,file_url,file_type')
          .eq('user_id', user.id),
        supabase
          .from('notes')
          .select('id,title,course,description,department,semester,user_id,status,file_name,file_url,file_type')
          .eq('status', 'approved')
          .limit(200),
        supabase
          .from('study_progress')
          .select('id,material_id,score,total_questions,completed_at')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false }),
      ]);

      if (mRes.error) toast.error(`Çalışma materyalleri yüklenemedi: ${mRes.error.message}`);
      if (ownRes.error) toast.error(`Notlarınız yüklenemedi: ${ownRes.error.message}`);

      if (mRes.data) setMaterials(mRes.data as unknown as StudyMaterial[]);
      if (ownRes.data) {
        setOwnNotes(
          (ownRes.data as DbNoteRow[]).map((n) => ({
            ...n,
            origin: 'own' as const,
          })),
        );
      }
      if (platRes.data) {
        setPlatformNotes(
          (platRes.data as DbNoteRow[])
            .filter((n) => n.user_id !== user.id)
            .map((n) => ({
              ...n,
              origin: 'platform' as const,
            })),
        );
      }
      if (progRes.data) setProgressRows(progRes.data as StudyProgressRow[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleExtractRemoteNoteFile = useCallback(
    async (note: NoteSourceOption): Promise<ExtractedSourceItem> => {
      if (!note.file_url) {
        return buildNoteSourceItem(note);
      }
      const signedUrl = await signedNoteUrl(note.file_url);
      if (!signedUrl) {
        throw new Error(`"${note.title}" dosyasına erişilemedi.`);
      }
      const fileResponse = await fetch(signedUrl);
      if (!fileResponse.ok) {
        throw new Error(`"${note.title}" dosyası indirilemedi.`);
      }
      const blob = await fileResponse.blob();
      const noteFile = new File([blob], note.file_name || 'ders-notu.pdf', {
        type: note.file_type || blob.type,
      });
      const extractedItem = await extractUploadedSource(noteFile);
      return buildNoteSourceItem(note, extractedItem.text, extractedItem.images);
    },
    [],
  );

  // URL Deep-link handling (?create=video&noteId=...&sourceMode=...)
  useEffect(() => {
    const createParam = searchParams.get('create');
    const noteIdParam = searchParams.get('noteId');
    const sourceModeParam = searchParams.get('sourceMode');
    if (!createParam && !noteIdParam) return;

    const deepKey = `${createParam || ''}|${noteIdParam || ''}|${sourceModeParam || ''}`;
    if (handledDeepLinkRef.current === deepKey) return;

    if (createParam === 'video') {
      setSettings((s) => ({ ...s, materialType: 'video' }));
      setShowComposer(true);
    }

    if (noteIdParam) {
      const targetNote =
        ownNotes.find((n) => n.id === noteIdParam) ||
        platformNotes.find((n) => n.id === noteIdParam);
      if (!targetNote) return; // wait until notes load

      handledDeepLinkRef.current = deepKey;
      setShowComposer(true);
      void handleExtractRemoteNoteFile(targetNote)
        .then((item) => {
          setSources((prev) =>
            prev.some((s) => s.originNoteId === item.originNoteId) ? prev : [...prev, item],
          );
          if (!customTitle) setCustomTitle(targetNote.title);
          if (!customCourse && targetNote.course) setCustomCourse(targetNote.course);
          toast.success(`"${targetNote.title}" çalışma stüdyosuna eklendi.`);
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Not yüklenemedi.');
        });
      setSearchParams({}, { replace: true });
    } else {
      handledDeepLinkRef.current = deepKey;
      setSearchParams({}, { replace: true });
    }
  }, [
    searchParams,
    setSearchParams,
    ownNotes,
    platformNotes,
    handleExtractRemoteNoteFile,
    customTitle,
    customCourse,
  ]);

  const scrollToComposer = () => {
    setShowComposer(true);
    setTimeout(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleGenerate = async (bundle: ProcessedStudyBundle) => {
    if (!user) {
      toast.error('Oluşturmak için giriş yapmalısınız.');
      return;
    }

    setIsGenerating(true);
    setGenerationPct(8);
    setGenerationLabel('Kaynaklar analiz ediliyor...');

    try {
      const result = await generateMaterialWithOrchestration(
        bundle,
        settings,
        (pct, lbl) => {
          setGenerationPct(pct);
          setGenerationLabel(lbl);
        },
      );

      setGenerationPct(98);
      setGenerationLabel('Çalışma seti kütüphanenize kaydediliyor...');

      const linkedNote = bundle.sources.find((s) => s.kind === 'note');
      const sourceType: 'own' | 'platform' =
        linkedNote?.originType === 'platform' ? 'platform' : 'own';
      const sourceNoteId = linkedNote?.originNoteId || null;

      const { data: inserted, error } = await supabase
        .from('study_materials')
        .insert({
          user_id: user.id,
          source_type: sourceType,
          source_note_id: sourceNoteId,
          material_type: settings.materialType,
          title: bundle.title,
          course: bundle.course || bundle.detectedDiscipline || null,
          content: result.content,
          model: result.model,
          exam_profile: {
            deepResearch: settings.deepResearch,
            summaryDepth: settings.summaryDepth,
            pedagogicalStyle: settings.pedagogicalStyle,
            quizFormat: settings.quizFormat,
            sourceMode: result.sourceMode,
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
          },
        })
        .select('*')
        .single();

      if (error || !inserted) {
        throw new Error(error?.message || 'Materyal veritabanına kaydedilemedi.');
      }

      const savedMaterial = inserted as StudyMaterial;
      setMaterials((prev) => [savedMaterial, ...prev]);
      setActiveMaterial(savedMaterial);
      toast.success(
        result.sourceMode === 'ai'
          ? 'Derin öğrenme çalışma setiniz hazır!'
          : 'Materyal yerel yapısal ayrıştırıcı ile oluşturuldu.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Materyal oluşturulamadı.');
    } finally {
      setIsGenerating(false);
      setGenerationPct(0);
      setGenerationLabel('');
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    const { error } = await supabase.from('study_materials').delete().eq('id', id);
    if (error) {
      toast.error(`Silinemedi: ${error.message}`);
      return;
    }
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    if (activeMaterial?.id === id) setActiveMaterial(null);
    toast.success('Çalışma materyali silindi.');
  };

  const buildTextFromSummaryMaterial = (mat: StudyMaterial): string => {
    const sc: SummaryContent = mat.content || {};
    return [
      sc.overview || '',
      Array.isArray(sc.keyPoints) ? sc.keyPoints.join('\n') : '',
      ...(Array.isArray(sc.sections)
        ? sc.sections.map((s) => `## ${s.heading}\n${s.content}`)
        : []),
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  const handleConvertTo = async (targetType: MaterialType) => {
    if (!activeMaterial || !user) return;
    setConvertingTo(targetType);
    try {
      const sourceText = buildTextFromSummaryMaterial(activeMaterial);
      const pseudoBundle = combineStudySources(
        [
          {
            id: `mat-${activeMaterial.id}`,
            name: activeMaterial.title,
            kind: 'pasted',
            course: activeMaterial.course,
            text: sourceText,
            pagesOrSlides: Math.max(1, activeMaterial.content?.sections?.length || 1),
            wordCount: sourceText.split(/\s+/).filter(Boolean).length,
            charCount: sourceText.length,
          },
        ],
        `${activeMaterial.title} — ${
          targetType === 'quiz'
            ? 'Sınav'
            : targetType === 'flashcards'
            ? 'Bilgi Kartları'
            : 'Video Ders'
        }`,
        activeMaterial.course || '',
      );

      const nextSettings: StudioGenerationSettings = {
        ...settings,
        materialType: targetType,
      };
      const result = await generateMaterialWithOrchestration(pseudoBundle, nextSettings);

      const { data: inserted, error } = await supabase
        .from('study_materials')
        .insert({
          user_id: user.id,
          source_type: activeMaterial.source_type,
          source_note_id: activeMaterial.source_note_id,
          material_type: targetType,
          title: pseudoBundle.title,
          course: activeMaterial.course,
          content: result.content,
          model: result.model,
        })
        .select('*')
        .single();

      if (error || !inserted) throw new Error(error?.message || 'Dönüştürme kaydedilemedi.');
      const newMat = inserted as StudyMaterial;
      setMaterials((prev) => [newMat, ...prev]);
      setActiveMaterial(newMat);
      toast.success('Yeni çalışma materyali oluşturuldu ve açıldı.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dönüştürme başarısız oldu.');
    } finally {
      setConvertingTo(null);
    }
  };

  const handleExpandSection = async (sectionIdx: number) => {
    if (!activeMaterial) return;
    const sections = Array.isArray(activeMaterial.content?.sections)
      ? [...activeMaterial.content.sections]
      : [];
    const targetSec = sections[sectionIdx];
    if (!targetSec) return;

    setExpandingSectionIdx(sectionIdx);
    try {
      const expanded = await expandSingleSummarySection({
        title: activeMaterial.title,
        course: activeMaterial.course,
        sectionIndex: sectionIdx,
        section: targetSec,
        existingOverview: activeMaterial.content?.overview,
      });

      if (!expanded) {
        toast.error('Bu bölüm şu an genişletilemedi, lütfen biraz sonra tekrar deneyin.');
        return;
      }

      sections[sectionIdx] = { ...targetSec, ...expanded };
      const updatedContent = { ...activeMaterial.content, sections };

      const { error } = await supabase
        .from('study_materials')
        .update({ content: updatedContent })
        .eq('id', activeMaterial.id);

      if (error) throw error;

      const updatedMaterial = { ...activeMaterial, content: updatedContent };
      setActiveMaterial(updatedMaterial);
      setMaterials((prev) => prev.map((m) => (m.id === activeMaterial.id ? updatedMaterial : m)));
      toast.success(`"${targetSec.heading}" bölümü derinleştirildi ve kaydedildi.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bölüm güncellenemedi.');
    } finally {
      setExpandingSectionIdx(null);
    }
  };

  const handleRegenerateDeep = async () => {
    if (!activeMaterial || activeMaterial.material_type !== 'summary') return;
    setIsRegenerating(true);
    try {
      const rawText = buildTextFromSummaryMaterial(activeMaterial);
      const bundle = combineStudySources(
        [
          {
            id: `regen-${activeMaterial.id}`,
            name: activeMaterial.title,
            kind: 'pasted',
            course: activeMaterial.course,
            text: rawText,
            pagesOrSlides: Math.max(1, activeMaterial.content?.sections?.length || 1),
            wordCount: rawText.split(/\s+/).filter(Boolean).length,
            charCount: rawText.length,
          },
        ],
        activeMaterial.title,
        activeMaterial.course || '',
      );

      const deepSettings: StudioGenerationSettings = {
        ...settings,
        materialType: 'summary',
        summaryDepth: 'comprehensive',
        deepResearch: true,
      };

      const result = await generateMaterialWithOrchestration(bundle, deepSettings);
      const { error } = await supabase
        .from('study_materials')
        .update({ content: result.content, model: result.model })
        .eq('id', activeMaterial.id);

      if (error) throw error;

      const updated = { ...activeMaterial, content: result.content, model: result.model };
      setActiveMaterial(updated);
      setMaterials((prev) => prev.map((m) => (m.id === activeMaterial.id ? updated : m)));
      toast.success('Ders özeti Derin Araştırma modunda yeniden sentezlendi.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yeniden sentezleme başarısız oldu.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRecordProgress = async (score: number, totalQuestions: number) => {
    if (!user || !activeMaterial) return;
    const { data, error } = await supabase
      .from('study_progress')
      .insert({
        user_id: user.id,
        material_id: activeMaterial.id,
        score,
        total_questions: totalQuestions,
      })
      .select('id,material_id,score,total_questions,completed_at')
      .single();

    if (!error && data) {
      setProgressRows((prev) => [data as StudyProgressRow, ...prev]);
      toast.success(`Çalışma puanınız kaydedildi (${score}/${totalQuestions}).`);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        {activeMaterial && activeMaterial.material_type !== 'video' ? (
          <StudyWorkspace
            material={activeMaterial}
            onBack={() => setActiveMaterial(null)}
            onConvertTo={(target) => void handleConvertTo(target)}
            convertingTo={convertingTo}
            onExpandSection={handleExpandSection}
            expandingSectionIdx={expandingSectionIdx}
            onRegenerateDeep={handleRegenerateDeep}
            isRegenerating={isRegenerating}
            onRecordProgress={handleRecordProgress}
            onReportIssue={() => setReportOpen(true)}
          />
        ) : (
          <>
            <StudyHeroAndStats
              materials={materials}
              progress={progressRows}
              showComposer={showComposer}
              onStartCreate={scrollToComposer}
              onReportIssue={() => setReportOpen(true)}
            />

            {isAdmin && user && (
              <LiveLectureCapture
                userId={user.id}
                onSaved={(mat: StudyMaterial) => setMaterials((prev) => [mat, ...prev])}
              />
            )}

            <div ref={composerRef}>
              {showComposer && (
                <SourceComposerHub
                  ownNotes={ownNotes}
                  platformNotes={platformNotes}
                  sources={sources}
                  onSourcesChange={setSources}
                  settings={settings}
                  onSettingsChange={setSettings}
                  customTitle={customTitle}
                  onCustomTitleChange={setCustomTitle}
                  customCourse={customCourse}
                  onCustomCourseChange={setCustomCourse}
                  isGenerating={isGenerating}
                  generationPct={generationPct}
                  generationLabel={generationLabel}
                  onGenerate={(bundle) => void handleGenerate(bundle)}
                  onExtractRemoteNoteFile={handleExtractRemoteNoteFile}
                />
              )}
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : (
              <StudyMaterialLibrary
                materials={materials}
                progress={progressRows}
                onOpenMaterial={(mat) => setActiveMaterial(mat)}
                onDeleteMaterial={(id) => void handleDeleteMaterial(id)}
                onCreateNew={scrollToComposer}
              />
            )}
          </>
        )}
      </div>

      {/* Interactive Video Studio Overlay */}
      {activeMaterial && activeMaterial.material_type === 'video' && (
        <InteractiveVideoStudio
          key={activeMaterial.id}
          material={activeMaterial}
          onClose={() => setActiveMaterial(null)}
          onReport={() => setReportOpen(true)}
        />
      )}

      {/* Report Issue Dialog */}
      <StudyReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        materialId={activeMaterial?.id}
      />

      {/* 1-Hour Study Break Reminder */}
      <Dialog open={breakOpen} onOpenChange={setBreakOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-amber-500" />
              Küçük bir mola vermek ister misin?
            </DialogTitle>
            <DialogDescription>
              Yoğun bir şekilde çalışıyorsun — iyi bir molayı hak ettin. Bir bardak su iç,
              gözlerini dinlendir ve 5 dakika sonra kaldığın yerden verimle devam et.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBreakOpen(false)}>
              Devam edeyim
            </Button>
            <Button onClick={() => setBreakOpen(false)} className="gap-2">
              <Coffee className="h-4 w-4" />5 dakika mola
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Study;
