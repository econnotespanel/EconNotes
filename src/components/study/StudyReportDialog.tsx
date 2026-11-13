import { useState } from 'react';
import { Flag, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StudyReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialId?: string;
}

export function StudyReportDialog({
  open,
  onOpenChange,
  materialId,
}: StudyReportDialogProps) {
  const { user } = useAuth();
  const [section, setSection] = useState('Özet / İçerik');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Lütfen yaşadığınız sorunu veya önerinizi açıklayın.');
      return;
    }
    if (!user) {
      toast.error('Giriş gerekli.');
      return;
    }
    setSubmitting(true);
    try {
      let screenshotUrl: string | null = null;
      if (screenshot) {
        const path = `study-reports/${user.id}/${Date.now()}-${screenshot.name}`;
        const { error: upErr } = await supabase.storage
          .from('notes')
          .upload(path, screenshot, { upsert: false });
        if (!upErr) {
          screenshotUrl = path;
        }
      }

      const { error } = await supabase.from('study_reports').insert({
        user_id: user.id,
        user_email: user.email || '',
        user_name: user.user_metadata?.full_name || '',
        material_id: materialId || null,
        section,
        description: description.trim(),
        screenshot_url: screenshotUrl,
      });
      if (error) throw error;
      toast.success('Bildirimin yöneticilere ulaştı. Teşekkürler.');
      setDescription('');
      setScreenshot(null);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Bildirim gönderilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            Sorun veya Öneri Bildir
          </DialogTitle>
          <DialogDescription>
            Hatalı üretilen bir özet, okunmayan PDF, eksik denklem veya stüdyo önerinizi iletin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Bölüm</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Özet / İçerik">Ders Özeti / Derin Araştırma</SelectItem>
                <SelectItem value="PDF / Dosya Okuma">PDF / Slayt Okuma & OCR</SelectItem>
                <SelectItem value="Bilgi Kartları">Bilgi Kartları</SelectItem>
                <SelectItem value="Test / Sınav">Sınav Simülasyonu</SelectItem>
                <SelectItem value="Video Ders">İnteraktif Video Ders</SelectItem>
                <SelectItem value="Akıl Hocası">Akıl Hocası (AI)</SelectItem>
                <SelectItem value="Diğer">Diğer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Açıklama</Label>
            <Textarea
              rows={4}
              placeholder="Karşılaştığınız durumu veya iyileştirme fikrinizi yazın..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ekran Görüntüsü (İsteğe bağlı)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {screenshot ? screenshot.name : 'Görsel seç (.png, .jpg, .webp)'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
