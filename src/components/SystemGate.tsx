import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import WelcomeBackCelebration from '@/components/WelcomeBackCelebration';

/**
 * Maintenance gate for EconNotes platform.
 * While active, visitors are shielded with the official Status & Incident Control Screen.
 * Administrators retain full access via /login and /admin routes.
 */
const IS_MAINTENANCE_ACTIVE = false;

// Paths that stay open so administrators can sign in and manage
const ADMIN_ACCESSIBLE_PATHS = ['/login', '/admin'];

const SystemGate = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAuth();
  const { pathname } = useLocation();

  // While checking auth state, wait briefly to know if the user is an admin
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Administrators have full access everywhere
  if (isAdmin) {
    return (
      <>
        <WelcomeBackCelebration />
        {children}
      </>
    );
  }

  // Allow admin login page so administrators can authenticate
  if (ADMIN_ACCESSIBLE_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // While maintenance is active, show the incident control screen for all non-admin visitors
  if (IS_MAINTENANCE_ACTIVE) {
    return <MaintenanceScreen />;
  }

  // Once maintenance is deactivated, all users have access
  return (
    <>
      <WelcomeBackCelebration />
      {children}
    </>
  );
};

export default SystemGate;
