import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Download, Sparkles, Video,
  Radio, Layers, CheckCircle2, ChevronRight, ChevronLeft,
  ExternalLink, Mic, Headphones, FileText, Loader2, Flame, Lightbulb,
  Brain, Target, Rocket, Activity, BarChart3, LineChart, Network,
  Zap, Compass, BookmarkCheck
} from 'lucide-react';
import { toast } from 'sonner';

export interface StudyMaterial {
  id: string;
  user_id: string;
  source_type: string;
  source_note_id: string | null;
  material_type: 'flashcards' | 'quiz' | 'summary' | 'video';
  title: string;
  course: string | null;
  content: any;
  created_at: string;
}

interface NormalizedScene {
  id: string;
  index: number;
  time: string;
  speaker: string;
  speakerRole: string;
  title: string;
  narration: string;
  keyTakeaways: string[];
  visualCue: string;
  chartType: 'curve' | 'network' | 'bars' | 'formula';
  durationSeconds: number;
}

interface FloatingEmoji {
  id: number;
  x: number;
  y: number;
  emoji: string;
  vy: number;
  vx: number;
  alpha: number;
  size: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
}

interface InteractiveVideoStudioProps {
  material: StudyMaterial;
}

export const InteractiveVideoStudio: React.FC<InteractiveVideoStudioProps> = ({ material }) => {
  const content = material.content || {};
  const rawScenes = Array.isArray(content.scenes) ? content.scenes : [];
  const videoTitle = content.podcastTitle || content.videoTitle || material.title || 'Animasyonlu Görsel Ders';
  const outline = content.outline || 'Ders notundaki kavramların canlı animasyonlu karakterler ve grafiklerle anlatımı.';
  const suggestedSearches: string[] = Array.isArray(content.suggestedSearches) ? content.suggestedSearches : [];

  // Determine chart types dynamically based on scene content
  const scenes: NormalizedScene[] = useMemo(() => {
    if (rawScenes.length === 0) {
      return [{
        id: 'scene-0',
        index: 0,
        time: '00:00',
        speaker: 'Deniz',
        speakerRole: 'Akademik Anlatıcı',
        title: 'Giriş ve Kavramsal Çerçeve',
        narration: outline,
        keyTakeaways: ['Ders notu kavramları animasyonla inceleniyor', 'Kritik sınav noktaları ve grafikler gösteriliyor'],
        visualCue: 'Piyasa Dengesi ve Fiyat Mekanizması',
        chartType: 'curve',
        durationSeconds: 10,
      }];
    }

    const chartTypes: ('curve' | 'network' | 'bars' | 'formula')[] = ['curve', 'bars', 'network', 'formula'];

    return rawScenes.map((s: any, idx: number) => {
      const isEven = idx % 2 === 0;
      const speakerName = s.speaker || (isEven ? 'Deniz' : 'Barış');
      const speakerRole = s.speakerRole || (isEven ? 'Akademik Anlatıcı' : 'Sorgulayıcı & Özetleyen');
      const text = s.narration || s.title || '';
      
      const calculatedDuration = Math.max(6, Math.min(28, Math.round(text.length / 13)));

      let takeaways: string[] = Array.isArray(s.keyTakeaways) ? s.keyTakeaways.filter(Boolean) : [];
      if (takeaways.length === 0) {
        if (s.visualCue) takeaways.push(s.visualCue);
        const sentences = text.split(/[.?!]/).map((st: string) => st.trim()).filter((st: string) => st.length > 15);
        if (sentences.length > 0) takeaways.push(sentences[0]);
      }

      // Infer chart type from text
      let chosenChart = chartTypes[idx % chartTypes.length];
      const lower = (text + ' ' + (s.visualCue || '')).toLowerCase();
      if (lower.includes('formül') || lower.includes('denklem') || lower.includes('hesap')) chosenChart = 'formula';
      else if (lower.includes('büyüme') || lower.includes('oran') || lower.includes('yüzde') || lower.includes('karşılaştırma')) chosenChart = 'bars';
      else if (lower.includes('ağ') || lower.includes('ilişki') || lower.includes('harita') || lower.includes('zincir')) chosenChart = 'network';
      else chosenChart = 'curve';

      return {
        id: `scene-${idx}`,
        index: idx,
        time: s.time || `${Math.floor((idx * 15) / 60).toString().padStart(2, '0')}:${((idx * 15) % 60).toString().padStart(2, '0')}`,
        speaker: speakerName,
        speakerRole,
        title: s.title || `Bölüm ${idx + 1}`,
        narration: text,
        keyTakeaways: takeaways.slice(0, 3),
        visualCue: s.visualCue || 'Animasyonlu Tahta ve Grafik Çizimi',
        chartType: chosenChart,
        durationSeconds: calculatedDuration,
      };
    });
  }, [rawScenes, outline]);

  // Total duration in seconds
  const totalDuration = useMemo(() => {
    return scenes.reduce((acc, s) => acc + s.durationSeconds, 0);
  }, [scenes]);

  // Playback state
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [elapsedSceneTime, setElapsedSceneTime] = useState(0);
  const [manualChartMode, setManualChartMode] = useState<'auto' | 'curve' | 'network' | 'bars' | 'formula'>('auto');
  
  // Interactive reaction counters
  const [reactions, setReactions] = useState<{ [key: string]: number }>({
    '🔥': 42,
    '💡': 68,
    '🧠': 51,
    '🎯': 89,
    '🚀': 37,
  });

  // Export modal state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // Floating emojis and particles ref
  const floatingEmojisRef = useRef<FloatingEmoji[]>([]);
  const particlesRef = useRef<AmbientParticle[]>([]);
  
  // Canvas ref & animation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const activeSceneIndexRef = useRef(activeSceneIndex);
  activeSceneIndexRef.current = activeSceneIndex;

  const currentScene = scenes[activeSceneIndex] || scenes[0];
  const activeChart = manualChartMode === 'auto' ? currentScene.chartType : manualChartMode;

  // Initialize ambient drifting particles once
  useEffect(() => {
    const parts: AmbientParticle[] = [];
    const colors = ['#06b6d4', '#3b82f6', '#f43f5e', '#a855f7', '#38bdf8', '#10b981'];
    for (let i = 0; i < 40; i++) {
      parts.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        radius: 1.5 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.15 + Math.random() * 0.35,
      });
    }
    particlesRef.current = parts;
  }, []);

  // Helper to format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fun sound chime using Web Audio API
  const playSoundEffect = useCallback((type: 'chime' | 'pop' = 'pop') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'pop') {
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.13);
      } else if (type === 'chime') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
      }
    } catch {
      // AudioContext fallback
    }
  }, []);

  // Trigger interactive floating emoji
  const addReaction = (emoji: string) => {
    playSoundEffect('pop');
    setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));

    for (let i = 0; i < 4; i++) {
      floatingEmojisRef.current.push({
        id: Date.now() + Math.random(),
        x: 580 + (Math.random() - 0.5) * 360,
        y: 650 + Math.random() * 40,
        emoji,
        vy: -3 - Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 2,
        alpha: 1.0,
        size: 28 + Math.random() * 14,
      });
    }
  };

  // Speech synthesis for active scene with distinct voice pitch
  const playSpeechForScene = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;

    const scene = scenes[index];
    if (!scene) return;

    const isHostBaris = scene.speaker.toLowerCase().includes('barış');
    const utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = 'tr-TR';
    utterance.pitch = isHostBaris ? 0.88 : 1.15;
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
        playSoundEffect('chime');
        setActiveSceneIndex(index + 1);
        setElapsedSceneTime(0);
        playSpeechForScene(index + 1);
      } else {
        setIsPlaying(false);
        setActiveSceneIndex(0);
        setElapsedSceneTime(0);
        toast.success('🎉 Animasyonlu video dersi tamamlandı!');
      }
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [scenes, isMuted, playbackSpeed, playSoundEffect]);

  const stopSpeech = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speechRef.current = null;
  }, []);

  // Handle Play/Pause
  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    } else {
      setIsPlaying(true);
      playSpeechForScene(activeSceneIndex);
    }
  };

  // Skip to specific scene
  const goToScene = (index: number) => {
    const nextIdx = Math.max(0, Math.min(scenes.length - 1, index));
    stopSpeech();
    setActiveSceneIndex(nextIdx);
    setElapsedSceneTime(0);
    playSoundEffect('chime');
    if (isPlaying) {
      playSpeechForScene(nextIdx);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [stopSpeech]);

  // ==========================================
  // MASTER VECTOR DRAWING FUNCTIONS FOR CANVAS
  // ==========================================

  // 1. Draw Animated Character: DENİZ (Left Analyst with glasses, stylus & laser pointer)
  const drawDenizCharacter = (
    ctx: CanvasRenderingContext2D,
    baseX: number,
    baseY: number,
    isSpeaking: boolean,
    now: number
  ) => {
    ctx.save();
    // Breathing & speaking body sway
    const breathing = Math.sin(now / 450) * 3;
    const speakingBounce = isSpeaking ? Math.sin(now / 120) * 2.5 : 0;
    const y = baseY + breathing + speakingBounce;
    const x = baseX;

    // Active Speaker Energy Aura
    if (isSpeaking) {
      const auraGrad = ctx.createRadialGradient(x + 60, y + 80, 10, x + 60, y + 80, 150);
      auraGrad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
      auraGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(x + 60, y + 80, 150, 0, Math.PI * 2);
      ctx.fill();
    }

    // Torso / Smart Navy Blazer
    ctx.fillStyle = '#0f2744';
    ctx.beginPath();
    ctx.roundRect(x + 20, y + 105, 80, 140, [24, 24, 4, 4]);
    ctx.fill();

    // Inner White Shirt & Tie
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x + 48, y + 105);
    ctx.lineTo(x + 60, y + 140);
    ctx.lineTo(x + 72, y + 105);
    ctx.closePath();
    ctx.fill();

    // Cyan Tie
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(x + 58, y + 115);
    ctx.lineTo(x + 62, y + 115);
    ctx.lineTo(x + 65, y + 155);
    ctx.lineTo(x + 60, y + 165);
    ctx.lineTo(x + 55, y + 155);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = '#fbcfe8';
    ctx.fillRect(x + 48, y + 82, 24, 26);

    // Head / Face
    ctx.fillStyle = '#fde2e4';
    ctx.beginPath();
    ctx.roundRect(x + 30, y + 25, 60, 68, 28);
    ctx.fill();

    // Hair (Neat Academic Brunette)
    ctx.fillStyle = '#261c14';
    ctx.beginPath();
    ctx.arc(x + 60, y + 36, 36, Math.PI, Math.PI * 2);
    ctx.roundRect(x + 24, y + 26, 72, 28, 14);
    ctx.fill();

    // Glasses (Smart Cyan Glow Frames)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3;
    // Left Lens
    ctx.strokeRect(x + 36, y + 46, 20, 15);
    // Right Lens
    ctx.strokeRect(x + 64, y + 46, 20, 15);
    // Bridge
    ctx.beginPath();
    ctx.moveTo(x + 56, y + 53);
    ctx.lineTo(x + 64, y + 53);
    ctx.stroke();

    // Eyes (Blinking animation every ~3.5 seconds)
    const isBlinking = (now % 3500) < 180;
    if (isBlinking) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + 40, y + 54);
      ctx.lineTo(x + 52, y + 54);
      ctx.moveTo(x + 68, y + 54);
      ctx.lineTo(x + 80, y + 54);
      ctx.stroke();
    } else {
      // Pupils looking towards the center smartboard!
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(x + 48, y + 54, 4, 0, Math.PI * 2);
      ctx.arc(x + 76, y + 54, 4, 0, Math.PI * 2);
      ctx.fill();

      // Catchlight in eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + 49, y + 52, 1.5, 0, Math.PI * 2);
      ctx.arc(x + 77, y + 52, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth (Animated Lip-Sync when speaking)
    if (isSpeaking) {
      const mouthOpen = 3 + Math.abs(Math.sin(now / 90)) * 8;
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.ellipse(x + 60, y + 74, 9, mouthOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      // Teeth
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 54, y + 74 - mouthOpen + 1, 12, 3);
    } else {
      // Gentle smile
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 60, y + 70, 7, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }

    // Right Arm pointing glowing digital stylus towards the board
    ctx.strokeStyle = '#0f2744';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 88, y + 130);
    // Arm points up-right to the smartboard
    const pointerAngle = Math.sin(now / 300) * 0.08;
    const handX = x + 160;
    const handY = y + 100 + pointerAngle * 30;
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Hand holding stylus
    ctx.fillStyle = '#fde2e4';
    ctx.beginPath();
    ctx.arc(handX, handY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Stylus pen
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handX + 30, handY - 15);
    ctx.stroke();

    // Laser beam from stylus to the smartboard graph!
    if (isSpeaking) {
      const laserEndTargetX = 520 + Math.sin(now / 400) * 50;
      const laserEndTargetY = 280 + Math.cos(now / 350) * 40;
      
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(handX + 30, handY - 15);
      ctx.lineTo(laserEndTargetX, laserEndTargetY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Laser dot on board
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(laserEndTargetX, laserEndTargetY, 5 + Math.sin(now / 100) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name Tag Badge Below Deniz
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isSpeaking ? '#06b6d4' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 252, 100, 32, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Deniz 🎓', x + 60, y + 272);

    ctx.restore();
  };

  // 2. Draw Animated Character: BARIŞ (Right Inquirer with hoodie, headphones & gestures)
  const drawBarisCharacter = (
    ctx: CanvasRenderingContext2D,
    baseX: number,
    baseY: number,
    isSpeaking: boolean,
    now: number
  ) => {
    ctx.save();
    const breathing = Math.sin((now + 300) / 450) * 3;
    const speakingBounce = isSpeaking ? Math.sin(now / 110) * 2.5 : 0;
    const y = baseY + breathing + speakingBounce;
    const x = baseX;

    // Active Speaker Energy Aura
    if (isSpeaking) {
      const auraGrad = ctx.createRadialGradient(x + 60, y + 80, 10, x + 60, y + 80, 150);
      auraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
      auraGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(x + 60, y + 80, 150, 0, Math.PI * 2);
      ctx.fill();
    }

    // Torso / Crimson Modern Hoodie
    ctx.fillStyle = '#881337';
    ctx.beginPath();
    ctx.roundRect(x + 20, y + 105, 80, 140, [24, 24, 4, 4]);
    ctx.fill();

    // Hoodie strings & pocket
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + 50, y + 115);
    ctx.lineTo(x + 50, y + 145);
    ctx.moveTo(x + 70, y + 115);
    ctx.lineTo(x + 70, y + 145);
    ctx.stroke();

    // Neck
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(x + 48, y + 82, 24, 26);

    // Head / Face
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.roundRect(x + 30, y + 25, 60, 68, 28);
    ctx.fill();

    // Hair (Messy/Wavy Modern Brown)
    ctx.fillStyle = '#3f2212';
    ctx.beginPath();
    ctx.arc(x + 60, y + 36, 36, Math.PI * 0.9, Math.PI * 2.1);
    ctx.roundRect(x + 22, y + 18, 76, 32, 16);
    ctx.fill();

    // Glowing DJ Headphones around ears
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x + 60, y + 42, 38, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    // Ear cushions
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.roundRect(x + 20, y + 40, 12, 26, 6);
    ctx.roundRect(x + 88, y + 40, 12, 26, 6);
    ctx.fill();

    // Eyes (Blinking animation every ~4.2 seconds)
    const isBlinking = ((now + 800) % 4200) < 180;
    if (isBlinking) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + 40, y + 54);
      ctx.lineTo(x + 52, y + 54);
      ctx.moveTo(x + 68, y + 54);
      ctx.lineTo(x + 80, y + 54);
      ctx.stroke();
    } else {
      // Pupils looking towards the center smartboard!
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(x + 44, y + 54, 4, 0, Math.PI * 2);
      ctx.arc(x + 72, y + 54, 4, 0, Math.PI * 2);
      ctx.fill();

      // Catchlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + 43, y + 52, 1.5, 0, Math.PI * 2);
      ctx.arc(x + 71, y + 52, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth (Animated Lip-Sync when speaking)
    if (isSpeaking) {
      const mouthOpen = 3 + Math.abs(Math.sin(now / 95)) * 8;
      ctx.fillStyle = '#881337';
      ctx.beginPath();
      ctx.ellipse(x + 60, y + 74, 9, mouthOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 54, y + 74 - mouthOpen + 1, 12, 3);
    } else {
      // Attentive listening / slight smile
      ctx.strokeStyle = '#881337';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 60, y + 70, 6, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }

    // Left Arm (Gesturing in question or taking notes)
    ctx.strokeStyle = '#881337';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 32, y + 130);
    // Gesturing hand raised in thought
    const questionSway = isSpeaking ? Math.sin(now / 200) * 15 : 0;
    const handX = x - 35;
    const handY = y + 120 + questionSway;
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Hand
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.arc(handX, handY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Fun Speech Bubble / Lightbulb above Barış when active
    if (isSpeaking) {
      ctx.save();
      ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - 20, y - 28, 55, 30, 12);
      ctx.fill();
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💡❓', x + 7, y - 8);
      ctx.restore();
    }

    // Name Tag Badge Below Barış
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isSpeaking ? '#f43f5e' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 252, 100, 32, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Barış 💡', x + 60, y + 272);

    ctx.restore();
  };

  // 3. Draw Dynamic Economics Graphics Engine on Smartboard
  const drawDynamicChart = (
    ctx: CanvasRenderingContext2D,
    type: 'curve' | 'network' | 'bars' | 'formula',
    cx: number,
    cy: number,
    cw: number,
    ch: number,
    now: number,
    scene: NormalizedScene
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();

    if (type === 'curve') {
      // ----------------------------------------------------
      // A) SUPPLY & DEMAND CURVES (Arz ve Talep Eğrisi)
      // ----------------------------------------------------
      const originX = cx + 55;
      const originY = cy + ch - 35;
      const axisW = cw - 90;
      const axisH = ch - 65;

      // Coordinate axes
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Y-axis (Price / Fiyat)
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX, originY - axisH);
      // X-axis (Quantity / Miktar)
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX + axisW, originY);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText('P (Fiyat)', originX - 45, originY - axisH + 12);
      ctx.fillText('Q (Miktar)', originX + axisW - 25, originY + 22);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let g = 1; g <= 4; g++) {
        ctx.beginPath();
        ctx.moveTo(originX, originY - (axisH / 5) * g);
        ctx.lineTo(originX + axisW, originY - (axisH / 5) * g);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(originX + (axisW / 5) * g, originY);
        ctx.lineTo(originX + (axisW / 5) * g, originY - axisH);
        ctx.stroke();
      }

      // Dynamic curve shift modulation
      const shift = Math.sin(now / 800) * 12;

      // Demand Curve (D - Talep: Rose, slope downward)
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(244, 63, 94, 0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(originX + 20 + shift, originY - axisH + 20);
      ctx.bezierCurveTo(
        originX + axisW * 0.4 + shift, originY - axisH * 0.6,
        originX + axisW * 0.7 + shift, originY - axisH * 0.3,
        originX + axisW - 20 + shift, originY - 20
      );
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillText('D (Talep)', originX + axisW - 15 + shift, originY - 25);

      // Supply Curve (S - Arz: Cyan, slope upward)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(6, 182, 212, 0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(originX + 20, originY - 20);
      ctx.bezierCurveTo(
        originX + axisW * 0.3, originY - axisH * 0.3,
        originX + axisW * 0.6, originY - axisH * 0.6,
        originX + axisW - 20, originY - axisH + 20
      );
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillText('S (Arz)', originX + axisW - 15, originY - axisH + 30);

      // Equilibrium Point E* (Denge Noktası)
      const eqX = originX + axisW * 0.5 + shift * 0.5;
      const eqY = originY - axisH * 0.5;

      // Dashed projection lines to axes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(eqX, eqY);
      ctx.lineTo(originX, eqY);
      ctx.moveTo(eqX, eqY);
      ctx.lineTo(eqX, originY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px font-mono, monospace';
      ctx.fillText('Pe*', originX - 25, eqY + 4);
      ctx.fillText('Qe*', eqX - 8, originY + 16);

      // Pulsing Equilibrium node
      const pulseR = 6 + Math.sin(now / 150) * 2.5;
      ctx.fillStyle = '#fbbf24'; // Amber-gold
      ctx.shadowColor = 'rgba(251, 191, 36, 0.9)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(eqX, eqY, pulseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText('E* (Piyasa Dengesi)', eqX + 12, eqY - 10);

    } else if (type === 'bars') {
      // ----------------------------------------------------
      // B) GROWTH & COMPARISON BARS (Büyüme & Trend Grafiği)
      // ----------------------------------------------------
      const barCount = 4;
      const bW = (cw - 80) / barCount - 25;
      const labels = ['Verimlilik', 'Marjinal Kâr', 'Talep Esnekliği', 'Toplam Hasılat'];
      const heights = [0.45, 0.85, 0.65, 0.92];
      const colors = [
        ['#06b6d4', '#3b82f6'],
        ['#10b981', '#059669'],
        ['#f59e0b', '#d97706'],
        ['#f43f5e', '#be123c'],
      ];

      for (let b = 0; b < barCount; b++) {
        const bX = cx + 50 + b * (bW + 25);
        // Spring bounce animation on bars
        const animatedH = (ch - 80) * heights[b] * (0.92 + 0.08 * Math.sin(now / 300 + b));
        const bY = cy + ch - 40 - animatedH;

        // Gradient Bar
        const bGrad = ctx.createLinearGradient(0, bY, 0, cy + ch - 40);
        bGrad.addColorStop(0, colors[b][0]);
        bGrad.addColorStop(1, colors[b][1]);
        ctx.fillStyle = bGrad;
        ctx.shadowColor = colors[b][0];
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(bX, bY, bW, animatedH, [10, 10, 2, 2]);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Percentage Badge
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px font-mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`+${Math.round(heights[b] * 100)}%`, bX + bW / 2, bY - 8);

        // Label below
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(labels[b], bX + bW / 2, cy + ch - 18);
      }
      ctx.textAlign = 'left';

    } else if (type === 'network') {
      // ----------------------------------------------------
      // C) CONCEPT NETWORK / MIND MAP (Zihin Haritası)
      // ----------------------------------------------------
      const centerX = cx + cw / 2;
      const centerY = cy + ch / 2 - 10;
      const nodes = [
        { label: 'Temel Prensip', x: centerX, y: centerY, r: 36, color: '#06b6d4' },
        { label: 'Fırsat Maliyeti', x: centerX - 140, y: centerY - 50, r: 28, color: '#f59e0b' },
        { label: 'Esneklik', x: centerX + 140, y: centerY - 50, r: 28, color: '#f43f5e' },
        { label: 'Marjinal Fayda', x: centerX - 120, y: centerY + 65, r: 26, color: '#10b981' },
        { label: 'Kâr Maksimizasyonu', x: centerX + 120, y: centerY + 65, r: 26, color: '#8b5cf6' },
      ];

      // Draw pulsating network connecting lines
      nodes.slice(1).forEach((nd, i) => {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(nd.x, nd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated light packet traveling along the wire
        const packetT = ((now / 600) + i * 0.25) % 1;
        const pkX = centerX + (nd.x - centerX) * packetT;
        const pkY = centerY + (nd.y - centerY) * packetT;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(pkX, pkY, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Glowing Nodes
      nodes.forEach((nd) => {
        ctx.fillStyle = nd.color;
        ctx.shadowColor = nd.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nd.label, nd.x, nd.y);
      });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

    } else {
      // ----------------------------------------------------
      // D) FORMULA & LAW BOARD (Akademik Formül & Prensip)
      // ----------------------------------------------------
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx + 40, cy + 30, cw - 80, ch - 60, 16);
      ctx.fill();
      ctx.stroke();

      // Top Header
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px "Space Grotesk", sans-serif';
      ctx.fillText('AKADEMİK ANALİZ & MATEMATİKSEL MODEL', cx + 60, cy + 62);

      // Large Glowing Formula
      const formula = 'MR = MC  ⇒  Kâr Maksimizasyonu Koşulu';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Space Grotesk", monospace';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.fillText(formula, cx + 60, cy + 110);
      ctx.shadowBlur = 0;

      // Formula breakdown items
      const formulasList = [
        '• Marjinal Hasılat (MR) = Marjinal Maliyet (MC) dengesi sağlanmalıdır.',
        '• Fiyat Esnekliği: Ed = (%ΔQ) / (%ΔP)',
        '• Tüketici Artığı = Ödemeye Hazır Olunan Fiyat - Gerçek Fiyat',
      ];
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px Inter, sans-serif';
      formulasList.forEach((fm, fIdx) => {
        ctx.fillText(fm, cx + 60, cy + 148 + fIdx * 26);
      });
    }

    ctx.restore();
  };

  // 4. Draw Full Central Smartboard Stage
  const drawSmartboard = (
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    scene: NormalizedScene,
    sceneIdx: number,
    totalScenes: number,
    activeChartType: 'curve' | 'network' | 'bars' | 'formula',
    now: number
  ) => {
    ctx.save();

    // Outer Bezel / Glowing Frame
    ctx.fillStyle = 'rgba(10, 15, 28, 0.94)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 20);
    ctx.fill();
    ctx.stroke();

    // Top Smartboard Status Bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 42, [20, 20, 0, 0]);
    ctx.fill();

    // Chart Type Badge
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(bx + 26, by + 21, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText(`AKILLI TAHTA · ${scene.title}`, bx + 40, by + 25);

    // Chart mode pill (Top Right of board)
    const chartLabels = {
      curve: '📊 ARZ-TALEP GRAFİĞİ',
      network: '🧠 KAVRAM HARİTASI',
      bars: '📈 BÜYÜME VE TREND',
      formula: '📝 FORMÜL MODELİ',
    };
    ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.beginPath();
    ctx.roundRect(bx + bw - 180, by + 10, 165, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(chartLabels[activeChartType], bx + bw - 98, by + 26);
    ctx.textAlign = 'left';

    // Draw the dynamic animated graphic chart
    drawDynamicChart(ctx, activeChartType, bx + 15, by + 50, bw - 30, bh - 110, now, scene);

    // Bottom Takeaways Ticker inside Board
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(bx + 15, by + bh - 55, bw - 30, 42, 12);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText('🎯 Sınav Notu: ', bx + 30, by + bh - 28);

    const firstPoint = scene.keyTakeaways[0] || scene.visualCue || scene.title;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '12px Inter, sans-serif';
    const truncatedNote = firstPoint.length > 70 ? firstPoint.substring(0, 67) + '...' : firstPoint;
    ctx.fillText(truncatedNote, bx + 115, by + bh - 28);

    ctx.restore();
  };

  // Master Frame Drawing Function
  const drawFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scene: NormalizedScene,
    sceneIdx: number,
    totalScenes: number,
    timeSecs: number,
    playing: boolean,
    courseName: string,
    mainTitle: string,
    chartType: 'curve' | 'network' | 'bars' | 'formula',
    particles: AmbientParticle[],
    emojis: FloatingEmoji[]
  ) => {
    const isDenizActive = !scene.speaker.toLowerCase().includes('barış');
    const now = Date.now();

    // 1. Futuristic Cyber-Studio Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#040711');
    bgGrad.addColorStop(0.5, '#080d22');
    bgGrad.addColorStop(1, '#03050d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Animated Ambient Floating Particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha + 0.1 * Math.sin(now / 500 + p.x);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 3. Top Header Bar
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(30, 16, 380, 40, 20);
    ctx.fill();
    ctx.stroke();

    // Red Live Recording Dot
    const dotPulse = playing ? 0.7 + 0.3 * Math.sin(now / 180) : 0.8;
    ctx.fillStyle = `rgba(239, 68, 68, ${dotPulse})`;
    ctx.beginPath();
    ctx.arc(52, 36, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Space Grotesk", Inter, sans-serif';
    ctx.fillText('ECONNOTES CANLI ANİMASYONLU STÜDYO', 70, 40);

    // Top Right Info
    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`${courseName || 'Ders Notu'} · Sahne ${sceneIdx + 1}/${totalScenes}`, width - 35, 34);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px font-mono, monospace';
    ctx.fillText('HD 1080P · DİNAMİK GRAFİK MOTORU', width - 35, 50);
    ctx.restore();

    // 4. Center Stage: Central Smartboard (x: 230 to 1050, y: 72 to 520)
    const boardX = 230;
    const boardY = 72;
    const boardW = width - 460;
    const boardH = 450;
    drawSmartboard(ctx, boardX, boardY, boardW, boardH, scene, sceneIdx, totalScenes, chartType, now);

    // 5. Left Stage: Animated Character DENİZ (x = 35, y = 140)
    drawDenizCharacter(ctx, 35, 140, isDenizActive && playing, now);

    // 6. Right Stage: Animated Character BARIŞ (x = width - 160, y = 140)
    drawBarisCharacter(ctx, width - 165, 140, !isDenizActive && playing, now);

    // 7. Kinetic Karaoke Subtitles (Bottom: y = 535 to 695)
    ctx.save();
    const subX = 50;
    const subY = 535;
    const subW = width - 100;
    const subH = 158;

    ctx.fillStyle = 'rgba(7, 11, 22, 0.96)';
    ctx.strokeStyle = isDenizActive ? 'rgba(6, 182, 212, 0.5)' : 'rgba(244, 63, 94, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(subX, subY, subW, subH, 20);
    ctx.fill();
    ctx.stroke();

    // Speaker Indicator
    ctx.fillStyle = isDenizActive ? '#06b6d4' : '#f43f5e';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillText(`🎙️ ${scene.speaker.toUpperCase()} (${scene.speakerRole}):`, subX + 28, subY + 34);

    // Kinetic Karaoke text
    const words = scene.narration.split(' ');
    const totalWords = words.length;
    const spokenProgressRatio = Math.min(1.0, timeSecs / Math.max(1, scene.durationSeconds));
    const currentSpokenWordIndex = Math.floor(spokenProgressRatio * totalWords);

    let curX = subX + 28;
    let curY = subY + 70;
    const lineHeight = 30;
    const maxLineRight = subX + subW - 35;

    ctx.font = '18px Inter, sans-serif';
    words.forEach((w, wIdx) => {
      const wordMetrics = ctx.measureText(w + ' ');
      if (curX + wordMetrics.width > maxLineRight) {
        curX = subX + 28;
        curY += lineHeight;
      }

      if (curY < subY + subH - 12) {
        if (wIdx <= currentSpokenWordIndex && playing) {
          ctx.fillStyle = isDenizActive ? '#38bdf8' : '#fb7185';
          ctx.font = 'bold 18px Inter, sans-serif';
        } else {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '18px Inter, sans-serif';
        }
        ctx.fillText(w, curX, curY);
        curX += wordMetrics.width;
      }
    });
    ctx.restore();

    // 8. Floating Interactive Emojis
    for (let i = emojis.length - 1; i >= 0; i--) {
      const em = emojis[i];
      em.y += em.vy;
      em.x += em.vx;
      em.alpha -= 0.015;

      if (em.alpha <= 0 || em.y < 50) {
        emojis.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = em.alpha;
      ctx.font = `${em.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(em.emoji, em.x, em.y);
      ctx.restore();
    }

    // 9. Bottom Progress Bar (y = 708 to 720)
    ctx.save();
    const timelineY = height - 10;
    const overallProgress = (sceneIdx + (timeSecs / Math.max(1, scene.durationSeconds))) / totalScenes;
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, timelineY, width, 10);

    const barGrad = ctx.createLinearGradient(0, 0, width, 0);
    barGrad.addColorStop(0, '#06b6d4');
    barGrad.addColorStop(0.5, '#3b82f6');
    barGrad.addColorStop(1, '#f43f5e');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, timelineY, Math.min(width, Math.max(0, width * overallProgress)), 10);
    ctx.restore();
  }, []);

  // Animation Loop for live player
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      if (isPlaying) {
        setElapsedSceneTime(prev => {
          const next = prev + delta * playbackSpeed;
          const scene = scenes[activeSceneIndexRef.current];
          if (scene && next >= scene.durationSeconds) {
            if (!speechRef.current) {
              const nextIdx = activeSceneIndexRef.current + 1;
              if (nextIdx < scenes.length) {
                setActiveSceneIndex(nextIdx);
                playSoundEffect('chime');
                playSpeechForScene(nextIdx);
                return 0;
              } else {
                setIsPlaying(false);
                return 0;
              }
            }
          }
          return next;
        });
      }

      drawFrame(
        ctx,
        1280,
        720,
        currentScene,
        activeSceneIndex,
        scenes.length,
        elapsedSceneTime,
        isPlaying,
        material.course || 'EconNotes',
        videoTitle,
        activeChart,
        particlesRef.current,
        floatingEmojisRef.current
      );

      animId = requestAnimationFrame(render);
    };

    lastTickRef.current = Date.now();
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [drawFrame, currentScene, activeSceneIndex, scenes, elapsedSceneTime, isPlaying, material.course, videoTitle, activeChart, playbackSpeed, playSpeechForScene, playSoundEffect]);

  // High Quality MP4 Video Export Engine
  const handleExportMP4 = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Animasyonlu video motoru başlatılıyor...');

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
        if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        } else {
          mimeType = '';
        }
      }

      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: 3000000,
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      const mediaRecorder = new MediaRecorder(canvasStream, recorderOptions);
      const recordedChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.start(100);

      const totalScenes = scenes.length;
      for (let sIdx = 0; sIdx < totalScenes; sIdx++) {
        const scene = scenes[sIdx];
        const sceneDuration = Math.min(scene.durationSeconds, 8);
        const fps = 30;
        const totalFrames = sceneDuration * fps;

        setExportStatusText(`Bölüm ${sIdx + 1} / ${totalScenes}: ${scene.speaker} (${scene.title}) animasyonu işleniyor...`);

        const isBaris = scene.speaker.toLowerCase().includes('barış');
        osc.frequency.setValueAtTime(isBaris ? 280 : 420, audioCtx.currentTime);

        for (let f = 0; f < totalFrames; f++) {
          const timeSecs = f / fps;
          drawFrame(
            exportCtx,
            1280,
            720,
            scene,
            sIdx,
            totalScenes,
            timeSecs,
            true,
            material.course || 'EconNotes',
            videoTitle,
            scene.chartType,
            particlesRef.current,
            []
          );

          const currentTotalFrames = sIdx * totalFrames + f;
          const grandTotalFrames = totalScenes * totalFrames;
          const pct = Math.round((currentTotalFrames / grandTotalFrames) * 95);
          setExportProgress(pct);

          if (f % 10 === 0) {
            await new Promise(r => setTimeout(r, 16));
          }
        }
      }

      setExportProgress(98);
      setExportStatusText('MP4 dosyası derleniyor ve indirilmeye hazırlanıyor...');

      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve();
        mediaRecorder.stop();
        osc.stop();
        audioCtx.close();
      });

      const videoBlob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
      const downloadUrl = URL.createObjectURL(videoBlob);

      const safeTitle = (material.course ? `${material.course}-` : '') +
        (videoTitle || 'Animasyonlu-Ders-Videosu')
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
      setExportStatusText('MP4 Video başarıyla oluşturuldu ve indirildi!');
      toast.success('🎬 Animasyonlu video başarıyla indirildi!');
      setTimeout(() => setIsExporting(false), 1500);
    } catch (err: any) {
      console.error('MP4 export error:', err);
      toast.error('Video oluşturulurken hata meydana geldi: ' + (err.message || 'Bilinmeyen hata'));
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Studio Card */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-48 w-48 rounded-full bg-rose-500/15 blur-3xl" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-gradient-to-r from-cyan-500 via-blue-600 to-primary text-white font-bold tracking-wider text-[11px] px-2.5 py-0.5 shadow-sm">
                <Sparkles className="h-3 w-3 mr-1" /> CANLI ANİMASYONLU KARAKTERLER & GRAFİKLER
              </Badge>
              <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-[11px] font-semibold">
                İKİLİ DERS & AKILLI TAHTA
              </Badge>
              {material.course && (
                <Badge variant="secondary" className="text-[11px]">
                  {material.course}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
              {videoTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {outline}
            </p>
          </div>

          {/* MP4 Download Primary Button */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleExportMP4}
              disabled={isExporting}
              className="bg-gradient-to-r from-cyan-500 via-blue-600 to-rose-500 hover:from-cyan-600 hover:to-rose-600 text-white font-bold shadow-lg shadow-cyan-500/20 gap-2 h-11 px-5 rounded-xl transition-transform active:scale-95"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Hazırlanıyor...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  MP4 Olarak İndir
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main 16:9 Video Canvas Display */}
      <div className="relative group overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full aspect-video block object-contain"
        />

        {/* Floating In-Video Controls Overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4 sm:p-5 flex flex-col gap-2">
          {/* Progress bar scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-400">
              {formatTime(activeSceneIndex * 15 + elapsedSceneTime)}
            </span>
            <div className="flex-1 flex gap-1 items-center h-2 cursor-pointer">
              {scenes.map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => goToScene(idx)}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    idx === activeSceneIndex
                      ? 'bg-gradient-to-r from-cyan-400 to-rose-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]'
                      : idx < activeSceneIndex
                      ? 'bg-slate-500 hover:bg-slate-400'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                  title={`${s.speaker}: ${s.title}`}
                />
              ))}
            </div>
            <span className="text-xs font-mono text-slate-400">
              {formatTime(totalDuration)}
            </span>
          </div>

          {/* Bottom control buttons */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => goToScene(activeSceneIndex - 1)}
                disabled={activeSceneIndex === 0}
                className="text-white hover:bg-white/10 h-9 w-9 rounded-full"
                title="Önceki Bölüm"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <Button
                onClick={togglePlay}
                className={`h-11 w-11 rounded-full text-white shadow-lg ${
                  isPlaying
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30'
                    : 'bg-cyan-500 hover:bg-cyan-600 shadow-cyan-500/30'
                }`}
                title={isPlaying ? 'Durdur' : 'Oynat'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => goToScene(activeSceneIndex + 1)}
                disabled={activeSceneIndex === scenes.length - 1}
                className="text-white hover:bg-white/10 h-9 w-9 rounded-full"
                title="Sonraki Bölüm"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>

              <div className="hidden sm:flex items-center gap-2 ml-2 px-3 py-1 rounded-full bg-slate-900/85 border border-slate-700/60">
                <span
                  className="h-2 w-2 rounded-full animate-ping"
                  style={{ backgroundColor: currentScene.speaker.toLowerCase().includes('barış') ? '#f43f5e' : '#06b6d4' }}
                />
                <span className="text-xs font-semibold text-white">
                  {currentScene.speaker}: {currentScene.title}
                </span>
              </div>
            </div>

            {/* Right side controls (Speed, Audio, MP4) */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const speeds = [1.0, 1.25, 1.5, 0.85];
                  const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                  setPlaybackSpeed(nextSpeed);
                  if (isPlaying) playSpeechForScene(activeSceneIndex);
                }}
                className="text-xs font-mono text-slate-300 hover:bg-white/10 h-8 px-2.5 rounded-lg"
                title="Oynatma Hızı"
              >
                {playbackSpeed}x
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  if (next) stopSpeech();
                  else if (isPlaying) playSpeechForScene(activeSceneIndex);
                }}
                className="text-white hover:bg-white/10 h-9 w-9 rounded-full"
                title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
              >
                {isMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleExportMP4}
                disabled={isExporting}
                className="border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs h-8 px-3 rounded-lg gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">MP4 İndir</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Smartboard Mode Switcher & Reactions */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Tahta Grafik Modu Seçici */}
        <div className="flex items-center gap-1.5 p-2 rounded-2xl border border-slate-800 bg-slate-950/80 overflow-x-auto">
          <span className="text-[11px] font-semibold text-slate-400 pl-2 shrink-0">Tahta Modu:</span>
          {[
            { id: 'auto', label: 'Otomatik', icon: Zap },
            { id: 'curve', label: 'Arz-Talep', icon: LineChart },
            { id: 'network', label: 'Zihin Haritası', icon: Network },
            { id: 'bars', label: 'Büyüme', icon: BarChart3 },
            { id: 'formula', label: 'Formül', icon: Activity },
          ].map((mode) => {
            const Icon = mode.icon;
            const isSelected = manualChartMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setManualChartMode(mode.id as any)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/30 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>

        {/* Live Reaction Emojis */}
        <div className="flex items-center justify-between p-2 rounded-2xl border border-slate-800 bg-slate-950/80">
          <span className="text-[11px] font-semibold text-slate-400 pl-2 shrink-0">Tepki Ver:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { emoji: '🔥', label: 'Efsane' },
              { emoji: '💡', label: 'Anladım' },
              { emoji: '🧠', label: 'Kritik' },
              { emoji: '🎯', label: 'Sınav' },
              { emoji: '🚀', label: 'Akıcı' },
            ].map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => addReaction(emoji)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-xs text-white transition-transform active:scale-125 hover:border-cyan-500/50"
                title={`${label} tepkisi ver`}
              >
                <span>{emoji}</span>
                <span className="font-mono text-[10px] text-cyan-400">+{reactions[emoji] || 0}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs: Interactive Transcript, Slide Cards, and Search Suggestions */}
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md bg-slate-900 border border-slate-800">
          <TabsTrigger value="transcript" className="text-xs sm:text-sm gap-1.5">
            <Radio className="h-3.5 w-3.5" /> İnteraktif Döküm
          </TabsTrigger>
          <TabsTrigger value="slides" className="text-xs sm:text-sm gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Canlı Slaytlar
          </TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm gap-1.5">
            <Video className="h-3.5 w-3.5" /> Öneriler
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Dual-Host Transcript with time-jump */}
        <TabsContent value="transcript" className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Mic className="h-4 w-4 text-cyan-400" /> Deniz & Barış — İkili Ders Diyaloğu
                </h3>
                <p className="text-xs text-slate-400">
                  Herhangi bir cümlenin yanındaki oynat butonuna basarak videoyu doğrudan o sahneye sarabilirsiniz.
                </p>
              </div>
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-xs">
                {scenes.length} Sahne
              </Badge>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {scenes.map((s, idx) => {
                const isBaris = s.speaker.toLowerCase().includes('barış');
                const isActive = idx === activeSceneIndex;

                return (
                  <div
                    key={s.id}
                    onClick={() => goToScene(idx)}
                    className={`relative p-4 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? isBaris
                          ? 'border-rose-500/60 bg-rose-950/20 shadow-lg shadow-rose-950/30'
                          : 'border-cyan-500/60 bg-cyan-950/20 shadow-lg shadow-cyan-950/30'
                        : 'border-slate-800/70 bg-slate-900/40 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
                          style={{ backgroundColor: isBaris ? '#f43f5e' : '#06b6d4' }}
                        >
                          {isBaris ? '💡' : '🎓'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">{s.speaker}</span>
                            <span className="text-[11px] text-slate-400">· {s.speakerRole}</span>
                            <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 border-slate-700">
                              {s.time}
                            </Badge>
                          </div>
                          <p className="text-xs font-medium text-slate-300 mt-0.5">{s.title}</p>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        className={`h-7 px-2.5 text-xs gap-1 rounded-lg ${
                          isActive
                            ? isBaris
                              ? 'bg-rose-600 text-white hover:bg-rose-700'
                              : 'bg-cyan-500 text-white hover:bg-cyan-600'
                            : 'border-slate-700 text-slate-300'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToScene(idx);
                          if (!isPlaying) togglePlay();
                        }}
                      >
                        <Play className="h-3 w-3" />
                        {isActive && isPlaying ? 'Çalıyor' : 'Oynat'}
                      </Button>
                    </div>

                    <p className="mt-2.5 text-sm text-slate-200 leading-relaxed pl-10">
                      {s.narration}
                    </p>

                    {s.keyTakeaways.length > 0 && (
                      <div className="mt-2.5 pl-10 flex flex-wrap gap-1.5">
                        {s.keyTakeaways.map((tk, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60"
                          >
                            <CheckCircle2 className="h-3 w-3 text-cyan-400" />
                            {tk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Visual Slide Cards */}
        <TabsContent value="slides" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((s, idx) => (
              <Card
                key={s.id}
                onClick={() => goToScene(idx)}
                className={`cursor-pointer transition-all border ${
                  idx === activeSceneIndex
                    ? 'border-cyan-500 bg-cyan-950/15 shadow-md shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{s.time}</Badge>
                    <span className="font-semibold" style={{ color: s.speaker.toLowerCase().includes('barış') ? '#f43f5e' : '#06b6d4' }}>
                      {s.speaker}
                    </span>
                  </div>
                  <CardTitle className="text-base font-bold mt-1 text-white">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-2">
                  {s.keyTakeaways.map((point, pIdx) => (
                    <div key={pIdx} className="flex items-start gap-1.5 text-xs text-slate-300">
                      <span className="text-cyan-400 font-bold mt-0.5">•</span>
                      <span>{point}</span>
                    </div>
                  ))}
                  {s.visualCue && (
                    <div className="rounded border border-dashed border-cyan-500/30 bg-cyan-500/5 p-2 text-[11px] text-cyan-300 mt-2">
                      <span className="font-semibold">Şema: </span>{s.visualCue}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Suggested Searches & YouTube */}
        <TabsContent value="resources" className="mt-4 space-y-3">
          <Card className="border-slate-800 bg-slate-950/60">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Video className="h-4 w-4 text-rose-500" /> Konuyu Pekiştirecek YouTube Arama Sorguları
              </CardTitle>
              <CardDescription className="text-xs">
                Bu nottaki kritik kavramları derinleştirmek için özel hazırlanmış arama önerileri.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {suggestedSearches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestedSearches.map((q, i) => (
                    <a
                      key={i}
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200 hover:border-rose-500/50 hover:bg-rose-500/10 transition"
                    >
                      <ExternalLink className="h-3 w-3 text-rose-400" />
                      {q}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Ek arama önerisi bulunamadı.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* High Quality MP4 Export Progress Modal */}
      <Dialog open={isExporting} onOpenChange={() => {}}>
        <DialogContent className="max-w-md border-cyan-500/30 bg-slate-950 text-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-white">
              <Sparkles className="h-5 w-5 text-cyan-400 animate-spin" />
              Animasyonlu MP4 Video Derleniyor
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300">
              Canlı karakterler, lazer işaretçiler, akıllı tahta grafikleri ve ses dalgaları tek bir yüksek kaliteli MP4 videosunda işleniyor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 truncate max-w-[280px]">{exportStatusText}</span>
                <span className="text-cyan-400 font-bold">{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} className="h-2.5 bg-slate-800" />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400 space-y-1">
              <p>• Çözünürlük: 1280x720 HD 16:9 (60 FPS & Canlı Karakterler)</p>
              <p>• Format: Standart MP4 (H.264/AAC Uyumlu)</p>
              <p>• İşlem tamamlandığında video dosyanız otomatik olarak indirilecektir.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InteractiveVideoStudio;
