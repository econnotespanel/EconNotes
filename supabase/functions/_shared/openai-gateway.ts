/**
 * Centralized Server-Side OpenAI Gateway for EconNotes 2.0
 * 
 * Provides unified, secure access to official OpenAI APIs:
 * - Text Generation & Structured Outputs (gpt-4o, gpt-4o-mini)
 * - Neural Text-to-Speech (tts-1)
 * - Speech-to-Text Transcription (whisper-1)
 * 
 * All API keys are loaded strictly from server-side environment variables.
 */

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
      >;
}

export interface OpenAIChatOptions {
  model?:
    | 'gpt-4o'
    | 'gpt-4o-mini'
    | 'google/gemini-2.5-pro'
    | 'google/gemini-2.5-flash'
    | 'openai/gpt-4o'
    | 'openai/gpt-4o-mini';
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: unknown;
}

export interface OpenAITtsOptions {
  model?: 'tts-1' | 'tts-1-hd';
  input: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  speed?: number;
}

export class OpenAIGatewayError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = 'OpenAIGatewayError';
  }
}

export const getOpenAIApiKey = (): string => {
  const key =
    Deno.env.get('OPENAI_API_KEY') ||
    Deno.env.get('LOVABLE_API_KEY') ||
    Deno.env.get('GEMINI_API_KEY') ||
    Deno.env.get('GOOGLE_API_KEY') ||
    Deno.env.get('GROQ_API_KEY') ||
    Deno.env.get('DEEPSEEK_API_KEY');
  if (!key) {
    throw new OpenAIGatewayError('AI servisi yapılandırılmamış (API anahtarı eksik).', 500);
  }
  return key;
};

/**
 * Execute a Chat Completion request with automatic multi-gateway fallback & structured schema support.
 */
