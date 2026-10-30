// Client-side file extractor for Çalışma Stüdyosu uploads.
// PDFs are parsed in the browser to text (faster, no upload-payload limits).
// Images and audio are returned as base64 for multimodal AI.

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import JSZip from 'jszip';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';

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

  // PowerPoint (.pptx) slayt dökümü
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    name.endsWith('.pptx')
  ) {
    onProgress?.(10, 'Sunum slaytları taranıyor...');
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const slideEntries: { name: string; num: number; file: JSZip.JSZipObject }[] = [];
    zip.forEach((path, entry) => {
      const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match && !entry.dir) {
        slideEntries.push({ name: path, num: parseInt(match[1], 10), file: entry });
      }
    });

    slideEntries.sort((a, b) => a.num - b.num);

    if (slideEntries.length === 0) {
      throw new Error('PowerPoint sunumunda okunabilir slayt bulunamadı.');
    }

    const slideParts: string[] = [];
    const maxSlides = Math.min(slideEntries.length, 120);

    for (let i = 0; i < maxSlides; i++) {
      const slideObj = slideEntries[i];
      const xml = await slideObj.file.async('string');
      const textMatches = Array.from(xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/gi)).map(m => m[1]);
      const slideContent = textMatches.join(' ').replace(/\s+/g, ' ').trim();
      if (slideContent) {
        slideParts.push(`--- Slayt ${slideObj.num} ---\n${slideContent}`);
      }
      onProgress?.(15 + Math.round(((i + 1) / maxSlides) * 50), `Slaytlar okunuyor (${i + 1}/${maxSlides})...`);
    }

    const fullText = slideParts.join('\n\n').slice(0, 200_000);
    if (!fullText.trim()) {
      throw new Error('Slaytlardan metin çıkarılamadı (görsel ağırlıklı olabilir).');
    }

    onProgress?.(70, `${slideEntries.length} slayt başarıyla çözümlendi.`);
    return { kind: 'text', text: fullText, pages: slideEntries.length };
  }

  // Word (.docx) ders notu
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    onProgress?.(15, 'Word ders notu okunuyor...');
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const docEntry = zip.file('word/document.xml');
    if (!docEntry) {
      throw new Error('Word belgesi içeriği okunamadı.');
    }
    const xml = await docEntry.async('string');
    const paragraphs = Array.from(xml.matchAll(/<w:p\b[^>]*>(.*?)<\/w:p>/gis)).map(pMatch => {
      const pXml = pMatch[1];
      const textMatches = Array.from(pXml.matchAll(/<w:t\b[^>]*>([^<]+)<\/w:t>/gi)).map(m => m[1]);
      return textMatches.join('').trim();
    }).filter(Boolean);

    const fullText = paragraphs.join('\n\n').slice(0, 200_000);
    if (!fullText.trim()) {
      throw new Error('Word belgesinde metin bulunamadı.');
    }

    onProgress?.(65, 'Word notu hazır.');
    return { kind: 'text', text: fullText };
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

  throw new Error('Desteklenmeyen dosya türü. PDF, PowerPoint (.pptx), Word (.docx), görsel, ses veya metin yükleyin.');
}
