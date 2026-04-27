import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useFirebaseAuthSync } from "@/features/auth/useFirebaseAuthSync";
import { useIdleTimer } from "@/features/auth/useIdleTimer";
import { useIsAuthenticated, useAuthInitialized, useLogout } from "@/features/auth/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthPage from "@/features/auth/AuthPage";
import RecordsPage from "@/features/records/RecordsPage";
import RecordDetail from "@/features/records/RecordDetail";
import RecordForm from "@/features/records/RecordForm"
import AuditLogPage from "@/features/audit/AuditLogPage";
import ProfilePage from "@/features/profile/ProfilePage";
import ShareCodeEntry from "@/features/share/ShareCodeEntry";

function AppShell() {
  const isAuthenticated = useIsAuthenticated();
  const isInitialized = useAuthInitialized();
  const logoutMutation = useLogout();
  const navigate = useNavigate();

  useFirebaseAuthSync();

  useIdleTimer(
    () => {
      logoutMutation.mutate(undefined, {
        onSettled: () => navigate("/auth", { replace: true }),
      });
    },
    isInitialized && isAuthenticated
  );

  if (!isInitialized) return null;

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />

      <Route
        path="/records"
        element={
          <ProtectedRoute>
            <RecordsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/records/:recordId"
        element={
          <ProtectedRoute>
            <RecordDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/records/:recordId/edit"
        element={
          <ProtectedRoute>
            <RecordForm />
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <AuditLogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/share/accept"
        element={
          <ProtectedRoute>
            <ShareCodeEntry />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/records" replace />} />
    </Routes>
  );
}

function PlaceholderPage({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">{name} — coming soon</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}