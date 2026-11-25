import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const ONBOARDING_VERSION = 'v2';

/**
 * Accounts created on or after this timestamp automatically receive the new
 * Welcome + Interactive Guided Platform Tour on their first approved entry.
 * Existing accounts can still launch "Platformu Tanı" anytime from Profile or Support.
 */
export const ONBOARDING_V2_ROLLOUT_ISO = '2026-11-25T00:00:00+03:00';
export const ONBOARDING_V2_ROLLOUT_MS = Date.parse(ONBOARDING_V2_ROLLOUT_ISO);

export type OnboardingStatus = 'not_started' | 'in_progress' | 'skipped' | 'completed';

export type ContextualTipId = 'notes_search' | 'notes_upload' | 'study_pdf' | 'points_xp';

export interface OnboardingState {
  version: string;
  status: OnboardingStatus;
  /** 0-based index into ONBOARDING_STEPS (0..6) */
  currentStep: number;
  completedSteps: string[];
  welcomeSeen: boolean;
  dismissedTips: ContextualTipId[];
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface OnboardingStepConfig {
  id: string;
  stepNumber: number;
  title: string;
  headline: string;
  paragraphs: string[];
  bullets?: string[];
  closingNote?: string;
  route: string;
  desktopTargets: string[];
  mobileTargets: string[];
  /** On mobile (< 768px), opens the real slide-over sidebar drawer to show menu items in-place */
  openMobileDrawer?: boolean;
  /** On mobile (< 768px), indicates target lives inside MobileBottomNav so card never covers bottom nav */
  isMobileBottomNavTarget?: boolean;
  preferredDesktopPlacement?: 'right' | 'bottom' | 'top' | 'left';
  fallbackLocationHint: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStepConfig[] = [
  {
    id: 'dashboard-home',
    stepNumber: 1,
    title: 'Ana Sayfan',
    headline: 'Her şey burada başlıyor!',
    paragraphs: [
      'Ana sayfanda sana özel çalışma istatistiklerini, toplam XP puanını, son eklenen notları, haftalık çalışma bilgilerini ve akademik takvimini görüntüleyebilirsin.',
      'Ayrıca kaldığın yerden devam ederek çalışmalarını sürdürebilirsin.',
    ],
    route: '/',
    desktopTargets: ['[data-tour="dashboard-stats"]', '[data-tour="dashboard-hero"]'],
    mobileTargets: ['[data-tour="dashboard-stats"]', '[data-tour="dashboard-hero"]'],
    preferredDesktopPlacement: 'bottom',
    fallbackLocationHint: 'Ana Sayfa panelinden tüm istatistiklerine ve çalışma özetine ulaşabilirsin.',
  },
  {
    id: 'notes',
    stepNumber: 2,
    title: 'Notlar',
    headline: 'Aradığın ders notlarına buradan ulaşabilirsin.',
    paragraphs: [
      'Notlar bölümünde farklı üniversitelerden ve bölümlerden paylaşılan ders materyallerini keşfedebilirsin.',
      'Notları ders adına, üniversiteye ve ilgili kategorilere göre arayabilir, inceleyebilir ve erişim koşulları dâhilinde indirebilirsin.',
      'Kendi ders notlarını da mevcut yükleme özelliği üzerinden platforma paylaşabilirsin.',
    ],
    route: '/',
    desktopTargets: ['[data-tour="sidebar-nav-notes"]'],
    mobileTargets: ['[data-tour="mobile-nav-notes"]', '[data-tour="sidebar-nav-notes"]'],
    isMobileBottomNavTarget: true,
    preferredDesktopPlacement: 'right',
    fallbackLocationHint: 'Menüdeki Notlar bağlantısından paylaşılan tüm ders notlarına erişebilirsin.',
  },
  {
    id: 'study-studio',
    stepNumber: 3,
    title: 'Çalışma Stüdyosu',
    headline: 'Ders notlarını gerçek bir çalışma materyaline dönüştür!',
    paragraphs: [
      "Çalışma Stüdyosu'na dışarıdan PDF veya desteklenen ders dosyalarını yükleyebilirsin.",
      'Burada kullanıma açık olan yapay zekâ araçlarından yararlanarak:',
    ],
    bullets: [
      'Ayrıntılı ders özetleri oluşturabilir,',
      'Deneme sınavları hazırlayabilir,',
      'Çalışma kartları oluşturabilir,',
      'Videolu ders materyalleri hazırlayabilir,',
      'Kavram haritalarından yararlanabilir,',
      'Sınav çalışmalarını planlayabilirsin.',
    ],
    closingNote:
      'Yüklediğin kaynakları çalışma defterlerinde düzenleyebilir ve çalışmalarını daha sonra sürdürebilirsin.',
    route: '/',
    desktopTargets: ['[data-tour="sidebar-nav-study"]'],
    mobileTargets: ['[data-tour="mobile-nav-study"]', '[data-tour="sidebar-nav-study"]'],
    isMobileBottomNavTarget: true,
    preferredDesktopPlacement: 'right',
    fallbackLocationHint: 'Menüdeki Çalışma Stüdyosu bağlantısından yapay zekâ çalışma araçlarını açabilirsin.',
  },
  {
    id: 'daily-trivia',
    stepNumber: 4,
    title: 'Günlük Bilgi Yarışması',
    headline: 'Bilgini test et, XP kazan!',
    paragraphs: [
      'Her gün yenilenen 15 soruluk genel kültür yarışmasına katılabilirsin.',
      'Doğru cevapların karşılığında XP kazanabilir, 15 sorunun tamamını doğru cevaplayarak özel ödüllere ulaşabilirsin.',
    ],
    route: '/',
    desktopTargets: ['[data-tour="dashboard-trivia"]'],
    mobileTargets: ['[data-tour="dashboard-trivia"]'],
    preferredDesktopPlacement: 'left',
    fallbackLocationHint: 'Ana sayfada yer alan Günlük Bilgi Yarışması kartından yarışmaya katılabilirsin.',
  },
  {
    id: 'points-leaderboard',
    stepNumber: 5,
    title: 'Puanlar ve Liderlik Tablosu',
    headline: 'Emeğinin karşılığını takip et!',
    paragraphs: [
      'Kazandığın XP puanlarını, puan geçmişini ve platformdaki sıralamanı buradan takip edebilirsin.',
      'Liderlik Tablosu sayesinde diğer kullanıcılarla sıralamanı karşılaştırabilirsin.',
    ],
    route: '/',
    desktopTargets: [
      '[data-tour="dashboard-leaderboard"]',
      '[data-tour="header-points"]',
      '[data-tour="sidebar-nav-points"]',
    ],
    mobileTargets: ['[data-tour="dashboard-leaderboard"]', '[data-tour="header-points"]'],
    preferredDesktopPlacement: 'left',
    fallbackLocationHint: 'Üst çubuktaki XP rozetinden veya Ana Sayfadaki Liderlik Tablosu kartından sıralamanı görebilirsin.',
  },
  {
    id: 'messages-announcements',
    stepNumber: 6,
    title: 'Mesajlar ve Duyurular',
    headline: "EconNotes'taki gelişmelerden haberdar ol!",
    paragraphs: [
      'Duyurular bölümünden platformdaki yenilikleri takip edebilir, Mesajlar bölümünden diğer kullanıcılarla iletişim kurabilir ve Destek Merkezi üzerinden yardım alabilirsin.',
    ],
    route: '/',
    desktopTargets: ['[data-tour="sidebar-nav-comms"]', '[data-tour="sidebar-nav-messages"]'],
    mobileTargets: [
      '[data-tour="sidebar-nav-comms"]',
      '[data-tour="mobile-nav-messages"]',
      '[data-tour="header-notifications"]',
    ],
    openMobileDrawer: true,
    preferredDesktopPlacement: 'right',
    fallbackLocationHint: 'Açılır menüden Duyurular, Mesajlar ve Destek Merkezi bölümlerine doğrudan ulaşabilirsin.',
  },
  {
    id: 'profile-account',
    stepNumber: 7,
    title: 'Profil ve Hesap İşlemleri',
    headline: 'Hesabını buradan yönetebilirsin.',
    paragraphs: [
      'Sağ üstte bulunan profil simgesinden profil bilgilerine, hesap ayarlarına ve diğer kullanıcı işlemlerine ulaşabilirsin.',
    ],
    route: '/',
    desktopTargets: ['[data-tour="header-profile"]'],
    mobileTargets: ['[data-tour="header-profile"]'],
    preferredDesktopPlacement: 'bottom',
    fallbackLocationHint: 'Sağ üstteki profil simgesinden profil bilgilerine ve hesap ayarlarına erişebilirsin.',
  },
] as const;

export const CONTEXTUAL_TIPS: Record<
  ContextualTipId,
  { id: ContextualTipId; title: string; message: string }
> = {
  notes_search: {
    id: 'notes_search',
    title: 'Hızlı Arama İpucu',
    message: 'Ders adına göre arama yapabilirsin.',
  },
  notes_upload: {
    id: 'notes_upload',
    title: 'Yükleme İpucu',
    message: 'Ders bilgilerini doğru seçerek notunun daha kolay bulunmasını sağlayabilirsin.',
  },
  study_pdf: {
    id: 'study_pdf',
    title: 'Çalışma Stüdyosu İpucu',
    message: 'PDF dosyanı yükleyerek ayrıntılı ders özeti oluşturabilirsin.',
  },
  points_xp: {
    id: 'points_xp',
    title: 'XP Takibi İpucu',
    message: 'Kazandığın puanları buradan takip edebilirsin.',
  },
};

export const VALID_CONTEXTUAL_TIP_IDS = Object.keys(CONTEXTUAL_TIPS) as ContextualTipId[];

export const TOUR_ACTIVE_EVENT = 'econnotes:tour-state';

export function getOnboardingStorageKey(userId: string): string {
  return `econnotes_onboarding_state_${ONBOARDING_VERSION}_${userId}`;
}

export function getOnboardingAckKey(userId: string): string {
  return `econnotes_onboarding_ack_${ONBOARDING_VERSION}_${userId}`;
}

export function getFirstLoginSessionKey(userId: string): string {
  return `econnotes_first_login_detected_${userId}`;
}

export function createInitialOnboardingState(): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    status: 'not_started',
    currentStep: 0,
    completedSteps: [],
    welcomeSeen: false,
    dismissedTips: [],
    startedAt: null,
    completedAt: null,
    updatedAt: '',
  };
}

