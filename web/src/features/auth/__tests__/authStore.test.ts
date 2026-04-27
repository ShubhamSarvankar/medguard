import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../authStore";
import type { User } from "firebase/auth";

const fakeUser = {
  uid: "uid-123",
  email: "test@example.com",
  displayName: "Test User",
} as unknown as User;

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isInitialized: false });
  });

  it("starts with null user and uninitialized state", () => {
    const { user, isInitialized } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isInitialized).toBe(false);
  });

  it("setUser stores the authenticated user", () => {
    useAuthStore.getState().setUser(fakeUser);
    expect(useAuthStore.getState().user).toEqual(fakeUser);
  });

  it("clearUser removes the authenticated user", () => {
    useAuthStore.setState({ user: fakeUser });
    useAuthStore.getState().clearUser();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("setInitialized marks auth as resolved", () => {
    useAuthStore.getState().setInitialized();
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it("clearUser does not affect isInitialized", () => {
    useAuthStore.setState({ user: fakeUser, isInitialized: true });
    useAuthStore.getState().clearUser();
    expect(useAuthStore.getState().isInitialized).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
  });
});