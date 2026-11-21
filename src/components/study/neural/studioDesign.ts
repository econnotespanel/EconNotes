/**
 * EconNotes Çalışma Stüdyosu — Ortak Tasarım Sistemi (Design Tokens)
 *
 * Tüm üç panel (Kaynaklar, Çalışma Alanı, Yapay Zekâ Araçları) ve araç çubukları
 * için tek tip köşe yuvarlaklığı, buton yüksekliği, kenarlık kalınlığı, ikon boyutu
 * ve EconNotes mavi marka hiyerarşisini (#003791 / #0055b8 / #0070d1) tanımlar.
 */

export const STUDIO_PANEL_SHELL =
  'flex h-full min-h-[540px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm xl:h-[calc(100vh-10.75rem)] xl:min-h-[600px]';

export const STUDIO_PANEL_HEADER =
  'flex h-14 shrink-0 items-center justify-between gap-2.5 border-b border-border/70 bg-card px-4';

export const STUDIO_PANEL_HEADER_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary';

export const STUDIO_PANEL_BODY =
  'min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3.5';

export const STUDIO_PANEL_FOOTER =
  'shrink-0 border-t border-border/70 bg-muted/20 px-3.5 py-2.5';

export const STUDIO_BTN_PRIMARY =
  'h-9 rounded-xl border border-transparent bg-[#003791] px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#002a70] disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BTN_SECONDARY =
  'h-9 rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/45 hover:bg-primary/[0.04] hover:text-primary disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BTN_GHOST =
  'h-9 rounded-xl border border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BTN_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-border/70 hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_CARD_SUBTLE =
  'rounded-xl border border-border/75 bg-background/80 transition-colors';

export const STUDIO_CARD_ACTIVE =
  'rounded-xl border border-primary/35 bg-primary/[0.04] transition-colors';

export const STUDIO_TOOL_TILE =
  'group flex min-w-0 w-full flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-background/90 p-3 text-left transition-all duration-150 hover:border-primary/50 hover:bg-primary/[0.04] hover:shadow-sm disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_TOOL_TILE_PRIMARY =
  'group flex min-w-0 w-full flex-col justify-between overflow-hidden rounded-xl border border-primary/35 bg-primary/[0.06] p-3 text-left transition-all duration-150 hover:border-primary/65 hover:bg-primary/[0.10] hover:shadow-sm disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BADGE_COURSE =
  'inline-flex max-w-full items-center gap-1 rounded-lg border border-primary/25 bg-primary/[0.08] px-2 py-0.5 text-[11px] font-semibold text-primary';

export const STUDIO_BADGE_WARN =
  'inline-flex max-w-full items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300';

export const STUDIO_SEGMENTED_WRAP =
  'inline-flex items-center gap-1 rounded-xl border border-border/75 bg-muted/40 p-1';

export const STUDIO_SEGMENTED_ITEM_ACTIVE =
  'rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold text-primary shadow-sm ring-1 ring-border/70';

export const STUDIO_SEGMENTED_ITEM_IDLE =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground';
