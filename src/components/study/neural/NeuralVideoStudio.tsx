import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  BookmarkPlus,
  Brain,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  FileDown,
  Headphones,
  Layout,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Printer,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Star,
  Subtitles,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AccessibilityDialog, { type AccessibilitySettings } from '../video/AccessibilityDialog';
import ConceptKnowledgeMap from '../video/ConceptKnowledgeMap';
import InteractiveEconomicsLab from '../video/InteractiveEconomicsLab';
import LessonWrapUp from '../video/LessonWrapUp';
import SearchTranscriptModal from '../video/SearchTranscriptModal';
import SpacedRepetitionFlashcards from '../video/SpacedRepetitionFlashcards';
import { downloadVideoStudyNotes, printVideoStudyNotesPdf } from '../video/exportVideoStudyNotes';
import { STAGE_H, STAGE_W, renderStage } from '../video/renderStage';
import {
  CHARS_PER_SEC,
  buildStudioContent,
  formatTime,
  positionFromElapsed,
  type DiagramType,
  type Speaker,
  type StudioContent,
} from '../video/sceneModel';
import {
  discoverTurkishVoices,
  playSceneConversationally,
  preloadAssignedNeuralVoices,
  prepareSceneFirstTurn,
  previewSpeakerVoice,
  prewarmSceneAudio,
  selectVoicesForSpeakers,
  setStudioMasterVolume,
  unlockStudioAudio,
  visemeFromTurkishChar,
  type Viseme,
  type VoiceOption,
} from '../video/speechEngine';
import { subscribeVitsStatus, type VitsEngineStatus } from '../video/vitsTurkishEngine';

export interface VideoMaterialRecord {
  id: string;
  title: string;
  material_type: string;
  course: string | null;
  content: unknown;
  created_at: string;
  exam_profile?: unknown;
}

interface PersonalNoteItem {
  id: string;
  sceneIndex: number;
  sceneTitle: string;
  timestampSec: number;
  text: string;
  createdAt: string;
  favorite?: boolean;
}

export interface NeuralVideoStudioProps {
  material: VideoMaterialRecord;
  onClose?: () => void;
  onReport?: () => void;
  onOpenCoach?: () => void;
}

type StudioLayoutMode = 'standard' | 'whiteboard' | 'focus';
type DrawerTab = 'chapters' | 'notes' | 'voices';
type ActiveOverlay = null | 'wrapup' | 'lab' | 'map' | 'srs' | 'search' | 'a11y';

const DEFAULT_A11Y: AccessibilitySettings = {
  subtitleSize: 'md',
  highContrast: false,
  reduceMotion: false,
  lowDataMode: false,
  explanationLevel: 'orta',
};

const DIAGRAM_BADGE_TR: Record<DiagramType, string> = {
  visual: 'Görsel & İllüstrasyon',
  shapes: 'Şekiller & Döngü',
  table: 'Karşılaştırma Tablosu',
  chart: 'Analitik Grafik',
  curve: 'Ekonomik Eğri & Denge',
  scenario: 'Vaka Senaryosu',
  timeline: 'Zaman Akışı',
  comparison: 'İkili Kıyaslama',
  structure: 'Kurumsal Yapı',
  network: 'Kavram Ağı',
};

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.25, 1.5, 1.75];

const LAYOUT_OPTIONS: Array<{ id: StudioLayoutMode; label: string }> = [
  { id: 'standard', label: 'Sinema' },
  { id: 'whiteboard', label: 'Akıllı Tahta' },
  { id: 'focus', label: 'Odak' },
];

