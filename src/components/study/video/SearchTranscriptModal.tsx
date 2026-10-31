import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Clock,
  Play,
  ArrowRight,
  BookOpen,
  Sparkles,
  Subtitles,
  FileText,
} from 'lucide-react';
import { StudioScene, formatTime } from './sceneModel';

interface SearchResultItem {
  sceneIdx: number;
  sceneTitle: string;
  timeSec: number;
  matchType: 'sentence' | 'term' | 'takeaway' | 'title';
  speaker?: string;
  snippet: string;
  fullText: string;
}

interface SearchTranscriptModalProps {
  scenes: StudioScene[];
  onClose: () => void;
  onJumpTo: (sceneIdx: number, timeSec: number) => void;
}

export const SearchTranscriptModal: React.FC<SearchTranscriptModalProps> = ({
  scenes,
  onClose,
  onJumpTo,
}) => {
  const [query, setQuery] = useState('');

  const searchResults = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q || q.length < 2) return [];

    const results: SearchResultItem[] = [];

    scenes.forEach((sc, scIdx) => {
      // 1. Cümleler ve Altyazı Dökümü
      sc.sentences.forEach((sent, sIdx) => {
        if (sent.toLocaleLowerCase('tr-TR').includes(q)) {
          const charOffset = sc.sentenceOffsets[sIdx] || 0;
          const ratio = sc.totalChars > 0 ? charOffset / sc.totalChars : 0;
          const timeSec = Math.floor(ratio * sc.durationSec);
          const speaker = sc.sentenceSpeakers?.[sIdx] || sc.speaker;

          results.push({
            sceneIdx: scIdx,
            sceneTitle: sc.title,
            timeSec,
            matchType: 'sentence',
            speaker: speaker === 'Deniz' ? 'Dr. Deniz' : 'Barış',
            snippet: sent,
            fullText: sent,
          });
        }
      });

      // 2. Kilit Terimler & Tanımlar
      sc.keyTerms.forEach(kt => {
        if (
          kt.term.toLocaleLowerCase('tr-TR').includes(q) ||
          kt.definition.toLocaleLowerCase('tr-TR').includes(q)
        ) {
          results.push({
            sceneIdx: scIdx,
            sceneTitle: sc.title,
            timeSec: 0,
            matchType: 'term',
            snippet: `${kt.term}: ${kt.definition}`,
            fullText: kt.definition,
          });
        }
      });

      // 3. Hap Bilgiler / Önemli Notlar
      sc.keyTakeaways.forEach((tk, tkIdx) => {
        if (tk.toLocaleLowerCase('tr-TR').includes(q)) {
          const fraction = tkIdx / Math.max(1, sc.keyTakeaways.length);
          const timeSec = Math.floor(fraction * sc.durationSec);
          results.push({
            sceneIdx: scIdx,
            sceneTitle: sc.title,
            timeSec,
            matchType: 'takeaway',
            snippet: tk,
            fullText: tk,
          });
        }
      });
    });

    return results;
  }, [scenes, query]);

  // Vurgulu Metin Render Fonksiyonu
  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLocaleLowerCase('tr-TR') === q.toLocaleLowerCase('tr-TR') ? (
            <mark key={i} className="rounded bg-cyan-400/30 px-1 text-cyan-200 font-semibold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="relative flex h-full max-h-[780px] w-full max-w-[850px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#070c18] shadow-2xl">
        {/* Üst Arama Girişi */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090f20] px-4 sm:px-6 gap-3">
          <div className="flex flex-1 items-center gap-3">
            <Search className="h-5 w-5 text-cyan-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ders anlatımı, altyazılar, kavramlar veya notlar içinde ara..."
              className="h-10 w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-white/[0.05]"
              >
                Temizle
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
            title="Kapat (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sonuç Listesi */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#050914]">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500 space-y-3">
              <Search className="h-10 w-10 text-slate-700" />
              <div>
                <h4 className="text-sm font-semibold text-slate-300">Ders İçerisinde Anlık Arama</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Aramak istediğiniz terimi veya konuyu yazın. Hoca ve soru soranın tüm cümleleri ve konuşma saniyeleri taranacaktır.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                {['denge', 'fiyat', 'enflasyon', 'rant', 'faiz', 'vergi', 'talep'].map(keyword => (
                  <button
                    key={keyword}
                    onClick={() => setQuery(keyword)}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-400 hover:border-cyan-400/40 hover:text-cyan-300 transition"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500">
              <p className="text-sm font-semibold text-slate-300">
                "{query}" ile eşleşen bir anlatım cümlesi bulunamadı.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Farklı bir iktisadi kavram veya kelime kökü ile tekrar arama yapabilirsiniz.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1 px-1">
                <span>"{query}" için <strong>{searchResults.length}</strong> sonuç bulundu</span>
                <span>Tıklayarak o saniyeye atlayın</span>
              </div>

              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    onJumpTo(item.sceneIdx, item.timeSec);
                    onClose();
                  }}
                  className="group flex items-start justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 cursor-pointer transition hover:border-cyan-400/50 hover:bg-cyan-500/[0.06]"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-300 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(item.timeSec)}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-[11px] font-semibold text-slate-300 truncate">
                        Bölüm {item.sceneIdx + 1}: {item.sceneTitle}
                      </span>
                      {item.speaker && (
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            item.speaker === 'Dr. Deniz'
                              ? 'bg-cyan-500/15 text-cyan-300'
                              : 'bg-purple-500/15 text-purple-300'
                          }`}
                        >
                          {item.speaker}
                        </span>
                      )}
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-slate-400 uppercase">
                        {item.matchType === 'sentence'
                          ? 'Altyazı / Diyalog'
                          : item.matchType === 'term'
                          ? 'Kavram Tanımı'
                          : 'Önemli Not'}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-200">
                      {highlightMatch(item.snippet, query)}
                    </p>
                  </div>

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-400 group-hover:bg-cyan-500 group-hover:text-slate-950 transition">
                    <Play className="h-3.5 w-3.5 ml-0.5 fill-current" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchTranscriptModal;
