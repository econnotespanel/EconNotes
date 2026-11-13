import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Coffee, Loader2, LogIn, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { NeuralCommandShell, type NeuralTabId } from '@/components/study/neural/NeuralCommandShell';
import { NeuralCreateView } from '@/components/study/neural/NeuralCreateView';
import { NeuralEnginePanelView } from '@/components/study/neural/NeuralEnginePanelView';
import { NeuralExamSimView } from '@/components/study/neural/NeuralExamSimView';
import { NeuralHubView } from '@/components/study/neural/NeuralHubView';
import { NeuralLibraryView } from '@/components/study/neural/NeuralLibraryView';
import { NeuralPlannerView } from '@/components/study/neural/NeuralPlannerView';
import { NeuralRagChatView } from '@/components/study/neural/NeuralRagChatView';
import { NeuralReportDialog } from '@/components/study/neural/NeuralReportDialog';
import { NeuralWorkspaceFrame } from '@/components/study/neural/NeuralWorkspaceFrame';
import { useNeuralEngine } from '@/components/study/neural/useNeuralEngine';
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
import type { Json } from '@/integrations/supabase/types';
import { extractFile } from '@/lib/extractFile';
import {
  extractSearchableTextFromMaterial,
  indexDocumentInVectorStore,
  routedGenerateMaterial,
} from '@/lib/neural/engineRouter';
import {
  analyzeWeakTopics,
  getDueSrsCards,
  syncSrsCardsFromMaterials,
  type SrsCardState,
} from '@/lib/neural/studyPlanner';
import { getIndexedDocuments, removeDocumentIndex } from '@/lib/neural/vectorIndex';
import { expandSingleSummarySection } from '@/lib/studyAiClient';
import { buildNoteSourceItem, combineStudySources } from '@/lib/studySourceProcessor';
import type {
  ExtractedSourceItem,
  MaterialType,
  NoteSourceOption,
  ProcessedStudyBundle,
  StudioGenerationSettings,
  StudyMaterial,
  StudyProgressRow,
} from '@/types/study';

const NeuralVideoStudioLazy = lazy(() => import('@/components/study/neural/NeuralVideoStudio'));

const DEFAULT_SETTINGS: StudioGenerationSettings = {
  materialType: 'summary',
  summaryDepth: 'comprehensive',
  deepResearch: true,
  pedagogicalStyle: 'academic_rigor',
  questionCount: 10,
  cardCount: 16,
  difficulty: 'mixed',
  quizFormat: 'mixed',
  customPrompt: '',
  examFocus: '',
};

const VALID_TABS: NeuralTabId[] = ['hub', 'create', 'library', 'rag', 'planner', 'exam', 'engine'];

