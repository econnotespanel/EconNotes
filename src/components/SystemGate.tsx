import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';

/**
 * Paths that must always remain accessible so administrators can sign in and manage the system.
 */
const ADMIN_ACCESSIBLE_PATHS = [
  '/login',
  '/admin',
  '/forgot-password',
  '/reset-password',
];

/**
 * Global SystemGate for EconNotes platform.
 * When the system is closed/in maintenance:
 * - Administrators retain full, unrestricted access across all routes.
 * - Login and admin authentication routes stay open so administrators can sign in.
 * - Visitors and students are shielded with the official Maintenance / Closure Screen.
 */
const SystemGate = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading: authLoading } = useAuth();
  const { pathname } = useLocation();
  const {
    systemOpen,
    closedUntil,
    closureTitle,
    closureMessage,
    closureImageUrl,
    closureMode,
  } = useSystemStatus();

  // 1. Administrators always have full access to test, verify and manage
  if (isAdmin) {
    return <>{children}</>;
  }

  // 2. Allow administrative authentication routes
  if (ADMIN_ACCESSIBLE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <>{children}</>;
  }

  // 3. When system is in maintenance/closure mode, shield regular users with MaintenanceScreen
  if (systemOpen === false) {
    return (
      <MaintenanceScreen
        closedUntil={closedUntil}
        title={closureTitle}
        message={closureMessage}
        imageUrl={closureImageUrl}
        mode={closureMode}
      />
    );
  }

  // 4. System is open
  return <>{children}</>;
};

export default SystemGate;
