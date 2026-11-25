import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  GraduationCap,
  Home,
  Info,
  ListOrdered,
  MessageSquare,
  Trophy,
  UserCircle2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import {
  computeTourCardLayout,
  ONBOARDING_STEPS,
  type OnboardingStepConfig,
  type TargetRect,
} from '@/lib/onboarding';
import { cn } from '@/lib/utils';

const STEP_ICONS: Record<string, typeof Home> = {
  'dashboard-home': Home,
  notes: FileText,
  'study-studio': GraduationCap,
  'daily-trivia': Trophy,
  'points-leaderboard': ListOrdered,
  'messages-announcements': MessageSquare,
  'profile-account': UserCircle2,
};

function isFixedOrStickyElement(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    const pos = window.getComputedStyle(current).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
    current = current.parentElement;
  }
  return false;
}

function isElementRenderable(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  const opacityVal = style.opacity === '' ? 1 : Number.parseFloat(style.opacity);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    (Number.isFinite(opacityVal) && opacityVal === 0)
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width < 6 || rect.height < 6) return false;
  // Ensure hidden off-canvas mobile sidebar (translated off-screen) is not treated as visible
  if (rect.right <= 4 || rect.left >= window.innerWidth - 4) return false;
  return true;
}

function findVisibleTargetElement(
  step: OnboardingStepConfig,
  isMobile: boolean,
): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const selectors = isMobile ? step.mobileTargets : step.desktopTargets;
  for (const selector of selectors) {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    for (const el of Array.from(candidates)) {
      if (isElementRenderable(el)) {
        return el;
      }
    }
  }
  return null;
}

