import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SiteConfigProvider } from "@/contexts/SiteConfigContext";
import PageGuard from "@/components/PageGuard";
import OfflineBanner from "@/components/OfflineBanner";
import SplashScreen from "@/components/SplashScreen";
import RouteLoader, { prefetchRoutes } from "@/components/RouteLoader";
import ErrorBoundary from "@/components/ErrorBoundary";
import SystemGate from "@/components/SystemGate";

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

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    const shown = sessionStorage.getItem('econotes_splash_shown');
    return !shown;
  });

  const handleSplashFinish = useCallback(() => {
    sessionStorage.setItem('econotes_splash_shown', 'true');
    setShowSplash(false);
    prefetchRoutes();
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
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <OfflineBanner />
              {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
              <BrowserRouter>
                <Suspense fallback={<RouteLoader />}>
                  <SystemGate>
                    <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/notes" element={<PageGuard path="/notes"><Notes /></PageGuard>} />
                    <Route path="/announcements" element={<PageGuard path="/announcements"><Announcements /></PageGuard>} />
                    <Route path="/profile" element={<PageGuard path="/profile"><Profile /></PageGuard>} />
                    <Route path="/messages" element={<PageGuard path="/messages"><Messages /></PageGuard>} />
                    <Route path="/admin" element={<AdminPanel />} />
                    <Route path="/about" element={<PageGuard path="/about"><About /></PageGuard>} />
                    <Route path="/assistant" element={<PageGuard path="/assistant"><AcademicAssistant /></PageGuard>} />
                    <Route path="/study" element={<PageGuard path="/study"><Study /></PageGuard>} />
                    <Route path="/kpss" element={<PageGuard path="/kpss"><Kpss /></PageGuard>} />
                    <Route path="/welcome" element={<Welcome />} />
                    <Route path="/points" element={<PageGuard path="/points"><Points /></PageGuard>} />
                    <Route path="/live-class" element={<PageGuard path="/live-class"><LiveClass /></PageGuard>} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/install" element={<Install />} />
                    <Route path="*" element={<NotFound />} />
                    </Routes>
                  </SystemGate>
                </Suspense>
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
