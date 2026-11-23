import { Music, Sparkles, Volume2, VolumeX, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  isTurkishTtsSupported,
  unlockTriviaAudio,
  type TriviaAudioPrefs,
} from '@/lib/triviaAudio';
import { cn } from '@/lib/utils';

interface TriviaAudioControlsProps {
  prefs: TriviaAudioPrefs;
  onChange: (next: TriviaAudioPrefs) => void;
  compact?: boolean;
}

export function TriviaAudioControls({
  prefs,
  onChange,
  compact = false,
}: TriviaAudioControlsProps) {
  const ttsSupported = isTurkishTtsSupported();
  const isMuted = !prefs.masterEnabled || prefs.volume <= 0.01;

  const update = (patch: Partial<TriviaAudioPrefs>) => {
    unlockTriviaAudio();
    onChange({ ...prefs, ...patch });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => unlockTriviaAudio()}
          aria-label="Ses ve görünüm ayarları"
          title="Ses ve animasyon ayarları"
          className={cn(
            'relative h-8 shrink-0 gap-1.5 rounded-xl border-border/80 bg-background/80 text-xs font-semibold transition-colors',
            compact ? 'w-8 px-0 sm:w-auto sm:px-2.5' : 'px-2.5',
            !isMuted && prefs.musicEnabled && 'border-primary/45 bg-primary/10 text-primary',
          )}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-primary" />
          )}
          <span className={cn(compact ? 'hidden sm:inline' : 'inline')}>Ses</span>
          {!isMuted && prefs.musicEnabled && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
            />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(19.5rem,calc(100vw-1.5rem))] space-y-3.5 rounded-2xl border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-foreground">Yarışma Ses &amp; Atmosfer</h3>
            <p className="text-[11px] text-muted-foreground">
              Tercihlerin sonraki yarışmalarda hatırlanır.
            </p>
          </div>
          <Switch
            checked={prefs.masterEnabled}
            onCheckedChange={(checked) => update({ masterEnabled: checked })}
            aria-label="Tüm sesleri aç veya kapat"
          />
        </div>

        {/* Volume Slider */}
        <div className={cn('space-y-2', !prefs.masterEnabled && 'opacity-50')}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-foreground">Ses Seviyesi</span>
            <span className="font-mono font-bold tabular-nums text-primary">
              %{Math.round(prefs.volume * 100)}
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            disabled={!prefs.masterEnabled}
            value={[Math.round(prefs.volume * 100)]}
            onValueChange={([v]) => update({ volume: v / 100 })}
            aria-label="Ses seviyesi"
          />
        </div>

        <div className="space-y-2.5 border-t border-border/60 pt-2.5">
          {/* SFX Toggle */}
          <label
            className={cn(
              'flex cursor-pointer items-center justify-between gap-2 text-xs',
              !prefs.masterEnabled && 'pointer-events-none opacity-50',
            )}
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Ses Efektleri
            </span>
            <Switch
              checked={prefs.sfxEnabled}
              disabled={!prefs.masterEnabled}
              onCheckedChange={(checked) => update({ sfxEnabled: checked })}
            />
          </label>

          {/* Opt-in Background Music Toggle */}
          <label
            className={cn(
              'flex cursor-pointer items-center justify-between gap-2 text-xs',
              !prefs.masterEnabled && 'pointer-events-none opacity-50',
            )}
          >
            <div className="min-w-0">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Music className="h-3.5 w-3.5 text-primary" />
                Arka Plan Müziği
              </span>
              <p className="pl-[22px] text-[10.5px] text-muted-foreground">
                Yarışma sırasında sakin fon (isteğe bağlı)
              </p>
            </div>
            <Switch
              checked={prefs.musicEnabled}
              disabled={!prefs.masterEnabled}
              onCheckedChange={(checked) => update({ musicEnabled: checked })}
            />
          </label>

          {/* Voice Reading Toggle */}
          <label
            className={cn(
              'flex cursor-pointer items-center justify-between gap-2 text-xs',
              (!prefs.masterEnabled || !ttsSupported) && 'pointer-events-none opacity-50',
            )}
          >
            <div className="min-w-0">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Waves className="h-3.5 w-3.5 text-primary" />
                Sesli Soru Okuma (tr-TR)
              </span>
              {!ttsSupported && (
                <p className="pl-[22px] text-[10px] text-muted-foreground">
                  Bu tarayıcıda seslendirme desteklenmiyor
                </p>
              )}
            </div>
            <Switch
              checked={prefs.ttsEnabled && ttsSupported}
              disabled={!prefs.masterEnabled || !ttsSupported}
              onCheckedChange={(checked) => update({ ttsEnabled: checked })}
            />
          </label>

          {/* Read A-D Options Sub-Toggle */}
          {ttsSupported && prefs.ttsEnabled && prefs.masterEnabled && (
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px]">
              <span className="font-medium text-muted-foreground">
                Soru okurken 4 şıkkı da (A–D) seslendir
              </span>
              <Switch
                checked={prefs.ttsReadOptions}
                onCheckedChange={(checked) => update({ ttsReadOptions: checked })}
              />
            </label>
          )}
        </div>

        {/* Reduced Motion Accessibility Toggle */}
        <div className="border-t border-border/60 pt-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="font-medium text-foreground">Animasyonları Azalt</span>
              <p className="text-[10.5px] text-muted-foreground">
                Daha sade ve düşük pil tüketimli geçişler
              </p>
            </div>
            <Switch
              checked={prefs.reducedMotion}
              onCheckedChange={(checked) => update({ reducedMotion: checked })}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
