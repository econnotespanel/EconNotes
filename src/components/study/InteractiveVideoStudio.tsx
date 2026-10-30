import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  X,
  Wand2,
  Bug,
  BookOpen,
  Lightbulb,
  ListOrdered,
  CheckCircle2,
  BookmarkPlus,
  Send,
  Loader2,
  RotateCcw,
  RotateCw,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Subtitles,
  SlidersHorizontal,
  FileDown,
  Trash2,
  ExternalLink,
  ArrowLeft,
  GraduationCap,
  Headphones,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import EconLogo from '@/components/EconLogo';
import LessonWrapUp from './video/LessonWrapUp';
import {
  buildStudioContent,
  positionFromElapsed,
  formatTime,
  StudioContent,
  StudioScene,
  Speaker,
  DiagramType,
  CHARS_PER_SEC,
} from './video/sceneModel';
import { renderStage, STAGE_W, STAGE_H, StageFrame } from './video/renderStage';
import {
  discoverTurkishVoices,
  selectVoicesForSpeakers,
  preloadAssignedNeuralVoices,
  prewarmSceneAudio,
  prepareSceneFirstTurn,
  previewSpeakerVoice,
  playSceneConversationally,
  setStudioMasterVolume,
  unlockStudioAudio,
  visemeFromTurkishChar,
  VoiceOption,
  Viseme,
} from './video/speechEngine';
import { subscribeVitsStatus, type VitsEngineStatus } from './video/vitsTurkishEngine';

export interface StudyMaterial {
  id: string;
  user_id: string;
  source_type: string;
  source_note_id: string | null;
  material_type: string;
  title: string;
  course: string | null;
  content: any;
  created_at: string;
  exam_profile?: any;
}

interface PersonalNoteItem {
  id: string;
  sceneIndex: number;
  sceneTitle: string;
  timestampSec: number;
  text: string;
  createdAt: string;
}

interface InteractiveVideoStudioProps {
  material: StudyMaterial;
  onClose?: () => void;
  onReport?: () => void;
  onOpenCoach?: () => void;
}

const DIAGRAM_BADGE_TR: Record<DiagramType, string> = {
  visual: 'Görsel & İllüstrasyon',
  shapes: 'Şekiller & Döngü',
  table: 'Karşılaştırma Tablosu',
  chart: 'Analitik Grafik',
  curve: 'Analitik Grafik',
  scenario: 'Vaka Senaryosu',
  timeline: 'Zaman Akışı',
  comparison: 'İkili Kıyaslama',
  structure: 'Kurumsal Yapı',
  network: 'Kavram Ağı',
};

