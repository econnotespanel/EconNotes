import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Palette, Save, RotateCcw, Upload, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { MANAGED_PAGES, useSiteConfig, type SiteTheme } from '@/contexts/SiteConfigContext';

/** Hazır tema paletleri — HSL bileşenleri (H S% L%) olarak tutulur. */
const PRESETS: { name: string; theme: SiteTheme }[] = [
  { name: 'Aurora Neon (varsayılan)', theme: {} },
  { name: 'Kobalt Mavi', theme: { primary: '221 83% 53%', accent: '221 40% 22%', neon: '199 89% 60%' } },
  { name: 'Zümrüt', theme: { primary: '160 84% 39%', accent: '160 30% 20%', neon: '152 76% 55%' } },
  { name: 'Magenta Lab', theme: { primary: '327 82% 56%', accent: '327 35% 22%', neon: '300 90% 65%' } },
  { name: 'Amber Kampüs', theme: { primary: '38 92% 50%', accent: '38 40% 22%', neon: '45 95% 60%' } },
  { name: 'Menekşe', theme: { primary: '262 83% 62%', accent: '262 35% 24%', neon: '275 90% 70%' } },
];

/** Yönetici ekibinin marka, tema ve sayfa erişimini anlık yönettiği panel. */
const SiteDesignPanel = () => {
  const { user } = useAuth();
  const { config, refresh } = useSiteConfig();
  const [brandName, setBrandName] = useState('EconNotes');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [theme, setTheme] = useState<SiteTheme>({});
  const [pages, setPages] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setBrandName(config.brand_name || 'EconNotes');
    setTagline(config.tagline || '');
    setLogoUrl(config.logo_url || '');
    setTheme(config.theme || {});
    setPages(config.pages || {});
  }, [config]);

  const save = async () => {
    setSaving(true);
    const payload = {
      brand_name: brandName.trim() || 'EconNotes',
      tagline: tagline.trim() || null,
      logo_url: logoUrl.trim() || null,
      theme,
      pages,
    };
    const { error } = config.id
      ? await (supabase as any).from('site_config').update(payload).eq('id', config.id)
      : await (supabase as any).from('site_config').insert(payload);
    setSaving(false);
    if (error) { toast.error('Kaydedilemedi: ' + error.message); return; }
    await refresh();
    toast.success('Platform tasarımı güncellendi.');
  };

  const uploadLogo = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    setUploading(false);
    if (error) { toast.error('Logo yüklenemedi: ' + error.message); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    toast.success('Logo yüklendi. Kaydetmeyi unutmayın.');
  };

  const enabledCount = MANAGED_PAGES.filter(p => pages[p.path] !== false).length;

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-primary" /> Marka ve Tema
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Platform adı, sloganı, logosu ve renk paleti anlık olarak tüm kullanıcılara yansır.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Platform adı</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="EconNotes" />
            </div>
            <div className="space-y-1.5">
              <Label>Slogan</Label>
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Akademik hayatın tek merkezi" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-center gap-2">
              {logoUrl && <img src={logoUrl} alt="Logo önizleme" className="h-10 w-10 rounded-md border border-border object-contain" />}
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="min-w-[220px] flex-1" />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <label className="cursor-pointer gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> {uploading ? 'Yükleniyor.' : 'Dosya yükle'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }}
                  />
                </label>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hazır palet</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <Button
                  key={p.name}
                  variant="outline"
                  size="sm"
                  onClick={() => setTheme(p.theme)}
                  className="gap-2"
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-border"
                    style={{ background: p.theme.primary ? `hsl(${p.theme.primary})` : 'hsl(var(--primary))' }}
                  />
                  {p.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {([
              ['primary', 'Ana renk (HSL)'],
              ['accent', 'Vurgu rengi (HSL)'],
              ['neon', 'Neon rengi (HSL)'],
              ['radius', 'Köşe yuvarlaklığı'],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={theme[key] || ''}
                  onChange={(e) => setTheme(t => ({ ...t, [key]: e.target.value }))}
                  placeholder={key === 'radius' ? '0.75rem' : '221 83% 53%'}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" /> {saving ? 'Kaydediliyor.' : 'Kaydet ve yayınla'}
            </Button>
            <Button variant="outline" onClick={() => setTheme({})} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Varsayılan temaya dön
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-primary" /> Sayfa ve Menü Erişimi
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Kapattığınız sayfalar menüden kaldırılır ve kullanıcılara bilgilendirme ekranı gösterilir. Yöneticiler erişmeye devam eder.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Badge variant="outline" className="text-[10px]">{enabledCount}/{MANAGED_PAGES.length} sayfa açık</Badge>
          <div className="grid gap-2 md:grid-cols-2">
            {MANAGED_PAGES.map(p => {
              const on = pages[p.path] !== false;
              return (
                <div key={p.path} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 p-3">
                  <div className="flex items-center gap-2">
                    {on ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-destructive" />}
                    <div>
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{p.path}</p>
                    </div>
                  </div>
                  <Switch checked={on} onCheckedChange={(v) => setPages(prev => ({ ...prev, [p.path]: v }))} />
                </div>
              );
            })}
          </div>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" /> Erişim ayarlarını kaydet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteDesignPanel;
