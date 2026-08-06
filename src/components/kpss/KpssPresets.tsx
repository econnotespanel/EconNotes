import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bookmark, BookmarkPlus, Play, Trash2, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';

export interface PresetRow {
  id: string;
  name: string;
  exam_group: string;
  subject: string;
  topic: string | null;
  difficulty: string;
  question_count: number;
  focus: string | null;
  material_type: string;
  last_used_at: string | null;
}

export interface PresetDraft {
  exam_group: string;
  subject: string;
  topic: string | null;
  difficulty: string;
  question_count: number;
  focus: string | null;
  material_type: string;
}

const TYPE_LABEL: Record<string, string> = {
  quiz: 'Çözümlü Test',
  topics: 'Çıkabilecek Konular',
  summary: 'Konu Özeti',
  flashcards: 'Bilgi Kartları',
};
const DIFF_LABEL: Record<string, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

const KpssPresets = ({
  userId,
  draft,
  onRun,
  busy,
}: {
  userId: string;
  draft: PresetDraft;
  onRun: (p: PresetRow) => void;
  busy: boolean;
}) => {
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('kpss_presets')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    setPresets(((data as any[]) || []) as PresetRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('kpss_presets').insert({ user_id: userId, name: name.trim() || `${draft.subject} · ${TYPE_LABEL[draft.material_type]}`, ...draft });
    setSaving(false);
    if (error) { toast.error('Preset kaydedilemedi.'); return; }
    setOpen(false);
    setName('');
    toast.success('Oturum ayarı preset olarak kaydedildi.');
    void load();
  };

  const remove = async (id: string) => {
    await supabase.from('kpss_presets').delete().eq('id', id);
    void load();
  };

  const run = async (p: PresetRow) => {
    await supabase.from('kpss_presets').update({ last_used_at: new Date().toISOString() }).eq('id', p.id);
    onRun(p);
    void load();
  };

  return (
    <div className="hud-panel p-5">
      <div className="hud-scanline" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <Bookmark className="h-4 w-4 text-accent" /> Kayıtlı oturumlar (preset)
          </h3>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <BookmarkPlus className="h-3.5 w-3.5" /> Mevcut ayarı kaydet
          </Button>
        </div>

        {loading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
        ) : presets.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Henüz preset yok. Oturum ayarlarını belirledikten sonra "Mevcut ayarı kaydet" ile kaydet, sonra tek tıkla aynı oturumu yeniden başlat.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {presets.map(p => (
              <div key={p.id} className="rounded-2xl border border-border/70 bg-card/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold">{p.name}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove(p.id)} aria-label="Preseti sil">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[p.material_type] || p.material_type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{p.subject}{p.topic ? ` · ${p.topic}` : ''}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{DIFF_LABEL[p.difficulty] || p.difficulty}</Badge>
                  <Badge variant="outline" className="text-[10px]">{p.question_count} soru</Badge>
                </div>
                {p.last_used_at && (
                  <p className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> Son kullanım {new Date(p.last_used_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                <Button size="sm" className="mt-3 w-full gap-1.5 gradient-primary border-0 text-primary-foreground" disabled={busy} onClick={() => void run(p)}>
                  <Play className="h-3.5 w-3.5" /> Tek tıkla başlat
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display"><BookmarkPlus className="h-4 w-4 text-primary" /> Preset olarak kaydet</DialogTitle>
            <DialogDescription>
              {TYPE_LABEL[draft.material_type]} · {draft.subject}{draft.topic ? ` · ${draft.topic}` : ''} · {DIFF_LABEL[draft.difficulty]} · {draft.question_count} soru
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Preset adı</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Tarih zor 20 soru" />
            </div>
            <Button className="w-full gap-2 gradient-primary border-0 text-primary-foreground" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />} Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KpssPresets;
