// =============================================================
// Global test setup — mocks for Firebase, Vite env, and modules
// =============================================================

import { vi } from 'vitest';

// ------------------------------------------------------------------
// 1. Mock import.meta.env (Vite environment variables)
// ------------------------------------------------------------------
const mockEnv: Record<string, string> = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test-project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:abcdef',
};

vi.stubGlobal('import.meta', { env: mockEnv });

// ------------------------------------------------------------------
// 2. Mock Firebase Firestore functions
// ------------------------------------------------------------------
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-collection'),
  doc: vi.fn((_db: unknown, _path: string, id?: string) => ({
    id: id || 'mock-doc-id',
    path: `mock-path/${id || 'mock-doc-id'}`,
  })),
  getDoc: vi.fn(() =>
    Promise.resolve({
      exists: () => true,
      id: 'mock-doc-id',
      data: () => ({ name: 'Test', createdAt: new Date() }),
    })
  ),
  getDocs: vi.fn(() =>
    Promise.resolve({
      docs: [
        {
          id: 'doc-1',
          data: () => ({ name: 'Item 1', status: 'draft' }),
        },
        {
          id: 'doc-2',
          data: () => ({ name: 'Item 2', status: 'published' }),
        },
      ],
    })
  ),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  query: vi.fn(() => 'mock-query'),
  where: vi.fn(() => 'mock-where'),
  orderBy: vi.fn(() => 'mock-order'),
  limit: vi.fn(() => 'mock-limit'),
  onSnapshot: vi.fn((_query: unknown, callback: (snap: unknown) => void) => {
    callback({
      docs: [
        {
          id: 'snap-1',
          data: () => ({ name: 'Snap Item', status: 'pending' }),
        },
      ],
    });
    return vi.fn(); // unsubscribe
  }),
  serverTimestamp: vi.fn(() => new Date('2026-01-01T00:00:00Z')),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));

// ------------------------------------------------------------------
// 3. Mock Firebase App
// ------------------------------------------------------------------
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
  getApp: vi.fn(() => ({ name: '[DEFAULT]' })),
}));

// ------------------------------------------------------------------
// 4. Mock Firebase Auth
// ------------------------------------------------------------------
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
    onAuthStateChanged: vi.fn(() => vi.fn()),
  })),
  signInWithEmailAndPassword: vi.fn(() =>
    Promise.resolve({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })
  ),
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn(() => vi.fn()),
}));

// ------------------------------------------------------------------
// 5. Mock Firebase Storage
// ------------------------------------------------------------------
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({ bucket: 'mock-bucket' })),
  ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn(() =>
    Promise.resolve({
      ref: { fullPath: 'mock-path/file.pdf' },
    })
  ),
  getDownloadURL: vi.fn(() =>
    Promise.resolve('https://firebasestorage.googleapis.com/mock-url/file.pdf')
  ),
}));

// ------------------------------------------------------------------
// 6. Mock the firebase config module
// ------------------------------------------------------------------
vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

// ------------------------------------------------------------------
// 7. Silence console noise during tests
// ------------------------------------------------------------------
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'info').mockImplementation(() => {});

// ------------------------------------------------------------------
// 8. Mock window.alert / window.confirm
// ------------------------------------------------------------------
vi.stubGlobal('alert', vi.fn());
vi.stubGlobal('confirm', vi.fn(() => true));
