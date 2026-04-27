import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function createFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp(firebaseConfig);
}

export const firebaseApp = createFirebaseApp();

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

// In emulator mode, use memory-only cache to prevent Firestore's IndexedDB
// offline persistence from serving stale results across test runs. Each page
// load starts with a clean cache and fetches directly from the emulator.
export const db = useEmulators
  ? initializeFirestore(firebaseApp, { localCache: memoryLocalCache() })
  : getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const fns = getFunctions(firebaseApp);

if (useEmulators) {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFunctionsEmulator(fns, "localhost", 5001);
}

// App Check is skipped entirely in emulator mode and when the reCAPTCHA key
// is absent — both are expected during local development and testing.
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;

if (!useEmulators && recaptchaKey) {
  if (appCheckDebugToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(recaptchaKey),
    isTokenAutoRefreshEnabled: true,
  });
}