export const NeuralVideoStudio: React.FC<NeuralVideoStudioProps> = ({
  material,
  onClose,
  onReport,
  onOpenCoach,
}) => {
  const studio = useMemo<StudioContent>(
    () => buildStudioContent(material.content, material.title, material.course || ''),
    [material.content, material.title, material.course],
  );
  const { scenes, totalDurationSec, keyFacts, examQuestions, matchingPairs } = studio;

  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [completedScenes, setCompletedScenes] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`econnotes_completed_scenes_${material.id}`);
      return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [elapsedSceneTime, setElapsedSceneTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [layoutMode, setLayoutMode] = useState<StudioLayoutMode>('standard');
  const [liveSpeaker, setLiveSpeaker] = useState<Speaker>('Deniz');
  const [inBreathPause, setInBreathPause] = useState(false);
  const [isBufferingSpeech, setIsBufferingSpeech] = useState(false);

  const [voices, setVoices] = useState<VoiceOption[]>(() => discoverTurkishVoices());
  const [preferredDenizVoice, setPreferredDenizVoice] = useState('');
  const [preferredBarisVoice, setPreferredBarisVoice] = useState('');
  const [vitsStatus, setVitsStatus] = useState<VitsEngineStatus>({
    state: 'idle',
    progressPct: 0,
    activeLabel: '',
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('chapters');
  const [chapterPopoverOpen, setChapterPopoverOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [a11y, setA11y] = useState<AccessibilitySettings>(() => {
    try {
      const raw = localStorage.getItem('econnotes_studio_a11y_v1');
      return raw ? { ...DEFAULT_A11Y, ...JSON.parse(raw) } : DEFAULT_A11Y;
    } catch {
      return DEFAULT_A11Y;
    }
  });

  const [notes, setNotes] = useState<PersonalNoteItem[]>(() => {
    try {
      const raw = localStorage.getItem(`econnotes_video_notes_${material.id}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [noteDraft, setNoteDraft] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const stopSpeechRef = useRef<(() => void) | null>(null);
  const sceneClockRef = useRef(0);
  const lastSentenceRef = useRef(0);
  const lastCharRef = useRef(0);
  const visemeRef = useRef<{ viseme: Viseme; open: number }>({ viseme: 'rest', open: 0 });
  const isPlayingRef = useRef(false);
  const isBufferingRef = useRef(false);
  const speedRef = useRef(1);

  isPlayingRef.current = isPlaying;
  isBufferingRef.current = isBufferingSpeech;
  speedRef.current = playbackSpeed;

  const activeScene = scenes[activeSceneIndex] || scenes[0];

  const voiceAssignments = useMemo(
    () =>
      selectVoicesForSpeakers(
        voices,
        preferredDenizVoice || undefined,
        preferredBarisVoice || undefined,
      ),
    [voices, preferredDenizVoice, preferredBarisVoice],
  );

  const allTerms = useMemo(
    () =>
      scenes.flatMap((sc, sceneIdx) =>
        (sc.keyTerms || []).map((kt) => ({
          term: kt.term,
          definition: kt.definition,
          sceneIdx,
        })),
      ),
    [scenes],
  );

  const sceneStartOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const sc of scenes) {
      offsets.push(acc);
      acc += sc.durationSec;
    }
    return offsets;
  }, [scenes]);

  const totalElapsedSec = useMemo(() => {
    const base = sceneStartOffsets[activeSceneIndex] || 0;
    return Math.min(totalDurationSec, base + elapsedSceneTime);
  }, [sceneStartOffsets, activeSceneIndex, elapsedSceneTime, totalDurationSec]);

  const persistCompleted = useCallback(
    (idx: number) => {
      setCompletedScenes((prev) => {
        if (prev.has(idx)) return prev;
        const next = new Set(prev);
        next.add(idx);
        try {
          localStorage.setItem(`econnotes_completed_scenes_${material.id}`, JSON.stringify([...next]));
        } catch {
          // storage quota ignored
        }
        return next;
      });
    },
    [material.id],
  );

  useEffect(() => {
    const unsub = subscribeVitsStatus(setVitsStatus);
    const refreshVoices = () => setVoices(discoverTurkishVoices());
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
    return () => {
      unsub();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    setStudioMasterVolume(volume, isMuted);
  }, [volume, isMuted]);

  useEffect(() => {
    try {
      localStorage.setItem('econnotes_studio_a11y_v1', JSON.stringify(a11y));
    } catch {
      // ignore
    }
  }, [a11y]);

  useEffect(() => {
    if (a11y.lowDataMode) return;
    preloadAssignedNeuralVoices(voiceAssignments);
  }, [voiceAssignments, a11y.lowDataMode]);

  useEffect(() => {
    if (!activeScene || a11y.lowDataMode) return;
    prewarmSceneAudio(activeScene, voiceAssignments, true);
  }, [activeScene, voiceAssignments, a11y.lowDataMode]);

  const stopSpeech = useCallback(() => {
    if (stopSpeechRef.current) {
      try {
        stopSpeechRef.current();
      } catch {
        // ignore
      }
      stopSpeechRef.current = null;
    }
    setIsBufferingSpeech(false);
    setInBreathPause(false);
    visemeRef.current = { viseme: 'rest', open: 0 };
  }, []);

  const jumpToScene = useCallback(
    (sceneIdx: number, sceneTimeSec = 0, autoPlay = true) => {
      const clamped = Math.max(0, Math.min(scenes.length - 1, sceneIdx));
      stopSpeech();
      const targetScene = scenes[clamped];
      const clampedTime = targetScene
        ? Math.max(0, Math.min(targetScene.durationSec - 0.1, sceneTimeSec))
        : 0;
      sceneClockRef.current = clampedTime;
      setActiveSceneIndex(clamped);
      setElapsedSceneTime(clampedTime);
      setChapterPopoverOpen(false);
      if (targetScene) {
        const pos = positionFromElapsed(targetScene, clampedTime);
        lastSentenceRef.current = pos.sentenceIndex;
        lastCharRef.current = pos.charInSentence;
        setLiveSpeaker(targetScene.sentenceSpeakers[pos.sentenceIndex] || targetScene.speaker);
      }
      if (autoPlay) {
        unlockStudioAudio();
        setHasStartedOnce(true);
        setIsPlaying(true);
      }
    },
    [scenes, stopSpeech],
  );

  // Konuşma motoru döngüsü
  useEffect(() => {
    if (!isPlaying || !activeScene) {
      stopSpeech();
      return;
    }

    let cancelled = false;
    const pos = positionFromElapsed(activeScene, sceneClockRef.current);
    lastSentenceRef.current = pos.sentenceIndex;
    lastCharRef.current = pos.charInSentence;
    setLiveSpeaker(activeScene.sentenceSpeakers[pos.sentenceIndex] || activeScene.speaker);

    const startPlayback = async () => {
      setIsBufferingSpeech(true);
      try {
        await prepareSceneFirstTurn(activeScene, voiceAssignments, !a11y.lowDataMode);
      } catch {
        // fallback handled by speechEngine
      }
      if (cancelled) return;
      setIsBufferingSpeech(false);

      const stopFn = playSceneConversationally({
        scene: activeScene,
        assignments: voiceAssignments,
        playbackSpeed,
        volume,
        muted: isMuted,
        preferCloudNeural: !a11y.lowDataMode,
        startSentenceIndex: pos.sentenceIndex,
        onSpeakerChange: (spk) => {
          if (!cancelled) setLiveSpeaker(spk);
        },
        onBoundaryProgress: (sentIdx, charIdx) => {
          if (cancelled) return;
          lastSentenceRef.current = sentIdx;
          lastCharRef.current = charIdx;
          const s = activeScene.sentences[sentIdx] || '';
          const ch = s[Math.min(s.length - 1, Math.max(0, charIdx))] || ' ';
          visemeRef.current = visemeFromTurkishChar(ch);
          const offset = activeScene.sentenceOffsets[sentIdx] || 0;
          const approxSec = Math.min(
            activeScene.durationSec,
            (offset + charIdx) / CHARS_PER_SEC,
          );
          if (Math.abs(sceneClockRef.current - approxSec) > 1.35) {
            sceneClockRef.current = approxSec;
          }
        },
        onAudioEnergy: (open, viseme) => {
          if (!cancelled) visemeRef.current = { viseme, open };
        },
        onBreathPause: (paused) => {
          if (!cancelled) setInBreathPause(paused);
        },
        onBuffering: (buf) => {
          if (!cancelled) setIsBufferingSpeech(buf);
        },
        onComplete: () => {
          if (cancelled) return;
          persistCompleted(activeSceneIndex);
          if (activeSceneIndex + 1 < scenes.length) {
            jumpToScene(activeSceneIndex + 1, 0, true);
          } else {
            setIsPlaying(false);
            setActiveOverlay('wrapup');
          }
        },
      });
      stopSpeechRef.current = stopFn;
    };

    void startPlayback();

    return () => {
      cancelled = true;
      stopSpeech();
    };
  }, [
    isPlaying,
    activeScene,
    activeSceneIndex,
    scenes.length,
    playbackSpeed,
    voiceAssignments,
    a11y.lowDataMode,
    volume,
    isMuted,
    stopSpeech,
    persistCompleted,
    jumpToScene,
  ]);

  // 60 FPS Tuval Render Döngüsü (CPU/GPU hızlandırmalı 2D Stage)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeScene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();
    let uiSyncAccumulator = 0;

    const tick = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      if (isPlayingRef.current && !isBufferingRef.current) {
        sceneClockRef.current = Math.min(
          activeScene.durationSec,
          sceneClockRef.current + dtSec * speedRef.current,
        );
      }

      uiSyncAccumulator += dtSec;
      if (uiSyncAccumulator >= 0.1) {
        uiSyncAccumulator = 0;
        setElapsedSceneTime(sceneClockRef.current);
      }

      const pos = positionFromElapsed(activeScene, sceneClockRef.current);
      const sentIdx = isPlayingRef.current ? lastSentenceRef.current : pos.sentenceIndex;
      const charIdx = isPlayingRef.current ? lastCharRef.current : pos.charInSentence;
      const progress = activeScene.durationSec > 0
        ? Math.min(1, sceneClockRef.current / activeScene.durationSec)
        : 0;
      const sceneBase = sceneStartOffsets[activeSceneIndex] || 0;
      const overall = totalDurationSec > 0
        ? Math.min(1, (sceneBase + sceneClockRef.current) / totalDurationSec)
        : 0;

      renderStage(ctx, {
        scene: activeScene,
        sceneIndex: activeSceneIndex,
        sceneCount: scenes.length,
        progress,
        overall,
        sceneTime: sceneClockRef.current,
        sentenceIndex: sentIdx,
        charInSentence: charIdx,
        activeSpeaker: liveSpeaker,
        playing: isPlayingRef.current,
        poster: !hasStartedOnce,
        now,
        courseLabel: material.course || 'Akademik Stüdyo',
        showSubtitles,
        viseme: visemeRef.current.viseme,
        mouthOpen: visemeRef.current.open,
        inBreathPause,
        layoutMode,
        subtitleSize: a11y.subtitleSize,
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeScene,
    activeSceneIndex,
    scenes.length,
    sceneStartOffsets,
    totalDurationSec,
    hasStartedOnce,
    material.course,
    showSubtitles,
    liveSpeaker,
    inBreathPause,
    layoutMode,
    a11y.subtitleSize,
  ]);

  const togglePlay = useCallback(() => {
    unlockStudioAudio();
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setHasStartedOnce(true);
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekBy = useCallback(
    (deltaSec: number) => {
      if (!activeScene) return;
      const target = sceneClockRef.current + deltaSec;
      if (target < 0 && activeSceneIndex > 0) {
        const prev = scenes[activeSceneIndex - 1];
        jumpToScene(activeSceneIndex - 1, Math.max(0, prev.durationSec + target), isPlaying);
        return;
      }
      if (target >= activeScene.durationSec && activeSceneIndex + 1 < scenes.length) {
        jumpToScene(activeSceneIndex + 1, 0, isPlaying);
        return;
      }
      jumpToScene(activeSceneIndex, Math.max(0, Math.min(activeScene.durationSec - 0.1, target)), isPlaying);
    },
    [activeScene, activeSceneIndex, scenes, isPlaying, jumpToScene],
  );

  // Klavye kısayolları
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekBy(10);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-10);
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((prev) => !prev);
      } else if (e.key.toLowerCase() === 'c') {
        setShowSubtitles((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, seekBy]);

  const handleTimelineSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sec = Number(e.target.value);
    for (let i = 0; i < scenes.length; i++) {
      const start = sceneStartOffsets[i];
      const end = start + scenes[i].durationSec;
      if (sec <= end || i === scenes.length - 1) {
        jumpToScene(i, Math.max(0, sec - start), isPlaying);
        return;
      }
    }
  };

  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed || !activeScene) return;
    const item: PersonalNoteItem = {
      id: `${Date.now()}`,
      sceneIndex: activeSceneIndex,
      sceneTitle: activeScene.title,
      timestampSec: Math.round(totalElapsedSec),
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...notes];
    setNotes(next);
    setNoteDraft('');
    try {
      localStorage.setItem(`econnotes_video_notes_${material.id}`, JSON.stringify(next));
    } catch {
      // ignore
    }
    toast.success('Zaman damgalı not kaydedildi.');
  };

  const handleDeleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    try {
      localStorage.setItem(`econnotes_video_notes_${material.id}`, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleDownloadNotes = () => {
    downloadVideoStudyNotes({
      studio,
      courseName: material.course || undefined,
      userNotes: notes.map((n) => ({
        id: n.id,
        sceneIndex: n.sceneIndex,
        timeLabel: formatTime(n.timestampSec),
        text: n.text,
      })),
    });
    toast.success('Ders notları HTML olarak indirildi.');
  };

  const handlePrintNotes = () => {
    const ok = printVideoStudyNotesPdf({
      studio,
      courseName: material.course || undefined,
      userNotes: notes.map((n) => ({
        id: n.id,
        sceneIndex: n.sceneIndex,
        timeLabel: formatTime(n.timestampSec),
        text: n.text,
      })),
    });
    if (!ok) toast.error('Açılır pencere engellendi, lütfen izin verin.');
  };

  const toggleFullscreen = async () => {
    const el = portalRootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // fullscreen API unavailable
    }
  };

  const overallPercent = totalDurationSec > 0 ? Math.round((completedScenes.size / scenes.length) * 100) : 0;

  const studioTree = (
    <div
      ref={portalRootRef}
      className={`fixed inset-0 z-[200] flex flex-col bg-[#040711] text-slate-100 select-none ${
        a11y.highContrast ? 'contrast-125' : ''
      }`}
    >
      {/* Üst Sinema Barı */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#070c19]/95 px-3 sm:px-5 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                stopSpeech();
                setIsPlaying(false);
                onClose();
              }}
              className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-xs text-slate-100 hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Geri
            </Button>
          )}
          <div className="hidden sm:block">
            <EconLogo onDark className="h-7 w-auto" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-white">{studio.title}</h1>
            <p className="truncate text-[11px] text-slate-400">
              Bölüm {activeSceneIndex + 1}/{scenes.length}: {activeScene?.title}
              {vitsStatus.state === 'downloading' || vitsStatus.state === 'compiling'
                ? ` · Neural Ses Hazırlanıyor (%${Math.round(vitsStatus.progressPct)})`
                : isBufferingSpeech
                  ? ' · Diyalog Sentezleniyor...'
                  : ''}
            </p>
          </div>
        </div>

        {/* Üst Hızlı Akademik Araçlar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setIsPlaying(false);
              setActiveOverlay('wrapup');
            }}
            className="h-8 gap-1.5 border-amber-400/30 bg-amber-500/10 text-xs text-amber-200 hover:bg-amber-500/20"
          >
            <Trophy className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Sınav Modu</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsPlaying(false);
              setActiveOverlay('map');
            }}
            title="Kavram Bilgi Haritası"
            className="h-8 gap-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            <Network className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden lg:inline">Harita</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsPlaying(false);
              setActiveOverlay('lab');
            }}
            title="İnteraktif İktisat Laboratuvarı"
            className="h-8 gap-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden xl:inline">İktisat Lab</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsPlaying(false);
              setActiveOverlay('srs');
            }}
            title="Aralıklı Tekrar Kartları"
            className="h-8 gap-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            <Brain className="h-3.5 w-3.5 text-violet-400" />
            <span className="hidden xl:inline">Kartlar</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setActiveOverlay('search')}
            title="Transkript İçinde Ara"
            className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDownloadNotes}
            title="Ders Notu HTML İndir"
            className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
          >
            <FileDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handlePrintNotes}
            title="Yazdır / PDF"
            className="hidden sm:inline-flex h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setActiveOverlay('a11y')}
            title="Erişilebilirlik"
            className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {onReport && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onReport}
              title="Hata Bildir"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
            >
              <Bug className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-xs text-slate-100 hover:bg-white/10"
          >
            {drawerOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">Panel</span>
          </Button>
        </div>
      </header>

      {/* Ana Sahne + Yan Çekmece */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Orta Tuval Alanı */}
        <main className="relative flex flex-1 items-center justify-center bg-radial from-[#0b1428] via-[#050914] to-[#02040a] p-2 sm:p-4 overflow-hidden">
          <div className="relative flex h-full w-full items-center justify-center">
            <canvas
              ref={canvasRef}
              width={STAGE_W}
              height={STAGE_H}
              onClick={togglePlay}
              className="max-h-full max-w-full cursor-pointer rounded-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
            />

            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Video Dersi Başlat"
                className="group absolute flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/20 text-white backdrop-blur-md shadow-[0_0_50px_rgba(34,211,238,0.35)] transition hover:scale-105 hover:bg-cyan-500/30"
              >
                {isBufferingSpeech ? (
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-200" />
                ) : (
                  <Play className="h-8 w-8 translate-x-0.5 fill-white text-white" />
                )}
              </button>
            )}

            {isBufferingSpeech && isPlaying && (
              <div className="pointer-events-none absolute top-5 right-5 flex items-center gap-2 rounded-full border border-cyan-400/40 bg-[#071022]/90 px-3 py-1.5 text-xs text-cyan-200 backdrop-blur-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Neural Stüdyo Sesi Sentezleniyor...
              </div>
            )}
          </div>
        </main>

        {/* Sağ Çekmece (Bölümler, Notlar, Ses Motoru) */}
        {drawerOpen && (
          <aside className="flex w-full sm:w-96 shrink-0 flex-col border-l border-white/[0.08] bg-[#070c19] overflow-hidden">
            <div className="flex border-b border-white/[0.08] p-2 gap-1">
              {(
                [
                  { id: 'chapters', label: `Bölümler (${scenes.length})` },
                  { id: 'notes', label: `Notlar (${notes.length})` },
                  { id: 'voices', label: 'Ses & Mod' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDrawerTab(t.id)}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    drawerTab === t.id
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {drawerTab === 'chapters' && (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white">Tamamlanma İlerlemesi</span>
                      <span className="text-cyan-300 font-bold">%{overallPercent}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all"
                        style={{ width: `${overallPercent}%` }}
                      />
                    </div>
                  </div>
                  {scenes.map((sc, idx) => {
                    const isCurrent = idx === activeSceneIndex;
                    const done = completedScenes.has(idx);
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => jumpToScene(idx, 0, true)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isCurrent
                            ? 'border-cyan-400/50 bg-cyan-500/10'
                            : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-semibold text-cyan-300">
                            Bölüm {idx + 1} · {DIAGRAM_BADGE_TR[sc.diagram.type]}
                          </span>
                          <span className="flex items-center gap-1 text-slate-400">
                            {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                            {formatTime(sc.durationSec)}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-white line-clamp-2">{sc.title}</p>
                        {sc.examTip && (
                          <p className="mt-1 text-[11px] text-amber-300/80 line-clamp-1">
                            Sınav İpucu: {sc.examTip}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {drawerTab === 'notes' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      placeholder={`${formatTime(totalElapsedSec)} anına not ekle...`}
                      className="h-9 bg-white/5 border-white/10 text-xs text-white"
                    />
                    <Button type="button" size="sm" onClick={handleAddNote} className="h-9 px-3">
                      <BookmarkPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {notes.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">
                      Henüz zaman damgalı not eklenmedi. Dersi dinlerken kritik noktaları işaretleyebilirsiniz.
                    </p>
                  ) : (
                    notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => jumpToScene(n.sceneIndex, 0, true)}
                            className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:underline"
                          >
                            <Star className="h-3 w-3" />
                            {formatTime(n.timestampSec)} · Bölüm {n.sceneIndex + 1}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-slate-200 leading-relaxed">{n.text}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {drawerTab === 'voices' && (
                <div className="space-y-4 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      <Headphones className="h-3.5 w-3.5 text-cyan-400" />
                      Dr. Deniz Ses Seçimi
                    </p>
                    <select
                      value={preferredDenizVoice}
                      onChange={(e) => setPreferredDenizVoice(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-[#0a1226] px-2.5 py-2 text-xs text-white"
                    >
                      <option value="">Otomatik En İyi Neural HD</option>
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.cleanName} ({v.quality})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => previewSpeakerVoice(voiceAssignments.Deniz, 'Deniz')}
                      className="w-full h-8 border-white/15 bg-white/5 text-xs"
                    >
                      Dr. Deniz Sesini Test Et
                    </Button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      Barış Ses Seçimi
                    </p>
                    <select
                      value={preferredBarisVoice}
                      onChange={(e) => setPreferredBarisVoice(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-[#0a1226] px-2.5 py-2 text-xs text-white"
                    >
                      <option value="">Otomatik En İyi Neural HD</option>
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.cleanName} ({v.quality})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => previewSpeakerVoice(voiceAssignments.Barış, 'Barış')}
                      className="w-full h-8 border-white/15 bg-white/5 text-xs"
                    >
                      Barış Sesini Test Et
                    </Button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      <Layout className="h-3.5 w-3.5 text-emerald-400" />
                      Sahne Düzeni
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {LAYOUT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setLayoutMode(opt.id)}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                            layoutMode === opt.id
                              ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                              : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Alt Sinema Kontrol Dock'u */}
      <footer className="relative shrink-0 border-t border-white/[0.08] bg-[#070c19]/95 px-3 sm:px-5 py-2.5 backdrop-blur-xl">
        {/* Zaman Çizelgesi */}
        <div className="mb-2 flex items-center gap-3 text-[11px] font-mono text-slate-300">
          <span className="w-11 text-right">{formatTime(totalElapsedSec)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, totalDurationSec)}
            step={0.5}
            value={totalElapsedSec}
            onChange={handleTimelineSeek}
            aria-label="Video Zaman Çizelgesi"
            className="h-1.5 flex-1 cursor-pointer accent-cyan-400"
          />
          <span className="w-11">{formatTime(totalDurationSec)}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Sol Kontroller */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={activeSceneIndex === 0}
              onClick={() => jumpToScene(activeSceneIndex - 1, 0, isPlaying)}
              title="Önceki Bölüm"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => seekBy(-10)}
              title="10 saniye geri"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={togglePlay}
              className="h-9 gap-1.5 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Duraklat' : 'Oynat'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => seekBy(10)}
              title="10 saniye ileri"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={activeSceneIndex + 1 >= scenes.length}
              onClick={() => jumpToScene(activeSceneIndex + 1, 0, isPlaying)}
              title="Sonraki Bölüm"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Ses seviyesi */}
            <div className="hidden md:flex items-center gap-1.5 pl-2">
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                aria-label="Sesi Kapat / Aç"
                className="text-slate-300 hover:text-white"
              >
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (val > 0 && isMuted) setIsMuted(false);
                }}
                aria-label="Ses Seviyesi"
                className="h-1 w-20 cursor-pointer accent-cyan-400"
              />
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowSubtitles((s) => !s)}
              title="Altyazı Göster / Gizle"
              className={`h-8 w-8 p-0 ${showSubtitles ? 'text-cyan-300 bg-cyan-500/15' : 'text-slate-300 hover:bg-white/10'}`}
            >
              <Subtitles className="h-4 w-4" />
            </Button>
          </div>

          {/* Orta Bölüm Seçici Hapı */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setChapterPopoverOpen((p) => !p)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs hover:bg-white/10"
            >
              <span className="font-semibold text-cyan-300">{liveSpeaker === 'Deniz' ? 'Dr. Deniz' : 'Barış'}</span>
              <span className="max-w-[200px] sm:max-w-[320px] truncate text-slate-200">
                {activeSceneIndex + 1}/{scenes.length} · {activeScene?.title}
              </span>
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {chapterPopoverOpen && (
              <div className="absolute bottom-11 left-1/2 z-50 w-80 -translate-x-1/2 rounded-2xl border border-white/15 bg-[#091124] p-2 shadow-2xl max-h-72 overflow-y-auto space-y-1">
                {scenes.map((sc, idx) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => jumpToScene(idx, 0, true)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs ${
                      idx === activeSceneIndex
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate pr-2">
                      {idx + 1}. {sc.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatTime(sc.durationSec)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sağ Kontroller: Hız + Düzen + Tam Ekran */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setLayoutMode((m) =>
                  m === 'standard' ? 'whiteboard' : m === 'whiteboard' ? 'focus' : 'standard',
                )
              }
              title="Sahne Düzenini Değiştir"
              className="hidden sm:inline-flex h-8 gap-1 px-2 text-xs text-slate-300 hover:bg-white/10"
            >
              <Layout className="h-3.5 w-3.5" />
              {LAYOUT_OPTIONS.find((o) => o.id === layoutMode)?.label}
            </Button>

            <div className="relative">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSpeedMenuOpen((p) => !p)}
                className="h-8 gap-1 border-white/15 bg-white/[0.04] px-2.5 text-xs text-slate-100 hover:bg-white/10"
              >
                <Sliders className="h-3.5 w-3.5" />
                {playbackSpeed}x
              </Button>
              {speedMenuOpen && (
                <div className="absolute bottom-10 right-0 z-50 w-24 rounded-xl border border-white/15 bg-[#091124] p-1 shadow-xl">
                  {SPEED_OPTIONS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => {
                        setPlaybackSpeed(sp);
                        setSpeedMenuOpen(false);
                      }}
                      className={`w-full rounded-lg px-2.5 py-1 text-left text-xs ${
                        playbackSpeed === sp ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {onOpenCoach && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsPlaying(false);
                  onOpenCoach();
                }}
                className="hidden sm:inline-flex h-8 gap-1 border-cyan-400/30 bg-cyan-500/10 px-2.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
              >
                <Send className="h-3 w-3" />
                AI Koç
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={toggleFullscreen}
              title="Tam Ekran"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </footer>

      {/* Modallar */}
      {activeOverlay === 'wrapup' && (
        <LessonWrapUp
          title={studio.title}
          courseLabel={material.course || undefined}
          scenes={scenes}
          matchingPairs={matchingPairs}
          examQuestions={examQuestions}
          keyFacts={keyFacts}
          onClose={() => setActiveOverlay(null)}
          onReplayLesson={() => {
            setActiveOverlay(null);
            jumpToScene(0, 0, true);
          }}
          onJumpToScene={(idx) => {
            setActiveOverlay(null);
            jumpToScene(idx, 0, true);
          }}
          onDownloadNotes={handleDownloadNotes}
          onPrintNotes={handlePrintNotes}
        />
      )}

      {activeOverlay === 'map' && (
        <ConceptKnowledgeMap
          scenes={scenes}
          allTerms={allTerms}
          courseTitle={material.course || studio.title}
          onClose={() => setActiveOverlay(null)}
          onJumpToScene={(idx, timeSec) => {
            setActiveOverlay(null);
            jumpToScene(idx, timeSec || 0, true);
          }}
        />
      )}

      {activeOverlay === 'lab' && (
        <InteractiveEconomicsLab
          courseTitle={material.course || studio.title}
          onClose={() => setActiveOverlay(null)}
          onAskCoach={
            onOpenCoach
              ? () => {
                  setActiveOverlay(null);
                  onOpenCoach();
                }
              : undefined
          }
        />
      )}

      {activeOverlay === 'srs' && (
        <SpacedRepetitionFlashcards
          materialId={material.id}
          scenes={scenes}
          keyFacts={keyFacts}
          onClose={() => setActiveOverlay(null)}
          onJumpToScene={(idx) => {
            setActiveOverlay(null);
            jumpToScene(idx, 0, true);
          }}
        />
      )}

      {activeOverlay === 'search' && (
        <SearchTranscriptModal
          scenes={scenes}
          onClose={() => setActiveOverlay(null)}
          onJumpTo={(idx, timeSec) => {
            setActiveOverlay(null);
            jumpToScene(idx, timeSec, true);
          }}
        />
      )}

      {activeOverlay === 'a11y' && (
        <AccessibilityDialog
          settings={a11y}
          onChange={setA11y}
          onClose={() => setActiveOverlay(null)}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(studioTree, document.body) : studioTree;
};

export default NeuralVideoStudio;
