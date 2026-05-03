// src/firebase/config.ts

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
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
export const auth = getAuth(app);      // Login ke liye
export const storage = getStorage(app); // Future mein PDF/Image upload ke liye

export default app;