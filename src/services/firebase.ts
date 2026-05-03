import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const hasFirebaseConfig = Object.values(config).every(Boolean);

export const firebaseApp = hasFirebaseConfig ? initializeApp(config) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

export async function ensureAnonymousAuth(): Promise<string> {
  if (!auth) {
    throw new Error("Firebase is not configured.");
  }

  if (!auth.currentUser) {
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  }

  return auth.currentUser.uid;
}
