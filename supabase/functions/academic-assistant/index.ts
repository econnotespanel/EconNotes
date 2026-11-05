import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';
import {
  createChatCompletion,
  OpenAIGatewayError,
  OpenAIMessage,
} from '../_shared/openai-gateway.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST istekleri desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Bu işlem için giriş yapmalısınız.' }, 401);

    const body = await readJsonBody<{
      message: string;
      notesContext?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      hasFile?: boolean;
      fileName?: string;
    }>(req, 1_048_576);
    const { message, notesContext, history, hasFile, fileName } = body;
    if (
      typeof message !== 'string'
      || message.length > 30_000
      || (notesContext !== undefined && (typeof notesContext !== 'string' || notesContext.length > 40_000))
      || (fileName !== undefined && (typeof fileName !== 'string' || fileName.length > 256))
      || (history !== undefined && (
        !Array.isArray(history)
        || history.length > 12
        || history.some((item) =>
          !item
          || !['user', 'assistant'].includes(item.role)
          || typeof item.content !== 'string'
          || item.content.length > 10_000
        )
      ))
    ) {
      throw new RequestError('İstek içeriği geçersiz.', 400);
    }

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    const result = await createChatCompletion({
      model: 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 4000,
    });

    const reply = result.content || 'Yanıt alınamadı.';
    return jsonResponse(req, { reply, model: result.model });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    if (error instanceof OpenAIGatewayError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('academic-assistant request failed:', error);
    return jsonResponse(req, { error: 'Bir hata oluştu. Lütfen tekrar deneyin.' }, 500);
  }
});
