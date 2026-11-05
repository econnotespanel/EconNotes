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
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface OpenAIChatOptions {
  model?: 'gpt-4o' | 'gpt-4o-mini';
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
  const key = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY');
  if (!key) {
    throw new OpenAIGatewayError('AI servisi yapılandırılmamış (OPENAI_API_KEY eksik).', 500);
  }
  return key;
};

/**
 * Execute a Chat Completion request with automatic structured schema support.
 */
export async function createChatCompletion(options: OpenAIChatOptions): Promise<{
  content: string;
  parsedJson?: unknown;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}> {
  const apiKey = getOpenAIApiKey();
  const isLovableGateway = apiKey.startsWith('la-') || !Deno.env.get('OPENAI_API_KEY');
  
  const endpoint = isLovableGateway
    ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  // Map model if on Lovable gateway fallback, else use pure OpenAI model
  const selectedModel = isLovableGateway
    ? (options.model === 'gpt-4o' ? 'openai/gpt-4o' : 'openai/gpt-4o-mini')
    : (options.model || 'gpt-4o-mini');

  const payload: Record<string, unknown> = {
    model: selectedModel,
    messages: options.messages,
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 429) {
    throw new OpenAIGatewayError('Yoğunluk: Lütfen birazdan tekrar deneyin.', 429);
  }
  if (response.status === 402 || response.status === 403) {
    throw new OpenAIGatewayError('AI servis kotası tükendi.', 402);
  }
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI Gateway error [${response.status}]:`, errorText);
    throw new OpenAIGatewayError('AI servisi yanıt vermedi.', 502, errorText);
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
