import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Archive,
  Check,
  Ban,
  Clock,
  FileText,
  AlertTriangle,
  Building,
  GraduationCap,
  Calendar,
  User,
  Lock,
  Eye,
  Download,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatEngagementNumber } from '@/lib/noteEngagement';
import {
  formatFileSizeLabel,
  resolveAdminNotePreviewFile,
  type AdminNotePreviewResolution,
} from '@/lib/adminNotePreview';
import {
  getCleanRevisionNotes,
  getNoteRevisionDeadline,
  isRevisionExpired,
} from '@/lib/revisionUtils';
import AdminDocumentViewer from '@/components/admin/AdminDocumentViewer';

interface AdminNotePreviewDialogProps {
  note: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: string) => Promise<void>;
  onRequestRevision: (id: string, reason: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onRestore?: (id: string) => Promise<void>;
  initialOpenRevision?: boolean;
  notePassword?: string;
  onRevealPassword?: (id: string) => Promise<void>;
  engagement?: { views: number; downloads: number };
}

export const AdminNotePreviewDialog: React.FC<AdminNotePreviewDialogProps> = ({
  note,
  open,
  onOpenChange,
  onApprove,
  onRequestRevision,
  onReject,
  onArchive,
  onRestore,
  initialOpenRevision = false,
  notePassword,
  onRevealPassword,
  engagement,
}) => {
  const [resolution, setResolution] = useState<AdminNotePreviewResolution | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const resolutionRef = useRef<AdminNotePreviewResolution | null>(null);

  useEffect(() => {
    if (!note || !open) {
      resolutionRef.current?.dispose();
      resolutionRef.current = null;
      setResolution(null);
      setLoadingFile(false);
      setShowRevisionForm(false);
      setRevisionReason('');
      return;
    }

    if (initialOpenRevision) {
      const missingUni = !note.university || !String(note.university).trim();
      const missingDept = !note.department || !String(note.department).trim();
      let suggested = '';
      if (missingUni && missingDept) {
        suggested =
          'Notun üniversite ve bölüm bilgisi eksik. Lütfen hangi üniversite ve bölüme ait olduğunu düzenleyin.';
      } else if (missingUni) {
        suggested = 'Notun üniversite bilgisi eksik. Lütfen üniversitenizi belirtin.';
      } else if (missingDept) {
        suggested = 'Notun bölüm bilgisi eksik. Lütfen bölümünüzü belirtin.';
      }
      setRevisionReason(suggested);
      setShowRevisionForm(true);
    } else {
      setShowRevisionForm(false);
      setRevisionReason('');
    }
  }, [note?.id, open, initialOpenRevision]);

  useEffect(() => {
    if (!note || !open) return;

    let cancelled = false;
    setLoadingFile(true);
    resolutionRef.current?.dispose();
    resolutionRef.current = null;
    setResolution(null);

    resolveAdminNotePreviewFile(note)
      .then((res) => {
        if (cancelled) {
          res.dispose();
          return;
        }
        resolutionRef.current = res;
        setResolution(res);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Admin note preview resolution error:', err);
        setResolution({
          ok: false,
          fileKind: 'unsupported',
          signedUrl: null,
          blobUrl: null,
          arrayBuffer: null,
          fileName: note.file_name || 'Belge',
          fileType: note.file_type || null,
          fileSize: null,
          resolvedPath: null,
          source: 'none',
          freshNote: note,
          error:
            err instanceof Error
              ? `Dosya yüklenirken beklenmeyen bir hata oluştu: ${err.message}`
              : 'Dosya yüklenirken beklenmeyen bir hata oluştu.',
          errorCode: 'UNEXPECTED_ERROR',
          dispose: () => {},
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [note?.id, note?.file_url, open, retryNonce]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      resolutionRef.current?.dispose();
      resolutionRef.current = null;
    };
  }, []);

  if (!note) return null;

  const displayNote = resolution?.freshNote ? { ...note, ...resolution.freshNote } : note;
  const isMissingUniversity = !displayNote.university || !String(displayNote.university).trim();
  const isMissingDepartment = !displayNote.department || !String(displayNote.department).trim();
  const revisionDeadline = getNoteRevisionDeadline(displayNote);
  const revisionExpired =
    displayNote.status === 'revision_requested' && isRevisionExpired(revisionDeadline);
  const displayFileName = resolution?.fileName || displayNote.file_name || 'Dosya';
  const displayFileSize = formatFileSizeLabel(resolution?.fileSize);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(displayNote.id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendRevision = async () => {
    const cleanReason = revisionReason.trim();
    if (!cleanReason) {
      toast.error('Lütfen kullanıcıya iletilecek eksik bilgileri veya düzeltme sebebini yazın.');
      return;
    }
    setSubmitting(true);
    try {
      await onRequestRevision(displayNote.id, cleanReason);
      setShowRevisionForm(false);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!onArchive) return;
    setSubmitting(true);
    try {
      await onArchive(displayNote.id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!onRestore) return;
    setSubmitting(true);
    try {
      await onRestore(displayNote.id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await onReject(displayNote.id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-5xl flex-col overflow-hidden rounded-2xl border-border bg-card p-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 p-4 pb-3 sm:p-5 sm:pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <DialogTitle className="max-w-xl truncate text-base font-bold sm:text-lg">
                  {displayNote.title}
                </DialogTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                {displayNote.course} • {displayNote.semester} • {displayNote.grade}. Sınıf
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {displayNote.status === 'pending' && (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Clock className="mr-1 h-3 w-3" /> Onay Bekliyor
                </Badge>
              )}
              {displayNote.status === 'revision_requested' && (
                <Badge
                  variant="outline"
                  className={
                    revisionExpired
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                  }
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  {revisionExpired ? '72 Saatlik Süre Doldu (İncelemeye Açık)' : 'Düzeltme Bekleniyor (72 Saat)'}
                </Badge>
              )}
              {displayNote.status === 'approved' && (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Check className="mr-1 h-3 w-3" /> Onaylı
                </Badge>
              )}
              {displayNote.status === 'archived' && (
                <Badge variant="outline" className="border-border bg-muted/60 text-muted-foreground">
                  <Archive className="mr-1 h-3 w-3" /> Arşivde
                </Badge>
              )}
              {displayNote.status === 'rejected' && (
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                  Reddedildi
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body (scrollable) */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* Expired 72h revision context banner (never blocks preview!) */}
          {displayNote.status === 'revision_requested' && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-cyan-700 dark:text-cyan-300">
                  İstenen Düzeltme:{' '}
                  <span className="font-medium text-foreground">{getCleanRevisionNotes(displayNote)}</span>
                </span>
                {revisionDeadline && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Son Tarih: {new Date(revisionDeadline).toLocaleString('tr-TR')}
                    {revisionExpired ? ' (Süresi Doldu)' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Real Document Previewer (PDF, PowerPoint, Word, Images, Text, Safe Download) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Eye className="h-3.5 w-3.5 text-primary" />
                Belge İçeriği Önizleme
              </span>
              {resolution?.ok && (
                <span className="text-[11px] text-muted-foreground">
                  {displayFileName}
                  {displayFileSize ? ` • ${displayFileSize}` : ''}
                </span>
              )}
            </div>

            <AdminDocumentViewer
              noteTitle={displayNote.title}
              resolution={resolution}
              loading={loadingFile}
              onRetry={() => setRetryNonce((n) => n + 1)}
            />
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2 md:grid-cols-3">
            {/* Üniversite */}
            <div
              className={`rounded-xl border p-2.5 ${
                isMissingUniversity
                  ? 'border-destructive/50 bg-destructive/10'
                  : 'border-border/60 bg-muted/20'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <Building className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Üniversite</span>
              </div>
              {isMissingUniversity ? (
                <span className="flex items-center gap-1 font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Belirtilmemiş!
                </span>
              ) : (
                <span className="font-medium text-foreground">{displayNote.university}</span>
              )}
            </div>

            {/* Bölüm */}
            <div
              className={`rounded-xl border p-2.5 ${
                isMissingDepartment
                  ? 'border-destructive/50 bg-destructive/10'
                  : 'border-border/60 bg-muted/20'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Bölüm</span>
              </div>
              {isMissingDepartment ? (
                <span className="flex items-center gap-1 font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Belirtilmemiş!
                </span>
              ) : (
                <span className="font-medium text-foreground">{displayNote.department}</span>
              )}
            </div>

            {/* Yükleyen */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Yükleyen</span>
              </div>
              <span className="font-medium text-foreground">{displayNote.uploader_name || 'Bilinmiyor'}</span>
            </div>

            {/* Tarih */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Yükleme Tarihi</span>
              </div>
              <span className="font-medium text-foreground">
                {displayNote.created_at ? new Date(displayNote.created_at).toLocaleString('tr-TR') : '—'}
              </span>
            </div>

            {/* Dosya Bilgisi */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Dosya Adı & Türü</span>
              </div>
              <span className="block truncate font-medium text-foreground" title={displayFileName}>
                {displayFileName}
                {displayFileSize ? ` • ${displayFileSize}` : ''}
                {resolution?.fileType || displayNote.file_type
                  ? ` (${resolution?.fileType || displayNote.file_type})`
                  : ''}
              </span>
            </div>

            {/* Şifre */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <Lock className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Not Kilidi / Şifre</span>
              </div>
              {displayNote.has_password ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-amber-500">
                    {notePassword ? `Şifre: ${notePassword}` : 'Korumalı'}
                  </span>
                  {!notePassword && onRevealPassword && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRevealPassword(displayNote.id)}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      <Eye className="mr-0.5 h-3 w-3" /> Göster
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Şifresiz</span>
              )}
            </div>
          </div>

          {/* Görüntülenme & İndirme İstatistikleri */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[0.06] p-2.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Toplam Görüntülenme</span>
              </div>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatEngagementNumber(engagement?.views ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-2.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                <span className="font-semibold">Toplam İndirme</span>
              </div>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatEngagementNumber(engagement?.downloads ?? 0)}
              </span>
            </div>
          </div>

          {/* Açıklama */}
          {displayNote.description && (
            <div className="rounded-xl border border-border/60 bg-muted/15 p-3 text-xs">
              <span className="mb-1 block font-semibold text-muted-foreground">Açıklama:</span>
              <p className="whitespace-pre-wrap text-foreground">{displayNote.description}</p>
            </div>
          )}

          {/* Revision Form Section */}
          {showRevisionForm && (
            <div className="animate-fade-in space-y-3 rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5" />
                <h4 className="text-sm font-bold">Kullanıcıya Düzenleme / Revizyon Gönder (72 Saat Süre)</h4>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Bu notu reddetmek yerine kullanıcıya geri gönderirsiniz. Kullanıcıya <strong>72 saat süre</strong> tanınır.
                Kullanıcı bu süre içinde not bilgilerini düzelttiğinde not yeniden onay aşamasına geçer. 72 saat içinde düzenleme yapılmazsa not yönetici arşivine kaldırılabilir.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="revisionReason" className="text-xs font-semibold text-foreground">
                  Eksik Bilgi & Düzeltme Talebi Mesajınız <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="revisionReason"
                  placeholder="Örn: Dersin adı veya üniversite/bölüm bilgisi eksik girilmiş. Lütfen tam üniversite ve bölümünüzü belirterek notunuzu güncelleyin."
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  className="min-h-[80px] rounded-xl border-border/80 bg-background text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRevisionForm(false)}
                  className="h-8 rounded-xl px-3 text-xs"
                >
                  Vazgeç
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendRevision}
                  disabled={submitting || !revisionReason.trim()}
                  className="h-8 gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-slate-950 hover:bg-amber-600"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>{submitting ? 'Gönderiliyor…' : '72 Saat Süreyle Revizyona Gönder'}</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="flex-col items-stretch justify-between gap-2 border-t border-border/60 bg-muted/10 p-4 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-xl text-xs font-semibold"
          >
            Kapat
          </Button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!showRevisionForm && displayNote.status !== 'archived' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  let suggested = '';
                  if (isMissingUniversity && isMissingDepartment) {
                    suggested =
                      'Notun üniversite ve bölüm bilgisi eksik. Lütfen hangi üniversite ve bölüme ait olduğunu düzenleyin.';
                  } else if (isMissingUniversity) {
                    suggested = 'Notun üniversite bilgisi eksik. Lütfen üniversitenizi belirtin.';
                  } else if (isMissingDepartment) {
                    suggested = 'Notun bölüm bilgisi eksik. Lütfen bölümünüzü belirtin.';
                  }
                  setRevisionReason(suggested);
                  setShowRevisionForm(true);
                }}
                disabled={submitting}
                className="h-9 gap-1.5 rounded-xl border-amber-500/40 text-xs text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                title="Kullanıcıya eksik bilgileri tamamlaması için 72 saat süre verir"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Düzeltme İste (72 Saat)</span>
              </Button>
            )}

            {displayNote.status !== 'archived' && onArchive && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleArchive}
                disabled={submitting}
                className="h-9 gap-1.5 rounded-xl border-amber-500/40 text-xs text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                title="Notu Yönetici Arşivine Kaldır"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Arşive Kaldır</span>
              </Button>
            )}

            {displayNote.status === 'archived' && onRestore && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={submitting}
                className="h-9 gap-1.5 rounded-xl border-primary/40 text-xs text-primary hover:bg-primary/10"
                title="Arşivden çıkar ve onay bekleyenlere al"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Onaya Al</span>
              </Button>
            )}

            {displayNote.status !== 'archived' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={submitting}
                className="h-9 gap-1.5 rounded-xl border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Reddet</span>
              </Button>
            )}

            {displayNote.status !== 'approved' && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={submitting}
                className="h-9 gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Notu Onayla</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminNotePreviewDialog;
