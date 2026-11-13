import { useState } from 'react';
import { Flag, ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

interface NeuralReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialId?: string;
}

const CATEGORIES = [
  'Yanlış veya Eksik İçerik',
  'GPU / Yerel Model Hatası',
  'Matematik / Formül Gösterimi',
  'Ses / Video Senkron Sorunu',
  'Genel Hata veya Öneri',
];

export function NeuralReportDialog({ open, onOpenChange, materialId }: NeuralReportDialogProps) {
  const { user } = useAuth();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Bildirim göndermek için giriş yapmalısınız.');
      return;
    }
    if (description.trim().length < 8) {
      toast.error('Lütfen en az birkaç kelimeyle sorunu açıklayın.');
      return;
    }

    setSubmitting(true);
    try {
      let screenshotPath: string | null = null;
      if (screenshot) {
        const ext = screenshot.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `study-reports/${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('notes').upload(path, screenshot, {
          upsert: false,
        });
        if (!upErr) screenshotPath = path;
      }

      const { error } = await supabase.from('study_reports').insert({
        user_id: user.id,
        material_id: materialId || null,
        section: category,
        description: description.trim(),
        screenshot_url: screenshotPath,
      });

      if (error) throw new Error(error.message);

      toast.success('Geri bildiriminiz Çalışma Stüdyosu ekibine iletildi.');
      setDescription('');
      setScreenshot(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bildirim gönderilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            Neural Studio Hata & İyileştirme Bildirimi
          </DialogTitle>
          <DialogDescription>
            Hatalı AI çıktısı, GPU yükleme sorunu veya arayüz aksaklığını doğrudan iletin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Konu Kategorisi</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="neural-report-desc">Açıklama</Label>
            <Textarea
              id="neural-report-desc"
              rows={4}
              placeholder="Karşılaştığınız durumu kısaca yazın..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="neural-report-shot" className="flex items-center gap-1.5 text-xs">
              <ImagePlus className="h-3.5 w-3.5" />
              Ekran Görüntüsü (İsteğe bağlı)
            </Label>
            <Input
              id="neural-report-shot"
              type="file"
              accept="image/*"
              onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Bildirimi Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
