const word = 'EconNotes';

const RouteLoader = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(circle at 70% 70%, hsl(280 85% 65% / 0.3), transparent 55%)',
          filter: 'blur(60px)',
        }}
      />
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-baseline gap-0.5 text-4xl md:text-5xl font-extrabold tracking-tight">
          {word.split('').map((ch, i) => (
            <span
              key={i}
              className="gradient-text animate-letter-pulse drop-shadow-[0_4px_20px_hsl(var(--primary)/0.45)]"
              style={{ animationDelay: `${i * 110}ms` }}
            >
              {ch}
            </span>
          ))}
        </div>
        <div className="h-1 w-40 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent animate-loader-bar" />
        </div>
      </div>
    </div>
  );
};

export default RouteLoader;
