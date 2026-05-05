import { Suspense, lazy, useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import OfflineBanner from "@/components/OfflineBanner";
import SplashScreen from "@/components/SplashScreen";
import RouteLoader from "@/components/RouteLoader";

const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    const shown = sessionStorage.getItem('econotes_splash_shown');
    return !shown;
  });

  const handleSplashFinish = useCallback(() => {
    sessionStorage.setItem('econotes_splash_shown', 'true');
    setShowSplash(false);
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
