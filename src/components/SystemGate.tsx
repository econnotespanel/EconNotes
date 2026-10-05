import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import ForcePasswordChange from '@/components/ForcePasswordChange';

/** Routes that stay reachable during a closure so admins can sign in. */
const OPEN_PATHS = ['/login', '/admin', '/forgot-password', '/reset-password'];

/** Applies the admin closure to every page and enforces one-time password replacement. */
const SystemGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  const status = useSystemStatus();
  const { pathname } = useLocation();

  if (status.systemOpen === false && !isAdmin && !loading && !OPEN_PATHS.includes(pathname)) {
    return (
      <MaintenanceScreen
        closedUntil={status.closedUntil}
        title={status.closureTitle}
        message={status.closureMessage}
        imageUrl={status.closureImageUrl}
        mode={status.closureMode}
      />
    );
  }

  if (user && (user.app_metadata as any)?.must_change_password && pathname !== '/reset-password') {
    return <ForcePasswordChange />;
  }

  return <>{children}</>;
};

export default SystemGate;