export function sanitizeOnboardingState(raw: unknown): OnboardingState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const statusRaw = typeof rec.status === 'string' ? rec.status : 'not_started';
  const status: OnboardingStatus =
    statusRaw === 'not_started' ||
    statusRaw === 'in_progress' ||
    statusRaw === 'skipped' ||
    statusRaw === 'completed'
      ? statusRaw
      : 'not_started';

  const maxStep = Math.max(0, ONBOARDING_STEPS.length - 1);
  const parsedStep =
    typeof rec.currentStep === 'number' && Number.isFinite(rec.currentStep)
      ? Math.max(0, Math.min(maxStep, Math.floor(rec.currentStep)))
      : 0;

  const validStepIds = new Set(ONBOARDING_STEPS.map((s) => s.id));
  const completedSteps = Array.isArray(rec.completedSteps)
    ? [...new Set(rec.completedSteps.filter((id): id is string => typeof id === 'string' && validStepIds.has(id)))]
    : [];

  const dismissedTips = Array.isArray(rec.dismissedTips)
    ? [
        ...new Set(
          rec.dismissedTips.filter(
            (id): id is ContextualTipId =>
              typeof id === 'string' && VALID_CONTEXTUAL_TIP_IDS.includes(id as ContextualTipId),
          ),
        ),
      ]
    : [];

  const version = typeof rec.version === 'string' && rec.version.trim() ? rec.version : ONBOARDING_VERSION;
  const welcomeSeen =
    typeof rec.welcomeSeen === 'boolean'
      ? rec.welcomeSeen
      : status === 'completed' || status === 'skipped' || status === 'in_progress';

  return {
    version,
    status,
    currentStep: parsedStep,
    completedSteps,
    welcomeSeen,
    dismissedTips,
    startedAt: typeof rec.startedAt === 'string' ? rec.startedAt : null,
    completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : null,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : '',
  };
}

