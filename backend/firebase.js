import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

let app = null;
let auth = null;
let db = null;

if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
}

export { app, auth, db, hasFirebaseConfig };

export async function signInGuest() {
  if (!auth) {
    throw new Error("Firebase is not configured.");
  }
  return signInAnonymously(auth);
}

export async function signInGoogle() {
  if (!auth) {
    throw new Error("Firebase is not configured.");
  }
  const provider = new GoogleAuthProvider();
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/popup-closed-by-user" ||
      error?.code === "auth/cancelled-popup-request"
    ) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}
