import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mic, MicOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResult>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface StudyMaterial {
  id: string;
  user_id: string;
  source_type: string;
  source_note_id: string | null;
  material_type: 'summary';
  title: string;
  course: string | null;
  content: Record<string, unknown>;
  created_at: string;
}

interface LiveLectureCaptureProps {
  userId: string;
  onSaved: (material: StudyMaterial) => void;
}

const MAX_TRANSCRIPT_LENGTH = 60_000;

const normalizeTranscript = (value: string) => value
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/[ \t]*\n[ \t]*/g, '\n')
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/([.!?])(?=\S)/g, '$1 ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const isSummaryContent = (value: unknown): value is {
  overview: string;
  keyPoints: string[];
  sections: Array<{ heading: string; content: string; takeaway?: string }>;
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.overview === 'string'
    && summary.overview.trim().length > 0
    && Array.isArray(summary.keyPoints)
    && summary.keyPoints.every((point) => typeof point === 'string' && point.trim().length > 0)
    && Array.isArray(summary.sections)
    && summary.sections.every((section) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) return false;
      const item = section as Record<string, unknown>;
      return typeof item.heading === 'string'
        && item.heading.trim().length > 0
        && typeof item.content === 'string'
        && item.content.trim().length > 0;
    });
};

const LiveLectureCapture = ({ userId, onSaved }: LiveLectureCaptureProps) => {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef('');
  const recordingRef = useRef(false);

  useEffect(() => () => {
    recordingRef.current = false;
    recognitionRef.current?.abort();
  }, []);

  const startRecording = () => {
    if (!title.trim()) {
      toast.error('Kayda başlamadan önce ders başlığını yazın.');
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Bu tarayıcı canlı konuşma yazıya dökümünü desteklemiyor. Güncel Chrome veya Edge kullanın.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = 'tr-TR';
    finalTranscriptRef.current = '';
    setTranscript('');
    recognitionRef.current = recognition;
    recordingRef.current = true;
    setIsRecording(true);

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalTranscriptRef.current += `${text} `;
        else interimTranscript += text;
      }

      const nextTranscript = `${finalTranscriptRef.current}${interimTranscript}`.trim();
      if (nextTranscript.length > MAX_TRANSCRIPT_LENGTH) {
        recordingRef.current = false;
        setIsRecording(false);
        recognition.stop();
        setTranscript(nextTranscript.slice(0, MAX_TRANSCRIPT_LENGTH));
        toast.error('Döküm 60.000 karakter sınırına ulaştı. Mevcut metni özetleyebilirsiniz.');
        return;
      }
      setTranscript(nextTranscript);
    };

    recognition.onerror = (event) => {
      recordingRef.current = false;
      setIsRecording(false);
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofon erişimine izin verin.'
        : event.error === 'network'
          ? 'Konuşma tanıma hizmetine bağlanılamadı. İnternet bağlantınızı kontrol edin.'
          : 'Canlı yazıya döküm sırasında bir sorun oluştu.';
      toast.error(message);
    };

    recognition.onend = () => {
      if (!recordingRef.current) return;
      try {
        recognition.start();
      } catch (error) {
        console.error('Canlı ders konuşma tanıma yeniden başlatılamadı:', error);
        recordingRef.current = false;
        setIsRecording(false);
        toast.error('Canlı yazıya döküm yeniden başlatılamadı. Kaydı durdurup tekrar deneyin.');
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Canlı ders konuşma tanıma başlatılamadı:', error);
      recordingRef.current = false;
      setIsRecording(false);
      toast.error('Mikrofon başlatılamadı. Mikrofon iznini ve tarayıcı desteğini kontrol edin.');
    }
  };

  const stopRecording = () => {
    recordingRef.current = false;
    setIsRecording(false);
    recognitionRef.current?.stop();
  };

  const summarizeLecture = async () => {
    const cleanedTranscript = normalizeTranscript(transcript);
    if (!title.trim() || cleanedTranscript.length < 40) {
      toast.error('Özet için ders başlığı ve en az 40 karakterlik bir döküm gerekli.');
      return;
    }

    setIsSummarizing(true);
    try {
      let { data, error } = await supabase.functions.invoke('summarize-live-lecture', {
        body: { title: title.trim(), course: course.trim(), transcript: cleanedTranscript },
      });
      if (error) {
        console.warn('Özel canlı ders özeti function kullanılamıyor, mevcut özet function deneniyor:', error);
        const fallback = await supabase.functions.invoke('generate-study-material', {
          body: {
            materialType: 'summary',
            noteContext: cleanedTranscript,
            noteTitle: title.trim(),
            course: course.trim() || undefined,
          },
        });
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!isSummaryContent(data?.content)) {
        throw new Error('Yapay zeka geçerli bir ders özeti döndürmedi.');
      }

      const { data: savedMaterial, error: saveError } = await supabase
        .from('study_materials')
        .insert({
          user_id: userId,
          source_type: 'own',
          source_note_id: null,
          material_type: 'summary',
          title: `Canlı Ders Özeti: ${title.trim()}`,
          course: course.trim() || null,
          content: { ...data.content, transcript: cleanedTranscript },
          model: data.model,
        })
        .select()
        .single();
      if (saveError) throw saveError;

      onSaved(savedMaterial as StudyMaterial);
      toast.success('Canlı ders özeti çalışma materyallerine kaydedildi.');
      setTranscript('');
      finalTranscriptRef.current = '';
    } catch (error) {
      console.error('Canlı ders özeti oluşturulamadı:', error);
      toast.error(error instanceof Error ? error.message : 'Özet oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/5 via-card to-accent/5">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Mic className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg sm:text-xl">Yönetici Canlı Ders Notları</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Dersi Türkçe olarak canlı yazıya dökün, dökümü düzenleyin ve Gemini 2.5 Pro ile yapılandırılmış özet oluşturun.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="live-lecture-title">Ders başlığı</Label>
            <Input
              id="live-lecture-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Örn. Mikroekonomi — Arz ve talep"
              maxLength={160}
              disabled={isRecording || isSummarizing}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="live-lecture-course">Ders adı <span className="text-muted-foreground">(isteğe bağlı)</span></Label>
            <Input
              id="live-lecture-course"
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              placeholder="Örn. Mikroekonomi"
              maxLength={120}
              disabled={isRecording || isSummarizing}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRecording ? (
            <Button variant="destructive" onClick={stopRecording} className="gap-2">
              <MicOff className="h-4 w-4" /> Kaydı durdur
            </Button>
          ) : (
            <Button onClick={startRecording} disabled={isSummarizing} className="gap-2">
              <Mic className="h-4 w-4" /> Canlı yazıya dökümü başlat
            </Button>
          )}
          {isRecording && (
            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Mikrofon açık
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="live-lecture-transcript">Ders dökümü</Label>
          <Textarea
            id="live-lecture-transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value.slice(0, MAX_TRANSCRIPT_LENGTH))}
            placeholder="Kaydı başlatın veya ders dökümünü buraya yapıştırın. Özete göndermeden önce metni düzenleyebilirsiniz."
            rows={7}
            maxLength={MAX_TRANSCRIPT_LENGTH}
            disabled={isRecording || isSummarizing}
            className="max-h-80 min-h-36 resize-y leading-relaxed"
          />
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Özet yalnızca siz düğmeye bastığınızda yapay zekaya gönderilir.</span>
            <span>{transcript.length.toLocaleString('tr-TR')} / {MAX_TRANSCRIPT_LENGTH.toLocaleString('tr-TR')}</span>
          </div>
        </div>

        <Button
          onClick={() => void summarizeLecture()}
          disabled={isRecording || isSummarizing || transcript.trim().length < 40 || !title.trim()}
          className="w-full gap-2 sm:w-auto"
        >
          {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isSummarizing ? 'Ders özeti hazırlanıyor…' : 'Yapay zeka ile ders özeti oluştur'}
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Mikrofon izni gereklidir. Konuşma tanıma tarayıcı hizmetiyle yapılır; oluşturduğunuz döküm ve ders bilgisi özeti hazırlamak için EconNotes yapay zeka servisine gönderilir.
        </p>
      </CardContent>
    </Card>
  );
};

export default LiveLectureCapture;
