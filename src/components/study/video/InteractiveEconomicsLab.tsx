import React, { useState, useMemo } from 'react';
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  HelpCircle,
  ArrowRight,
  BookOpen,
  DollarSign,
  Maximize2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InteractiveEconomicsLabProps {
  onClose: () => void;
  onAskCoach?: (question: string) => void;
  courseTitle?: string;
}

type SimMode = 'market' | 'fiscal' | 'elasticity';

export const InteractiveEconomicsLab: React.FC<InteractiveEconomicsLabProps> = ({
  onClose,
  onAskCoach,
  courseTitle = 'Mikroekonomi & İktisat',
}) => {
  const [mode, setMode] = useState<SimMode>('market');

  // 1. Arz - Talep ve Piyasa Dengesi Parametreleri
  // Talep: Qd = a - bP
  // Arz:   Qs = c + dP
  const [demandBase, setDemandBase] = useState<number>(120); // a
  const [demandSlope, setDemandSlope] = useState<number>(4); // b
  const [supplyBase, setSupplyBase] = useState<number>(20); // c
  const [supplySlope, setSupplySlope] = useState<number>(6); // d
  const [currentPrice, setCurrentPrice] = useState<number>(10); // P

  // Analitik Denge Hesaplamaları
  // a - bP = c + dP => P* = (a - c) / (b + d)
  const eqPrice = useMemo(() => {
    const denom = demandSlope + supplySlope;
    if (denom === 0) return 10;
    return Math.max(1, Math.round(((demandBase - supplyBase) / denom) * 10) / 10);
  }, [demandBase, supplyBase, demandSlope, supplySlope]);

  const eqQuantity = useMemo(() => {
    return Math.max(1, Math.round(demandBase - demandSlope * eqPrice));
  }, [demandBase, demandSlope, eqPrice]);

  // Mevcut fiyattaki talep ve arz miktarları
  const qDemand = Math.max(0, Math.round(demandBase - demandSlope * currentPrice));
  const qSupply = Math.max(0, Math.round(supplyBase + supplySlope * currentPrice));
  const diffQ = qSupply - qDemand; // > 0: Fazla / Artık, < 0: Kıtlık

  // Tüketici Rantı ve Üretici Rantı
  // Max P (Qd = 0) = a / b
  const maxDemandP = demandSlope > 0 ? demandBase / demandSlope : 30;
  // Min P (Qs = 0) = -c / d
  const minSupplyP = supplySlope > 0 ? Math.max(0, -supplyBase / supplySlope) : 0;

  const consumerSurplus = useMemo(() => {
    if (maxDemandP <= eqPrice) return 0;
    return Math.round(0.5 * (maxDemandP - eqPrice) * eqQuantity);
  }, [maxDemandP, eqPrice, eqQuantity]);

  const producerSurplus = useMemo(() => {
    if (eqPrice <= minSupplyP) return 0;
    return Math.round(0.5 * (eqPrice - minSupplyP) * eqQuantity);
  }, [eqPrice, minSupplyP, eqQuantity]);

  // 2. Maliye / İltizam & Vergi Akışı Simülatörü Parametreleri
  const [agriculturalOutput, setAgriculturalOutput] = useState<number>(1000); // 1000 kile buğday
  const [taxRate, setTaxRate] = useState<number>(12); // %12 aşar / vergi oranı
  const [mültezimCut, setMültezimCut] = useState<number>(18); // %18 mültezim kâr payı

  const grossTax = Math.round((agriculturalOutput * taxRate) / 100);
  const mültezimProfit = Math.round((grossTax * mültezimCut) / 100);
  const treasuryRevenue = grossTax - mültezimProfit;

  // Sıfırla
  const resetMarket = () => {
    setDemandBase(120);
    setDemandSlope(4);
    setSupplyBase(20);
    setSupplySlope(6);
    setCurrentPrice(10);
  };

  const applyPreset = (type: 'shiftDemand' | 'shiftSupply' | 'priceCeiling' | 'priceFloor') => {
    if (type === 'shiftDemand') {
      // Tüketici geliri arttı -> Talep sağa kayar
      setDemandBase(160);
      setCurrentPrice(14);
    } else if (type === 'shiftSupply') {
      // Girdi maliyeti düştü -> Arz arttı
      setSupplyBase(50);
      setCurrentPrice(9);
    } else if (type === 'priceCeiling') {
      // Taban fiyat / Tavan fiyat (Kıtlık)
      setCurrentPrice(6);
    } else if (type === 'priceFloor') {
      // Taban fiyat (Artık)
      setCurrentPrice(15);
    }
  };

  // SVG Koordinat Dönüşümleri (Genişlik 480, Yükseklik 320)
  const svgW = 460;
  const svgH = 300;
  const padL = 45;
  const padB = 40;
  const padT = 20;
  const padR = 25;

  const maxPlotP = 28;
  const maxPlotQ = 180;

  const toSvgX = (q: number) => padL + (Math.max(0, Math.min(maxPlotQ, q)) / maxPlotQ) * (svgW - padL - padR);
  const toSvgY = (p: number) => svgH - padB - (Math.max(0, Math.min(maxPlotP, p)) / maxPlotP) * (svgH - padB - padT);

  // Talep doğrusu uç noktaları
  const dStart = { x: toSvgX(demandBase - demandSlope * 24), y: toSvgY(24) };
  const dEnd = { x: toSvgX(demandBase - demandSlope * 2), y: toSvgY(2) };

  // Arz doğrusu uç noktaları
  const sStart = { x: toSvgX(supplyBase + supplySlope * 2), y: toSvgY(2) };
  const sEnd = { x: toSvgX(supplyBase + supplySlope * 24), y: toSvgY(24) };

  const eqSvg = { x: toSvgX(eqQuantity), y: toSvgY(eqPrice) };
  const curDemandSvg = { x: toSvgX(qDemand), y: toSvgY(currentPrice) };
  const curSupplySvg = { x: toSvgX(qSupply), y: toSvgY(currentPrice) };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-md animate-fade-in select-none font-sans">
      <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#090e1c] shadow-[0_25px_90px_rgba(0,0,0,0.85)] text-slate-100">
        {/* Üst Başlık Çubuğu */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0c1326] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">İnteraktif Akademik Simülasyon Laboratuvarı</h3>
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 border border-cyan-500/25">
                  Canlı Model
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Grafik parametrelerini değiştirin, piyasa dengesi ve refah değişimini anında gözlemleyin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
              <button
                onClick={() => setMode('market')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mode === 'market'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Arz - Talep Dengesi</span>
              </button>
              <button
                onClick={() => setMode('fiscal')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mode === 'fiscal'
                    ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Maliye & İltizam Akışı</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Ana İçerik */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {mode === 'market' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Sol: İnteraktif Grafik Tuvali (SVG) */}
              <div className="lg:col-span-7 flex flex-col rounded-2xl border border-white/[0.08] bg-[#060a14] p-4 shadow-inner">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                    Piyasa Koordinat Düzlemi (Fiyat $P$ / Miktar $Q$)
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    <span className="text-cyan-300 font-bold">D: Talep</span>
                    <span className="text-amber-300 font-bold">S: Arz</span>
                    <span className="text-emerald-300 font-bold">E₀: Denge ({eqPrice}₺, {eqQuantity} Adet)</span>
                  </div>
                </div>

                <div className="relative mt-2 w-full aspect-[4/3] flex items-center justify-center">
                  <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full overflow-visible select-none">
                    <defs>
                      <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.03" />
                      </linearGradient>
                      <linearGradient id="psGrad" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#c084fc" stopOpacity="0.03" />
                      </linearGradient>
                    </defs>

                    {/* Koordinat Izgaraları */}
                    {[5, 10, 15, 20, 25].map(p => (
                      <g key={p}>
                        <line
                          x1={padL}
                          y1={toSvgY(p)}
                          x2={svgW - padR}
                          y2={toSvgY(p)}
                          stroke="rgba(148,163,184,0.09)"
                          strokeWidth="1"
                        />
                        <text
                          x={padL - 6}
                          y={toSvgY(p) + 3}
                          fontSize="9"
                          fill="#64748b"
                          textAnchor="end"
                          fontFamily="monospace"
                        >
                          {p}₺
                        </text>
                      </g>
                    ))}
                    {[30, 60, 90, 120, 150].map(q => (
                      <g key={q}>
                        <line
                          x1={toSvgX(q)}
                          y1={padT}
                          x2={toSvgX(q)}
                          y2={svgH - padB}
                          stroke="rgba(148,163,184,0.09)"
                          strokeWidth="1"
                        />
                        <text
                          x={toSvgX(q)}
                          y={svgH - padB + 14}
                          fontSize="9"
                          fill="#64748b"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {q}
                        </text>
                      </g>
                    ))}

                    {/* Ana Eksenler */}
                    <line
                      x1={padL}
                      y1={padT}
                      x2={padL}
                      y2={svgH - padB}
                      stroke="#94a3b8"
                      strokeWidth="2"
                    />
                    <line
                      x1={padL}
                      y1={svgH - padB}
                      x2={svgW - padR + 8}
                      y2={svgH - padB}
                      stroke="#94a3b8"
                      strokeWidth="2"
                    />

                    {/* Eksen Etiketleri */}
                    <text x={padL - 10} y={padT - 4} fontSize="11" fontWeight="bold" fill="#38bdf8" textAnchor="end">
                      P (Fiyat)
                    </text>
                    <text x={svgW - padR + 10} y={svgH - padB + 16} fontSize="11" fontWeight="bold" fill="#38bdf8">
                      Q (Miktar)
                    </text>

                    {/* Tüketici Rantı Üçgeni (Consumer Surplus) */}
                    <polygon
                      points={`${padL},${toSvgY(maxDemandP)} ${eqSvg.x},${eqSvg.y} ${padL},${eqSvg.y}`}
                      fill="url(#csGrad)"
                      stroke="rgba(34,211,238,0.3)"
                      strokeDasharray="2 2"
                    />

                    {/* Üretici Rantı Üçgeni (Producer Surplus) */}
                    <polygon
                      points={`${padL},${toSvgY(minSupplyP)} ${eqSvg.x},${eqSvg.y} ${padL},${eqSvg.y}`}
                      fill="url(#psGrad)"
                      stroke="rgba(192,132,252,0.3)"
                      strokeDasharray="2 2"
                    />

                    {/* Talep Eğrisi (D) */}
                    <line
                      x1={dStart.x}
                      y1={dStart.y}
                      x2={dEnd.x}
                      y2={dEnd.y}
                      stroke="#22d3ee"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <text x={dEnd.x + 6} y={dEnd.y + 4} fontSize="12" fontWeight="bold" fill="#22d3ee">
                      D₀
                    </text>

                    {/* Arz Eğrisi (S) */}
                    <line
                      x1={sStart.x}
                      y1={sStart.y}
                      x2={sEnd.x}
                      y2={sEnd.y}
                      stroke="#fbbf24"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <text x={sEnd.x + 6} y={sEnd.y - 2} fontSize="12" fontWeight="bold" fill="#fbbf24">
                      S₀
                    </text>

                    {/* Denge Noktası (E0) İzdüşüm Çizgileri */}
                    <line
                      x1={padL}
                      y1={eqSvg.y}
                      x2={eqSvg.x}
                      y2={eqSvg.y}
                      stroke="#34d399"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <line
                      x1={eqSvg.x}
                      y1={eqSvg.y}
                      x2={eqSvg.x}
                      y2={svgH - padB}
                      stroke="#34d399"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Denge Noktası Çemberi */}
                    <circle cx={eqSvg.x} cy={eqSvg.y} r="6" fill="#34d399" stroke="#060a14" strokeWidth="2" />
                    <text
                      x={eqSvg.x + 8}
                      y={eqSvg.y - 8}
                      fontSize="11"
                      fontWeight="bold"
                      fill="#34d399"
                    >
                      E₀ ({eqPrice}₺, {eqQuantity})
                    </text>

                    {/* Mevcut Seçilen Fiyat Çizgisi (P) */}
                    {Math.abs(currentPrice - eqPrice) > 0.3 && (
                      <g>
                        <line
                          x1={padL}
                          y1={toSvgY(currentPrice)}
                          x2={Math.max(curDemandSvg.x, curSupplySvg.x) + 12}
                          y2={toSvgY(currentPrice)}
                          stroke={diffQ > 0 ? '#f43f5e' : '#f59e0b'}
                          strokeWidth="2"
                          strokeDasharray="5 3"
                        />
                        {/* Artık / Kıtlık Aralığı Şeridi */}
                        <line
                          x1={Math.min(curDemandSvg.x, curSupplySvg.x)}
                          y1={toSvgY(currentPrice)}
                          x2={Math.max(curDemandSvg.x, curSupplySvg.x)}
                          y2={toSvgY(currentPrice)}
                          stroke={diffQ > 0 ? '#f43f5e' : '#f59e0b'}
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <circle cx={curDemandSvg.x} cy={toSvgY(currentPrice)} r="4" fill="#22d3ee" />
                        <circle cx={curSupplySvg.x} cy={toSvgY(currentPrice)} r="4" fill="#fbbf24" />
                      </g>
                    )}
                  </svg>
                </div>

                {/* Piyasa Durum Kartı */}
                <div
                  className={`mt-3 rounded-xl border p-3 text-xs leading-relaxed transition ${
                    Math.abs(diffQ) < 2
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                      : diffQ > 0
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                      : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[13px] mb-1">
                    <span>
                      {Math.abs(diffQ) < 2
                        ? 'Piyasa Tam Dengede (E₀)'
                        : diffQ > 0
                        ? `Piyasa Artığı (Arz Fazlası: +${diffQ} Adet)`
                        : `Piyasa Kıtlığı (Talep Fazlası: ${Math.abs(diffQ)} Adet)`}
                    </span>
                    <span className="font-mono text-xs">
                      P = {currentPrice}₺ (Denge: {eqPrice}₺)
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90">
                    {Math.abs(diffQ) < 2
                      ? `Arz edilen miktar (${qSupply}) ile talep edilen miktar (${qDemand}) eşitlenmiştir. Görünmez el (fiyat mekanizması) tam etkin çalışmaktadır.`
                      : diffQ > 0
                      ? `Fiyat denge fiyatının üzerinde (${currentPrice}₺ > ${eqPrice}₺). Satıcılar ellerindeki ${diffQ} adetlik stoku eritmek için fiyatı düşürmek zorunda kalacaktır.`
                      : `Fiyat denge fiyatının altında (${currentPrice}₺ < ${eqPrice}₺). Tüketiciler mal bulamadığı için kuyruklar oluşacak, fiyat yukarı doğru itilecektir.`}
                  </p>
                </div>
              </div>

              {/* Sağ: Canlı Kontrol Paneli & Hızlı Senaryolar */}
              <div className="lg:col-span-5 space-y-4">
                {/* 1. Fiyat Kontrolü */}
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
                      Piyasa Fiyatı ($P$)
                    </label>
                    <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded border border-cyan-500/25">
                      {currentPrice} ₺
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={22}
                    step={0.5}
                    value={currentPrice}
                    onChange={e => setCurrentPrice(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>3 ₺ (Düşük)</span>
                    <button
                      onClick={() => setCurrentPrice(eqPrice)}
                      className="text-cyan-400 hover:underline font-semibold"
                    >
                      Dengeye Getir ({eqPrice} ₺)
                    </button>
                    <span>22 ₺ (Yüksek)</span>
                  </div>
                </div>

                {/* 2. Talep ve Arz Eğrisi Kaymaları */}
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-200">Eğri Kayması & Dışsal Şoklar</h4>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Tüketici Geliri / Tercih (Talep $a$):</span>
                        <span className="font-mono font-bold text-cyan-300">{demandBase}</span>
                      </div>
                      <input
                        type="range"
                        min={80}
                        max={180}
                        step={5}
                        value={demandBase}
                        onChange={e => setDemandBase(Number(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Teknoloji / Girdi Maliyeti (Arz $c$):</span>
                        <span className="font-mono font-bold text-amber-300">{supplyBase}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={60}
                        step={5}
                        value={supplyBase}
                        onChange={e => setSupplyBase(Number(e.target.value))}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. İktisadi Refah & Rant Hesabı */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-cyan-500/[0.03] p-4 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center justify-between">
                    <span>Toplumsal Refah & Rant Dağılımı</span>
                    <span className="font-mono text-cyan-300 font-bold">
                      {consumerSurplus + producerSurplus} ₺
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-2.5">
                      <div className="text-[10px] text-cyan-300 uppercase font-semibold">Tüketici Rantı (CS)</div>
                      <div className="text-base font-bold text-white mt-0.5">{consumerSurplus} ₺</div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Tüketicinin ödemeye hazır olduğu fazlalık</p>
                    </div>
                    <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-2.5">
                      <div className="text-[10px] text-purple-300 uppercase font-semibold">Üretici Rantı (PS)</div>
                      <div className="text-base font-bold text-white mt-0.5">{producerSurplus} ₺</div>
                      <p className="text-[9px] text-slate-400 mt-0.5">Üreticinin maliyeti üstündeki kazancı</p>
                    </div>
                  </div>
                </div>

                {/* 4. Hazır Senaryo Butonları */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => applyPreset('shiftDemand')}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 transition"
                  >
                    📈 Gelir Artışı (Talep Kayması)
                  </button>
                  <button
                    onClick={() => applyPreset('shiftSupply')}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 hover:border-amber-400/40 hover:text-amber-200 transition"
                  >
                    ⚙️ Verimlilik Artışı (Arz Kayması)
                  </button>
                  <button
                    onClick={() => applyPreset('priceCeiling')}
                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 transition"
                  >
                    ⚠️ Tavan Fiyat (Kıtlık)
                  </button>
                  <button
                    onClick={resetMarket}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 hover:text-white transition flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Sıfırla
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === 'fiscal' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-purple-500/25 bg-purple-500/10 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-bold text-purple-200">
                    Osmanlı İktisat Tarihi & Mali Sistem: İltizam ve Hazine Gelirleri Akışı
                  </h4>
                  <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                    Maliye Modeli
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tarımsal üretimden alınan aşar vergisinin doğrudan devlet eliyle değil, mültezimler aracılığıyla peşin ihale (iltizam) yöntemiyle hazineye aktarılma dinamiği:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/[0.08] bg-[#060a14] p-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Tarımsal Üretim Hacmi (Kile)</label>
                  <input
                    type="range"
                    min={500}
                    max={2500}
                    step={100}
                    value={agriculturalOutput}
                    onChange={e => setAgriculturalOutput(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <div className="font-mono text-lg font-bold text-cyan-300">{agriculturalOutput} Kile</div>
                  <p className="text-[10px] text-slate-400">Köylünün hasat ettiği toplam ürün</p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#060a14] p-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Aşar / Vergi Oranı (%)</label>
                  <input
                    type="range"
                    min={10}
                    max={25}
                    step={1}
                    value={taxRate}
                    onChange={e => setTaxRate(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                  <div className="font-mono text-lg font-bold text-amber-300">%{taxRate} ({grossTax} Kile)</div>
                  <p className="text-[10px] text-slate-400">Şer'i ve örfi vergi toplamı</p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#060a14] p-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Mültezim Payı & İhale Kârı (%)</label>
                  <input
                    type="range"
                    min={5}
                    max={35}
                    step={1}
                    value={mültezimCut}
                    onChange={e => setMültezimCut(Number(e.target.value))}
                    className="w-full accent-purple-400"
                  />
                  <div className="font-mono text-lg font-bold text-purple-300">%{mültezimCut} ({mültezimProfit} Kile)</div>
                  <p className="text-[10px] text-slate-400">Vergi toplayıcının risk ve kâr payı</p>
                </div>
              </div>

              {/* Akış Diagramı */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#060a14] p-5">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-3 border-b border-white/[0.06]">
                  <span>Mali Transfer Zinciri</span>
                  <span>Net Hazine Geliri: <strong className="text-emerald-300 font-mono text-sm">{treasuryRevenue} Kile</strong></span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4 text-center">
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">1. Üretici (Reaya)</div>
                    <div className="font-bold text-white mt-1">{agriculturalOutput - grossTax} Kile</div>
                    <div className="text-[10px] text-slate-400 mt-1">Köylüye kalan geçimlik ürün</div>
                  </div>
                  <div className="flex items-center justify-center text-slate-500">➔</div>
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
                    <div className="text-[10px] text-purple-300 uppercase font-semibold">2. Mültezim (İltizam)</div>
                    <div className="font-bold text-purple-200 mt-1">{mültezimProfit} Kile</div>
                    <div className="text-[10px] text-slate-400 mt-1">İhale komisyonu ve kârı</div>
                  </div>
                  <div className="flex items-center justify-center text-slate-500">➔</div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="text-[10px] text-emerald-300 uppercase font-semibold">3. Hazine-i Amire</div>
                    <div className="font-bold text-emerald-200 mt-1">{treasuryRevenue} Kile</div>
                    <div className="text-[10px] text-slate-400 mt-1">Merkezi ordu ve maaşlar</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alt Bilgi ve Asistan Köprüsü */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-[#070c18] px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Simülatör anlık mikro-ekonomik ve maliye teorisi formülleriyle çalışır.</span>
          </div>

          {onAskCoach && (
            <Button
              size="sm"
              onClick={() => {
                onClose();
                onAskCoach(
                  mode === 'market'
                    ? `Piyasa fiyatı ${currentPrice} TL iken oluşan ${
                        diffQ > 0 ? `arz fazlasını (${diffQ} adet)` : `kıtlığı (${Math.abs(diffQ)} adet)`
                      } ve dengeye dönüş mekanizmasını açıklar mısın?`
                    : `İltizam sisteminde mültezim kâr payı ile merkezi hazine gelirleri arasındaki gerilimi açıklar mısın?`,
                );
              }}
              className="gap-1.5 rounded-xl bg-cyan-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Bu Modeli Akıl Hocasına Sor</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InteractiveEconomicsLab;
