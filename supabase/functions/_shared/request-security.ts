import { createClient } from 'npm:@supabase/supabase-js@2';

const trustedOrigins = new Set([
  'https://econnotes.online',
  'https://www.econnotes.online',
  'https://econnotes.lovable.app',
  'https://preview--econnotes.lovable.app',
]);

export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const isTrustedOrigin = (origin: string | null): boolean => {
  if (!origin) return true;
  if (trustedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
};

export const corsHeaders = (req: Request): Headers => {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  });
  const origin = req.headers.get('origin');
  if (origin && isTrustedOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
};

export const preflightResponse = (req: Request): Response => {
  if (!isTrustedOrigin(req.headers.get('origin'))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(req) });
};

export const jsonResponse = (req: Request, body: unknown, status = 200): Response => {
  const headers = corsHeaders(req);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
};

export const getAuthenticatedUser = async (req: Request) => {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) throw new Error('Supabase auth environment is not configured.');

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user;
};

export const readJsonBody = async <T>(req: Request, maxBytes: number): Promise<T> => {
  const rawContentLength = req.headers.get('content-length');
  if (rawContentLength && !/^\d+$/.test(rawContentLength)) {
    throw new RequestError('İstek uzunluğu geçersiz.', 400);
  }
  if (rawContentLength && Number(rawContentLength) > maxBytes) {
    throw new RequestError('İstek boyutu sınırı aşıldı.', 413);
  }

  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new RequestError('İstek JSON biçiminde olmalıdır.', 415);
  }

  const reader = req.body?.getReader();
  if (!reader) throw new RequestError('İstek gövdesi eksik.', 400);

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      void reader.cancel().catch((error) => console.error('Request body cancellation failed:', error));
      throw new RequestError('İstek boyutu sınırı aşıldı.', 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(bytes);
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RequestError('İstek içeriği geçersiz.', 400);
    }
    return body as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('İstek JSON biçiminde olmalıdır.', 400);
  }
};
