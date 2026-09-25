import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Lazy-Auth regression test:
 * `auth` import se getAuth Turant nahi chalna chahiye (PageSpeed fix) —
 * sirf pehli property-access/function-call pe initialize hona chahiye,
 * aur phir hamesha SAME instance dena chahiye.
 */

const { mockGetAuth, mockInitializeApp } = vi.hoisted(() => ({
  mockGetAuth: vi.fn(),
  mockInitializeApp: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ __fakeDb: true })),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({ __fakeStorage: true })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: mockGetAuth,
}));

// setup.ts globally '@/firebase/config' ko mock karta hai — humein REAL module
// chahiye (lazy-proxy ka hi test hai), isliye is file me unmock:
vi.doUnmock('@/firebase/config');

describe('firebase/config lazy auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockInitializeApp.mockReturnValue({ name: '[DEFAULT]' });
    mockGetAuth.mockImplementation(() => ({
      __fakeAuth: true,
      currentUser: null,
      signOut: () => 'signed-out',
    }));
  });

  it('import pe getAuth NAHI chalta, pehli use pe chalta hai', async () => {
    const mod = await import('@/firebase/config');
    expect(mockGetAuth).not.toHaveBeenCalled(); // 🎯 poora point

    // pehli property-access → init
    void mod.auth.currentUser;
    expect(mockGetAuth).toHaveBeenCalledTimes(1);
  });

  it('same instance har baar deta hai (single init)', async () => {
    const mod = await import('@/firebase/config');
    void mod.auth.currentUser;
    void mod.auth.app;
    expect(mockGetAuth).toHaveBeenCalledTimes(1);
  });

  it('methods real instance pe bind hote hain', async () => {
    const mod = await import('@/firebase/config');
    expect(typeof mod.auth.signOut).toBe('function');
    expect(mod.auth.signOut()).toBe('signed-out');
  });

  it('db/storage pehle se hi available hote hain (untouched behavior)', async () => {
    const mod = await import('@/firebase/config');
    expect((mod.db as unknown as { __fakeDb: boolean }).__fakeDb).toBe(true);
    expect((mod.storage as unknown as { __fakeStorage: boolean }).__fakeStorage).toBe(true);
  });
});
