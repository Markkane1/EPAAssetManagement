import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/services/authService';
import { Loader2 } from 'lucide-react';
import type { AppPageKey } from '@/config/pagePermissions';
import { canAccessPage } from '@/config/pagePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOrgAdmin?: boolean;
  requireSuperAdmin?: boolean;
  allowedRoles?: AppRole[];
  page?: AppPageKey;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireOrgAdmin = false,
  requireSuperAdmin = false,
  allowedRoles,
  page,
}) => {
  const { isAuthenticated, isLoading, isOrgAdmin, role, locationId } = useAuth();
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

  if (!isOrgAdmin && !locationId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-lg text-center space-y-3">
          <h1 className="text-2xl font-semibold text-foreground">Office Assignment Required</h1>
          <p className="text-sm text-muted-foreground">
            Your account is active, but no office is assigned yet. Contact an administrator to assign your office before
            continuing.
          </p>
        </div>
      </div>
    );
  }

  if (page && !canAccessPage({ page, role, isOrgAdmin })) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !isOrgAdmin && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
