import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { addPersonalWatermarkToPresentation } from './watermark';

describe('PowerPoint personal watermarking', () => {
  it('tiles small translucent personal stamps in a regular grid across every slide', async () => {
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
      expect(slide).toContain('<a:alphaModFix amt="14000"/>');
      expect(slide).not.toContain('<a:alphaModFix amt="30000"/>');
      expect((slide?.match(/<p:pic>/g) ?? []).length).toBe(24);

      const positions = [...(slide?.matchAll(/<a:off x="(\d+)" y="(\d+)"\/>/g) ?? [])]
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      const columns = [...new Set(positions.map(({ x }) => x))];
      const rows = [...new Set(positions.map(({ y }) => y))];
      expect(columns).toHaveLength(3);
      expect(rows).toHaveLength(8);
      expect(columns[1] - columns[0]).toBe(columns[2] - columns[1]);
      expect(rows[1] - rows[0]).toBe(rows[7] - rows[6]);
      expect(positions[0]).toEqual({ x: 274320, y: 178689 });
      expect(slide).toContain('<a:ext cx="2499360" cy="499872"/>');
      expect(relationships).toContain('Target="../media/econnotes-personal-watermark.png"');
    }

    expect(await watermarked.file('ppt/media/econnotes-personal-watermark.png')?.async('uint8array'))
      .toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(await watermarked.file('[Content_Types].xml')?.async('string')).toContain('Extension="png"');
  });
});
