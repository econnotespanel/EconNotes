import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
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
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import {
  buildStudioContent,
  positionFromElapsed,
  formatTime,
  StudioContent,
  StudioScene,
  CHARS_PER_SEC,
} from './video/sceneModel';
import { renderStage, STAGE_W, STAGE_H, StageFrame } from './video/renderStage';
import {
  discoverTurkishVoices,
  selectVoicesForSpeakers,
  playSceneConversationally,
  visemeFromTurkishChar,
  VoiceOption,
  Viseme,
} from './video/speechEngine';

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

export const InteractiveVideoStudio: React.FC<InteractiveVideoStudioProps> = ({
  material,
  onClose,
  onReport,
}) => {
  // 1. Ders içeriği modeli
  const studio = useMemo<StudioContent>(() => {
    return buildStudioContent(material.content, material.title, material.course || '');
  }, [material.content, material.title, material.course]);

  const { scenes, totalDurationSec, keyFacts, searches } = studio;

  // 2. Oynatıcı durumları
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [elapsedSceneTime, setElapsedSceneTime] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);

  // 3. Ses motoru durumları
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [preferredDenizVoice, setPreferredDenizVoice] = useState<string>('');
  const [preferredBarisVoice, setPreferredBarisVoice] = useState<string>('');
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);

  // 4. Arayüz ve çalışma paneli durumları
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  // 6. 1080p MP4 Dışa Aktarma durumları
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // 7. Entegre Yapay Zekâ Akıl Hocası (gerçek study-coach fonksiyonuna bağlı)
  const [coachMessages, setCoachMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: `Merhaba! **${studio.title}** dersindeyiz. Dr. Deniz ve Barış'ın anlattığı bölümlerle ilgili anlamadığın bir kavramı, sınav sorusu ihtimalini veya ek örnek isteğini doğrudan sorabilirsin.`,
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

  // Canlı konuşma sınır (onboundary) takip referansı
  const speechSyncRef = useRef<{
    sentenceIndex: number;
    charInSentence: number;
    hasBoundaryEvents: boolean;
    inBreathPause: boolean;
  }>({
    sentenceIndex: 0,
    charInSentence: 0,
    hasBoundaryEvents: false,
    inBreathPause: false,
  });

  const currentScene: StudioScene = scenes[activeSceneIndex] || scenes[0];

  // Tüm ders boyunca birikmiş tüm terimler (arama yapılabilir sözlük için)
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

  // Arka plan sayfa kaydırmasını kilitle (tam ekran temiz görünüm)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Türkçe doğal/bulut seslerini keşfet (asenkron voiceschanged dahil)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refresh = () => {
      const found = discoverTurkishVoices();
      setVoices(found);
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

  const stopSpeech = useCallback(() => {
    if (stopSpeechFnRef.current) {
      stopSpeechFnRef.current();
      stopSpeechFnRef.current = null;
    }
    speechSyncRef.current.inBreathPause = false;
  }, []);

  // Sahne seslendirmesini başlat
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
      };

      if (isMuted || volume <= 0.01) return;

      const cancel = playSceneConversationally({
        scene: targetScene,
        assignment: speakerVoices[targetScene.speaker],
        playbackSpeed,
        volume,
        muted: isMuted,
        startSentenceIndex: startPos.sentenceIndex,
        onBoundaryProgress: (sIdx, charIdx, boundaryHit) => {
          speechSyncRef.current.sentenceIndex = sIdx;
          speechSyncRef.current.charInSentence = charIdx;
          if (boundaryHit) {
            speechSyncRef.current.hasBoundaryEvents = true;
            // Sahne zamanını konuşulan gerçek karaktere hizala
            const globalChar = (targetScene.sentenceOffsets[sIdx] || 0) + charIdx;
            const syncedRatio = Math.min(1, globalChar / Math.max(1, targetScene.totalChars));
            setElapsedSceneTime(syncedRatio * targetScene.durationSec);
          }
        },
        onBreathPause: paused => {
          speechSyncRef.current.inBreathPause = paused;
        },
        onComplete: () => {
          if (sceneIdx + 1 < scenes.length) {
            setActiveSceneIndex(sceneIdx + 1);
            setElapsedSceneTime(0);
            speechSyncRef.current = {
              sentenceIndex: 0,
              charInSentence: 0,
              hasBoundaryEvents: false,
              inBreathPause: false,
            };
          } else {
            setIsPlaying(false);
            setElapsedSceneTime(targetScene.durationSec);
            toast.success('Ders tamamlandı! Önemli notları sağ panelden indirebilirsiniz.');
          }
        },
      });

      stopSpeechFnRef.current = cancel;
    },
    [scenes, speakerVoices, playbackSpeed, volume, isMuted, stopSpeech],
  );

  // Sahne değiştiğinde veya ses/hız ayarları güncellendiğinde konuşmayı senkron tut
  useEffect(() => {
    if (isPlaying) {
      startSceneSpeech(activeSceneIndex, elapsedSceneTime);
    }
    return () => {
      stopSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSceneIndex, isPlaying, isMuted, playbackSpeed, speakerVoices]);

  const togglePlay = useCallback(() => {
    setHasStartedOnce(true);
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    } else {
      // Ders sonundaysa başa sar
      if (
        activeSceneIndex === scenes.length - 1 &&
        elapsedSceneTime >= currentScene.durationSec - 0.3
      ) {
        setActiveSceneIndex(0);
        setElapsedSceneTime(0);
      }
      setIsPlaying(true);
    }
  }, [isPlaying, stopSpeech, activeSceneIndex, scenes.length, elapsedSceneTime, currentScene.durationSec]);

  const goToScene = useCallback(
    (index: number, seekSec = 0) => {
      const nextIdx = Math.max(0, Math.min(scenes.length - 1, index));
      stopSpeech();
      setHasStartedOnce(true);
      setActiveSceneIndex(nextIdx);
      setElapsedSceneTime(seekSec);
      const pos = positionFromElapsed(scenes[nextIdx], seekSec);
      speechSyncRef.current = {
        sentenceIndex: pos.sentenceIndex,
        charInSentence: pos.charInSentence,
        hasBoundaryEvents: false,
        inBreathPause: false,
      };
      if (isPlaying && nextIdx === activeSceneIndex) {
        startSceneSpeech(nextIdx, seekSec);
      }
    },
    [scenes, stopSpeech, isPlaying, activeSceneIndex, startSceneSpeech],
  );

  const seekRelative = useCallback(
    (deltaSec: number) => {
      setHasStartedOnce(true);
      const targetTime = Math.max(0, Math.min(currentScene.durationSec - 0.1, elapsedSceneTime + deltaSec));
      setElapsedSceneTime(targetTime);
      const pos = positionFromElapsed(currentScene, targetTime);
      speechSyncRef.current.sentenceIndex = pos.sentenceIndex;
      speechSyncRef.current.charInSentence = pos.charInSentence;
      if (isPlaying) {
        startSceneSpeech(activeSceneIndex, targetTime);
      }
    },
    [currentScene, elapsedSceneTime, isPlaying, startSceneSpeech, activeSceneIndex],
  );

  // Tarayıcı tam ekran kontrolü
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

  // Klavye kısayolları
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
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
      } else if (e.code === 'Escape' && !document.fullscreenElement) {
        if (document.querySelector('[role="dialog"]')) return;
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekRelative, toggleFullscreen, onClose]);

  // 60 FPS Full HD Sahne ve Dudak Senkronu Döngüsü
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const tick = (perfNow: number) => {
      const dt = Math.min(0.1, Math.max(0, (perfNow - lastTickRef.current) / 1000));
      lastTickRef.current = perfNow;

      if (isPlaying) {
        // Sınır olayı vermeyen bulut seslerinde (ör. Google Türkçe) veya sessiz modda akıcı ilerlet
        if (!speechSyncRef.current.inBreathPause) {
          setElapsedSceneTime(prev => {
            const rateFactor = speechSyncRef.current.hasBoundaryEvents ? 0.35 : 1.0;
            const next = prev + dt * playbackSpeed * rateFactor;
            if ((isMuted || !('speechSynthesis' in window)) && next >= currentScene.durationSec) {
              if (activeSceneIndex + 1 < scenes.length) {
                setActiveSceneIndex(activeSceneIndex + 1);
                return 0;
              }
              setIsPlaying(false);
              return currentScene.durationSec;
            }
            return Math.min(currentScene.durationSec, next);
          });

          if (!speechSyncRef.current.hasBoundaryEvents) {
            const curSentence = currentScene.sentences[speechSyncRef.current.sentenceIndex] || '';
            speechSyncRef.current.charInSentence = Math.min(
              curSentence.length,
              speechSyncRef.current.charInSentence + dt * CHARS_PER_SEC * playbackSpeed,
            );
          } else {
            const curSentence = currentScene.sentences[speechSyncRef.current.sentenceIndex] || '';
            speechSyncRef.current.charInSentence = Math.min(
              curSentence.length,
              speechSyncRef.current.charInSentence + dt * CHARS_PER_SEC * playbackSpeed * 0.65,
            );
          }
        }
      }

      const fallbackPos = positionFromElapsed(currentScene, elapsedSceneTime);
      const sIdx = isPlaying ? speechSyncRef.current.sentenceIndex : fallbackPos.sentenceIndex;
      const cIdx = isPlaying ? Math.floor(speechSyncRef.current.charInSentence) : Math.floor(fallbackPos.charInSentence);
      const activeSentence = currentScene.sentences[sIdx] || currentScene.narration;

      // Aktif Türkçe harften viseme ve yumuşatılmış ağız açıklığı hesapla
      let targetViseme: Viseme = 'rest';
      let targetOpen = 0;

      if (isPlaying && !speechSyncRef.current.inBreathPause) {
        const ch = activeSentence.charAt(Math.max(0, Math.min(activeSentence.length - 1, cIdx)));
        const vInfo = visemeFromTurkishChar(ch);
        targetViseme = vInfo.viseme;
        // Doğal hece ritmi modülasyonu
        const syllableWave = 0.72 + Math.sin(perfNow / 68) * 0.28;
        targetOpen = vInfo.open * syllableWave;
      }

      smoothMouthRef.current += (targetOpen - smoothMouthRef.current) * Math.min(1, dt * 22);

      const elapsedBefore = scenes.slice(0, activeSceneIndex).reduce((acc, s) => acc + s.durationSec, 0);
      const overall = totalDurationSec > 0 ? (elapsedBefore + elapsedSceneTime) / totalDurationSec : 0;

      const frame: StageFrame = {
        scene: currentScene,
        sceneIndex: activeSceneIndex,
        sceneCount: scenes.length,
        progress: fallbackPos.progress,
        overall,
        sceneTime: elapsedSceneTime,
        sentenceIndex: sIdx,
        charInSentence: cIdx,
        playing: isPlaying,
        poster: !hasStartedOnce,
        now: Date.now(),
        courseLabel: material.course || '',
        showSubtitles,
        viseme: targetViseme,
        mouthOpen: smoothMouthRef.current,
        inBreathPause: speechSyncRef.current.inBreathPause,
      };

      renderStage(ctx, frame);
      animId = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [
    currentScene,
    activeSceneIndex,
    scenes,
    elapsedSceneTime,
    isPlaying,
    hasStartedOnce,
    playbackSpeed,
    isMuted,
    showSubtitles,
    material.course,
    totalDurationSec,
  ]);

  // Yardımcı eylemler
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

  // Tüm ders notlarını ve kişisel notları temiz Markdown dosyası olarak indir
  const handleDownloadStudySheet = () => {
    const lines: string[] = [
      `# ${studio.title}`,
      material.course ? `**Ders:** ${material.course}` : '',
      studio.outline ? `\n> ${studio.outline}\n` : '',
      `---`,
      `## Bölüm Notları ve Kritik Çıkarımlar`,
    ];

    scenes.forEach((sc, i) => {
      lines.push(`\n### ${i + 1}. ${sc.title} (${sc.speaker})`);
      lines.push(sc.narration);
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

  // Gerçek study-coach Edge Function çağrısı
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

  // 1080p Full HD MP4 Dışa Aktarma Motoru (yumuşak stüdyo ambiyans sesiyle, rahatsız edici bip sesi olmadan)
  const handleExportMP4 = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('1080p Full HD sahne motoru hazırlanıyor...');

    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    }

    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = STAGE_W;
      exportCanvas.height = STAGE_H;
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) throw new Error('Canvas 2D başlatılamadı.');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioDest = audioCtx.createMediaStreamDestination();

      // Yumuşak stüdyo ambiyans akoru (rahatsız edici tekil sinüs sinyali yerine çok hafif sıcak pad)
      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.018, audioCtx.currentTime);
      masterGain.connect(audioDest);

      const freqs = [261.63, 329.63, 392.0];
      const oscs = freqs.map(freq => {
        const o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, audioCtx.currentTime);
        o.connect(masterGain);
        o.start();
        return o;
      });

      const canvasStream = exportCanvas.captureStream(30);
      audioDest.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

      let mimeType = 'video/mp4;codecs="avc1,mp4a.40.2"';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
        else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus';
        else if (MediaRecorder.isTypeSupported('video/webm')) mimeType = 'video/webm';
        else mimeType = '';
      }

      const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 6_000_000 };
      if (mimeType) recorderOptions.mimeType = mimeType;

      const mediaRecorder = new MediaRecorder(canvasStream, recorderOptions);
      const recordedChunks: Blob[] = [];
      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.start(100);

      const totalScenes = scenes.length;
      for (let sIdx = 0; sIdx < totalScenes; sIdx++) {
        const scene = scenes[sIdx];
        const sceneDuration = Math.min(scene.durationSec, 9);
        const fps = 30;
        const totalFrames = Math.round(sceneDuration * fps);

        setExportStatusText(`Bölüm ${sIdx + 1}/${totalScenes}: ${scene.title}`);

        for (let f = 0; f < totalFrames; f++) {
          const timeSecs = f / fps;
          const pos = positionFromElapsed(scene, timeSecs);
          const sent = scene.sentences[pos.sentenceIndex] || '';
          const ch = sent.charAt(Math.floor(pos.charInSentence));
          const vInfo = visemeFromTurkishChar(ch);

          const frame: StageFrame = {
            scene,
            sceneIndex: sIdx,
            sceneCount: totalScenes,
            progress: pos.progress,
            overall: (sIdx + pos.progress) / totalScenes,
            sceneTime: timeSecs,
            sentenceIndex: pos.sentenceIndex,
            charInSentence: Math.floor(pos.charInSentence),
            playing: true,
            poster: false,
            now: Date.now() + f * 33,
            courseLabel: material.course || '',
            showSubtitles: true,
            viseme: vInfo.viseme,
            mouthOpen: vInfo.open * (0.7 + Math.sin(f * 0.45) * 0.3),
            inBreathPause: false,
          };

          renderStage(exportCtx, frame);

          const pct = Math.round(((sIdx + f / totalFrames) / totalScenes) * 96);
          setExportProgress(pct);

          if (f % 10 === 0) {
            await new Promise(r => setTimeout(r, 16));
          }
        }
      }

      setExportProgress(98);
      setExportStatusText('1080p video dosyası paketleniyor...');

      await new Promise<void>(resolve => {
        mediaRecorder.onstop = () => resolve();
        mediaRecorder.stop();
        oscs.forEach(o => o.stop());
        audioCtx.close();
      });

      const ext = mimeType.includes('mp4') || !mimeType ? 'mp4' : 'webm';
      const videoBlob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
      const downloadUrl = URL.createObjectURL(videoBlob);
      const safeTitle =
        (material.course ? `${material.course}-` : '') +
        studio.title
          .toLowerCase()
          .replace(/[^a-z0-9ğüşıöç]+/gi, '-')
          .replace(/^-+|-+$/g, '');

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${safeTitle}-1080p.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setExportProgress(100);
      setExportStatusText('İndirme tamamlandı!');
      toast.success('1080p HD ders videosu indirildi');
      setTimeout(() => setIsExporting(false), 1200);
    } catch (err: any) {
      toast.error('Video dışa aktarılamadı: ' + (err?.message || 'Bilinmeyen hata'));
      setIsExporting(false);
    }
  };

  // Toplam geçen süre
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

  const activeVoiceQuality = speakerVoices[currentScene.speaker]?.quality;

  const studioElement = (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#050811] text-slate-100 select-none font-sans"
    >
      {/* 1. MODERN SİNEMATİK ÜST ÇUBUK */}
      <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#070b16]/90 px-3 sm:px-5 backdrop-blur-xl">
        {/* Sol: Geri + Başlık + Ders bilgisi */}
        <div className="flex min-w-0 items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="group flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              title="Stüdyodan Çık (Esc)"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">Stüdyodan Çık</span>
            </button>
          )}

          <div className="h-5 w-px bg-white/[0.08] hidden sm:block" />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-300 ring-1 ring-inset ring-cyan-400/25">
                <span className={`h-1.5 w-1.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
                1080p STÜDYO DERSİ
              </span>
              {material.course && (
                <span className="truncate text-[11px] font-medium text-slate-400 hidden md:inline">
                  {material.course}
                </span>
              )}
            </div>
            <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100 sm:text-[15px]">
              {studio.title}
            </h1>
          </div>
        </div>

        {/* Sağ: Gerçek Akademik Araçlar (Sıfır sahte emoji sayacı!) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Doğal Ses Motoru Seçici */}
          <div className="relative">
            <button
              onClick={() => setVoiceMenuOpen(o => !o)}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              title="Anlatıcı Ses Ayarları"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden xl:inline">
                {activeVoiceQuality === 'neural'
                  ? 'Doğal Neural Ses'
                  : activeVoiceQuality === 'cloud'
                  ? 'Bulut HD Ses'
                  : 'Ses Ayarları'}
              </span>
            </button>

            {voiceMenuOpen && (
              <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-white/10 bg-[#0b1120]/98 p-4 shadow-2xl backdrop-blur-xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Doğal Ses Stüdyosu</span>
                  <button
                    onClick={() => setVoiceMenuOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-400">
                  Tarayıcınızdaki en doğal Türkçe sesler otomatik seçilir. Dilerseniz anlatıcı seslerini değiştirebilirsiniz.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-medium text-cyan-300 mb-1">
                      Dr. Deniz (Akademik Anlatıcı)
                    </label>
                    <select
                      value={preferredDenizVoice}
                      onChange={e => setPreferredDenizVoice(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="">Otomatik ({speakerVoices.Deniz.label})</option>
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.cleanName} {v.quality === 'neural' ? '★ HD' : v.quality === 'cloud' ? '· Bulut' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-purple-300 mb-1">
                      Barış (Araştırmacı & Soru Soran)
                    </label>
                    <select
                      value={preferredBarisVoice}
                      onChange={e => setPreferredBarisVoice(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">Otomatik ({speakerVoices.Barış.label})</option>
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.cleanName} {v.quality === 'neural' ? '★ HD' : v.quality === 'cloud' ? '· Bulut' : ''}
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
            title="Tüm ders notlarını ve sözlüğü indir (.md)"
          >
            <FileDown className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden xl:inline">Notları İndir</span>
          </button>

          {/* 1080p MP4 İndir */}
          <Button
            size="sm"
            onClick={handleExportMP4}
            disabled={isExporting}
            className="h-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-3 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 gap-1.5"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">1080p MP4</span>
          </Button>

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

          {/* Kapat (Mobil için kompakt X) */}
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
        {/* SOL/MERKEZ: 1080p SİNEMA SAHNESİ VE KONTROL PANELİ */}
        <div className="relative flex flex-1 min-w-0 flex-col bg-[#050811]">
          {/* Arka plan yumuşak ambiyans ışığı */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                currentScene.speaker === 'Deniz'
                  ? 'radial-gradient(circle at 30% 45%, rgba(34,211,238,0.12), transparent 65%)'
                  : 'radial-gradient(circle at 70% 45%, rgba(168,85,247,0.12), transparent 65%)',
            }}
          />

          {/* 16:9 Tuval Alanı */}
          <div className="relative flex flex-1 min-h-0 items-center justify-center p-2 sm:p-4 lg:p-5">
            <div className="relative aspect-video w-full max-h-full max-w-[1480px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#040710] shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
              <canvas
                ref={canvasRef}
                width={STAGE_W}
                height={STAGE_H}
                onClick={togglePlay}
                className="block h-full w-full cursor-pointer object-contain"
              />

              {/* İlk Başlangıç Sinematik Kapak Katmanı */}
              {!hasStartedOnce && (
                <div
                  onClick={togglePlay}
                  className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-gradient-to-t from-[#040710]/90 via-[#040710]/45 to-transparent backdrop-blur-[2px] transition-all"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-slate-950 shadow-[0_0_50px_rgba(34,211,238,0.5)] transition-transform duration-300 group-hover:scale-110">
                    <Play className="ml-1 h-8 w-8 fill-slate-950" />
                  </div>
                  <div className="mt-4 text-center px-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                      Dr. Deniz & Barış ile İnteraktif Ders
                    </p>
                    <h2 className="mt-1 text-lg sm:text-xl font-bold text-white">
                      Video Dersini Başlat ({scenes.length} Bölüm · {formatTime(totalDurationSec)})
                    </h2>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ALT KONTROL DOCK & BÖLÜMLÜ ZAMAN ÇİZELGESİ */}
          <div className="relative z-20 shrink-0 border-t border-white/[0.07] bg-[#070b16]/95 px-4 py-2.5 backdrop-blur-xl">
            {/* Hover Bölüm Önizleme Etiketi */}
            {hoveredChapter !== null && scenes[hoveredChapter] && (
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-cyan-300">
                <span className="truncate font-medium">
                  Bölüm {hoveredChapter + 1}: {scenes[hoveredChapter].title} ({scenes[hoveredChapter].speaker})
                </span>
                <span className="font-mono text-slate-400">{formatTime(scenes[hoveredChapter].durationSec)}</span>
              </div>
            )}

            {/* Çok Bölümlü (Segmented) İlerleme Çubuğu */}
            <div className="flex items-center gap-3">
              <span className="w-11 text-right font-mono text-[11px] text-slate-400">
                {formatTime(totalElapsedSec)}
              </span>

              <div className="flex flex-1 items-center gap-1 py-1">
                {scenes.map((sc, idx) => {
                  const weight = sc.durationSec / Math.max(1, totalDurationSec);
                  let fillPct = 0;
                  if (idx < activeSceneIndex) fillPct = 100;
                  else if (idx === activeSceneIndex) {
                    fillPct = Math.min(100, (elapsedSceneTime / Math.max(0.1, sc.durationSec)) * 100);
                  }

                  return (
                    <div
                      key={sc.id}
                      style={{ flexGrow: weight, flexBasis: 0 }}
                      onMouseEnter={() => setHoveredChapter(idx)}
                      onMouseLeave={() => setHoveredChapter(null)}
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        goToScene(idx, ratio * sc.durationSec);
                      }}
                      className="group relative h-2 cursor-pointer overflow-hidden rounded-full bg-white/[0.12] transition-all hover:h-2.5"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-75"
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              <span className="w-11 font-mono text-[11px] text-slate-400">
                {formatTime(totalDurationSec)}
              </span>
            </div>

            {/* Alt Buton Satırı */}
            <div className="mt-1.5 flex items-center justify-between gap-2">
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
                  className="flex h-8 items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-cyan-50"
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-slate-950" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-slate-950 ml-0.5" />
                  )}
                  <span>{isPlaying ? 'Duraklat' : 'Oynat'}</span>
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

              {/* Orta: Aktif Bölüm ve Konuşmacı Özeti */}
              <div className="hidden lg:flex min-w-0 items-center gap-2 text-xs">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    currentScene.speaker === 'Deniz'
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'bg-purple-500/15 text-purple-300'
                  }`}
                >
                  {currentScene.speaker === 'Deniz' ? 'Dr. Deniz' : 'Barış'}
                </span>
                <span className="truncate max-w-md font-medium text-slate-200">
                  {activeSceneIndex + 1}/{scenes.length} · {currentScene.title}
                </span>
              </div>

              {/* Sağ: Hız Seçici */}
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

        {/* SAĞ ÇALIŞMA PANELİ: DERS NOTLARI, KAVRAMLAR, HAP BİLGİLER & AKIL HOCASI */}
        {sidebarOpen && (
          <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[400px] lg:static lg:w-[410px] xl:w-[430px] shrink-0 flex-col border-l border-white/[0.08] bg-[#080d1a]/98 backdrop-blur-2xl shadow-2xl lg:shadow-none">
            {/* Sekme Başlıkları */}
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

            {/* Sekme İçerikleri */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 1. ÖNEMLİ DERS NOTLARI */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  {/* Aktif Bölüm Kartı */}
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-cyan-400">
                        Bölüm {activeSceneIndex + 1} / {scenes.length}
                      </span>
                      <span className="text-slate-400">
                        {currentScene.speaker === 'Deniz' ? 'Dr. Deniz' : 'Barış'}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-white leading-snug">
                      {currentScene.title}
                    </h3>
                  </div>

                  {/* Sınav İpucu Vurgusu */}
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

                  {/* Bu Bölümden Önemli Çıkarımlar */}
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

                  {/* Öğrencinin Kendi Zaman Damgalı Notları */}
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

                  {/* Bölüm Konuşma Dökümü (Canlı Cümle Vurgulu) */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Bölüm Anlatım Metni
                    </h4>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 text-xs leading-relaxed">
                      {currentScene.sentences.map((sent, sIdx) => {
                        const isCur = sIdx === speechSyncRef.current.sentenceIndex && hasStartedOnce;
                        return (
                          <p
                            key={sIdx}
                            onClick={() => {
                              const charOffset = currentScene.sentenceOffsets[sIdx] || 0;
                              const ratio = charOffset / Math.max(1, currentScene.totalChars);
                              goToScene(activeSceneIndex, ratio * currentScene.durationSec);
                            }}
                            className={`cursor-pointer rounded-lg px-2 py-1 transition ${
                              isCur
                                ? 'bg-cyan-500/15 text-white font-medium'
                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                            }`}
                          >
                            {sent}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. KAVRAM SÖZLÜĞÜ */}
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

              {/* 3. SINAV HAP BİLGİLERİ */}
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

              {/* 4. DERS BÖLÜMLERİ (AKIŞ) */}
              {activeTab === 'playlist' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
                    <span>Toplam {scenes.length} Bölüm</span>
                    <span className="font-mono">{formatTime(totalDurationSec)}</span>
                  </div>

                  {scenes.map((sc, idx) => {
                    const isAct = idx === activeSceneIndex;
                    const isDeniz = sc.speaker === 'Deniz';
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
                            <span
                              className={`text-[10px] font-semibold ${
                                isDeniz ? 'text-cyan-300' : 'text-purple-300'
                              }`}
                            >
                              {isDeniz ? 'Dr. Deniz' : 'Barış'}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {formatTime(sc.durationSec)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs font-semibold text-slate-100 leading-snug">
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

              {/* 5. ENTEGRE YAPAY ZEKÂ AKIL HOCASI */}
              {activeTab === 'coach' && (
                <div className="flex h-[calc(100dvh-165px)] flex-col">
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
                      'Bu bölümü daha sade anlat',
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
      </div>

      {/* 3. 1080p MP4 DIŞA AKTARMA MODALI (Portal içinde çalıştığı için Tam Ekranda da görünür) */}
      {isExporting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1120] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">1080p Full HD Video Hazırlanıyor</h3>
                <p className="text-xs text-slate-400">
                  Sahneler ve akıllı tahta şemaları yüksek çözünürlükte işleniyor.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate max-w-[280px] text-slate-300">{exportStatusText}</span>
                <span className="font-mono font-bold text-cyan-400">%{exportProgress}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-150"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              İşlem tamamlandığında video otomatik olarak cihazınıza indirilecektir.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(studioElement, document.body);
  }
  return studioElement;
};

export default InteractiveVideoStudio;