export default function Study() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const engine = useNeuralEngine();

  const [activeTab, setActiveTab] = useState<NeuralTabId>('hub');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [progress, setProgress] = useState<StudyProgressRow[]>([]);
  const [ownNotes, setOwnNotes] = useState<NoteSourceOption[]>([]);
  const [platformNotes, setPlatformNotes] = useState<NoteSourceOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [activeMaterial, setActiveMaterial] = useState<StudyMaterial | null>(null);
  const [sources, setSources] = useState<ExtractedSourceItem[]>([]);
  const [settings, setSettings] = useState<StudioGenerationSettings>(DEFAULT_SETTINGS);
  const [customTitle, setCustomTitle] = useState('');
  const [customCourse, setCustomCourse] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPct, setGenerationPct] = useState(0);
  const [generationLabel, setGenerationLabel] = useState('');
  const [convertingTo, setConvertingTo] = useState<MaterialType | null>(null);
  const [expandingSectionIdx, setExpandingSectionIdx] = useState<number | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const [srsCards, setSrsCards] = useState<SrsCardState[]>([]);
  const [indexedDocsCount, setIndexedDocsCount] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);

  const deepLinkAppliedRef = useRef(false);

  const refreshIndexedDocsCount = useCallback(() => {
    getIndexedDocuments()
      .then((docs) => setIndexedDocsCount(docs.length))
      .catch(() => {});
  }, []);

  // Load user materials, quiz progress, and note sources
  useEffect(() => {
    refreshIndexedDocsCount();
    if (authLoading) return;
    if (!user) {
      setLoadingData(false);
      return;
    }

    let cancelled = false;
    setLoadingData(true);

    const loadAll = async () => {
      try {
        const [matRes, progRes, ownRes, platRes] = await Promise.all([
          supabase
            .from('study_materials')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('study_progress')
            .select('*')
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false }),
          supabase
            .from('notes')
            .select('id, title, course, description, department, semester, file_url, file_name, file_type')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('notes')
            .select('id, title, course, description, department, semester, file_url, file_name, file_type')
            .eq('status', 'approved')
            .eq('visibility_status', 'public')
            .order('created_at', { ascending: false }),
        ]);

        if (cancelled) return;

        if (Array.isArray(matRes.data)) {
          setMaterials(matRes.data as unknown as StudyMaterial[]);
        }
        if (Array.isArray(progRes.data)) {
          setProgress(progRes.data as unknown as StudyProgressRow[]);
        }
        if (Array.isArray(ownRes.data)) {
          setOwnNotes(
            ownRes.data.map((n) => ({ ...n, origin: 'own' as const })) as NoteSourceOption[],
          );
        }
        if (Array.isArray(platRes.data)) {
          setPlatformNotes(
            platRes.data.map((n) => ({ ...n, origin: 'platform' as const })) as NoteSourceOption[],
          );
        }
      } catch {
        // Resilient load on partial network failure
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, refreshIndexedDocsCount]);

  // SM-2 Card synchronization whenever materials change
  const refreshSrsCards = useCallback(() => {
    setSrsCards(syncSrsCardsFromMaterials(materials));
  }, [materials]);

  useEffect(() => {
    refreshSrsCards();
  }, [refreshSrsCards]);

  const dueCards = useMemo(() => getDueSrsCards(srsCards), [srsCards]);
  const weakTopics = useMemo(
    () => analyzeWeakTopics(materials, progress, srsCards),
    [materials, progress, srsCards],
  );

  // 60-minute study break wellness reminder
  useEffect(() => {
    const timer = window.setInterval(() => {
      setBreakDialogOpen(true);
    }, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleExtractRemoteNoteFile = useCallback(
    async (note: NoteSourceOption): Promise<ExtractedSourceItem> => {
      if (!note.file_url) {
        return buildNoteSourceItem(note);
      }

      try {
        let blob: Blob | null = null;
        if (/^https?:\/\//i.test(note.file_url)) {
          const resp = await fetch(note.file_url);
          if (resp.ok) blob = await resp.blob();
        } else {
          const { data } = await supabase.storage.from('notes').download(note.file_url);
          if (data) blob = data;
        }

        if (!blob) return buildNoteSourceItem(note);
        const filename = note.file_name || `${note.title}.pdf`;
        const file = new File([blob], filename, { type: note.file_type || blob.type });
        const extracted = await extractFile(file);

        if (extracted.kind === 'text') {
          return buildNoteSourceItem(note, extracted.text, extracted.images);
        }
        if (extracted.kind === 'image') {
          return buildNoteSourceItem(note, undefined, [
            { data: extracted.data, mimeType: extracted.mime, pageLabel: filename },
          ]);
        }
      } catch {
        // Fallback to note metadata/description text
      }
      return buildNoteSourceItem(note);
    },
    [],
  );

  // URL Deep-link handling (?tab=..., ?create=video&noteId=...)
  useEffect(() => {
    if (deepLinkAppliedRef.current || loadingData) return;

    const tabParam = searchParams.get('tab') as NeuralTabId | null;
    const createParam = searchParams.get('create') as MaterialType | null;
    const noteId = searchParams.get('noteId');

    if (tabParam && VALID_TABS.includes(tabParam)) {
      deepLinkAppliedRef.current = true;
      setActiveTab(tabParam);
      return;
    }

    if (!createParam && !noteId) return;
    deepLinkAppliedRef.current = true;
    setActiveTab('create');

    if (
      createParam &&
      (['summary', 'quiz', 'flashcards', 'video'] as MaterialType[]).includes(createParam)
    ) {
      setSettings((prev) => ({ ...prev, materialType: createParam }));
    }

    if (noteId) {
      const target =
        ownNotes.find((n) => n.id === noteId) || platformNotes.find((n) => n.id === noteId);
      if (target) {
        void handleExtractRemoteNoteFile(target).then((src) => {
          setSources([src]);
          setCustomTitle(target.title);
          if (target.course) setCustomCourse(target.course);
          toast.info(`"${target.title}" kaynak olarak hazırlandı.`);
        });
      }
    }
  }, [loadingData, searchParams, ownNotes, platformNotes, handleExtractRemoteNoteFile]);

  const indexMaterialSilent = useCallback(
    async (mat: StudyMaterial) => {
      try {
        const text = extractSearchableTextFromMaterial(mat);
        if (!text.trim()) return;
        await indexDocumentInVectorStore({
          docId: mat.id,
          title: mat.title,
          course: mat.course,
          text,
        });
        refreshIndexedDocsCount();
      } catch {
        // Ignore non-fatal indexing errors
      }
    },
    [refreshIndexedDocsCount],
  );

  const handleGenerate = async (bundle: ProcessedStudyBundle) => {
    if (!user) {
      toast.error('Materyal üretmek için giriş yapmalısınız.');
      return;
    }
    setIsGenerating(true);
    setGenerationPct(8);
    setGenerationLabel('Neural Studio başlatılıyor...');

    try {
      const result = await routedGenerateMaterial(bundle, settings, (pct, msg) => {
        setGenerationPct(pct);
        setGenerationLabel(msg);
      });

      const noteSource = bundle.sources.find((s) => s.kind === 'note');
      const { data, error } = await supabase
        .from('study_materials')
        .insert({
          user_id: user.id,
          source_type: noteSource?.originType === 'platform' ? 'platform' : 'own',
          source_note_id: noteSource?.originNoteId || null,
          material_type: settings.materialType,
          title: bundle.title,
          course: bundle.course || bundle.detectedDiscipline || null,
          content: result.content as unknown as Json,
          model: result.model,
          exam_profile: settings.examFocus
            ? { examFocus: settings.examFocus, pedagogicalStyle: settings.pedagogicalStyle }
            : null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Materyal veritabanına kaydedilemedi.');
      }

      const saved = data as unknown as StudyMaterial;
      setMaterials((prev) => [saved, ...prev]);
      setActiveMaterial(saved);
      void indexMaterialSilent(saved);
      toast.success('Çalışma materyali hazırlandı ve RAG indeksine eklendi.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Materyal oluşturulurken bir hata oluştu.');
    } finally {
      setIsGenerating(false);
      setGenerationPct(0);
      setGenerationLabel('');
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      const { error } = await supabase.from('study_materials').delete().eq('id', id);
      if (error) throw error;
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      if (activeMaterial?.id === id) setActiveMaterial(null);
      await removeDocumentIndex(id);
      refreshIndexedDocsCount();
      toast.success('Materyal silindi.');
    } catch {
      toast.error('Materyal silinemedi.');
    }
  };

  const handleConvertTo = async (targetType: MaterialType) => {
    if (!activeMaterial || !user) return;
    setConvertingTo(targetType);
    try {
      const text = extractSearchableTextFromMaterial(activeMaterial);
      const source: ExtractedSourceItem = {
        id: `conv-${activeMaterial.id}`,
        name: activeMaterial.title,
        kind: 'note',
        originNoteId: activeMaterial.source_note_id || undefined,
        originType: activeMaterial.source_type,
        course: activeMaterial.course,
        text: text || activeMaterial.title,
        pagesOrSlides: 1,
        wordCount: Math.max(1, text.split(/\s+/).filter(Boolean).length),
        charCount: text.length,
      };
      const bundle = combineStudySources([source], activeMaterial.title, activeMaterial.course || '');
      const nextSettings: StudioGenerationSettings = { ...settings, materialType: targetType };
      const res = await routedGenerateMaterial(bundle, nextSettings);

      const { data, error } = await supabase
        .from('study_materials')
        .insert({
          user_id: user.id,
          source_type: activeMaterial.source_type,
          source_note_id: activeMaterial.source_note_id,
          material_type: targetType,
          title: activeMaterial.title,
          course: activeMaterial.course,
          content: res.content as unknown as Json,
          model: res.model,
        })
        .select()
        .single();

      if (error || !data) throw new Error(error?.message || 'Dönüştürme kaydedilemedi.');
      const saved = data as unknown as StudyMaterial;
      setMaterials((prev) => [saved, ...prev]);
      setActiveMaterial(saved);
      void indexMaterialSilent(saved);
      toast.success('Yeni format başarıyla oluşturuldu.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Format dönüştürme başarısız oldu.');
    } finally {
      setConvertingTo(null);
    }
  };

  const handleExpandSection = async (sectionIdx: number) => {
    if (!activeMaterial) return;
    const sections = activeMaterial.content?.sections;
    if (!Array.isArray(sections) || !sections[sectionIdx]) return;

    setExpandingSectionIdx(sectionIdx);
    try {
      const expanded = await expandSingleSummarySection({
        title: activeMaterial.title,
        course: activeMaterial.course,
        sectionIndex: sectionIdx,
        section: sections[sectionIdx],
        existingOverview: activeMaterial.content?.overview,
      });

      if (!expanded) {
        toast.info('Bu bölüm zaten azami derinlikte.');
        return;
      }

      const nextSections = [...sections];
      nextSections[sectionIdx] = { ...sections[sectionIdx], ...expanded };
      const nextContent = { ...activeMaterial.content, sections: nextSections };

      const { error } = await supabase
        .from('study_materials')
        .update({ content: nextContent as unknown as Json })
        .eq('id', activeMaterial.id);
      if (error) throw error;

      const updated = { ...activeMaterial, content: nextContent };
      setActiveMaterial(updated);
      setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      void indexMaterialSilent(updated);
      toast.success('Bölüm ek örnek ve derin analizle genişletildi.');
    } catch {
      toast.error('Bölüm genişletilemedi.');
    } finally {
      setExpandingSectionIdx(null);
    }
  };

  const handleRegenerateDeep = async () => {
    if (!activeMaterial) return;
    setIsRegenerating(true);
    try {
      const text = extractSearchableTextFromMaterial(activeMaterial);
      const bundle = combineStudySources(
        [
          {
            id: `regen-${activeMaterial.id}`,
            name: activeMaterial.title,
            kind: 'pasted',
            course: activeMaterial.course,
            text: text || activeMaterial.title,
            pagesOrSlides: 1,
            wordCount: Math.max(1, text.split(/\s+/).filter(Boolean).length),
            charCount: text.length,
          },
        ],
        activeMaterial.title,
        activeMaterial.course || '',
      );

      const res = await routedGenerateMaterial(bundle, {
        ...settings,
        materialType: 'summary',
        summaryDepth: 'textbook',
        deepResearch: true,
      });

      const { error } = await supabase
        .from('study_materials')
        .update({ content: res.content as unknown as Json, model: res.model })
        .eq('id', activeMaterial.id);
      if (error) throw error;

      const updated: StudyMaterial = { ...activeMaterial, content: res.content, model: res.model };
      setActiveMaterial(updated);
      setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      void indexMaterialSilent(updated);
      toast.success('Özet akademik ders kitabı derinliğiyle yenilendi.');
    } catch {
      toast.error('Yeniden sentezleme başarısız oldu.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRecordProgress = async (materialId: string, score: number, total: number) => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    try {
      await supabase.from('study_progress').insert({
        user_id: user.id,
        material_id: materialId,
        score,
        total_questions: total,
        attempts: 1,
        completed_at: nowIso,
      });
      setProgress((prev) => [
        {
          id: `local-${Date.now()}`,
          user_id: user.id,
          material_id: materialId,
          score,
          total_questions: total,
          attempts: 1,
          completed_at: nowIso,
        },
        ...prev,
      ]);
    } catch {
      // Non-fatal progress telemetry error
    }
  };

  const handleSavedLiveMaterial = (saved: StudyMaterial) => {
    setMaterials((prev) => [saved, ...prev]);
    setActiveMaterial(saved);
    void indexMaterialSilent(saved);
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>EconNotes Neural Studio hazırlanıyor...</span>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto my-12 max-w-lg rounded-3xl border border-border/70 bg-card p-8 text-center space-y-4 shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">EconNotes Neural Studio</h1>
          <p className="text-sm text-muted-foreground">
            Çalışma materyali üretmek, WebGPU yerel AI ve çoklu kaynak RAG asistanını kullanmak
            için oturum açmalısınız.
          </p>
          <Button onClick={() => navigate('/auth')} className="gap-2">
            <LogIn className="h-4 w-4" />
            Giriş Yap / Kayıt Ol
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        {activeMaterial?.material_type === 'video' ? (
          <Suspense
            fallback={
              <div className="flex min-h-[55vh] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>Video Stüdyosu Sahne Motoru yükleniyor...</span>
              </div>
            }
          >
            <NeuralVideoStudioLazy
              material={activeMaterial}
              onClose={() => setActiveMaterial(null)}
              onReport={() => setReportOpen(true)}
              onOpenCoach={() => {
                setActiveMaterial(null);
                setActiveTab('rag');
              }}
            />
          </Suspense>
        ) : activeMaterial ? (
          <NeuralWorkspaceFrame
            material={activeMaterial}
            onBack={() => setActiveMaterial(null)}
            onConvertTo={handleConvertTo}
            convertingTo={convertingTo}
            onExpandSection={handleExpandSection}
            expandingSectionIdx={expandingSectionIdx}
            onRegenerateDeep={handleRegenerateDeep}
            isRegenerating={isRegenerating}
            onRecordProgress={(score, total) =>
              handleRecordProgress(activeMaterial.id, score, total)
            }
            onReportIssue={() => setReportOpen(true)}
          />
        ) : (
          <NeuralCommandShell
            activeTab={activeTab}
            onTabChange={setActiveTab}
            engine={engine}
            dueCardsCount={dueCards.length}
            materialsCount={materials.length}
            indexedDocsCount={indexedDocsCount}
            onReportIssue={() => setReportOpen(true)}
          >
            {activeTab === 'hub' && (
              <NeuralHubView
                materials={materials}
                progress={progress}
                dueCards={dueCards}
                weakTopics={weakTopics}
                engine={engine}
                isAdmin={isAdmin}
                userId={user.id}
                onSavedLiveMaterial={handleSavedLiveMaterial}
                onGoTab={setActiveTab}
                onOpenMaterial={setActiveMaterial}
              />
            )}

            {activeTab === 'create' && (
              <NeuralCreateView
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
                onGenerate={handleGenerate}
                onExtractRemoteNoteFile={handleExtractRemoteNoteFile}
                engine={engine}
              />
            )}

            {activeTab === 'library' && (
              <NeuralLibraryView
                materials={materials}
                progress={progress}
                onOpenMaterial={setActiveMaterial}
                onDeleteMaterial={handleDeleteMaterial}
                onCreateNew={() => setActiveTab('create')}
                onIndexChanged={refreshIndexedDocsCount}
              />
            )}

            {activeTab === 'rag' && (
              <NeuralRagChatView
                materials={materials}
                onIndexChanged={refreshIndexedDocsCount}
                onOpenMaterial={setActiveMaterial}
              />
            )}

            {activeTab === 'planner' && (
              <NeuralPlannerView
                materials={materials}
                progress={progress}
                srsCards={srsCards}
                dueCards={dueCards}
                onSrsUpdated={refreshSrsCards}
                onOpenMaterial={setActiveMaterial}
                onStartExamSim={() => setActiveTab('exam')}
              />
            )}

            {activeTab === 'exam' && (
              <NeuralExamSimView
                materials={materials}
                onRecordExamProgress={handleRecordProgress}
                onGoWeakPlanner={() => setActiveTab('planner')}
              />
            )}

            {activeTab === 'engine' && <NeuralEnginePanelView engine={engine} />}
          </NeuralCommandShell>
        )}
      </div>

      <NeuralReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        materialId={activeMaterial?.id}
      />

      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-amber-500" />
              60 Dakikalık Odak Molası Önerisi
            </DialogTitle>
            <DialogDescription>
              Kesintisiz 60 dakikadır Çalışma Stüdyosu’ndasınız. Bilişsel hafıza pekişmesi için
              5-10 dakikalık kısa bir mola verip ardından Aralıklı Tekrar (SM-2) kartlarına göz
              atmanız önerilir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakDialogOpen(false)}>
              Devam Et
            </Button>
            <Button
              onClick={() => {
                setBreakDialogOpen(false);
                setActiveMaterial(null);
                setActiveTab('planner');
              }}
            >
              Tekrar Planına Geç
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
