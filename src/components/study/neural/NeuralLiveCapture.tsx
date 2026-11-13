import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { StudyMaterial } from '@/types/study';
import { toast } from 'sonner';

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; [idx: number]: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface NeuralLiveCaptureProps {
  userId: string;
  onSaved: (material: StudyMaterial) => void;
}

export default function NeuralLiveCapture({ userId, onSaved }: NeuralLiveCaptureProps) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('İktisat');
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const toggleRecording = () => {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error('Tarayıcınız canlı ses tanımayı desteklemiyor.');
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'tr-TR';
    rec.onresult = (event) => {
      let appended = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          appended += `${event.results[i][0]?.transcript || ''} `;
        }
      }
      if (appended.trim()) {
        setTranscript((prev) => `${prev} ${appended}`.trim());
      }
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    rec.start();
    recRef.current = rec;
    setRecording(true);
  };

  const handleSynthesize = async () => {
    if (transcript.trim().length < 40) {
      toast.error('Özet oluşturmak için en az 40 karakterlik ders kaydı gerekir.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-study-material', {
        body: {
          materialType: 'summary',
          noteTitle: title.trim() || 'Canlı Ders Kaydı',
          course: course.trim() || 'Genel',
          noteContext: transcript.slice(0, 60_000),
          summaryDepth: 'comprehensive',
          deepResearch: true,
        },
      });
      if (error || !data?.content) throw new Error(error?.message || 'Sentez başarısız.');

      const { data: inserted, error: insErr } = await supabase
        .from('study_materials')
        .insert({
          user_id: userId,
          source_type: 'own',
          source_note_id: null,
          material_type: 'summary',
          title: title.trim() || 'Canlı Ders Özeti',
          course: course.trim() || null,
          content: data.content,
          model: data.model || 'EconNotes Canlı Sentez',
        })
        .select('*')
        .single();

      if (insErr || !inserted) throw new Error(insErr?.message || 'Kaydedilemedi.');
      onSaved(inserted as unknown as StudyMaterial);
      toast.success('Canlı ders transkripti özet olarak kaydedildi.');
      setTitle('');
      setTranscript('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Canlı özet oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="neural-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">Canlı Amfi Dersi Yakalama</h3>
            <Badge variant="outline" className="text-[10px]">
              Yönetici Aracı
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Anlık konuşmayı Türkçe yazıya dökün ve tek tıkla yapılandırılmış özete dönüştürün.
          </p>
        </div>

        <Button
          type="button"
          variant={recording ? 'destructive' : 'outline'}
          size="sm"
          onClick={toggleRecording}
          className="gap-1.5"
        >
          {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {recording ? 'Kaydı Durdur' : 'Mikrofonu Başlat'}
        </Button>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Ders Başlığı</Label>
          <Input
            placeholder="Örn: Para Teorisi 6. Hafta"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ders / Alan</Label>
          <Input value={course} onChange={(e) => setCourse(e.target.value)} />
        </div>
      </div>

      <Textarea
        rows={4}
        placeholder="Canlı ders transkripti burada birikir..."
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        className="mb-3 text-xs"
      />

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSynthesize()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Canlı Özete Dönüştür
        </Button>
      </div>
    </div>
  );
}
