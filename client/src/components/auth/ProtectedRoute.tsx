import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/services/authService';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOrgAdmin?: boolean;
  requireSuperAdmin?: boolean;
  allowedRoles?: AppRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireOrgAdmin = false,
  requireSuperAdmin = false,
  allowedRoles,
}) => {
  const { isAuthenticated, isLoading, isOrgAdmin, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if ((requireOrgAdmin || requireSuperAdmin) && !isOrgAdmin) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !isOrgAdmin && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
