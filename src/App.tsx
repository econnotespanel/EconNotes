import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { registerQueryClientClearer } from "@/lib/sessionCleanup";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import GuidedPlatformTour from "@/components/onboarding/GuidedPlatformTour";
import ForcePasswordChange from "@/components/ForcePasswordChange";
import { MfaGate } from "@/components/TwoFactor";
import AdminMessageListener from "@/components/AdminMessageListener";
import ContentNotificationListener from "@/components/ContentNotificationListener";
import SupportNotificationListener from "@/components/SupportNotificationListener";
import MobileHomeScreenPrompt from "@/components/MobileHomeScreenPrompt";
import UserPenaltyMonitor from "@/components/UserPenaltyMonitor";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SiteConfigProvider } from "@/contexts/SiteConfigContext";
import PageGuard from "@/components/PageGuard";
import OfflineBanner from "@/components/OfflineBanner";
import SplashScreen from "@/components/SplashScreen";
import RouteLoader, { prefetchRoutes } from "@/components/RouteLoader";
import ErrorBoundary from "@/components/ErrorBoundary";
import SystemGate from "@/components/SystemGate";
import ApprovalGate from "@/components/ApprovalGate";
import BirthDatePromptModal from "@/components/BirthDatePromptModal";
import DailyWelcomePosterModal from "@/components/DailyWelcomePosterModal";
import IosPwaTopBarFix from "@/components/IosPwaTopBarFix";
import ScrollToTop from "@/components/ScrollToTop";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Notes = lazy(() => import("./pages/Notes"));
const Announcements = lazy(() => import("./pages/Announcements"));
const Profile = lazy(() => import("./pages/Profile"));
const Messages = lazy(() => import("./pages/Messages"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const About = lazy(() => import("./pages/About"));
const AcademicAssistant = lazy(() => import("./pages/AcademicAssistant"));
const LiveClass = lazy(() => import("./pages/LiveClass"));
const Install = lazy(() => import("./pages/Install"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Study = lazy(() => import("./pages/Study"));
const Kpss = lazy(() => import("./pages/Kpss"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Points = lazy(() => import("./pages/Points"));
const Support = lazy(() => import("./pages/Support"));
const DailyTrivia = lazy(() => import("./pages/DailyTrivia"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 3, retryDelay: (n) => Math.min(30000, 1000 * 2 ** n), networkMode: "offlineFirst", refetchOnReconnect: true },
  },
});

registerQueryClientClearer(() => {
  queryClient.clear();
});

const PasswordChangeGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <>{children}</>;
  // Strictly check server-controlled app_metadata (never client-mutable user_metadata)
  const mustChange = Boolean(user && user.app_metadata?.must_change_password);
  if (mustChange) {
    return <ForcePasswordChange />;
  }
  return <>{children}</>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      const shown = sessionStorage.getItem('econnotes_splash_shown');
      return !shown;
    } catch {
      return false;
    }
  });

  const handleSplashFinish = useCallback(() => {
    try {
      sessionStorage.setItem('econnotes_splash_shown', 'true');
    } catch {
      // ignore storage restrictions
    }
    setShowSplash(false);
  }, []);

  useEffect(() => {
    prefetchRoutes();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ThemeProvider>
          <SiteConfigProvider>
          <AuthProvider>
            <UserPenaltyMonitor />
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <OfflineBanner />
              {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
              <BrowserRouter>
                <OnboardingProvider>
                <IosPwaTopBarFix />
                <ScrollToTop />
                <Suspense fallback={<RouteLoader />}>
                  <SystemGate>
                    <MobileHomeScreenPrompt splashActive={showSplash} />
                    <PasswordChangeGate><MfaGate>
                      <ApprovalGate>
                        <AdminMessageListener />
                        <ContentNotificationListener />
                        <SupportNotificationListener />
                        <BirthDatePromptModal />
                        <DailyWelcomePosterModal />
                        <GuidedPlatformTour />
                        <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/notes" element={<ProtectedRoute><PageGuard path="/notes"><Notes /></PageGuard></ProtectedRoute>} />
                        <Route path="/announcements" element={<ProtectedRoute><PageGuard path="/announcements"><Announcements /></PageGuard></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute><PageGuard path="/profile"><Profile /></PageGuard></ProtectedRoute>} />
                        <Route path="/messages" element={<ProtectedRoute><PageGuard path="/messages"><Messages /></PageGuard></ProtectedRoute>} />
                        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                        <Route path="/about" element={<PageGuard path="/about"><About /></PageGuard>} />
                        <Route path="/assistant" element={<ProtectedRoute><PageGuard path="/assistant"><AcademicAssistant /></PageGuard></ProtectedRoute>} />
                        <Route path="/study" element={<ProtectedRoute><PageGuard path="/study"><Study /></PageGuard></ProtectedRoute>} />
                        <Route path="/kpss" element={<ProtectedRoute><PageGuard path="/kpss"><Kpss /></PageGuard></ProtectedRoute>} />
                        <Route path="/welcome" element={<Welcome />} />
                        <Route path="/points" element={<ProtectedRoute><PageGuard path="/points"><Points /></PageGuard></ProtectedRoute>} />
                        <Route path="/live-class" element={<ProtectedRoute><PageGuard path="/live-class"><LiveClass /></PageGuard></ProtectedRoute>} />
                        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
                        <Route path="/gunluk-yarisma" element={<ProtectedRoute><DailyTrivia /></ProtectedRoute>} />
                        <Route path="/daily-trivia" element={<ProtectedRoute><DailyTrivia /></ProtectedRoute>} />
                        <Route path="/install" element={<Install />} />
                        <Route path="*" element={<NotFound />} />
                        </Routes>
                      </ApprovalGate>
                    </MfaGate></PasswordChangeGate>
                  </SystemGate>
                </Suspense>
                </OnboardingProvider>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
          </SiteConfigProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
