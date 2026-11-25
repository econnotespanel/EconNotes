/**
 * EconNotes Çalışma Stüdyosu — Ortak Tasarım Sistemi (Design Tokens)
 *
 * Platform geneli EconNotes 2026 tasarım diliyle birebir uyumlu:
 * tek tip köşe yuvarlaklığı (`rounded-[20px]` / `rounded-xl` / `rounded-full`),
 * sabit buton yüksekliği, sade çizgi ikonlar ve EconNotes mavi marka hiyerarşisi.
 */

export const STUDIO_PANEL_SHELL =
  'flex h-full min-h-[500px] w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200/85 dark:border-slate-800/90 bg-card shadow-[var(--panel-shadow)] xl:min-h-0';

export const STUDIO_PANEL_HEADER =
  'flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800/80 bg-card px-3.5';

export const STUDIO_PANEL_HEADER_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-50 text-blue-600 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400';

export const STUDIO_PANEL_BODY =
  'min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3.5';

export const STUDIO_PANEL_FOOTER =
  'shrink-0 border-t border-slate-200/80 dark:border-slate-800/80 bg-muted/25 px-3.5 py-2.5';

export const STUDIO_BTN_PRIMARY =
  'h-9 rounded-full border border-transparent bg-gradient-to-r from-[#174ec4] via-[#1f62e8] to-[#2e78f6] px-4 text-xs font-semibold text-white shadow-[0_6px_16px_-4px_rgba(29,99,237,0.45)] transition-all hover:brightness-105 disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BTN_SECONDARY =
  'h-9 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/45 hover:bg-blue-50/70 hover:text-primary dark:hover:bg-primary/10 dark:hover:text-blue-300 disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BTN_GHOST =
  'h-9 rounded-xl border border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BTN_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-border/70 hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_CARD_SUBTLE =
  'rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-muted/30 transition-colors';

export const STUDIO_CARD_ACTIVE =
  'rounded-2xl border border-primary/35 bg-primary/5 transition-colors';

export const STUDIO_TOOL_TILE =
  'group flex min-w-0 w-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/85 dark:border-slate-800/90 bg-card p-3 text-left transition-all duration-150 hover:border-blue-300/80 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-primary/10 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_TOOL_TILE_PRIMARY =
  'group flex min-w-0 w-full flex-col justify-between overflow-hidden rounded-2xl border border-primary/35 bg-primary/5 p-3 text-left transition-all duration-150 hover:border-primary/65 hover:bg-primary/10 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50';

export const STUDIO_BADGE_COURSE =
  'inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300';

export const STUDIO_BADGE_WARN =
  'inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300';

export const STUDIO_SEGMENTED_WRAP =
  'inline-flex items-center gap-1 rounded-full border border-slate-200/90 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70 p-1';

export const STUDIO_SEGMENTED_ITEM_ACTIVE =
  'whitespace-nowrap rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm';

export const STUDIO_SEGMENTED_ITEM_IDLE =
  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground';
