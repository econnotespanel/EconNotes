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
  Brain, Target, Rocket, Heart, Trophy, Wand2
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
  durationSeconds: number;
}

interface HostProfile {
  name: string;
  role: string;
  color: string;
  secondaryColor: string;
  glowColor: string;
  avatarText: string;
  emoji: string;
  pitch: number;
  rate: number;
}

const HOSTS: HostProfile[] = [
  {
    name: 'Deniz',
    role: 'Akademik Analist',
    color: '#06b6d4', // cyan-500
    secondaryColor: '#3b82f6', // blue-500
    glowColor: 'rgba(6, 182, 212, 0.55)',
    avatarText: 'DN',
    emoji: '🎓',
    pitch: 1.15,
    rate: 1.0,
  },
  {
    name: 'Barış',
    role: 'Sorgulayıcı & Özetleyen',
    color: '#f43f5e', // rose-500
    secondaryColor: '#f59e0b', // amber-500
    glowColor: 'rgba(244, 63, 94, 0.55)',
    avatarText: 'BR',
    emoji: '💡',
    pitch: 0.88,
    rate: 0.98,
  },
];

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
  const videoTitle = content.podcastTitle || content.videoTitle || material.title || 'Animasyonlu Ders Dersi';
  const outline = content.outline || 'Ders notundaki kritik kavramların animasyonlu ikili anlatımı.';
  const suggestedSearches: string[] = Array.isArray(content.suggestedSearches) ? content.suggestedSearches : [];

  // Normalize scenes with dual-host format
  const scenes: NormalizedScene[] = useMemo(() => {
    if (rawScenes.length === 0) {
      return [{
        id: 'scene-0',
        index: 0,
        time: '00:00',
        speaker: 'Deniz',
        speakerRole: 'Akademik Analist',
        title: 'Giriş ve Genel Bakış',
        narration: outline,
        keyTakeaways: ['Ders notu kavramları inceleniyor', 'Önemli sınav noktaları listeleniyor'],
        visualCue: 'Kavram Haritası ve Başlıklar',
        durationSeconds: 10,
      }];
    }

    return rawScenes.map((s: any, idx: number) => {
      const isEven = idx % 2 === 0;
      const speakerName = s.speaker || (isEven ? 'Deniz' : 'Barış');
      const speakerRole = s.speakerRole || (isEven ? 'Akademik Analist' : 'Sorgulayıcı & Özetleyen');
      const text = s.narration || s.title || '';
      
      const calculatedDuration = Math.max(6, Math.min(28, Math.round(text.length / 13)));

      let takeaways: string[] = Array.isArray(s.keyTakeaways) ? s.keyTakeaways.filter(Boolean) : [];
      if (takeaways.length === 0) {
        if (s.visualCue) takeaways.push(s.visualCue);
        const sentences = text.split(/[.?!]/).map((st: string) => st.trim()).filter((st: string) => st.length > 15);
        if (sentences.length > 0) takeaways.push(sentences[0]);
      }

      return {
        id: `scene-${idx}`,
        index: idx,
        time: s.time || `${Math.floor((idx * 15) / 60).toString().padStart(2, '0')}:${((idx * 15) % 60).toString().padStart(2, '0')}`,
        speaker: speakerName,
        speakerRole,
        title: s.title || `Bölüm ${idx + 1}`,
        narration: text,
        keyTakeaways: takeaways.slice(0, 3),
        visualCue: s.visualCue || 'Kavram Şeması ve Detaylar',
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
  
  // Interactive reaction counters
  const [reactions, setReactions] = useState<{ [key: string]: number }>({
    '🔥': 14,
    '💡': 28,
    '🧠': 19,
    '🎯': 35,
    '🚀': 12,
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
  const activeHost = currentScene.speaker.toLowerCase().includes('barış') ? HOSTS[1] : HOSTS[0];

  // Initialize ambient drifting particles once
  useEffect(() => {
    const parts: AmbientParticle[] = [];
    const colors = ['#06b6d4', '#3b82f6', '#f43f5e', '#a855f7', '#38bdf8'];
    for (let i = 0; i < 35; i++) {
      parts.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        radius: 1.5 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
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
  const playSoundEffect = useCallback((type: 'chime' | 'pop' | 'fanfare' = 'pop') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'pop') {
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.13);
      } else if (type === 'chime') {
        osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
      }
    } catch {
      // AudioContext optional fallback
    }
  }, []);

  // Trigger interactive floating emoji
  const addReaction = (emoji: string) => {
    playSoundEffect('pop');
    setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));

    // Spawn 3 floating emojis around bottom center
    for (let i = 0; i < 3; i++) {
      floatingEmojisRef.current.push({
        id: Date.now() + Math.random(),
        x: 580 + (Math.random() - 0.5) * 300,
        y: 650 + Math.random() * 40,
        emoji,
        vy: -2.5 - Math.random() * 2,
        vx: (Math.random() - 0.5) * 1.5,
        alpha: 1.0,
        size: 26 + Math.random() * 12,
      });
    }
  };

  // Speech synthesis for active scene
  const playSpeechForScene = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;

    const scene = scenes[index];
    if (!scene) return;

    const isHostBaris = scene.speaker.toLowerCase().includes('barış');
    const host = isHostBaris ? HOSTS[1] : HOSTS[0];

    const utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = 'tr-TR';
    utterance.pitch = host.pitch;
    utterance.rate = host.rate * playbackSpeed;

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
        toast.success('🎉 Video dersi başarıyla tamamlandı!');
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

  // Main Canvas Rendering Engine with Vibrant Animations
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
    particles: AmbientParticle[],
    emojis: FloatingEmoji[]
  ) => {
    const isDenizActive = !scene.speaker.toLowerCase().includes('barış');
    const now = Date.now();

    // 1. Futuristic Cyber-Studio Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#060913');
    bgGrad.addColorStop(0.4, '#0a1024');
    bgGrad.addColorStop(1, '#05070f');
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

    // 3. Ambient Pulsing Spotlight Auras
    // Left Glow (Deniz - Cyan)
    const cyanPulse = isDenizActive && playing ? 0.35 + 0.12 * Math.sin(now / 220) : 0.14;
    const cyanGlow = ctx.createRadialGradient(210, 150, 10, 210, 150, 360);
    cyanGlow.addColorStop(0, `rgba(6, 182, 212, ${cyanPulse})`);
    cyanGlow.addColorStop(0.6, 'rgba(59, 130, 246, 0.08)');
    cyanGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = cyanGlow;
    ctx.beginPath();
    ctx.arc(210, 150, 360, 0, Math.PI * 2);
    ctx.fill();

    // Right Glow (Barış - Rose/Amber)
    const rosePulse = !isDenizActive && playing ? 0.35 + 0.12 * Math.sin(now / 220) : 0.14;
    const roseGlow = ctx.createRadialGradient(width - 210, 150, 10, width - 210, 150, 360);
    roseGlow.addColorStop(0, `rgba(244, 63, 94, ${rosePulse})`);
    roseGlow.addColorStop(0.6, 'rgba(245, 158, 11, 0.08)');
    roseGlow.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = roseGlow;
    ctx.beginPath();
    ctx.arc(width - 210, 150, 360, 0, Math.PI * 2);
    ctx.fill();

    // 4. Header Bar
    // Top Brand Pill
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(40, 20, 370, 40, 20);
    ctx.fill();
    ctx.stroke();

    // Red Recording Dot with expanding wave ring
    const dotPulse = playing ? 0.7 + 0.3 * Math.sin(now / 180) : 0.8;
    ctx.fillStyle = `rgba(239, 68, 68, ${dotPulse})`;
    ctx.beginPath();
    ctx.arc(64, 40, 7, 0, Math.PI * 2);
    ctx.fill();

    if (playing) {
      const ringRadius = 7 + (now % 1200) / 100;
      const ringAlpha = Math.max(0, 1 - (ringRadius - 7) / 12);
      ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(64, 40, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Brand Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Space Grotesk", Inter, sans-serif';
    ctx.fillText('ECONNOTES VİDEO STÜDYO', 82, 44);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('● CANLI ANİMASYONLU DERS', 248, 44);
    ctx.restore();

    // Course & Scene Meta (Top Right)
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`${courseName || 'Ders Notu'} · Bölüm ${sceneIdx + 1}/${totalScenes}`, width - 40, 38);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px font-mono, monospace';
    ctx.fillText('1080P HD · 60 FPS · STEREO', width - 40, 54);
    ctx.restore();

    // 5. Dual Host Character Stages (Top section: y = 75 to 205)
    const drawHostPodium = (
      host: HostProfile,
      x: number,
      y: number,
      w: number,
      h: number,
      isActive: boolean
    ) => {
      ctx.save();
      
      // Animated Expanding Aura Rings when active & speaking
      if (isActive && playing) {
        const ringT = (now % 1000) / 1000;
        const auraR = 34 + ringT * 26;
        ctx.strokeStyle = host.glowColor;
        ctx.globalAlpha = (1 - ringT) * 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 44, y + h / 2, auraR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // Card Container with breathing border
      ctx.fillStyle = isActive ? 'rgba(15, 23, 42, 0.94)' : 'rgba(15, 23, 42, 0.65)';
      ctx.strokeStyle = isActive ? host.color : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isActive ? 2.5 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.stroke();

      if (isActive && playing) {
        ctx.shadowColor = host.glowColor;
        ctx.shadowBlur = 24;
      }

      // Avatar circle
      const avatarX = x + 44;
      const avatarY = y + h / 2;
      const avGrad = ctx.createLinearGradient(avatarX - 26, avatarY - 26, avatarX + 26, avatarY + 26);
      avGrad.addColorStop(0, host.color);
      avGrad.addColorStop(1, host.secondaryColor);
      ctx.fillStyle = avGrad;
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Host Emoji Icon
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(host.emoji, avatarX, avatarY);

      // Name & Role
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.fillText(host.name, x + 84, y + 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(host.role, x + 84, y + 54);

      // 10-Bar Bouncing Soundwave Equalizer with Glowing Tips
      const eqStartX = x + 84;
      const eqY = y + 80;
      const numBars = 10;
      for (let b = 0; b < numBars; b++) {
        let barHeight = 4;
        if (isActive && playing) {
          // Dynamic wave formula with sine & frequency mix
          barHeight = 5 + Math.abs(Math.sin((now / 140) + b * 0.7) * Math.cos((now / 190) + b * 0.3)) * 22;
        } else if (isActive) {
          barHeight = 7;
        }
        
        const barGrad = ctx.createLinearGradient(0, eqY - barHeight, 0, eqY);
        barGrad.addColorStop(0, host.color);
        barGrad.addColorStop(1, host.secondaryColor);
        ctx.fillStyle = isActive ? barGrad : 'rgba(148, 163, 184, 0.25)';
        ctx.beginPath();
        ctx.roundRect(eqStartX + b * 11, eqY - barHeight, 6, barHeight, 3);
        ctx.fill();
      }

      // Status Badge (Konuşuyor / Dinliyor)
      const badgeX = x + w - 95;
      const badgeY = y + 20;
      ctx.fillStyle = isActive ? (isDenizActive ? 'rgba(6, 182, 212, 0.2)' : 'rgba(244, 63, 94, 0.2)') : 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, 82, 24, 12);
      ctx.fill();

      ctx.fillStyle = isActive ? host.color : '#64748b';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isActive ? '● ANLATIYOR' : 'DİNLİYOR', badgeX + 41, badgeY + 16);

      ctx.restore();
    };

    // Draw Deniz on Left
    drawHostPodium(HOSTS[0], 40, 75, 360, 98, isDenizActive);
    // Draw Barış on Right
    drawHostPodium(HOSTS[1], width - 400, 75, 360, 98, !isDenizActive);

    // Center Dynamic Topic Indicator (Between hosts)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = 'bold 10px "Space Grotesk", sans-serif';
    ctx.fillText('İNTERAKTİF İKİLİ ANİMASYONLU DERS', width / 2, 110);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px Inter, sans-serif';
    const cleanTitle = mainTitle.length > 40 ? mainTitle.substring(0, 37) + '...' : mainTitle;
    ctx.fillText(cleanTitle, width / 2, 136);

    // Dynamic wave connector line between hosts
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(410, 124);
    ctx.lineTo(width - 410, 124);
    ctx.stroke();
    ctx.restore();

    // 6. Center Presentation Slide Deck (y = 190 to 500)
    ctx.save();
    const slideX = 40;
    const slideY = 190;
    const slideW = width - 80;
    const slideH = 315;

    // Glass Card Fill with glowing border
    ctx.fillStyle = 'rgba(10, 16, 32, 0.9)';
    ctx.strokeStyle = isDenizActive ? 'rgba(6, 182, 212, 0.45)' : 'rgba(244, 63, 94, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(slideX, slideY, slideW, slideH, 22);
    ctx.fill();
    ctx.stroke();

    // Animated Accent Corner Glow
    const cornerGlow = ctx.createRadialGradient(slideX + 30, slideY + 30, 0, slideX + 30, slideY + 30, 160);
    cornerGlow.addColorStop(0, isDenizActive ? 'rgba(6, 182, 212, 0.15)' : 'rgba(244, 63, 94, 0.15)');
    cornerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = cornerGlow;
    ctx.beginPath();
    ctx.roundRect(slideX, slideY, slideW, slideH, 22);
    ctx.fill();

    // Slide Tag Pill with Icon
    ctx.fillStyle = isDenizActive ? 'rgba(6, 182, 212, 0.18)' : 'rgba(244, 63, 94, 0.18)';
    ctx.beginPath();
    ctx.roundRect(slideX + 28, slideY + 22, 220, 28, 14);
    ctx.fill();
    ctx.fillStyle = isDenizActive ? '#38bdf8' : '#fb7185';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⚡ BÖLÜM ${sceneIdx + 1}: KRİTİK SINAV ODAĞI`, slideX + 40, slideY + 40);

    // Slide Headline
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "Space Grotesk", Inter, sans-serif';
    ctx.fillText(scene.title, slideX + 28, slideY + 84);

    // Animated Key Takeaways (Interactive Bullet Cards)
    const startBulletY = slideY + 118;
    const bullets = scene.keyTakeaways.length > 0 ? scene.keyTakeaways : [scene.visualCue];
    const bulletIcons = ['🎯', '💡', '⚡'];
    bullets.forEach((point, pIdx) => {
      const bY = startBulletY + pIdx * 48;
      // Bullet background card
      ctx.fillStyle = 'rgba(23, 34, 54, 0.7)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(slideX + 28, bY, slideW - 56, 40, 12);
      ctx.fill();
      ctx.stroke();

      // Emoji Badge Circle
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bulletIcons[pIdx % bulletIcons.length], slideX + 50, bY + 20);

      // Bullet Text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '14px Inter, sans-serif';
      const cleanPoint = point.length > 115 ? point.substring(0, 112) + '...' : point;
      ctx.fillText(cleanPoint, slideX + 72, bY + 25);
    });

    // Visual Cue Footer inside slide
    if (scene.visualCue) {
      const cueY = slideY + slideH - 32;
      ctx.fillStyle = isDenizActive ? '#38bdf8' : '#fb7185';
      ctx.font = 'italic 12px Inter, sans-serif';
      ctx.fillText(`📊 Görsel / Şema Önerisi: ${scene.visualCue}`, slideX + 32, cueY);
    }
    ctx.restore();

    // 7. Kinetic Karaoke Subtitle / Teleprompter Box (y = 520 to 675)
    ctx.save();
    const subX = 40;
    const subY = 520;
    const subW = width - 80;
    const subH = 155;

    ctx.fillStyle = 'rgba(7, 11, 20, 0.96)';
    ctx.strokeStyle = isDenizActive ? 'rgba(6, 182, 212, 0.3)' : 'rgba(244, 63, 94, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(subX, subY, subW, subH, 18);
    ctx.fill();
    ctx.stroke();

    // Speaker Name Tag with live sound icon
    ctx.fillStyle = isDenizActive ? '#06b6d4' : '#f43f5e';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillText(`🎙️ [${scene.speaker.toUpperCase()} - ${scene.speakerRole}]:`, subX + 26, subY + 34);

    // Kinetic Karaoke text rendering: highlight spoken words based on scene time
    const words = scene.narration.split(' ');
    const totalWords = words.length;
    const spokenProgressRatio = Math.min(1.0, timeSecs / Math.max(1, scene.durationSeconds));
    const currentSpokenWordIndex = Math.floor(spokenProgressRatio * totalWords);

    let curX = subX + 26;
    let curY = subY + 68;
    const lineHeight = 28;
    const maxLineRight = subX + subW - 30;

    ctx.font = '18px Inter, sans-serif';
    words.forEach((w, wIdx) => {
      const wordMetrics = ctx.measureText(w + ' ');
      if (curX + wordMetrics.width > maxLineRight) {
        curX = subX + 26;
        curY += lineHeight;
      }

      if (curY < subY + subH - 10) {
        if (wIdx <= currentSpokenWordIndex && playing) {
          // Active spoken words: bright glowing cyan or rose
          ctx.fillStyle = isDenizActive ? '#38bdf8' : '#fb7185';
          ctx.font = 'bold 18px Inter, sans-serif';
        } else {
          // Upcoming words: soft crisp white
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '18px Inter, sans-serif';
        }
        ctx.fillText(w, curX, curY);
        curX += wordMetrics.width;
      }
    });
    ctx.restore();

    // 8. Floating Interactive Emojis Canvas Layer
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

    // 9. Bottom Sleek Glowing Timeline Progress Bar (y = 705 to 720)
    ctx.save();
    const timelineY = height - 10;
    const overallProgress = (sceneIdx + (timeSecs / Math.max(1, scene.durationSeconds))) / totalScenes;
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, timelineY, width, 10);

    // Glowing Neon Gradient
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
  }, [drawFrame, currentScene, activeSceneIndex, scenes, elapsedSceneTime, isPlaying, material.course, videoTitle, playbackSpeed, playSpeechForScene, playSoundEffect]);

  // High Quality MP4 Video Export Engine
  const handleExportMP4 = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Yüksek kaliteli MP4 video motoru başlatılıyor...');

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

      // Web Audio API for synced audio recording
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
        videoBitsPerSecond: 3000000, // 3 Mbps Ultra HD
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

        setExportStatusText(`Bölüm ${sIdx + 1} / ${totalScenes}: ${scene.speaker} (${scene.title}) animasyonu derleniyor...`);

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
      toast.success('🎬 Yüksek kaliteli MP4 video başarıyla indirildi!');
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
                <Sparkles className="h-3 w-3 mr-1" /> ANİMASYONLU İNTERAKTİF VİDEO STÜDYOSU
              </Badge>
              <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-[11px] font-semibold">
                İKİLİ DERS & MP4
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
                  style={{ backgroundColor: activeHost.color }}
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

      {/* Interactive Reactions Bar (Fun Floating Emojis!) */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-800 bg-slate-950/70 shadow-md">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-300 hidden sm:inline">Canlı Tepki Ver:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs text-white transition-transform active:scale-125 hover:border-cyan-500/50 shadow-sm"
              title={`${label} tepkisi ver`}
            >
              <span>{emoji}</span>
              <span className="hidden md:inline text-[11px] text-slate-300">{label}</span>
              <span className="font-mono text-[10px] text-cyan-400">+{reactions[emoji] || 0}</span>
            </button>
          ))}
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
                const host = isBaris ? HOSTS[1] : HOSTS[0];
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
                          style={{ backgroundColor: host.color }}
                        >
                          {host.emoji}
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
              Yüksek Kaliteli MP4 Video Derleniyor
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300">
              Deniz ve Barış'ın anlatımı, canlı sunum slaytları ve ses dalgaları yüksek kaliteli MP4 video formatında işleniyor.
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
              <p>• Çözünürlük: 1280x720 HD 16:9 (Ultra HD Bitrate)</p>
              <p>• Format: Standart MP4 (H.264/AAC Uyumlu)</p>
              <p>• İşlem bittiğinde video dosyanız otomatik olarak indirilecektir.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InteractiveVideoStudio;
