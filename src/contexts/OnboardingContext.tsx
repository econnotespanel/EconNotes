import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  createInitialOnboardingState,
  ONBOARDING_STEPS,
  ONBOARDING_VERSION,
  persistOnboardingState,
  resolveOnboardingState,
  shouldAutoRedirectToWelcome,
  TOUR_ACTIVE_EVENT,
  type ContextualTipId,
  type OnboardingState,
  type OnboardingStepConfig,
} from '@/lib/onboarding';

export type TourPhase = 'idle' | 'tour' | 'completed';

interface OnboardingContextValue {
  state: OnboardingState;
  phase: TourPhase;
  isTourOpen: boolean;
  activeStepIndex: number;
  activeStep: OnboardingStepConfig;
  totalSteps: number;
  canResumeTour: boolean;
  shouldShowWelcomeAuto: boolean;
  startTour: (options?: { fromBeginning?: boolean; stepIndex?: number }) => void;
  resumeTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (stepIndex: number) => void;
  pauseTour: () => void;
  skipTour: () => void;
  completeTour: () => void;
  dismissWelcome: () => void;
  isTipVisible: (tipId: ContextualTipId) => boolean;
  dismissTip: (tipId: ContextualTipId) => void;
  resetTips: () => void;
}

const defaultValue: OnboardingContextValue = {
  state: createInitialOnboardingState(),
  phase: 'idle',
  isTourOpen: false,
  activeStepIndex: 0,
  activeStep: ONBOARDING_STEPS[0],
  totalSteps: ONBOARDING_STEPS.length,
  canResumeTour: false,
  shouldShowWelcomeAuto: false,
  startTour: () => {},
  resumeTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  goToStep: () => {},
  pauseTour: () => {},
  skipTour: () => {},
  completeTour: () => {},
  dismissWelcome: () => {},
  isTipVisible: () => false,
  dismissTip: () => {},
  resetTips: () => {},
};

const OnboardingContext = createContext<OnboardingContextValue>(defaultValue);

