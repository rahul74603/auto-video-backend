import { db } from '@/firebase/config';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export type SiteSettings = Record<string, unknown>;

const settingsRef = doc(db, 'site_settings', 'global');

export const siteSettingsRepository = {
  async getGlobal(): Promise<SiteSettings | null> {
    const snapshot = await getDoc(settingsRef);
    return snapshot.exists() ? (snapshot.data() as SiteSettings) : null;
  },

  async updateGlobal(settings: SiteSettings): Promise<void> {
    await updateDoc(settingsRef, settings);
  },

  async setGlobal(settings: SiteSettings, merge = true): Promise<void> {
    await setDoc(settingsRef, settings, { merge });
  },
};

export default siteSettingsRepository;
