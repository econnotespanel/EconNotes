import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy } from 'lucide-react';
import {
  protectInlineMathForMarkdown,
  renderLatexToMathML,
  segmentAcademicMarkdown,
} from '@/lib/latexToMathml';

interface AcademicMarkdownProps {
  content: string;
}

const CodeBlockView: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/80 bg-slate-950 text-slate-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-400">
        <span className="font-mono uppercase tracking-wider">{language || 'kod'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
};

const MarkdownChunk: React.FC<{ text: string; inlineOnly?: boolean }> = ({ text, inlineOnly = false }) => {
  const { protectedText, mathExpressions } = useMemo(
    () => protectInlineMathForMarkdown(text),
    [text],
  );

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) =>
          inlineOnly ? (
            <span>{children}</span>
          ) : (
            <p className="my-2 leading-relaxed last:mb-0 first:mt-0">{children}</p>
          ),
        h1: ({ children }) => (
          <h2 className="mt-4 mb-2 text-base font-bold tracking-tight text-foreground first:mt-0 sm:text-lg">
            {children}
          </h2>
        ),
        h2: ({ children }) => (
          <h3 className="mt-4 mb-2 flex items-center gap-1.5 border-b border-border/60 pb-1 text-sm font-bold text-foreground first:mt-0 sm:text-base">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h4 className="mt-3 mb-1.5 text-sm font-semibold text-foreground first:mt-0">
            {children}
          </h4>
        ),
        h4: ({ children }) => (
          <h5 className="mt-2.5 mb-1 text-xs font-semibold uppercase tracking-wide text-primary first:mt-0">
            {children}
          </h5>
        ),
        ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-2.5 rounded-r-xl border-l-4 border-primary bg-primary/10 px-3.5 py-2.5 text-foreground/95">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-border/70" />,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        code: ({ children }) => {
          const rawText = String(children ?? '');
          const mathMatch = rawText.match(/^@@ECMATH_(\d+)@@$/);
          if (mathMatch) {
            const idx = Number(mathMatch[1]);
            const expr = mathExpressions[idx];
            if (expr !== undefined) {
              return (
                <span className="mx-0.5 inline-block align-middle">
                  {renderLatexToMathML(expr, false)}
                </span>
              );
            }
          }
          return (
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.82em] text-foreground">
              {children}
            </code>
          );
        },
      }}
    >
      {protectedText}
    </ReactMarkdown>
  );
};

export const AcademicMarkdown: React.FC<AcademicMarkdownProps> = ({ content }) => {
  const segments = useMemo(() => segmentAcademicMarkdown(content), [content]);

  return (
    <div className="academic-markdown space-y-2 text-sm leading-relaxed text-foreground">
      {segments.map((seg, idx) => {
        if (seg.type === 'display-math') {
          return (
            <div
              key={idx}
              className="my-2.5 overflow-x-auto rounded-xl border border-primary/20 bg-background/85 px-4 py-3 text-center shadow-sm"
            >
              {renderLatexToMathML(seg.latex, true)}
            </div>
          );
        }

        if (seg.type === 'code-block') {
          return <CodeBlockView key={idx} language={seg.language} code={seg.code} />;
        }

        if (seg.type === 'table') {
          return (
            <div key={idx} className="my-3 overflow-x-auto rounded-xl border border-border/80 bg-background/70">
              <table className="w-full border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/70">
                    {seg.headers.map((header, hIdx) => (
                      <th
                        key={hIdx}
                        style={{ textAlign: seg.alignments[hIdx] }}
                        className="px-3 py-2 font-semibold text-foreground"
                      >
                        <MarkdownChunk text={header} inlineOnly />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {seg.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="even:bg-muted/25">
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{ textAlign: seg.alignments[cIdx] }}
                          className="px-3 py-2 align-middle"
                        >
                          <MarkdownChunk text={cell} inlineOnly />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <MarkdownChunk key={idx} text={seg.content} />;
      })}
    </div>
  );
};

export default AcademicMarkdown;
