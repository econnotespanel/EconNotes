import { useState, useEffect } from 'react';
import logo from '@/assets/econnotes-logo.png';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 1500);
    const t3 = setTimeout(() => onFinish(), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center transition-opacity duration-500 ${phase >= 2 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{
        background: 'linear-gradient(135deg, hsl(217, 91%, 20%), hsl(221, 83%, 30%), hsl(213, 80%, 35%))',
      }}
    >
      <div className={`flex flex-col items-center gap-4 transition-all duration-700 ${phase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <img src={logo} alt="EconNotes" className="h-24 w-24 object-contain brightness-0 invert drop-shadow-2xl" />
        <h1 className="text-3xl font-bold text-white tracking-wide">EconNotes</h1>
        <div className="flex gap-1.5 mt-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/80 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