function buildSpotlightPath(
  vw: number,
  vh: number,
  rect: TargetRect | null,
  pad = 8,
  radius = 18,
): string {
  const outer = `M 0 0 H ${vw} V ${vh} H 0 Z`;
  if (!rect) return outer;

  const x = Math.max(4, rect.left - pad);
  const y = Math.max(4, rect.top - pad);
  const w = Math.min(vw - x - 4, rect.width + pad * 2);
  const h = Math.min(vh - y - 4, rect.height + pad * 2);
  if (w <= 4 || h <= 4) return outer;

  const r = Math.min(radius, w / 2, h / 2);
  return [
    outer,
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

export const GuidedPlatformTour = () => {
  const {
    phase,
    isTourOpen,
    activeStepIndex,
    activeStep,
    totalSteps,
    nextStep,
    prevStep,
    pauseTour,
    skipTour,
    completeTour,
  } = useOnboarding();
  const { config } = useSiteConfig();
  const location = useLocation();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const cardRef = useRef<HTMLDivElement>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [cardMeasuredHeight, setCardMeasuredHeight] = useState(310);

  const isMobile = viewport.width < 768;

  const measureCurrentTarget = useCallback(
    (shouldScroll = false) => {
      if (!isTourOpen || phase !== 'tour') {
        setTargetRect(null);
        activeElementRef.current = null;
        return;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport({ width: vw, height: vh });
      const mobileNow = vw < 768;

      const el = findVisibleTargetElement(activeStep, mobileNow);
      if (!el) {
        setTargetRect(null);
        activeElementRef.current = null;
        return;
      }

      activeElementRef.current = el;

      if (shouldScroll && !isFixedOrStickyElement(el)) {
        const rawRect = el.getBoundingClientRect();
        const headerOffset = mobileNow ? 78 : 92;
        if (mobileNow) {
          // Scroll target cleanly into the upper visible viewport above the mobile bottom sheet
          const desiredTop = headerOffset + 12;
          const targetAbsTop = rawRect.top + window.scrollY;
          const nextScrollY = Math.max(0, targetAbsTop - desiredTop);
          if (Math.abs(rawRect.top - desiredTop) > 28) {
            window.scrollTo({ top: nextScrollY, behavior: 'smooth' });
          }
        } else {
          const outOfView = rawRect.top < headerOffset || rawRect.bottom > vh - 48;
          if (outOfView) {
            const desiredTop = Math.max(headerOffset, Math.round((vh - rawRect.height) / 2));
            const targetAbsTop = rawRect.top + window.scrollY;
            window.scrollTo({
              top: Math.max(0, targetAbsTop - desiredTop),
              behavior: 'smooth',
            });
          }
        }
      }

      const rect = el.getBoundingClientRect();
      // Verify the element actually overlaps the visible viewport before drawing a spotlight
      const visibleInViewport =
        rect.width >= 6 &&
        rect.height >= 6 &&
        rect.bottom > 4 &&
        rect.top < vh - 4 &&
        rect.right > 4 &&
        rect.left < vw - 4;

      if (!visibleInViewport) {
        setTargetRect(null);
        return;
      }

      setTargetRect({
        top: Math.max(4, rect.top),
        left: Math.max(4, rect.left),
        width: Math.min(vw - 8, rect.width),
        height: Math.min(vh - 8, rect.height),
        right: Math.min(vw - 4, rect.right),
        bottom: Math.min(vh - 4, rect.bottom),
      });
    },
    [activeStep, isTourOpen, phase],
  );

  // Sync mobile slide-over drawer strictly for steps that showcase drawer items (e.g., Step 6)
  useEffect(() => {
    if (!isTourOpen) return;
    if (phase !== 'tour') {
      window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
      return;
    }

    if (isMobile && activeStep.openMobileDrawer) {
      window.dispatchEvent(new CustomEvent('econnotes:open-sidebar'));
    } else if (isMobile) {
      window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
    }
  }, [activeStep.openMobileDrawer, isMobile, isTourOpen, phase]);

  // Measure target immediately on step change and re-check across smooth scroll / drawer animation frames
  useEffect(() => {
    if (!isTourOpen || phase !== 'tour') {
      setTargetRect(null);
      return;
    }

    measureCurrentTarget(true);
    const timers = [80, 180, 320, 460, 650].map((ms) =>
      window.setTimeout(() => measureCurrentTarget(false), ms),
    );

    let rafId = 0;
    const scheduleMeasure = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => measureCurrentTarget(false));
    };

    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('orientationchange', scheduleMeasure, { passive: true });
    window.addEventListener('scroll', scheduleMeasure, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', scheduleMeasure);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleMeasure);
      if (activeElementRef.current) {
        resizeObserver.observe(activeElementRef.current);
      }
      if (document.body) {
        resizeObserver.observe(document.body);
      }
    }

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();
    };
  }, [activeStepIndex, isTourOpen, location.pathname, measureCurrentTarget, phase]);

  // Measure actual card height so desktop clamping never clips off-screen
  useLayoutEffect(() => {
    if (!isTourOpen || !cardRef.current) return;
    const h = cardRef.current.getBoundingClientRect().height;
    if (h > 80) {
      setCardMeasuredHeight(Math.round(h));
    }
  }, [activeStepIndex, isTourOpen, phase, viewport.width]);

  // Move keyboard focus smoothly into the active dialog card when opening or changing step
  useEffect(() => {
    if (!isTourOpen) return;
    const t = window.setTimeout(() => {
      cardRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [activeStepIndex, isTourOpen, phase]);

  // Keyboard navigation: Esc closes/pauses, ArrowRight advances, ArrowLeft goes back
  useEffect(() => {
    if (!isTourOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTextInput) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (phase === 'completed') {
          completeTour();
        } else {
          pauseTour();
        }
      } else if (e.key === 'ArrowRight' && phase === 'tour') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        if (phase === 'completed' || activeStepIndex > 0) {
          e.preventDefault();
          prevStep();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeStepIndex, completeTour, isTourOpen, nextStep, pauseTour, phase, prevStep]);

  const cardLayout = useMemo(
    () =>
      computeTourCardLayout({
        targetRect,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        cardWidth: 404,
        estimatedCardHeight: cardMeasuredHeight,
        preferredDesktopPlacement: activeStep.preferredDesktopPlacement,
        isMobileBottomNavTarget: Boolean(activeStep.isMobileBottomNavTarget),
        safeTop: isMobile ? 64 : 24,
        safeBottom: isMobile ? 20 : 20,
      }),
    [
      activeStep.isMobileBottomNavTarget,
      activeStep.preferredDesktopPlacement,
      cardMeasuredHeight,
      isMobile,
      targetRect,
      viewport.height,
      viewport.width,
    ],
  );

  if (!isTourOpen) return null;

  const progressPercent =
    phase === 'completed' ? 100 : Math.round(((activeStepIndex + 1) / totalSteps) * 100);
  const StepIcon = STEP_ICONS[activeStep.id] ?? Compass;

  // Completion card view
  if (phase === 'completed') {
    return (
      <div
        className="fixed inset-0 z-[95] flex items-center justify-center bg-[#040d21]/65 p-4 backdrop-blur-[4px] animate-fade-in"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-complete-title"
          aria-describedby="tour-complete-desc"
          tabIndex={-1}
          className="relative w-full max-w-xl overflow-hidden rounded-[26px] border border-slate-200/90 bg-card shadow-[0_24px_70px_-14px_rgba(4,13,33,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700/80"
        >
          <div
            className={cn(
              'relative overflow-hidden px-6 pt-7 pb-6 text-white sm:px-8',
              isNovember10
                ? 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800'
                : 'bg-gradient-to-br from-[#06183d] via-[#0b2a6e] to-[#174ec4]',
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold text-blue-100">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                <span>Tur Tamamlandı • {totalSteps}/{totalSteps}</span>
              </span>
              <button
                type="button"
                aria-label="Kapat"
                onClick={completeTour}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/85 transition-colors hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white shadow-sm">
              <BookOpen className="h-6 w-6" />
            </div>

            <h2
              id="tour-complete-title"
              className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-[26px]"
            >
              Artık EconNotes&apos;u keşfetmeye hazırsın!
            </h2>
            <p
              id="tour-complete-desc"
              className="mt-2 text-sm leading-relaxed text-blue-100/95 sm:text-[15px]"
            >
              Eğitim yolculuğunda ihtiyaç duyacağın araçlar artık elinin altında. İyi çalışmalar!
            </p>
          </div>

          <div className="space-y-4 p-6 sm:px-8 sm:py-6">
            <div
              role="progressbar"
              aria-label="Platform turu ilerlemesi"
              aria-valuenow={100}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800"
            >
              <div className="h-full w-full rounded-full bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#3b82f6]" />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                className="order-2 h-11 w-full justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold sm:order-1"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Son Adıma Dön</span>
              </Button>
              <Button
                type="button"
                onClick={completeTour}
                className={cn(
                  'order-1 h-11 w-full justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold text-white shadow-[0_12px_26px_-8px_rgba(23,78,196,0.55)] transition-all hover:brightness-105 active:scale-[0.99] sm:order-2',
                  isNovember10
                    ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb]',
                )}
              >
                <span className="whitespace-nowrap">EconNotes&apos;u Keşfetmeye Başla</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const spotlightPad = activeStep.isMobileBottomNavTarget && isMobile ? 6 : 8;
  const spotlightRadius =
    activeStep.id === 'profile-account'
      ? 999
      : activeStep.isMobileBottomNavTarget && isMobile
        ? 22
        : 20;

  const spotlightPath = buildSpotlightPath(
    viewport.width,
    viewport.height,
    targetRect,
    spotlightPad,
    Math.min(spotlightRadius, 28),
  );

  const cardInner = (
    <>
      {/* Mobile drag indicator pill */}
      {isMobile && cardLayout.mode === 'mobile-sheet' && (
        <div className="mb-2.5 flex justify-center" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>
      )}

      {/* Top row: step badge + progress + close/pause */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
              isNovember10
                ? 'bg-zinc-900 dark:bg-zinc-200 dark:text-zinc-950'
                : 'bg-gradient-to-br from-[#0b2a6e] to-[#2563eb]',
            )}
          >
            <StepIcon className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-primary">
              Adım {activeStep.stepNumber} / {totalSteps}
            </p>
            <h2
              id="guided-tour-title"
              className="truncate text-sm font-extrabold tracking-tight text-foreground sm:text-[15px]"
            >
              {activeStep.title}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={pauseTour}
          aria-label="Turu duraklat ve kapat"
          title="Kapat (daha sonra devam edebilirsin)"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label="Platform turu ilerleme durumu"
          aria-valuenow={activeStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/85 dark:bg-slate-800"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300 ease-out',
              isNovember10
                ? 'bg-zinc-900 dark:bg-zinc-200'
                : 'bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#3b82f6]',
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
          %{progressPercent}
        </span>
      </div>

      {/* Step Content */}
      <div id="guided-tour-description" className="mt-3.5 space-y-2.5">
        <p className="text-[15px] font-bold leading-snug text-foreground sm:text-base">
          {activeStep.headline}
        </p>

        {activeStep.paragraphs.map((paragraph, i) => (
          <p
            key={i}
            className="text-[13px] leading-relaxed text-muted-foreground sm:text-[13.5px]"
          >
            {paragraph}
          </p>
        ))}

        {activeStep.bullets && activeStep.bullets.length > 0 && (
          <ul className="grid grid-cols-1 gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:grid-cols-2">
            {activeStep.bullets.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-xs font-medium leading-snug text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {activeStep.closingNote && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {activeStep.closingNote}
          </p>
        )}

        {/* Honest fallback indicator when target element is not currently rendered/visible */}
        {!targetRect && (
          <div className="flex items-start gap-2 rounded-2xl border border-blue-200/80 bg-blue-50/75 px-3 py-2 text-xs text-[#0b2a6e] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{activeStep.fallbackLocationHint}</span>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/75 pt-3.5 dark:border-slate-800/80">
        <button
          type="button"
          onClick={skipTour}
          className="inline-flex h-10 items-center rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Turu Atla
        </button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={activeStepIndex === 0}
            className="h-10 sm:h-10 min-h-[40px] rounded-full px-4 text-xs font-semibold"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Geri</span>
          </Button>
          <Button
            type="button"
            onClick={nextStep}
            className={cn(
              'h-10 sm:h-10 min-h-[40px] gap-1 rounded-full px-5 text-xs font-bold text-white shadow-[0_8px_20px_-6px_rgba(23,78,196,0.55)] transition-all hover:brightness-105 active:scale-[0.98]',
              isNovember10
                ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                : 'bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb]',
            )}
          >
            <span>{activeStepIndex === totalSteps - 1 ? 'Turu Tamamla' : 'İleri'}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[90] pointer-events-none"
      data-testid="guided-tour-overlay"
      data-tour-step={activeStep.id}
    >
      {/* Dimmed backdrop with smooth evenodd cutout around the real target component */}
      <svg
        aria-hidden="true"
        width={viewport.width}
        height={viewport.height}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        className="fixed inset-0 h-full w-full pointer-events-auto"
      >
        <path
          d={spotlightPath}
          fillRule="evenodd"
          className="fill-[#040d21]/55 dark:fill-[#020614]/72 transition-all duration-200"
        />
      </svg>

      {/* Crisp animated spotlight ring anchored to real DOM target */}
      {targetRect && (
        <div
          aria-hidden="true"
          data-testid="guided-tour-spotlight"
          className={cn(
            'pointer-events-none fixed z-[91] border-2 transition-all duration-200 ease-out',
            isNovember10
              ? 'border-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]'
              : 'border-[#3b82f6] shadow-[0_0_0_4px_rgba(59,130,246,0.28),0_0_28px_rgba(37,99,235,0.35)]',
          )}
          style={{
            top: Math.max(4, targetRect.top - spotlightPad),
            left: Math.max(4, targetRect.left - spotlightPad),
            width: Math.min(viewport.width - 8, targetRect.width + spotlightPad * 2),
            height: Math.min(viewport.height - 8, targetRect.height + spotlightPad * 2),
            borderRadius:
              activeStep.id === 'profile-account'
                ? '9999px'
                : `${Math.min(spotlightRadius, 24)}px`,
          }}
        />
      )}

      {/* Explanation Card: Adaptive Desktop Popover vs Mobile Bottom Sheet / Above-Nav Floating Card */}
      {cardLayout.mode === 'mobile-sheet' ? (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-title"
          aria-describedby="guided-tour-description"
          tabIndex={-1}
          data-testid="guided-tour-card"
          data-layout-mode="mobile-sheet"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[95] max-h-[54dvh] overflow-y-auto overscroll-contain rounded-t-[26px] border-t border-x border-slate-200/90 bg-card px-4 pt-3 shadow-[0_-18px_48px_rgba(4,13,33,0.34)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700/90"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
            paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
        >
          {cardInner}
        </div>
      ) : cardLayout.mode === 'mobile-above-nav' ? (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-title"
          aria-describedby="guided-tour-description"
          tabIndex={-1}
          data-testid="guided-tour-card"
          data-layout-mode="mobile-above-nav"
          className="pointer-events-auto fixed inset-x-3 z-[95] mx-auto max-w-md overflow-y-auto overscroll-contain rounded-[24px] border border-slate-200/90 bg-card p-4 shadow-[0_18px_50px_-10px_rgba(4,13,33,0.42)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700/90"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
            maxHeight:
              'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 164px)',
          }}
        >
          {cardInner}
        </div>
      ) : cardLayout.mode === 'desktop-centered' ? (
        <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guided-tour-title"
            aria-describedby="guided-tour-description"
            tabIndex={-1}
            data-testid="guided-tour-card"
            data-layout-mode="desktop-centered"
            className="pointer-events-auto w-full max-w-[420px] max-h-[82dvh] overflow-y-auto rounded-[24px] border border-slate-200/90 bg-card p-5 shadow-[0_24px_64px_-12px_rgba(4,13,33,0.38)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700/90"
          >
            {cardInner}
          </div>
        </div>
      ) : (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-title"
          aria-describedby="guided-tour-description"
          tabIndex={-1}
          data-testid="guided-tour-card"
          data-layout-mode="desktop-popover"
          className="pointer-events-auto fixed z-[95] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] border border-slate-200/90 bg-card p-5 shadow-[0_24px_64px_-12px_rgba(4,13,33,0.38)] transition-[top,left] duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700/90"
          style={{
            top: cardLayout.top,
            left: cardLayout.left,
            width: cardLayout.width,
          }}
        >
          {cardInner}
        </div>
      )}
    </div>
  );
};

export default GuidedPlatformTour;
