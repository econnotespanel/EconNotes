import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import { toast } from 'sonner';
import logoUrl from '@/assets/econnotes-brand-light.png';
import {
  formatWatermarkTimestamp,
  sanitizeWatermarkDisplayName,
} from '@/lib/watermarkIdentity';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const WATERMARK_COLUMNS = 3;
const WATERMARK_ROWS = 3;
const STAMP_WIDTH = 1000;
const STAMP_HEIGHT = 200;
const STAMP_ASPECT_RATIO = STAMP_WIDTH / STAMP_HEIGHT;
const WATERMARK_OPACITY = 0.14;
const DIAGONAL_ANGLE_DEG = -24;

const getWatermarkTiles = (width: number, height: number) => {
  const cellWidth = width / WATERMARK_COLUMNS;
  const cellHeight = height / WATERMARK_ROWS;
  const tileWidth = Math.min(cellWidth * 0.82, cellHeight * 0.82 * STAMP_ASPECT_RATIO);
  const tileHeight = tileWidth / STAMP_ASPECT_RATIO;

  return Array.from({ length: WATERMARK_COLUMNS * WATERMARK_ROWS }, (_, index) => {
    const column = index % WATERMARK_COLUMNS;
    const row = Math.floor(index / WATERMARK_COLUMNS);
    return {
      x: (column + 0.5) * cellWidth - tileWidth / 2,
      y: (row + 0.5) * cellHeight - tileHeight / 2,
      width: tileWidth,
      height: tileHeight,
    };
  });
};

export const createAttributionStamp = async (
  fullName: string,
  actionText?: string,
  timestampLabel?: string,
): Promise<Uint8Array> => {
  const canvas = document.createElement('canvas');
  canvas.width = STAMP_WIDTH;
  canvas.height = STAMP_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Filigran görseli oluşturulamadı.');

  const logo = new Image();
  logo.src = logoUrl;
  await new Promise<void>((resolve, reject) => {
    logo.onload = () => resolve();
    logo.onerror = () => reject(new Error('EconNotes logosu yüklenemedi.'));
  });

  const safeName = sanitizeWatermarkDisplayName(fullName);
  const safeTimestamp = timestampLabel || formatWatermarkTimestamp(new Date());

  const logoWidth = 340;
  const logoHeight = (logoWidth * logo.naturalHeight) / logo.naturalWidth;
  context.drawImage(logo, 20, (canvas.height - logoHeight) / 2, logoWidth, logoHeight);

  context.fillStyle = '#172033';
  context.textBaseline = 'middle';
  const primaryLine = actionText || `EconNotes • ${safeName}`;
  const secondaryLine = safeTimestamp;
  const textX = 385;
  const maxTextWidth = canvas.width - textX - 24;

  let fontSize = 26;
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  while (fontSize > 16 && context.measureText(primaryLine).width > maxTextWidth) {
    fontSize -= 1;
    context.font = `700 ${fontSize}px Arial, sans-serif`;
  }
  context.fillText(primaryLine, textX, canvas.height / 2 - 20, maxTextWidth);

  context.fillStyle = '#1e3a8a';
  context.font = '600 20px Arial, sans-serif';
  context.fillText(secondaryLine, textX, canvas.height / 2 + 22, maxTextWidth);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Kişiye özel filigran dışa aktarılamadı.'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
};

export async function addWatermarkToPdf(
  pdfUrl: string,
  fullName: string,
  actionText?: string,
  timestampLabel?: string,
): Promise<Blob> {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`PDF indirilemedi (${response.status}).`);

  const pdfDoc = await PDFDocument.load(await response.arrayBuffer(), { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const attributionStamp = await createAttributionStamp(fullName, actionText, timestampLabel);
  const stamp = await pdfDoc.embedPng(attributionStamp);

  const rad = (DIAGONAL_ANGLE_DEG * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (const page of pages) {
    const { width, height } = page.getSize();
    for (const tile of getWatermarkTiles(width, height)) {
      const cx = tile.x + tile.width / 2;
      const cy = tile.y + tile.height / 2;
      const halfW = tile.width / 2;
      const halfH = tile.height / 2;
      const drawX = cx - (halfW * cos - halfH * sin);
      const drawY = cy - (halfW * sin + halfH * cos);

      page.drawImage(stamp, {
        x: drawX,
        y: drawY,
        width: tile.width,
        height: tile.height,
        rotate: degrees(DIAGONAL_ANGLE_DEG),
        opacity: WATERMARK_OPACITY,
      });
    }
  }

  const watermarkedBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(watermarkedBytes)], { type: 'application/pdf' });
}

