import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, Search } from 'lucide-react';

interface LogRow {
  id: string;
  user_name: string;
  user_email: string;
  action: string;
  details: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

/** Sensitive actions only — deletions, penalties and role/system changes. */
const AUDIT_ACTIONS = ['user_deleted', 'penalty_issued', 'note_deleted', 'announcement_deleted', 'password_changed', 'user_registered'];

const ACTION_META: Record<string, { label: string; tone: string }> = {
  user_deleted: { label: 'Hesap Silindi', tone: 'bg-destructive/10 text-destructive' },
  penalty_issued: { label: 'Ceza Verildi', tone: 'bg-warning/10 text-warning' },
  note_deleted: { label: 'Not Silindi', tone: 'bg-destructive/10 text-destructive' },
  announcement_deleted: { label: 'Duyuru Silindi', tone: 'bg-destructive/10 text-destructive' },
  password_changed: { label: 'Şifre Değişti', tone: 'bg-primary/10 text-primary' },
  user_registered: { label: 'Yeni Kayıt', tone: 'bg-success/10 text-success' },
};

/** Timestamped audit trail visible only inside the admin panel. */
const AuditLogPanel = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .in('action', AUDIT_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(300);
      setLogs((data as LogRow[]) || []);
      setLoading(false);
    };
    void run();
  }, []);

  const filtered = logs.filter(l => {
    if (action !== 'all' && l.action !== action) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [l.user_name, l.user_email, l.details, l.entity_id].some(v => (v || '').toLowerCase().includes(s));
  });

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" /> Denetim Kaydı (Audit Log)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hesap silme, ceza ve içerik silme işlemlerinin zaman damgalı kaydı. Yalnızca yönetici ekibi görebilir.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kullanıcı, e-posta veya kayıt ara" className="pl-9" />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm işlemler</SelectItem>
              {AUDIT_ACTIONS.map(a => (
                <SelectItem key={a} value={a}>{ACTION_META[a]?.label || a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2 pr-2">
              {filtered.map(l => {
                const meta = ACTION_META[l.action] || { label: l.action, tone: 'bg-muted text-muted-foreground' };
                return (
                  <div key={l.id} className="rounded-xl border border-border/60 bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{l.user_name || '?'}</span>
                          <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{l.user_email}</p>
                        {l.details && <p className="mt-1 text-xs text-muted-foreground">{l.details}</p>}
                        {l.entity_id && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">#{l.entity_id}</p>}
                      </div>
                      <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                        {new Date(l.created_at).toLocaleString('tr-TR')}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLogPanel;
