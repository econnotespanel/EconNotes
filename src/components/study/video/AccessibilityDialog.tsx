import React from 'react';
import {
  X,
  Eye,
  Sliders,
  Type,
  Sun,
  Moon,
  Zap,
  Wifi,
  Keyboard,
  Check,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AccessibilitySettings {
  subtitleSize: 'sm' | 'md' | 'lg' | 'xl';
  highContrast: boolean;
  reduceMotion: boolean;
  lowDataMode: boolean;
  explanationLevel: 'temel' | 'orta' | 'ileri';
}

interface AccessibilityDialogProps {
  settings: AccessibilitySettings;
  onChange: (next: AccessibilitySettings) => void;
  onClose: () => void;
}

export const AccessibilityDialog: React.FC<AccessibilityDialogProps> = ({
  settings,
  onChange,
  onClose,
}) => {
  const update = (patch: Partial<AccessibilitySettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="relative flex h-full max-h-[700px] w-full max-w-[620px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#070c18] shadow-2xl">
        {/* Üst Bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090f20] px-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-400/30">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Erişilebilirlik ve Kişiselleştirme
              </h2>
              <p className="text-[11px] text-slate-400">
                Görsel, metin ve internet bağlantısı tercihlerinizi özelleştirin
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Gövde */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-[#050914] text-xs">
          {/* 1. Altyazı Boyutu */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-cyan-400" />
              <span>Altyazı Metin Boyutu</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'sm', label: 'Küçük', preview: '14px' },
                { id: 'md', label: 'Normal', preview: '16px' },
                { id: 'lg', label: 'Büyük', preview: '19px' },
                { id: 'xl', label: 'Çok Büyük', preview: '22px' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => update({ subtitleSize: opt.id as any })}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 transition ${
                    settings.subtitleSize === opt.id
                      ? 'border-cyan-400 bg-cyan-500/20 text-white font-bold ring-1 ring-cyan-400/40'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">{opt.preview}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Anlatım Zorluk Seviyesi (Kişiselleştirilmiş Öğrenme) */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span>Anlatım ve Yapay Zekâ Seviyesi</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'temel', label: 'Temel Seviye', desc: 'Sade dil & bol örnek' },
                { id: 'orta', label: 'Standart Lisans', desc: 'Dengeli akademi & grafik' },
                { id: 'ileri', label: 'İleri Akademik', desc: 'Derin formül & modeller' },
              ].map(lvl => (
                <button
                  key={lvl.id}
                  onClick={() => update({ explanationLevel: lvl.id as any })}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                    settings.explanationLevel === lvl.id
                      ? 'border-purple-400 bg-purple-500/20 text-white font-bold ring-1 ring-purple-400/40'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="font-semibold text-xs">{lvl.label}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{lvl.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Anahtar Geçişler */}
          <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Görsel ve Performans Tercihleri
            </label>

            {/* Yüksek Kontrast */}
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div>
                <p className="font-semibold text-white">Yüksek Kontrast Modu</p>
                <p className="text-[11px] text-slate-400">Metin ve tahta hatlarını daha belirginleştirir.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={e => update({ highContrast: e.target.checked })}
                className="h-4 w-4 accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Hareketi Azalt */}
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div>
                <p className="font-semibold text-white">Hareketi Azalt (Reduce Motion)</p>
                <p className="text-[11px] text-slate-400">
                  Göz yorgunluğunu önlemek için animasyonları ve parlamaları yumuşatır.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.reduceMotion}
                onChange={e => update({ reduceMotion: e.target.checked })}
                className="h-4 w-4 accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Düşük İnternet / Veri Tasarrufu */}
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div>
                <p className="font-semibold text-white">Düşük İnternet Modu (Data Saver)</p>
                <p className="text-[11px] text-slate-400">
                  Zayıf bağlantılarda ses önbelleğini genişletir ve ağır render efektlerini kapatır.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.lowDataMode}
                onChange={e => update({ lowDataMode: e.target.checked })}
                className="h-4 w-4 accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* 4. Klavye Kısayolları Referansı */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Keyboard className="h-3.5 w-3.5 text-slate-400" />
              <span>Hızlı Klavye Kontrolleri</span>
            </label>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 border border-white/[0.05]">
                <span>Oynat / Duraklat</span>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">Space</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 border border-white/[0.05]">
                <span>10 Sn Geri / İleri</span>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">← / →</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 border border-white/[0.05]">
                <span>Ses Artır / Azalt</span>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">↑ / ↓</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 border border-white/[0.05]">
                <span>Tam Ekran / PiP</span>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">F / P</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Alt Kaydet Butonu */}
        <div className="border-t border-white/[0.08] bg-[#090f20] px-5 py-3 flex justify-end">
          <Button
            onClick={onClose}
            className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-slate-950 px-5"
          >
            Tamam
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityDialog;
