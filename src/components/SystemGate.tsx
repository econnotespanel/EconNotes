import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import FatalErrorScreen from '@/components/FatalErrorScreen';

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
 * - Administrators retain full, unrestricted access across all routes in standard maintenance.
 * - Login and admin authentication routes stay open so administrators can sign in.
 * - Visitors and students are shielded with the official Maintenance / Closure Screen.
 * - If closureMode is 'fatal_error', public routes display the crimson 500 FatalErrorScreen.
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

  // 1. Administrative routes always accessible
  if (ADMIN_ACCESSIBLE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <>{children}</>;
  }

  // 2. When system is closed/in maintenance:
  if (systemOpen === false) {
    if (!isAdmin || closureMode === 'fatal_error') {
      if (closureMode === 'fatal_error') {
        return (
          <FatalErrorScreen
            errorCode="ECON-FATAL-500"
            application="ECONNOTES-WEB"
            status="SERVICE_UNAVAILABLE"
            request="ACCESS_BLOCKED_FOR_MAINTENANCE"
            title={closureTitle}
            message={closureMessage}
          />
        );
      }
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
  }

  // 3. Administrators have access during normal maintenance on other routes
  if (isAdmin) {
    return <>{children}</>;
  }

  // 4. System is open
  return <>{children}</>;
};

export default SystemGate;
