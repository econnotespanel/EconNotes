export type MaterialType = 'summary' | 'quiz' | 'flashcards' | 'video';

export type SummaryDepth = 'short' | 'standard' | 'comprehensive' | 'textbook';

export type PedagogicalStyle =
  | 'balanced'
  | 'academic_rigor'
  | 'feynman'
  | 'case_study'
  | 'quantitative'
  | 'exam_blitz';

export type QuizFormat = 'multiple_choice' | 'open_ended' | 'mixed';
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'mixed';
export type CoachMode = 'tutor' | 'feynman' | 'socratic' | 'deep_research' | 'grade_answer';

export interface SummaryCheckpointQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface SummarySection {
  index?: number;
  heading: string;
  pageRange?: string;
  content: string;
  takeaways?: string[];
  deepResearchNote?: string;
  commonPitfalls?: string[];
  checkpointQuestion?: SummaryCheckpointQuestion;
}

export interface ComparativeMatrix {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface DeepResearchTopic {
  topic: string;
  literatureContext: string;
  realWorldApplication?: string;
}

export interface TeacherEmphasisItem {
  point: string;
  whyImportant: string;
  examProbability?: 'Yüksek' | 'Orta' | string;
}

export interface KeyTermItem {
  term: string;
  definition: string;
  formula?: string;
}

export interface SummaryContent {
  overview: string;
  disciplineTag?: string;
  keyPoints: string[];
  sections: SummarySection[];
  teacherEmphasis?: TeacherEmphasisItem[];
  comparativeMatrix?: ComparativeMatrix;
  deepResearchTopics?: DeepResearchTopic[];
  keyTerms?: KeyTermItem[];
  studyChecklist?: string[];
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
    summaryDepth?: SummaryDepth;
    sourceStats?: {
      sourceCount: number;
      wordCount: number;
      pagesOrSlides: number;
      sectionCount: number;
    };
  };
}

export interface QuizQuestion {
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: string[];
  correctIndex?: number;
  sampleAnswer?: string;
  rubric?: string[];
  explanation?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  bloomLevel?: string;
}

export interface QuizContent {
  questions: QuizQuestion[];
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
  };
}

export interface OpenEndedGradeResult {
  score: number;
  verdict: string;
  feedback: string;
  strengths: string[];
  missingConcepts: string[];
  improvedAnswer: string;
}

export interface FlashcardItem {
  front: string;
  back: string;
  hint?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  examTip?: string;
}

export interface FlashcardsContent {
  cards: FlashcardItem[];
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
  };
}

export type StudyContentPayload = Partial<SummaryContent> &
  Partial<QuizContent> &
  Partial<FlashcardsContent> & {
    videoScript?: string;
    totalEstimatedDurationSec?: number;
    scenes?: unknown[];
    metadata?: {
      sourceMode?: 'ai' | 'fallback' | 'local';
      deepResearch?: boolean;
      summaryDepth?: SummaryDepth;
      sourceStats?: {
        sourceCount: number;
        wordCount: number;
        pagesOrSlides: number;
        sectionCount: number;
      };
    };
  };

export interface StudyMaterial {
  id: string;
  user_id?: string;
  source_type: 'own' | 'platform';
  source_note_id: string | null;
  material_type: MaterialType;
  title: string;
  course: string | null;
  content: StudyContentPayload;
  model: string | null;
  exam_profile?: Record<string, unknown> | null;
  created_at: string;
}

export interface StudyProgressRow {
  id?: string;
  user_id?: string;
  material_id: string;
  score: number;
  total_questions: number;
  attempts?: number;
  completed_at: string;
}

export interface NoteSourceOption {
  id: string;
  title: string;
  course: string | null;
  description?: string | null;
  department?: string | null;
  semester?: string | null;
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  origin: 'own' | 'platform';
}

export interface ExtractedSourceItem {
  id: string;
  name: string;
  kind: 'file' | 'pasted' | 'note';
  originNoteId?: string;
  originType?: 'own' | 'platform';
  course?: string | null;
  text: string;
  pagesOrSlides: number;
  wordCount: number;
  charCount: number;
  isScannedOcr?: boolean;
  images?: Array<{ data: string; mimeType: string; pageLabel?: string }>;
  audio?: { data: string; mimeType: string };
}

export interface ProcessedStudyBundle {
  title: string;
  course: string;
  combinedText: string;
  totalWords: number;
  totalChars: number;
  totalPagesOrSlides: number;
  sourceCount: number;
  detectedDiscipline: string;
  outlinePreview: string[];
  images: Array<{ data: string; mimeType: string; pageLabel?: string }>;
  audio?: { data: string; mimeType: string };
  sources: ExtractedSourceItem[];
  hasScannedOcr: boolean;
}

export interface StudioGenerationSettings {
  materialType: MaterialType;
  summaryDepth: SummaryDepth;
  deepResearch: boolean;
  pedagogicalStyle: PedagogicalStyle;
  questionCount: number;
  cardCount: number;
  difficulty: DifficultyLevel;
  quizFormat: QuizFormat;
  customPrompt: string;
  examFocus: string;
}