export function readLocalOnboardingState(userId: string): OnboardingState | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getOnboardingStorageKey(userId));
    if (!raw) return null;
    return sanitizeOnboardingState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalOnboardingState(userId: string, state: OnboardingState): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(getOnboardingStorageKey(userId), JSON.stringify(state));
    if (state.welcomeSeen || state.status === 'completed' || state.status === 'skipped') {
      window.localStorage.setItem(getOnboardingAckKey(userId), '1');
    }
  } catch {
    // Ignore strict storage errors
  }
}

export function hasVersionedWelcomeAck(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return window.localStorage.getItem(getOnboardingAckKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function markFirstLoginDetected(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.sessionStorage.setItem(getFirstLoginSessionKey(userId), '1');
  } catch {
    // Ignore storage errors
  }
}

export function hasFirstLoginDetected(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return window.sessionStorage.getItem(getFirstLoginSessionKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function clearFirstLoginDetected(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.sessionStorage.removeItem(getFirstLoginSessionKey(userId));
  } catch {
    // Ignore storage errors
  }
}

function parseTimestamp(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Resolves the authoritative onboarding state for a specific authenticated user.
 * Never reads another user's state; chooses the newest valid record across
 * profile.onboarding_state, user.user_metadata.econnotes_onboarding, and per-user localStorage.
 */
export function resolveOnboardingState(
  user: User | null | undefined,
  profile?: { user_id?: string; onboarding_state?: unknown } | null,
): OnboardingState {
  if (!user?.id) return createInitialOnboardingState();

  const candidates: OnboardingState[] = [];

  if (profile && (!profile.user_id || profile.user_id === user.id)) {
    const fromProfile = sanitizeOnboardingState(profile.onboarding_state);
    if (fromProfile && (fromProfile.updatedAt || fromProfile.status !== 'not_started' || fromProfile.welcomeSeen)) {
      candidates.push(fromProfile);
    }
  }

  const fromMeta = sanitizeOnboardingState(
    (user.user_metadata as Record<string, unknown> | undefined)?.econnotes_onboarding,
  );
  if (fromMeta && (fromMeta.updatedAt || fromMeta.status !== 'not_started' || fromMeta.welcomeSeen)) {
    candidates.push(fromMeta);
  }

  const fromLocal = readLocalOnboardingState(user.id);
  if (fromLocal && (fromLocal.updatedAt || fromLocal.status !== 'not_started' || fromLocal.welcomeSeen)) {
    candidates.push(fromLocal);
  }

  if (candidates.length === 0) {
    return createInitialOnboardingState();
  }

  candidates.sort((a, b) => {
    const timeDiff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
    if (timeDiff !== 0) return timeDiff;
    const rank = (s: OnboardingStatus) =>
      s === 'completed' ? 3 : s === 'skipped' ? 2 : s === 'in_progress' ? 1 : 0;
    return rank(b.status) - rank(a.status);
  });

  // Merge dismissedTips union so a dismissed tip never reappears due to stale cache
  const primary = candidates[0];
  const mergedDismissedTips = [
    ...new Set(candidates.flatMap((c) => c.dismissedTips)),
  ] as ContextualTipId[];

  return {
    ...primary,
    dismissedTips: mergedDismissedTips,
  };
}

/**
 * Determines whether a newly registered / first-entry approved user should be routed
 * to the Welcome screen automatically (at most once, never causing redirect loops).
 */
export function shouldAutoRedirectToWelcome(params: {
  user: User | null | undefined;
  profile?: { created_at?: string | null; onboarding_state?: unknown } | null;
  state: OnboardingState;
  isApproved: boolean;
}): boolean {
  const { user, profile, state, isApproved } = params;
  if (!user?.id || !isApproved) return false;
  if (state.welcomeSeen || state.status !== 'not_started') return false;
  if (hasVersionedWelcomeAck(user.id)) return false;

  // Never collide with the returning-user What's New flow when active in this session
  if (typeof window !== 'undefined') {
    try {
      if (window.sessionStorage.getItem(`econnotes_whats_new_pending_whats_new_2026_11_25_${user.id}`) === '1') {
        return false;
      }
    } catch {
      // ignore storage errors
    }
  }

  if (hasFirstLoginDetected(user.id)) return true;

  const createdMs = Math.max(
    parseTimestamp(user.created_at),
    parseTimestamp(profile?.created_at),
  );
  if (createdMs >= ONBOARDING_V2_ROLLOUT_MS) {
    return true;
  }

  return false;
}

/**
 * Persists onboarding state strictly to the signed-in user's account:
 * 1) Versioned per-user localStorage cache (instant, zero redirect loop)
 * 2) Supabase Auth user_metadata (works immediately on live Supabase Auth)
 * 3) profiles.onboarding_state via RPC / direct update (best-effort DB mirror)
 */
export async function persistOnboardingState(
  user: User | null | undefined,
  nextState: OnboardingState,
): Promise<OnboardingState> {
  const stamped: OnboardingState = {
    ...nextState,
    version: ONBOARDING_VERSION,
    updatedAt: new Date().toISOString(),
  };

  if (!user?.id) return stamped;

  writeLocalOnboardingState(user.id, stamped);
  clearFirstLoginDetected(user.id);

  // Sync to Supabase user_metadata & profiles in parallel (non-blocking resilient persistence)
  await Promise.allSettled([
    supabase.auth.updateUser({
      data: {
        econnotes_onboarding: stamped,
      },
    }),
    (supabase.rpc as any)('save_my_onboarding_state', { _state: stamped }).then(
      async ({ error }: { error?: unknown }) => {
        if (error) {
          // Graceful fallback if RPC migration isn't deployed yet
          await supabase
            .from('profiles')
            .update({ onboarding_state: stamped } as any)
            .eq('user_id', user.id);
        }
      },
    ),
  ]);

  return stamped;
}

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface TourCardLayout {
  mode: 'desktop-popover' | 'desktop-centered' | 'mobile-sheet' | 'mobile-above-nav';
  top?: number;
  left?: number;
  width?: number;
  arrowSide?: 'left' | 'right' | 'top' | 'bottom' | 'none';
}

/**
 * Pure positioning calculator for the Guided Tour explanation card on Desktop and Mobile.
 * Guarantees zero off-screen clipping, zero overlap with MobileBottomNav when bottom nav items
 * are highlighted, and respects Dynamic Island / Safe Area insets.
 */
export function computeTourCardLayout(params: {
  targetRect: TargetRect | null;
  viewportWidth: number;
  viewportHeight: number;
  cardWidth?: number;
  estimatedCardHeight?: number;
  preferredDesktopPlacement?: 'right' | 'bottom' | 'top' | 'left';
  isMobileBottomNavTarget?: boolean;
  safeTop?: number;
  safeBottom?: number;
}): TourCardLayout {
  const {
    targetRect,
    viewportWidth,
    viewportHeight,
    cardWidth = 392,
    estimatedCardHeight = 310,
    preferredDesktopPlacement = 'bottom',
    isMobileBottomNavTarget = false,
    safeTop = 16,
    safeBottom = 16,
  } = params;

  const isMobile = viewportWidth < 768;

  if (isMobile) {
    if (isMobileBottomNavTarget && targetRect) {
      return {
        mode: 'mobile-above-nav',
        arrowSide: 'bottom',
      };
    }
    return {
      mode: 'mobile-sheet',
      arrowSide: 'none',
    };
  }

  if (!targetRect) {
    return {
      mode: 'desktop-centered',
      width: Math.min(cardWidth, viewportWidth - 32),
      arrowSide: 'none',
    };
  }

  const margin = 16;
  const gap = 20;
  const actualW = Math.min(cardWidth, viewportWidth - margin * 2);
  const actualH = Math.min(estimatedCardHeight, viewportHeight - safeTop - safeBottom - margin * 2);

  const clampX = (x: number) => Math.max(margin, Math.min(viewportWidth - actualW - margin, x));
  const clampY = (y: number) =>
    Math.max(safeTop + margin, Math.min(viewportHeight - actualH - safeBottom - margin, y));

  const spaceRight = viewportWidth - targetRect.right - margin;
  const spaceLeft = targetRect.left - margin;
  const spaceBottom = viewportHeight - targetRect.bottom - safeBottom - margin;
  const spaceTop = targetRect.top - safeTop - margin;

  const tryPlacement = (
    side: 'right' | 'left' | 'bottom' | 'top',
  ): TourCardLayout | null => {
    if (side === 'right' && spaceRight >= actualW + gap) {
      return {
        mode: 'desktop-popover',
        left: targetRect.right + gap,
        top: clampY(targetRect.top + targetRect.height / 2 - actualH / 2),
        width: actualW,
        arrowSide: 'left',
      };
    }
    if (side === 'left' && spaceLeft >= actualW + gap) {
      return {
        mode: 'desktop-popover',
        left: targetRect.left - actualW - gap,
        top: clampY(targetRect.top + targetRect.height / 2 - actualH / 2),
        width: actualW,
        arrowSide: 'right',
      };
    }
    if (side === 'bottom' && spaceBottom >= actualH + gap) {
      return {
        mode: 'desktop-popover',
        left: clampX(targetRect.left + targetRect.width / 2 - actualW / 2),
        top: targetRect.bottom + gap,
        width: actualW,
        arrowSide: 'top',
      };
    }
    if (side === 'top' && spaceTop >= actualH + gap) {
      return {
        mode: 'desktop-popover',
        left: clampX(targetRect.left + targetRect.width / 2 - actualW / 2),
        top: targetRect.top - actualH - gap,
        width: actualW,
        arrowSide: 'bottom',
      };
    }
    return null;
  };

  const order: Array<'right' | 'left' | 'bottom' | 'top'> = [
    preferredDesktopPlacement,
    'right',
    'bottom',
    'left',
    'top',
  ];

  for (const side of order) {
    const placed = tryPlacement(side);
    if (placed) return placed;
  }

  // Fallback: pick whichever side has most available space, clamped safely inside viewport
  if (spaceBottom >= spaceTop) {
    return {
      mode: 'desktop-popover',
      left: clampX(targetRect.left + targetRect.width / 2 - actualW / 2),
      top: clampY(targetRect.bottom + gap),
      width: actualW,
      arrowSide: 'top',
    };
  }
  return {
    mode: 'desktop-popover',
    left: clampX(targetRect.left + targetRect.width / 2 - actualW / 2),
    top: clampY(targetRect.top - actualH - gap),
    width: actualW,
    arrowSide: 'bottom',
  };
}