export const InteractiveVideoStudio: React.FC<InteractiveVideoStudioProps> = ({
  material,
  onClose,
  onReport,
}) => {
  // 1. Ders içeriği modeli (en az 5+ dakika zengin çok-modlu ders)
  const studio = useMemo<StudioContent>(() => {
    return buildStudioContent(material.content, material.title, material.course || '');
  }, [material.content, material.title, material.course]);

  const { scenes, totalDurationSec, keyFacts, searches, examQuestions, matchingPairs } = studio;

  // 2. Oynatıcı durumları
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const volumeRef = useRef(1.0);
  volumeRef.current = volume;
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [elapsedSceneTime, setElapsedSceneTime] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const [liveSpeaker, setLiveSpeaker] = useState<Speaker>('Deniz');

  // 3. Stüdyo ses durumları
  const [voices, setVoices] = useState<VoiceOption[]>(() => discoverTurkishVoices());
  const [preferredDenizVoice, setPreferredDenizVoice] = useState<string>('');
  const [preferredBarisVoice, setPreferredBarisVoice] = useState<string>('');
  const [preferCloudNeural, setPreferCloudNeural] = useState<boolean>(true);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [vitsStatus, setVitsStatus] = useState<VitsEngineStatus>({
    state: 'idle',
    progressPct: 0,
    activeLabel: '',
  });

  // 4. Arayüz ve çalışma paneli durumları (küçük ekranlarda sahneyi kapatmaması için duyarlı başlangıç)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [activeTab, setActiveTab] = useState<'notes' | 'terms' | 'facts' | 'playlist' | 'coach'>('notes');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [termQuery, setTermQuery] = useState('');
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null);

  // 5. Kişisel zaman damgalı öğrenci notları (gerçek kalıcı depolama)
  const notesStorageKey = `econnotes_studio_notes_${material.id}`;
  const [personalNotes, setPersonalNotes] = useState<PersonalNoteItem[]>(() => {
    try {
      const raw = localStorage.getItem(`econnotes_studio_notes_${material.id}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [quickNoteDraft, setQuickNoteDraft] = useState('');
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(notesStorageKey, JSON.stringify(personalNotes));
    } catch {
      // ignore quota error
    }
  }, [personalNotes, notesStorageKey]);

  // 6. Akıcı Türkçe Neural Ses Ön-Hazırlık (Buffer) ve Önizleme durumları
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [previewingSpeaker, setPreviewingSpeaker] = useState<Speaker | null>(null);
  const prepareTokenRef = useRef<number>(0);
  const bufferingTimerRef = useRef<number | null>(null);

  // Ders sonu değerlendirme (eşleştirme + hocanın soruları)
  const [wrapUpOpen, setWrapUpOpen] = useState(false);

  // 7. Entegre Yapay Zekâ Akıl Hocası
  const [coachMessages, setCoachMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: `Merhaba! **${studio.title}** dersindeyiz. Dr. Deniz ve Barış'ın tartıştığı görseller, tablolar, grafikler veya örnek senaryolarla ilgili aklına takılan her soruyu sorabilirsin.`,
    },
  ]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const coachEndRef = useRef<HTMLDivElement>(null);

  // 8. Referanslar
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopSpeechFnRef = useRef<(() => void) | null>(null);
  const lastTickRef = useRef<number>(performance.now());
  const smoothMouthRef = useRef<number>(0);
  /** Sahne saatinin tek doğruluk kaynağı (60 FPS); React durumu yalnızca arayüz için seyrek güncellenir */
  const clockRef = useRef<number>(0);
  const lastUiSyncRef = useRef<number>(0);
  const lastSpeechActivityRef = useRef<number>(performance.now());
  const finishLessonRef = useRef<() => void>(() => {});
  const advanceLockRef = useRef<number>(-1);

  const speechSyncRef = useRef<{
    sentenceIndex: number;
    charInSentence: number;
    hasBoundaryEvents: boolean;
    inBreathPause: boolean;
    buffering: boolean;
    activeSpeaker: Speaker;
    cloudViseme: Viseme | null;
    cloudMouth: number | null;
  }>({
    sentenceIndex: 0,
    charInSentence: 0,
    hasBoundaryEvents: false,
    inBreathPause: false,
    buffering: false,
    activeSpeaker: 'Deniz',
    cloudViseme: null,
    cloudMouth: null,
  });

  const setClock = useCallback((t: number) => {
    clockRef.current = t;
    lastUiSyncRef.current = performance.now();
    setElapsedSceneTime(t);
  }, []);

  const currentScene: StudioScene = scenes[activeSceneIndex] || scenes[0];

  // VITS Derin Sinir Ağı Türkçe ses modeli hazırlık durumunu izle
  useEffect(() => {
    return subscribeVitsStatus(setVitsStatus);
  }, []);

  // Tüm ders boyunca birikmiş tüm terimler
  const allTerms = useMemo(() => {
    const map = new Map<string, { term: string; definition: string; sceneIdx: number }>();
    scenes.forEach((sc, idx) => {
      sc.keyTerms.forEach(kt => {
        const k = kt.term.toLocaleLowerCase('tr-TR');
        if (!map.has(k)) {
          map.set(k, { term: kt.term, definition: kt.definition, sceneIdx: idx });
        }
      });
    });
    return Array.from(map.values());
  }, [scenes]);

  // Arka plan sayfa kaydırmasını kilitle
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Türkçe doğal/bulut seslerini keşfet (liste gerçekten değişmedikçe yeniden atama yapma → konuşma kesilmez)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refresh = () => {
      const found = discoverTurkishVoices();
      setVoices(prev => {
        const prevKey = prev.map(v => v.id).join('|');
        const nextKey = found.map(v => v.id).join('|');
        return prevKey === nextKey ? prev : found;
      });
    };
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    const t1 = window.setTimeout(refresh, 300);
    const t2 = window.setTimeout(refresh, 1000);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refresh);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const speakerVoices = useMemo(
    () => selectVoicesForSpeakers(voices, preferredDenizVoice || undefined, preferredBarisVoice || undefined),
    [voices, preferredDenizVoice, preferredBarisVoice],
  );

  // Seçili Türkçe ses modellerini ve ilk sahnenin açılış cümlesini arka plan worker'ında şimdiden hazırla
  useEffect(() => {
    preloadAssignedNeuralVoices(speakerVoices);
    prewarmSceneAudio(scenes[0], speakerVoices, preferCloudNeural);
  }, [speakerVoices, scenes, preferCloudNeural]);

  // Ses seviyesi değiştiğinde konuşmayı kesmeden anında uygula
  useEffect(() => {
    setStudioMasterVolume(volume, isMuted);
  }, [volume, isMuted]);

  const stopSpeech = useCallback(() => {
    if (stopSpeechFnRef.current) {
      stopSpeechFnRef.current();
      stopSpeechFnRef.current = null;
    }
    speechSyncRef.current.inBreathPause = false;
    speechSyncRef.current.buffering = false;
    speechSyncRef.current.cloudMouth = null;
    speechSyncRef.current.cloudViseme = null;
    if (bufferingTimerRef.current !== null) {
      window.clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
    setIsBuffering(false);
  }, []);

  // Ders tamamlandığında: oynatmayı durdur ve ders sonu değerlendirmesini aç
  finishLessonRef.current = () => {
    stopSpeech();
    setIsPlaying(false);
    const last = scenes[scenes.length - 1];
    if (last) setClock(last.durationSec);
    setWrapUpOpen(true);
  };

  // Sahne seslendirmesini başlat (Dr. Deniz <-> Barış karşılıklı konuşma geçişli)
  const startSceneSpeech = useCallback(
    (sceneIdx: number, fromTimeSec = 0) => {
      stopSpeech();
      const targetScene = scenes[sceneIdx];
      if (!targetScene) return;

      const startPos = positionFromElapsed(targetScene, fromTimeSec);
      speechSyncRef.current = {
        sentenceIndex: startPos.sentenceIndex,
        charInSentence: startPos.charInSentence,
        hasBoundaryEvents: false,
        inBreathPause: false,
        buffering: false,
        activeSpeaker: startPos.activeSpeaker,
        cloudViseme: null,
        cloudMouth: null,
      };
      lastSpeechActivityRef.current = performance.now();
      setLiveSpeaker(startPos.activeSpeaker);

      if (isMuted || volumeRef.current <= 0.01) return;

      const touch = () => {
        lastSpeechActivityRef.current = performance.now();
      };

      const cancel = playSceneConversationally({
        scene: targetScene,
        assignments: speakerVoices,
        playbackSpeed,
        volume: volumeRef.current,
        muted: isMuted,
        preferCloudNeural,
        startSentenceIndex: startPos.sentenceIndex,
        onSpeakerChange: spk => {
          touch();
          speechSyncRef.current.activeSpeaker = spk;
          setLiveSpeaker(spk);
        },
        onBoundaryProgress: (sIdx, charIdx, boundaryHit) => {
          touch();
          speechSyncRef.current.sentenceIndex = sIdx;
          speechSyncRef.current.charInSentence = charIdx;
          const spk = targetScene.sentenceSpeakers?.[sIdx] || targetScene.speaker;
          speechSyncRef.current.activeSpeaker = spk;
          if (boundaryHit) {
            speechSyncRef.current.hasBoundaryEvents = true;
            const globalChar = (targetScene.sentenceOffsets[sIdx] || 0) + charIdx;
            const syncedRatio = Math.min(1, globalChar / Math.max(1, targetScene.totalChars));
            // Yalnızca ref güncellenir; React durumu render döngüsünde seyrek eşitlenir
            clockRef.current = syncedRatio * targetScene.durationSec;
          }
        },
        onAudioEnergy: (mouthOpen, viseme) => {
          touch();
          speechSyncRef.current.cloudMouth = mouthOpen;
          speechSyncRef.current.cloudViseme = viseme;
        },
        onBreathPause: paused => {
          touch();
          speechSyncRef.current.inBreathPause = paused;
          if (paused) {
            speechSyncRef.current.cloudMouth = null;
          }
        },
        onBuffering: buffering => {
          touch();
          speechSyncRef.current.buffering = buffering;
          if (bufferingTimerRef.current !== null) {
            window.clearTimeout(bufferingTimerRef.current);
            bufferingTimerRef.current = null;
          }
          if (buffering) {
            // Kısa hazırlıklarda göz kırpan bir uyarı göstermemek için gecikmeli
            bufferingTimerRef.current = window.setTimeout(() => setIsBuffering(true), 650);
          } else {
            setIsBuffering(false);
          }
        },
        onComplete: () => {
          if (sceneIdx + 1 < scenes.length) {
            advanceLockRef.current = sceneIdx + 1;
            setActiveSceneIndex(sceneIdx + 1);
            setClock(0);
          } else {
            finishLessonRef.current();
          }
        },
      });

      stopSpeechFnRef.current = cancel;
    },
    [scenes, speakerVoices, playbackSpeed, isMuted, preferCloudNeural, stopSpeech, setClock],
  );

  useEffect(() => {
    if (isPlaying) {
      startSceneSpeech(activeSceneIndex, clockRef.current);
    } else {
      setElapsedSceneTime(clockRef.current);
      const pos = positionFromElapsed(currentScene, clockRef.current);
      setLiveSpeaker(pos.activeSpeaker);
    }
    return () => {
      stopSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSceneIndex, isPlaying, isMuted, playbackSpeed, speakerVoices, preferCloudNeural]);

  const togglePlay = useCallback(async () => {
    if (isPreparingAudio) {
      prepareTokenRef.current += 1;
      setIsPreparingAudio(false);
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
      return;
    }

    // Tıklama anında ses kanalının kilidini aç (hazırlık uzun sürse bile otomatik oynatma engeli oluşmaz)
    unlockStudioAudio();
    setWrapUpOpen(false);

    let targetSceneIdx = activeSceneIndex;
    let targetElapsed = clockRef.current;
    if (
      activeSceneIndex === scenes.length - 1 &&
      clockRef.current >= currentScene.durationSec - 0.3
    ) {
      targetSceneIdx = 0;
      targetElapsed = 0;
      setActiveSceneIndex(0);
      setClock(0);
    }

    const targetScene = scenes[targetSceneIdx] || currentScene;
    if (!isMuted && volume > 0.01 && targetScene) {
      const token = ++prepareTokenRef.current;
      setIsPreparingAudio(true);
      try {
        const startPos = positionFromElapsed(targetScene, targetElapsed);
        await Promise.race([
          prepareSceneFirstTurn(targetScene, speakerVoices, preferCloudNeural, startPos.sentenceIndex),
          new Promise<void>(resolve => window.setTimeout(resolve, 10000)),
        ]);
      } catch {
        // Sentez hatası olursa normal akış devam eder
      }
      if (prepareTokenRef.current !== token) return;
      setIsPreparingAudio(false);
    }

    setHasStartedOnce(true);
    setIsPlaying(true);
  }, [
    isPreparingAudio,
    isPlaying,
    stopSpeech,
    activeSceneIndex,
    scenes,
    currentScene,
    isMuted,
    volume,
    speakerVoices,
    preferCloudNeural,
    setClock,
  ]);

  const goToScene = useCallback(
    (index: number, seekSec = 0) => {
      const nextIdx = Math.max(0, Math.min(scenes.length - 1, index));
      prepareTokenRef.current += 1;
      setIsPreparingAudio(false);
      stopSpeech();
      setHasStartedOnce(true);
      setWrapUpOpen(false);
      advanceLockRef.current = nextIdx;
      setActiveSceneIndex(nextIdx);
      setClock(seekSec);
      const pos = positionFromElapsed(scenes[nextIdx], seekSec);
      speechSyncRef.current = {
        sentenceIndex: pos.sentenceIndex,
        charInSentence: pos.charInSentence,
        hasBoundaryEvents: false,
        inBreathPause: false,
        buffering: false,
        activeSpeaker: pos.activeSpeaker,
        cloudViseme: null,
        cloudMouth: null,
      };
      setIsBuffering(false);
      setLiveSpeaker(pos.activeSpeaker);
      if (isPlaying && nextIdx === activeSceneIndex) {
        startSceneSpeech(nextIdx, seekSec);
      }
    },
    [scenes, stopSpeech, isPlaying, activeSceneIndex, startSceneSpeech, setClock],
  );

  const seekRelative = useCallback(
    (deltaSec: number) => {
      setHasStartedOnce(true);
      const targetTime = Math.max(0, Math.min(currentScene.durationSec - 0.1, clockRef.current + deltaSec));
      setClock(targetTime);
      const pos = positionFromElapsed(currentScene, targetTime);
      speechSyncRef.current.sentenceIndex = pos.sentenceIndex;
      speechSyncRef.current.charInSentence = pos.charInSentence;
      speechSyncRef.current.activeSpeaker = pos.activeSpeaker;
      setLiveSpeaker(pos.activeSpeaker);
      if (isPlaying) {
        startSceneSpeech(activeSceneIndex, targetTime);
      }
    },
    [currentScene, isPlaying, startSceneSpeech, activeSceneIndex, setClock],
  );

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Escape') {
        if (voiceMenuOpen) {
          setVoiceMenuOpen(false);
          return;
        }
        if (wrapUpOpen) {
          setWrapUpOpen(false);
          return;
        }
        if (!document.fullscreenElement) {
          if (document.querySelector('[role="dialog"]')) return;
          onClose?.();
        }
        return;
      }

      // Ders sonu değerlendirmesi açıkken oynatıcı kısayolları devre dışı
      if (wrapUpOpen) return;

      if (e.code === 'Space') {
        // Odaklı bir düğme varken boşluk tuşunun hem tıklama hem kısayol olarak iki kez tetiklenmesini engelle
        e.preventDefault();
        if (target instanceof HTMLButtonElement) target.blur();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.code === 'KeyM') {
        setIsMuted(m => !m);
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      } else if (e.code === 'KeyC') {
        setShowSubtitles(s => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekRelative, toggleFullscreen, onClose, voiceMenuOpen, wrapUpOpen]);

  // Ses menüsü dışına tıklanınca kapat
  const voiceMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!voiceMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target as Node)) {
        setVoiceMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [voiceMenuOpen]);

  // Render döngüsünün her karede yeniden kurulmaması için tüm canlı değerler tek bir ref üzerinden okunur
  const sceneStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    scenes.forEach(s => {
      starts.push(acc);
      acc += s.durationSec;
    });
    return starts;
  }, [scenes]);

  const liveRef = useRef({
    currentScene,
    activeSceneIndex,
    scenes,
    sceneStarts,
    isPlaying,
    hasStartedOnce,
    playbackSpeed,
    silent: isMuted || volume <= 0.01,
    showSubtitles,
    course: material.course || '',
    totalDurationSec,
  });
  liveRef.current = {
    currentScene,
    activeSceneIndex,
    scenes,
    sceneStarts,
    isPlaying,
    hasStartedOnce,
    playbackSpeed,
    silent: isMuted || volume <= 0.01,
    showSubtitles,
    course: material.course || '',
    totalDurationSec,
  };
  const lastLiveSpeakerRef = useRef<Speaker>('Deniz');

  // 60 FPS Sahne ve Dudak Senkronu Döngüsü (tek sefer kurulur, React yeniden çizimlerinden bağımsız)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const advanceScene = () => {
      const L = liveRef.current;
      lastSpeechActivityRef.current = performance.now();
      if (L.activeSceneIndex + 1 < L.scenes.length) {
        const nextIdx = L.activeSceneIndex + 1;
        clockRef.current = 0;
        speechSyncRef.current.sentenceIndex = 0;
        speechSyncRef.current.charInSentence = 0;
        speechSyncRef.current.hasBoundaryEvents = false;
        liveRef.current = { ...L, activeSceneIndex: nextIdx, currentScene: L.scenes[nextIdx] };
        setActiveSceneIndex(nextIdx);
        setElapsedSceneTime(0);
      } else {
        liveRef.current = { ...L, isPlaying: false };
        finishLessonRef.current();
      }
    };

    const tick = (perfNow: number) => {
      const dt = Math.min(0.1, Math.max(0, (perfNow - lastTickRef.current) / 1000));
      lastTickRef.current = perfNow;

      const L = liveRef.current;
      const scene = L.currentScene;
      const sync = speechSyncRef.current;

      if (L.isPlaying) {
        const frozen = sync.inBreathPause || sync.buffering;
        if (!frozen) {
          const rateFactor = sync.hasBoundaryEvents ? 0.35 : 1.0;
          clockRef.current = Math.min(scene.durationSec, clockRef.current + dt * L.playbackSpeed * rateFactor);

          if (!sync.hasBoundaryEvents) {
            // Ses senkron olayları yokken (sessiz mod / hazırlık) konum doğrudan sahne saatinden türetilir
            const pos = positionFromElapsed(scene, clockRef.current);
            sync.sentenceIndex = pos.sentenceIndex;
            sync.charInSentence = pos.charInSentence;
            if (L.silent) sync.activeSpeaker = pos.activeSpeaker;
          } else {
            const curSentence = scene.sentences[sync.sentenceIndex] || '';
            sync.charInSentence = Math.min(
              curSentence.length,
              sync.charInSentence + dt * CHARS_PER_SEC * L.playbackSpeed * 0.65,
            );
          }
        }

        // Sahne sonu: sessiz modda anında, sesli modda konuşma motoru takılırsa (6 sn sessizlik) güvenli geçiş
        if (clockRef.current >= scene.durationSec - 0.001) {
          const stalled =
            !L.silent && !sync.buffering && perfNow - lastSpeechActivityRef.current > 6000;
          if (L.silent || stalled) advanceScene();
        }

        // Arayüz (zaman çizelgesi, sayaç) için seyrek React güncellemesi
        if (perfNow - lastUiSyncRef.current > 120) {
          lastUiSyncRef.current = perfNow;
          setElapsedSceneTime(clockRef.current);
          if (sync.activeSpeaker !== lastLiveSpeakerRef.current) {
            lastLiveSpeakerRef.current = sync.activeSpeaker;
            setLiveSpeaker(sync.activeSpeaker);
          }
        }
      }

      const live = liveRef.current;
      const frameScene = live.currentScene;
      const fallbackPos = positionFromElapsed(frameScene, clockRef.current);
      const sIdx = live.isPlaying ? sync.sentenceIndex : fallbackPos.sentenceIndex;
      const cIdx = live.isPlaying ? Math.floor(sync.charInSentence) : Math.floor(fallbackPos.charInSentence);
      const activeSpk = live.isPlaying ? sync.activeSpeaker : fallbackPos.activeSpeaker;
      const activeSentence = frameScene.sentences[sIdx] || frameScene.narration;

      let targetViseme: Viseme = 'rest';
      let targetOpen = 0;

      if (live.isPlaying && !sync.inBreathPause && !sync.buffering) {
        if (sync.cloudMouth !== null && sync.cloudViseme) {
          targetViseme = sync.cloudViseme;
          targetOpen = sync.cloudMouth;
        } else {
          const ch = activeSentence.charAt(Math.max(0, Math.min(activeSentence.length - 1, cIdx)));
          const vInfo = visemeFromTurkishChar(ch);
          targetViseme = vInfo.viseme;
          const syllableWave = 0.72 + Math.sin(perfNow / 68) * 0.28;
          targetOpen = vInfo.open * syllableWave;
        }
      }

      smoothMouthRef.current += (targetOpen - smoothMouthRef.current) * Math.min(1, dt * 22);

      const elapsedBefore = live.sceneStarts[live.activeSceneIndex] || 0;
      const overall = live.totalDurationSec > 0 ? (elapsedBefore + clockRef.current) / live.totalDurationSec : 0;

      const frame: StageFrame = {
        scene: frameScene,
        sceneIndex: live.activeSceneIndex,
        sceneCount: live.scenes.length,
        progress: fallbackPos.progress,
        overall,
        sceneTime: clockRef.current,
        sentenceIndex: sIdx,
        charInSentence: cIdx,
        activeSpeaker: activeSpk,
        playing: live.isPlaying,
        poster: !live.hasStartedOnce,
        now: Date.now(),
        courseLabel: live.course,
        showSubtitles: live.showSubtitles,
        viseme: targetViseme,
        mouthOpen: smoothMouthRef.current,
        inBreathPause: sync.inBreathPause || sync.buffering,
      };

      try {
        renderStage(ctx, frame);
      } catch {
        // Tek bir karedeki çizim hatası tüm oynatıcıyı durdurmasın
      }
      animId = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Panoya kopyalandı');
    setTimeout(() => setCopiedId(null), 1800);
  };

  const addPersonalBookmark = () => {
    const text =
      quickNoteDraft.trim() ||
      currentScene.examTip ||
      currentScene.keyTakeaways[0] ||
      currentScene.title;

    const item: PersonalNoteItem = {
      id: `${Date.now()}`,
      sceneIndex: activeSceneIndex,
      sceneTitle: currentScene.title,
      timestampSec: Math.floor(elapsedSceneTime),
      text,
      createdAt: new Date().toISOString(),
    };
    setPersonalNotes(prev => [item, ...prev]);
    setQuickNoteDraft('');
    setNoteComposerOpen(false);
    setSidebarOpen(true);
    setActiveTab('notes');
    toast.success(`Bölüm ${activeSceneIndex + 1} (${formatTime(elapsedSceneTime)}) notlarınıza eklendi`);
  };

  const removePersonalNote = (id: string) => {
    setPersonalNotes(prev => prev.filter(n => n.id !== id));
  };

  const handleDownloadStudySheet = () => {
    const lines: string[] = [
      `# ${studio.title}`,
      material.course ? `**Ders:** ${material.course}` : '',
      studio.outline ? `\n> ${studio.outline}\n` : '',
      `---`,
      `## Bölüm Notları ve Kritik Çıkarımlar`,
    ];

    scenes.forEach((sc, i) => {
      lines.push(`\n### ${i + 1}. ${sc.title} (${DIAGRAM_BADGE_TR[sc.diagram.type]})`);
      sc.sentences.forEach((sent, si) => {
        const spk = sc.sentenceSpeakers?.[si] || sc.speaker;
        lines.push(`- **${spk === 'Deniz' ? 'Dr. Deniz' : 'Barış'}:** ${sent}`);
      });
      if (sc.keyTakeaways.length) {
        lines.push(`\n**Önemli Noktalar:**`);
        sc.keyTakeaways.forEach(tk => lines.push(`- ${tk}`));
      }
      if (sc.examTip) {
        lines.push(`\n- **Sınav İpucu:** ${sc.examTip}`);
      }
    });

    if (allTerms.length > 0) {
      lines.push(`\n---\n## Kavram Sözlüğü`);
      allTerms.forEach(t => lines.push(`- **${t.term}:** ${t.definition}`));
    }

    if (keyFacts.length > 0) {
      lines.push(`\n---\n## Sınav Öncesi Hap Bilgiler`);
      keyFacts.forEach((f, idx) => lines.push(`${idx + 1}. ${f}`));
    }

    if (matchingPairs.length > 0) {
      lines.push(`\n---\n## Kavram Eşleştirme Tablosu`);
      matchingPairs.forEach(p => lines.push(`- **${p.term}** ↔ ${p.definition}`));
    }

    if (examQuestions.length > 0) {
      lines.push(`\n---\n## Hocanın Sorabileceği Sorular`);
      examQuestions.forEach((q, idx) => {
        lines.push(`\n**Soru ${idx + 1}:** ${q.question}`);
        q.options.forEach((opt, oi) => {
          const mark = oi === q.correctIndex ? '✓' : ' ';
          lines.push(`- [${mark}] ${opt}`);
        });
        lines.push(`> **Çözüm & Hoca Notu:** ${q.explanation}`);
      });
    }

    if (personalNotes.length > 0) {
      lines.push(`\n---\n## Kişisel Zaman Damgalı Notlarım`);
      personalNotes.forEach(pn => {
        lines.push(`- **[Bölüm ${pn.sceneIndex + 1} · ${formatTime(pn.timestampSec)}]** ${pn.text}`);
      });
    }

    const blob = new Blob([lines.filter(Boolean).join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${studio.title.toLowerCase().replace(/[^a-z0-9ğüşıöç]+/gi, '-')}-ders-notlari.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Ders özeti ve notlarınız indirildi');
  };

  const sendCoachQuestion = async (preset?: string) => {
    const text = (preset ?? coachInput).trim();
    if (!text || coachLoading) return;

    const userMsg = { role: 'user' as const, content: `[Bölüm ${activeSceneIndex + 1}: ${currentScene.title}] ${text}` };
    const nextHistory = [...coachMessages, userMsg];
    setCoachMessages(nextHistory);
    if (!preset) setCoachInput('');
    setCoachLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('study-coach', {
        body: {
          mode: 'chat',
          materialTitle: material.title,
          materialType: 'video',
          course: material.course || undefined,
          materialContent: material.content,
          messages: nextHistory,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCoachMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e: any) {
      toast.error(e?.message || 'Akıl Hocası şu an yanıt veremedi.');
      setCoachMessages(prev => prev.slice(0, -1));
    } finally {
      setCoachLoading(false);
      setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  };

  // Seçilen Türkçe Neural Anlatıcı Sesini Anında Önizleme ("Dinle")
  const handlePreviewVoice = async (spk: Speaker) => {
    if (previewingSpeaker) return;
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    }
    setPreviewingSpeaker(spk);
    try {
      await previewSpeakerVoice(speakerVoices[spk], spk, isMuted ? 0.9 : Math.max(0.25, volume));
    } catch {
      toast.error('Ses önizlemesi şu an başlatılamadı.');
    } finally {
      setPreviewingSpeaker(null);
    }
  };

  const elapsedBeforeCurrent = scenes.slice(0, activeSceneIndex).reduce((a, s) => a + s.durationSec, 0);
  const totalElapsedSec = elapsedBeforeCurrent + elapsedSceneTime;

  const filteredTerms = useMemo(() => {
    const q = termQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return allTerms;
    return allTerms.filter(
      t =>
        t.term.toLocaleLowerCase('tr-TR').includes(q) ||
        t.definition.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [allTerms, termQuery]);

  const openPracticeWrapUp = () => {
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    }
    setVoiceMenuOpen(false);
    setWrapUpOpen(true);
  };

  const studioElement = (
    <div
      ref={containerRef}
      className="pointer-events-auto fixed inset-0 z-[200] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#050811] text-slate-100 select-none font-sans"
    >
      {/* 1. MODERN SİNEMATİK ÜST ÇUBUK — Sol Üst Saf Beyaz EconNotes Logolu, Sıfır 1080p Yazısı */}
      <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#070b16]/95 px-3 sm:px-5 backdrop-blur-xl">
        {/* Sol: Beyaz EconNotes Logosu + Çıkış + Başlık */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center px-1" title="EconNotes Çalışma Stüdyosu">
            <EconLogo allWhite className="h-6 sm:h-7 w-auto" />
          </div>

          <div className="h-5 w-px bg-white/[0.12] hidden sm:block" />

          {onClose && (
            <button
              onClick={onClose}
              className="group flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] px-2.5 text-xs font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
              title="Stüdyodan Çık (Esc)"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden md:inline">Stüdyodan Çık</span>
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {material.course && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-300 ring-1 ring-inset ring-cyan-400/25">
                  <span className={`h-1.5 w-1.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
                  {material.course}
                </span>
              )}
              <span className="hidden lg:inline text-[11px] text-slate-400">
                {DIAGRAM_BADGE_TR[currentScene.diagram.type]}
              </span>
            </div>
            <h1 className="truncate text-sm font-semibold tracking-tight text-white sm:text-[15px]">
              {studio.title}
            </h1>
          </div>
        </div>

        {/* Sağ: Akademik Araçlar */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Ders Sonu Eşleştirme & Sınav Soruları */}
          <button
            onClick={openPracticeWrapUp}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition ${
              wrapUpOpen
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-400/50 hover:bg-cyan-500/20'
            }`}
            title="Kavram Eşleştirme ve Hocanın Sorabileceği Sorular"
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden md:inline">Eşleştirme & Sınav</span>
          </button>

          {/* Ses Ayarları Menüsü */}
          <div ref={voiceMenuRef} className="relative">
            <button
              onClick={() => setVoiceMenuOpen(o => !o)}
              className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs transition ${
                voiceMenuOpen
                  ? 'border-white/25 bg-white/[0.09] text-white'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
              }`}
              title="Ses Ayarları"
            >
              {vitsStatus.state === 'downloading' || vitsStatus.state === 'compiling' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              ) : (
                <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
              )}
              <span className="hidden xl:inline">Ses Ayarları</span>
            </button>

            {voiceMenuOpen && (
              <div className="absolute right-0 top-10 z-50 w-80 sm:w-[340px] rounded-2xl border border-white/10 bg-[#0b1120]/98 p-4 shadow-2xl backdrop-blur-xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white">Ses Ayarları</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Dr. Deniz ve Barış anlatıcı sesleri
                    </p>
                  </div>
                  <button
                    onClick={() => setVoiceMenuOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {(vitsStatus.state === 'downloading' || vitsStatus.state === 'compiling') && (
                  <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-cyan-200">
                      <span>Ses paketi yükleniyor...</span>
                      <span className="font-mono">%{vitsStatus.progressPct}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                      <div
                        className="h-full rounded-full bg-cyan-400 transition-all duration-200"
                        style={{ width: `${vitsStatus.progressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div>
                    <div className="font-medium text-slate-100">Yüksek Kalite Stüdyo Sesi</div>
                    <div className="text-[10px] text-slate-400">Temiz ve akıcı Türkçe seslendirme</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferCloudNeural}
                    onChange={e => setPreferCloudNeural(e.target.checked)}
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                <div className="space-y-2.5 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-cyan-300">
                        Dr. Deniz (Anlatıcı)
                      </label>
                      <button
                        type="button"
                        onClick={() => handlePreviewVoice('Deniz')}
                        disabled={previewingSpeaker !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
                      >
                        {previewingSpeaker === 'Deniz' ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Headphones className="h-2.5 w-2.5" />
                        )}
                        <span>Dinle</span>
                      </button>
                    </div>
                    <select
                      value={preferredDenizVoice}
                      onChange={e => setPreferredDenizVoice(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="">Varsayılan ({speakerVoices.Deniz.label})</option>
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.cleanName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-purple-300">
                        Barış (Soru Soran)
                      </label>
                      <button
                        type="button"
                        onClick={() => handlePreviewVoice('Barış')}
                        disabled={previewingSpeaker !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200 transition hover:bg-purple-500/20 disabled:opacity-50"
                      >
                        {previewingSpeaker === 'Barış' ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Headphones className="h-2.5 w-2.5" />
                        )}
                        <span>Dinle</span>
                      </button>
                    </div>
                    <select
                      value={preferredBarisVoice}
                      onChange={e => setPreferredBarisVoice(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">Varsayılan ({speakerVoices.Barış.label})</option>
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.cleanName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Ses Seviyesi</span>
                    <span>%{Math.round((isMuted ? 0 : volume) * 100)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      if (v > 0 && isMuted) setIsMuted(false);
                    }}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Zaman Damgalı Anlık Not Al */}
          <button
            onClick={() => setNoteComposerOpen(o => !o)}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-slate-200 transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200"
            title="Bu saniyeye kişisel not veya yer imi ekle"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden lg:inline">Not Ekle</span>
          </button>

          {/* Ders Özeti (.md) İndir */}
          <button
            onClick={handleDownloadStudySheet}
            className="hidden md:flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
            title="Tüm ders notlarını ve soruları indir (.md)"
          >
            <FileDown className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden xl:inline">Notları İndir</span>
          </button>

          {/* Yan Panel Aç/Kapat */}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition ${
              sidebarOpen
                ? 'border-cyan-500/40 bg-cyan-500/12 text-cyan-200'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
            }`}
            title="Ders Notları ve Bilgi Panelini Aç/Kapat"
          >
            {sidebarOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Ders Notları</span>
          </button>

          {/* Tam Ekran */}
          <button
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            title={isFullscreen ? 'Tam Ekrandan Çık (F)' : 'Tam Ekran (F)'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          {/* Bildir */}
          {onReport && (
            <button
              onClick={onReport}
              className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
              title="Hata Bildir"
            >
              <Bug className="h-3.5 w-3.5" />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="flex sm:hidden h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-rose-500/20 hover:text-rose-300"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Hızlı Zaman Damgalı Not Ekleme Çubuğu */}
      {noteComposerOpen && (
        <div className="z-30 flex items-center gap-2 border-b border-amber-500/25 bg-amber-950/30 px-4 py-2 backdrop-blur-md">
          <span className="shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
            Bölüm {activeSceneIndex + 1} · {formatTime(elapsedSceneTime)}
          </span>
          <input
            type="text"
            autoFocus
            value={quickNoteDraft}
            onChange={e => setQuickNoteDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addPersonalBookmark();
              if (e.key === 'Escape') setNoteComposerOpen(false);
            }}
            placeholder="Bu anla ilgili kendi ders notunuzu yazın (boş bırakırsanız bölümün önemli notu kaydedilir)..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-400 focus:outline-none"
          />
          <Button
            size="sm"
            onClick={addPersonalBookmark}
            className="h-7 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Kaydet
          </Button>
          <button onClick={() => setNoteComposerOpen(false)} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. ANA ÇALIŞMA ALANI: SİNEMA SAHNESİ + YAN DERS NOTLARI PANELİ */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* SOL/MERKEZ: SİNEMA SAHNESİ VE KONTROL PANELİ */}
        <div className="relative flex flex-1 min-w-0 flex-col bg-[#050811]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 transition-all duration-700"
            style={{
              background:
                liveSpeaker === 'Deniz'
                  ? 'radial-gradient(circle at 30% 45%, rgba(34,211,238,0.12), transparent 65%)'
                  : 'radial-gradient(circle at 70% 45%, rgba(168,85,247,0.12), transparent 65%)',
            }}
          />

          {/* 16:9 Tuval Alanı — Platform İçi Korumalı Özel Stüdyo Oynatıcısı */}
          <div
            onContextMenu={e => e.preventDefault()}
            className="relative flex flex-1 min-h-0 items-center justify-center p-2 sm:p-4 lg:p-5"
          >
            <div className="relative aspect-video w-full max-h-full max-w-[1480px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#040710] shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
              <canvas
                ref={canvasRef}
                width={STAGE_W}
                height={STAGE_H}
                onClick={togglePlay}
                className="block h-full w-full cursor-pointer object-contain"
              />

              {/* Sade Video Yükleme Katmanı */}
              {(isPreparingAudio || isBuffering) && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#040710]/82 backdrop-blur-md px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/15 text-cyan-300 shadow-[0_0_36px_rgba(34,211,238,0.24)]">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                  <p className="mt-4 text-sm sm:text-base font-semibold tracking-tight text-white">
                    Video yükleniyor lütfen bekleyiniz
                  </p>
                  {(vitsStatus.state === 'downloading' || vitsStatus.state === 'compiling') && (
                    <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-200"
                        style={{ width: `${Math.max(10, vitsStatus.progressPct)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* İlk Başlangıç Kapak Katmanı */}
              {!hasStartedOnce && !isPreparingAudio && (
                <div
                  onClick={togglePlay}
                  className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-gradient-to-t from-[#040710]/85 via-[#040710]/40 to-transparent backdrop-blur-[1.5px] transition-all"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-slate-950 shadow-[0_0_50px_rgba(34,211,238,0.45)] transition-transform duration-300 group-hover:scale-110">
                    <Play className="ml-1 h-8 w-8 fill-slate-950" />
                  </div>
                  <div className="mt-4 text-center px-4">
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Dersi Başlat
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-300">
                      {scenes.length} Bölüm · {formatTime(totalDurationSec)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ALT KONTROL DOCK & BÖLÜMLÜ ZAMAN ÇİZELGESİ */}
          <div className="relative z-20 shrink-0 border-t border-white/[0.07] bg-[#070b16]/95 px-4 py-2.5 backdrop-blur-xl">
            {hoveredChapter !== null && scenes[hoveredChapter] && (
              <div className="mb-1 flex items-center justify-between text-[11px] text-cyan-300">
                <span className="truncate font-medium">
                  Bölüm {hoveredChapter + 1}: {scenes[hoveredChapter].title}
                </span>
                <span className="font-mono text-slate-400">{formatTime(scenes[hoveredChapter].durationSec)}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <span className="w-11 text-right font-mono text-[11px] text-slate-400">
                {formatTime(totalElapsedSec)}
              </span>

              <div className="flex flex-1 items-center gap-1">
                {scenes.map((sc, idx) => {
                  const weight = sc.durationSec / Math.max(1, totalDurationSec);
                  let fillPct = 0;
                  if (idx < activeSceneIndex) fillPct = 100;
                  else if (idx === activeSceneIndex) {
                    fillPct = Math.min(100, (elapsedSceneTime / Math.max(0.1, sc.durationSec)) * 100);
                  }

                  const scrubChapter = (clientX: number, el: HTMLDivElement) => {
                    const rect = el.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
                    goToScene(idx, ratio * sc.durationSec);
                  };

                  return (
                    <div
                      key={sc.id}
                      style={{ flexGrow: weight, flexBasis: 0 }}
                      onMouseEnter={() => setHoveredChapter(idx)}
                      onMouseLeave={() => setHoveredChapter(null)}
                      onPointerDown={e => {
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        scrubChapter(e.clientX, e.currentTarget);
                      }}
                      onPointerMove={e => {
                        if (e.buttons === 1) {
                          scrubChapter(e.clientX, e.currentTarget);
                        }
                      }}
                      className="group relative cursor-pointer py-2 touch-none"
                    >
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.12] transition-all group-hover:h-2.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-75"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <span className="w-11 font-mono text-[11px] text-slate-400">
                {formatTime(totalDurationSec)}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  onClick={() => goToScene(activeSceneIndex - 1)}
                  disabled={activeSceneIndex === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
                  title="Önceki Bölüm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  onClick={() => seekRelative(-5)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  title="5 Saniye Geri (←)"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={togglePlay}
                  disabled={isPreparingAudio}
                  className="flex h-8 items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-cyan-50 disabled:opacity-75"
                >
                  {isPreparingAudio ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-900" />
                  ) : isPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-slate-950" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-slate-950 ml-0.5" />
                  )}
                  <span>{isPreparingAudio ? 'Yükleniyor' : isPlaying ? 'Duraklat' : 'Oynat'}</span>
                </button>

                <button
                  onClick={() => seekRelative(5)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  title="5 Saniye İleri (→)"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={() => goToScene(activeSceneIndex + 1)}
                  disabled={activeSceneIndex === scenes.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
                  title="Sonraki Bölüm"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div className="mx-1 h-4 w-px bg-white/[0.08]" />

                <button
                  onClick={() => setIsMuted(m => !m)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  title={isMuted ? 'Sesi Aç (M)' : 'Sesi Kapat (M)'}
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => setShowSubtitles(s => !s)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/[0.08] ${
                    showSubtitles ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                  title="Altyazı Aç/Kapat (C)"
                >
                  <Subtitles className="h-4 w-4" />
                </button>
              </div>

              <div className="hidden lg:flex min-w-0 items-center gap-2 text-xs">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    liveSpeaker === 'Deniz'
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'bg-purple-500/15 text-purple-300'
                  }`}
                >
                  {liveSpeaker === 'Deniz' ? 'Dr. Deniz' : 'Barış'}
                </span>
                <span className="truncate max-w-md font-medium text-slate-200">
                  {activeSceneIndex + 1}/{scenes.length} · {currentScene.title}
                </span>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-0.5">
                {[0.85, 1.0, 1.15, 1.3].map(spd => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`rounded-lg px-2 py-1 font-mono text-[11px] transition ${
                      playbackSpeed === spd
                        ? 'bg-cyan-500/20 font-semibold text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mobil/Tablet Yan Panel Arka Plan Örtüsü */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/60 backdrop-blur-[1px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* SAĞ ÇALIŞMA PANELİ */}
        {sidebarOpen && (
          <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[400px] lg:static lg:w-[410px] xl:w-[430px] shrink-0 flex-col border-l border-white/[0.08] bg-[#080d1a]/98 backdrop-blur-2xl shadow-2xl lg:shadow-none">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#060a14] px-3.5 py-2 lg:hidden">
              <span className="text-xs font-semibold text-slate-200">Ders Notları ve Pekiştirme</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1 border-b border-white/[0.07] bg-[#060a14] p-2">
              {[
                { id: 'notes', label: 'Notlar', icon: BookOpen },
                { id: 'terms', label: 'Kavramlar', icon: Lightbulb },
                { id: 'facts', label: 'Hap Bilgi', icon: GraduationCap },
                { id: 'playlist', label: 'Bölümler', icon: ListOrdered },
                { id: 'coach', label: 'Akıl Hocası', icon: Wand2 },
              ].map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition ${
                      active
                        ? 'bg-white/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-400/30 font-semibold'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-b border-white/[0.07] bg-[#070c18] px-3.5 py-2.5">
              <button
                onClick={openPracticeWrapUp}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-purple-500/10 px-3 py-2 text-left transition hover:border-cyan-400/50 hover:from-cyan-500/20"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                    <Trophy className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">
                      Kavram Eşleştirme & Sınav Soruları
                    </p>
                    <p className="truncate text-[10px] text-slate-300">
                      {matchingPairs.length} eşleştirme · {examQuestions.length} hocanın sorabileceği soru
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-cyan-300" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-cyan-400">
                        Bölüm {activeSceneIndex + 1} / {scenes.length}
                      </span>
                      <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-300">
                        {DIAGRAM_BADGE_TR[currentScene.diagram.type]}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold text-white leading-snug">
                      {currentScene.title}
                    </h3>
                  </div>

                  {currentScene.examTip && (
                    <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/12 to-orange-500/5 p-3.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Sınav Odak Noktası</span>
                      </div>
                      <p className="text-xs leading-relaxed text-amber-100/95">
                        {currentScene.examTip}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Önemli Ders Notları
                      </h4>
                      <button
                        onClick={handleDownloadStudySheet}
                        className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
                      >
                        Tümünü İndir (.md)
                      </button>
                    </div>

                    {currentScene.keyTakeaways.map((note, idx) => (
                      <div
                        key={idx}
                        className="group flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:border-cyan-500/30 hover:bg-white/[0.04]"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <p className="flex-1 text-xs leading-relaxed text-slate-200">{note}</p>
                        <button
                          onClick={() => copyText(note, `tk-${idx}`)}
                          className="opacity-0 transition group-hover:opacity-100 text-slate-400 hover:text-white"
                          title="Kopyala"
                        >
                          {copiedId === `tk-${idx}` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Kişisel Zaman Damgalı Notlar */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Kişisel Yer İmlerim ({personalNotes.length})
                      </h4>
                      <button
                        onClick={() => setNoteComposerOpen(true)}
                        className="text-[11px] font-medium text-amber-300 hover:text-amber-200"
                      >
                        + Yeni Not Ekle
                      </button>
                    </div>

                    {personalNotes.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/[0.08] p-3 text-[11px] text-slate-400 leading-relaxed">
                        Dersi izlerken üstteki <strong>Not Ekle</strong> butonuna basarak önemli anları zaman damgasıyla buraya kaydedebilirsiniz.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {personalNotes.map(pn => (
                          <div
                            key={pn.id}
                            className="group rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-2.5 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => goToScene(pn.sceneIndex, pn.timestampSec)}
                                className="font-mono text-[10px] font-semibold text-amber-300 hover:underline"
                              >
                                ▶ Bölüm {pn.sceneIndex + 1} · {formatTime(pn.timestampSec)}
                              </button>
                              <button
                                onClick={() => removePersonalNote(pn.id)}
                                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition"
                                title="Sil"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-200 leading-relaxed">{pn.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Karşılıklı Diyalog Dökümü */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Stüdyo Diyalog Dökümü
                    </h4>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 text-xs leading-relaxed">
                      {currentScene.sentences.map((sent, sIdx) => {
                        const isCur = sIdx === speechSyncRef.current.sentenceIndex && hasStartedOnce;
                        const spk = currentScene.sentenceSpeakers?.[sIdx] || currentScene.speaker;
                        return (
                          <div
                            key={sIdx}
                            onClick={() => {
                              const charOffset = currentScene.sentenceOffsets[sIdx] || 0;
                              const ratio = charOffset / Math.max(1, currentScene.totalChars);
                              goToScene(activeSceneIndex, ratio * currentScene.durationSec);
                            }}
                            className={`cursor-pointer rounded-xl px-2.5 py-1.5 transition ${
                              isCur
                                ? 'bg-cyan-500/15 text-white font-medium ring-1 ring-cyan-400/30'
                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                            }`}
                          >
                            <span
                              className={`mr-1.5 text-[10px] font-bold uppercase ${
                                spk === 'Deniz' ? 'text-cyan-300' : 'text-purple-300'
                              }`}
                            >
                              {spk === 'Deniz' ? 'Dr. Deniz:' : 'Barış:'}
                            </span>
                            <span>{sent}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'terms' && (
                <div className="space-y-3">
                  <Input
                    value={termQuery}
                    onChange={e => setTermQuery(e.target.value)}
                    placeholder="Kavram veya tanım ara..."
                    className="h-8 border-white/10 bg-white/[0.03] text-xs text-white placeholder:text-slate-500"
                  />

                  <div className="space-y-2.5">
                    {filteredTerms.map((item, idx) => {
                      const isCurrentChapter = item.sceneIdx === activeSceneIndex;
                      return (
                        <div
                          key={idx}
                          onClick={() => goToScene(item.sceneIdx)}
                          className={`cursor-pointer rounded-2xl border p-3.5 transition space-y-1.5 ${
                            isCurrentChapter
                              ? 'border-cyan-500/35 bg-cyan-500/[0.07]'
                              : 'border-white/[0.07] bg-white/[0.025] hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-cyan-300">{item.term}</span>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
                              Bölüm {item.sceneIdx + 1}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-slate-300">{item.definition}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'facts' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-purple-400/25 bg-purple-500/10 p-3.5">
                    <h4 className="text-xs font-bold text-purple-200">
                      Sınav Öncesi Kritik Bilgiler
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                      Ders notunun tamamından süzülen, sınavlarda doğrudan yoklanan kilit tarih, kurum ve ilkeler:
                    </p>
                  </div>

                  <div className="space-y-2">
                    {keyFacts.map((fact, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-500/20 font-mono text-[11px] font-bold text-purple-300">
                          {idx + 1}
                        </span>
                        <p className="text-xs leading-relaxed text-slate-200">{fact}</p>
                      </div>
                    ))}
                  </div>

                  {searches.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        İleri Okuma & Kaynak Aramaları
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {searches.map((sq, i) => (
                          <a
                            key={i}
                            href={`https://www.google.com/search?q=${encodeURIComponent(sq)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-300"
                          >
                            <span>{sq}</span>
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'playlist' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
                    <span>Toplam {scenes.length} Bölüm</span>
                    <span className="font-mono font-semibold text-cyan-300">{formatTime(totalDurationSec)}</span>
                  </div>

                  {scenes.map((sc, idx) => {
                    const isAct = idx === activeSceneIndex;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => goToScene(idx)}
                        className={`w-full text-left rounded-2xl border p-3 transition flex items-start gap-3 ${
                          isAct
                            ? 'border-cyan-400/50 bg-cyan-500/12 shadow-sm'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            isAct
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-white/[0.06] text-slate-300'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                              {DIAGRAM_BADGE_TR[sc.diagram.type]}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {formatTime(sc.durationSec)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-100 leading-snug">
                            {sc.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
                            {sc.narration}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeTab === 'coach' && (
                <div className="flex h-[calc(100dvh-230px)] min-h-[340px] flex-col">
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {coachMessages.map((m, i) => (
                      <div
                        key={i}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-cyan-600 text-white rounded-br-sm'
                              : 'border border-white/[0.08] bg-white/[0.04] text-slate-200 rounded-bl-sm'
                          }`}
                        >
                          {m.role === 'assistant' ? (
                            <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-li:my-0.5">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <p>{m.content}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {coachLoading && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-xs text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                          <span>Yanıt hazırlanıyor...</span>
                        </div>
                      </div>
                    )}
                    <div ref={coachEndRef} />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-2.5">
                    {[
                      'Bu bölümü örnek senaryoyla anlat',
                      'Sınavda nasıl sorulur?',
                      '3 kısa test sorusu sor',
                    ].map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => sendCoachQuestion(prompt)}
                        disabled={coachLoading}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={coachInput}
                      onChange={e => setCoachInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendCoachQuestion();
                        }
                      }}
                      placeholder="Bu bölümle ilgili bir soru sor..."
                      disabled={coachLoading}
                      className="h-9 flex-1 border-white/10 bg-white/[0.03] text-xs text-white placeholder:text-slate-500"
                    />
                    <Button
                      size="sm"
                      onClick={() => sendCoachQuestion()}
                      disabled={coachLoading || !coachInput.trim()}
                      className="h-9 rounded-xl bg-cyan-500 px-3 text-slate-950 hover:bg-cyan-400"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {wrapUpOpen && (
          <LessonWrapUp
            title={studio.title}
            courseLabel={material.course || undefined}
            scenes={scenes}
            matchingPairs={matchingPairs}
            examQuestions={examQuestions}
            keyFacts={keyFacts}
            onClose={() => setWrapUpOpen(false)}
            onDownloadNotes={handleDownloadStudySheet}
            onJumpToScene={idx => {
              setWrapUpOpen(false);
              unlockStudioAudio();
              goToScene(idx, 0);
              setIsPlaying(true);
            }}
            onReplayLesson={() => {
              setWrapUpOpen(false);
              unlockStudioAudio();
              goToScene(0, 0);
              setIsPlaying(true);
            }}
          />
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(studioElement, document.body);
  }
  return studioElement;
};

export default InteractiveVideoStudio;
