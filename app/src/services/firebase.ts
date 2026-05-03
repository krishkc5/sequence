import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

declare global {
  interface Window {
    SEQUENCE_FIREBASE_CONFIG?: Partial<FirebaseWebConfig>;
  }
}

const envConfig: FirebaseWebConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const runtimeConfig = window.SEQUENCE_FIREBASE_CONFIG ?? {};

const config: FirebaseWebConfig = {
  apiKey: runtimeConfig.apiKey || envConfig.apiKey,
  authDomain: runtimeConfig.authDomain || envConfig.authDomain,
  projectId: runtimeConfig.projectId || envConfig.projectId,
  storageBucket: runtimeConfig.storageBucket || envConfig.storageBucket,
  messagingSenderId: runtimeConfig.messagingSenderId || envConfig.messagingSenderId,
  appId: runtimeConfig.appId || envConfig.appId
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