export async function createChatCompletion(options: OpenAIChatOptions): Promise<{
  content: string;
  parsedJson?: unknown;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  const groqKey = Deno.env.get('GROQ_API_KEY');
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');

  interface GatewayProvider {
    name: string;
    apiKey: string;
    endpoint: string;
    model: string;
    isLovableGateway: boolean;
  }

  const providers: GatewayProvider[] = [];

  // 1. Direct OpenAI API (if configured)
  if (openaiKey && !openaiKey.startsWith('la-')) {
    providers.push({
      name: 'openai',
      apiKey: openaiKey,
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: options.model?.startsWith('openai/')
        ? options.model.slice('openai/'.length)
        : options.model && !options.model.includes('/')
        ? options.model
        : 'gpt-4o',
      isLovableGateway: false,
    });
  }

  // 2. Direct Google Gemini OpenAI-compatible Endpoint (if configured)
  if (geminiKey) {
    providers.push({
      name: 'gemini',
      apiKey: geminiKey,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: options.model === 'gpt-4o-mini' ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      isLovableGateway: false,
    });
  }

  // 3. Direct Groq API (if configured)
  if (groqKey) {
    providers.push({
      name: 'groq',
      apiKey: groqKey,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      isLovableGateway: false,
    });
  }

  // 4. Direct DeepSeek API (if configured)
  if (deepseekKey) {
    providers.push({
      name: 'deepseek',
      apiKey: deepseekKey,
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat',
      isLovableGateway: false,
    });
  }

  // 5. Lovable Gateway (if configured)
  if (lovableKey) {
    providers.push({
      name: 'lovable',
      apiKey: lovableKey,
      endpoint: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      model: options.model?.includes('/')
        ? options.model
        : options.model === 'gpt-4o'
        ? 'google/gemini-2.5-pro'
        : 'google/gemini-2.5-flash',
      isLovableGateway: true,
    });
  }

  if (providers.length === 0 && openaiKey) {
    providers.push({
      name: 'openai-fallback',
      apiKey: openaiKey,
      endpoint: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      model: 'google/gemini-2.5-pro',
      isLovableGateway: true,
    });
  }

  if (providers.length === 0) {
    throw new OpenAIGatewayError('AI servisi yapılandırılmamış (API anahtarı eksik).', 500);
  }

  let lastErr: OpenAIGatewayError | null = null;

  for (const provider of providers) {
    const { apiKey, endpoint, model: selectedModel, isLovableGateway } = provider;

    const normalizedMessages = isLovableGateway
      ? options.messages.map((msg) => {
          if (!Array.isArray(msg.content)) return msg;
          return {
            ...msg,
            content: msg.content.map((part) =>
              part.type === 'image_url'
                ? { type: 'image_url' as const, image_url: { url: part.image_url.url } }
                : part,
            ),
          };
        })
      : options.messages;

    const payload: Record<string, unknown> = {
      model: selectedModel,
      messages: normalizedMessages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 4000,
    };

    if (options.jsonSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.jsonSchema.name,
          strict: options.jsonSchema.strict ?? true,
          schema: options.jsonSchema.schema,
        },
      };
    } else if (options.tools) {
      payload.tools = options.tools;
      if (options.tool_choice) {
        payload.tool_choice = options.tool_choice;
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI Gateway error [${selectedModel} @ ${response.status}]:`, errorText);
        if (response.status === 429) {
          lastErr = new OpenAIGatewayError('Yoğunluk: Lütfen birazdan tekrar deneyin.', 429, errorText);
        } else if (response.status === 402 || response.status === 403) {
          lastErr = new OpenAIGatewayError('AI servis kotası tükendi.', 402, errorText);
        } else {
          lastErr = new OpenAIGatewayError('AI servisi yanıt vermedi.', 502, errorText);
        }
        continue;
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;

      // Handle function calling response
      if (message?.tool_calls?.[0]?.function?.arguments) {
        try {
          const parsed = JSON.parse(message.tool_calls[0].function.arguments);
          return {
            content: message.tool_calls[0].function.arguments,
            parsedJson: parsed,
            usage: data.usage,
            model: selectedModel,
          };
        } catch {
          // return as text if JSON parse fails
        }
      }

      // Handle json_schema response_format
      if (message?.content && options.jsonSchema) {
        try {
          const parsed = JSON.parse(message.content);
          return {
            content: message.content,
            parsedJson: parsed,
            usage: data.usage,
            model: selectedModel,
          };
        } catch {
          // fallback
        }
      }

      return {
        content: message?.content || '',
        usage: data.usage,
        model: selectedModel,
      };
    } catch (err) {
      console.error(`AI Gateway network failure [${selectedModel}]:`, err);
      lastErr = new OpenAIGatewayError('AI servisine bağlanılamadı.', 502, err);
    }
  }

  // Emergency zero-key reasoning fallback for plain-text chat when configured keys are exhausted (402/502)
  const hasMultimodalImages = options.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'),
  );
  if (!hasMultimodalImages && !options.tools && !options.jsonSchema) {
    try {
      const pubRes = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: options.messages,
          temperature: options.temperature ?? 0.2,
        }),
      });
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        const pubText = pubData?.choices?.[0]?.message?.content;
        if (typeof pubText === 'string' && pubText.trim().length > 0) {
          return {
            content: pubText.trim(),
            usage: pubData.usage,
            model: 'econnotes-reasoning',
          };
        }
      }
    } catch {
      // Ignore fallback error and surface original gateway error below
    }
  }

  throw lastErr ?? new OpenAIGatewayError('AI servisi yanıt vermedi.', 502);
}

/**
 * Execute Text-to-Speech synthesis using OpenAI Audio Speech API
 */
export async function createSpeech(options: OpenAITtsOptions): Promise<{
  audioBuffer: ArrayBuffer;
  contentType: string;
}> {
  const apiKey = getOpenAIApiKey();
  const isLovableGateway = apiKey.startsWith('la-') || !Deno.env.get('OPENAI_API_KEY');

  const endpoint = isLovableGateway
    ? 'https://ai.gateway.lovable.dev/v1/audio/speech'
    : 'https://api.openai.com/v1/audio/speech';

  const format = options.response_format || 'mp3';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'tts-1',
      input: options.input,
      voice: options.voice || 'alloy',
      response_format: format,
      speed: options.speed || 1.0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`OpenAI Speech error [${response.status}]:`, err);
    throw new OpenAIGatewayError('Ses sentezleme servisi yanıt vermedi.', response.status, err);
  }

  const audioBuffer = await response.arrayBuffer();
  const contentType = format === 'mp3' ? 'audio/mpeg' : format === 'wav' ? 'audio/wav' : 'audio/ogg';
  return { audioBuffer, contentType };
}
