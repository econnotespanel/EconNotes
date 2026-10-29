import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Download, Sparkles, Video,
  ChevronRight, ChevronLeft, Maximize2, Minimize2, X, Wand2, Bug,
  BookOpen, Lightbulb, FileText, ListOrdered, CheckCircle2,
  Bookmark, Send, Loader2, FastForward, Rewind, MessageSquare,
  HelpCircle, GraduationCap, Copy, Check, PanelRightClose, PanelRightOpen,
  Subtitles, AlertCircle, Sparkle
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
  CHARS_PER_SEC
} from './video/sceneModel';
import {
  renderStage,
  STAGE_W,
  STAGE_H,
  StageFrame,
  FloatingReaction
} from './video/renderStage';

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
  // 1. Model data
  const studio = useMemo<StudioContent>(() => {
    return buildStudioContent(material.content, material.title);
  }, [material.content, material.title]);

  const { scenes, totalDurationSec, keyFacts, searches } = studio;

  // 2. Playback state
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [elapsedSceneTime, setElapsedSceneTime] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);

  // 3. UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'notes' | 'terms' | 'playlist' | 'facts' | 'coach'>('notes');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);

  // 4. Reactions
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({
    '🔥': 124,
    '💡': 89,
    '🧠': 67,
    '🎯': 142,
    '🚀': 53,
  });
  const floatingReactionsRef = useRef<FloatingReaction[]>([]);

  // 5. Export MP4 state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // 6. In-studio AI Coach state
  const [coachMessages, setCoachMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: `Merhaba! Ben bu dersin Yapay Zekâ Akıl Hocasıyım. **${material.title}** videosunu izlerken Deniz ve Barış'ın anlattığı herhangi bir kavramı, tarihi veya formülü bana sorabilirsin.`
    }
  ]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const coachEndRef = useRef<HTMLDivElement>(null);

  // 7. Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const activeSceneIndexRef = useRef(activeSceneIndex);
  activeSceneIndexRef.current = activeSceneIndex;

  const currentScene: StudioScene = scenes[activeSceneIndex] || scenes[0];

  // Sound effect generator for reactions and scene changes
  const playSound = useCallback((type: 'pop' | 'chime' = 'pop') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'pop') {
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.11);
      } else {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.26);
      }
    } catch {
      // AudioContext fallback
    }
  }, []);

  // Add interactive reaction
  const addReaction = (emoji: string) => {
    playSound('pop');
    setReactionCounts(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
    for (let i = 0; i < 3; i++) {
      floatingReactionsRef.current.push({
        id: Date.now() + Math.random(),
        emoji,
        x: STAGE_W / 2 + (Math.random() - 0.5) * 380,
        born: Date.now(),
        drift: (Math.random() - 0.5) * 2,
      });
    }
  };

  // Speech synthesis for current scene
  const playSpeechForScene = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;

    const scene = scenes[index];
    if (!scene) return;

    const isHostBaris = scene.speaker === 'Barış';
    const utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = 'tr-TR';
    utterance.pitch = isHostBaris ? 0.90 : 1.15;
    utterance.rate = (isHostBaris ? 0.98 : 1.0) * playbackSpeed;

    const voices = window.speechSynthesis.getVoices();
    const trVoices = voices.filter(v => v.lang.startsWith('tr'));
    if (trVoices.length > 1) {
      utterance.voice = isHostBaris ? trVoices[1] : trVoices[0];
    } else if (trVoices.length === 1) {
      utterance.voice = trVoices[0];
    }

    utterance.onend = () => {
      if (index + 1 < scenes.length) {
        playSound('chime');
        setActiveSceneIndex(index + 1);
        setElapsedSceneTime(0);
        playSpeechForScene(index + 1);
      } else {
        setIsPlaying(false);
        setActiveSceneIndex(0);
        setElapsedSceneTime(0);
        toast.success('🎉 Video dersi başarıyla tamamlandı!');
      }
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [scenes, isMuted, playbackSpeed, playSound]);

  const stopSpeech = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speechRef.current = null;
  }, []);

  const togglePlay = () => {
    setHasStartedOnce(true);
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    } else {
      setIsPlaying(true);
      playSpeechForScene(activeSceneIndex);
    }
  };

  const goToScene = (index: number) => {
    const nextIdx = Math.max(0, Math.min(scenes.length - 1, index));
    stopSpeech();
    setActiveSceneIndex(nextIdx);
    setElapsedSceneTime(0);
    playSound('chime');
    if (isPlaying) {
      playSpeechForScene(nextIdx);
    }
  };

  const seekRelative = (sec: number) => {
    const newTime = Math.max(0, Math.min(currentScene.durationSec, elapsedSceneTime + sec));
    setElapsedSceneTime(newTime);
    if (isPlaying) {
      stopSpeech();
      playSpeechForScene(activeSceneIndex);
    }
  };

  // Fullscreen handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      } else if (e.code === 'Escape' && !document.fullscreenElement) {
        if (onClose) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, activeSceneIndex, elapsedSceneTime, currentScene]);

  // Clean reactions periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 2500;
      floatingReactionsRef.current = floatingReactionsRef.current.filter(r => r.born > cutoff);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const now = Date.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      // Update elapsed time if playing
      if (isPlaying) {
        setElapsedSceneTime(prev => {
          const next = prev + dt * playbackSpeed;
          if (next >= currentScene.durationSec && !('speechSynthesis' in window)) {
            // Fallback timer when TTS is unavailable
            if (activeSceneIndexRef.current + 1 < scenes.length) {
              setActiveSceneIndex(activeSceneIndexRef.current + 1);
              return 0;
            } else {
              setIsPlaying(false);
              return 0;
            }
          }
          return next;
        });
      }

      // Compute subtitle positions
      const pos = positionFromElapsed(currentScene, elapsedSceneTime);

      // Compute overall progress
      const elapsedBefore = scenes.slice(0, activeSceneIndex).reduce((acc, s) => acc + s.durationSec, 0);
      const overall = totalDurationSec > 0 ? (elapsedBefore + elapsedSceneTime) / totalDurationSec : 0;

      const frame: StageFrame = {
        scene: currentScene,
        sceneIndex: activeSceneIndex,
        sceneCount: scenes.length,
        progress: pos.progress,
        overall,
        sceneTime: elapsedSceneTime,
        sentenceIndex: pos.sentenceIndex,
        charInSentence: pos.charInSentence,
        playing: isPlaying,
        poster: !hasStartedOnce,
        now,
        courseLabel: material.course || '',
        showSubtitles,
        reactions: floatingReactionsRef.current,
      };

      renderStage(ctx, frame);
      animId = requestAnimationFrame(render);
    };

    lastTickRef.current = Date.now();
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [currentScene, activeSceneIndex, scenes, elapsedSceneTime, isPlaying, hasStartedOnce, playbackSpeed, showSubtitles, material.course, totalDurationSec]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  // Copy note snippet
  const copySnippet = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNote(id);
    toast.success('Not panoya kopyalandı');
    setTimeout(() => setCopiedNote(null), 2000);
  };

  // In-studio AI tutor ask
  const sendCoachQuestion = async (q?: string) => {
    const text = q || coachInput;
    if (!text.trim() || coachLoading) return;
    const userMsg = text.trim();
    setCoachInput('');
    setCoachMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setCoachLoading(true);

    try {
      const contextPrompt = `Ders: ${material.course || 'Genel'}\nKonu Başlığı: ${material.title}\nŞu anki sahne (${currentScene.speaker}): ${currentScene.title}\nSahne İçeriği:\n${currentScene.narration}\nÖnemli Noktalar:\n${currentScene.keyTakeaways.join('\n')}\nKritik Sınav Notu: ${currentScene.examTip || currentScene.diagram.metric}\n\nÖğrencinin Sorusu: ${userMsg}\n\nKısa, net, samimi ve akademik olarak açıkla.`;

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { prompt: contextPrompt, mode: 'study_coach' }
      });

      if (error) throw error;
      const answer = data?.reply || data?.answer || 'Sorun için teşekkürler. Bu konu notun temel sacayaklarından biridir.';
      setCoachMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch {
      setCoachMessages(prev => [...prev, {
        role: 'assistant',
        content: `**${currentScene.title}** hakkında: ${currentScene.keyTakeaways[0] || currentScene.narration.substring(0, 160)}...`
      }]);
    } finally {
      setCoachLoading(false);
      setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  // High quality MP4 Video Export Engine
  const handleExportMP4 = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Animasyon motoru ve ses sentezleyicisi hazırlanıyor...');

    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    }

    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1280;
      exportCanvas.height = 720;
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) throw new Error('Canvas 2D context oluşturulamadı.');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioDest = audioCtx.createMediaStreamDestination();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioDest);
      osc.start();

      const canvasStream = exportCanvas.captureStream(30);
      audioDest.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

      let mimeType = 'video/mp4;codecs="avc1,mp4a.40.2"';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
        else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus';
        else if (MediaRecorder.isTypeSupported('video/webm')) mimeType = 'video/webm';
        else mimeType = '';
      }

      const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 3500000 };
      if (mimeType) recorderOptions.mimeType = mimeType;

      const mediaRecorder = new MediaRecorder(canvasStream, recorderOptions);
      const recordedChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.start(100);

      const totalScenes = scenes.length;
      for (let sIdx = 0; sIdx < totalScenes; sIdx++) {
        const scene = scenes[sIdx];
        const sceneDuration = Math.min(scene.durationSec, 8);
        const fps = 30;
        const totalFrames = Math.round(sceneDuration * fps);

        setExportStatusText(`Bölüm ${sIdx + 1} / ${totalScenes}: ${scene.speaker} (${scene.title}) işleniyor...`);

        const isBaris = scene.speaker === 'Barış';
        osc.frequency.setValueAtTime(isBaris ? 280 : 420, audioCtx.currentTime);

        for (let f = 0; f < totalFrames; f++) {
          const timeSecs = f / fps;
          const pos = positionFromElapsed(scene, timeSecs);
          const frame: StageFrame = {
            scene,
            sceneIndex: sIdx,
            sceneCount: totalScenes,
            progress: pos.progress,
            overall: (sIdx + pos.progress) / totalScenes,
            sceneTime: timeSecs,
            sentenceIndex: pos.sentenceIndex,
            charInSentence: pos.charInSentence,
            playing: true,
            poster: false,
            now: Date.now() + f * 33,
            courseLabel: material.course || '',
            showSubtitles: true,
            reactions: [],
          };

          renderStage(exportCtx, frame);

          const currentTotalFrames = sIdx * totalFrames + f;
          const grandTotalFrames = totalScenes * totalFrames;
          setExportProgress(Math.round((currentTotalFrames / grandTotalFrames) * 95));

          if (f % 12 === 0) {
            await new Promise(r => setTimeout(r, 16));
          }
        }
      }

      setExportProgress(98);
      setExportStatusText('MP4 dosyası derleniyor ve kaydediliyor...');

      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve();
        mediaRecorder.stop();
        osc.stop();
        audioCtx.close();
      });

      const videoBlob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
      const downloadUrl = URL.createObjectURL(videoBlob);
      const safeTitle = (material.course ? `${material.course}-` : '') +
        (material.title || 'Ders-Videosu')
          .toLowerCase()
          .replace(/[^a-z0-9ğüşıöç]+/gi, '-')
          .replace(/^-+|-+$/g, '');

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${safeTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setExportProgress(100);
      setExportStatusText('Video başarıyla indirildi!');
      toast.success('🎬 Video dersiniz MP4 olarak indirildi!');
      setTimeout(() => setIsExporting(false), 1500);
    } catch (err: any) {
      toast.error('Video oluşturulurken hata: ' + (err.message || 'Bilinmeyen hata'));
      setIsExporting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] h-screen w-screen bg-slate-950 text-white flex flex-col overflow-hidden select-none"
    >
      {/* 1. TOP CINEMA NAVIGATION BAR */}
      <header className="h-14 shrink-0 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-4 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 shrink-0">
            <Video className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30 text-[10px] font-bold px-2 py-0">
                CANLI STÜDYO DERSİ
              </Badge>
              {material.course && (
                <span className="text-[11px] font-semibold text-slate-400 truncate hidden sm:inline">
                  {material.course}
                </span>
              )}
            </div>
            <h1 className="text-sm sm:text-base font-bold text-white truncate max-w-md lg:max-w-xl">
              {studio.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Reaction Quick Bar */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-full px-2 py-1">
            {Object.keys(reactionCounts).map((emoji) => (
              <button
                key={emoji}
                onClick={() => addReaction(emoji)}
                className="hover:scale-125 transition-transform text-sm px-1.5 py-0.5 rounded-full hover:bg-slate-800"
                title={`${emoji} Tepki Ver`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-slate-400 ml-1 font-mono">{reactionCounts[emoji]}</span>
              </button>
            ))}
          </div>

          {/* Toggle Sidebar Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSidebarOpen(s => !s)}
            className={`h-8 gap-1.5 text-xs border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800 ${
              sidebarOpen ? 'border-cyan-500/50 text-cyan-300' : ''
            }`}
          >
            {sidebarOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Ders Notları & Bilgiler</span>
          </Button>

          {/* Export MP4 */}
          <Button
            size="sm"
            onClick={handleExportMP4}
            disabled={isExporting}
            className="h-8 gap-1.5 text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-md shadow-cyan-500/20"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">MP4 İndir</span>
          </Button>

          {/* Fullscreen */}
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleFullscreen}
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
            title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {/* Report */}
          {onReport && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onReport}
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 hidden sm:inline-flex"
              title="Sorun Bildir"
            >
              <Bug className="h-4 w-4" />
            </Button>
          )}

          {/* Close */}
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400"
              title="Kapat"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (STAGE + COLLAPSIBLE STUDY PANEL) */}
      <div className="flex-1 flex min-h-0 relative">
        {/* LEFT / CENTER: THEATER STAGE & CONTROLS */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative overflow-hidden">
          {/* 16:9 Canvas Viewport */}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 bg-gradient-to-b from-slate-950 via-slate-900/40 to-slate-950 overflow-hidden relative">
            <div className="w-full max-w-6xl aspect-video max-h-[calc(100vh-140px)] relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800/90 bg-black">
              <canvas
                ref={canvasRef}
                width={STAGE_W}
                height={STAGE_H}
                className="w-full h-full object-contain block"
              />

              {/* Initial Big Play Overlay if paused */}
              {!hasStartedOnce && (
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 cursor-pointer group transition-all"
                >
                  <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-cyan-500/40 group-hover:scale-110 transition-transform">
                    <Play className="h-9 w-9 ml-1 fill-white" />
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                      Animasyonlu Dersi Başlat
                    </h2>
                    <p className="text-xs text-slate-300 max-w-md">
                      Deniz ve Barış ders notundaki kavramları interaktif akıllı tahtada incelemeye hazır.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM CONTROLS & TIMELINE DOCK */}
          <div className="h-16 shrink-0 bg-slate-950/95 border-t border-slate-800/80 px-4 flex flex-col justify-center gap-1.5 z-10 backdrop-blur">
            {/* Scrubber Bar */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-slate-400 w-11 text-right">
                {formatTime(elapsedSceneTime)}
              </span>
              <div
                className="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer relative group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setElapsedSceneTime(ratio * currentScene.durationSec);
                }}
              >
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full relative"
                  style={{ width: `${Math.min(100, (elapsedSceneTime / Math.max(1, currentScene.durationSec)) * 100)}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md scale-0 group-hover:scale-100 transition-transform" />
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 w-11">
                {formatTime(currentScene.durationSec)}
              </span>
            </div>

            {/* Playback Controls & Settings */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Previous Scene */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => goToScene(activeSceneIndex - 1)}
                  disabled={activeSceneIndex === 0}
                  className="h-8 w-8 text-slate-300 hover:text-white disabled:opacity-30"
                  title="Önceki Bölüm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {/* Rewind 5s */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => seekRelative(-5)}
                  className="h-8 w-8 text-slate-300 hover:text-white"
                  title="5 Saniye Geri (←)"
                >
                  <Rewind className="h-4 w-4" />
                </Button>

                {/* Main Play / Pause */}
                <Button
                  size="sm"
                  onClick={togglePlay}
                  className="h-8 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold gap-1.5 shadow-md shadow-cyan-500/20"
                >
                  {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                  <span className="text-xs">{isPlaying ? 'Durdur' : 'Oynat'}</span>
                </Button>

                {/* Fast Forward 5s */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => seekRelative(5)}
                  className="h-8 w-8 text-slate-300 hover:text-white"
                  title="5 Saniye İleri (→)"
                >
                  <FastForward className="h-4 w-4" />
                </Button>

                {/* Next Scene */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => goToScene(activeSceneIndex + 1)}
                  disabled={activeSceneIndex === scenes.length - 1}
                  className="h-8 w-8 text-slate-300 hover:text-white disabled:opacity-30"
                  title="Sonraki Bölüm"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {/* Mute toggle */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsMuted(m => !m)}
                  className="h-8 w-8 text-slate-300 hover:text-white ml-1"
                  title={isMuted ? 'Sesi Aç (M)' : 'Sesi Kapat (M)'}
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
                </Button>

                {/* Subtitles toggle */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowSubtitles(s => !s)}
                  className={`h-8 w-8 ${showSubtitles ? 'text-cyan-400' : 'text-slate-500'} hover:text-white`}
                  title="Altyazıları Aç/Kapat (CC)"
                >
                  <Subtitles className="h-4 w-4" />
                </Button>
              </div>

              {/* Center Scene Title Indicator */}
              <div className="hidden md:flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-400">
                  Bölüm {activeSceneIndex + 1}/{scenes.length}:
                </span>
                <span className="font-bold text-white truncate max-w-xs">
                  {currentScene.title}
                </span>
              </div>

              {/* Right speed selector */}
              <div className="flex items-center gap-1.5">
                {[0.75, 1.0, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-md transition ${
                      playbackSpeed === spd
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
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

        {/* RIGHT SIDEBAR: "YANLARINDA ÖNEMLİ NOTLARI VE BİLGİLERİ İÇERSİN" */}
        {sidebarOpen && (
          <aside className="w-80 lg:w-96 shrink-0 border-l border-slate-800/80 bg-slate-900/95 flex flex-col z-20 backdrop-blur overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Sidebar Tab Selector */}
            <div className="p-2 border-b border-slate-800 bg-slate-950/60">
              <div className="grid grid-cols-5 gap-1 text-[11px]">
                <button
                  onClick={() => setActiveSidebarTab('notes')}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition ${
                    activeSidebarTab === 'notes'
                      ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title="Önemli Ders Notları"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Notlar</span>
                </button>

                <button
                  onClick={() => setActiveSidebarTab('terms')}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition ${
                    activeSidebarTab === 'terms'
                      ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title="Kavram Sözlüğü"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>Kavramlar</span>
                </button>

                <button
                  onClick={() => setActiveSidebarTab('facts')}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition ${
                    activeSidebarTab === 'facts'
                      ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title="Sınav Hap Bilgileri"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Hap Bilgi</span>
                </button>

                <button
                  onClick={() => setActiveSidebarTab('playlist')}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition ${
                    activeSidebarTab === 'playlist'
                      ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title="Ders Akışı ve Bölümler"
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  <span>Akış</span>
                </button>

                <button
                  onClick={() => setActiveSidebarTab('coach')}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition ${
                    activeSidebarTab === 'coach'
                      ? 'bg-fuchsia-500/15 text-fuchsia-400 font-bold border border-fuchsia-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title="Yapay Zekâ Akıl Hocası"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Akıl Hocası</span>
                </button>
              </div>
            </div>

            {/* TAB CONTENT PANES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* TAB 1: ÖNEMLİ NOTLAR (TAKEAWAYS & EXAM TIP) */}
              {activeSidebarTab === 'notes' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Current Active Scene Header */}
                  <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 border border-cyan-500/30 shadow-sm">
                    <div className="flex items-center justify-between text-[11px] text-cyan-400 font-bold mb-1">
                      <span>BÖLÜM {activeSceneIndex + 1} / {scenes.length}</span>
                      <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300">
                        {currentScene.speaker} ({currentScene.speakerRole})
                      </Badge>
                    </div>
                    <h3 className="font-bold text-sm text-white">{currentScene.title}</h3>
                  </div>

                  {/* Sınav Notu Highlight Card */}
                  {currentScene.examTip && (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/40 shadow-sm space-y-1.5">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                        <Sparkle className="h-3.5 w-3.5 fill-amber-400" />
                        <span>Kritik Sınav Uyarısı</span>
                      </div>
                      <p className="text-amber-100 text-[12px] leading-relaxed font-medium">
                        {currentScene.examTip}
                      </p>
                    </div>
                  )}

                  {/* Key Takeaways list */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                        Bu Bölümden Çıkarılacak Notlar
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {currentScene.keyTakeaways.length} Madde
                      </span>
                    </div>

                    <div className="space-y-2">
                      {currentScene.keyTakeaways.map((note, idx) => (
                        <div
                          key={idx}
                          className="group relative p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                            <p className="text-slate-200 text-xs leading-relaxed flex-1">
                              {note}
                            </p>
                            <button
                              onClick={() => copySnippet(note, `note-${idx}`)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white"
                              title="Notu Kopyala"
                            >
                              {copiedNote === `note-${idx}` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Narration script accordion/preview */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Anlatım Metni (Transkript)
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed italic">
                      "{currentScene.narration}"
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: KAVRAM SÖZLÜĞÜ (KEY TERMS & DEFINITIONS) */}
              {activeSidebarTab === 'terms' && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                      Ders Kavram Sözlüğü
                    </span>
                    <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300">
                      {currentScene.keyTerms.length} Terim
                    </Badge>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Bu sahnede geçen ve sınavda soru potansiyeli taşıyan akademik kavramlar ve tanımları:
                  </p>

                  <div className="space-y-2.5">
                    {currentScene.keyTerms.map((t, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-300 text-xs">
                            {t.term}
                          </span>
                          <button
                            onClick={() => copySnippet(`${t.term}: ${t.definition}`, `term-${idx}`)}
                            className="text-slate-500 hover:text-slate-300"
                            title="Kopyala"
                          >
                            {copiedNote === `term-${idx}` ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          {t.definition}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: SINAV HAP BİLGİLERİ (KEY FACTS) */}
              {activeSidebarTab === 'facts' && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-fuchsia-950/40 to-slate-900 border border-fuchsia-500/30">
                    <div className="flex items-center gap-1.5 text-fuchsia-400 font-bold mb-1">
                      <Sparkles className="h-4 w-4" />
                      <span>Sınav Öncesi Ezber Listesi</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Ders notunuzdan taranan ve sınavda doğrudan gelebilecek kritik hap bilgiler:
                    </p>
                  </div>

                  <div className="space-y-2">
                    {keyFacts.map((fact, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-fuchsia-500/40 transition-colors flex items-start gap-2.5"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-300 font-bold text-[10px]">
                          {idx + 1}
                        </span>
                        <p className="text-slate-200 text-xs leading-relaxed flex-1">
                          {fact}
                        </p>
                      </div>
                    ))}
                  </div>

                  {searches.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Konuyu Pekiştirme Aramaları
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {searches.map((sq, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded-md border border-slate-700"
                          >
                            🔍 {sq}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: DERS AKIŞI / BÖLÜM LİSTESİ */}
              {activeSidebarTab === 'playlist' && (
                <div className="space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                      Tüm Bölümler ({scenes.length})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Toplam: {formatTime(totalDurationSec)}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {scenes.map((sc, idx) => {
                      const isActive = idx === activeSceneIndex;
                      const isDeniz = sc.speaker === 'Deniz';
                      return (
                        <div
                          key={sc.id}
                          onClick={() => goToScene(idx)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2.5 ${
                            isActive
                              ? 'bg-cyan-500/15 border-cyan-500/50 shadow-sm'
                              : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div
                            className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isActive
                                ? 'bg-cyan-500 text-slate-950 font-black'
                                : isDeniz
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/50'
                                : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                            }`}
                          >
                            {isActive ? <Play className="h-3.5 w-3.5 fill-current" /> : idx + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold ${isDeniz ? 'text-cyan-400' : 'text-rose-400'}`}>
                                {sc.speaker}
                              </span>
                              <span className="text-[10px] text-slate-500">·</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatTime(sc.durationSec)}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-200 truncate">
                              {sc.title}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 5: YAPAY ZEKÂ AKIL HOCASI (IN-STUDIO CHAT) */}
              {activeSidebarTab === 'coach' && (
                <div className="flex flex-col h-[calc(100vh-180px)] animate-in fade-in">
                  <div className="p-2.5 rounded-xl bg-gradient-to-r from-fuchsia-950/30 to-purple-950/20 border border-fuchsia-500/30 mb-2">
                    <p className="text-[11px] text-fuchsia-200">
                      Bu video dersine özel sorular sorabilir, Deniz ve Barış'ın anlattığı konuları derinleştirebilirsin.
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {coachMessages.map((m, i) => (
                      <div
                        key={i}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-fuchsia-600 text-white rounded-br-none'
                              : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                          }`}
                        >
                          {m.role === 'assistant' ? (
                            <div className="prose prose-invert prose-xs max-w-none">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                          ) : (
                            m.content
                          )}
                        </div>
                      </div>
                    ))}
                    {coachLoading && (
                      <div className="flex justify-start">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-400" />
                          <span>Akıl Hocası düşünüyor...</span>
                        </div>
                      </div>
                    )}
                    <div ref={coachEndRef} />
                  </div>

                  {/* Quick questions */}
                  <div className="py-2 flex flex-wrap gap-1 border-t border-slate-800/80 mt-2">
                    {[
                      'Bu sahneyi daha basit özetle',
                      'Sınavda buradan ne sorulur?',
                      'Somut bir örnek ver',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendCoachQuestion(q)}
                        disabled={coachLoading}
                        className="text-[10px] px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Input form */}
                  <div className="flex gap-1.5 pt-1">
                    <Input
                      placeholder="Bir soru sor..."
                      value={coachInput}
                      onChange={e => setCoachInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendCoachQuestion();
                        }
                      }}
                      disabled={coachLoading}
                      className="h-8 text-xs bg-slate-950 border-slate-800 text-white flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => sendCoachQuestion()}
                      disabled={coachLoading || !coachInput.trim()}
                      className="h-8 px-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
                    >
                      {coachLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 3. EXPORT MP4 PROGRESS DIALOG */}
      <Dialog open={isExporting} onOpenChange={() => {}}>
        <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-cyan-400">
              <Download className="h-4 w-4" />
              <span>Animasyonlu MP4 Video Üretiliyor</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Ders sahneleri, karakter hareketleri ve ses dalgaları tek tek işleniyor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium truncate max-w-[260px]">
                {exportStatusText}
              </span>
              <span className="font-mono font-bold text-cyan-400">%{exportProgress}</span>
            </div>
            <Progress value={exportProgress} className="h-2 bg-slate-800" />
            <p className="text-[11px] text-slate-500 text-center">
              Lütfen pencereyi kapatmayın, indirme otomatik olarak başlayacaktır.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InteractiveVideoStudio;
