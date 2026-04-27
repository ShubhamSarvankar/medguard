import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { useAuthStore } from "../authStore";
import type { User } from "firebase/auth";

const fakeUser = { uid: "uid-123", email: "test@example.com" } as unknown as User;

function renderWithRouter(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/records"
          element={
            <ProtectedRoute>
              <div>Protected content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<div>Auth page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isInitialized: false });
  });

  it("renders nothing while auth is not initialized", () => {
    useAuthStore.setState({ user: null, isInitialized: false });
    renderWithRouter("/records");
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("Auth page")).not.toBeInTheDocument();
  });

  it("redirects to /auth when initialized and no user", () => {
    useAuthStore.setState({ user: null, isInitialized: true });
    renderWithRouter("/records");
    expect(screen.getByText("Auth page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when user is authenticated", () => {
    useAuthStore.setState({ user: fakeUser, isInitialized: true });
    renderWithRouter("/records");
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});