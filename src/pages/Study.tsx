import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Coffee, Loader2, LogIn, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import ContextualTipBanner from '@/components/onboarding/ContextualTipBanner';
import { NeuralCommandShell, type NeuralTabId } from '@/components/study/neural/NeuralCommandShell';
import { NeuralEnginePanelView } from '@/components/study/neural/NeuralEnginePanelView';
import { NeuralExamSimView } from '@/components/study/neural/NeuralExamSimView';
import { NeuralLibraryView } from '@/components/study/neural/NeuralLibraryView';
import { NeuralPlannerView } from '@/components/study/neural/NeuralPlannerView';
import { NeuralReportDialog } from '@/components/study/neural/NeuralReportDialog';
import { NeuralWorkspaceFrame } from '@/components/study/neural/NeuralWorkspaceFrame';
import { NotebookStudioWorkspace } from '@/components/study/neural/NotebookStudioWorkspace';
import { SummaryAnalysisProgressView } from '@/components/study/neural/SummaryAnalysisProgressView';
import { VideoScenarioPreviewDialog } from '@/components/study/neural/VideoScenarioPreviewDialog';
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
  extractStoragePathCandidates,
  NOTES_BUCKET,
  signedNoteUrlWithDetail,
} from '@/lib/storageUrl';
import {
  extractSearchableTextFromMaterial,
  indexDocumentInVectorStore,
  routedGenerateMaterial,
  routedRagAnswer,
} from '@/lib/neural/engineRouter';
import {
  createEmptyNotebook,
  loadActiveNotebookId,
  loadUserNotebooks,
  saveActiveNotebookId,
  saveUserNotebooks,
} from '@/lib/neural/notebookStore';
import {
  getDueSrsCards,
  syncSrsCardsFromMaterials,
  type SrsCardState,
} from '@/lib/neural/studyPlanner';
import { getIndexedDocuments, removeDocumentIndex } from '@/lib/neural/vectorIndex';
import { expandSingleSummarySection } from '@/lib/studyAiClient';
import {
  buildBundleFromCanonicalAnalysis,
  buildCanonicalSourceAnalysis,
  enrichSourceWithCourseDetection,
} from '@/lib/studySourceAnalysis';
import {
  buildNoteSourceItem,
  buildPastedSourceItem,
  combineStudySources,
} from '@/lib/studySourceProcessor';
import { summaryJobManager } from '@/lib/studySummaryJobManager';
import type {
  CoachMode,
  ExtractedSourceItem,
  MaterialType,
  NotebookAttachmentImage,
  NotebookChatMessage,
  NoteSourceOption,
  PinnedStudyNote,
  StudioGenerationSettings,
  StudioNotebook,
  StudyMaterial,
  StudyProgressRow,
  SummaryJobState,
  VideoScenarioPlan,
} from '@/types/study';

const NeuralVideoStudioLazy = lazy(() => import('@/components/study/neural/NeuralVideoStudio'));

const DEFAULT_SETTINGS: StudioGenerationSettings = {
  materialType: 'summary',
  summaryDepth: 'comprehensive',
  deepResearch: false,
  pedagogicalStyle: 'balanced',
  questionCount: 10,
  cardCount: 16,
  difficulty: 'mixed',
  quizFormat: 'multiple_choice',
  customPrompt: '',
  examFocus: '',
  faculty: 'auto',
  examMode: 'balanced',
};

const VALID_TABS: NeuralTabId[] = [
  'workspace',
  'hub',
  'create',
  'library',
  'rag',
  'planner',
  'exam',
  'engine',
];

function normalizeTab(tab: NeuralTabId | null): NeuralTabId {
  if (!tab || !VALID_TABS.includes(tab)) return 'workspace';
  if (tab === 'hub' || tab === 'create' || tab === 'rag') return 'workspace';
  return tab;
}

