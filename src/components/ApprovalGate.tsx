import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import WaitingRoomScreen from '@/components/WaitingRoomScreen';

/**
 * Routes that must remain accessible to users who are pending admin approval
 * (e.g. they can contact support or access auth recovery).
 */
const UNAPPROVED_ACCESSIBLE_PATHS = [
  '/support',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

export const ApprovalGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isApproved, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const wasWaitingRef = useRef<{ userId: string | null; waiting: boolean }>({
    userId: null,
    waiting: false,
  });

  useEffect(() => {
    if (loading || !user?.id) {
      if (!user?.id) {
        wasWaitingRef.current = { userId: null, waiting: false };
      }
      return;
    }

    if (wasWaitingRef.current.userId !== user.id) {
      wasWaitingRef.current = { userId: user.id, waiting: !isApproved && !isAdmin };
      return;
    }

    if (wasWaitingRef.current.waiting && isApproved) {
      wasWaitingRef.current = { userId: user.id, waiting: false };
      toast.success('Hesabınız onaylandı!', {
        description: "EconNotes'un tüm özelliklerine erişiminiz açıldı.",
        duration: 6000,
      });
      if (pathname !== '/' && pathname !== '/welcome') {
        navigate('/', { replace: true });
      }
    } else if (!isApproved && !isAdmin) {
      wasWaitingRef.current = { userId: user.id, waiting: true };
    }
  }, [isAdmin, isApproved, loading, navigate, pathname, user?.id]);

  if (loading) {
    return (
      <div className="safe-area-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not signed in: allow public routing
  if (!user) {
    return <>{children}</>;
  }

  // Administrators always bypass
  if (isAdmin) {
    return <>{children}</>;
  }

  // Check if current route is an exception (e.g. Support Center)
  const isAccessiblePath = UNAPPROVED_ACCESSIBLE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isAccessiblePath) {
    return <>{children}</>;
  }

  // If user is pending or not approved, show Waiting Room
  if (!isApproved) {
    return <WaitingRoomScreen />;
  }

  return <>{children}</>;
};

export default ApprovalGate;
