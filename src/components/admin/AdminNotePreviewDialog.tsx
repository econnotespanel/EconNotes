import React, { useState, useEffect } from 'react';
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
import { signedNoteUrl } from '@/lib/storageUrl';
import {
  Check,
  Ban,
  Clock,
  ExternalLink,
  FileText,
  AlertTriangle,
  Building,
  GraduationCap,
  Calendar,
  User,
  Lock,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminNotePreviewDialogProps {
  note: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: string) => Promise<void>;
  onRequestRevision: (id: string, reason: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  notePassword?: string;
  onRevealPassword?: (id: string) => Promise<void>;
}

export const AdminNotePreviewDialog: React.FC<AdminNotePreviewDialogProps> = ({
  note,
  open,
  onOpenChange,
  onApprove,
  onRequestRevision,
  onReject,
  notePassword,
  onRevealPassword,
}) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!note || !open) {
      setFileUrl(null);
      setShowRevisionForm(false);
      setRevisionReason('');
      return;
    }

    if (note.file_url) {
      setLoadingFile(true);
      signedNoteUrl(note.file_url, 3600)
        .then((url) => setFileUrl(url))
        .catch((err) => console.error('Signed URL hatası:', err))
        .finally(() => setLoadingFile(false));
    }
  }, [note, open]);

  if (!note) return null;

  const isImage = note.file_type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(note.file_name || '');
  const isPdf = note.file_type === 'application/pdf' || /\.pdf$/i.test(note.file_name || '');
  const isMissingUniversity = !note.university || !note.university.trim();
  const isMissingDepartment = !note.department || !note.department.trim();

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(note.id);
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
      await onRequestRevision(note.id, cleanReason);
      setShowRevisionForm(false);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await onReject(note.id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-card border-border shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <DialogTitle className="text-lg font-bold truncate max-w-lg">
                  {note.title}
                </DialogTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                {note.course} • {note.semester} • {note.grade}. Sınıf
              </p>
            </div>

            <div className="flex items-center gap-2">
              {note.status === 'pending' && (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-500">
                  <Clock className="h-3 w-3 mr-1" /> Onay Bekliyor
                </Badge>
              )}
              {note.status === 'revision_requested' && (
                <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/15 text-cyan-400">
                  <RefreshCw className="h-3 w-3 mr-1" /> Düzeltme Bekleniyor (72 Saat)
                </Badge>
              )}
              {note.status === 'approved' && (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/15 text-emerald-500">
                  <Check className="h-3 w-3 mr-1" /> Onaylı
                </Badge>
              )}
              {note.status === 'archived' && (
                <Badge variant="outline" className="border-muted bg-muted/40 text-muted-foreground">
                  Arşivde
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {/* Üniversite */}
            <div className={`p-2.5 rounded-xl border ${
              isMissingUniversity
                ? 'border-destructive/50 bg-destructive/10'
                : 'border-border/60 bg-muted/20'
            }`}>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Building className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Üniversite</span>
              </div>
              {isMissingUniversity ? (
                <span className="text-destructive font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Belirtilmemiş!
                </span>
              ) : (
                <span className="font-medium text-foreground">{note.university}</span>
              )}
            </div>

            {/* Bölüm */}
            <div className={`p-2.5 rounded-xl border ${
              isMissingDepartment
                ? 'border-destructive/50 bg-destructive/10'
                : 'border-border/60 bg-muted/20'
            }`}>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <GraduationCap className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Bölüm</span>
              </div>
              {isMissingDepartment ? (
                <span className="text-destructive font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Belirtilmemiş!
                </span>
              ) : (
                <span className="font-medium text-foreground">{note.department}</span>
              )}
            </div>

            {/* Yükleyen */}
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Yükleyen</span>
              </div>
              <span className="font-medium text-foreground">{note.uploader_name || 'Bilinmiyor'}</span>
            </div>

            {/* Tarih */}
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Yükleme Tarihi</span>
              </div>
              <span className="font-medium text-foreground">
                {note.created_at ? new Date(note.created_at).toLocaleString('tr-TR') : '—'}
              </span>
            </div>

            {/* Dosya Bilgisi */}
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Dosya Adı & Türü</span>
              </div>
              <span className="font-medium text-foreground truncate block" title={note.file_name || undefined}>
                {note.file_name || 'Dosya'} ({note.file_type || '—'})
              </span>
            </div>

            {/* Şifre */}
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Lock className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Not Kilidi / Şifre</span>
              </div>
              {note.has_password ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-amber-500 font-semibold">
                    {notePassword ? `Şifre: ${notePassword}` : 'Korumalı'}
                  </span>
                  {!notePassword && onRevealPassword && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRevealPassword(note.id)}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      <Eye className="h-3 w-3 mr-0.5" /> Göster
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Şifresiz</span>
              )}
            </div>
          </div>

          {/* Açıklama */}
          {note.description && (
            <div className="rounded-xl border border-border/60 bg-muted/15 p-3 text-xs">
              <span className="font-semibold text-muted-foreground block mb-1">Açıklama:</span>
              <p className="text-foreground whitespace-pre-wrap">{note.description}</p>
            </div>
          )}

          {/* Dosya Önizleme Alanı */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-primary" />
                İçerik Önizleme
              </span>
              {fileUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                  className="h-7 text-xs rounded-lg gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Yeni Sekmede Aç
                </Button>
              )}
            </div>

            <div className="min-h-[300px] max-h-[480px] rounded-xl border border-border/70 bg-background/50 overflow-hidden flex items-center justify-center relative">
              {loadingFile ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Dosya yükleniyor…
                </div>
              ) : !fileUrl ? (
                <p className="text-sm text-muted-foreground">Dosya bağlantısı alınamadı.</p>
              ) : isImage ? (
                <img
                  src={fileUrl}
                  alt={note.title}
                  className="max-h-[460px] w-auto max-w-full object-contain mx-auto"
                />
              ) : isPdf ? (
                <iframe
                  src={`${fileUrl}#toolbar=1`}
                  title={note.title}
                  className="w-full h-[460px] border-0"
                />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <FileText className="h-8 w-8" />
                  </div>
                  <p className="font-semibold text-sm text-foreground">{note.file_name}</p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Bu dosya türü doğrudan tarayıcı içinde önizlenemiyor. Dosyayı görüntülemek veya incelemek için aşağıdaki butondan açabilirsiniz.
                  </p>
                  <Button
                    onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                    className="rounded-xl gap-2"
                  >
                    <ExternalLink className="h-4 w-4" /> Dosyayı İncele / İndir
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Revision Form Section */}
          {showRevisionForm && (
            <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-amber-500">
                <Clock className="h-5 w-5" />
                <h4 className="font-bold text-sm">Kullanıcıya Düzenleme / Revizyon Gönder (72 Saat Süre)</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bu notu reddetmek yerine kullanıcıya geri gönderirsiniz. Kullanıcıya <strong>72 saat süre</strong> tanınır.
                Kullanıcı bu süre içinde not bilgilerini düzelttiğinde not yeniden onay aşamasına geçer. 72 saat içinde düzenleme yapılmazsa not otomatik olarak yönetici arşivine kaldırılır.
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
                  className="rounded-xl bg-background border-border/80 text-xs min-h-[80px]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRevisionForm(false)}
                  className="rounded-xl h-8 px-3 text-xs"
                >
                  Vazgeç
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendRevision}
                  disabled={submitting || !revisionReason.trim()}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-8 px-4 text-xs gap-1.5"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>{submitting ? 'Gönderiliyor…' : '72 Saat Süreyle Revizyona Gönder'}</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 border-t border-border/60 bg-muted/10 flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Kapat
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {!showRevisionForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Pre-fill suggested reason if missing uni/dept
                  let suggested = '';
                  if (isMissingUniversity && isMissingDepartment) {
                    suggested = 'Notun üniversite ve bölüm bilgisi eksik. Lütfen hangi üniversite ve bölüme ait olduğunu düzenleyin.';
                  } else if (isMissingUniversity) {
                    suggested = 'Notun üniversite bilgisi eksik. Lütfen üniversitenizi belirtin.';
                  } else if (isMissingDepartment) {
                    suggested = 'Notun bölüm bilgisi eksik. Lütfen bölümünüzü belirtin.';
                  }
                  setRevisionReason(suggested);
                  setShowRevisionForm(true);
                }}
                disabled={submitting}
                className="rounded-xl text-amber-500 border-amber-500/40 hover:bg-amber-500/10 text-xs h-9 gap-1.5"
                title="Kullanıcıya eksik bilgileri tamamlaması için 72 saat süre verir"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Düzeltme İste (72 Saat)</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              disabled={submitting}
              className="rounded-xl text-destructive border-destructive/40 hover:bg-destructive/10 text-xs h-9 gap-1.5"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Reddet</span>
            </Button>

            <Button
              size="sm"
              onClick={handleApprove}
              disabled={submitting}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-sm shadow-emerald-600/30"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Onayla ve Yayınla</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminNotePreviewDialog;
