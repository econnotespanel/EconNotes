import { PDFDocument, rgb, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import { toast } from 'sonner';
import logoUrl from '@/assets/econnotes-brand-light.png';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const createAttributionStamp = async (fullName: string): Promise<Uint8Array> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 140;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Filigran görseli oluşturulamadı.');

  context.fillStyle = 'rgba(255, 255, 255, 0.76)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const logo = new Image();
  logo.src = logoUrl;
  await new Promise<void>((resolve, reject) => {
    logo.onload = () => resolve();
    logo.onerror = () => reject(new Error('EconNotes logosu yüklenemedi.'));
  });

  context.globalAlpha = 0.8;
  context.drawImage(logo, 18, 40, 260, 58);
  context.globalAlpha = 0.62;
  context.fillStyle = '#172033';
  context.textBaseline = 'middle';
  const attribution = `Bu not ${fullName} tarafından indirilmiştir`;
  const maxTextWidth = canvas.width - 320;
  let fontSize = 34;
  context.font = `600 ${fontSize}px Arial, sans-serif`;
  while (fontSize > 18 && context.measureText(attribution).width > maxTextWidth) {
    fontSize -= 1;
    context.font = `600 ${fontSize}px Arial, sans-serif`;
  }
  context.fillText(attribution, 310, 70, maxTextWidth);
  context.globalAlpha = 1;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Kişiye özel filigran dışa aktarılamadı.'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
};

export async function addWatermarkToPdf(pdfUrl: string, fullName: string): Promise<Blob> {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`PDF indirilemedi (${response.status}).`);

  const pdfDoc = await PDFDocument.load(await response.arrayBuffer(), { ignoreEncryption: true });
  const font = await pdfDoc.embedFont('Helvetica');
  const pages = pdfDoc.getPages();
  const attributionStamp = await createAttributionStamp(fullName);
  const stamp = await pdfDoc.embedPng(attributionStamp);

  for (const page of pages) {
    const { width, height } = page.getSize();
    for (let y = 80; y < height; y += 180) {
      for (let x = 60; x < width; x += 280) {
        page.drawText('EconNotes', {
          x,
          y,
          size: 28,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity: 0.12,
          rotate: degrees(-35),
        });
      }
    }
    const stampWidth = Math.min(320, width - 32);
    const stampHeight = stampWidth * stamp.height / stamp.width;
    page.drawImage(stamp, {
      x: 16,
      y: 10,
      width: stampWidth,
      height: stampHeight,
    });
  }

  const watermarkedBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(watermarkedBytes)], { type: 'application/pdf' });
}

export async function addWatermarkToImage(imageUrl: string, fullName: string): Promise<Blob> {
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

  ctx.save();
  ctx.font = `${Math.max(canvas.width, canvas.height) * 0.05}px Arial, sans-serif`;
  ctx.fillStyle = 'rgba(80, 80, 80, 0.2)';
  ctx.rotate((-35 * Math.PI) / 180);
  for (let y = -canvas.height; y < canvas.height * 2; y += 160) {
    for (let x = -canvas.width; x < canvas.width * 2; x += 260) {
      ctx.fillText('EconNotes', x, y);
    }
  }
  ctx.restore();

  const stamp = await createAttributionStamp(fullName);
  const stampImage = new Image();
  stampImage.src = URL.createObjectURL(new Blob([stamp], { type: 'image/png' }));
  try {
    await new Promise<void>((resolve, reject) => {
      stampImage.onload = () => resolve();
      stampImage.onerror = () => reject(new Error('Kişiye özel filigran görseli yüklenemedi.'));
    });
    const stampWidth = canvas.width * 0.92;
    const stampHeight = stampWidth * stampImage.naturalHeight / stampImage.naturalWidth;
    ctx.drawImage(stampImage, canvas.width * 0.04, canvas.height - stampHeight - canvas.height * 0.025, stampWidth, stampHeight);
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

export const addPersonalWatermarkToPresentation = async (pptxBytes: ArrayBuffer, stamp: Uint8Array): Promise<Blob> => {
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
    zip.file('[Content_Types].xml', contentTypes.replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/></Types>',
    ));
  }

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath)?.async('string');
    if (!slideXml || !slideXml.includes('</p:spTree>')) {
      throw new Error(`Slayt filigranlanamadı: ${slidePath}`);
    }

    const relationPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
    const existingRelations = await zip.file(relationPath)?.async('string')
      ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const relationIds = [...existingRelations.matchAll(/\bId="rId(\d+)"/g)].map((match) => Number(match[1]));
    const relationId = `rId${Math.max(0, ...relationIds) + 1}`;
    zip.file(relationPath, existingRelations.replace(
      '</Relationships>',
      `<Relationship Id="${relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/econnotes-personal-watermark.png"/></Relationships>`,
    ));

    const shapeIds = [...slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((match) => Number(match[1]));
    const shapeId = Math.max(0, ...shapeIds) + 1;
    const width = Math.min(4_000_000, slideWidth - 400_000);
    const height = width * 0.1;
    const x = 200_000;
    const y = Math.max(0, slideHeight - height - 160_000);
    const picture = `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="EconNotes kişisel filigranı"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    zip.file(slidePath, slideXml.replace('</p:spTree>', `${picture}</p:spTree>`));
  }

  return zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME });
};

export async function downloadWithWatermark(fileUrl: string, fileName: string, fileType: string, fullName: string) {
  const toastId = toast.loading('Kişiye özel filigran ekleniyor...');
  try {
    let blob: Blob;
    let downloadName = fileName || 'download';
    if (fileType === 'application/pdf') {
      blob = await addWatermarkToPdf(fileUrl, fullName);
    } else if (fileType?.startsWith('image/')) {
      blob = await addWatermarkToImage(fileUrl, fullName);
      downloadName = downloadName.replace(/\.[^/.]+$/, '') + '.png';
    } else if (fileType === PPTX_MIME || fileName.toLowerCase().endsWith('.pptx')) {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`PowerPoint indirilemedi (${response.status}).`);
      const stamp = await createAttributionStamp(fullName);
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
    toast.success('Filigranlı dosyanız indirildi.', { id: toastId });
  } catch (error) {
    console.error('Watermark error:', error);
    toast.error(error instanceof Error ? error.message : 'Filigran eklenemedi; dosya güvenli biçimde indirilmedi.', { id: toastId });
  }
}
