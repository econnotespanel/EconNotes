import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { toast } from 'sonner';

export async function addWatermarkToPdf(pdfUrl: string): Promise<Blob> {
  const response = await fetch(pdfUrl, { mode: 'cors' });
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const text = 'EconNotes';
    const fontSize = 42;

    for (let y = -100; y < height + 200; y += 150) {
      for (let x = -200; x < width + 200; x += 250) {
        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.6, 0.6, 0.6),
          opacity: 0.18,
          rotate: degrees(-35),
        });
      }
    }
  }

  const watermarkedBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(watermarkedBytes)], { type: 'application/pdf' });
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

  ctx.save();
  ctx.font = `${Math.max(canvas.width, canvas.height) * 0.04}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(100, 100, 100, 0.18)';
  ctx.rotate((-35 * Math.PI) / 180);

  const text = 'EconNotes';
  for (let y = -canvas.height; y < canvas.height * 2; y += 140) {
    for (let x = -canvas.width; x < canvas.width * 2; x += 240) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export async function downloadWithWatermark(fileUrl: string, fileName: string, fileType: string) {
  const toastId = toast.loading('Dosya hazırlanıyor...');
  try {
    let blob: Blob;

    if (fileType === 'application/pdf') {
      blob = await addWatermarkToPdf(fileUrl);
    } else if (fileType?.startsWith('image/')) {
      blob = await addWatermarkToImage(fileUrl);
    } else {
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Dosya indirildi!', { id: toastId });
  } catch (error) {
    console.error('Watermark error:', error);
    toast.dismiss(toastId);
    // Fallback: direct download without watermark
    try {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = fileName || 'download';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.info('Dosya doğrudan indiriliyor.');
    } catch {
      window.open(fileUrl, '_blank');
    }
  }
}
