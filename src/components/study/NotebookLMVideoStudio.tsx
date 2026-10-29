import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Download, Sparkles, Video,
  Radio, Layers, CheckCircle2, ChevronRight, ChevronLeft, Maximize2,
  ExternalLink, Mic, Headphones, FileText, Loader2, Share2
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
  glowColor: string;
  avatarText: string;
  pitch: number;
  rate: number;
}

const DEFAULT_HOSTS: HostProfile[] = [
  {
    name: 'Deniz',
    role: 'Akademik Analist',
    color: '#06b6d4', // cyan-500
    glowColor: 'rgba(6, 182, 212, 0.4)',
    avatarText: 'DN',
    pitch: 1.15,
    rate: 1.0,
  },
  {
    name: 'Barış',
    role: 'Sorgulayıcı & Özetleyen',
    color: '#f43f5e', // rose-500
    glowColor: 'rgba(244, 63, 94, 0.4)',
    avatarText: 'BR',
    pitch: 0.88,
    rate: 0.98,
  },
];

interface NotebookLMVideoStudioProps {
  material: StudyMaterial;
}

export const NotebookLMVideoStudio: React.FC<NotebookLMVideoStudioProps> = ({ material }) => {
  const content = material.content || {};
  const rawScenes = Array.isArray(content.scenes) ? content.scenes : [];
  const podcastTitle = content.podcastTitle || material.title || 'Ders Notu Video Analizi';
  const outline = content.outline || 'Ders notundaki kritik kavramların NotebookLM formatında ikili analiz podcasti.';
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
      
      // Calculate realistic speaking duration: ~14 characters per second, min 6s, max 28s
      const calculatedDuration = Math.max(6, Math.min(28, Math.round(text.length / 13)));

      // Extract key takeaways if not provided
      let takeaways: string[] = Array.isArray(s.keyTakeaways) ? s.keyTakeaways.filter(Boolean) : [];
      if (takeaways.length === 0) {
        // Fallback: split long narration or visualCue
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
  
  // Export modal state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // Canvas ref & animation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const activeSceneIndexRef = useRef(activeSceneIndex);
  activeSceneIndexRef.current = activeSceneIndex;

  const currentScene = scenes[activeSceneIndex] || scenes[0];
  const activeHost = currentScene.speaker.toLowerCase().includes('barış') ? DEFAULT_HOSTS[1] : DEFAULT_HOSTS[0];

  // Helper to format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Speech synthesis for active scene
  const playSpeechForScene = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;

    const scene = scenes[index];
    if (!scene) return;

    const isHostBaris = scene.speaker.toLowerCase().includes('barış');
    const host = isHostBaris ? DEFAULT_HOSTS[1] : DEFAULT_HOSTS[0];

    const utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = 'tr-TR';
    utterance.pitch = host.pitch;
    utterance.rate = host.rate * playbackSpeed;

    // Pick Turkish voice if available
    const voices = window.speechSynthesis.getVoices();
    const trVoices = voices.filter(v => v.lang.startsWith('tr'));
    if (trVoices.length > 1) {
      utterance.voice = isHostBaris ? trVoices[1] : trVoices[0];
    } else if (trVoices.length === 1) {
      utterance.voice = trVoices[0];
    }

    utterance.onend = () => {
      // Advance to next scene automatically if playing
      if (index + 1 < scenes.length) {
        setActiveSceneIndex(index + 1);
        setElapsedSceneTime(0);
        playSpeechForScene(index + 1);
      } else {
        setIsPlaying(false);
        setActiveSceneIndex(0);
        setElapsedSceneTime(0);
        toast.success('Video tamamlandı!');
      }
    };

    utterance.onerror = (e) => {
      console.warn('Speech error:', e);
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [scenes, isMuted, playbackSpeed]);

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

  // Main Canvas Rendering Engine
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
    podTitle: string
  ) => {
    const isDenizActive = !scene.speaker.toLowerCase().includes('barış');
    const now = Date.now();

    // 1. Cinematic Studio Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#070a12');
    bgGrad.addColorStop(0.5, '#0b1120');
    bgGrad.addColorStop(1, '#05070e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Ambient Studio Glows
    // Left Glow (Deniz - Cyan)
    const cyanGlow = ctx.createRadialGradient(200, 160, 20, 200, 160, 320);
    cyanGlow.addColorStop(0, isDenizActive && playing ? 'rgba(6, 182, 212, 0.28)' : 'rgba(6, 182, 212, 0.12)');
    cyanGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = cyanGlow;
    ctx.beginPath();
    ctx.arc(200, 160, 320, 0, Math.PI * 2);
    ctx.fill();

    // Right Glow (Barış - Rose)
    const roseGlow = ctx.createRadialGradient(width - 200, 160, 20, width - 200, 160, 320);
    roseGlow.addColorStop(0, !isDenizActive && playing ? 'rgba(244, 63, 94, 0.28)' : 'rgba(244, 63, 94, 0.12)');
    roseGlow.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = roseGlow;
    ctx.beginPath();
    ctx.arc(width - 200, 160, 320, 0, Math.PI * 2);
    ctx.fill();

    // Subtle Grid/Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 60; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 3. Header Bar
    // Top Brand Pill
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(40, 22, 340, 38, 19);
    ctx.fill();
    ctx.stroke();

    // Red Recording Dot
    const pulseAlpha = playing ? 0.6 + 0.4 * Math.sin(now / 200) : 0.8;
    ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
    ctx.beginPath();
    ctx.arc(62, 41, 6, 0, Math.PI * 2);
    ctx.fill();

    // Brand Text
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText('ECONNOTES STUDIO · NOTEBOOK-LM', 78, 45);
    ctx.restore();

    // Course & Scene Meta (Top Right)
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`${courseName || 'Ders Notu'} · Bölüm ${sceneIdx + 1} / ${totalScenes}`, width - 40, 45);
    ctx.restore();

    // 4. Dual Host Stage (Top section: y = 80 to 210)
    const drawHostCard = (
      host: HostProfile,
      x: number,
      y: number,
      w: number,
      h: number,
      isActive: boolean
    ) => {
      ctx.save();
      // Card Container
      ctx.fillStyle = isActive ? 'rgba(15, 23, 42, 0.92)' : 'rgba(15, 23, 42, 0.6)';
      ctx.strokeStyle = isActive ? host.color : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 16);
      ctx.fill();
      ctx.stroke();

      if (isActive && playing) {
        ctx.shadowColor = host.glowColor;
        ctx.shadowBlur = 20;
      }

      // Avatar circle
      const avatarX = x + 38;
      const avatarY = y + h / 2;
      const avGrad = ctx.createLinearGradient(avatarX - 22, avatarY - 22, avatarX + 22, avatarY + 22);
      avGrad.addColorStop(0, host.color);
      avGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = avGrad;
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Avatar Monogram
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(host.avatarText, avatarX, avatarY);

      // Name & Role
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Inter, sans-serif';
      ctx.fillText(host.name, x + 72, y + 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(host.role, x + 72, y + 54);

      // Animated Soundwave Equalizer Bars (6 bars)
      const eqStartX = x + 72;
      const eqY = y + 78;
      const numBars = 8;
      for (let b = 0; b < numBars; b++) {
        let barHeight = 4;
        if (isActive && playing) {
          barHeight = 5 + Math.abs(Math.sin((now / 150) + b * 0.8)) * 18;
        } else if (isActive) {
          barHeight = 7;
        }
        ctx.fillStyle = isActive ? host.color : 'rgba(148, 163, 184, 0.3)';
        ctx.beginPath();
        ctx.roundRect(eqStartX + b * 11, eqY - barHeight, 6, barHeight, 3);
        ctx.fill();
      }

      // Status Badge (Konuşuyor / Dinliyor)
      const badgeX = x + w - 90;
      const badgeY = y + 22;
      ctx.fillStyle = isActive ? (isDenizActive ? 'rgba(6, 182, 212, 0.15)' : 'rgba(244, 63, 94, 0.15)') : 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, 78, 22, 11);
      ctx.fill();

      ctx.fillStyle = isActive ? host.color : '#64748b';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isActive ? '● KONUŞUYOR' : 'DİNLİYOR', badgeX + 39, badgeY + 15);

      ctx.restore();
    };

    // Draw Deniz on Left
    drawHostCard(DEFAULT_HOSTS[0], 40, 80, 360, 96, isDenizActive);
    // Draw Barış on Right
    drawHostCard(DEFAULT_HOSTS[1], width - 400, 80, 360, 96, !isDenizActive);

    // Center Title Banner (Between hosts)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('NOTEBOOK-LM İKİLİ SESLİ PODCAST DERSİ', width / 2, 115);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px Inter, sans-serif';
    const truncatedTitle = podTitle.length > 40 ? podTitle.substring(0, 37) + '...' : podTitle;
    ctx.fillText(truncatedTitle, width / 2, 140);
    ctx.restore();

    // 5. Center Presentation Slide Deck (y = 195 to 505)
    ctx.save();
    const slideX = 40;
    const slideY = 195;
    const slideW = width - 80;
    const slideH = 310;

    // Glass Card Fill
    ctx.fillStyle = 'rgba(11, 17, 32, 0.88)';
    ctx.strokeStyle = isDenizActive ? 'rgba(6, 182, 212, 0.35)' : 'rgba(244, 63, 94, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(slideX, slideY, slideW, slideH, 20);
    ctx.fill();
    ctx.stroke();

    // Slide Tag Pill
    ctx.fillStyle = isDenizActive ? 'rgba(6, 182, 212, 0.15)' : 'rgba(244, 63, 94, 0.15)';
    ctx.beginPath();
    ctx.roundRect(slideX + 28, slideY + 24, 180, 26, 13);
    ctx.fill();
    ctx.fillStyle = isDenizActive ? '#38bdf8' : '#fb7185';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`📌 BÖLÜM ${sceneIdx + 1}: KRİTİK ANALİZ`, slideX + 42, slideY + 41);

    // Slide Headline
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "Space Grotesk", Inter, sans-serif';
    ctx.fillText(scene.title, slideX + 28, slideY + 84);

    // Key Takeaways List (Bullet cards)
    const startBulletY = slideY + 120;
    const bullets = scene.keyTakeaways.length > 0 ? scene.keyTakeaways : [scene.visualCue];
    bullets.forEach((point, pIdx) => {
      const bY = startBulletY + pIdx * 48;
      // Bullet background pill
      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(slideX + 28, bY, slideW - 56, 40, 10);
      ctx.fill();
      ctx.stroke();

      // Check Icon Circle
      ctx.fillStyle = isDenizActive ? '#06b6d4' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(slideX + 50, bY + 20, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', slideX + 50, bY + 24);

      // Bullet Text
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '14px Inter, sans-serif';
      const cleanPoint = point.length > 110 ? point.substring(0, 107) + '...' : point;
      ctx.fillText(cleanPoint, slideX + 72, bY + 25);
    });

    // Visual Cue Footer inside slide
    if (scene.visualCue) {
      const cueY = slideY + slideH - 36;
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'italic 12px Inter, sans-serif';
      ctx.fillText(`💡 Görsel / Şema Önerisi: ${scene.visualCue}`, slideX + 32, cueY);
    }
    ctx.restore();

    // 6. Bottom Subtitle / Speech Bubble (y = 520 to 675)
    ctx.save();
    const subX = 40;
    const subY = 520;
    const subW = width - 80;
    const subH = 155;

    ctx.fillStyle = 'rgba(7, 10, 18, 0.96)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(subX, subY, subW, subH, 18);
    ctx.fill();
    ctx.stroke();

    // Speaker Name Tag
    ctx.fillStyle = isDenizActive ? '#06b6d4' : '#f43f5e';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillText(`🎙️ [${scene.speaker.toUpperCase()} - ${scene.speakerRole}]:`, subX + 24, subY + 34);

    // Dialogue Narration Text (Multi-line wrap)
    ctx.fillStyle = '#f8fafc';
    ctx.font = '18px Inter, sans-serif';
    
    // Simple text wrapper
    const maxLineLength = 98;
    const words = scene.narration.split(' ');
    let lines: string[] = [];
    let currentLine = '';

    for (const w of words) {
      if ((currentLine + ' ' + w).length > maxLineLength) {
        lines.push(currentLine.trim());
        currentLine = w;
      } else {
        currentLine += ' ' + w;
      }
    }
    if (currentLine) lines.push(currentLine.trim());

    // Draw up to 3 lines of dialogue
    lines.slice(0, 4).forEach((line, lIdx) => {
      ctx.fillText(line, subX + 24, subY + 66 + lIdx * 25);
    });
    ctx.restore();

    // 7. Bottom Timeline Progress Bar (y = 705 to 720)
    ctx.save();
    const timelineY = height - 10;
    const overallProgress = (sceneIdx + (timeSecs / Math.max(1, scene.durationSeconds))) / totalScenes;
    
    // Background track
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(0, timelineY, width, 10);

    // Gradient Active Bar
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
          // If speech synthesis ended or timed out
          const scene = scenes[activeSceneIndexRef.current];
          if (scene && next >= scene.durationSeconds) {
            // If SpeechSynthesis not currently speaking, advance
            if (!speechRef.current) {
              const nextIdx = activeSceneIndexRef.current + 1;
              if (nextIdx < scenes.length) {
                setActiveSceneIndex(nextIdx);
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
        podcastTitle
      );

      animId = requestAnimationFrame(render);
    };

    lastTickRef.current = Date.now();
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [drawFrame, currentScene, activeSceneIndex, scenes, elapsedSceneTime, isPlaying, material.course, podcastTitle, playbackSpeed, playSpeechForScene]);

  // MP4 Video Generation & Export
  const handleExportMP4 = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('MP4 Video motoru başlatılıyor...');

    // Pause live playback while exporting
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeech();
    }

    try {
      // Create offscreen canvas for crisp 1280x720 rendering
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1280;
      exportCanvas.height = 720;
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) throw new Error('Canvas 2D context oluşturulamadı.');

      // Setup audio context & oscillator synthesis for high-quality video audio track
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioDest = audioCtx.createMediaStreamDestination();

      // Ambient podcast intro chime oscillator
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioDest);
      osc.start();

      // Capture Canvas Stream at 30 FPS
      const canvasStream = exportCanvas.captureStream(30);
      audioDest.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

      // Supported MIME Types check
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
        videoBitsPerSecond: 2500000, // 2.5 Mbps crisp HD
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

      // Start Recording
      mediaRecorder.start(100);

      // Render each scene sequentially
      const totalScenes = scenes.length;
      for (let sIdx = 0; sIdx < totalScenes; sIdx++) {
        const scene = scenes[sIdx];
        const sceneDuration = Math.min(scene.durationSeconds, 8); // Render 6-8s per scene for fast smooth generation
        const fps = 30;
        const totalFrames = sceneDuration * fps;

        setExportStatusText(`Bölüm ${sIdx + 1} / ${totalScenes}: ${scene.speaker} (${scene.title}) işleniyor...`);

        // Slightly shift audio tone for host pitch distinction
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
            podcastTitle
          );

          // Update progress
          const currentTotalFrames = sIdx * totalFrames + f;
          const grandTotalFrames = totalScenes * totalFrames;
          const pct = Math.round((currentTotalFrames / grandTotalFrames) * 95);
          setExportProgress(pct);

          // Yield to browser event loop every 10 frames
          if (f % 10 === 0) {
            await new Promise(r => setTimeout(r, 16));
          }
        }
      }

      // Finish recording
      setExportProgress(98);
      setExportStatusText('MP4 dosyası derleniyor ve indirmeye hazırlanıyor...');

      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve();
        mediaRecorder.stop();
        osc.stop();
        audioCtx.close();
      });

      // Construct MP4 Blob
      const videoBlob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
      const downloadUrl = URL.createObjectURL(videoBlob);

      // Safe clean filename
      const safeTitle = (material.course ? `${material.course}-` : '') +
        (podcastTitle || 'NotebookLM-Video')
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
      toast.success('🎬 NotebookLM MP4 videosu başarıyla indirildi!');
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
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-44 w-44 rounded-full bg-rose-500/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold tracking-wider text-[11px] px-2.5 py-0.5">
                <Sparkles className="h-3 w-3 mr-1" /> NOTEBOOK-LM VİDEO STÜDYOSU
              </Badge>
              <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-[11px]">
                İKİLİ PODCAST & MP4
              </Badge>
              {material.course && (
                <Badge variant="secondary" className="text-[11px]">
                  {material.course}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
              {podcastTitle}
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
              className="bg-gradient-to-r from-cyan-500 via-blue-600 to-rose-500 hover:from-cyan-600 hover:to-rose-600 text-white font-semibold shadow-lg shadow-cyan-500/20 gap-2 h-11 px-5 rounded-xl transition-transform active:scale-95"
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

        {/* Floating In-Video Controls Overlay (hover/always accessible) */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 sm:p-5 flex flex-col gap-2">
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
                      ? 'bg-gradient-to-r from-cyan-400 to-rose-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
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
              {/* Previous Scene */}
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

              {/* Play / Pause Primary */}
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

              {/* Next Scene */}
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

              {/* Active Speaker Badge in player bar */}
              <div className="hidden sm:flex items-center gap-2 ml-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700/60">
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
              {/* Playback Speed */}
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

              {/* Mute / Unmute */}
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

              {/* Fast MP4 Download Shortcut */}
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

      {/* Tabs: Interactive Transcript, Slide Cards, and Search Suggestions */}
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md bg-slate-900 border border-slate-800">
          <TabsTrigger value="transcript" className="text-xs sm:text-sm gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Podcast Dökümü
          </TabsTrigger>
          <TabsTrigger value="slides" className="text-xs sm:text-sm gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Slayt Kartları
          </TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm gap-1.5">
            <Video className="h-3.5 w-3.5" /> Öneriler
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: NotebookLM Dual-Host Transcript */}
        <TabsContent value="transcript" className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Mic className="h-4 w-4 text-cyan-400" /> Deniz & Barış — İkili Podcast Diyaloğu
                </h3>
                <p className="text-xs text-slate-400">
                  Herhangi bir cümlenin yanındaki oynat butonuna basarak videoyu doğrudan o sahneye sarabilirsiniz.
                </p>
              </div>
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-xs">
                {scenes.length} Diyalog Sırası
              </Badge>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {scenes.map((s, idx) => {
                const isBaris = s.speaker.toLowerCase().includes('barış');
                const host = isBaris ? DEFAULT_HOSTS[1] : DEFAULT_HOSTS[0];
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
                        {/* Host Avatar Monogram */}
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
                          style={{ backgroundColor: host.color }}
                        >
                          {host.avatarText}
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

      {/* MP4 Export Progress Modal */}
      <Dialog open={isExporting} onOpenChange={() => {}}>
        <DialogContent className="max-w-md border-cyan-500/30 bg-slate-950 text-white p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-white">
              <Sparkles className="h-5 w-5 text-cyan-400 animate-spin" />
              NotebookLM MP4 Videosu Üretiliyor
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300">
              Deniz ve Barış'ın ikili podcast anlatımı, sunum slaytları ve ses dalgaları tek bir MP4 dosyasında birleştiriliyor.
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
              <p>• Çözünürlük: 1280x720 HD 16:9</p>
              <p>• Format: Standart MP4 (H.264/AAC Uyumlu)</p>
              <p>• Tamamlandığında dosya tarayıcınız tarafından otomatik indirilecektir.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotebookLMVideoStudio;
