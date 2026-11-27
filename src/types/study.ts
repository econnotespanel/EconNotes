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

export type SummaryJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SummaryStageCode =
  | 'preparing_file'
  | 'extracting_content'
  | 'detecting_headings'
  | 'chunking_document'
  | 'academic_analysis'
  | 'writing_sections'
  | 'merging_sections'
  | 'quality_check'
  | 'formatting_notes'
  | 'building_pdf';

export interface SummaryQualityCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface SummaryQualityAuditReport {
  overallScore: number;
  passed: boolean;
  headingCoveragePct: number;
  totalSourceHeadings: number;
  coveredHeadings: string[];
  missingHeadings: string[];
  weakSectionIndices: number[];
  offTopicSectionIndices?: number[];
  offTopicHeadings?: string[];
  xmlLeakCount?: number;
  unverifiedHistoricalEntities?: string[];
  repairedSectionsCount: number;
  duplicateRemovedCount: number;
  groundingScorePct: number;
  totalSummaryWords: number;
  targetMinWords: number;
  checks: SummaryQualityCheckItem[];
  auditedAt: string;
}

export interface SummaryDocumentProfile {
  fileKinds: string[];
  totalPagesOrSlides: number;
  totalWords: number;
  totalChars: number;
  density: 'low' | 'medium' | 'high' | 'very_high';
  headingsCount: number;
  subheadingsCount: number;
  formulasCount: number;
  tablesCount: number;
  figuresOrChartsCount: number;
  unreadablePages: number[];
  warnings: string[];
  disciplineFamily: 'law' | 'economics' | 'history' | 'statistics' | 'engineering' | 'medical' | 'general';
  courseName: string;
  sourceNames: string[];
}

export interface SummaryChunkCheckpoint {
  chunkIndex: number;
  totalChunks: number;
  pageStart?: number;
  pageEnd?: number;
  pageRangeLabel?: string;
  headingHints: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'repaired';
  sections: SummarySection[];
  keyPoints: string[];
  keyTerms: KeyTermItem[];
  teacherEmphasis: TeacherEmphasisItem[];
  comparativeMatrix?: ComparativeMatrix;
  memorize: string[];
  interpret: string[];
  studyChecklist: string[];
  overviewSnippet?: string;
  synthesisSnippet?: string;
  errorMessage?: string;
  attemptCount: number;
  updatedAt: string;
}

export interface SummaryJobState {
  id: string;
  userId: string;
  notebookId?: string;
  sourceFingerprint: string;
  sourceIds?: string[];
  title: string;
  course: string;
  disciplineFamily: SummaryDocumentProfile['disciplineFamily'];
  status: SummaryJobStatus;
  currentStage: number; // 1..10
  stageCode: SummaryStageCode;
  stageLabel: string;
  progressPct: number; // 0..100 (never 100 until status === 'completed')
  totalPages: number;
  processedPages: number;
  totalChunks: number;
  completedChunks: number;
  documentProfile?: SummaryDocumentProfile;
  qualityAudit?: SummaryQualityAuditReport;
  resultMaterialId?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  persistedToServer?: boolean;
}

export interface SummaryContent {
  overview: string;
  disciplineTag?: string;
  disciplineFamily?: SummaryDocumentProfile['disciplineFamily'];
  keyPoints: string[];
  sections: SummarySection[];
  teacherEmphasis?: TeacherEmphasisItem[];
  comparativeMatrix?: ComparativeMatrix;
  deepResearchTopics?: DeepResearchTopic[];
  keyTerms?: KeyTermItem[];
  studyChecklist?: string[];
  studyPriorityMap?: StudyTopicPriorityItem[];
  /** 9. Bölüm: Öğrencinin öğrendiklerini pekiştirecek bütüncül konu değerlendirmesi */
  summarySynthesis?: string;
  /** Ezberlenecek bilgiler ile yorumlanması gereken kavram/ilişkilerin ayrımı */
  memorizeVsInterpret?: {
    memorize: string[];
    interpret: string[];
  };
  extractionNotices?: string[];
  sourceCourseBreakdown?: SourceCourseBreakdownItem[];
  documentProfile?: SummaryDocumentProfile;
  qualityAudit?: SummaryQualityAuditReport;
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
    summaryDepth?: SummaryDepth;
    examMode?: ExamStudyMode;
    faculty?: string;
    isLargeBundle?: boolean;
    sourceFingerprint?: string;
    sourceIds?: string[];
    analyzedCourses?: string[];
    isMultiCourse?: boolean;
    jobId?: string;
    analyzedAt?: string;
    pdfReady?: boolean;
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
  /** Option-level explanations of why specific wrong options are incorrect (keyed by 'A'|'B'|'C'|'D' or index) */
  distractorExplanations?: Record<string, string>;
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
    sourceIds?: string[];
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

export type FlashcardCategory =
  | 'concept'
  | 'theory'
  | 'comparison'
  | 'cause_effect'
  | 'formula_model'
  | 'case_study'
  | 'applied'
  | 'analysis';

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
  cardType?: FlashcardCategory;
  examTip?: string;
}

export interface VideoScenarioChapter {
  id: string;
  title: string;
  focusNotes: string;
  diagramType: 'visual' | 'table' | 'comparison' | 'timeline' | 'curve' | 'scenario' | 'structure' | 'network';
  pageHint?: string;
}

export interface VideoScenarioPlan {
  lessonTitle: string;
  courseName: string;
  learningObjectives: string[];
  chapters: VideoScenarioChapter[];
  narrationStyle: 'academic' | 'exam_focus' | 'feynman';
  speechPace: 'calm' | 'normal' | 'brisk';
}

export interface FlashcardsContent {
  cards: FlashcardItem[];
  extractionNotices?: string[];
  metadata?: {
    sourceMode?: 'ai' | 'fallback' | 'local';
    deepResearch?: boolean;
    sourceFingerprint?: string;
    sourceIds?: string[];
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
      sourceIds?: string[];
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
  sourceIds?: string[];
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
  videoScenarioPlan?: VideoScenarioPlan;
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
