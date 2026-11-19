// Pure Web Audio API procedural focus soundscapes (works offline & on mobile with zero external audio files)

export type AmbientSoundId = 'off' | 'rain' | 'cafe' | 'ocean' | 'focus';

export interface AmbientSoundDef {
  id: AmbientSoundId;
  label: string;
  subtitle: string;
  emoji: string;
}

export const AMBIENT_SOUNDS: AmbientSoundDef[] = [
  { id: 'off', label: 'Sessiz', subtitle: 'Arka plan sesi kapalı', emoji: '🔇' },
  { id: 'rain', label: 'Yağmur', subtitle: 'Yumuşak pencere yağmuru', emoji: '🌧️' },
  { id: 'cafe', label: 'Kütüphane', subtitle: 'Sıcak düşük frekans uğultu', emoji: '☕' },
  { id: 'ocean', label: 'Okyanus', subtitle: 'Ritmik sahil dalgaları', emoji: '🌊' },
  { id: 'focus', label: '40Hz Odak', subtitle: 'Derin konsantrasyon tonu', emoji: '🎧' },
];

class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private currentSound: AmbientSoundId = 'off';
  private volume = 0.42;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new Ctx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private createNoiseBuffer(ctx: AudioContext, type: 'pink' | 'brown'): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'brown') {
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.2;
      }
    } else {
      // Paul Kellet's pink noise filter
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      }
    }

    return buffer;
  }

  private teardownNodes() {
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeNodes = [];
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {}
      this.masterGain = null;
    }
  }

  public setSound(sound: AmbientSoundId) {
    if (sound === this.currentSound && sound !== 'off') return;
    this.teardownNodes();
    this.currentSound = sound;

    if (sound === 'off') return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(this.volume * 0.45, ctx.currentTime + 0.6);
    master.connect(ctx.destination);
    this.masterGain = master;

    if (sound === 'rain') {
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 'pink');
      src.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1100;
      bandpass.Q.value = 0.65;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3400;

      src.connect(bandpass);
      bandpass.connect(lowpass);
      lowpass.connect(master);
      src.start();
      this.activeNodes.push(src, bandpass, lowpass);
    } else if (sound === 'cafe') {
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 'brown');
      src.loop = true;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 520;

      const warmPeak = ctx.createBiquadFilter();
      warmPeak.type = 'peaking';
      warmPeak.frequency.value = 220;
      warmPeak.gain.value = 4;

      src.connect(lowpass);
      lowpass.connect(warmPeak);
      warmPeak.connect(master);
      src.start();
      this.activeNodes.push(src, lowpass, warmPeak);
    } else if (sound === 'ocean') {
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 'brown');
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 480;

      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.55;

      // Slow surf LFO (~8.5s cycle)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;

      lfo.connect(lfoGain);
      lfoGain.connect(waveGain.gain);

      src.connect(filter);
      filter.connect(waveGain);
      waveGain.connect(master);

      src.start();
      lfo.start();
      this.activeNodes.push(src, filter, waveGain, lfo, lfoGain);
    } else if (sound === 'focus') {
      // Soft harmonic focus pad (130.81Hz C3 + 196Hz G3 + subtle 40Hz amplitude shimmer)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 130.81;

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 196.0;

      const osc3 = ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.value = 170.81; // subtle 40Hz beat against 130.81Hz

      const padGain = ctx.createGain();
      padGain.gain.value = 0.18;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;

      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(padGain);
      padGain.connect(master);

      osc1.start();
      osc2.start();
      osc3.start();
      this.activeNodes.push(osc1, osc2, osc3, filter, padGain);
    }
  }

  public setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.45, this.ctx.currentTime, 0.08);
    }
  }

  public getSound(): AmbientSoundId {
    return this.currentSound;
  }

  public getVolume(): number {
    return this.volume;
  }

  public stop() {
    this.setSound('off');
  }
}

export const ambientAudio = new AmbientAudioEngine();
