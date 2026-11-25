import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  extractStoragePathCandidates,
  storagePathFromUrl,
} from '@/lib/storageUrl';
import {
  detectPreviewFileKind,
  formatFileSizeLabel,
  parseDocxForPreview,
  parsePptxForPreview,
  resolveAdminNotePreviewFile,
} from '@/lib/adminNotePreview';

const mockSupabaseState = {
  accessToken: 'admin-jwt-token',
  edgeFunctionResponse: null as { data: any; error: any } | null,
  signedUrlResult: null as { data: { signedUrl: string } | null; error: { message: string } | null } | null,
  downloadResult: null as { data: Blob | null; error: { message: string } | null } | null,
  rpcResult: null as { data: any; error: any } | null,
  dbNoteRow: null as Record<string, any> | null,
};

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://htjmuzogayyufewirvlp.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: mockSupabaseState.accessToken
            ? {
                access_token: mockSupabaseState.accessToken,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              }
            : null,
        },
      })),
      refreshSession: vi.fn(async () => ({
        data: {
          session: mockSupabaseState.accessToken
            ? {
                access_token: mockSupabaseState.accessToken,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              }
            : null,
        },
      })),
    },
    functions: {
      invoke: vi.fn(async () => {
        if (mockSupabaseState.edgeFunctionResponse) {
          return mockSupabaseState.edgeFunctionResponse;
        }
        return { data: null, error: new Error('FunctionsHttpError: 404') };
      }),
    },
    rpc: vi.fn(async () => mockSupabaseState.rpcResult ?? { data: null, error: { message: 'not found' } }),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockSupabaseState.dbNoteRow, error: null }),
        }),
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () =>
          mockSupabaseState.signedUrlResult ?? { data: null, error: { message: 'Object not found' } },
        ),
        download: vi.fn(async () =>
          mockSupabaseState.downloadResult ?? { data: null, error: { message: 'Object not found' } },
        ),
      })),
    },
  },
}));

