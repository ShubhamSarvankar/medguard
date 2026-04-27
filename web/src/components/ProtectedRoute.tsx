import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/features/auth/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const location = useLocation();

  // Avoid redirecting before Firebase Auth has resolved its initial state.
  // Shows nothing during that window rather than flashing the auth page.
  if (!isInitialized) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}