export async function addWatermarkToImage(
  imageUrl: string,
  fullName: string,
  actionText?: string,
  timestampLabel?: string,
): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Görsel notu yüklenemedi; filigransız indirme yapılmadı.'));
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Görsel filigranı oluşturulamadı.');

  ctx.drawImage(img, 0, 0);

  const stamp = await createAttributionStamp(fullName, actionText, timestampLabel);
  const stampImage = new Image();
  stampImage.src = URL.createObjectURL(new Blob([stamp as BlobPart], { type: 'image/png' }));
  try {
    await new Promise<void>((resolve, reject) => {
      stampImage.onload = () => resolve();
      stampImage.onerror = () => reject(new Error('Kişiye özel filigran görseli yüklenemedi.'));
    });

    ctx.globalAlpha = WATERMARK_OPACITY;
    const rad = (DIAGONAL_ANGLE_DEG * Math.PI) / 180;
    for (const tile of getWatermarkTiles(canvas.width, canvas.height)) {
      ctx.save();
      ctx.translate(tile.x + tile.width / 2, tile.y + tile.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(stampImage, -tile.width / 2, -tile.height / 2, tile.width, tile.height);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } finally {
    URL.revokeObjectURL(stampImage.src);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Filigranlı görsel oluşturulamadı.'));
    }, 'image/png');
  });
}

export const addPersonalWatermarkToPresentation = async (
  pptxBytes: ArrayBuffer,
  stamp: Uint8Array,
): Promise<Blob> => {
  const zip = await JSZip.loadAsync(pptxBytes);
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string');
  if (!presentationXml) throw new Error('PowerPoint sunum bilgileri okunamadı.');
  const sizeTag = presentationXml.match(/<p:sldSz\b[^>]*>/)?.[0];
  const slideWidth = Number(sizeTag?.match(/\bcx="(\d+)"/)?.[1]);
  const slideHeight = Number(sizeTag?.match(/\bcy="(\d+)"/)?.[1]);
  if (!slideWidth || !slideHeight) throw new Error('PowerPoint sayfa boyutları okunamadı.');

  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  if (slidePaths.length === 0) throw new Error('PowerPoint içinde filigranlanacak slayt bulunamadı.');

  const mediaPath = 'ppt/media/econnotes-personal-watermark.png';
  zip.file(mediaPath, stamp);
  const contentTypes = await zip.file('[Content_Types].xml')?.async('string');
  if (!contentTypes) throw new Error('PowerPoint dosya türleri okunamadı.');
  if (!/<Default\b[^>]*Extension="png"/i.test(contentTypes)) {
    zip.file(
      '[Content_Types].xml',
      contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'),
    );
  }

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath)?.async('string');
    if (!slideXml || !slideXml.includes('</p:spTree>')) {
      throw new Error(`Slayt filigranlanamadı: ${slidePath}`);
    }

    const relationPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
    const existingRelations =
      (await zip.file(relationPath)?.async('string')) ??
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const relationIds = [...existingRelations.matchAll(/\bId="rId(\d+)"/g)].map((match) =>
      Number(match[1]),
    );
    const relationId = `rId${Math.max(0, ...relationIds) + 1}`;
    zip.file(
      relationPath,
      existingRelations.replace(
        '</Relationships>',
        `<Relationship Id="${relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/econnotes-personal-watermark.png"/></Relationships>`,
      ),
    );

    const shapeIds = [...slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((match) =>
      Number(match[1]),
    );
    let shapeId = Math.max(0, ...shapeIds) + 1;
    const pictures: string[] = [];
    for (const tile of getWatermarkTiles(slideWidth, slideHeight)) {
      pictures.push(
        createPptxWatermarkPicture(
          shapeId++,
          relationId,
          Math.round(tile.x),
          Math.round(tile.y),
          Math.round(tile.width),
          Math.round(tile.height),
          Math.round(WATERMARK_OPACITY * 100_000),
        ),
      );
    }
    zip.file(slidePath, slideXml.replace('</p:spTree>', `${pictures.join('')}</p:spTree>`));
  }

  return zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME });
};

