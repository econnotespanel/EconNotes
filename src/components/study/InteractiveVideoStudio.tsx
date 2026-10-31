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
  Printer,
  Trash2,
  ExternalLink,
  ArrowLeft,
  GraduationCap,
  Headphones,
  Trophy,
  Activity,
  Star,
  Edit2,
  PictureInPicture,
  Layout,
  Network,
  Brain,
  Search,
  Mic,
  MicOff,
  Eye,
  ChevronUp,
  Sliders,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import EconLogo from '@/components/EconLogo';
import LessonWrapUp from './video/LessonWrapUp';
import InteractiveEconomicsLab from './video/InteractiveEconomicsLab';
import ConceptKnowledgeMap from './video/ConceptKnowledgeMap';
import SpacedRepetitionFlashcards from './video/SpacedRepetitionFlashcards';
import SearchTranscriptModal from './video/SearchTranscriptModal';
import AccessibilityDialog, { AccessibilitySettings } from './video/AccessibilityDialog';
import {
  downloadVideoStudyNotes,
  printVideoStudyNotesPdf,
} from './video/exportVideoStudyNotes';
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
  favorite?: boolean;
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
  const { isAdmin } = useAuth();

  // 1. Ders içeriği modeli (en az 5+ dakika zengin çok-modlu ders)
  const studio = useMemo<StudioContent>(() => {
    return buildStudioContent(material.content, material.title, material.course || '');
  }, [material.content, material.title, material.course]);

  const { scenes, totalDurationSec, keyFacts, searches, examQuestions, matchingPairs } = studio;

  // 2. Oynatıcı durumları
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [completedScenes, setCompletedScenes] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`econnotes_completed_scenes_${material.id}`);
      return raw ? new Set(JSON.parse(raw)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });
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
  const [layoutMode, setLayoutMode] = useState<'standard' | 'whiteboard' | 'focus'>('standard');
  const [simLabOpen, setSimLabOpen] = useState<boolean>(false);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTab, setActiveTab] = useState<'notes' | 'terms' | 'facts' | 'playlist' | 'coach'>('notes');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [termQuery, setTermQuery] = useState('');
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null);
  const [hoveredChapterInfo, setHoveredChapterInfo] = useState<{
    chapterIdx: number;
    timeSec: number;
    clientX: number;
  } | null>(null);

  // Otomatik kaydedilen son ilerleme ve kaldığın yerden devam etme durumu
  const [resumePrompt, setResumePrompt] = useState<{ sceneIndex: number; timeSec: number } | null>(() => {
    try {
      const raw = localStorage.getItem(`econnotes_studio_progress_${material.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.sceneIndex === 'number' && (parsed.sceneIndex > 0 || parsed.timeSec > 6)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>('');
  const [personalNoteFilter, setPersonalNoteFilter] = useState<string>('');
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(notesStorageKey, JSON.stringify(personalNotes));
    } catch {
      // ignore quota error
    }
  }, [personalNotes, notesStorageKey]);

  // 6. Gelişmiş Öğrenme Teknolojileri & Yeni Nesil Durumlar
  // Yalnızca Mikroekonomi, Makroekonomi ve sayısal/analitik iktisat derslerinde laboratuvarı aktifleştir
  const isEconomicsLabApplicable = useMemo(() => {
    const combined = `${material.course || ''} ${material.title || ''} ${studio.title || ''}`.toLocaleLowerCase('tr-TR');
    const matchesAnalyticalEcon = [
      'mikro',
      'makro',
      'micro',
      'macro',
      'fiyat teorisi',
      'tüketici teorisi',
      'üretici teorisi',
      'piyasa dengesi',
      'para banka',
      'para teorisi',
      'enflasyon',
      'faiz teorisi',
      'iktisadi analiz',
      'ekonometri',
    ].some(term => combined.includes(term));

    const isHistoryCourse = [
      'tarih',
      'osmanlı',
      'selçuklu',
      'düşünceler tarihi',
      'iktisat tarihi',
    ].some(term => combined.includes(term));

    if (isHistoryCourse && !combined.includes('mikro') && !combined.includes('makro')) {
      return false;
    }

    return matchesAnalyticalEcon;
  }, [material.course, material.title, studio.title]);

  const [conceptMapOpen, setConceptMapOpen] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [chaptersMenuOpen, setChaptersMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight && window.innerHeight <= 550;
  });
  const chaptersMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOrientation = () => {
      const isLand = window.innerWidth > window.innerHeight && window.innerHeight <= 550;
      setIsMobileLandscape(isLand);
    };
    handleOrientation();
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (chaptersMenuRef.current && !chaptersMenuRef.current.contains(e.target as Node)) {
        setChaptersMenuOpen(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };
    if (chaptersMenuOpen || settingsMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [chaptersMenuOpen, settingsMenuOpen]);

  // Mobil ve sistem durum çubuğu rengini (theme-color ve HTML/Body arka planını) stüdyo koyu temasına (#070b16) eşitle
  useEffect(() => {
    const origHtmlBg = document.documentElement.style.backgroundColor;
    const origBodyBg = document.body.style.backgroundColor;
    const origColorScheme = document.documentElement.style.colorScheme;
    const wasDark = document.documentElement.classList.contains('dark');

    document.documentElement.classList.add('dark');
    document.documentElement.style.backgroundColor = '#070b16';
    document.body.style.backgroundColor = '#070b16';
    document.documentElement.style.colorScheme = 'dark';

    const metaThemes = document.querySelectorAll('meta[name="theme-color"]');
    const origThemes: { el: Element; val: string | null }[] = [];
    metaThemes.forEach(el => {
      origThemes.push({ el, val: el.getAttribute('content') });
      el.setAttribute('content', '#070b16');
    });

    // Mobil tarayıcı geçmişi (back swipe / donanım geri tuşu) entegrasyonu
    const handlePopState = () => {
      if (onClose) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        onClose();
      }
    };
    try {
      window.history.pushState({ econnotesStudio: true }, '');
      window.addEventListener('popstate', handlePopState);
    } catch {
      // ignore
    }

    return () => {
      if (!wasDark) {
        document.documentElement.classList.remove('dark');
      }
      document.documentElement.style.backgroundColor = origHtmlBg;
      document.body.style.backgroundColor = origBodyBg;
      document.documentElement.style.colorScheme = origColorScheme;
      origThemes.forEach(({ el, val }) => {
        if (val) el.setAttribute('content', val);
      });
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);
  const [examMode, setExamMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('econnotes_studio_exam_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [audioOnlyMode, setAudioOnlyMode] = useState<boolean>(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(() => {
    try {
      const raw = localStorage.getItem('econnotes_studio_accessibility');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      subtitleSize: 'md',
      highContrast: false,
      reduceMotion: false,
      lowDataMode: false,
      explanationLevel: 'orta',
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('econnotes_studio_accessibility', JSON.stringify(accessibilitySettings));
    } catch {}
  }, [accessibilitySettings]);

  useEffect(() => {
    try {
      localStorage.setItem('econnotes_studio_exam_mode', String(examMode));
    } catch {}
  }, [examMode]);

  const toggleVoiceQuestion = useCallback(() => {
    if (isListeningVoice) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListeningVoice(false);
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error('Sesli komut tarayıcınız tarafından desteklenmiyor.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'tr-TR';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsListeningVoice(true);
        setVoiceTranscript('');
        toast.info('Sizi dinliyorum, sorunuzu sorabilirsiniz...');
      };

      rec.onresult = (event: any) => {
        const text = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        setVoiceTranscript(text);
      };

      rec.onerror = () => {
        setIsListeningVoice(false);
      };

      rec.onend = () => {
        setIsListeningVoice(false);
        setVoiceTranscript(prev => {
          if (prev.trim()) {
            setSidebarOpen(true);
            setActiveTab('coach');
            sendCoachQuestion(prev);
          }
          return '';
        });
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListeningVoice(false);
      toast.error('Mikrofon erişimi başlatılamadı.');
    }
  }, [isListeningVoice]);

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
  const [speakingCoachIdx, setSpeakingCoachIdx] = useState<number | null>(null);

  const toggleSpeakCoach = useCallback((idx: number, markdownText: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('Tarayıcınız sesli okumayı desteklemiyor.');
      return;
    }
    if (speakingCoachIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingCoachIdx(null);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = markdownText
      .replace(/[*_#`[\]()]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();
    if (!clean) return;

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'tr-TR';
    utter.rate = 1.05;
    const trVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('tr'));
    if (trVoice) utter.voice = trVoice;

    utter.onend = () => setSpeakingCoachIdx(null);
    utter.onerror = () => setSpeakingCoachIdx(null);
    setSpeakingCoachIdx(idx);
    window.speechSynthesis.speak(utter);
  }, [speakingCoachIdx]);

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
          markSceneCompleted(sceneIdx);
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

  const togglePiP = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = pipVideoRef.current;
    if (!canvas || !video) return;

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      return;
    }

    try {
      if (!video.srcObject) {
        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
        if (stream) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
      }
      if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {
      toast.error('Resim içinde resim (PiP) bu cihazda veya tarayıcıda desteklenmiyor.');
    }
  }, []);

  // İzleme ilerlemesini düzenli aralıklarla localStorage'a kaydet (Kaldığın Yerden Devam Et desteği)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (activeSceneIndex > 0 || clockRef.current > 5) {
        try {
          localStorage.setItem(
            `econnotes_studio_progress_${material.id}`,
            JSON.stringify({
              sceneIndex: activeSceneIndex,
              timeSec: Math.floor(clockRef.current),
              updatedAt: Date.now(),
            }),
          );
        } catch {
          // ignore storage quota
        }
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [material.id, activeSceneIndex]);

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
        seekRelative(10);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setVolume(v => {
          const next = Math.min(1, Math.round((v + 0.05) * 100) / 100);
          if (next > 0) setIsMuted(false);
          return next;
        });
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setVolume(v => Math.max(0, Math.round((v - 0.05) * 100) / 100));
      } else if (e.code === 'KeyM') {
        setIsMuted(m => !m);
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      } else if (e.code === 'KeyC') {
        setShowSubtitles(s => !s);
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        togglePiP();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekRelative, toggleFullscreen, togglePiP, onClose, voiceMenuOpen, wrapUpOpen]);

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
    layoutMode,
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
    layoutMode,
    accessibilitySettings,
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
        layoutMode: live.layoutMode,
        subtitleSize: live.accessibilitySettings?.subtitleSize || 'md',
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
      favorite: false,
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
    toast.success('Not silindi');
  };

  const toggleNoteFavorite = (id: string) => {
    setPersonalNotes(prev =>
      prev.map(n => (n.id === id ? { ...n, favorite: !n.favorite } : n)),
    );
  };

  const updatePersonalNoteText = (id: string, newText: string) => {
    if (!newText.trim()) return;
    setPersonalNotes(prev =>
      prev.map(n => (n.id === id ? { ...n, text: newText.trim() } : n)),
    );
    setEditingNoteId(null);
    setEditingNoteText('');
    toast.success('Not güncellendi');
  };

  const filteredPersonalNotes = useMemo(() => {
    const q = personalNoteFilter.trim().toLocaleLowerCase('tr-TR');
    return personalNotes.filter(n => {
      if (!q) return true;
      return (
        n.text.toLocaleLowerCase('tr-TR').includes(q) ||
        n.sceneTitle.toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [personalNotes, personalNoteFilter]);

  const markSceneCompleted = useCallback((idx: number) => {
    setCompletedScenes(prev => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      try {
        localStorage.setItem(`econnotes_completed_scenes_${material.id}`, JSON.stringify(Array.from(next)));
      } catch {
        // ignore storage quota
      }
      return next;
    });
  }, [material.id]);

  const handleDownloadStudySheet = () => {
    downloadVideoStudyNotes({
      studio,
      courseName: material.course || undefined,
      userNotes: personalNotes.map(pn => ({
        id: pn.id,
        sceneIndex: pn.sceneIndex,
        timeLabel: formatTime(pn.timestampSec),
        text: pn.text,
      })),
    });
    toast.success('Renkli & Baskıya Hazır Ders Notu İndirildi');
  };

  const handlePrintStudySheet = () => {
    printVideoStudyNotesPdf({
      studio,
      courseName: material.course || undefined,
      userNotes: personalNotes.map(pn => ({
        id: pn.id,
        sceneIndex: pn.sceneIndex,
        timeLabel: formatTime(pn.timestampSec),
        text: pn.text,
      })),
    });
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
      className={`pointer-events-auto fixed inset-0 z-[200] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#070b16] text-slate-100 select-none font-sans pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] ${
        accessibilitySettings.highContrast ? 'contrast-125 saturate-110' : ''
      } ${accessibilitySettings.reduceMotion ? '[&_*]:transition-none [&_*]:animate-none' : ''}`}
    >
      {/* 1. MODERN SİNEMATİK ÜST ÇUBUK — Turkuaz & Koyu Tema Uyumlu */}
      <header className={`relative z-30 flex ${isMobileLandscape ? 'h-10 px-2 sm:px-3' : 'h-14 px-2.5 sm:px-5'} shrink-0 items-center justify-between gap-2 sm:gap-3 border-b border-cyan-500/20 bg-gradient-to-r from-[#060a16] via-[#070b16] to-[#080e1e] backdrop-blur-xl shadow-xs shadow-cyan-500/5`}>
        {/* Üst İnce Neon Çizgi (Üst Bar Tema Vurgusu) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        {/* Sol: Çıkış / Geri Dön + EconNotes Marka Logosu (Asla sıkışmaz, shrink-0) */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {onClose && (
            <button
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                onClose();
              }}
              className={`group flex ${isMobileLandscape ? 'h-7 px-2' : 'h-9 px-2 sm:px-2.5'} shrink-0 items-center gap-1 rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:text-white active:scale-95 touch-manipulation shadow-xs shadow-cyan-500/5`}
              title="Stüdyodan Çık (Geri)"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 text-cyan-400 shrink-0" />
              <span className="text-xs font-semibold">Geri</span>
            </button>
          )}

          <div className="flex items-center shrink-0 max-h-8 max-w-[140px] overflow-hidden" title="EconNotes Çalışma Stüdyosu">
            <EconLogo onDark className={isMobileLandscape ? 'h-5 w-20 sm:h-6 sm:w-24 shrink-0' : 'h-6 w-24 sm:h-7 sm:w-28 shrink-0'} />
          </div>
        </div>

        {/* Orta: Ders Başlığı (Masaüstü ve tablette görünür, mobilde gizlenir) */}
        <div className={`${isMobileLandscape ? 'hidden' : 'hidden md:flex'} min-w-0 flex-1 items-center px-3 cursor-pointer overflow-hidden`} onClick={() => setChaptersMenuOpen(true)}>
          <div className="h-5 w-px bg-cyan-500/25 mr-3 shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <h1 className="truncate text-xs sm:text-sm font-semibold tracking-tight text-white hover:text-cyan-300 transition" title={studio.title}>
              {studio.title}
            </h1>
            <p className="truncate text-[10px] sm:text-[11px] text-slate-400">
              Bölüm {activeSceneIndex + 1}/{scenes.length}: {currentScene.title}
            </p>
          </div>
        </div>

        {/* Sağ: Sınav Modu, Podcast, Ders Notları, Göz ve En Sağda Arama */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Sınav Modu Toggle */}
          <button
            onClick={() => {
              setExamMode(m => {
                const next = !m;
                toast.success(next ? 'Sınav Hazırlık Modu Açıldı: Formüller ve püf noktalar öne çıkarıldı' : 'Normal Çalışma Moduna Dönüldü');
                return next;
              });
            }}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2 sm:px-2.5 text-xs font-semibold transition active:scale-95 touch-manipulation whitespace-nowrap ${
              examMode
                ? 'border-amber-400 bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50 shadow-xs'
                : `border-cyan-500/20 bg-cyan-500/5 text-slate-300 hover:border-amber-400/40 hover:text-amber-200 ${isMobileLandscape ? 'hidden' : 'hidden sm:flex'}`
            }`}
            title="Sınav Hazırlık Modu: Kritik bilgiler ve sınav sorularını öne çıkarır"
          >
            <Sparkles className={`h-3.5 w-3.5 shrink-0 ${examMode ? 'text-amber-300 fill-amber-300' : 'text-amber-400'}`} />
            <span className="hidden sm:inline">Sınav Modu</span>
          </button>

          {/* Podcast / Sesli Ders Modu Toggle */}
          <button
            onClick={() => {
              setAudioOnlyMode(m => {
                const next = !m;
                toast.info(next ? 'Podcast & Sesli Ders Modu: Ekran ve batarya tasarrufu aktif' : 'Stüdyo Görsel Moduna Dönüldü');
                return next;
              });
            }}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2 sm:px-2.5 text-xs font-semibold transition active:scale-95 touch-manipulation whitespace-nowrap ${
              audioOnlyMode
                ? 'border-purple-400 bg-purple-500/20 text-purple-200 ring-1 ring-purple-400/50 shadow-xs'
                : `border-cyan-500/20 bg-cyan-500/5 text-slate-300 hover:border-purple-400/40 hover:text-purple-200 ${isMobileLandscape ? 'hidden' : 'hidden sm:flex'}`
            }`}
            title="Podcast ve Sesli Ders Modu (Ekran ve Batarya Tasarrufu)"
          >
            <Headphones className="h-3.5 w-3.5 shrink-0 text-purple-400" />
            <span className="hidden sm:inline">Podcast</span>
          </button>

          {/* Yan Panel Aç/Kapat (Ders Notları) */}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className={`flex ${isMobileLandscape ? 'h-7 px-2' : 'h-9 px-2.5'} items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition active:scale-95 touch-manipulation ${
              sidebarOpen
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-xs shadow-cyan-500/20'
                : 'border-cyan-500/25 bg-cyan-500/8 text-slate-200 hover:border-cyan-400/40 hover:bg-cyan-500/15 hover:text-white'
            }`}
            title="Ders Notları ve Bilgi Panelini Aç/Kapat"
          >
            {sidebarOpen ? <PanelRightClose className="h-3.5 w-3.5 shrink-0 text-cyan-300" /> : <PanelRightOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400" />}
            <span className={isMobileLandscape ? 'hidden' : 'hidden md:inline'}>Ders Notları</span>
          </button>

          {/* Ses Ayarları Menüsü — YALNIZCA YÖNETİCİLERE AÇIK VE YALNIZCA BÜYÜK EKRANDA GÖRÜNÜR */}
          {isAdmin && (
            <div ref={voiceMenuRef} className="relative hidden xl:block">
              <button
                onClick={() => setVoiceMenuOpen(o => !o)}
                className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs transition ${
                  voiceMenuOpen
                    ? 'border-cyan-400/50 bg-cyan-500/20 text-white'
                    : 'border-cyan-500/20 bg-cyan-500/5 text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white'
                }`}
                title="Ses Ayarları (Yönetici)"
              >
                {vitsStatus.state === 'downloading' || vitsStatus.state === 'compiling' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                ) : (
                  <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
                )}
                <span className="hidden xl:inline">Ses Ayarları</span>
              </button>

              {voiceMenuOpen && (
                <div
                  style={{ backgroundColor: '#0a0f1d' }}
                  className="absolute right-0 top-10 z-[60] w-80 sm:w-[340px] rounded-2xl border border-white/[0.14] bg-[#0a0f1d] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.95)] space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-white">Ses Ayarları (Yönetici Paneli)</span>
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
          )}

          {/* Erişilebilirlik ve Kişiselleştirme (GÖZ İŞARETİ - ARAMANIN SOLUNDA) */}
          <button
            onClick={() => setAccessibilityOpen(true)}
            className={`flex ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9'} items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/8 text-slate-200 hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:text-cyan-100 transition active:scale-95 touch-manipulation`}
            title="Erişilebilirlik ve Kişiselleştirme Tercihleri"
          >
            <Eye className="h-3.5 w-3.5 text-cyan-300" />
          </button>

          {/* Ders İçi Akıllı Arama (ARAMA BÜYÜTEÇİ - EN SAĞDA) */}
          <button
            onClick={() => setSearchModalOpen(true)}
            className={`flex ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9'} items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/12 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/25 hover:text-white transition active:scale-95 touch-manipulation shadow-xs shadow-cyan-500/10`}
            title="Ders İçi Akıllı Arama: Cümle, altyazı ve kavramlarda ara"
          >
            <Search className="h-3.5 w-3.5 text-cyan-400" />
          </button>
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
            className={`relative flex flex-1 min-h-0 items-center justify-center ${isMobileLandscape ? 'p-1 sm:p-2' : 'p-2 sm:p-4 lg:p-5'}`}
          >
            <div className="relative aspect-video w-full max-h-full max-w-[1480px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#040710] shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
              <video
                ref={pipVideoRef}
                autoPlay
                playsInline
                muted
                className="hidden pointer-events-none opacity-0 absolute"
              />

              <canvas
                ref={canvasRef}
                width={STAGE_W}
                height={STAGE_H}
                onClick={togglePlay}
                className="block h-full w-full cursor-pointer object-contain"
              />

              {/* Sınav Hazırlık Modu Aktif Rozeti */}
              {examMode && (
                <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-950/80 px-3 py-1 backdrop-blur-md text-[11px] font-bold text-amber-200 shadow-lg animate-in fade-in">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300 fill-amber-300 animate-pulse" />
                  <span>Sınav Hazırlık Modu Aktif</span>
                </div>
              )}

              {/* Podcast & Sesli Ders Modu Katmanı */}
              {audioOnlyMode && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-between bg-gradient-to-b from-[#060a16] via-[#090f24] to-[#040710] p-6 text-center select-none animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-200">
                    <Headphones className="h-3.5 w-3.5 animate-pulse text-purple-400" />
                    <span>Podcast & Sesli Ders Modu (Ekran ve Batarya Tasarrufu)</span>
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-4 my-auto">
                    <div className={`relative flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center rounded-full border-4 border-white/10 bg-[#070d1d] shadow-[0_0_60px_rgba(168,85,247,0.25)] ${isPlaying ? 'animate-pulse' : ''}`}>
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 text-slate-950 font-bold shadow-md">
                        <Headphones className="h-7 w-7 text-white" />
                      </div>
                    </div>

                    <div className="flex items-end justify-center gap-1.5 h-10">
                      {[40, 75, 55, 90, 60, 100, 70, 85, 45, 95, 65, 80].map((h, i) => (
                        <div
                          key={i}
                          className={`w-1.5 rounded-full bg-gradient-to-t from-cyan-500 to-purple-400 transition-all duration-150 ${isPlaying ? 'animate-pulse' : 'opacity-30'}`}
                          style={{ height: isPlaying ? `${Math.max(20, h * 0.9)}%` : '20%' }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="max-w-2xl w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-cyan-300">
                        {liveSpeaker === 'Deniz' ? 'Dr. Deniz (Anlatıcı)' : 'Barış (Soru Soran)'}
                      </span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        Bölüm {activeSceneIndex + 1}: {currentScene.title}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-slate-100 font-medium leading-relaxed">
                      {currentScene.sentences[speechSyncRef.current.sentenceIndex] || currentScene.narration}
                    </p>
                  </div>
                </div>
              )}

              {/* Kaldığın Yerden Devam Et Kartı - Merkezlenmiş ve arkadaki kapakla çakışmayan katman */}
              {resumePrompt && !hasStartedOnce && !isPreparingAudio && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in">
                  <div
                    style={{ backgroundColor: '#090e1c' }}
                    className="max-w-sm sm:max-w-md w-full rounded-2xl border border-cyan-400/40 bg-[#090e1c] p-4 sm:p-5 shadow-2xl space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                        <RotateCcw className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-white">Kaldığınız Yerden Devam Edin</h4>
                        <p className="mt-1 text-xs text-slate-300">
                          Daha önce <strong className="text-cyan-300">Bölüm {resumePrompt.sceneIndex + 1}</strong> ({formatTime(resumePrompt.timeSec)}) üzerinde kalmıştınız.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          const targetSec = resumePrompt.timeSec;
                          const targetScene = resumePrompt.sceneIndex;
                          setResumePrompt(null);
                          goToScene(targetScene, targetSec);
                          togglePlay();
                        }}
                        className="flex-1 rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 shadow-md text-center active:scale-95"
                      >
                        Kaldığım Yerden Devam Et
                      </button>
                      <button
                        onClick={() => {
                          setResumePrompt(null);
                          goToScene(0, 0);
                          togglePlay();
                        }}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-slate-300 hover:text-white text-center active:scale-95"
                      >
                        Baştan Başla
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sade Video Yükleme Katmanı */}
              {(isPreparingAudio || isBuffering) && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#040710]/82 backdrop-blur-md px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/15 text-cyan-300 shadow-[0_0_36px_rgba(34,211,238,0.24)]">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                  <p className="mt-4 text-sm sm:text-base font-semibold tracking-tight text-white">
                    Video yükleniyor, lütfen bekleyiniz.
                  </p>
                  {(vitsStatus.state === 'downloading' || vitsStatus.state === 'compiling') && (
                    <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-200"
                        style={{ width: `${Math.max(10, vitsStatus.progressPct)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* İlk Başlangıç Kapak Katmanı - Yalnızca devam etme kartı yokken gösterilir */}
              {!hasStartedOnce && !isPreparingAudio && !resumePrompt && (
                <div
                  onClick={togglePlay}
                  className="group absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center bg-gradient-to-t from-[#040710]/85 via-[#040710]/40 to-transparent backdrop-blur-[1.5px] transition-all"
                >
                  <div className={`flex items-center justify-center rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_50px_rgba(34,211,238,0.45)] transition-transform duration-300 group-hover:scale-110 ${
                    isMobileLandscape ? 'h-11 w-11' : 'h-16 w-16 sm:h-20 sm:w-20'
                  }`}>
                    <Play className={`fill-slate-950 ml-0.5 ${isMobileLandscape ? 'h-5 w-5' : 'h-7 w-7 sm:h-8 sm:w-8'}`} />
                  </div>
                  <div className={`${isMobileLandscape ? 'mt-1.5' : 'mt-3 sm:mt-4'} text-center px-4`}>
                    <h2 className={`font-bold text-white ${isMobileLandscape ? 'text-xs' : 'text-sm sm:text-lg'}`}>
                      Dersi Başlat
                    </h2>
                    <p className={`mt-0.5 text-slate-300 ${isMobileLandscape ? 'text-[10px]' : 'text-xs'}`}>
                      {scenes.length} Bölüm · {formatTime(totalDurationSec)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ALT KONTROL DOCK & BÖLÜMLÜ ZAMAN ÇİZELGESİ */}
          <div className={`relative z-20 shrink-0 border-t border-white/[0.07] bg-[#070b16] ${isMobileLandscape ? 'px-2 pt-1 pb-1' : 'px-3 sm:px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]'} backdrop-blur-xl`}>
            {hoveredChapterInfo && scenes[hoveredChapterInfo.chapterIdx] && (
              <div
                className="pointer-events-none absolute -top-11 z-40 -translate-x-1/2 rounded-lg border border-cyan-400/40 bg-[#060b17]/95 px-2.5 py-1 text-center shadow-xl backdrop-blur-md transition-all"
                style={{
                  left: `${Math.max(80, Math.min(typeof window !== 'undefined' ? window.innerWidth - 80 : 300, hoveredChapterInfo.clientX))}px`,
                }}
              >
                <div className="font-mono text-[11px] font-bold text-cyan-300">
                  {formatTime(hoveredChapterInfo.timeSec)}
                </div>
                <div className="max-w-[220px] truncate text-[10px] text-slate-300">
                  Bölüm {hoveredChapterInfo.chapterIdx + 1}: {scenes[hoveredChapterInfo.chapterIdx].title}
                </div>
              </div>
            )}

            {hoveredChapter !== null && scenes[hoveredChapter] && !hoveredChapterInfo && (
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
                      onMouseLeave={() => {
                        setHoveredChapter(null);
                        setHoveredChapterInfo(null);
                      }}
                      onPointerDown={e => {
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        scrubChapter(e.clientX, e.currentTarget);
                      }}
                      onPointerMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
                        setHoveredChapterInfo({
                          chapterIdx: idx,
                          timeSec: ratio * sc.durationSec,
                          clientX: e.clientX,
                        });
                        if (e.buttons === 1) {
                          scrubChapter(e.clientX, e.currentTarget);
                        }
                      }}
                      className="group relative cursor-pointer py-1.5 touch-none"
                    >
                      <div className={`${isMobileLandscape ? 'h-1.5' : 'h-2'} w-full overflow-hidden rounded-full bg-slate-800/90 transition-all group-hover:h-2.5`}>
                        <div
                          className="h-full bg-cyan-400 transition-[width] duration-75"
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

            {/* Mobilde Tam Genişlikte Bölüm Seçici Çubuğu - Yatay modda gizlenir */}
            {!isMobileLandscape && (
              <div className="sm:hidden mt-1 mb-1.5">
                <button
                  onClick={() => setChaptersMenuOpen(o => !o)}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-left transition hover:border-cyan-400/40 hover:bg-white/[0.08] w-full active:scale-[0.99] touch-manipulation shadow-xs"
                >
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      liveSpeaker === 'Deniz'
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/25'
                        : 'bg-purple-500/15 text-purple-300 border border-purple-400/25'
                    }`}
                  >
                    {liveSpeaker === 'Deniz' ? 'Dr. Deniz' : 'Barış'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-100">
                      Bölüm {activeSceneIndex + 1}/{scenes.length} · {currentScene.title}
                    </p>
                  </div>
                  <ChevronUp className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${chaptersMenuOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                </button>
              </div>
            )}

            <div className={`${isMobileLandscape ? 'mt-0.5' : 'mt-1'} flex items-center justify-between gap-1.5 sm:gap-2`}>
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <button
                  onClick={() => goToScene(activeSceneIndex - 1)}
                  disabled={activeSceneIndex === 0}
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30 active:scale-95 touch-manipulation"
                  title="Önceki Bölüm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  onClick={() => seekRelative(-10)}
                  className={`flex ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9 sm:h-8 sm:w-8'} items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white active:scale-95 touch-manipulation`}
                  title="10 Saniye Geri (←)"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={togglePlay}
                  disabled={isPreparingAudio}
                  className={`flex ${isMobileLandscape ? 'h-7 px-2.5 text-[11px]' : 'h-9 sm:h-8 px-3 sm:px-3.5 text-xs'} items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 hover:from-cyan-400 hover:to-cyan-300 font-bold shadow-md shadow-cyan-500/25 transition disabled:opacity-75 active:scale-95 touch-manipulation`}
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
                  onClick={() => seekRelative(10)}
                  className={`flex ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9 sm:h-8 sm:w-8'} items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white active:scale-95 touch-manipulation`}
                  title="10 Saniye İleri (→)"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={() => goToScene(activeSceneIndex + 1)}
                  disabled={activeSceneIndex === scenes.length - 1}
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30 active:scale-95 touch-manipulation"
                  title="Sonraki Bölüm"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div className={`mx-1 h-4 w-px bg-white/[0.08] ${isMobileLandscape ? 'hidden' : 'hidden md:block'}`} />

                <div className={`${isMobileLandscape ? 'hidden' : 'hidden lg:flex'} items-center gap-1.5 group/vol`}>
                  <button
                    onClick={() => setIsMuted(m => !m)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                    title={isMuted ? 'Sesi Aç (M)' : 'Sesi Kapat (M)'}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
                  </button>
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
                    className="w-14 lg:w-18 h-1 accent-cyan-400 cursor-pointer"
                    title={`Ses Seviyesi: %${Math.round((isMuted ? 0 : volume) * 100)}`}
                  />
                </div>

                <button
                  onClick={() => setShowSubtitles(s => !s)}
                  className={`flex ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9 sm:h-8 sm:w-8'} items-center justify-center rounded-lg transition hover:bg-white/[0.08] active:scale-95 touch-manipulation ${
                    showSubtitles ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                  title="Altyazı Aç/Kapat (C)"
                >
                  <Subtitles className="h-4 w-4" />
                </button>

                <button
                  onClick={togglePiP}
                  className={`${isMobileLandscape ? 'hidden' : 'hidden md:flex'} h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.08] hover:text-white`}
                  title="Resim İçinde Resim (PiP) (P)"
                >
                  <PictureInPicture className="h-4 w-4" />
                </button>
              </div>

              {/* YouTube Tarzı Bölüm Başlığı (Tablet, Masaüstü ve Yatay Mobilde Görünür) */}
              <div className={`relative min-w-0 flex-1 max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl ${isMobileLandscape ? 'block' : 'hidden sm:block'}`}>
                <button
                  onClick={() => setChaptersMenuOpen(o => !o)}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 sm:px-2.5 ${isMobileLandscape ? 'py-0.5' : 'py-1'} text-left transition hover:border-cyan-400/40 hover:bg-white/[0.06] w-full group/chap active:scale-[0.99] touch-manipulation`}
                  title="Tüm bölümleri ve tam başlıkları görüntüle (Tıklayın)"
                >
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      liveSpeaker === 'Deniz'
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/25'
                        : 'bg-purple-500/15 text-purple-300 border border-purple-400/25'
                    }`}
                  >
                    {liveSpeaker === 'Deniz' ? 'Dr. Deniz' : 'Barış'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-100 group-hover/chap:text-cyan-200 transition">
                      {activeSceneIndex + 1}/{scenes.length} · {currentScene.title}
                    </p>
                  </div>
                  <ChevronUp className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${chaptersMenuOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                </button>
              </div>

              {/* Sağ: YouTube Tarzı Ayarlar Menüsü + Tam Ekran */}
              <div className="relative flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* YouTube Tarzı Ayarlar Popover Butonu */}
                <button
                  onClick={() => setSettingsMenuOpen(o => !o)}
                  className={`flex ${isMobileLandscape ? 'h-7 px-2' : 'h-9 sm:h-8 px-2 sm:px-2.5'} items-center gap-1.5 rounded-xl border text-xs font-medium transition active:scale-95 touch-manipulation ${
                    settingsMenuOpen
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                  title="Oynatma Seçenekleri & Ayarlar (Hız, Sunum Düzeni)"
                >
                  <Sliders className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span className="font-mono font-bold text-[11px] text-cyan-300">{playbackSpeed}x</span>
                </button>

                {/* Tam Ekran Butonu */}
                <button
                  onClick={toggleFullscreen}
                  className={`flex ${isMobileLandscape ? 'h-7 w-7' : 'h-9 w-9 sm:h-8 sm:w-8'} items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.08] hover:text-white active:scale-95 touch-manipulation`}
                  title={isFullscreen ? 'Tam Ekrandan Çık (F)' : 'Tam Ekran (F)'}
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
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
          <aside
            style={{ backgroundColor: '#080d1a' }}
            className={`absolute inset-y-0 right-0 z-30 flex ${isMobileLandscape ? 'w-80 max-w-[85vw]' : 'w-full max-w-[400px]'} lg:static lg:w-[410px] xl:w-[430px] shrink-0 flex-col border-l border-white/[0.08] bg-[#080d1a] backdrop-blur-2xl shadow-2xl lg:shadow-none`}
          >
            <div className={`flex items-center justify-between border-b border-white/[0.07] bg-[#060a14] ${isMobileLandscape ? 'px-3 py-1.5' : 'px-3.5 py-2'} lg:hidden`}>
              <span className="text-xs font-semibold text-slate-200">Ders Notları ve Pekiştirme</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`grid grid-cols-5 gap-1 border-b border-white/[0.07] bg-[#060a14] ${isMobileLandscape ? 'p-1' : 'p-2'}`}>
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
                    className={`flex flex-col items-center gap-0.5 rounded-xl ${isMobileLandscape ? 'py-1 text-[10px]' : 'py-2 text-[11px]'} font-medium transition ${
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

            {/* Pekiştirme & Çalışma Araçları: Yalnızca Notlar sekmesinde düzenli 2'li dikey grid olarak görünür */}
            {activeTab === 'notes' && (
              <div className="grid grid-cols-2 gap-2 border-b border-white/[0.07] bg-[#070c18] p-2 sm:p-2.5">
                <button
                  onClick={openPracticeWrapUp}
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-left transition hover:border-cyan-400/50 hover:bg-cyan-500/20 active:scale-95 touch-manipulation"
                  title="Kavram Eşleştirme & Sınav Soruları"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                    <Trophy className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">Eşleştirme & Test</p>
                    <p className="truncate text-[10px] text-slate-300">
                      {matchingPairs.length} çift · {examQuestions.length} soru
                    </p>
                  </div>
                </button>

                {/* İktisat Laboratuvarı: Sadece Mikro ve Makro İktisat Derslerinde Gösterilir */}
                {isEconomicsLabApplicable ? (
                  <button
                    onClick={() => setSimLabOpen(true)}
                    className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-left transition hover:border-emerald-400/50 hover:bg-emerald-500/20 active:scale-95 touch-manipulation"
                    title="İnteraktif Piyasa & İktisat Laboratuvarı"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">İktisat Labı</p>
                      <p className="truncate text-[10px] text-slate-300">Piyasa & Makro</p>
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => setSearchModalOpen(true)}
                    className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-left transition hover:border-cyan-400/50 hover:bg-cyan-500/20 active:scale-95 touch-manipulation"
                    title="Ders İçi Akıllı İçerik Arama"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                      <Search className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">Ders İçi Arama</p>
                      <p className="truncate text-[10px] text-slate-300">Kelime & Konu</p>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => setConceptMapOpen(true)}
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-left transition hover:border-purple-400/50 hover:bg-purple-500/20 active:scale-95 touch-manipulation"
                  title="Ders İçi Kavram Ağı & Bilgi Haritası"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300">
                    <Network className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">Kavram Ağı</p>
                    <p className="truncate text-[10px] text-slate-300">Görsel Harita</p>
                  </div>
                </button>

                <button
                  onClick={() => setFlashcardsOpen(true)}
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-left transition hover:border-amber-400/50 hover:from-amber-500/20 active:scale-95 touch-manipulation"
                  title="Aralıklı Tekrar & Bilgi Kartları"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                    <Brain className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">Bilgi Kartları</p>
                    <p className="truncate text-[10px] text-slate-300">Aralıklı Tekrar</p>
                  </div>
                </button>
              </div>
            )}

            <div className={`flex-1 overflow-y-auto ${isMobileLandscape ? 'p-2.5 space-y-2.5' : 'p-4 space-y-4'} [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]`}>
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

                    {currentScene.keyTakeaways.map((note, idx) => {
                      const activeTakeawayIdx = Math.min(
                        currentScene.keyTakeaways.length - 1,
                        Math.floor((elapsedSceneTime / Math.max(0.1, currentScene.durationSec)) * currentScene.keyTakeaways.length),
                      );
                      const isCurNote = isPlaying && idx === activeTakeawayIdx;
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            const fraction = idx / Math.max(1, currentScene.keyTakeaways.length);
                            goToScene(activeSceneIndex, fraction * currentScene.durationSec);
                          }}
                          className={`group flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                            isCurNote
                              ? 'border-cyan-400/70 bg-cyan-500/15 ring-1 ring-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                              : 'border-white/[0.07] bg-white/[0.025] hover:border-cyan-500/30 hover:bg-white/[0.04]'
                          }`}
                          title="Bu kavrama atlamak için tıklayın"
                        >
                          <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${isCurNote ? 'text-cyan-300 animate-pulse' : 'text-cyan-400'}`} />
                          <p className={`flex-1 text-xs leading-relaxed ${isCurNote ? 'text-white font-medium' : 'text-slate-200'}`}>{note}</p>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              copyText(note, `tk-${idx}`);
                            }}
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
                      );
                    })}
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

                    {personalNotes.length > 2 && (
                      <Input
                        value={personalNoteFilter}
                        onChange={e => setPersonalNoteFilter(e.target.value)}
                        placeholder="Notlarımda ara..."
                        className="h-7 text-[11px] border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500 mb-1"
                      />
                    )}

                    {personalNotes.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/[0.08] p-3 text-[11px] text-slate-400 leading-relaxed">
                        Dersi izlerken üstteki <strong>Not Ekle</strong> butonuna basarak önemli anları zaman damgasıyla buraya kaydedebilirsiniz.
                      </p>
                    ) : filteredPersonalNotes.length === 0 ? (
                      <p className="text-[11px] text-slate-500 py-1">Aramaya uygun not bulunamadı.</p>
                    ) : (
                      <div className="space-y-2">
                        {filteredPersonalNotes.map(pn => (
                          <div
                            key={pn.id}
                            className={`group rounded-xl border p-2.5 space-y-1 transition ${
                              pn.favorite
                                ? 'border-amber-400/40 bg-amber-500/[0.09]'
                                : 'border-amber-500/20 bg-amber-500/[0.05]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => goToScene(pn.sceneIndex, pn.timestampSec)}
                                className="font-mono text-[10px] font-semibold text-amber-300 hover:underline"
                              >
                                ▶ Bölüm {pn.sceneIndex + 1} · {formatTime(pn.timestampSec)}
                              </button>
                              <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100">
                                <button
                                  onClick={() => toggleNoteFavorite(pn.id)}
                                  className="text-slate-500 hover:text-amber-400 transition"
                                  title={pn.favorite ? 'Yıldızı Kaldır' : 'Yıldızla'}
                                >
                                  <Star className={`h-3 w-3 ${pn.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingNoteId(pn.id);
                                    setEditingNoteText(pn.text);
                                  }}
                                  className="text-slate-500 hover:text-cyan-300 transition"
                                  title="Düzenle"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => removePersonalNote(pn.id)}
                                  className="text-slate-500 hover:text-rose-400 transition"
                                  title="Sil"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            {editingNoteId === pn.id ? (
                              <div className="space-y-1.5 pt-1">
                                <textarea
                                  value={editingNoteText}
                                  onChange={e => setEditingNoteText(e.target.value)}
                                  className="w-full rounded-lg border border-cyan-400/40 bg-slate-900 p-2 text-xs text-white focus:outline-none"
                                  rows={2}
                                />
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    onClick={() => updatePersonalNoteText(pn.id, editingNoteText)}
                                    className="h-6 rounded bg-cyan-500 px-2 text-[10px] text-slate-950 font-bold"
                                  >
                                    Kaydet
                                  </Button>
                                  <button
                                    onClick={() => setEditingNoteId(null)}
                                    className="text-[10px] text-slate-400 hover:text-white px-2"
                                  >
                                    İptal
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-200 leading-relaxed">{pn.text}</p>
                            )}
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
                    const isDone = completedScenes.has(idx);
                    return (
                      <button
                        key={sc.id}
                        onClick={() => goToScene(idx)}
                        className={`w-full text-left rounded-2xl border p-3 transition flex items-start gap-3 ${
                          isAct
                            ? 'border-cyan-400/50 bg-cyan-500/12 shadow-sm'
                            : isDone
                            ? 'border-emerald-500/25 bg-emerald-500/[0.03] hover:border-emerald-500/40'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            isAct
                              ? 'bg-cyan-400 text-slate-950'
                              : isDone
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                              : 'bg-white/[0.06] text-slate-300'
                          }`}
                        >
                          {isDone && !isAct ? '✓' : idx + 1}
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
                <div className={`flex ${isMobileLandscape ? 'h-[calc(100dvh-120px)]' : 'h-[calc(100dvh-220px)]'} flex-col min-h-0`}>
                  <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]">
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
                            <div className="space-y-2">
                              <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-li:my-0.5">
                                <ReactMarkdown>{m.content}</ReactMarkdown>
                              </div>
                              <div className="flex items-center justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleSpeakCoach(i, m.content)}
                                  className={`flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] font-medium transition ${
                                    speakingCoachIdx === i
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 ring-1 ring-cyan-400/30'
                                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                                  }`}
                                  title="Asistan yanıtını Türkçe seslendir"
                                >
                                  <Volume2 className={`h-3 w-3 ${speakingCoachIdx === i ? 'animate-pulse text-cyan-300' : ''}`} />
                                  <span>{speakingCoachIdx === i ? 'Durdur' : 'Sesli Dinle'}</span>
                                </button>
                              </div>
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

                  <div className={`mt-2 flex ${isMobileLandscape ? 'overflow-x-auto no-scrollbar pb-1' : 'flex-wrap'} gap-1.5 border-t border-white/[0.07] pt-2 shrink-0`}>
                    {[
                      'Bu grafiği ve formülü açıkla',
                      'Konuyu gerçek hayat örneğiyle anlat',
                      'Sınavda hoca ne sorar?',
                      'Bana 2 mini soru sor',
                      'Daha sade bir dille özetle',
                    ].map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => sendCoachQuestion(prompt)}
                        disabled={coachLoading}
                        className={`rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50 ${
                          isMobileLandscape ? 'shrink-0 whitespace-nowrap' : ''
                        }`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  {isListeningVoice && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-950/40 p-2 text-xs text-red-200 animate-pulse shrink-0">
                      <Mic className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <span className="truncate flex-1 font-medium">
                        {voiceTranscript || 'Sizi dinliyorum, konuşabilirsiniz...'}
                      </span>
                    </div>
                  )}

                  <div className="mt-2 flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={toggleVoiceQuestion}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                        isListeningVoice
                          ? 'border-red-500 bg-red-500/25 text-red-400 animate-pulse ring-2 ring-red-500/30'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                      }`}
                      title={isListeningVoice ? 'Sesli Dinlemeyi Durdur' : 'Mikrofonla Sesli Soru Sor'}
                    >
                      {isListeningVoice ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
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

        {simLabOpen && (
          <InteractiveEconomicsLab
            onClose={() => setSimLabOpen(false)}
            onAskCoach={question => {
              setSimLabOpen(false);
              setSidebarOpen(true);
              setActiveTab('coach');
              sendCoachQuestion(question);
            }}
          />
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
            onPrintNotes={handlePrintStudySheet}
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

        {/* Akıllı Kavram Haritası (Knowledge Graph) */}
        {conceptMapOpen && (
          <ConceptKnowledgeMap
            scenes={scenes}
            allTerms={allTerms}
            courseTitle={material.title}
            onClose={() => setConceptMapOpen(false)}
            onJumpToScene={(sceneIdx, timeSec) => {
              setConceptMapOpen(false);
              unlockStudioAudio();
              goToScene(sceneIdx, timeSec || 0);
              setIsPlaying(true);
            }}
          />
        )}

        {/* Aralıklı Tekrar & Bilgi Kartları (SM-2 / Leitner) */}
        {flashcardsOpen && (
          <SpacedRepetitionFlashcards
            materialId={material.id}
            scenes={scenes}
            keyFacts={keyFacts}
            wrongQuestionIndexes={[]}
            onClose={() => setFlashcardsOpen(false)}
            onJumpToScene={sceneIdx => {
              setFlashcardsOpen(false);
              unlockStudioAudio();
              goToScene(sceneIdx, 0);
              setIsPlaying(true);
            }}
          />
        )}

        {/* Akıllı İçerik Arama (Cümle, Altyazı ve Terim Dökümü) */}
        {searchModalOpen && (
          <SearchTranscriptModal
            scenes={scenes}
            onClose={() => setSearchModalOpen(false)}
            onJumpTo={(sceneIdx, timeSec) => {
              setSearchModalOpen(false);
              unlockStudioAudio();
              goToScene(sceneIdx, timeSec);
              setIsPlaying(true);
            }}
          />
        )}

        {/* Erişilebilirlik ve Kişiselleştirme Ayarları */}
        {accessibilityOpen && (
          <AccessibilityDialog
            settings={accessibilitySettings}
            onChange={setAccessibilitySettings}
            onClose={() => setAccessibilityOpen(false)}
          />
        )}
      </div>

      {/* BÖLÜMLER MENÜSÜ: Yatay Mobilde YouTube Tarzı Tam Ekran Sağ Çekmece, Diğer Durumlarda Alttan Açılan Popover */}
      {chaptersMenuOpen && (
        <>
          <div
            onClick={() => setChaptersMenuOpen(false)}
            className="fixed inset-0 z-[240] bg-black/60 backdrop-blur-xs transition-opacity"
          />

          {isMobileLandscape ? (
            /* Yatay Mobilde YouTube Tarzı Sağdan Kayan Bölümler Çekmecesi (Tüm ekran yüksekliğinde, asla alta sıkışmaz ve ortadaki videoyu kapatmaz) */
            <div
              ref={chaptersMenuRef}
              style={{ backgroundColor: '#090e1c' }}
              className="fixed inset-y-0 right-0 z-[250] w-80 max-w-[85vw] flex flex-col border-l border-white/[0.14] bg-[#090e1c] shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-in slide-in-from-right duration-200"
            >
              <div className="flex shrink-0 items-center justify-between px-3.5 py-2.5 border-b border-white/[0.1] bg-[#090e1c]">
                <div className="min-w-0 flex-1 pr-2">
                  <span className="text-xs font-bold text-white block">Ders Bölümleri ({scenes.length} Bölüm)</span>
                  <span className="text-[10px] text-slate-400 truncate block">{studio.title}</span>
                </div>
                <button
                  onClick={() => setChaptersMenuOpen(false)}
                  className="h-7 w-7 flex shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]">
                {scenes.map((sc, sIdx) => {
                  const isCurrent = sIdx === activeSceneIndex;
                  return (
                    <button
                      key={sc.id}
                      onClick={() => {
                        goToScene(sIdx, 0);
                        setChaptersMenuOpen(false);
                      }}
                      className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition ${
                        isCurrent
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 ring-1 ring-cyan-400/30'
                          : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/[0.05]'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold text-cyan-400 shrink-0 mt-0.5">
                        {sIdx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-snug break-words">
                          {sc.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{formatTime(sc.durationSec)}</span>
                          <span>•</span>
                          <span>{DIAGRAM_BADGE_TR[sc.diagram.type]}</span>
                          {isCurrent && (
                            <>
                              <span>•</span>
                              <span className="text-cyan-300 font-semibold">Oynatılıyor</span>
                            </>
                          )}
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0 mt-1.5 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Dikey Mobil ve Masaüstü: Alttan Açılan YouTube Tarzı Bölümler Menüsü */
            <div
              ref={chaptersMenuRef}
              style={{ backgroundColor: '#0a0f1d' }}
              className="fixed inset-x-2 bottom-20 z-[250] max-h-[65vh] sm:fixed sm:inset-x-auto sm:left-24 sm:bottom-16 sm:w-96 sm:max-h-[380px] overflow-y-auto rounded-2xl border border-white/[0.14] bg-[#0a0f1d] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.95)] space-y-1.5 animate-in fade-in slide-in-from-bottom-2 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-1 pb-2 border-b border-white/[0.1] bg-[#0a0f1d]">
                <div>
                  <span className="text-xs font-bold text-white block">Ders Bölümleri ({scenes.length} Bölüm)</span>
                  <span className="text-[11px] text-slate-400 truncate max-w-[240px] block">{studio.title}</span>
                </div>
                <button onClick={() => setChaptersMenuOpen(false)} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1 pt-1">
                {scenes.map((sc, sIdx) => {
                  const isCurrent = sIdx === activeSceneIndex;
                  return (
                    <button
                      key={sc.id}
                      onClick={() => {
                        goToScene(sIdx, 0);
                        setChaptersMenuOpen(false);
                      }}
                      className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition ${
                        isCurrent
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 ring-1 ring-cyan-400/30'
                          : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/[0.05]'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold text-cyan-400 shrink-0 mt-0.5">
                        {sIdx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-snug break-words">
                          {sc.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{formatTime(sc.durationSec)}</span>
                          <span>•</span>
                          <span>{DIAGRAM_BADGE_TR[sc.diagram.type]}</span>
                          {isCurrent && (
                            <>
                              <span>•</span>
                              <span className="text-cyan-300 font-semibold">Oynatılıyor</span>
                            </>
                          )}
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0 mt-1.5 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* AYARLAR MENÜSÜ: Oynatma Hızı & Sunum Düzeni */}
      {settingsMenuOpen && (
        <>
          <div
            onClick={() => setSettingsMenuOpen(false)}
            className="fixed inset-0 z-[240] bg-black/60 backdrop-blur-xs transition-opacity"
          />

          <div
            ref={settingsMenuRef}
            style={{ backgroundColor: '#0a0f1d' }}
            className={
              isMobileLandscape
                ? "fixed bottom-12 right-2 z-[250] w-72 max-h-[calc(100vh-3.5rem)] overflow-y-auto rounded-2xl border border-white/[0.14] bg-[#0a0f1d] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.95)] space-y-2.5 text-xs animate-in fade-in slide-in-from-bottom-2"
                : "fixed inset-x-4 bottom-20 z-[250] sm:fixed sm:inset-x-auto sm:right-4 sm:bottom-16 sm:w-72 rounded-2xl border border-white/[0.14] bg-[#0a0f1d] p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.95)] space-y-3 text-xs animate-in fade-in slide-in-from-bottom-2"
            }
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08]">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                <span>Oynatma Seçenekleri</span>
              </span>
              <button onClick={() => setSettingsMenuOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Oynatma Hızı */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>OYNATMA HIZI</span>
                <span className="font-mono text-cyan-300 font-bold">{playbackSpeed}x</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[0.75, 1.0, 1.25, 1.5, 1.75].map(spd => (
                  <button
                    key={spd}
                    onClick={() => {
                      setPlaybackSpeed(spd);
                      setSettingsMenuOpen(false);
                    }}
                    className={`rounded-lg py-1.5 font-mono text-xs font-semibold transition ${
                      playbackSpeed === spd
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Sunum Düzeni */}
            <div className="space-y-1.5 pt-1.5 border-t border-white/[0.06]">
              <span className="text-[11px] font-semibold text-slate-400">SUNUM DÜZENİ</span>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'standard', label: 'Stüdyo' },
                    { id: 'whiteboard', label: 'Sanal Tahta' },
                    { id: 'focus', label: 'Odak' },
                  ] as const
                ).map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setLayoutMode(mode.id);
                      setSettingsMenuOpen(false);
                    }}
                    className={`rounded-lg py-1.5 text-xs font-medium transition ${
                      layoutMode === mode.id
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(studioElement, document.body);
  }
  return studioElement;
};

export default InteractiveVideoStudio;
