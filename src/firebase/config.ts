// src/firebase/config.ts

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Aapka Configuration Object
const firebaseConfig = {
 apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID};

// App start karna
const app = initializeApp(firebaseConfig);

// Services ko export karna taaki poori app mein use kar sakein
export const db = getFirestore(app);   // Database (Admin Panel ke liye)
export const storage = getStorage(app); // Future mein PDF/Image upload ke liye

/**
 * 🔌 LAZY AUTH (PageSpeed fix):
 * Pehle `getAuth(app)` module-load pe hi chalta tha — homepage khulte hi
 * Firebase Auth iframe (93KB) + getProjectConfig network-call page ke
 * critical path pe aa jata tha (PSI: LCP chain 2.9s).
 * Ab getAuth sirf TAB chalta hai jab pehli baar `auth` ka koi property
 * access/function call ho (login button, onAuthStateChanged, admin panel...).
 * API same rehti hai — saare import-sites untouched.
 */
let authInstance: Auth | null = null;

function ensureAuth(): Auth {
    if (!authInstance) authInstance = getAuth(app);
    return authInstance;
}

export const auth: Auth = new Proxy({} as Auth, {
    get(_target, prop) {
        const real = ensureAuth() as unknown as Record<string | symbol, unknown>;
        const value = real[prop];
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
    },
});

export default app;
