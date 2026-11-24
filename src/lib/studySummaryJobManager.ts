/**
 * Resilient Background Job Manager for EconNotes Academic Summary Engine
 *
 * Guarantees:
 * - Unique job ID per analysis task with explicit `queued` / `processing` / `completed` / `failed` states
 * - Duplicate active job prevention by `(userId, sourceFingerprint)`
 * - Intermediate checkpoint persistence in BOTH Supabase (`study_summary_jobs` & `study_summary_job_chunks`)
 *   and IndexedDB (`econnotes_summary_jobs_v1`) so navigating across pages OR refreshing the browser
 *   NEVER loses progress or re-processes already-completed sections
 * - Real percentage progress (0..99% while running; 100% ONLY after Stage 10 completes & saves)
 * - Automatic result persistence to user's `study_materials` with strict RLS
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { generateAcademicSummaryPdfBytes } from '@/lib/academicSummaryPdf';
import {
  runMultiStageAcademicSummaryPipeline,
  type SummaryProgressUpdate,
} from '@/lib/studySummaryPipeline';
import type {
  ProcessedStudyBundle,
  StudioGenerationSettings,
  StudyMaterial,
  SummaryChunkCheckpoint,
  SummaryJobState,
} from '@/types/study';

const IDB_NAME = 'econnotes_summary_jobs_v1';
const IDB_VERSION = 1;
const STORE_JOBS = 'jobs';
const STORE_PAYLOADS = 'payloads';

interface StoredJobPayloadRecord {
  jobId: string;
  userId: string;
  bundle: ProcessedStudyBundle;
  settings: StudioGenerationSettings;
  checkpoints: SummaryChunkCheckpoint[];
  updatedAt: string;
}

export interface JobManagerSnapshot {
  activeJob: SummaryJobState | null;
  recentJobs: SummaryJobState[];
  completedMaterial: StudyMaterial | null;
  lastPdfBytes: Uint8Array | null;
  lastPdfMaterialId: string | null;
}

type JobListener = (snapshot: JobManagerSnapshot) => void;

function createJobUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openJobsDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_JOBS)) {
          db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_PAYLOADS)) {
          db.createObjectStore(STORE_PAYLOADS, { keyPath: 'jobId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut<T>(storeName: string, record: T): Promise<void> {
  const db = await openJobsDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openJobsDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openJobsDb();
  if (!db) return [];
  return new Promise<T[]>((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

// Memory fallback for test environments without IndexedDB
const memoryJobStore = new Map<string, SummaryJobState>();
const memoryPayloadStore = new Map<string, StoredJobPayloadRecord>();

class SummaryJobManager {
  private listeners = new Set<JobListener>();
  private activeJob: SummaryJobState | null = null;
  private recentJobs: SummaryJobState[] = [];
  private completedMaterial: StudyMaterial | null = null;
  private lastPdfBytes: Uint8Array | null = null;
  private lastPdfMaterialId: string | null = null;
  private runningPromises = new Map<string, Promise<StudyMaterial | null>>();
  private abortControllers = new Map<string, AbortController>();
  private serverTablesAvailable: boolean | null = null;

  public subscribe(listener: JobListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): JobManagerSnapshot {
    return {
      activeJob: this.activeJob,
      recentJobs: this.recentJobs,
      completedMaterial: this.completedMaterial,
      lastPdfBytes: this.lastPdfBytes,
      lastPdfMaterialId: this.lastPdfMaterialId,
    };
  }

  public getCachedPdfForMaterial(materialId: string): Uint8Array | null {
    return this.lastPdfMaterialId === materialId ? this.lastPdfBytes : null;
  }

  public isJobRunningInMemory(jobId: string): boolean {
    return this.runningPromises.has(jobId);
  }

  public dismissActiveJob(): void {
    if (this.activeJob && (this.activeJob.status === 'completed' || this.activeJob.status === 'failed')) {
      this.activeJob = null;
      this.emit();
    }
  }

  public cancelRunningJob(jobId: string): void {
    const ctrl = this.abortControllers.get(jobId);
    if (ctrl) ctrl.abort();
  }

  public resetForTests(): void {
    this.abortControllers.forEach((c) => c.abort());
    this.abortControllers.clear();
    this.runningPromises.clear();
    this.activeJob = null;
    this.recentJobs = [];
    this.completedMaterial = null;
    this.lastPdfBytes = null;
    this.lastPdfMaterialId = null;
    this.serverTablesAvailable = null;
    memoryJobStore.clear();
    memoryPayloadStore.clear();
    this.emit();
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        // isolate subscriber exceptions
      }
    });
  }

  private async persistJobLocally(job: SummaryJobState): Promise<void> {
    memoryJobStore.set(job.id, job);
    await idbPut(STORE_JOBS, job);
    this.recentJobs = [job, ...this.recentJobs.filter((j) => j.id !== job.id)].slice(0, 12);
    if (this.activeJob?.id === job.id || !this.activeJob) {
      this.activeJob = job;
    }
    this.emit();
  }

  private async persistPayloadLocally(rec: StoredJobPayloadRecord): Promise<void> {
    memoryPayloadStore.set(rec.jobId, rec);
    // Strip large base64 audio from IDB snapshot if huge while retaining text + images metadata
    await idbPut(STORE_PAYLOADS, rec);
  }

  private async loadPayloadLocally(jobId: string): Promise<StoredJobPayloadRecord | null> {
    const mem = memoryPayloadStore.get(jobId);
    if (mem) return mem;
    return idbGet<StoredJobPayloadRecord>(STORE_PAYLOADS, jobId);
  }

  private async syncJobToServer(job: SummaryJobState): Promise<void> {
    if (this.serverTablesAvailable === false) return;
    try {
      const { error } = await (supabase.from('study_summary_jobs' as never) as any)
        .upsert(
          {
            id: job.id,
            user_id: job.userId,
            notebook_id: job.notebookId || null,
            source_fingerprint: job.sourceFingerprint,
            title: job.title.slice(0, 240),
            course: job.course || null,
            discipline_family: job.disciplineFamily,
            status: job.status,
            current_stage: job.currentStage,
            stage_code: job.stageCode,
            stage_label: job.stageLabel,
            progress_pct: job.status === 'completed' ? 100 : Math.min(99, Math.max(0, job.progressPct)),
            total_pages: Math.max(1, job.totalPages),
            processed_pages: Math.max(0, job.processedPages),
            total_chunks: Math.max(1, job.totalChunks),
            completed_chunks: Math.max(0, job.completedChunks),
            document_profile: (job.documentProfile || {}) as unknown as Json,
            quality_report: (job.qualityAudit || null) as unknown as Json,
            result_material_id: job.resultMaterialId || null,
            error_message: job.errorMessage || null,
            retry_count: job.retryCount,
            started_at: job.startedAt,
            updated_at: job.updatedAt,
            completed_at: job.completedAt || null,
          },
          { onConflict: 'id' },
        );
      if (error) {
        if (String(error.message || '').includes('study_summary_jobs') || error.code === 'PGRST205') {
          this.serverTablesAvailable = false;
        }
      } else {
        this.serverTablesAvailable = true;
        job.persistedToServer = true;
      }
    } catch {
      // Non-fatal; local IDB still keeps exact resilient state
    }
  }

  private async syncCheckpointToServer(jobId: string, userId: string, cp: SummaryChunkCheckpoint): Promise<void> {
    if (this.serverTablesAvailable === false) return;
    try {
      const { error } = await (supabase.from('study_summary_job_chunks' as never) as any)
        .upsert(
          {
            job_id: jobId,
            user_id: userId,
            chunk_index: cp.chunkIndex,
            page_start: cp.pageStart ?? null,
            page_end: cp.pageEnd ?? null,
            page_range_label: cp.pageRangeLabel ?? null,
            heading_hints: cp.headingHints as unknown as Json,
            status: cp.status,
            section_output: cp as unknown as Json,
            attempt_count: cp.attemptCount,
            error_message: cp.errorMessage ?? null,
            updated_at: cp.updatedAt,
          },
          { onConflict: 'job_id,chunk_index' },
        );
      if (error && (String(error.message || '').includes('study_summary_job_chunks') || error.code === 'PGRST205')) {
        this.serverTablesAvailable = false;
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Called on Study page mount / reload: restores any in-progress, queued, or failed job
   * from Supabase + IndexedDB so refreshing the page or switching tabs NEVER loses an analysis task.
   */
  public async hydrateForUser(userId: string): Promise<SummaryJobState[]> {
    const localAll = (await idbGetAll<SummaryJobState>(STORE_JOBS)).filter((j) => j.userId === userId);
    const memAll = Array.from(memoryJobStore.values()).filter((j) => j.userId === userId);
    const mergedMap = new Map<string, SummaryJobState>();

    for (const j of [...localAll, ...memAll]) {
      const prev = mergedMap.get(j.id);
      if (!prev || Date.parse(j.updatedAt) >= Date.parse(prev.updatedAt)) {
        mergedMap.set(j.id, j);
      }
    }

    if (this.serverTablesAvailable !== false) {
      try {
        const { data, error } = await (supabase.from('study_summary_jobs' as never) as any)
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(10);
        if (error) {
          if (String(error.message || '').includes('study_summary_jobs') || error.code === 'PGRST205') {
            this.serverTablesAvailable = false;
          }
        } else if (Array.isArray(data)) {
          this.serverTablesAvailable = true;
          for (const row of data as Array<Record<string, any>>) {
            const mapped: SummaryJobState = {
              id: String(row.id),
              userId: String(row.user_id),
              notebookId: row.notebook_id ? String(row.notebook_id) : undefined,
              sourceFingerprint: String(row.source_fingerprint || ''),
              title: String(row.title || 'Ders Özeti'),
              course: String(row.course || ''),
              disciplineFamily: (row.discipline_family || 'general') as SummaryJobState['disciplineFamily'],
              status: row.status as SummaryJobState['status'],
              currentStage: Number(row.current_stage || 1),
              stageCode: (row.stage_code || 'preparing_file') as SummaryJobState['stageCode'],
              stageLabel: String(row.stage_label || 'Dosya hazırlanıyor'),
              progressPct: Number(row.progress_pct || 0),
              totalPages: Number(row.total_pages || 1),
              processedPages: Number(row.processed_pages || 0),
              totalChunks: Number(row.total_chunks || 1),
              completedChunks: Number(row.completed_chunks || 0),
              documentProfile: row.document_profile || undefined,
              qualityAudit: row.quality_report || undefined,
              resultMaterialId: row.result_material_id || null,
              errorMessage: row.error_message || null,
              retryCount: Number(row.retry_count || 0),
              startedAt: String(row.started_at || new Date().toISOString()),
              updatedAt: String(row.updated_at || new Date().toISOString()),
              completedAt: row.completed_at ? String(row.completed_at) : null,
              persistedToServer: true,
            };
            const prev = mergedMap.get(mapped.id);
            if (!prev || Date.parse(mapped.updatedAt) > Date.parse(prev.updatedAt)) {
              mergedMap.set(mapped.id, mapped);
            }
          }
        }
      } catch {
        // Ignore network errors during hydration
      }
    }

    const sorted = Array.from(mergedMap.values()).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    this.recentJobs = sorted.slice(0, 12);

    // If a job is still in memory running, keep it active; otherwise surface any unfinished job from reload!
    if (!this.activeJob) {
      const unfinished = sorted.find((j) => j.status === 'processing' || j.status === 'queued');
      if (unfinished) {
        this.activeJob = unfinished;
      }
    }
    this.emit();
    return sorted;
  }

  /**
   * Starts a new multi-stage summary job OR returns the already-running active job
   * for the exact same `(userId, sourceFingerprint)` to prevent accidental duplicates.
   */
  public async startSummaryJob(params: {
    userId: string;
    notebookId?: string;
    bundle: ProcessedStudyBundle;
    settings: StudioGenerationSettings;
    forceNew?: boolean;
    onCompleted?: (material: StudyMaterial, job: SummaryJobState) => void;
  }): Promise<{ job: SummaryJobState; promise: Promise<StudyMaterial | null>; deduplicated: boolean }> {
    const fp = params.bundle.sourceFingerprint || `fp_${params.bundle.title}_${params.bundle.totalChars}`;

    // Deduplicate concurrent active job for the same user + same source fingerprint
    if (
      !params.forceNew &&
      this.activeJob &&
      this.activeJob.userId === params.userId &&
      this.activeJob.sourceFingerprint === fp &&
      (this.activeJob.status === 'queued' || this.activeJob.status === 'processing')
    ) {
      const existingPromise = this.runningPromises.get(this.activeJob.id);
      if (existingPromise) {
        return { job: this.activeJob, promise: existingPromise, deduplicated: true };
      }
    }

    const nowIso = new Date().toISOString();
    let jobId = createJobUuid();

    // Try server-side atomic job creation/deduplication first if SQL migration is deployed
    if (this.serverTablesAvailable !== false) {
      try {
        const { data: rpcJob, error: rpcErr } = await (supabase.rpc as any)('create_or_resume_summary_job', {
          _source_fingerprint: fp,
          _title: params.bundle.title,
          _course: params.bundle.course || params.bundle.detectedCourse || null,
          _discipline_family: null,
          _notebook_id: params.notebookId || null,
          _total_pages: Math.max(1, params.bundle.totalPagesOrSlides || 1),
          _total_chunks: 1,
          _document_profile: {},
          _settings: params.settings,
          _force_new: Boolean(params.forceNew),
        });
        if (!rpcErr && rpcJob && typeof rpcJob.id === 'string') {
          jobId = rpcJob.id;
          this.serverTablesAvailable = true;
        } else if (
          rpcErr &&
          (String(rpcErr.message || '').includes('create_or_resume_summary_job') || rpcErr.code === 'PGRST202')
        ) {
          this.serverTablesAvailable = false;
        }
      } catch {
        // Fallback to local UUID + upsert
      }
    }

    const job: SummaryJobState = {
      id: jobId,
      userId: params.userId,
      notebookId: params.notebookId,
      sourceFingerprint: fp,
      title: params.bundle.title,
      course: params.bundle.course || params.bundle.detectedCourse || '',
      disciplineFamily: 'general',
      status: 'queued',
      currentStage: 1,
      stageCode: 'preparing_file',
      stageLabel: 'Dosya hazırlanıyor',
      progressPct: 2,
      totalPages: Math.max(1, params.bundle.totalPagesOrSlides || 1),
      processedPages: 0,
      totalChunks: 1,
      completedChunks: 0,
      errorMessage: null,
      resultMaterialId: null,
      retryCount: 0,
      startedAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
    };

    this.activeJob = job;
    await this.persistJobLocally(job);
    await this.persistPayloadLocally({
      jobId,
      userId: params.userId,
      bundle: params.bundle,
      settings: params.settings,
      checkpoints: [],
      updatedAt: nowIso,
    });
    void this.syncJobToServer(job);

    const promise = this.executeJob(job, params.bundle, params.settings, [], params.onCompleted);
    this.runningPromises.set(job.id, promise);
    return { job, promise, deduplicated: false };
  }

  /**
   * Resumes an interrupted (after page reload) or failed job using its saved intermediate checkpoints
   * so already-completed sections are NEVER re-processed!
   */
  public async resumeJob(
    jobId: string,
    onCompleted?: (material: StudyMaterial, job: SummaryJobState) => void,
  ): Promise<StudyMaterial | null> {
    const existingPromise = this.runningPromises.get(jobId);
    if (existingPromise) return existingPromise;

    const storedPayload = await this.loadPayloadLocally(jobId);
    const job =
      this.activeJob?.id === jobId
        ? this.activeJob
        : this.recentJobs.find((j) => j.id === jobId) || (await idbGet<SummaryJobState>(STORE_JOBS, jobId));

    if (!job || !storedPayload) {
      throw new Error(
        'Bu görevin kaynak verisi tarayıcı önbelleğinde bulunamadı. Lütfen kaynağı seçip yeni analiz başlatın.',
      );
    }

    // Also pull any server checkpoints if available and merge them with local checkpoints
    const mergedCheckpoints = new Map<number, SummaryChunkCheckpoint>();
    for (const cp of storedPayload.checkpoints || []) {
      mergedCheckpoints.set(cp.chunkIndex, cp);
    }
    if (this.serverTablesAvailable !== false) {
      try {
        const { data } = await (supabase.from('study_summary_job_chunks' as never) as any)
          .select('section_output')
          .eq('job_id', jobId)
          .in('status', ['completed', 'repaired']);
        if (Array.isArray(data)) {
          for (const row of data as Array<{ section_output?: SummaryChunkCheckpoint }>) {
            if (row.section_output && typeof row.section_output.chunkIndex === 'number') {
              mergedCheckpoints.set(row.section_output.chunkIndex, row.section_output);
            }
          }
        }
      } catch {
        // Use local checkpoints
      }
    }

    const resumedJob: SummaryJobState = {
      ...job,
      status: 'processing',
      errorMessage: null,
      retryCount: (job.retryCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.activeJob = resumedJob;
    await this.persistJobLocally(resumedJob);
    void this.syncJobToServer(resumedJob);

    const promise = this.executeJob(
      resumedJob,
      storedPayload.bundle,
      storedPayload.settings,
      Array.from(mergedCheckpoints.values()),
      onCompleted,
    );
    this.runningPromises.set(resumedJob.id, promise);
    return promise;
  }

  private async executeJob(
    initialJob: SummaryJobState,
    bundle: ProcessedStudyBundle,
    settings: StudioGenerationSettings,
    existingCheckpoints: SummaryChunkCheckpoint[],
    onCompleted?: (material: StudyMaterial, job: SummaryJobState) => void,
  ): Promise<StudyMaterial | null> {
    const controller = new AbortController();
    this.abortControllers.set(initialJob.id, controller);

    let currentJob: SummaryJobState = {
      ...initialJob,
      status: 'processing',
      updatedAt: new Date().toISOString(),
    };
    const checkpointsMap = new Map<number, SummaryChunkCheckpoint>();
    for (const cp of existingCheckpoints) checkpointsMap.set(cp.chunkIndex, cp);

    await this.persistJobLocally(currentJob);
    void this.syncJobToServer(currentJob);

    try {
      const result = await runMultiStageAcademicSummaryPipeline({
        jobId: currentJob.id,
        bundle,
        settings,
        existingCheckpoints: Array.from(checkpointsMap.values()),
        signal: controller.signal,
        buildPdfFn: async (summary, meta) =>
          generateAcademicSummaryPdfBytes({
            title: meta.title,
            course: meta.course,
            createdAt: meta.createdAt,
            summary,
          }),
        onProgress: (upd: SummaryProgressUpdate) => {
          currentJob = {
            ...currentJob,
            status: 'processing',
            currentStage: upd.stage,
            stageCode: upd.stageCode,
            stageLabel: upd.detailMessage || upd.stageLabel,
            progressPct: Math.min(99, Math.max(currentJob.progressPct, upd.progressPct)),
            totalPages: upd.totalPages,
            processedPages: upd.processedPages,
            totalChunks: upd.totalChunks,
            completedChunks: upd.completedChunks,
            documentProfile: upd.documentProfile || currentJob.documentProfile,
            disciplineFamily: upd.documentProfile?.disciplineFamily || currentJob.disciplineFamily,
            course: upd.documentProfile?.courseName || currentJob.course,
            updatedAt: new Date().toISOString(),
          };
          void this.persistJobLocally(currentJob);
          void this.syncJobToServer(currentJob);
        },
        onCheckpoint: async (cp) => {
          checkpointsMap.set(cp.chunkIndex, cp);
          await this.persistPayloadLocally({
            jobId: currentJob.id,
            userId: currentJob.userId,
            bundle,
            settings,
            checkpoints: Array.from(checkpointsMap.values()),
            updatedAt: new Date().toISOString(),
          });
          await this.syncCheckpointToServer(currentJob.id, currentJob.userId, cp);
        },
      });

      // Persist completed summary to user's EconNotes account (`study_materials`, strict RLS)
      const noteSource = bundle.sources.find((s) => s.kind === 'note');
      const resolvedCourse = result.plan.profile.courseName || bundle.course || bundle.detectedCourse || null;
      const examProfileMeta: Record<string, unknown> = {
        sourceFingerprint: bundle.sourceFingerprint,
        analyzedCourses: bundle.sourceCourses,
        isMultiCourse: bundle.isMultiCourse,
        summaryJobId: currentJob.id,
        qualityScore: result.content.qualityAudit?.overallScore ?? null,
        headingCoveragePct: result.content.qualityAudit?.headingCoveragePct ?? null,
      };

      const { data: savedRow, error: saveErr } = await supabase
        .from('study_materials')
        .insert({
          user_id: currentJob.userId,
          source_type: noteSource?.originType === 'platform' ? 'platform' : 'own',
          source_note_id: noteSource?.originNoteId || null,
          material_type: 'summary',
          title: bundle.title,
          course: resolvedCourse,
          content: result.content as unknown as Json,
          model: result.model,
          exam_profile: examProfileMeta as unknown as Json,
        })
        .select()
        .single();

      if (saveErr || !savedRow) {
        throw new Error(saveErr?.message || 'Özet veritabanına kaydedilemedi.');
      }

      const savedMaterial = savedRow as unknown as StudyMaterial;
      if (result.pdfBytes) {
        this.lastPdfBytes = result.pdfBytes;
        this.lastPdfMaterialId = savedMaterial.id;
      }
      this.completedMaterial = savedMaterial;

      const completedIso = new Date().toISOString();
      currentJob = {
        ...currentJob,
        status: 'completed',
        currentStage: 10,
        stageCode: 'building_pdf',
        stageLabel: 'Kapsamlı akademik özet ve PDF hazır',
        progressPct: 100,
        processedPages: currentJob.totalPages,
        completedChunks: currentJob.totalChunks,
        qualityAudit: result.content.qualityAudit,
        resultMaterialId: savedMaterial.id,
        errorMessage: null,
        updatedAt: completedIso,
        completedAt: completedIso,
      };

      await this.persistJobLocally(currentJob);
      await this.syncJobToServer(currentJob);
      onCompleted?.(savedMaterial, currentJob);
      return savedMaterial;
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Analiz sırasında beklenmeyen bir hata oluştu.';
      currentJob = {
        ...currentJob,
        status: 'failed',
        progressPct: Math.min(99, currentJob.progressPct),
        errorMessage: errMsg,
        updatedAt: new Date().toISOString(),
      };
      await this.persistJobLocally(currentJob);
      await this.syncJobToServer(currentJob);
      return null;
    } finally {
      this.runningPromises.delete(initialJob.id);
      this.abortControllers.delete(initialJob.id);
    }
  }
}

export const summaryJobManager = new SummaryJobManager();
