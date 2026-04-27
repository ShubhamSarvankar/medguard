import { useMutation } from "@tanstack/react-query";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  browserLocalPersistence,
  setPersistence,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/auth";
import { useAuthStore } from "./authStore";

export interface LoginCredentials {
  email: string;
  password: string;
  totpCode?: string | undefined;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  displayName: string;
}

export interface MfaChallenge {
  resolver: MultiFactorResolver;
}

export function useLogin() {
  const { setUser } = useAuthStore();

  return useMutation<User, Error & { mfaResolver?: MultiFactorResolver }, LoginCredentials>({
    mutationFn: async ({ email, password, totpCode }) => {
      await setPersistence(auth, browserLocalPersistence);

      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return credential.user;
      } catch (err: unknown) {
        const firebaseError = err as { code?: string; customData?: { resolver?: MultiFactorResolver } };

        if (firebaseError.code === "auth/multi-factor-required") {
          const resolver = firebaseError.customData?.resolver;
          if (resolver && totpCode) {
            const multiFactorAssertion = TotpMultiFactorGenerator.assertionForSignIn(
              resolver.hints[0]?.uid ?? "",
              totpCode
            );
            const result = await resolver.resolveSignIn(multiFactorAssertion);
            setUser(result.user);
            return result.user;
          }
          const mfaError = Object.assign(new Error("MFA required"), { mfaResolver: resolver });
          throw mfaError;
        }

        throw err instanceof Error ? err : new Error("Login failed");
      }
    },
    onSuccess: (user) => {
      setUser(user);
    },
  });
}

export function useRegister() {
  const { setUser } = useAuthStore();

  return useMutation<User, Error, RegisterCredentials>({
    mutationFn: async ({ email, password, displayName }) => {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      return credential.user;
    },
    onSuccess: (user) => {
      setUser(user);
    },
  });
}

export function useLogout() {
  const { clearUser } = useAuthStore();

  return useMutation<void, Error, void>({
    mutationFn: () => signOut(auth),
    onSuccess: () => {
      clearUser();
    },
  });
}

export function useCurrentUser() {
  return useAuthStore((state) => state.user);
}

export function useIsAuthenticated() {
  return useAuthStore((state) => state.user !== null);
}

export function useAuthInitialized() {
  return useAuthStore((state) => state.isInitialized);
}