/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { db } from '@/firebase/config';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

export const AUTOMATION_COLLECTION = 'system_settings';
export const AUTOMATION_DOC = 'automation';

export interface FeatureFlags {
  [key: string]: boolean | { enabled: boolean; description?: string };
}

export interface AutomationSettings {
  id?: string;
  globalEnabled: boolean; // master switch
  emergencyPause: boolean; // emergency hold for credits low
  pausedReason: string;
  pausedAt?: any;
  updatedAt?: any;
  features: FeatureFlags;
}

// Default features list — matches GitHub workflows + backend jobs
export const DEFAULT_FEATURES: Record<string, { label: string; description: string; icon: string; category: string }> = {
  auto_drafts: { label: 'Auto Drafts (JOBS AI — Daily 8am)', description: 'Roz subah job_drafts/fast_track se AI drafts banana', icon: '🌅', category: 'ai' },
  auto_drafts_repair: { label: 'Auto Repair Loop (Every 10 min)', description: 'Failed drafts ko har 10 min me retry jab tak ready na ho', icon: '🔁', category: 'ai' },
  telegram_drafts: { label: 'Telegram Draft Cards', description: 'Ready-to-Publish pe Telegram approval card', icon: '📲', category: 'notify' },
  govt_jobs: { label: 'Govt Jobs Scraper', description: 'Sarkari jobs auto fetch + notify', icon: '🏛️', category: 'scrape' },
  fast_track: { label: 'Fast Track Updates', description: 'Fast Track results/admits auto update', icon: '⚡', category: 'scrape' },
  auto_blog: { label: 'Auto Blog Writer', description: 'Daily auto blog generation', icon: '📝', category: 'content' },
  auto_stories: { label: 'Auto Web Stories', description: 'Article se auto story banao (noon/night/morning)', icon: '📖', category: 'content' },
  daily_alert: { label: 'Daily Job Alerts', description: 'Roz Telegram/Email job alerts', icon: '🔔', category: 'notify' },
  mock_test: { label: 'Mock Test Generator (AI)', description: 'AI se mock test banana', icon: '📚', category: 'ai' },
  premium_notes: { label: 'Premium Notes Generator', description: 'AI se premium notes (courses/content)', icon: '📓', category: 'ai' },
  pdf_gen: { label: 'PDF Generator', description: 'Auto PDF creation', icon: '📄', category: 'content' },
  video_maker: { label: 'Video Maker (Shorts)', description: 'Auto short videos', icon: '🎥', category: 'content' },
  long_video: { label: 'Long Video Maker', description: 'Long video auto generation', icon: '🎬', category: 'content' },
  google_indexing: { label: 'Google Indexing Auto', description: 'Naye page pe Google/Bing ping', icon: '🔍', category: 'seo' },
  fb_post: { label: 'Facebook Auto Post', description: 'New post pe FB page pe auto share', icon: '👍', category: 'notify' },
  payment_checker: { label: 'Payment Checker', description: 'Payment verification auto', icon: '💳', category: 'system' },
  note_processor: { label: 'Note Processor', description: 'Notes processing workflow', icon: '📝', category: 'content' },
  seo_master: { label: 'SEO Master Agent (6hr + Daily)', description: 'Pure project SEO control, connections guardian, trending', icon: '🚀', category: 'seo' },
  seo_intelligence: { label: 'SEO Intelligence (lifecycle, gaps, recs)', description: 'Job lifecycle, content gaps, CTR recs — never auto-publishes', icon: '🧠', category: 'seo' },
  seo_optimizer: { label: 'SEO Auto Optimizer + Publish Hook', description: 'Content quality optimizer — scheduled runs are dry-run; kill switch stops runner + post-publish hook', icon: '⚙️', category: 'seo' },
  gsc_ingest: { label: 'GSC Search Analytics Ingest (read-only)', description: 'Dated raw Google Search Console data collection — measurement only, never optimizes pages', icon: '📊', category: 'seo' },
};

export const getDefaultSettings = (): AutomationSettings => ({
  globalEnabled: true,
  emergencyPause: false,
  pausedReason: '',
  features: Object.fromEntries(Object.keys(DEFAULT_FEATURES).map(k => [k, true]))
});

export const automationRepository = {
  async getSettings(): Promise<AutomationSettings> {
    const ref = doc(db, AUTOMATION_COLLECTION, AUTOMATION_DOC);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return getDefaultSettings();
    }
    const data = snap.data() as AutomationSettings;
    // Merge defaults for missing features (new features added later)
    const defaults = getDefaultSettings();
    return {
      globalEnabled: data.globalEnabled ?? defaults.globalEnabled,
      emergencyPause: data.emergencyPause ?? false,
      pausedReason: data.pausedReason ?? '',
      pausedAt: data.pausedAt,
      updatedAt: data.updatedAt,
      features: { ...defaults.features, ...(data.features || {}) } as any,
    };
  },

  async updateSettings(patch: Partial<AutomationSettings>): Promise<void> {
    const ref = doc(db, AUTOMATION_COLLECTION, AUTOMATION_DOC);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...getDefaultSettings(),
        ...patch,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    }
  },

  async setGlobalEnabled(enabled: boolean, reason = ''): Promise<void> {
    await this.updateSettings({
      globalEnabled: enabled,
      emergencyPause: !enabled,
      pausedReason: reason,
      pausedAt: !enabled ? new Date().toISOString() : null,
    } as any);
  },

  async setFeatureEnabled(featureKey: string, enabled: boolean): Promise<void> {
    const current = await this.getSettings();
    const newFeatures = { ...current.features, [featureKey]: enabled };
    await this.updateSettings({ features: newFeatures } as any);
  },

  async setAllFeatures(enabled: boolean): Promise<void> {
    const current = await this.getSettings();
    const newFeatures: FeatureFlags = {};
    Object.keys(current.features).forEach(k => {
      newFeatures[k] = enabled;
    });
    await this.updateSettings({ features: newFeatures } as any);
  },

  async emergencyHold(reason: string): Promise<void> {
    await this.updateSettings({
      globalEnabled: false,
      emergencyPause: true,
      pausedReason: reason || 'Credit low / salary tak hold',
      pausedAt: new Date().toISOString(),
    } as any);
  },

  async resumeAll(reason = ''): Promise<void> {
    await this.updateSettings({
      globalEnabled: true,
      emergencyPause: false,
      pausedReason: reason,
      pausedAt: null,
    } as any);
    // Also enable all features
    const settings = await this.getSettings();
    const newFeatures: FeatureFlags = {};
    Object.keys(settings.features).forEach(k => newFeatures[k] = true);
    await this.updateSettings({ features: newFeatures } as any);
  }
};

export default automationRepository;