export default function Study() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const engine = useNeuralEngine();

  const [activeTab, setActiveTab] = useState<NeuralTabId>('workspace');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [progress, setProgress] = useState<StudyProgressRow[]>([]);
  const [ownNotes, setOwnNotes] = useState<NoteSourceOption[]>([]);
  const [platformNotes, setPlatformNotes] = useState<NoteSourceOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [notebooks, setNotebooks] = useState<StudioNotebook[]>(() => [
    createEmptyNotebook({ title: 'Çalışma Defterim', emoji: '📘' }),
  ]);
  const [activeNotebookId, setActiveNotebookId] = useState<string>('');
  const [notebooksLoadedForUser, setNotebooksLoadedForUser] = useState<string | null>(null);

  const [activeMaterial, setActiveMaterial] = useState<StudyMaterial | null>(null);
  const [settings, setSettings] = useState<StudioGenerationSettings>(DEFAULT_SETTINGS);
  const [coachMode, setCoachMode] = useState<CoachMode>('reinforce');
  const [chatBusy, setChatBusy] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPct, setGenerationPct] = useState(0);
  const [generationLabel, setGenerationLabel] = useState('');
  const [pendingCourseConfirmType, setPendingCourseConfirmType] = useState<MaterialType | null>(null);
  const [pendingMultiCourseType, setPendingMultiCourseType] = useState<MaterialType | null>(null);
  const [videoScenarioOpen, setVideoScenarioOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [convertingTo, setConvertingTo] = useState<MaterialType | null>(null);
  const [expandingSectionIdx, setExpandingSectionIdx] = useState<number | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSavingToAccount, setIsSavingToAccount] = useState(false);
  const [activeSummaryJob, setActiveSummaryJob] = useState<SummaryJobState | null>(
    () => summaryJobManager.getSnapshot().activeJob,
  );
  const [showSummaryProgress, setShowSummaryProgress] = useState(false);

  const [srsCards, setSrsCards] = useState<SrsCardState[]>([]);
  const [indexedDocsCount, setIndexedDocsCount] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);

  const deepLinkAppliedRef = useRef(false);

  const activeNotebook = useMemo(
    () => notebooks.find((n) => n.id === activeNotebookId) || notebooks[0],
    [notebooks, activeNotebookId],
  );

  // Single canonical source analysis shared across ALL Studio tools (Summary, Video, Quiz, Flashcards, MindMap, Exam Plan, Tutor)
  const canonicalAnalysis = useMemo(() => {
    if (!activeNotebook) {
      return buildCanonicalSourceAnalysis({ sources: [], allMaterials: materials });
    }
    const checkedRaw = activeNotebook.sources.filter((s) =>
      activeNotebook.checkedSourceIds.includes(s.id),
    );
    const checkedMats: ExtractedSourceItem[] = materials
      .filter((m) => activeNotebook.checkedMaterialIds.includes(m.id))
      .map((mat) => {
        const txt = extractSearchableTextFromMaterial(mat);
        return {
          id: `mat-src-${mat.id}`,
          name: mat.title,
          kind: 'note' as const,
          originNoteId: mat.source_note_id || undefined,
          originType: mat.source_type,
          course: mat.course,
          courseConfirmedByUser: false,
          text: txt || mat.title,
          pagesOrSlides: Math.max(1, Math.ceil(txt.split(/\s+/).length / 300)),
          wordCount: Math.max(1, txt.split(/\s+/).filter(Boolean).length),
          charCount: txt.length,
        };
      });
    return buildCanonicalSourceAnalysis({
      sources: [...checkedRaw, ...checkedMats],
      allMaterials: materials,
    });
  }, [activeNotebook, materials]);

  const updateActiveNotebook = useCallback(
    (updater: (nb: StudioNotebook) => StudioNotebook) => {
      setNotebooks((prev) => {
        const targetId = prev.some((n) => n.id === activeNotebookId)
          ? activeNotebookId
          : prev[0]?.id;
        return prev.map((nb) =>
          nb.id === targetId
            ? { ...updater(nb), updatedAt: new Date().toISOString() }
            : nb,
        );
      });
    },
    [activeNotebookId],
  );

  // Load persisted notebooks when user signs in
  useEffect(() => {
    if (!user) return;
    const loaded = loadUserNotebooks(user.id);
    const savedActive = loadActiveNotebookId(user.id);
    const chosenId =
      savedActive && loaded.some((n) => n.id === savedActive)
        ? savedActive
        : loaded[0].id;
    setNotebooks(loaded);
    setActiveNotebookId(chosenId);
    setNotebooksLoadedForUser(user.id);
  }, [user]);

  // Subscribe to resilient background summary job manager & hydrate unfinished jobs across reloads/routes
  useEffect(() => {
    const unsubscribe = summaryJobManager.subscribe((snap) => {
      setActiveSummaryJob(snap.activeJob);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    void summaryJobManager.hydrateForUser(user.id).then((jobs) => {
      const unfinished = jobs.find(
        (j) => j.status === 'processing' || j.status === 'queued',
      );
      if (unfinished) {
        setActiveSummaryJob(unfinished);
        // Surface progress screen cleanly if user refreshed mid-analysis
        setShowSummaryProgress(true);
      }
    });
  }, [user]);

  // Persist notebooks whenever they change
  useEffect(() => {
    if (!user || notebooksLoadedForUser !== user.id) return;
    saveUserNotebooks(user.id, notebooks);
  }, [user, notebooks, notebooksLoadedForUser]);

  useEffect(() => {
    if (!user || !activeNotebookId || notebooksLoadedForUser !== user.id) return;
    saveActiveNotebookId(user.id, activeNotebookId);
  }, [user, activeNotebookId, notebooksLoadedForUser]);

  const refreshIndexedDocsCount = useCallback(() => {
    getIndexedDocuments()
      .then((docs) => setIndexedDocsCount(docs.length))
      .catch(() => {});
  }, []);

  // Load user materials, quiz progress, and note sources (FIXED platform notes query!)
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
            .select('id, title, course, description, department, semester, file_url, file_name, file_type, has_password')
            .eq('status', 'approved')
            .or('has_password.is.null,has_password.eq.false')
            .order('created_at', { ascending: false })
            .limit(400),
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

  // Sync browser Fullscreen API state (explicit user click ONLY — never auto-invoked)
  useEffect(() => {
    const onFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      if (!next && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        void document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }, []);

  const handleToggleBrowserFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen();
        }
      } else if (typeof document.documentElement.requestFullscreen === 'function') {
        await document.documentElement.requestFullscreen();
        setFocusMode(true);
      } else {
        setFocusMode((prev) => !prev);
      }
    } catch {
      setFocusMode((prev) => !prev);
    }
  }, []);

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
        const pathCandidates = extractStoragePathCandidates(note.file_url, NOTES_BUCKET);

        // 1. Try authenticated signed URL from private `notes` bucket first
        for (const cand of pathCandidates) {
          const signedRes = await signedNoteUrlWithDetail(cand, 900);
          if (signedRes.signedUrl) {
            const resp = await fetch(signedRes.signedUrl);
            if (resp.ok) {
              blob = await resp.blob();
              break;
            }
          }
        }

        // 2. Direct authenticated Storage download fallback
        if (!blob) {
          for (const cand of pathCandidates) {
            const { data } = await supabase.storage.from(NOTES_BUCKET).download(cand);
            if (data) {
              blob = data;
              break;
            }
          }
        }

        // 3. Direct URL fallback (only for legacy external URLs)
        if (!blob && /^https?:\/\//i.test(note.file_url)) {
          const resp = await fetch(note.file_url);
          if (resp.ok) blob = await resp.blob();
        }

        if (!blob) return buildNoteSourceItem(note);
        const filename = note.file_name || `${note.title}.pdf`;
        const file = new File([blob], filename, { type: note.file_type || blob.type });
        const extracted = await extractFile(file);

        if (extracted.kind === 'text') {
          return buildNoteSourceItem(note, extracted.text, extracted.images, {
            totalPages: extracted.totalPages || extracted.pages,
            unreadablePages: extracted.unreadablePages,
            warnings: extracted.warnings,
          });
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

  const indexSourceSilent = useCallback(
    async (src: ExtractedSourceItem) => {
      if (!src.text || src.text.trim().length < 20) return;
      try {
        // Strictly independent per-source course (NEVER inherit from notebook or prior sources!)
        const analyzed = enrichSourceWithCourseDetection(src);
        await indexDocumentInVectorStore({
          docId: `direct-${analyzed.id}`,
          title: analyzed.name,
          course: analyzed.course || null,
          text: analyzed.text,
          computeEmbeddings: engine.embedderStatus === 'ready',
        });
        refreshIndexedDocsCount();
      } catch {
        // Ignore non-fatal indexing errors
      }
    },
    [engine.embedderStatus, refreshIndexedDocsCount],
  );

  const handleAddNotebookSources = useCallback(
    async (items: ExtractedSourceItem[]) => {
      if (items.length === 0) return;

      // Analyze EVERY uploaded/added source independently from its own content & filename
      const enrichedItems = items.map((item) => enrichSourceWithCourseDetection(item));

      for (const item of enrichedItems) {
        void indexSourceSilent(item);
      }

      updateActiveNotebook((nb) => {
        const existingIds = new Set(nb.sources.map((s) => s.id));
        const newItems = enrichedItems.filter((it) => !existingIds.has(it.id));
        const mergedSources = [...newItems, ...nb.sources];
        const nextChecked = Array.from(
          new Set([...newItems.map((it) => it.id), ...nb.checkedSourceIds]),
        );

        const isDefaultTitle =
          nb.title === 'Çalışma Defterim' || nb.title === 'Yeni Çalışma Defteri';
        const autoTitle =
          isDefaultTitle && nb.sources.length === 0 && newItems[0]
            ? newItems[0].name.replace(/\.(pdf|pptx?|docx?|txt|md|png|jpe?g)$/i, '').slice(0, 52)
            : nb.title;

        // Never leak an older source's course onto a new notebook or overwrite multi-course sessions
        const singleDetectedCourse =
          nb.sources.length === 0 &&
          !nb.course &&
          newItems.length === 1 &&
          newItems[0]?.course &&
          !newItems[0]?.courseNeedsConfirmation
            ? newItems[0].course
            : nb.course;

        return {
          ...nb,
          title: autoTitle,
          course: singleDetectedCourse,
          sources: mergedSources,
          checkedSourceIds: nextChecked,
        };
      });

      const unconfirmedCount = enrichedItems.filter((it) => it.courseNeedsConfirmation).length;
      if (unconfirmedCount > 0) {
        toast.info(
          unconfirmedCount === 1
            ? `"${enrichedItems[0].name}" eklendi. Ders bilgisi kesin tespit edilemediği için otomatik atama yapılmadı — lütfen sol panelden "Ders Seç" ile doğrulayın.`
            : `${enrichedItems.length} kaynak eklendi. ${unconfirmedCount} kaynağın dersini sol panelden "Ders Seç" ile seçebilirsiniz.`,
        );
      } else {
        const detectedSummary =
          enrichedItems.length === 1 && enrichedItems[0].course
            ? ` (Ders: ${enrichedItems[0].course})`
            : '';
        toast.success(
          enrichedItems.length === 1
            ? `"${enrichedItems[0].name}"${detectedSummary} deftere eklendi ve indekslendi.`
            : `${enrichedItems.length} kaynak kendi dersleriyle bağımsız analiz edilip deftere eklendi.`,
        );
      }
    },
    [indexSourceSilent, updateActiveNotebook],
  );

  const handleUpdateSourceCourse = useCallback(
    (sourceId: string, newCourse: string) => {
      const cleanCourse = newCourse.trim();
      if (!cleanCourse) return;
      let updatedSource: ExtractedSourceItem | null = null;
      updateActiveNotebook((nb) => {
        const nextSources = nb.sources.map((s) => {
          if (s.id !== sourceId) return s;
          updatedSource = {
            ...s,
            course: cleanCourse,
            detectedCourse: cleanCourse,
            courseConfirmedByUser: true,
            courseNeedsConfirmation: false,
            courseConfidence: 'high',
          };
          return updatedSource;
        });
        const distinct = Array.from(
          new Set(nextSources.map((s) => s.course).filter((c): c is string => Boolean(c))),
        );
        return {
          ...nb,
          course: distinct.length === 1 ? distinct[0] : nb.course,
          sources: nextSources,
        };
      });
      if (updatedSource) {
        void indexSourceSilent(updatedSource);
      }
      toast.success(`Kaynak dersi "${cleanCourse}" olarak güncellendi.`);
    },
    [indexSourceSilent, updateActiveNotebook],
  );

  // URL Deep-link handling (?tab=..., ?create=video&noteId=...)
  useEffect(() => {
    if (deepLinkAppliedRef.current || loadingData || !user || notebooksLoadedForUser !== user.id) {
      return;
    }

    const tabParam = searchParams.get('tab') as NeuralTabId | null;
    const createParam = searchParams.get('create') as MaterialType | null;
    const noteId = searchParams.get('noteId');

    if (tabParam && VALID_TABS.includes(tabParam)) {
      deepLinkAppliedRef.current = true;
      setActiveTab(normalizeTab(tabParam));
      return;
    }

    if (!createParam && !noteId) return;
    deepLinkAppliedRef.current = true;
    setActiveTab('workspace');

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
          void handleAddNotebookSources([src]);
        });
      }
    }
  }, [
    loadingData,
    user,
    notebooksLoadedForUser,
    searchParams,
    ownNotes,
    platformNotes,
    handleExtractRemoteNoteFile,
    handleAddNotebookSources,
  ]);

  const handleRemoveNotebookSource = (sourceId: string) => {
    void removeDocumentIndex(`direct-${sourceId}`).then(refreshIndexedDocsCount).catch(() => {});
    updateActiveNotebook((nb) => {
      const remainingSources = nb.sources.filter((s) => s.id !== sourceId);
      const remainingChecked = nb.checkedSourceIds.filter((id) => id !== sourceId);
      // Clear stale notebook-level course when all sources are removed so prior sessions never contaminate new sources
      const nextCourse =
        remainingSources.length === 0
          ? ''
          : remainingSources.length === 1 && remainingSources[0].course && !remainingSources[0].courseNeedsConfirmation
          ? remainingSources[0].course
          : '';
      return {
        ...nb,
        course: nextCourse,
        sources: remainingSources,
        checkedSourceIds: remainingChecked,
      };
    });
  };

  const handleToggleNotebookSource = (sourceId: string) => {
    updateActiveNotebook((nb) => {
      const exists = nb.checkedSourceIds.includes(sourceId);
      return {
        ...nb,
        checkedSourceIds: exists
          ? nb.checkedSourceIds.filter((id) => id !== sourceId)
          : [...nb.checkedSourceIds, sourceId],
      };
    });
  };

  const handleToggleAllNotebookSources = (selectAll: boolean) => {
    updateActiveNotebook((nb) => ({
      ...nb,
      checkedSourceIds: selectAll ? nb.sources.map((s) => s.id) : [],
    }));
  };

  const handleToggleMaterialSource = (materialId: string) => {
    const mat = materials.find((m) => m.id === materialId);
    if (mat) void indexMaterialSilent(mat);
    updateActiveNotebook((nb) => {
      const exists = nb.checkedMaterialIds.includes(materialId);
      return {
        ...nb,
        checkedMaterialIds: exists
          ? nb.checkedMaterialIds.filter((id) => id !== materialId)
          : [...nb.checkedMaterialIds, materialId],
      };
    });
  };

  const handleCreateNotebook = (params: { title: string; course: string; emoji: string }) => {
    const nb = createEmptyNotebook({
      title: params.title,
      course: params.course,
      emoji: params.emoji,
      index: notebooks.length,
    });
    setNotebooks((prev) => [nb, ...prev]);
    setActiveNotebookId(nb.id);
    toast.success(`"${nb.title}" defteri oluşturuldu.`);
  };

  const handleRenameNotebook = (id: string, title: string, course: string) => {
    setNotebooks((prev) =>
      prev.map((nb) =>
        nb.id === id ? { ...nb, title, course, updatedAt: new Date().toISOString() } : nb,
      ),
    );
    toast.success('Defter bilgileri güncellendi.');
  };

  const handleDeleteNotebook = (id: string) => {
    setNotebooks((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((nb) => nb.id !== id);
      if (activeNotebookId === id && next[0]) {
        setActiveNotebookId(next[0].id);
      }
      return next;
    });
    toast.success('Defter silindi.');
  };

  const handleNotebookSendMessage = async (params: {
    text: string;
    mode?: CoachMode;
    images?: NotebookAttachmentImage[];
  }) => {
    if (!activeNotebook || chatBusy) return;
    const modeToUse = params.mode || coachMode;
    if (params.mode && params.mode !== coachMode) {
      setCoachMode(params.mode);
    }

    const userMsg: NotebookChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: params.text,
      createdAt: new Date().toISOString(),
      mode: modeToUse,
      attachmentNames: params.images?.map((i) => i.name),
      attachmentPreviews: params.images?.map((i) => i.dataUrl),
    };

    const priorHistory = activeNotebook.messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    updateActiveNotebook((nb) => ({
      ...nb,
      messages: [...nb.messages, userMsg],
    }));

    setChatBusy(true);
    setStreamingText('');

    try {
      const checkedSources = activeNotebook.sources.filter((s) =>
        activeNotebook.checkedSourceIds.includes(s.id),
      );
      const checkedMaterials = materials.filter((m) =>
        activeNotebook.checkedMaterialIds.includes(m.id),
      );

      // Ensure active sources are indexed in IndexedDB with their OWN independent course
      const existingDocs = await getIndexedDocuments().catch(() => []);
      const existingDocIds = new Set(existingDocs.map((d) => d.docId));
      for (const src of checkedSources) {
        if (!existingDocIds.has(`direct-${src.id}`) && src.text?.trim()) {
          await indexSourceSilent(src);
        }
      }
      for (const mat of checkedMaterials) {
        if (!existingDocIds.has(mat.id)) {
          await indexMaterialSilent(mat);
        }
      }

      const activeDocIds = [
        ...checkedSources.map((s) => `direct-${s.id}`),
        ...checkedMaterials.map((m) => m.id),
      ];

      const fallbackContextParts: string[] = [];
      if (canonicalAnalysis.canonicalDigest) {
        fallbackContextParts.push(canonicalAnalysis.canonicalDigest);
      }
      for (const prof of canonicalAnalysis.profiles) {
        const src = prof.source;
        if (src.text?.trim()) {
          fallbackContextParts.push(
            `### ${src.name}${prof.resolvedCourse ? ` (Ders: ${prof.resolvedCourse})` : ''}\n${src.text.slice(0, 8000)}`,
          );
        }
      }

      const res = await routedRagAnswer({
        question: params.text,
        docIds: activeDocIds,
        history: priorHistory,
        coachMode: modeToUse,
        images: params.images?.map((i) => ({
          data: i.base64,
          mimeType: i.mimeType,
          name: i.name,
        })),
        fallbackContextText: fallbackContextParts.join('\n\n'),
        notebookTitle: activeNotebook.title,
        course: canonicalAnalysis.primaryCourseLabel || null,
        onToken: (partial) => setStreamingText(partial),
      });

      const assistantMsg: NotebookChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        createdAt: new Date().toISOString(),
        mode: modeToUse,
        meta: `${res.model} · ${(res.latencyMs / 1000).toFixed(1)} sn`,
        citations: res.hits.slice(0, 5).map((h) => ({
          docId: h.chunk.docId,
          docTitle: h.chunk.docTitle,
          sectionHeading: h.chunk.sectionHeading,
          excerpt: h.chunk.text.slice(0, 420),
          score: h.score,
        })),
      };

      updateActiveNotebook((nb) => ({
        ...nb,
        messages: [...nb.messages, assistantMsg],
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yanıt oluşturulamadı.');
    } finally {
      setChatBusy(false);
      setStreamingText('');
    }
  };

  const handlePinMessage = (msg: NotebookChatMessage) => {
    const firstLine = msg.content
      .split('\n')
      .map((l) => l.replace(/^[#*\-\s]+/, '').trim())
      .find((l) => l.length > 4);
    const note: PinnedStudyNote = {
      id: `pin-${Date.now()}`,
      title: (firstLine || 'Sabitlenen AI Notu').slice(0, 64),
      content: msg.content,
      createdAt: new Date().toISOString(),
      sourceTag: 'AI Öğretmen yanıtından sabitlendi',
    };
    updateActiveNotebook((nb) => ({
      ...nb,
      pinnedNotes: [note, ...nb.pinnedNotes],
    }));
    toast.success('Yanıt sağdaki Stüdyo notlarına sabitlendi.');
  };

  const handleAddManualNote = (title: string, content: string) => {
    const note: PinnedStudyNote = {
      id: `note-${Date.now()}`,
      title,
      content,
      createdAt: new Date().toISOString(),
      sourceTag: 'Kişisel çalışma notu',
    };
    updateActiveNotebook((nb) => ({
      ...nb,
      pinnedNotes: [note, ...nb.pinnedNotes],
    }));
    toast.success('Çalışma notu kaydedildi.');
  };

  const handleDeletePinnedNote = (noteId: string) => {
    updateActiveNotebook((nb) => ({
      ...nb,
      pinnedNotes: nb.pinnedNotes.filter((n) => n.id !== noteId),
    }));
  };

  const handlePromotePinnedToSource = (note: PinnedStudyNote) => {
    const src = buildPastedSourceItem(`📌 ${note.title}`, note.content);
    void handleAddNotebookSources([src]);
  };

  const handleClearChat = () => {
    updateActiveNotebook((nb) => ({ ...nb, messages: [] }));
  };

  const handleNotebookGenerateType = async (
    targetType: MaterialType,
    options?: {
      overrideCourseAssignments?: Record<string, string>;
      allowMultiCourse?: boolean;
      isolateCourse?: string;
      videoScenarioPlan?: VideoScenarioPlan;
      skipVideoScenarioDialog?: boolean;
    },
  ) => {
    if (!user || !activeNotebook) {
      toast.error('Materyal üretmek için giriş yapmalısınız.');
      return;
    }

    const overrideCourseAssignments = options?.overrideCourseAssignments;

    const checkedSources = activeNotebook.sources
      .filter((s) => activeNotebook.checkedSourceIds.includes(s.id))
      .map((s) => {
        const assigned = overrideCourseAssignments?.[s.id]?.trim();
        if (!assigned) return s;
        return {
          ...s,
          course: assigned,
          detectedCourse: assigned,
          courseConfirmedByUser: true,
          courseNeedsConfirmation: false,
          courseConfidence: 'high' as const,
        };
      });
    const checkedMatSources: ExtractedSourceItem[] = materials
      .filter(
        (m) =>
          activeNotebook.checkedMaterialIds.includes(m.id) &&
          // Önceki yapay zekâ özetleri veya AI çıktıları asla yeni özetin kaynağı olarak kullanılmaz
          !(targetType === 'summary' && m.material_type === 'summary'),
      )
      .map((mat) => {
        const txt = extractSearchableTextFromMaterial(mat);
        return {
          id: `mat-src-${mat.id}`,
          name: mat.title,
          kind: 'note' as const,
          originNoteId: mat.source_note_id || undefined,
          originType: mat.source_type,
          course: mat.course,
          courseConfirmedByUser: false,
          text: txt || mat.title,
          pagesOrSlides: Math.max(1, Math.ceil(txt.split(/\s+/).length / 300)),
          wordCount: Math.max(1, txt.split(/\s+/).filter(Boolean).length),
          charCount: txt.length,
        };
      });

    // Ayrıntılı özet üretiminde seçili ham kaynak dosyaları varsa önceki AI materyallerini kesinlikle karıştırma
    let allSelectedSources =
      targetType === 'summary' && checkedSources.length > 0
        ? [...checkedSources]
        : [...checkedSources, ...checkedMatSources];
    if (options?.isolateCourse) {
      const targetCourse = options.isolateCourse;
      const isolated = allSelectedSources.filter((src) => {
        const analyzed = enrichSourceWithCourseDetection(src);
        return (analyzed.course || analyzed.detectedCourse) === targetCourse;
      });
      if (isolated.length > 0) {
        allSelectedSources = isolated;
      }
    }

    if (allSelectedSources.length === 0) {
      toast.info(
        targetType === 'summary'
          ? 'Ayrıntılı özet üretmek için önce sol panelden en az 1 ham ders notu, PDF, PPTX veya DOCX kaynağı seçin.'
          : 'Üretim yapmak için önce sol panelden en az 1 ders notu, PDF veya slayt ekleyip seçin.',
      );
      return;
    }

    // Build shared Canonical Source Analysis over the exact checked sources
    // Özet üretiminde önceki AI özetlerinin başlıklarını yeni analize kesinlikle enjekte etme
    const freshAnalysis = buildCanonicalSourceAnalysis({
      sources: allSelectedSources,
      allMaterials: targetType === 'summary' ? [] : materials,
      includePriorSummarySync: targetType !== 'summary',
    });

    // Gate 1: If any source's course is uncertain and not confirmed yet, ask the user instead of guessing!
    if (!overrideCourseAssignments && freshAnalysis.hasUnconfirmedCourses) {
      setPendingCourseConfirmType(targetType);
      return;
    }

    // Gate 2: Multi-Course Merge Approval — NEVER silently blend distinct courses without explicit user confirmation!
    if (!options?.allowMultiCourse && !options?.isolateCourse && freshAnalysis.isMultiCourse) {
      setPendingMultiCourseType(targetType);
      return;
    }

    // Gate 3: Pre-production Video Scenario & Chapter Plan Preview/Editor before generating a Video Lesson
    if (targetType === 'video' && !options?.skipVideoScenarioDialog && !options?.videoScenarioPlan) {
      setVideoScenarioOpen(true);
      return;
    }

    const bundle = buildBundleFromCanonicalAnalysis(freshAnalysis, activeNotebook.title);

    // Collect prior questions & flashcards for the exact same sourceFingerprint so repeated runs never duplicate
    const sameSourceMaterials = materials.filter((m) => {
      const mFp =
        m.content?.metadata?.sourceFingerprint ||
        (m.exam_profile as Record<string, unknown> | null | undefined)?.sourceFingerprint;
      if (mFp && freshAnalysis.fingerprint) return mFp === freshAnalysis.fingerprint;
      return Boolean(bundle.course && m.course === bundle.course && m.title === bundle.title);
    });
    const priorQuestions = sameSourceMaterials
      .filter((m) => m.material_type === 'quiz' && Array.isArray(m.content?.questions))
      .flatMap((m) => m.content.questions || []);
    const priorFlashcards = sameSourceMaterials
      .filter((m) => m.material_type === 'flashcards' && Array.isArray(m.content?.cards))
      .flatMap((m) => m.content.cards || []);

    const nextSettings: StudioGenerationSettings = {
      ...settings,
      materialType: targetType,
      userId: user.id,
      generationNonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      previousQuestions: targetType === 'quiz' ? priorQuestions : undefined,
      previousFlashcards: targetType === 'flashcards' ? priorFlashcards : undefined,
      videoScenarioPlan: targetType === 'video' ? options?.videoScenarioPlan : undefined,
    };
    setSettings(nextSettings);

    // Next-Gen 10-Stage Resilient Academic Summary Pipeline + Background Job Tracking
    if (targetType === 'summary') {
      setActiveMaterial(null);
      setShowSummaryProgress(true);

      const { deduplicated } = await summaryJobManager.startSummaryJob({
        userId: user.id,
        notebookId: activeNotebook.id,
        bundle,
        settings: nextSettings,
        university: profile?.university || null,
        department: profile?.department || null,
        onCompleted: (saved, completedJob) => {
          setMaterials((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
          updateActiveNotebook((nb) => ({
            ...nb,
            materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
          }));
          void indexMaterialSilent(saved);
          setActiveMaterial(saved);
          setShowSummaryProgress(false);
          const qaScore = completedJob.qualityAudit?.overallScore;
          toast.success(
            qaScore
              ? `Ayrıntılı akademik özet hazırlandı (Kalite: %${qaScore}) ve EconNotes hesabınıza kaydedildi.`
              : 'Ayrıntılı akademik özet hazırlandı ve EconNotes hesabınıza kaydedildi.',
          );
        },
      });

      if (deduplicated) {
        toast.info('Bu belge için devam eden bir analiz görevi zaten bulunuyor — mevcut ilerleme açıldı.');
      }
      return;
    }

    setIsGenerating(true);
    setGenerationPct(10);
    setGenerationLabel(
      freshAnalysis.isMultiCourse
        ? `${freshAnalysis.distinctCourses.length} ayrı ders için ortak kaynak analizi hazırlanıyor...`
        : `${bundle.course || 'Seçili kaynak'} baştan sona analiz ediliyor...`,
    );

    try {
      const result = await routedGenerateMaterial(bundle, nextSettings, (pct, msg) => {
        setGenerationPct(pct);
        setGenerationLabel(msg);
      });

      const noteSource = bundle.sources.find((s) => s.kind === 'note');
      const resolvedSavedCourse = bundle.course || bundle.detectedCourse || null;
      const examProfileMeta: Record<string, unknown> = {
        sourceFingerprint: freshAnalysis.fingerprint,
        sourceIds: bundle.sourceIds || [],
        analyzedCourses: freshAnalysis.distinctCourses,
        isMultiCourse: freshAnalysis.isMultiCourse,
      };
      if (nextSettings.examFocus) {
        examProfileMeta.examFocus = nextSettings.examFocus;
        examProfileMeta.pedagogicalStyle = nextSettings.pedagogicalStyle;
      }

      const enrichedContent = {
        ...(result.content || {}),
        metadata: {
          ...((result.content as Record<string, any>)?.metadata || {}),
          sourceFingerprint: freshAnalysis.fingerprint,
          sourceIds: bundle.sourceIds || [],
          analyzedCourses: freshAnalysis.distinctCourses,
          isMultiCourse: freshAnalysis.isMultiCourse,
        },
      };

      const { data, error } = await supabase
        .from('study_materials')
        .insert({
          user_id: user.id,
          source_type: noteSource?.originType === 'platform' ? 'platform' : 'own',
          source_note_id: noteSource?.originNoteId || null,
          material_type: targetType,
          title:
            targetType === 'video' && options?.videoScenarioPlan?.lessonTitle
              ? options.videoScenarioPlan.lessonTitle
              : bundle.title,
          course: resolvedSavedCourse,
          content: enrichedContent as unknown as Json,
          model: result.model,
          exam_profile: examProfileMeta as unknown as Json,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Materyal veritabanına kaydedilemedi.');
      }

      const saved = data as unknown as StudyMaterial;
      setMaterials((prev) => [saved, ...prev]);
      updateActiveNotebook((nb) => ({
        ...nb,
        materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
      }));
      setActiveMaterial(saved);
      void indexMaterialSilent(saved);

      if (result.sourceMode === 'local') {
        toast.warning(
          'Yapay zekâ bağlantısına geçici olarak ulaşılamadı; yerel yapısal ayrıştırıcı ile oluşturuldu.',
        );
      } else {
        toast.success('Çalışma materyali ortak kaynak analiziyle hazırlandı ve defterine kaydedildi.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Materyal oluşturulurken bir hata oluştu.');
    } finally {
      setIsGenerating(false);
      setGenerationPct(0);
      setGenerationLabel('');
    }
  };

  const handleConfirmCoursesAndContinue = (assignments: Record<string, string>) => {
    const target = pendingCourseConfirmType;
    setPendingCourseConfirmType(null);
    Object.entries(assignments).forEach(([srcId, courseName]) => {
      handleUpdateSourceCourse(srcId, courseName);
    });
    if (target) {
      void handleNotebookGenerateType(target, { overrideCourseAssignments: assignments });
    }
  };

  const handleIsolateCourseAndContinue = (courseName: string) => {
    const target = pendingMultiCourseType;
    setPendingMultiCourseType(null);
    updateActiveNotebook((nb) => {
      const keepIds = nb.sources
        .filter((s) => {
          const analyzed = enrichSourceWithCourseDetection(s);
          return (analyzed.course || analyzed.detectedCourse) === courseName;
        })
        .map((s) => s.id);
      return {
        ...nb,
        course: courseName,
        checkedSourceIds: keepIds.length > 0 ? keepIds : nb.checkedSourceIds,
      };
    });
    if (target) {
      void handleNotebookGenerateType(target, { isolateCourse: courseName });
    }
  };

  const handleConfirmMultiCourseAndContinue = () => {
    const target = pendingMultiCourseType;
    setPendingMultiCourseType(null);
    if (target) {
      void handleNotebookGenerateType(target, { allowMultiCourse: true });
    }
  };

  const handleConfirmVideoScenario = (plan: VideoScenarioPlan) => {
    setVideoScenarioOpen(false);
    void handleNotebookGenerateType('video', {
      allowMultiCourse: true,
      videoScenarioPlan: plan,
      skipVideoScenarioDialog: true,
    });
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      const { error } = await supabase.from('study_materials').delete().eq('id', id);
      if (error) throw error;
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      setNotebooks((prev) =>
        prev.map((nb) => ({
          ...nb,
          materialIds: nb.materialIds.filter((mid) => mid !== id),
          checkedMaterialIds: nb.checkedMaterialIds.filter((mid) => mid !== id),
        })),
      );
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
      const matFp =
        activeMaterial.content?.metadata?.sourceFingerprint ||
        (activeMaterial.exam_profile as Record<string, unknown> | null | undefined)
          ?.sourceFingerprint;
      const useActiveCanonical =
        Boolean(matFp && matFp === canonicalAnalysis.fingerprint && canonicalAnalysis.profiles.length > 0);

      let bundle;
      if (useActiveCanonical) {
        bundle = buildBundleFromCanonicalAnalysis(canonicalAnalysis, activeMaterial.title);
      } else {
        const text = extractSearchableTextFromMaterial(activeMaterial);
        const source: ExtractedSourceItem = {
          id: `conv-${activeMaterial.id}`,
          name: activeMaterial.title,
          kind: 'note',
          originNoteId: activeMaterial.source_note_id || undefined,
          originType: activeMaterial.source_type,
          course: activeMaterial.course,
          courseConfirmedByUser: Boolean(activeMaterial.course),
          text: text || activeMaterial.title,
          pagesOrSlides: 1,
          wordCount: Math.max(1, text.split(/\s+/).filter(Boolean).length),
          charCount: text.length,
        };
        bundle = combineStudySources([source], activeMaterial.title, activeMaterial.course || '');
      }
      const targetFp = bundle.sourceFingerprint || (typeof matFp === 'string' ? matFp : undefined);
      const sameSourceMats = materials.filter((m) => {
        const mFp =
          m.content?.metadata?.sourceFingerprint ||
          (m.exam_profile as Record<string, unknown> | null | undefined)?.sourceFingerprint;
        if (targetFp && mFp) return mFp === targetFp;
        return m.title === activeMaterial.title && m.course === activeMaterial.course;
      });
      const nextSettings: StudioGenerationSettings = {
        ...settings,
        materialType: targetType,
        userId: user.id,
        generationNonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        previousQuestions:
          targetType === 'quiz'
            ? sameSourceMats
                .filter((m) => m.material_type === 'quiz' && Array.isArray(m.content?.questions))
                .flatMap((m) => m.content.questions || [])
            : undefined,
        previousFlashcards:
          targetType === 'flashcards'
            ? sameSourceMats
                .filter((m) => m.material_type === 'flashcards' && Array.isArray(m.content?.cards))
                .flatMap((m) => m.content.cards || [])
            : undefined,
      };
      if (targetType === 'summary') {
        setConvertingTo(null);
        setActiveMaterial(null);
        setShowSummaryProgress(true);
        await summaryJobManager.startSummaryJob({
          userId: user.id,
          notebookId: activeNotebook.id,
          bundle,
          settings: nextSettings,
          onCompleted: (saved, completedJob) => {
            setMaterials((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
            updateActiveNotebook((nb) => ({
              ...nb,
              materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
            }));
            void indexMaterialSilent(saved);
            setActiveMaterial(saved);
            setShowSummaryProgress(false);
            const qaScore = completedJob.qualityAudit?.overallScore;
            toast.success(
              qaScore
                ? `Ayrıntılı akademik özet hazırlandı (Kalite: %${qaScore}) ve EconNotes hesabınıza kaydedildi.`
                : 'Ayrıntılı akademik özet hazırlandı.',
            );
          },
        });
        return;
      }

      const res = await routedGenerateMaterial(bundle, nextSettings);

      const { data, error } = await supabase
        .from('study_materials')
        .insert({
          user_id: user.id,
          source_type: activeMaterial.source_type,
          source_note_id: activeMaterial.source_note_id,
          material_type: targetType,
          title: activeMaterial.title,
          course: activeMaterial.course || bundle.course || null,
          content: res.content as unknown as Json,
          model: res.model,
          exam_profile: activeMaterial.exam_profile
            ? (activeMaterial.exam_profile as unknown as Json)
            : null,
        })
        .select()
        .single();

      if (error || !data) throw new Error(error?.message || 'Dönüştürme kaydedilemedi.');
      const saved = data as unknown as StudyMaterial;
      setMaterials((prev) => [saved, ...prev]);
      updateActiveNotebook((nb) => ({
        ...nb,
        materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
      }));
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

  const handleSaveSummaryToAccount = async (mat: StudyMaterial) => {
    if (!user) {
      toast.error('EconNotes hesabınıza kaydetmek için giriş yapmalısınız.');
      return;
    }
    setIsSavingToAccount(true);
    try {
      const existsInList = materials.some((m) => m.id === mat.id);
      if (existsInList && mat.id && !mat.id.startsWith('local-')) {
        const { error } = await supabase
          .from('study_materials')
          .update({
            title: mat.title,
            course: mat.course,
            content: mat.content as unknown as Json,
          })
          .eq('id', mat.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('study_materials')
          .insert({
            user_id: user.id,
            source_type: mat.source_type || 'own',
            source_note_id: mat.source_note_id || null,
            material_type: 'summary',
            title: mat.title,
            course: mat.course || null,
            content: mat.content as unknown as Json,
            model: mat.model || 'EconNotes Çok Aşamalı Akademik Motor',
            exam_profile: (mat.exam_profile || null) as unknown as Json,
          })
          .select()
          .single();
        if (error || !data) throw new Error(error?.message || 'Özet hesabınıza kaydedilemedi.');
        const saved = data as unknown as StudyMaterial;
        setMaterials((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
        setActiveMaterial(saved);
        updateActiveNotebook((nb) => ({
          ...nb,
          materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
        }));
      }
      toast.success('Özet EconNotes hesabınıza kaydedildi. Çalışma Stüdyosu Kütüphanesinden dilediğiniz zaman açabilirsiniz.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hesaba kaydetme sırasında hata oluştu.');
    } finally {
      setIsSavingToAccount(false);
    }
  };

  const handleResumeSummaryJob = (jobId: string) => {
    void summaryJobManager
      .resumeJob(jobId, (saved, completedJob) => {
        setMaterials((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
        updateActiveNotebook((nb) => ({
          ...nb,
          materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
        }));
        void indexMaterialSilent(saved);
        setActiveMaterial(saved);
        setShowSummaryProgress(false);
        toast.success(
          `Analiz kaldığı yerden tamamlandı (Kalite: %${completedJob.qualityAudit?.overallScore ?? 90}).`,
        );
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Görev devam ettirilemedi.');
      });
  };

  const handleRegenerateDeep = async () => {
    if (!activeMaterial || !user) return;
    setIsRegenerating(true);
    try {
      const matFp =
        activeMaterial.content?.metadata?.sourceFingerprint ||
        (activeMaterial.exam_profile as Record<string, unknown> | null | undefined)
          ?.sourceFingerprint;
      const matSourceIds = Array.isArray(activeMaterial.content?.metadata?.sourceIds)
        ? (activeMaterial.content.metadata.sourceIds as string[])
        : Array.isArray((activeMaterial.exam_profile as Record<string, unknown> | null | undefined)?.sourceIds)
        ? ((activeMaterial.exam_profile as Record<string, unknown>).sourceIds as string[])
        : [];
      const matchedRawNotebookSources = activeNotebook
        ? activeNotebook.sources.filter((s) => matSourceIds.includes(s.id))
        : [];
      const checkedRawNotebookSources = activeNotebook
        ? activeNotebook.sources.filter((s) => activeNotebook.checkedSourceIds.includes(s.id))
        : [];
      const useActiveCanonical =
        Boolean(matFp && matFp === canonicalAnalysis.fingerprint && checkedRawNotebookSources.length > 0);

      let bundle;
      if (matchedRawNotebookSources.length > 0) {
        const cleanAnalysis = buildCanonicalSourceAnalysis({
          sources: matchedRawNotebookSources,
          allMaterials: [],
          includePriorSummarySync: false,
        });
        bundle = buildBundleFromCanonicalAnalysis(cleanAnalysis, activeMaterial.title);
      } else if (useActiveCanonical) {
        const cleanAnalysis = buildCanonicalSourceAnalysis({
          sources: checkedRawNotebookSources,
          allMaterials: [],
          includePriorSummarySync: false,
        });
        bundle = buildBundleFromCanonicalAnalysis(cleanAnalysis, activeMaterial.title);
      } else {
        toast.info(
          'Orijinal ham ders belgesi aktif defterde bulunamadığı için bu özet mevcut içeriği temizlenerek yeniden yapılandırılıyor. En yüksek doğruluk için orijinal PDF/PPTX/DOCX dosyasını seçip özet oluşturun.',
        );
        const text = extractSearchableTextFromMaterial(activeMaterial);
        bundle = combineStudySources(
          [
            {
              id: `regen-${activeMaterial.id}`,
              name: activeMaterial.title,
              kind: 'pasted',
              course: activeMaterial.course,
              courseConfirmedByUser: Boolean(activeMaterial.course),
              text: text || activeMaterial.title,
              pagesOrSlides:
                activeMaterial.content?.documentProfile?.totalPagesOrSlides ||
                activeMaterial.content?.metadata?.sourceStats?.pagesOrSlides ||
                1,
              wordCount: Math.max(1, text.split(/\s+/).filter(Boolean).length),
              charCount: text.length,
            },
          ],
          activeMaterial.title,
          activeMaterial.course || '',
        );
      }

      setActiveMaterial(null);
      setShowSummaryProgress(true);
      await summaryJobManager.startSummaryJob({
        userId: user.id,
        notebookId: activeNotebook?.id,
        bundle,
        forceNew: true,
        settings: {
          ...settings,
          materialType: 'summary',
          summaryDepth: 'textbook',
          deepResearch: true,
        },
        onCompleted: (saved) => {
          setMaterials((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
          updateActiveNotebook((nb) => ({
            ...nb,
            materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
          }));
          void indexMaterialSilent(saved);
          setActiveMaterial(saved);
          setShowSummaryProgress(false);
          toast.success('Özet 10 aşamalı derin analizle yeniden oluşturuldu.');
        },
      });
    } catch {
      toast.error('Yeniden oluşturma başlatılamadı.');
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
    updateActiveNotebook((nb) => ({
      ...nb,
      materialIds: [saved.id, ...nb.materialIds.filter((id) => id !== saved.id)],
      checkedMaterialIds: [saved.id, ...nb.checkedMaterialIds.filter((id) => id !== saved.id)],
    }));
    void indexMaterialSilent(saved);
    toast.success('Canlı ders kaydı defterine eklendi.');
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>EconNotes Çalışma Stüdyosu hazırlanıyor...</span>
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
          <h1 className="text-xl font-bold">EconNotes Çalışma Stüdyosu</h1>
          <p className="text-sm text-muted-foreground">
            Kişisel AI çalışma defterini oluşturmak, soru fotoğrafı çözmek ve ders notlarından özet,
            video ders ve deneme sınavı üretmek için oturum açmalısın.
          </p>
          <Button onClick={() => navigate('/login')} className="gap-2 rounded-xl">
            <LogIn className="h-4 w-4" />
            Giriş Yap / Kayıt Ol
          </Button>
        </div>
      </Layout>
    );
  }

  const resolvedTab = normalizeTab(activeTab);

  const isWorkspaceStage = resolvedTab === 'workspace' && !activeMaterial;

  return (
    <Layout wide={isWorkspaceStage} studioMode={isWorkspaceStage || Boolean(activeMaterial)} focusMode={focusMode}>
      <div
        className={
          isWorkspaceStage
            ? 'mx-auto w-full min-w-0'
            : activeMaterial
            ? 'mx-auto w-full max-w-[1600px] min-w-0 px-1 py-1 sm:px-3 sm:py-2'
            : 'mx-auto w-full max-w-7xl min-w-0 px-1 py-2 sm:px-3 sm:py-4'
        }
      >
        {showSummaryProgress && activeSummaryJob ? (
          <SummaryAnalysisProgressView
            job={activeSummaryJob}
            isLiveInMemory={summaryJobManager.isJobRunningInMemory(activeSummaryJob.id)}
            onMinimizeToWorkspace={() => setShowSummaryProgress(false)}
            onResumeJob={handleResumeSummaryJob}
            onRestartJob={() => {
              summaryJobManager.dismissActiveJob();
              setShowSummaryProgress(false);
              void handleNotebookGenerateType('summary', { allowMultiCourse: true });
            }}
            onCancelJob={(jobId) => {
              summaryJobManager.cancelRunningJob(jobId);
              toast.info('Analiz duraklatıldı; tamamlanan bölümler korundu.');
            }}
            onOpenCompleted={() => {
              const target =
                materials.find((m) => m.id === activeSummaryJob.resultMaterialId) ||
                summaryJobManager.getSnapshot().completedMaterial;
              if (target) {
                setActiveMaterial(target);
              }
              setShowSummaryProgress(false);
            }}
          />
        ) : activeMaterial?.material_type === 'video' ? (
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
                setActiveTab('workspace');
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
            onSaveToAccount={handleSaveSummaryToAccount}
            isSavingToAccount={isSavingToAccount}
            onRecordProgress={(score, total) =>
              handleRecordProgress(activeMaterial.id, score, total)
            }
            focusMode={focusMode}
            onToggleFocusMode={handleToggleFocusMode}
            isBrowserFullscreen={isBrowserFullscreen}
            onToggleBrowserFullscreen={() => void handleToggleBrowserFullscreen()}
            onReportIssue={() => setReportOpen(true)}
          />
        ) : (
          <>
            {!focusMode && <ContextualTipBanner tipId="study_pdf" className="mb-2" />}
            <NeuralCommandShell
              activeTab={resolvedTab}
              onTabChange={(next) => setActiveTab(normalizeTab(next))}
              engine={engine}
              dueCardsCount={dueCards.length}
              materialsCount={materials.length}
              indexedDocsCount={indexedDocsCount}
              focusMode={focusMode}
              onToggleFocusMode={handleToggleFocusMode}
              isBrowserFullscreen={isBrowserFullscreen}
              onToggleBrowserFullscreen={() => void handleToggleBrowserFullscreen()}
              onReportIssue={() => setReportOpen(true)}
            >
              {resolvedTab === 'workspace' && activeNotebook && (
                <NotebookStudioWorkspace
                  userId={user.id}
                  notebooks={notebooks}
                  activeNotebook={activeNotebook}
                  canonicalAnalysis={canonicalAnalysis}
                  focusMode={focusMode}
                  onSelectNotebook={setActiveNotebookId}
                  onCreateNotebook={handleCreateNotebook}
                  onRenameNotebook={handleRenameNotebook}
                  onDeleteNotebook={handleDeleteNotebook}
                  ownNotes={ownNotes}
                  platformNotes={platformNotes}
                  allMaterials={materials}
                  progress={progress}
                  dueCardsCount={dueCards.length}
                  settings={settings}
                  onSettingsChange={setSettings}
                  coachMode={coachMode}
                  onCoachModeChange={setCoachMode}
                  chatBusy={chatBusy}
                  streamingText={streamingText}
                  isGenerating={isGenerating}
                  generationPct={generationPct}
                  generationLabel={generationLabel}
                  activeSummaryJob={activeSummaryJob}
                  onOpenSummaryProgress={() => setShowSummaryProgress(true)}
                  onAddSources={handleAddNotebookSources}
                  onRemoveSource={handleRemoveNotebookSource}
                  onToggleSource={handleToggleNotebookSource}
                  onToggleAllSources={handleToggleAllNotebookSources}
                  onToggleMaterialSource={handleToggleMaterialSource}
                  onUpdateSourceCourse={handleUpdateSourceCourse}
                  pendingCourseConfirmType={pendingCourseConfirmType}
                  onCancelPendingCourseConfirm={() => setPendingCourseConfirmType(null)}
                  onConfirmCoursesAndContinue={handleConfirmCoursesAndContinue}
                  pendingMultiCourseType={pendingMultiCourseType}
                  onCancelMultiCourseConfirm={() => setPendingMultiCourseType(null)}
                  onIsolateCourseAndContinue={handleIsolateCourseAndContinue}
                  onConfirmMultiCourseAndContinue={handleConfirmMultiCourseAndContinue}
                  onExtractRemoteNoteFile={handleExtractRemoteNoteFile}
                  onSavedLiveMaterial={handleSavedLiveMaterial}
                  onSendMessage={handleNotebookSendMessage}
                  onPinMessage={handlePinMessage}
                  onClearChat={handleClearChat}
                  onGenerateType={(type) => void handleNotebookGenerateType(type)}
                  onOpenPlanner={() => setActiveTab('planner')}
                  onOpenExamSim={() => setActiveTab('exam')}
                  onOpenMaterial={setActiveMaterial}
                  onDeleteMaterial={handleDeleteMaterial}
                  onAddManualNote={handleAddManualNote}
                  onDeletePinnedNote={handleDeletePinnedNote}
                  onPromotePinnedToSource={handlePromotePinnedToSource}
                />
              )}

            {resolvedTab === 'library' && (
              <NeuralLibraryView
                materials={materials}
                progress={progress}
                onOpenMaterial={setActiveMaterial}
                onDeleteMaterial={handleDeleteMaterial}
                onCreateNew={() => setActiveTab('workspace')}
                onIndexChanged={refreshIndexedDocsCount}
              />
            )}

            {resolvedTab === 'planner' && (
              <NeuralPlannerView
                materials={materials}
                progress={progress}
                srsCards={srsCards}
                dueCards={dueCards}
                activeCourseHint={
                  canonicalAnalysis.distinctCourses.length === 1
                    ? canonicalAnalysis.distinctCourses[0]
                    : null
                }
                onSrsUpdated={refreshSrsCards}
                onOpenMaterial={setActiveMaterial}
                onStartExamSim={() => setActiveTab('exam')}
              />
            )}

            {resolvedTab === 'exam' && (
              <NeuralExamSimView
                materials={materials}
                onRecordExamProgress={handleRecordProgress}
                onGoWeakPlanner={() => setActiveTab('planner')}
              />
            )}

            {resolvedTab === 'engine' && <NeuralEnginePanelView engine={engine} />}
          </NeuralCommandShell>
          </>
        )}
      </div>

      <VideoScenarioPreviewDialog
        open={videoScenarioOpen}
        onOpenChange={setVideoScenarioOpen}
        canonicalAnalysis={canonicalAnalysis}
        notebookTitle={activeNotebook?.title || 'Çalışma Defterim'}
        onConfirm={handleConfirmVideoScenario}
      />

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
              Kesintisiz 60 dakikadır Çalışma Stüdyosu’ndasın. Bilişsel hafıza pekişmesi için
              5-10 dakikalık kısa bir mola verip ardından Aralıklı Tekrar (SM-2) kartlarına göz
              atman önerilir.
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
