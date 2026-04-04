import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

export async function addWatermarkToPdf(pdfUrl: string): Promise<Blob> {
  const response = await fetch(pdfUrl);
  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const text = 'EconNotes';
    const fontSize = 48;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    // Draw repeated diagonal watermarks
    for (let y = -100; y < height + 200; y += 180) {
      for (let x = -100; x < width + 200; x += 300) {
        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.7, 0.7, 0.7),
          opacity: 0.12,
          rotate: degrees(-35),
        });
      }
    }
  }

  const watermarkedBytes = await pdfDoc.save();
  return new Blob([watermarkedBytes], { type: 'application/pdf' });
}

export async function addWatermarkToImage(imageUrl: string): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0);

  // Draw repeated diagonal watermarks
  ctx.save();
  ctx.font = `${Math.max(canvas.width, canvas.height) * 0.04}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(128, 128, 128, 0.12)';
  ctx.rotate((-35 * Math.PI) / 180);

  const text = 'EconNotes';
  for (let y = -canvas.height; y < canvas.height * 2; y += 160) {
    for (let x = -canvas.width; x < canvas.width * 2; x += 280) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export async function downloadWithWatermark(fileUrl: string, fileName: string, fileType: string) {
  try {
    let blob: Blob;

    if (fileType === 'application/pdf') {
      blob = await addWatermarkToPdf(fileUrl);
    } else if (fileType.startsWith('image/')) {
      blob = await addWatermarkToImage(fileUrl);
    } else {
      // For other file types, download as-is
      const res = await fetch(fileUrl);
      blob = await res.blob();
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Watermark error, falling back to direct download:', error);
    window.open(fileUrl, '_blank');
  }
}
