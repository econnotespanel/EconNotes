// Client-side file extractor for Çalışma Stüdyosu uploads.
// PDFs are parsed in the browser to text (faster, no upload-payload limits).
// Images and audio are returned as base64 for multimodal AI.

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type Extracted =
  | { kind: 'text'; text: string; pages?: number }
  | { kind: 'image'; data: string; mime: string }
  | { kind: 'audio'; data: string; mime: string };

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const fileToText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(file);
  });

export async function extractFile(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<Extracted> {
  const name = file.name.toLowerCase();
  const mime = file.type || '';

  // Plain text / markdown
  if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    onProgress?.(20, 'Metin okunuyor...');
    const text = await fileToText(file);
    onProgress?.(60, 'Metin hazır.');
    return { kind: 'text', text: text.slice(0, 200_000) };
  }

  // PDF → browser-side parse
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    onProgress?.(10, 'PDF okunuyor...');
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const maxPages = Math.min(pdf.numPages, 80);
    const parts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it: any) => ('str' in it ? it.str : ''))
        .join(' ');
      parts.push(`--- Sayfa ${i} ---\n${pageText}`);
      onProgress?.(10 + Math.round((i / maxPages) * 50), `PDF okunuyor (${i}/${maxPages})...`);
    }
    const text = parts.join('\n\n').slice(0, 200_000);
    if (!text.trim()) throw new Error('PDF metin içermiyor (taranmış olabilir). Görsel olarak yükleyin.');
    onProgress?.(65, 'PDF metni hazır.');
    return { kind: 'text', text, pages: maxPages };
  }

  // Images
  if (mime.startsWith('image/')) {
    onProgress?.(30, 'Görsel hazırlanıyor...');
    const data = await fileToBase64(file);
    onProgress?.(60, 'Görsel hazır.');
    return { kind: 'image', data, mime };
  }

  // Audio
  if (mime.startsWith('audio/')) {
    onProgress?.(20, 'Ses dosyası kodlanıyor...');
    const data = await fileToBase64(file);
    onProgress?.(60, 'Ses dosyası hazır.');
    return { kind: 'audio', data, mime };
  }

  throw new Error('Desteklenmeyen dosya türü. PDF, görsel, ses veya metin yükleyin.');
}
