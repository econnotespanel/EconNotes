interface Props {
  /** Marka adı. "Econ" + "Notes" biçiminde iki renkli yazılır. */
  name?: string;
  className?: string;
}

/**
 * EconNotes kelime logosu: "Econ" koyu, "Notes" mavi.
 * Gradyan/parlama efekti yoktur — sabit, okunabilir kalın grotesk yazı tipi kullanır.
 */
const Brandmark = ({ name = 'EconNotes', className = '' }: Props) => {
  const lower = name.toLowerCase();
  const splitAt = lower.indexOf('notes');
  const first = splitAt > 0 ? name.slice(0, splitAt) : name;
  const second = splitAt > 0 ? name.slice(splitAt) : '';

  return (
    <span
      className={`font-bold tracking-[-0.03em] leading-none select-none ${className}`}
      style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
    >
      <span className="text-foreground">{first}</span>
      {second && <span style={{ color: 'hsl(var(--neon-blue))' }}>{second}</span>}
    </span>
  );
};

export default Brandmark;
