import { useState, useEffect } from 'react';
import EconLogo from '@/components/EconLogo';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 180);
    const t2 = setTimeout(() => setPhase(2), 650);
    const t3 = setTimeout(() => onFinish(), 950);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center transition-opacity duration-500 ${phase >= 2 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ background: 'hsl(var(--background))' }}
    >
      <div className={`flex flex-col items-center gap-4 transition-all duration-700 ${phase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <EconLogo className="h-12 w-52 max-w-[70vw]" />
        <div className="flex gap-1.5 mt-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
