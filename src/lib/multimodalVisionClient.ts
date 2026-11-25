import { AssistantImageItem } from '@/lib/assistantAttachments';
import { AssistantProgressStage } from '@/lib/assistantClient';

export interface MultimodalVisionSolveParams {
  systemPrompt: string;
  userQuestion: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  images: AssistantImageItem[];
  report: (stage: AssistantProgressStage, percent: number, label: string) => void;
}

/**
 * SECURITY NOTICE:
 * Direct browser uploads of student exam photos/documents to unauthenticated public demo
 * HuggingFace Spaces were disabled to prevent unconsented third-party data exfiltration.
 * All multimodal vision and OCR processing must run through EconNotes's authenticated
 * Supabase Edge Functions (`academic-assistant`, `generate-study-material`, `study-coach`)
 * or local in-browser OCR.
 */
export async function extractDocumentTextViaPaddleOcrVl(
  _images: AssistantImageItem[],
  _report?: (stage: AssistantProgressStage, percent: number, label: string) => void,
): Promise<string> {
  return '';
}

export async function extractHandwrittenLatexViaVisionOcr(
  _images: AssistantImageItem[],
  _report?: (stage: AssistantProgressStage, percent: number, label: string) => void,
): Promise<string> {
  return '';
}

export async function invokeMultimodalVisionCascade(
  _params: MultimodalVisionSolveParams,
): Promise<string | null> {
  return null;
}
