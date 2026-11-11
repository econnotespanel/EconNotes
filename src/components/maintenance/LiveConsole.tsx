import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, RotateCcw, ShieldCheck, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LogLine {
  id: number;
  time: string;
  tag: 'INFO' | 'SYNC' | 'SEC' | 'CACHE' | 'DB' | 'OK';
  text: string;
}

const STATIC_LOG_SEEDS: Array<{ tag: LogLine['tag']; text: string }> = [
  { tag: 'INFO', text: 'EconNotes altyapı bakım modu başlatıldı. Oturum izolasyonu sağlandı.' },
  { tag: 'DB', text: 'PostgreSQL ana kümesi indeksleri optimize ediliyor (btree_notes_univ_idx)...' },
  { tag: 'SYNC', text: '45,820+ öğrenci ders notu ve sınav sorusu SHA-256 hash kontrolünden geçti: 0 hata.' },
  { tag: 'SEC', text: 'TLS 1.3 ve 256-bit AES veri tabanı şifreleme anahtarları doğrulandı.' },
  { tag: 'CACHE', text: 'Redis önbellek kümesi temizlendi ve akademik ders kataloğu önbelleklendi.' },
  { tag: 'INFO', text: 'Bulut CDN uç noktaları (İstanbul & Frankfurt) güncelleniyor...' },
  { tag: 'DB', text: 'Veritabanı bağlantı havuzu (PgBouncer) sınav dönemi trafiği için 600 paralel bağlantıya yükseltildi.' },
  { tag: 'SEC', text: 'Öğrenci puanları, rozetleri ve profil verileri sıfır veri kaybı garantisiyle kilitlendi.' },
  { tag: 'INFO', text: 'EconNotes AI Çalışma Asistanı vektör veritabanı indeksleri senkronize edildi.' },
  { tag: 'OK', text: 'Bütün servis sağlık testleri başarıyla geçti. Yeniden açılış hazırlıkları sürüyor.' },
];

export const LiveConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Initialize and simulate incremental streaming logs
  useEffect(() => {
    let currentId = 1;
    const initialLogs: LogLine[] = [];
    const baseDate = new Date();

    const addLogEntry = (seed: (typeof STATIC_LOG_SEEDS)[0], offsetSec: number) => {
      const d = new Date(baseDate.getTime() + offsetSec * 1000);
      const timeStr = d.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return {
        id: currentId++,
        time: timeStr,
        tag: seed.tag,
        text: seed.text,
      };
    };

    // First 4 logs immediately
    for (let i = 0; i < 4; i++) {
      initialLogs.push(addLogEntry(STATIC_LOG_SEEDS[i], i * 3));
    }
    setLogs(initialLogs);

    // Stream remaining logs one by one
    let index = 4;
    const interval = setInterval(() => {
      if (index < STATIC_LOG_SEEDS.length) {
        const seed = STATIC_LOG_SEEDS[index];
        setLogs((prev) => [...prev, addLogEntry(seed, index * 4)]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 2200);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom of console
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    const text = logs.map((l) => `[${l.time}] [${l.tag}] ${l.text}`).join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRestart = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs([
      {
        id: Date.now(),
        time: timeStr,
        tag: 'INFO',
        text: 'Konsol günlüğü yenilendi. Canlı altyapı telemetrisi dinleniyor...',
      },
      ...STATIC_LOG_SEEDS.slice(0, 3).map((s, idx) => ({
        id: Date.now() + idx + 1,
        time: timeStr,
        tag: s.tag,
        text: s.text,
      })),
    ]);
  };

  const getTagBadge = (tag: LogLine['tag']) => {
    switch (tag) {
      case 'OK':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'SEC':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'DB':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
      case 'CACHE':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'SYNC':
        return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
      default:
        return 'text-slate-300 bg-slate-500/10 border-slate-500/30';
    }
  };

  return (
    <div className="w-full rounded-2xl bg-[#030919] border border-blue-500/20 p-4 sm:p-5 shadow-2xl overflow-hidden font-mono text-xs">
      {/* Terminal Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          {/* macOS Style Traffic Dots */}
          <div className="flex items-center gap-1.5 mr-2">
            <span className="h-3 w-3 rounded-full bg-rose-500/80 inline-block border border-rose-400/40" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block border border-amber-400/40" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block border border-emerald-400/40" />
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <Terminal className="h-3.5 w-3.5 text-blue-400" />
            <span className="font-bold text-white tracking-wide text-xs">ops-worker@econnotes-cloud:~</span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
            CANLI TELEMETRİ
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestart}
            className="h-7 text-[11px] text-slate-300 hover:text-white hover:bg-white/10 px-2 py-1 gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Yeniden Oynat</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-[11px] text-slate-300 hover:text-white hover:bg-white/10 px-2 py-1 gap-1"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Kopyalandı' : 'Günlüğü Kopyala'}</span>
          </Button>
        </div>
      </div>

      {/* Terminal Log Stream Area */}
      <div
        ref={logContainerRef}
        className="mt-3 h-[240px] overflow-y-auto space-y-2 pr-2 text-slate-300 scrollbar-thin scrollbar-thumb-white/10"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 leading-relaxed animate-in fade-in duration-300">
            <span className="text-slate-500 select-none shrink-0">{log.time}</span>
            <span
              className={`px-1.5 py-0.2 rounded border text-[10px] font-bold select-none shrink-0 ${getTagBadge(
                log.tag
              )}`}
            >
              {log.tag}
            </span>
            <span className="text-slate-200 flex-1 break-words">{log.text}</span>
          </div>
        ))}

        {/* Blinking Cursor at Bottom */}
        <div className="flex items-center gap-2 pt-1 text-slate-400">
          <span className="text-cyan-400">root@econnotes#</span>
          <span className="h-3.5 w-2 bg-cyan-400 animate-pulse inline-block" />
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>Veri Bütünlüğü: %100 • SHA-256 Doğrulandı</span>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span>Sunucu Yükü: Normal • 0 Hata</span>
        </div>
      </div>
    </div>
  );
};

export default LiveConsole;
