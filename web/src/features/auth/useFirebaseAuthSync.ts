import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/auth";
import { useAuthStore } from "./authStore";

export function useFirebaseAuthSync(): void {
  const { setUser, clearUser, setInitialized } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        clearUser();
      }
      setInitialized();
    });

    return unsubscribe;
  }, [setUser, clearUser, setInitialized]);
}