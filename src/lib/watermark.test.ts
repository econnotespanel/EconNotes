import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { addPersonalWatermarkToPresentation } from './watermark';

describe('PowerPoint personal watermarking', () => {
  it('adds the EconNotes attribution stamp to every slide', async () => {
    const source = new JSZip();
    source.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
    source.file('ppt/presentation.xml', '<p:presentation><p:sldSz cx="9144000" cy="6858000"/></p:presentation>');

    for (const slideNumber of [1, 2]) {
      source.file(
        `ppt/slides/slide${slideNumber}.xml`,
        '<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1"/></p:nvGrpSpPr></p:spTree></p:sld>',
      );
      source.file(
        `ppt/slides/_rels/slide${slideNumber}.xml.rels`,
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
      );
    }

    const input = await source.generateAsync({ type: 'arraybuffer' });
    const result = await addPersonalWatermarkToPresentation(input, new Uint8Array([137, 80, 78, 71]));
    const watermarked = await JSZip.loadAsync(result);

    for (const slideNumber of [1, 2]) {
      const slide = await watermarked.file(`ppt/slides/slide${slideNumber}.xml`)?.async('string');
      const relationships = await watermarked.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`)?.async('string');
      expect(slide).toContain('EconNotes kişisel filigranı');
      expect(slide).toContain('r:embed="rId1"');
      expect(slide).toContain('<a:off x="365760" y="102870"/>');
      expect(slide).toContain('<a:ext cx="8400000" cy="1080000"/>');
      expect(relationships).toContain('Target="../media/econnotes-personal-watermark.png"');
    }

    expect(await watermarked.file('ppt/media/econnotes-personal-watermark.png')?.async('uint8array'))
      .toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(await watermarked.file('[Content_Types].xml')?.async('string')).toContain('Extension="png"');
  });
});