export const useOnboarding = () => useContext(OnboardingContext);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isApproved, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<OnboardingState>(() => createInitialOnboardingState());
  const [phase, setPhase] = useState<TourPhase>('idle');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const lastHydratedUserIdRef = useRef<string | null>(null);

  // Hydrate strictly per-user onboarding state whenever user or profile changes
  useEffect(() => {
    if (!user?.id) {
      lastHydratedUserIdRef.current = null;
      setState(createInitialOnboardingState());
      setPhase('idle');
      setActiveStepIndex(0);
      return;
    }

    const resolved = resolveOnboardingState(user, profile);
    setState(resolved);

    // Reset open tour overlay only when switching users
    if (lastHydratedUserIdRef.current !== user.id) {
      lastHydratedUserIdRef.current = user.id;
      setPhase('idle');
      setActiveStepIndex(resolved.currentStep);
    }
  }, [user, profile]);

  const isTourOpen = phase === 'tour' || phase === 'completed';

  // Broadcast tour active status so competing popups stay cleanly suppressed
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.econnotesTourActive = isTourOpen ? 'true' : 'false';
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TOUR_ACTIVE_EVENT, { detail: { active: isTourOpen } }));
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.econnotesTourActive = 'false';
      }
    };
  }, [isTourOpen]);

  const commitState = useCallback(
    (updater: (prev: OnboardingState) => OnboardingState) => {
      setState((prev) => {
        const next: OnboardingState = {
          ...updater(prev),
          version: ONBOARDING_VERSION,
          updatedAt: new Date().toISOString(),
        };
        if (user) {
          void persistOnboardingState(user, next);
        }
        return next;
      });
    },
    [user],
  );

  const ensureRouteForStep = useCallback(
    (stepIndex: number) => {
      const targetStep = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];
      if (location.pathname !== targetStep.route) {
        navigate(targetStep.route);
      }
    },
    [location.pathname, navigate],
  );

  const startTour = useCallback(
    (options?: { fromBeginning?: boolean; stepIndex?: number }) => {
      const targetIndex =
        typeof options?.stepIndex === 'number'
          ? Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, options.stepIndex))
          : options?.fromBeginning
            ? 0
            : state.status === 'in_progress'
              ? state.currentStep
              : 0;

      const nowIso = new Date().toISOString();
      setActiveStepIndex(targetIndex);
      setPhase('tour');

      commitState((prev) => ({
        ...prev,
        status: 'in_progress',
        currentStep: targetIndex,
        welcomeSeen: true,
        startedAt: prev.startedAt || nowIso,
        completedSteps: options?.fromBeginning ? [] : prev.completedSteps,
      }));

      ensureRouteForStep(targetIndex);
    },
    [commitState, ensureRouteForStep, state.currentStep, state.status],
  );

  const resumeTour = useCallback(() => {
    const resumeIdx = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, state.currentStep));
    startTour({ stepIndex: resumeIdx });
  }, [startTour, state.currentStep]);

  const goToStep = useCallback(
    (stepIndex: number) => {
      const clamped = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, stepIndex));
      setActiveStepIndex(clamped);
      setPhase('tour');
      commitState((prev) => ({
        ...prev,
        status: prev.status === 'completed' ? 'completed' : 'in_progress',
        currentStep: clamped,
        welcomeSeen: true,
      }));
      ensureRouteForStep(clamped);
    },
    [commitState, ensureRouteForStep],
  );

  const nextStep = useCallback(() => {
    const currentConfig = ONBOARDING_STEPS[activeStepIndex];
    if (activeStepIndex >= ONBOARDING_STEPS.length - 1) {
      // Close mobile drawer if open before showing completion screen
      window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
      setPhase('completed');
      commitState((prev) => ({
        ...prev,
        welcomeSeen: true,
        currentStep: ONBOARDING_STEPS.length - 1,
        completedSteps: currentConfig
          ? [...new Set([...prev.completedSteps, currentConfig.id])]
          : prev.completedSteps,
      }));
      return;
    }

    const nextIdx = activeStepIndex + 1;
    setActiveStepIndex(nextIdx);
    setPhase('tour');
    commitState((prev) => ({
      ...prev,
      status: prev.status === 'completed' ? 'completed' : 'in_progress',
      currentStep: nextIdx,
      welcomeSeen: true,
      completedSteps: currentConfig
        ? [...new Set([...prev.completedSteps, currentConfig.id])]
        : prev.completedSteps,
    }));
    ensureRouteForStep(nextIdx);
  }, [activeStepIndex, commitState, ensureRouteForStep]);

  const prevStep = useCallback(() => {
    if (phase === 'completed') {
      const lastIdx = ONBOARDING_STEPS.length - 1;
      setActiveStepIndex(lastIdx);
      setPhase('tour');
      ensureRouteForStep(lastIdx);
      return;
    }
    if (activeStepIndex <= 0) return;
    const prevIdx = activeStepIndex - 1;
    setActiveStepIndex(prevIdx);
    commitState((prev) => ({
      ...prev,
      currentStep: prevIdx,
      welcomeSeen: true,
    }));
    ensureRouteForStep(prevIdx);
  }, [activeStepIndex, commitState, ensureRouteForStep, phase]);

  const pauseTour = useCallback(() => {
    window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
    setPhase('idle');
    commitState((prev) => ({
      ...prev,
      status: prev.status === 'completed' ? 'completed' : 'in_progress',
      currentStep: activeStepIndex,
      welcomeSeen: true,
    }));
  }, [activeStepIndex, commitState]);

  const skipTour = useCallback(() => {
    window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
    setPhase('idle');
    commitState((prev) => ({
      ...prev,
      status: prev.status === 'completed' ? 'completed' : 'skipped',
      currentStep: activeStepIndex,
      welcomeSeen: true,
    }));
  }, [activeStepIndex, commitState]);

  const completeTour = useCallback(() => {
    window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
    setPhase('idle');
    const allStepIds = ONBOARDING_STEPS.map((s) => s.id);
    const nowIso = new Date().toISOString();
    commitState((prev) => ({
      ...prev,
      status: 'completed',
      currentStep: ONBOARDING_STEPS.length - 1,
      completedSteps: allStepIds,
      welcomeSeen: true,
      completedAt: nowIso,
    }));
    if (location.pathname !== '/') {
      navigate('/');
    }
  }, [commitState, location.pathname, navigate]);

  const dismissWelcome = useCallback(() => {
    setPhase('idle');
    commitState((prev) => ({
      ...prev,
      status: prev.status === 'completed' ? 'completed' : 'skipped',
      welcomeSeen: true,
    }));
    navigate('/', { replace: true });
  }, [commitState, navigate]);

  const dismissTip = useCallback(
    (tipId: ContextualTipId) => {
      commitState((prev) => ({
        ...prev,
        dismissedTips: prev.dismissedTips.includes(tipId)
          ? prev.dismissedTips
          : [...prev.dismissedTips, tipId],
      }));
    },
    [commitState],
  );

  const resetTips = useCallback(() => {
    commitState((prev) => ({
      ...prev,
      dismissedTips: [],
    }));
  }, [commitState]);

  const isTipVisible = useCallback(
    (tipId: ContextualTipId) => {
      if (!user?.id || !isApproved || authLoading) return false;
      if (isTourOpen) return false;
      // Show subtle contextual tips only after initial welcome/tour onboarding has been experienced or skipped
      if (!state.welcomeSeen && state.status === 'not_started') return false;
      return !state.dismissedTips.includes(tipId);
    },
    [authLoading, isApproved, isTourOpen, state.dismissedTips, state.status, state.welcomeSeen, user?.id],
  );

  const canResumeTour = useMemo(() => {
    if (state.status === 'completed') return false;
    return state.status === 'in_progress' || (state.status === 'skipped' && state.currentStep > 0);
  }, [state.currentStep, state.status]);

  const shouldShowWelcomeAuto = useMemo(
    () =>
      !authLoading &&
      shouldAutoRedirectToWelcome({
        user,
        profile,
        state,
        isApproved,
      }),
    [authLoading, isApproved, profile, state, user],
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      phase,
      isTourOpen,
      activeStepIndex,
      activeStep: ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0],
      totalSteps: ONBOARDING_STEPS.length,
      canResumeTour,
      shouldShowWelcomeAuto,
      startTour,
      resumeTour,
      nextStep,
      prevStep,
      goToStep,
      pauseTour,
      skipTour,
      completeTour,
      dismissWelcome,
      isTipVisible,
      dismissTip,
      resetTips,
    }),
    [
      activeStepIndex,
      canResumeTour,
      completeTour,
      dismissTip,
      dismissWelcome,
      goToStep,
      isTipVisible,
      isTourOpen,
      nextStep,
      pauseTour,
      phase,
      prevStep,
      resetTips,
      resumeTour,
      shouldShowWelcomeAuto,
      skipTour,
      startTour,
      state,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};
