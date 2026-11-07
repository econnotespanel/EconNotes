import { describe, expect, it, vi, afterEach } from 'vitest';
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
import {
  __resetAssistantClientStateForTests,
  formatStructuredSolutionToMarkdown,
  invokeAcademicAssistantResilient,
  selectRelevantDocumentExcerpt,
} from '@/lib/assistantClient';
import { supabase } from '@/integrations/supabase/client';

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

  it('renders Gauss-Jordan augmented matrices ({ccc|c}) with vertical divider and spaced inline LaTeX', () => {
    const content = [
      'Satır işlemi ($ \\frac{1}{2}S_1 \\rightarrow S_1 $) uygulandığında genişletilmiş matris:',
      '$$\\left[\\begin{array}{ccc|c} 2 & 8 & 2 & 14 \\\\ 1 & 6 & -1 & 13 \\\\ 2 & -1 & 2 & 5 \\end{array}\\right]$$',
    ].join('\n\n');

    const { container } = render(<AcademicMarkdown content={content} />);
    expect(container.querySelectorAll('math').length).toBe(2);
    expect(container.querySelectorAll('.math-cell-divider-right').length).toBe(3);
    expect(container.querySelectorAll('.math-cell-divider-left').length).toBe(3);
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

describe('Resilient Multimodal Assistant Failover Client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetAssistantClientStateForTests();
  });

  it('answers conversational greetings ("selam", "nasılsın") instantaneously without failing when Edge Functions are down', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

    const reply1 = await invokeAcademicAssistantResilient({
      userQuestion: 'selam',
      fullMessageWithDoc: 'selam',
      mode: 'step_by_step',
      notesContext: '',
      history: [],
      images: [],
    });
    const reply2 = await invokeAcademicAssistantResilient({
      userQuestion: 'nasılsın',
      fullMessageWithDoc: 'nasılsın',
      mode: 'step_by_step',
      notesContext: '',
      history: [
        { role: 'user', content: 'selam' },
        { role: 'assistant', content: reply1 },
      ],
      images: [],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reply1).toContain('EconNotes Akademik Asistan');
    expect(reply2).toContain('İyiyim, çok teşekkür ederim');
  });

  it('fails over to Cloud STEM Reasoning Engine when all Supabase Edge Functions return 500/402/fallback', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'test-jwt-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/functions/v1/academic-assistant')) {
        return new Response(JSON.stringify({ error: 'Bir hata oluştu. Lütfen tekrar deneyin.' }), {
          status: 500,
        });
      }
      if (url.includes('/functions/v1/study-coach')) {
        return new Response(JSON.stringify({ error: 'AI servis kotası tükendi.' }), { status: 402 });
      }
      if (url.includes('/functions/v1/generate-study-material')) {
        return new Response(
          JSON.stringify({
            content: {
              overview:
                'konusu, kuramsal temelleri ve sınav ağırlığı bakımından en kritik ünitelerden biridir.',
              sections: [],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('text.pollinations.ai/openai')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '### Adım Adım Çözüm\n$$\\int x e^x\\,dx = \\boxed{e^x(x - 1) + C}$$',
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const reply = await invokeAcademicAssistantResilient({
      userQuestion: 'integral x * e^x dx nedir?',
      fullMessageWithDoc: 'integral x * e^x dx nedir?',
      mode: 'step_by_step',
      notesContext: '',
      history: [],
      images: [],
    });

    expect(reply).toContain('e^x(x - 1) + C');
    expect(reply).not.toContain('Bir hata oluştu');
  });

  it('solves quadratic equations step-by-step locally even when completely offline from all cloud endpoints', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null });
    vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));

    const reply = await invokeAcademicAssistantResilient({
      userQuestion: '2x^2 - 5x + 2 = 0 denklemini çöz',
      fullMessageWithDoc: '2x^2 - 5x + 2 = 0 denklemini çöz',
      mode: 'step_by_step',
      notesContext: '',
      history: [],
      images: [],
    });

    expect(reply).toContain('\\Delta');
    expect(reply).toContain('\\boxed{2}');
    expect(reply).toContain('\\boxed{0.5}');
  });

  it('rejects static generic fallback text in formatStructuredSolutionToMarkdown', () => {
    expect(
      formatStructuredSolutionToMarkdown({
        overview: 'Ders konusu, kuramsal temelleri ve sınav ağırlığı bakımından en kritik ünitelerden biridir.',
        sections: [],
      }),
    ).toBeNull();

    const md = formatStructuredSolutionToMarkdown({
      overview: 'Verilen integral: $$\\int_0^1 2x\\,dx$$',
      sections: [
        {
          heading: 'Adım 1: Belirsiz İntegralin Alınması',
          content: 'Kuvvet kuralı uygulanır: $x^2 + C$.',
          takeaway: 'Sonuç $\\boxed{1}$ olarak doğrulanır.',
        },
      ],
      instructorEmphasis: ['Sınır değerlerini yerine koyarken işaretlere dikkat edin.'],
    });
    expect(md).toContain('Adım 1: Belirsiz İntegralin Alınması');
    expect(md).toContain('\\boxed{1}');
  });

  it('transparently fails over to multimodal generate-study-material when academic-assistant fails on image upload', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'test-jwt-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/functions/v1/academic-assistant')) {
        return new Response(JSON.stringify({ error: 'Bir hata oluştu.' }), { status: 500 });
      }
      if (url.includes('/functions/v1/generate-study-material')) {
        return new Response(
          JSON.stringify({
            content: {
              overview: 'Görseldeki türev sorusu: $f(x) = x^3 + 2x$',
              sections: [
                {
                  heading: 'Adım 1: Türev Kurallarının Uygulanması',
                  content: '$$f\'(x) = 3x^2 + 2$$',
                  takeaway: 'Cevap $\\boxed{3x^2 + 2}$ bulunur.',
                },
              ],
              instructorEmphasis: ['Sabit terimin türevi sıfırdır.'],
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const reply = await invokeAcademicAssistantResilient({
      userQuestion: 'Görseldeki soruyu çöz.',
      fullMessageWithDoc: 'Görseldeki soruyu çöz.',
      mode: 'step_by_step',
      notesContext: '',
      history: [],
      images: [
        {
          id: 'img-1',
          kind: 'image',
          name: 'soru.jpg',
          mimeType: 'image/jpeg',
          base64Data: 'aGVsbG8=',
          previewUrl: 'data:image/jpeg;base64,aGVsbG8=',
          sizeLabel: '1.0 KB',
        },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Verify no extra x-supabase-client-platform CORS-breaking header was sent
    const firstCallHeaders = (fetchSpy.mock.calls[0][1] as RequestInit)?.headers as Record<string, string>;
    expect(Object.keys(firstCallHeaders).sort()).toEqual(['Authorization', 'Content-Type', 'apikey']);
    expect(reply).toContain('Adım 1: Türev Kurallarının Uygulanması');
    expect(reply).toContain("3x^2 + 2");
  });

  it('prioritizes matching pages in large PDF notes via selectRelevantDocumentExcerpt', () => {
    const bigNote = [
      '--- Sayfa 1 ---\nDers Girişi ve Genel Kavramlar ' + 'A'.repeat(400),
      '--- Sayfa 2 ---\nAlakasız Tarihçe Metni ' + 'B'.repeat(400),
      '--- Sayfa 3 ---\nLaplace Dönüşümü ve Diferansiyel Denklemler Çözümü f(t) = e^{-at}',
    ].join('\n\n');

    const excerpt = selectRelevantDocumentExcerpt(bigNote, 'Laplace dönüşümü nasıl çözülür?', 650);
    expect(excerpt).toContain('Laplace Dönüşümü');
    expect(excerpt).not.toContain('Alakasız Tarihçe Metni');
  });

  it('solves handwritten Gauss-Jordan matrix photos via True Multimodal Vision Cascade when Edge returns 402/500', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'test-jwt-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/functions/v1/academic-assistant')) {
        return new Response(JSON.stringify({ error: 'AI servis kotası tükendi.' }), { status: 402 });
      }
      if (url.includes('openbmb-minicpm-v-4-7-demo.hf.space/gradio_api/upload')) {
        return new Response(JSON.stringify(['/tmp/gradio/mock/gauss_jordan.jpg']), { status: 200 });
      }
      if (url.includes('openbmb-minicpm-v-4-7-demo.hf.space/gradio_api/queue/join')) {
        return new Response(JSON.stringify({ event_id: 'evt-123' }), { status: 200 });
      }
      if (url.includes('openbmb-minicpm-v-4-7-demo.hf.space/gradio_api/queue/data')) {
        const evt1 = JSON.stringify({
          msg: 'process_generating',
          output: { data: [{ reasoning: 'Checking rows...', content: '' }] },
        });
        const evt2 = JSON.stringify({
          msg: 'process_completed',
          success: true,
          output: {
            data: [
              {
                reasoning: 'Verified.',
                content:
                  '### 📌 Gauss-Jordan Çözümü\n$$\\boxed{x_1 = 5, \\quad x_2 = 1, \\quad x_3 = -2}$$\nEl yazısı çözümünüz tamamen doğrudur.',
              },
            ],
          },
        });
        return new Response(`data: ${evt1}\n\ndata: ${evt2}\n\n`, { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const stagesSeen: string[] = [];
    const reply = await invokeAcademicAssistantResilient({
      userQuestion: 'Görseldeki soruyu adım adım anlata anlata çöz.',
      fullMessageWithDoc: 'Görseldeki soruyu adım adım anlata anlata çöz.',
      mode: 'step_by_step',
      notesContext: '',
      history: [],
      images: [
        {
          id: 'img-gj',
          kind: 'image',
          name: 'gauss_jordan.jpg',
          mimeType: 'image/jpeg',
          base64Data: 'aGVsbG8=',
          previewUrl: 'data:image/jpeg;base64,aGVsbG8=',
          sizeLabel: '42.0 KB',
        },
      ],
      onProgress: (info) => stagesSeen.push(info.stage),
    });

    expect(reply).toContain('x_1 = 5');
    expect(reply).toContain('x_2 = 1');
    expect(reply).toContain('x_3 = -2');
    expect(stagesSeen).toContain('ocr');
    expect(stagesSeen).toContain('verify');
  });

  it('solves 3x3 Gauss-Jordan linear systems deterministically offline when all cloud endpoints are unreachable', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null });
    vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));

    const reply = await invokeAcademicAssistantResilient({
      userQuestion: '2x_1 + 8x_2 + 2x_3 = 14\nx_1 + 6x_2 - x_3 = 13\n2x_1 - x_2 + 2x_3 = 5',
      fullMessageWithDoc: '2x_1 + 8x_2 + 2x_3 = 14\nx_1 + 6x_2 - x_3 = 13\n2x_1 - x_2 + 2x_3 = 5',
      mode: 'step_by_step',
      notesContext: '',
      history: [],
      images: [],
    });

    expect(reply).toContain('\\begin{array}{ccc|c}');
    expect(reply).toContain('x_1 = 5');
    expect(reply).toContain('x_2 = 1');
    expect(reply).toContain('x_3 = -2');
  });
});
