import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import {
  protectInlineMathForMarkdown,
  renderLatexToMathML,
  segmentAcademicMarkdown,
  splitInlineMath,
} from '@/lib/latexToMathml';
import {
  isSupportedImageFile,
  isUnsupportedImageFormat,
  processImageAttachment,
} from '@/lib/assistantAttachments';

describe('Academic Math & Engineering Markdown Renderer', () => {
  it('protects subscripts and asterisks inside inline math from markdown emphasis', () => {
    const input = 'Denklem $x_1 + x_2 = 10$ ve optimum $p^* = q^*$ değeridir.';
    const { protectedText, mathExpressions } = protectInlineMathForMarkdown(input);
    expect(mathExpressions).toEqual(['x_1 + x_2 = 10', 'p^* = q^*']);
    expect(protectedText).toContain('`@@ECMATH_0@@`');
    expect(protectedText).toContain('`@@ECMATH_1@@`');
  });

  it('does not treat currency amounts as inline math', () => {
    const segs = splitInlineMath('Maliyet $100 iken gelir $250 olarak ölçüldü.');
    expect(segs).toEqual([
      { type: 'text', content: 'Maliyet $100 iken gelir $250 olarak ölçüldü.' },
    ]);
  });

  it('segments display equations, matrices, code blocks, and GFM tables accurately', () => {
    const raw = [
      '### Adım 1: İntegral Hesabı',
      '$$\\int_{0}^{\\pi} \\sin(x)\\,dx = 2$$',
      '',
      '| Değişken | Değer |',
      '| :--- | :---: |',
      '| $R_1$ | $10\\,\\Omega$ |',
      '',
      '```python',
      'x = 42',
      '```',
    ].join('\n');

    const segments = segmentAcademicMarkdown(raw);
    expect(segments.map((s) => s.type)).toEqual([
      'markdown',
      'display-math',
      'table',
      'code-block',
    ]);
  });

  it('renders complex engineering LaTeX (fractions, matrices, vectors, Laplace, boxed answer) into MathML', () => {
    const content = [
      'Sistemin transfer fonksiyonu $H(s) = \\frac{\\mathcal{L}\\{y(t)\\}}{\\mathcal{L}\\{u(t)\\}}$ ve durum matrisi:',
      '$$A = \\begin{bmatrix} 0 & 1 \\\\ -\\omega_n^2 & -2\\zeta\\omega_n \\end{bmatrix}$$',
      'Sonuç olarak eşdeğer direnç $\\boxed{R_{es} = 15\\,\\Omega}$ bulunur.',
    ].join('\n\n');

    const { container } = render(<AcademicMarkdown content={content} />);
    const mathNodes = container.querySelectorAll('math');
    expect(mathNodes.length).toBe(3);
    expect(container.querySelectorAll('mfrac').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('mtable').length).toBe(1);
    expect(container.querySelector('.math-boxed')).not.toBeNull();
    expect(screen.getByText(/Sistemin transfer fonksiyonu/)).toBeInTheDocument();
  });

  it('renders standalone LaTeX aligned derivations cleanly', () => {
    const node = renderLatexToMathML(
      '\\begin{aligned} f\'(x) &= 3x^2 - 6x \\\\ &= 3x(x - 2) \\end{aligned}',
      true,
    );
    const { container } = render(<div>{node}</div>);
    expect(container.querySelector('mtable')).not.toBeNull();
    expect(container.querySelectorAll('mtr').length).toBe(2);
  });
});

describe('Gallery PNG & JPG Attachment Helpers', () => {
  it('accepts PNG, JPG, JPEG, and WebP files from gallery', () => {
    expect(isSupportedImageFile(new File(['a'], 'soru.png', { type: 'image/png' }))).toBe(true);
    expect(isSupportedImageFile(new File(['a'], 'galeri_foto.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isSupportedImageFile(new File(['a'], 'ekran.jpeg', { type: '' }))).toBe(true);
    expect(isSupportedImageFile(new File(['a'], 'not.pdf', { type: 'application/pdf' }))).toBe(false);
    expect(isUnsupportedImageFormat(new File(['a'], 'raw.heic', { type: 'image/heic' }))).toBe(true);
  });

  it('converts a gallery PNG/JPG file into base64 payload and preview URL', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const file = new File([pngBytes], 'kalkulus-soru.png', { type: 'image/png' });
    const item = await processImageAttachment(file);

    expect(item.kind).toBe('image');
    expect(item.name).toBe('kalkulus-soru.png');
    expect(item.mimeType).toBe('image/png');
    expect(item.base64Data.length).toBeGreaterThan(0);
    expect(item.previewUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
