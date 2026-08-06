/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import {
  Power, Pause, Play, AlertTriangle, Zap, ShieldCheck, Clock,
  Wallet, RefreshCw, CheckCircle, XCircle, Ban, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import automationRepository, {
  DEFAULT_FEATURES,
  type AutomationSettings
} from '@/features/automation/data/automationRepository';

const AdminAutomationControl = () => {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'ai' | 'scrape' | 'content' | 'notify' | 'seo' | 'system'>('all');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await automationRepository.getSettings();
      setSettings(data);
      setPauseReason(data.pausedReason || '');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Load failed: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleGlobalToggle = async () => {
    if (!settings) return;
    const newEnabled = !settings.globalEnabled;
    setSaving(true);
    try {
      if (newEnabled) {
        await automationRepository.resumeAll('Resumed from admin panel');
        toast.success('✅ Saara automation ON — ab se credits use honge');
      } else {
        const reason = pauseReason.trim() || 'Manual hold — credit low / salary tak';
        await automationRepository.setGlobalEnabled(false, reason);
        toast.success(`⏸️ Saara automation PAUSED — ${reason}`);
      }
      await fetchSettings();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyHold = async () => {
    const reason = pauseReason.trim() || 'Credit khatam / minus me — next salary tak hold';
    if (!confirm(`🚨 Emergency HOLD? Saare automations turant band ho jayenge.\n\nReason: ${reason}\n\nContinue?`)) return;
    setSaving(true);
    try {
      await automationRepository.emergencyHold(reason);
      toast.success('🚨 Emergency HOLD lag gaya — sab automation paused');
      await fetchSettings();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleResumeAll = async () => {
    if (!confirm('✅ Saara automation wapas ON karna hai? Sab features enable ho jayenge.')) return;
    setSaving(true);
    try {
      await automationRepository.resumeAll('Manual resume from control panel');
      toast.success('✅ All automations resumed!');
      await fetchSettings();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFeatureToggle = async (key: string) => {
    if (!settings) return;
    const currentVal = settings.features[key];
    const isEnabled = typeof currentVal === 'boolean' ? currentVal : (currentVal as { enabled?: boolean })?.enabled ?? true;
    const newVal = !isEnabled;

    // Optimistic update
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        features: { ...prev.features, [key]: newVal }
      };
    });

    try {
      await automationRepository.setFeatureEnabled(key, newVal);
      toast.success(`${DEFAULT_FEATURES[key]?.icon || ''} ${DEFAULT_FEATURES[key]?.label || key} → ${newVal ? 'ON' : 'OFF'}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Failed: ' + msg);
      await fetchSettings();
    }
  };

  const handleSetAllFeatures = async (enabled: boolean) => {
    if (!confirm(`Sab features ko ${enabled ? 'ON' : 'OFF'} karna hai?`)) return;
    setSaving(true);
    try {
      await automationRepository.setAllFeatures(enabled);
      toast.success(`Sab features ${enabled ? 'ON' : 'OFF'}`);
      await fetchSettings();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="py-20 flex flex-col items-center justify-center bg-white rounded-[2rem] border">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="font-black text-xs uppercase tracking-widest text-blue-600">Loading Automation Control...</p>
      </div>
    );
  }

  const isGlobalPaused = !settings.globalEnabled || settings.emergencyPause;
  const enabledCount = Object.values(settings.features).filter(v => typeof v === 'boolean' ? v : (v as { enabled?: boolean })?.enabled ?? true).length;
  const totalCount = Object.keys(settings.features).length;
  const categories = ['all', 'ai', 'scrape', 'content', 'notify', 'seo', 'system'] as const;

  const filteredFeatures = Object.entries(DEFAULT_FEATURES).filter(([, meta]) => {
    if (filterCategory === 'all') return true;
    return meta.category === filterCategory;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* Header + Global Switch */}
      <div className={`rounded-[2rem] p-6 md:p-8 border-2 shadow-xl ${isGlobalPaused ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200' : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'}`}>
        <div className="flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${isGlobalPaused ? 'bg-red-500 text-white' : 'bg-green-600 text-white'}`}>
                <Power className="w-6 h-6" />
              </div>
              Automation Control Center
            </h2>
            <p className="text-sm font-bold text-gray-600 mt-2">
              {isGlobalPaused ? '⏸️ Sab automation paused — credit bach raha hai' : '✅ Automation active — credits use ho rahe hain'}
            </p>
            <div className="flex items-center gap-3 mt-3 text-xs font-bold">
              <span className="bg-white px-3 py-1 rounded-full border">
                {enabledCount}/{totalCount} features ON
              </span>
              <span className={`px-3 py-1 rounded-full ${isGlobalPaused ? 'bg-red-500 text-white' : 'bg-green-600 text-white'}`}>
                {isGlobalPaused ? 'PAUSED' : 'RUNNING'}
              </span>
              {settings.pausedAt && (
                <span className="text-gray-400">Paused: {new Date(settings.pausedAt).toLocaleString('en-IN')}</span>
              )}
            </div>
            {settings.pausedReason && (
              <p className="mt-2 text-sm bg-white/70 border px-3 py-2 rounded-xl">
                📝 Reason: <span className="font-black">{settings.pausedReason}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 w-full md:w-auto">
            {/* Global ON/OFF */}
            <button
              onClick={handleGlobalToggle}
              disabled={saving}
              className={`w-full md:w-64 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${isGlobalPaused ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : isGlobalPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              {isGlobalPaused ? 'RESUME ALL' : 'PAUSE ALL'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleEmergencyHold}
                disabled={saving || isGlobalPaused}
                className="py-2.5 px-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" /> Emergency Hold
              </button>
              <button
                onClick={handleResumeAll}
                disabled={saving || !isGlobalPaused}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Resume All
              </button>
            </div>
          </div>
        </div>

        {/* Pause Reason Input */}
        <div className="mt-6 bg-white rounded-2xl border p-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
            <Wallet size={12} /> Pause Reason (Credit low / Salary tak hold)
          </label>
          <div className="flex gap-2 mt-2">
            <input
              value={pauseReason}
              onChange={e => setPauseReason(e.target.value)}
              placeholder="e.g. Gemini credits khatam, minus me ja raha, next salary 1st ko aayegi — tab tak hold"
              className="flex-1 p-3 border-2 rounded-xl text-sm font-bold focus:border-orange-400 outline-none"
            />
            <button
              onClick={async () => {
                if (!pauseReason.trim()) return toast.error('Reason likho');
                await automationRepository.updateSettings({ pausedReason: pauseReason } as unknown as Partial<import('@/features/automation/data/automationRepository').AutomationSettings>);
                toast.success('Reason saved');
                fetchSettings();
              }}
              className="px-5 bg-gray-800 text-white rounded-xl font-black text-xs"
            >
              Save
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">💡 Ye reason logs me dikhega — kyun pause kiya.</p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-2xl p-4 flex gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl h-fit"><Zap className="w-5 h-5 text-blue-600" /></div>
          <div>
            <p className="font-black text-sm">Credits Bachao Mode</p>
            <p className="text-xs text-gray-500 mt-1">Pause All dabate hi sare scheduled Cloud Functions aur GitHub Actions skip ho jayenge — 0 AI calls</p>
          </div>
        </div>
        <div className="bg-white border rounded-2xl p-4 flex gap-3">
          <div className="p-2.5 bg-purple-100 rounded-xl h-fit"><ShieldCheck className="w-5 h-5 text-purple-600" /></div>
          <div>
            <p className="font-black text-sm">Per-Feature Control</p>
            <p className="text-xs text-gray-500 mt-1">Sirf mehenga feature band karo (e.g. Video Maker) baki ON rakho</p>
          </div>
        </div>
        <div className="bg-white border rounded-2xl p-4 flex gap-3">
          <div className="p-2.5 bg-amber-100 rounded-xl h-fit"><Clock className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="font-black text-sm">Salary Tak Hold</p>
            <p className="text-xs text-gray-500 mt-1">Next salary aane tak hold, fir ek click se Resume — koi code change nahi</p>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border w-fit">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${filterCategory === cat ? 'bg-blue-600 text-white shadow' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Global All ON/OFF */}
      <div className="flex gap-2">
        <button onClick={() => handleSetAllFeatures(true)} disabled={saving} className="px-5 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl font-black text-xs hover:bg-green-100 flex items-center gap-2">
          <CheckCircle size={14} /> All Features ON
        </button>
        <button onClick={() => handleSetAllFeatures(false)} disabled={saving} className="px-5 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl font-black text-xs hover:bg-red-100 flex items-center gap-2">
          <Ban size={14} /> All Features OFF
        </button>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-3">
        {filteredFeatures.map(([key, meta]) => {
          const val = settings.features[key];
          const enabled = typeof val === 'boolean' ? val : (val as { enabled?: boolean })?.enabled ?? true;
          return (
            <div
              key={key}
              className={`bg-white border-2 rounded-2xl p-4 flex items-center justify-between gap-3 transition-all ${enabled ? 'border-gray-100 hover:border-green-200 hover:shadow-md' : 'border-red-100 bg-red-50/30'}`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`p-2.5 rounded-xl text-lg shrink-0 ${enabled ? 'bg-green-100' : 'bg-red-100'}`}>
                  {meta.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-sm flex items-center gap-2">
                    {meta.label}
                    {enabled ? <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> : <span className="w-2 h-2 bg-red-500 rounded-full"></span>}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{meta.description}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest mt-1">
                    <span className={`px-2 py-0.5 rounded-full ${meta.category === 'ai' ? 'bg-purple-100 text-purple-600' : meta.category === 'scrape' ? 'bg-blue-100 text-blue-600' : meta.category === 'content' ? 'bg-orange-100 text-orange-600' : meta.category === 'notify' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                      {meta.category}
                    </span>
                    <span className="ml-2 text-gray-300">{key}</span>
                  </p>
                </div>
              </div>

              {/* Toggle */}
              <button
                onClick={() => handleFeatureToggle(key)}
                className={`relative w-14 h-8 rounded-full transition-all shrink-0 flex items-center ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-all flex items-center justify-center ${enabled ? 'translate-x-7' : 'translate-x-1'}`}>
                  {enabled ? <CheckCircle size={12} className="text-green-600" /> : <XCircle size={12} className="text-gray-400" />}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {filteredFeatures.length === 0 && (
        <div className="bg-white border rounded-2xl p-10 text-center">
          <p className="text-gray-400 font-bold text-sm">Is category me koi feature nahi</p>
        </div>
      )}

      {/* Footer Note */}
      <div className="bg-blue-900 text-white rounded-2xl p-5">
        <h4 className="font-black text-sm flex items-center gap-2">🛡️ Kaise kaam karta hai?</h4>
        <ul className="text-xs mt-2 space-y-1.5 text-blue-200 leading-relaxed list-disc pl-4">
          <li><b>Global Pause</b> = Firestore doc `system_settings/automation` me `globalEnabled=false` — sab Cloud Functions aur GitHub Actions pehle ye check karte hain. Skip ho jayega, credit 0 kharch.</li>
          <li><b>Per-feature OFF</b> = Sirf us feature ka kaam band, baki chalu. e.g. Video Maker (mehenga) band karo, Jobs Scraper ON rakho.</li>
          <li><b>Emergency Hold</b> = Credit khatam minus me jane lage toh ek click — `pausedReason` save hoga.</li>
          <li><b>Resume</b> = Ek click se sab wapas ON — koi deploy nahi chahiye.</li>
          <li><b>GitHub Actions</b> me bhi check lag raha hai (check_automation.js) — workflow khud skip ho jayega.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminAutomationControl;