const createPptxWatermarkPicture = (
  shapeId: number,
  relationId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opacity: number,
) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="EconNotes kişisel filigranı"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationId}"><a:alphaModFix amt="${opacity}"/></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

export const getDownloadKind = (fileName: string, fileType: string | null | undefined) => {
  const type = String(fileType || '')
    .trim()
    .toLowerCase()
    .split(';', 1)[0];
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

  if (type === 'application/pdf' || type === 'pdf' || extension === 'pdf') return 'pdf';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return 'image';
  if (type === PPTX_MIME || type === 'pptx' || extension === 'pptx') return 'pptx';
  return null;
};

export async function prepareWatermarkedPreview(
  fileUrl: string,
  fileName: string,
  fileType: string | null | undefined,
  fullName: string,
  timestampLabel?: string,
): Promise<string> {
  const kind = getDownloadKind(fileName, fileType);
  const safeName = sanitizeWatermarkDisplayName(fullName);
  const actionText = `EconNotes • ${safeName}`;
  const ts = timestampLabel || formatWatermarkTimestamp(new Date());
  try {
    if (kind === 'pdf') {
      const blob = await addWatermarkToPdf(fileUrl, safeName, actionText, ts);
      return URL.createObjectURL(blob);
    } else if (kind === 'image') {
      const blob = await addWatermarkToImage(fileUrl, safeName, actionText, ts);
      return URL.createObjectURL(blob);
    }
  } catch (error) {
    // SECURITY: Fail closed — never silently serve raw unwatermarked PDF/image URLs when watermarking fails
    console.error('Önizleme filigranlama başarısız oldu:', error);
    throw new Error('Güvenli filigranlı önizleme hazırlanamadı. Lütfen tekrar deneyin.');
  }
  return fileUrl;
}

export async function downloadWithWatermark(
  fileUrl: string,
  fileName: string,
  fileType: string | null | undefined,
  fullName: string,
  timestampLabel?: string,
): Promise<boolean> {
  const toastId = toast.loading('Not indiriliyor, lütfen bekleyiniz...');
  try {
    let blob: Blob;
    let downloadName = fileName || 'download';
    const safeName = sanitizeWatermarkDisplayName(fullName);
    const ts = timestampLabel || formatWatermarkTimestamp(new Date());
    const actionText = `Bu not ${safeName} tarafından indirilmiştir`;
    const downloadKind = getDownloadKind(downloadName, fileType);

    if (downloadKind === 'pdf') {
      blob = await addWatermarkToPdf(fileUrl, safeName, actionText, ts);
    } else if (downloadKind === 'image') {
      blob = await addWatermarkToImage(fileUrl, safeName, actionText, ts);
      downloadName = downloadName.replace(/\.[^/.]+$/, '') + '.png';
    } else if (downloadKind === 'pptx') {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`PowerPoint indirilemedi (${response.status}).`);
      const stamp = await createAttributionStamp(safeName, actionText, ts);
      blob = await addPersonalWatermarkToPresentation(await response.arrayBuffer(), stamp);
    } else {
      throw new Error('Bu dosya biçimine kişisel filigran eklenemiyor; filigransız indirme engellendi.');
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Not indirildi.', { id: toastId });
    return true;
  } catch (error) {
    console.error('Watermark error:', error);
    toast.error(
      error instanceof Error ? error.message : 'Filigran eklenemedi; dosya güvenli biçimde indirilmedi.',
      { id: toastId },
    );
    return false;
  }
}
