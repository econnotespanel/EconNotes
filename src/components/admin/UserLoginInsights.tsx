import { useMemo, useState } from 'react';
import {
  Smartphone,
  Tablet,
  Monitor,
  Clock,
  Search,
  RotateCcw,
  Download,
  Globe,
  AppWindow,
  History,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DeviceCategory } from '@/lib/deviceInfo';
import {
  type UserLoginEvent,
  type UserLoginSummary,
  formatExactDateTime,
  formatRelativeLoginTime,
  formatShortDateTime,
} from '@/lib/adminLoginAnalytics';

export const DeviceCategoryIcon = ({
  type,
  className = 'h-3.5 w-3.5',
}: {
  type?: DeviceCategory;
  className?: string;
}) => {
  if (type === 'mobile') return <Smartphone className={className} />;
  if (type === 'tablet') return <Tablet className={className} />;
  return <Monitor className={className} />;
};

export const UserLastLoginCell = ({
  summary,
  onOpenHistory,
}: {
  summary?: UserLoginSummary;
  onOpenHistory: () => void;
}) => {
  const iso = summary?.effectiveLastLogin ?? null;
  const rel = formatRelativeLoginTime(iso);

  if (!iso) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        Henüz giriş yapmadı
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenHistory}
      className="group flex flex-col items-start gap-1 text-left transition-opacity hover:opacity-90"
      title="Giriş ve cihaz geçmişini görüntüle"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
          rel.isOnlineNow
            ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
            : rel.isToday
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border/70 bg-muted/50 text-foreground/85'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            rel.isOnlineNow
              ? 'animate-pulse bg-emerald-500'
              : rel.isToday
                ? 'bg-primary'
                : 'bg-muted-foreground/60'
          }`}
        />
        {rel.label}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
        {formatShortDateTime(iso)}
      </span>
      {summary && summary.providers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {summary.providers.map((p) => (
            <span
              key={p}
              className="rounded-md border border-border/60 bg-background/70 px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </button>
  );
};

export const UserDevicesCell = ({
  summary,
  onOpenHistory,
}: {
  summary?: UserLoginSummary;
  onOpenHistory: () => void;
}) => {
  if (!summary?.effectiveLastLogin && (!summary?.devices || summary.devices.length === 0)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const devices = summary?.devices || [];

  if (devices.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenHistory}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border/80 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      >
        <History className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <span>Önceki oturum · Detay</span>
      </button>
    );
  }

  const visibleDevices = devices.slice(0, 2);
  const extraCount = devices.length - visibleDevices.length;

  return (
    <button
      type="button"
      onClick={onOpenHistory}
      className="flex flex-col items-start gap-1.5 text-left group"
      title="Tüm giriş cihazlarını ve saatlerini görüntüle"
    >
      {visibleDevices.map((dev) => (
        <span
          key={dev.fingerprint}
          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/[0.06] group-hover:bg-primary/[0.12] group-hover:border-primary/35 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors"
        >
          <DeviceCategoryIcon type={dev.deviceType} className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[165px]">{dev.deviceLabel}</span>
          <span className="text-muted-foreground">· {dev.browser}</span>
          {dev.isPwa && (
            <span className="rounded bg-primary/15 px-1 py-0.2 text-[9px] font-bold text-primary">
              PWA
            </span>
          )}
        </span>
      ))}
      <div className="flex items-center gap-1.5 text-[10px] text-primary font-medium">
        {extraCount > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold">
            +{extraCount} cihaz daha
          </span>
        )}
        <span className="underline-offset-2 group-hover:underline">
          Geçmişi gör ({summary?.totalLogins || devices.length})
        </span>
      </div>
    </button>
  );
};

export const UserLoginHistoryDialog = ({
  open,
  onOpenChange,
  userProfile,
  email,
  roleLabel,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userProfile: any | null;
  email: string;
  roleLabel: string;
  summary?: UserLoginSummary;
}) => {
  if (!userProfile) return null;

  const devices = summary?.devices || [];
  const events = summary?.events || [];
  const rel = formatRelativeLoginTime(summary?.effectiveLastLogin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-xl flex-col gap-0 p-0 overflow-hidden sm:p-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.09] via-transparent to-transparent shrink-0">
          <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Smartphone className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="truncate">{userProfile.full_name || 'Kullanıcı'}</span>
                <Badge variant="outline" className="text-[10px] rounded-full">
                  {roleLabel}
                </Badge>
              </div>
              <p className="text-xs font-normal text-muted-foreground truncate mt-0.5">
                {email || 'E-posta kaydı yok'}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">Son Giriş</p>
              <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5">{rel.label}</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                {formatExactDateTime(summary?.effectiveLastLogin)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">Kayıtlı Cihaz</p>
              <p className="text-base font-bold text-primary mt-0.5">{devices.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Toplam {summary?.totalLogins || 0} oturum
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">Giriş Yöntemi</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {summary?.providers?.length ? (
                  summary.providers.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px] rounded-lg px-2 py-0.5">
                      {p}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs font-medium text-foreground">E-posta</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Kayıt: {formatShortDateTime(userProfile.created_at)}
              </p>
            </div>
          </div>

          {/* Distinct Devices */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5 text-primary" />
              Giriş Yapılan Cihazlar ({devices.length})
            </h4>
            {devices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/25 p-4 text-xs text-muted-foreground leading-relaxed">
                {summary?.effectiveLastLogin
                  ? 'Bu kullanıcının son giriş saati kayıtlıdır ancak giriş işlemi cihaz takibi güncellemesinden önce gerçekleşmiştir. Kullanıcı tekrar giriş yaptığında veya uygulamayı açtığında cihaz modeli, işletim sistemi ve tarayıcı bilgisi otomatik olarak burada görünecektir.'
                  : 'Bu kullanıcı henüz panele giriş yapmamıştır.'}
              </div>
            ) : (
              <div className="space-y-2">
                {devices.map((dev) => (
                  <div
                    key={dev.fingerprint}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-3.5"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <DeviceCategoryIcon type={dev.deviceType} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-foreground">{dev.deviceLabel}</span>
                          {dev.os && (
                            <Badge variant="outline" className="text-[10px] rounded-md">
                              {dev.os}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] rounded-md gap-1">
                            <Globe className="h-2.5 w-2.5" />
                            {dev.browser}
                          </Badge>
                          {dev.isPwa && (
                            <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-primary/30 text-[10px] rounded-md gap-1">
                              <AppWindow className="h-2.5 w-2.5" />
                              PWA Uygulama
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Son görülme: <strong className="text-foreground/90">{formatExactDateTime(dev.lastSeenAt)}</strong>
                          {dev.screen ? ` · Ekran: ${dev.screen}` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 rounded-full text-[10px]">
                      {dev.loginCount} giriş
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chronological Login History */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Oturum Zaman Çizelgesi ({events.length})
            </h4>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">Kayıtlı oturum geçmişi bulunmuyor.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 30).map((ev) => {
                  const evRel = formatRelativeLoginTime(ev.createdAt);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <DeviceCategoryIcon
                          type={ev.device?.deviceType}
                          className="h-4 w-4 text-primary shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {ev.device
                              ? `${ev.device.deviceLabel}${ev.device.os ? ` (${ev.device.os})` : ''} · ${ev.device.browser}${ev.device.isPwa ? ' · PWA' : ''}`
                              : ev.details}
                          </p>
                          {ev.providerLabel && (
                            <p className="text-[10px] text-muted-foreground">
                              {ev.providerLabel} ile doğrulandı
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-foreground/90">{evRel.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {formatExactDateTime(ev.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AdminLoginLogTab = ({
  users,
  summariesByUserId,
  allEvents,
  loading,
  getRoleLabelForUser,
  onRefresh,
  onInspectUser,
}: {
  users: any[];
  summariesByUserId: Record<string, UserLoginSummary>;
  allEvents: UserLoginEvent[];
  loading: boolean;
  getRoleLabelForUser: (userId: string) => string;
  onRefresh: () => void;
  onInspectUser: (userId: string) => void;
}) => {
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'mobile' | 'tablet' | 'desktop' | 'pwa'>('all');

  const stats = useMemo(() => {
    let activeToday = 0;
    let activeWeek = 0;
    let mobileOrTablet = 0;
    let desktop = 0;

    for (const u of users) {
      const s = summariesByUserId[u.user_id];
      if (!s?.effectiveLastLogin) continue;
      const rel = formatRelativeLoginTime(s.effectiveLastLogin);
      if (rel.isToday) activeToday += 1;
      if (rel.isRecentWeek) activeWeek += 1;
    }

    for (const ev of allEvents) {
      if (!ev.device) continue;
      if (ev.device.deviceType === 'mobile' || ev.device.deviceType === 'tablet') {
        mobileOrTablet += 1;
      } else {
        desktop += 1;
      }
    }

    return { activeToday, activeWeek, mobileOrTablet, desktop };
  }, [users, summariesByUserId, allEvents]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return allEvents.filter((ev) => {
      if (deviceFilter === 'pwa' && !ev.device?.isPwa) return false;
      if (
        (deviceFilter === 'mobile' || deviceFilter === 'tablet' || deviceFilter === 'desktop') &&
        ev.device?.deviceType !== deviceFilter
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        ev.userName,
        ev.userEmail,
        ev.details,
        ev.device?.deviceLabel,
        ev.device?.os,
        ev.device?.browser,
        ev.providerLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return haystack.includes(q);
    });
  }, [allEvents, search, deviceFilter]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Tarih', 'Ad Soyad', 'E-posta', 'Cihaz', 'İşletim Sistemi', 'Tarayıcı', 'Uygulama Modu', 'Giriş Yöntemi'];
    const rows = filteredEvents.map((ev) =>
      [
        formatExactDateTime(ev.createdAt),
        ev.userName,
        ev.userEmail,
        ev.device?.deviceLabel || 'Önceki Oturum',
        ev.device?.os || '—',
        ev.device?.browser || '—',
        ev.device?.isPwa ? 'PWA Uygulama' : 'Web Tarayıcı',
        ev.providerLabel || 'E-posta',
      ]
        .map(esc)
        .join(';'),
    );
    const csv = '\uFEFF' + [head.map(esc).join(';'), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `econnotes-giris-ve-cihaz-kayitlari-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Kullanıcı Giriş Kayıtları ve Cihaz Analizi
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tüm kullanıcıların son oturum saatleri, bağlandıkları telefon/bilgisayar modelleri, tarayıcı ve PWA uygulama bilgileri.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} className="rounded-xl gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Yenile
            </Button>
            <Button
              size="sm"
              onClick={exportCsv}
              disabled={filteredEvents.length === 0}
              className="rounded-xl gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> CSV ({filteredEvents.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Bugün Giriş Yapan</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.activeToday}</p>
            <p className="text-[11px] text-muted-foreground">aktif kullanıcı</p>
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Son 7 Gün Aktif</span>
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.activeWeek}</p>
            <p className="text-[11px] text-muted-foreground">farklı hesap</p>
          </div>
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Mobil & Tablet</span>
              <Smartphone className="h-4 w-4 text-sky-500" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.mobileOrTablet}</p>
            <p className="text-[11px] text-muted-foreground">kayıtlı mobil oturum</p>
          </div>
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Bilgisayar</span>
              <Monitor className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.desktop}</p>
            <p className="text-[11px] text-muted-foreground">kayıtlı masaüstü oturum</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad soyad, e-posta, iPhone, Android, Windows, Safari, Chrome ara..."
              className="h-10 rounded-xl bg-background pl-9"
            />
          </div>
          <Select value={deviceFilter} onValueChange={(v) => setDeviceFilter(v as any)}>
            <SelectTrigger className="h-10 w-full sm:w-52 rounded-xl bg-background">
              <SelectValue placeholder="Cihaz türü" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Cihazlar</SelectItem>
              <SelectItem value="mobile">📱 Mobil Telefon</SelectItem>
              <SelectItem value="tablet">📟 Tablet (iPad / Android)</SelectItem>
              <SelectItem value="desktop">💻 Bilgisayar (Windows / Mac)</SelectItem>
              <SelectItem value="pwa">⚡ PWA (Ana Ekran Uygulaması)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chronological Login Feed */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/20 p-10 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Giriş kayıtları yükleniyor…
          </div>
        ) : (
          <ScrollArea className="h-[540px]">
            <div className="space-y-2 pr-2">
              {filteredEvents.map((ev) => {
                const rel = formatRelativeLoginTime(ev.createdAt);
                return (
                  <div
                    key={ev.id}
                    onClick={() => onInspectUser(ev.userId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onInspectUser(ev.userId);
                      }
                    }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-border/60 bg-card/65 hover:bg-primary/[0.04] hover:border-primary/30 p-3.5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          ev.device?.deviceType === 'mobile' || ev.device?.deviceType === 'tablet'
                            ? 'bg-sky-500/15 text-sky-500'
                            : 'bg-primary/15 text-primary'
                        }`}
                      >
                        <DeviceCategoryIcon type={ev.device?.deviceType} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">{ev.userName}</span>
                          <Badge variant="outline" className="text-[10px] rounded-full">
                            {getRoleLabelForUser(ev.userId)}
                          </Badge>
                          {ev.providerLabel && (
                            <Badge variant="secondary" className="text-[10px] rounded-md">
                              {ev.providerLabel}
                            </Badge>
                          )}
                        </div>
                        {ev.userEmail && (
                          <p className="text-xs text-muted-foreground break-all">{ev.userEmail}</p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {ev.device ? (
                            <>
                              <Badge
                                variant="outline"
                                className="rounded-lg border-primary/25 bg-primary/[0.06] text-[11px] font-medium text-foreground"
                              >
                                {ev.device.deviceLabel}
                                {ev.device.os ? ` · ${ev.device.os}` : ''}
                              </Badge>
                              <Badge variant="outline" className="rounded-lg text-[11px]">
                                {ev.device.browser}
                              </Badge>
                              {ev.device.isPwa && (
                                <Badge className="rounded-lg bg-primary/15 text-primary hover:bg-primary/20 border-primary/30 text-[10px]">
                                  PWA Uygulama
                                </Badge>
                              )}
                              {ev.device.screen && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {ev.device.screen}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">{ev.details}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 border-t sm:border-t-0 border-border/40 pt-2 sm:pt-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          rel.isOnlineNow
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : rel.isToday
                              ? 'bg-primary/12 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {rel.isOnlineNow && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {rel.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatExactDateTime(ev.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredEvents.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Aramanızla eşleşen giriş kaydı bulunamadı.
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
