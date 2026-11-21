import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Coffee, Loader2, LogIn, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { NeuralCommandShell, type NeuralTabId } from '@/components/study/neural/NeuralCommandShell';
import { NeuralEnginePanelView } from '@/components/study/neural/NeuralEnginePanelView';
import { NeuralExamSimView } from '@/components/study/neural/NeuralExamSimView';
import { NeuralLibraryView } from '@/components/study/neural/NeuralLibraryView';
import { NeuralPlannerView } from '@/components/study/neural/NeuralPlannerView';
import { NeuralReportDialog } from '@/components/study/neural/NeuralReportDialog';
import { NeuralWorkspaceFrame } from '@/components/study/neural/NeuralWorkspaceFrame';
import { NotebookStudioWorkspace } from '@/components/study/neural/NotebookStudioWorkspace';
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
  buildNoteSourceItem,
  buildPastedSourceItem,
  classifyStudyDomain,
  combineStudySources,
} from '@/lib/studySourceProcessor';
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
  const { user, loading: authLoading } = useAuth();
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
  const [convertingTo, setConvertingTo] = useState<MaterialType | null>(null);
  const [expandingSectionIdx, setExpandingSectionIdx] = useState<number | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const [srsCards, setSrsCards] = useState<SrsCardState[]>([]);
  const [indexedDocsCount, setIndexedDocsCount] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);

  const deepLinkAppliedRef = useRef(false);

  const activeNotebook = useMemo(
    () => notebooks.find((n) => n.id === activeNotebookId) || notebooks[0],
    [notebooks, activeNotebookId],
  );

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
            .select('id, title, course, description, department, semester, file_url, file_name, file_type')
            .eq('status', 'approved')
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
    async (src: ExtractedSourceItem, courseFallback?: string) => {
      if (!src.text || src.text.trim().length < 20) return;
      try {
        const domain = classifyStudyDomain(src.text, courseFallback || src.course || undefined, src.name);
        await indexDocumentInVectorStore({
          docId: `direct-${src.id}`,
          title: src.name,
          course: courseFallback || src.course || domain.discipline,
          text: src.text,
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

      for (const item of items) {
        void indexSourceSilent(item, activeNotebook?.course);
      }

      updateActiveNotebook((nb) => {
        const existingIds = new Set(nb.sources.map((s) => s.id));
        const newItems = items.filter((it) => !existingIds.has(it.id));
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
        const autoCourse =
          !nb.course && newItems[0]?.course ? newItems[0].course : nb.course;

        return {
          ...nb,
          title: autoTitle,
          course: autoCourse,
          sources: mergedSources,
          checkedSourceIds: nextChecked,
        };
      });

      toast.success(
        items.length === 1
          ? `"${items[0].name}" deftere eklendi ve AI Öğretmen için indekslendi.`
          : `${items.length} kaynak deftere eklendi ve indekslendi.`,
      );
    },
    [activeNotebook?.course, indexSourceSilent, updateActiveNotebook],
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
    updateActiveNotebook((nb) => ({
      ...nb,
      sources: nb.sources.filter((s) => s.id !== sourceId),
      checkedSourceIds: nb.checkedSourceIds.filter((id) => id !== sourceId),
    }));
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

      // Ensure active sources are indexed in IndexedDB before retrieval
      const existingDocs = await getIndexedDocuments().catch(() => []);
      const existingDocIds = new Set(existingDocs.map((d) => d.docId));
      for (const src of checkedSources) {
        if (!existingDocIds.has(`direct-${src.id}`) && src.text?.trim()) {
          await indexSourceSilent(src, activeNotebook.course);
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
      for (const src of checkedSources) {
        if (src.text?.trim()) {
          fallbackContextParts.push(`### ${src.name}\n${src.text.slice(0, 7000)}`);
        }
      }
      for (const mat of checkedMaterials) {
        const txt = extractSearchableTextFromMaterial(mat);
        if (txt.trim()) {
          fallbackContextParts.push(`### ${mat.title}\n${txt.slice(0, 5000)}`);
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
        course: activeNotebook.course || checkedSources[0]?.course || null,
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
    const src = buildPastedSourceItem(`📌 ${note.title}`, note.content, activeNotebook?.course);
    void handleAddNotebookSources([src]);
  };

  const handleClearChat = () => {
    updateActiveNotebook((nb) => ({ ...nb, messages: [] }));
  };

  const handleNotebookGenerateType = async (targetType: MaterialType) => {
    if (!user || !activeNotebook) {
      toast.error('Materyal üretmek için giriş yapmalısınız.');
      return;
    }

    const checkedSources = activeNotebook.sources.filter((s) =>
      activeNotebook.checkedSourceIds.includes(s.id),
    );
    const checkedMatSources: ExtractedSourceItem[] = materials
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
          text: txt || mat.title,
          pagesOrSlides: Math.max(1, Math.ceil(txt.split(/\s+/).length / 300)),
          wordCount: Math.max(1, txt.split(/\s+/).filter(Boolean).length),
          charCount: txt.length,
        };
      });

    const allSelectedSources = [...checkedSources, ...checkedMatSources];
    if (allSelectedSources.length === 0) {
      toast.info('Üretim yapmak için önce sol panelden en az 1 ders notu, PDF veya slayt ekleyip seçin.');
      return;
    }

    const bundle = combineStudySources(
      allSelectedSources,
      activeNotebook.title,
      activeNotebook.course || allSelectedSources[0]?.course || '',
    );

    const nextSettings: StudioGenerationSettings = {
      ...settings,
      materialType: targetType,
    };
    setSettings(nextSettings);
    setIsGenerating(true);
    setGenerationPct(10);
    setGenerationLabel('Seçili kaynaklardan çalışma materyali hazırlanıyor...');

    try {
      const result = await routedGenerateMaterial(bundle, nextSettings, (pct, msg) => {
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
          material_type: targetType,
          title: bundle.title,
          course: bundle.course || bundle.detectedDiscipline || null,
          content: result.content as unknown as Json,
          model: result.model,
          exam_profile: nextSettings.examFocus
            ? { examFocus: nextSettings.examFocus, pedagogicalStyle: nextSettings.pedagogicalStyle }
            : null,
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
          'Yapay zekâ bağlantısına geçici olarak ulaşılamadı; temel yerel ayrıştırıcı ile oluşturuldu.',
        );
      } else {
        toast.success('Çalışma materyali hazırlandı ve defterine kaydedildi.');
      }
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

  return (
    <Layout>
      <div
        className={
          resolvedTab === 'workspace' && !activeMaterial
            ? 'mx-auto w-full max-w-[1560px] px-2.5 py-3 sm:px-5 sm:py-4'
            : 'mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6'
        }
      >
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
            onRecordProgress={(score, total) =>
              handleRecordProgress(activeMaterial.id, score, total)
            }
            onReportIssue={() => setReportOpen(true)}
          />
        ) : (
          <NeuralCommandShell
            activeTab={resolvedTab}
            onTabChange={(next) => setActiveTab(normalizeTab(next))}
            engine={engine}
            dueCardsCount={dueCards.length}
            materialsCount={materials.length}
            indexedDocsCount={indexedDocsCount}
            onReportIssue={() => setReportOpen(true)}
          >
            {resolvedTab === 'workspace' && activeNotebook && (
              <NotebookStudioWorkspace
                userId={user.id}
                notebooks={notebooks}
                activeNotebook={activeNotebook}
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
                onAddSources={handleAddNotebookSources}
                onRemoveSource={handleRemoveNotebookSource}
                onToggleSource={handleToggleNotebookSource}
                onToggleAllSources={handleToggleAllNotebookSources}
                onToggleMaterialSource={handleToggleMaterialSource}
                onExtractRemoteNoteFile={handleExtractRemoteNoteFile}
                onSavedLiveMaterial={handleSavedLiveMaterial}
                onSendMessage={handleNotebookSendMessage}
                onPinMessage={handlePinMessage}
                onClearChat={handleClearChat}
                onGenerateType={handleNotebookGenerateType}
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