describe('Admin Note Preview System (Path Normalization, File Detection, PPTX/DOCX Parsing & Auth Fallback)', () => {
  beforeEach(() => {
    mockSupabaseState.accessToken = 'admin-jwt-token';
    mockSupabaseState.edgeFunctionResponse = null;
    mockSupabaseState.signedUrlResult = null;
    mockSupabaseState.downloadResult = null;
    mockSupabaseState.rpcResult = null;
    mockSupabaseState.dbNoteRow = null;
    vi.restoreAllMocks();
    // JSDOM does not provide URL.createObjectURL / revokeObjectURL by default
    let objectUrlCounter = 0;
    URL.createObjectURL = vi.fn(() => `blob:test-preview-${++objectUrlCounter}`);
    URL.revokeObjectURL = vi.fn();
  });

  it('normalizes storage paths cleanly across relative paths, bucket prefixes, and signed/public URLs', () => {
    expect(storagePathFromUrl('user-1/1793555671937.pdf')).toBe('user-1/1793555671937.pdf');
    expect(storagePathFromUrl('/notes/user-1/1793555671937.pdf')).toBe('user-1/1793555671937.pdf');
    expect(storagePathFromUrl('notes/user-1/1793555671937.pptx?download=1')).toBe('user-1/1793555671937.pptx');
    expect(
      storagePathFromUrl(
        'https://htjmuzogayyufewirvlp.supabase.co/storage/v1/object/sign/notes/user-1/mikro%20not.pdf?token=xyz',
      ),
    ).toBe('user-1/mikro not.pdf');
    expect(
      storagePathFromUrl(
        'https://htjmuzogayyufewirvlp.supabase.co/storage/v1/object/notes/user-1/slayt.pptx',
      ),
    ).toBe('user-1/slayt.pptx');

    const candidates = extractStoragePathCandidates('notes/user-1/dosya%201.pdf');
    expect(candidates[0]).toBe('user-1/dosya 1.pdf');
    expect(candidates).toContain('user-1/dosya%201.pdf');
  });

  it('detects PDF, PPTX, DOCX, Images, and Text accurately even when MIME type is empty or octet-stream', () => {
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    expect(
      detectPreviewFileKind({
        fileName: 'bilinmeyen-dosya',
        fileType: 'application/octet-stream',
        bytes: pdfMagic,
      }),
    ).toBe('pdf');

    const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(
      detectPreviewFileKind({
        fileName: 'foto',
        fileType: '',
        bytes: pngMagic,
      }),
    ).toBe('image');

    expect(
      detectPreviewFileKind({
        fileName: 'Makro_Iktisat_Hafta4.pptx',
        fileType: '',
      }),
    ).toBe('pptx');

    expect(
      detectPreviewFileKind({
        fileName: 'Ozet_Not.docx',
        fileType: 'application/octet-stream',
      }),
    ).toBe('docx');

    expect(formatFileSizeLabel(1536 * 1024)).toBe('1.50 MB');
  });

  it('parses real PPTX slides including titles, bullet text, tables, embedded images, and speaker notes', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Para Politikası Araçları</a:t></a:r></a:p></p:txBody></p:sp>
          <p:sp><p:txBody><a:p><a:r><a:t>Açık piyasa işlemleri ve faiz koridoru</a:t></a:r></a:p></p:txBody></p:sp>
          <a:tbl>
            <a:tr><a:tc><a:p><a:r><a:t>Araç</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>Etki</a:t></a:r></a:p></a:tc></a:tr>
            <a:tr><a:tc><a:p><a:r><a:t>Zorunlu Karşılık</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>Likidite Kontrolü</a:t></a:r></a:p></a:tc></a:tr>
          </a:tbl>
        </p:spTree></p:cSld>
      </p:sld>`,
    );
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>`,
    );
    zip.file('ppt/media/image1.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:p><a:r><a:t>Sınavda bu tablo sorulabilir.</a:t></a:r></a:p>
      </p:notes>`,
    );

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parsePptxForPreview(buf);

    expect(parsed.slideCount).toBe(1);
    expect(parsed.slides[0].title).toBe('Para Politikası Araçları');
    expect(parsed.slides[0].paragraphs).toContain('Açık piyasa işlemleri ve faiz koridoru');
    expect(parsed.slides[0].tables).toHaveLength(1);
    expect(parsed.slides[0].tables[0][1][0]).toBe('Zorunlu Karşılık');
    expect(parsed.slides[0].images).toHaveLength(1);
    expect(parsed.slides[0].speakerNotes).toContain('Sınavda bu tablo sorulabilir.');
    parsed.revokeUrls();
  });

  it('parses real DOCX Word documents preserving headings, paragraphs, and tables', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Mikroekonomi Özeti</w:t></w:r></w:p>
          <w:p><w:r><w:t>Talep esnekliği fiyat değişimine verilen tepkidir.</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>Durum</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Değer</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>Esnek</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>|e| &gt; 1</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
        </w:body>
      </w:document>`,
    );

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseDocxForPreview(buf);

    expect(parsed.blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Mikroekonomi Özeti' });
    expect(parsed.blocks[1]).toEqual({
      type: 'paragraph',
      text: 'Talep esnekliği fiyat değişimine verilen tepkidir.',
      isBullet: false,
    });
    expect(parsed.blocks[2]).toEqual({
      type: 'table',
      rows: [
        ['Durum', 'Değer'],
        ['Esnek', '|e| > 1'],
      ],
    });
    parsed.revokeUrls();
  });

  it('loads pending PDF via verified admin Edge Function even when stored MIME is octet-stream', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
    mockSupabaseState.edgeFunctionResponse = {
      data: {
        signedUrl: 'https://htjmuzogayyufewirvlp.supabase.co/storage/v1/object/sign/notes/u1/not.pdf?token=ok',
        resolvedPath: 'u1/not.pdf',
        fileName: 'İktisat_Notu.pdf',
        fileType: 'application/octet-stream',
        fileSize: pdfBytes.byteLength,
        note: { id: 'note-pending-1', status: 'pending', file_url: 'u1/not.pdf' },
      },
      error: null,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/octet-stream' } })),
    );

    const res = await resolveAdminNotePreviewFile({
      id: 'note-pending-1',
      status: 'pending',
      file_url: 'u1/not.pdf',
      file_name: 'İktisat_Notu.pdf',
      file_type: '',
    });

    expect(res.ok).toBe(true);
    expect(res.source).toBe('edge_function');
    expect(res.fileKind).toBe('pdf');
    expect(res.fileType).toBe('application/pdf');
    expect(res.blobUrl).toBeTruthy();
    res.dispose();
  });

  it('falls back cleanly to authenticated Storage download for 72-hour expired revision PPTX notes', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>72 Saat Süresi Dolmuş Sunum</a:t></a:r></a:p></p:sld>`,
    );
    const pptxBytes = await zip.generateAsync({ type: 'uint8array' });

    // Edge Function unavailable (not yet deployed) + createSignedUrl fails -> direct authenticated storage.download()
    mockSupabaseState.edgeFunctionResponse = { data: null, error: new Error('404') };
    mockSupabaseState.signedUrlResult = { data: null, error: { message: 'Signed URL failed' } };
    mockSupabaseState.downloadResult = {
      data: new Blob([pptxBytes], { type: 'application/octet-stream' }),
      error: null,
    };

    const expiredDeadline = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await resolveAdminNotePreviewFile({
      id: 'note-expired-72h',
      status: 'revision_requested',
      revision_deadline: expiredDeadline,
      file_url: 'notes/u2/sunum.pptx',
      file_name: 'Sunum.pptx',
      file_type: '',
    });

    expect(res.ok).toBe(true);
    expect(res.source).toBe('storage_direct_download');
    expect(res.fileKind).toBe('pptx');
    expect(res.arrayBuffer).not.toBeNull();
    res.dispose();
  });

  it('surfaces real Turkish error when note has no file_url instead of hiding failure', async () => {
    mockSupabaseState.edgeFunctionResponse = {
      data: {
        error: 'Bu not kaydına bağlı yüklenmiş bir dosya yolu (file_url) bulunmuyor.',
        code: 'NO_FILE_URL',
      },
      error: null,
    };

    const res = await resolveAdminNotePreviewFile({
      id: 'note-no-file',
      status: 'pending',
      file_url: null,
      file_name: null,
    });

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('NO_FILE_URL');
    expect(res.error).toContain('dosya yolu');
  });
});
