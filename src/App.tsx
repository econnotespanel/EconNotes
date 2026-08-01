import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import OfflineBanner from "@/components/OfflineBanner";
import SplashScreen from "@/components/SplashScreen";
import RouteLoader, { prefetchRoutes } from "@/components/RouteLoader";

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
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <OfflineBanner />
            {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
            <BrowserRouter>
              <Suspense fallback={<RouteLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/announcements" element={<Announcements />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/assistant" element={<AcademicAssistant />} />
                  <Route path="/study" element={<Study />} />
                  <Route path="/kpss" element={<Kpss />} />
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/live-class" element={<LiveClass />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
