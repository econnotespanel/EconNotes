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
export type CoachMode =
  | 'reinforce'
  | 'step_by_step'
  | 'tutor'
  | 'feynman'
  | 'socratic'
  | 'deep_research'
  | 'grade_answer';

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

export type TopicPriorityLevel = 'critical' | 'important' | 'review';

export interface StudyTopicPriorityItem {
  topic: string;
  priority: TopicPriorityLevel;
  reason: string;
  estimatedMinutes: number;
  focusConcepts: string[];
  likelyQuestionType?: string;
  sectionIndex?: number;
}

export type ExamStudyMode = 'balanced' | 'cram_24h' | 'deep_mastery' | 'large_note';

export interface SourceCourseBreakdownItem {
  sourceName: string;
  course: string;
  pagesOrSlides: number;
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
  studyPriorityMap?: StudyTopicPriorityItem[];
  extractionNotices?: string[];
  sourceCourseBreakdown?: SourceCourseBreakdownItem[];
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
    summaryDepth?: SummaryDepth;
    examMode?: ExamStudyMode;
    faculty?: string;
    isLargeBundle?: boolean;
    sourceFingerprint?: string;
    analyzedCourses?: string[];
    isMultiCourse?: boolean;
    sourceStats?: {
      sourceCount: number;
      wordCount: number;
      pagesOrSlides: number;
      sectionCount: number;
    };
  };
}

export interface QuizQuestion {
  id?: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: string[];
  correctIndex?: number;
  sampleAnswer?: string;
  rubric?: string[];
  explanation?: string;
  topic?: string;
  sourceSection?: string;
  sourcePage?: string;
  conceptKey?: string;
  sourceFingerprint?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  bloomLevel?: string;
}

export interface QuizQualityReport {
  validatedCount: number;
  rejectedCount: number;
  regeneratedCount: number;
  historyExcludedCount: number;
  difficultyBreakdown: {
    easy: number;
    medium: number;
    hard: number;
  };
  topicCoverageCount: number;
}

export interface QuizContent {
  questions: QuizQuestion[];
  extractionNotices?: string[];
  qualityReport?: QuizQualityReport;
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
    sourceFingerprint?: string;
    analyzedCourses?: string[];
    isMultiCourse?: boolean;
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
  id?: string;
  front: string;
  back: string;
  hint?: string;
  topic?: string;
  sourceSection?: string;
  sourcePage?: string;
  conceptKey?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  examTip?: string;
}

export interface FlashcardsContent {
  cards: FlashcardItem[];
  extractionNotices?: string[];
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
    sourceFingerprint?: string;
    analyzedCourses?: string[];
    isMultiCourse?: boolean;
  };
}

export type StudyContentPayload = Partial<SummaryContent> &
  Partial<QuizContent> &
  Partial<FlashcardsContent> & {
    videoTitle?: string;
    outline?: string;
    videoScript?: string;
    totalEstimatedDurationSec?: number;
    scenes?: unknown[];
    keyFacts?: string[];
    matchingPairs?: unknown[];
    examQuestions?: unknown[];
    extractionNotices?: string[];
    metadata?: {
      sourceMode?: 'ai' | 'fallback' | 'local';
      deepResearch?: boolean;
      summaryDepth?: SummaryDepth;
      examMode?: ExamStudyMode;
      faculty?: string;
      isLargeBundle?: boolean;
      sourceFingerprint?: string;
      analyzedCourses?: string[];
      isMultiCourse?: boolean;
      qualityVerified?: boolean;
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

export type CourseDetectionConfidence = 'high' | 'medium' | 'uncertain';

export interface ExtractedSourceItem {
  id: string;
  name: string;
  kind: 'file' | 'pasted' | 'note';
  originNoteId?: string;
  originType?: 'own' | 'platform';
  course?: string | null;
  detectedCourse?: string | null;
  detectedDiscipline?: string | null;
  courseConfidence?: CourseDetectionConfidence;
  courseConfirmedByUser?: boolean;
  courseNeedsConfirmation?: boolean;
  courseCandidates?: string[];
  courseEvidence?: string[];
  text: string;
  pagesOrSlides: number;
  totalPagesInFile?: number;
  unreadablePages?: number[];
  extractionWarnings?: string[];
  wordCount: number;
  charCount: number;
  isScannedOcr?: boolean;
  images?: Array<{ data: string; mimeType: string; pageLabel?: string }>;
  audio?: { data: string; mimeType: string };
}

export interface ProcessedStudyBundle {
  title: string;
  course: string;
  detectedCourse?: string | null;
  courseConfidence?: CourseDetectionConfidence;
  sourceCourses?: string[];
  isMultiCourse?: boolean;
  extractionWarnings?: string[];
  canonicalAnalysisDigest?: string;
  sourceFingerprint?: string;
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
  faculty?: string;
  examMode?: ExamStudyMode;
  userId?: string;
  generationNonce?: string;
  previousQuestions?: QuizQuestion[];
  previousFlashcards?: FlashcardItem[];
}

export interface NotebookAttachmentImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  base64: string;
}

export interface PinnedStudyNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  sourceTag?: string;
}

export interface NotebookCitationHit {
  docId: string;
  docTitle: string;
  sectionHeading: string;
  excerpt: string;
  score: number;
}

export interface NotebookChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  mode?: CoachMode;
  meta?: string;
  citations?: NotebookCitationHit[];
  suggestedTopics?: string[];
  attachmentNames?: string[];
  attachmentPreviews?: string[];
}

export interface StudioNotebook {
  id: string;
  title: string;
  course: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  sources: ExtractedSourceItem[];
  checkedSourceIds: string[];
  checkedMaterialIds: string[];
  materialIds: string[];
  pinnedNotes: PinnedStudyNote[];
  messages: NotebookChatMessage[];
}
