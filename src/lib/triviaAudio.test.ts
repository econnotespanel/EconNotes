import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTriviaSpeechText,
  getDefaultTriviaAudioPrefs,
  loadTriviaAudioPrefs,
  playTriviaSound,
  saveTriviaAudioPrefs,
  startTriviaAmbientMusic,
  stopAllTriviaAudio,
} from './triviaAudio';

describe('Daily Trivia Audio Engine & Turkish TTS (tr-TR)', () => {
  beforeEach(() => {
    localStorage.clear();
    stopAllTriviaAudio();
  });

  it('defaults to SFX enabled, opt-in music disabled (never auto-plays), and persists preferences', () => {
    const defaults = getDefaultTriviaAudioPrefs();
    expect(defaults.masterEnabled).toBe(true);
    expect(defaults.sfxEnabled).toBe(true);
    expect(defaults.musicEnabled).toBe(false);
    expect(defaults.ttsEnabled).toBe(true);
    expect(defaults.volume).toBeGreaterThan(0);

    const updated = {
      ...defaults,
      masterEnabled: true,
      musicEnabled: true,
      ttsReadOptions: false,
      volume: 0.45,
      reducedMotion: true,
    };
    saveTriviaAudioPrefs(updated);

    const reloaded = loadTriviaAudioPrefs();
    expect(reloaded.musicEnabled).toBe(true);
    expect(reloaded.ttsReadOptions).toBe(false);
    expect(reloaded.volume).toBe(0.45);
    expect(reloaded.reducedMotion).toBe(true);
  });

  it('strictly silences all SFX and background music when muted or disabled', () => {
    const muted = { ...getDefaultTriviaAudioPrefs(), masterEnabled: false, musicEnabled: true };
    expect(playTriviaSound('start', muted)).toBe(false);
    expect(playTriviaSound('correct', muted)).toBe(false);
    expect(playTriviaSound('wrong', muted)).toBe(false);
    expect(playTriviaSound('grand_prize', muted)).toBe(false);
    expect(startTriviaAmbientMusic(muted)).toBe(false);

    const sfxOff = { ...getDefaultTriviaAudioPrefs(), sfxEnabled: false };
    expect(playTriviaSound('select', sfxOff)).toBe(false);

    const zeroVol = { ...getDefaultTriviaAudioPrefs(), volume: 0, musicEnabled: true };
    expect(playTriviaSound('complete', zeroVol)).toBe(false);
    expect(startTriviaAmbientMusic(zeroVol)).toBe(false);
  });

  it('builds clear Turkish (tr-TR) speech text with optional A-D options', () => {
    const questionOnly = buildTriviaSpeechText({
      questionIndex: 2,
      question: 'Türkiye Cumhuriyetinin başkenti neresidir?',
      options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'],
      includeOptions: false,
    });
    expect(questionOnly).toBe('Soru 3. Türkiye Cumhuriyetinin başkenti neresidir?');
    expect(questionOnly).not.toContain('A şıkkı');

    const withOptions = buildTriviaSpeechText({
      questionIndex: 2,
      question: 'Türkiye Cumhuriyetinin başkenti neresidir?',
      options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'],
      includeOptions: true,
    });
    expect(withOptions).toContain('Soru 3.');
    expect(withOptions).toContain('A şıkkı: İstanbul.');
    expect(withOptions).toContain('B şıkkı: Ankara.');
    expect(withOptions).toContain('C şıkkı: İzmir.');
    expect(withOptions).toContain('D şıkkı: Bursa.');
  });
});
