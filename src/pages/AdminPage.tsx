import SEO from '../components/SEO';
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    type User as FirebaseUser,
    GoogleAuthProvider, 
    signInWithPopup 
} from 'firebase/auth';
import {
    BarChart3, BookOpen, FilePenLine, Globe2, IndianRupee,
    LayoutDashboard, MoreHorizontal, Settings2, ShieldCheck, X, Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { useSiteContent } from '../hooks/useSiteContent';

// --- 🛠️ TAB COMPONENTS IMPORT ---
import NotificationsTab from './Admin/Tabs/NotificationsTab';
import OrdersTab from './Admin/Tabs/OrdersTab';
import PremiumTab from './Admin/Tabs/PremiumTab';
import SettingsTab from './Admin/Tabs/SettingsTab';
import SiteSettings from './Admin/Tabs/SiteSettings';
import AdminMockTest from './Admin/Tabs/AdminMockTest';
import AdminHomepageTab from './Admin/Tabs/AdminHomepageTab';
import AdminFoldersTab from './Admin/Tabs/AdminFoldersTab';
import AdminBrowseTab from './Admin/Tabs/AdminBrowseTab';
import AdminStorageTab from './Admin/Tabs/AdminStorageTab';
import AdminJobDrafts from './Admin/Tabs/AdminJobDrafts'; 
import AdminBrowseAIDrafts from './Admin/Tabs/AdminBrowseAIDrafts';
import VideoControlCenter from './Admin/Tabs/VideoControlCenter';
import FastTrackManager from './Admin/Tabs/FastTrackManager'; 
import AdminWebStories from './Admin/Tabs/AdminWebStories';
// 🔥 NEW: Payment Approval Tab Import
import AdminPaymentApproval from './Admin/Tabs/AdminPaymentApproval';
// 🛑 Automation Control Tab
import AdminAutomationControl from './Admin/Tabs/AdminAutomationControl';
import AdminSeoDashboard from './Admin/Tabs/AdminSeoDashboard';
import AdminAutoOptimizer from './Admin/Tabs/AdminAutoOptimizer';
import AdminGrowthLearner from './Admin/Tabs/AdminGrowthLearner';
import AdminSystemStatus from './Admin/Tabs/AdminSystemStatus';

type AdminTab = 'STATUS' | 'BROWSE' | 'FOLDERS' | 'PREMIUM' | 'ORDERS' | 'NOTIFICATIONS' | 'SETTINGS' | 'HOMEPAGE' | 'FAST TRACK' | 'WEB STORIES' | 'CUSTOMIZE' | 'MOCK TEST' | 'STORAGE' | 'JOBS AI' | 'PAYMENTS' | 'AUTOMATION' | 'VIDEO' | 'SEO' | 'OPTIMIZER' | 'GROWTH';

type AdminNavGroup = {
    id: string;
    label: string;
    icon: typeof LayoutDashboard;
    tabs: { id: AdminTab; label: string; help: string }[];
};

// Keep every admin tool reachable, but group related work so the header is not a wall of tabs.
const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: [
        { id: 'STATUS', label: 'System status', help: 'Kaun-sa automatic kaam kab chala aur kis cheez par dhyan dena hai, yahan dekho.' },
    ] },
    { id: 'traffic', label: 'Traffic & SEO', icon: BarChart3, tabs: [
        { id: 'SEO', label: 'Google search & SEO', help: 'Search Console ki report upload karo, Google clicks dekho, aur SEO suggestions ko review karo. Koi page apne-aap publish nahi hota.' },
        { id: 'OPTIMIZER', label: 'Purane BLOG ka preview', help: 'Sirf purane BLOG pages ka read-only preview: ek run mein zyada se zyada 5. Public page edit nahi hota.' },
        { id: 'GROWTH', label: 'Video se kya chal raha hai', help: 'Video ke views/performance ke patterns dekho. Website Google traffic ka report yeh nahi hai.' },
    ] },
    { id: 'content', label: 'Content & Updates', icon: BookOpen, tabs: [
        { id: 'BROWSE', label: 'Published content dekho', help: 'Website par already live content dhoondo aur manage karo.' },
        { id: 'JOBS AI', label: 'Drafts review', help: 'Yahan naye drafts check/edit karo; publish karna hai ya nahi, tum decide karoge.' },
        { id: 'FAST TRACK', label: 'Result / admit-card updates', help: 'Result, admit card, answer key aur exam updates manage karo.' },
        { id: 'WEB STORIES', label: 'Web Stories', help: 'Web Stories banao aur manage karo.' },
        { id: 'MOCK TEST', label: 'Mock tests', help: 'Exam practice tests manage karo.' },
    ] },
    { id: 'revenue', label: 'Payments & Sales', icon: IndianRupee, tabs: [
        { id: 'PAYMENTS', label: 'Payment approvals', help: 'Aaye hue payment requests check/approve karo.' },
        { id: 'PREMIUM', label: 'Premium content', help: 'Premium content aur question sets manage karo.' },
        { id: 'ORDERS', label: 'Orders', help: 'Customers ke orders dekho.' },
    ] },
    { id: 'website', label: 'Website', icon: Globe2, tabs: [
        { id: 'HOMEPAGE', label: 'Homepage', help: 'Homepage ke sections edit karo.' },
        { id: 'FOLDERS', label: 'Folders & categories', help: 'Website content ko folders/categories mein rakho.' },
        { id: 'CUSTOMIZE', label: 'Website ka look', help: 'Website ki appearance aur common settings badlo.' },
        { id: 'STORAGE', label: 'Files & storage', help: 'Uploaded files aur storage dekho.' },
    ] },
    { id: 'system', label: 'System & Tools', icon: Settings2, tabs: [
        { id: 'AUTOMATION', label: 'Automation controls', help: 'Background automations ko pause ya configure karo.' },
        { id: 'VIDEO', label: 'Video tools', help: 'Video banane aur bhejne ke tools manage karo.' },
        { id: 'NOTIFICATIONS', label: 'Notifications', help: 'Website notifications manage karo.' },
        { id: 'SETTINGS', label: 'Admin settings', help: 'General admin settings manage karo.' },
    ] },
];

const AdminPage = () => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
    
    const location = useLocation(); 

    // Start at a deep-linked tab when present; otherwise show the plain-language overview.
    const [activeTab, setActiveTab] = useState<AdminTab>(() => {
        if (typeof window === 'undefined') return 'STATUS';
        const requested = new URLSearchParams(window.location.search).get('tab') as AdminTab | null;
        const valid: AdminTab[] = ['STATUS', 'BROWSE', 'FOLDERS', 'PREMIUM', 'ORDERS', 'NOTIFICATIONS', 'SETTINGS', 'HOMEPAGE', 'FAST TRACK', 'WEB STORIES', 'CUSTOMIZE', 'MOCK TEST', 'STORAGE', 'JOBS AI', 'PAYMENTS', 'AUTOMATION', 'VIDEO', 'SEO', 'OPTIMIZER', 'GROWTH'];
        return requested && valid.includes(requested) ? requested : 'STATUS';
    });
    const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);

    const { content: siteContent, updateContent: updateSiteContent } = useSiteContent();

    // ---  TAB SWITCHING LOGIC (render-time sync, no effect needed) ---
    const [prevLocationState, setPrevLocationState] = useState(location.state);
    if (location.state !== prevLocationState) {
        setPrevLocationState(location.state);
        const requestedTab = (location.state as { activeTab?: AdminTab } | null)?.activeTab;
        if (requestedTab) {
            setActiveTab(requestedTab);
        }
    }

    // 🔗 Deep-link: ?tab=<TabName> URL param se tab auto-switch (render-time sync)
    // (Telegram EDIT button / bookmark se direct kisi tab pe land kar sakte hain)
    const currentUrlSearch = typeof window !== 'undefined' ? window.location.search : '';
    const [prevUrlSearch, setPrevUrlSearch] = useState(currentUrlSearch);
    if (currentUrlSearch !== prevUrlSearch) {
        setPrevUrlSearch(currentUrlSearch);
        const params = new URLSearchParams(currentUrlSearch);
        const urlTab = params.get('tab');
        if (urlTab && (['STATUS', 'BROWSE', 'FOLDERS', 'PREMIUM', 'ORDERS', 'NOTIFICATIONS', 'SETTINGS', 'HOMEPAGE', 'FAST TRACK', 'WEB STORIES', 'CUSTOMIZE', 'MOCK TEST', 'STORAGE', 'JOBS AI', 'PAYMENTS', 'AUTOMATION', 'VIDEO', 'SEO', 'OPTIMIZER', 'GROWTH'] as AdminTab[]).includes(urlTab as AdminTab)) {
            setActiveTab(urlTab as AdminTab);
        }
    }

    const activeGroup = ADMIN_NAV_GROUPS.find(group => group.tabs.some(tab => tab.id === activeTab)) ?? ADMIN_NAV_GROUPS[0];
    const activeTabInfo = activeGroup.tabs.find(tab => tab.id === activeTab) ?? activeGroup.tabs[0];

    // --- 🔐 AUTHENTICATION LOGIC ---
    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch {
            setLoginError("Google Login Failed");
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser && currentUser.email === ADMIN_EMAIL) {
                setUser(currentUser);
            } else {
                signOut(auth);
                setUser(null);
            }
        });
        return () => unsubscribe();
    }, [ADMIN_EMAIL]);

    const handleLogout = async () => { await signOut(auth); };

    // --- 🛑 LOGIN SCREEN ---
    if (!user) return (
        <div className="h-screen flex items-center justify-center bg-gray-100 p-3 md:p-4">
            {/* ✅ NEW SEO COMPONENT FOR LOGIN */}
            <SEO customTitle="Admin Login - StudyGyaan" noIndex={true} noFollow={true} />
            <div className="bg-white p-4 md:p-8 rounded-xl md:rounded-2xl shadow-xl border-t-8 border-blue-600 w-full max-w-md">
                <h2 className="text-lg md:text-2xl font-bold mb-6 text-center text-gray-800">Admin Control Center</h2>
                
                <button 
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl hover:bg-gray-50 transition mb-6 shadow-sm"
                >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                    Secure Google Login
                </button>

                <div className="relative flex items-center gap-2 mb-6">
                    <hr className="flex-1 border-gray-100" />
                    <span className="text-gray-300 text-[10px] font-bold uppercase tracking-widest">Or Internal ID</span>
                    <hr className="flex-1 border-gray-100" />
                </div>

                <form onSubmit={async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, loginEmail, loginPassword); } catch { setLoginError("Invalid Credentials") } }}>
                    <input type="email" placeholder="Admin Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full p-3 border rounded-xl mb-4 outline-none text-sm focus:ring-2 ring-blue-500 transition-all" />
                    <input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-3 border rounded-xl mb-4 outline-none text-sm focus:ring-2 ring-blue-500 transition-all" />
                    {loginError && <p className="text-red-500 text-xs font-bold mb-4 animate-bounce">{loginError}</p>}
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-black text-base shadow-lg transition-all active:scale-95">AUTHORIZED ACCESS ONLY</button>
                </form>
            </div>
        </div>
    );

    // --- 🚀 MAIN DASHBOARD SCREEN ---
    return (
        <section className="pt-2 pb-24 md:py-10 bg-gray-50 min-h-screen">
            {/* ✅ NEW SEO COMPONENT FOR DASHBOARD */}
            <SEO customTitle="Admin Panel - StudyGyaan" noIndex={true} noFollow={true} />
            <div className="max-w-7xl mx-auto px-1.5 md:px-4">
                {/* Clear, grouped navigation: all systems stay reachable without a wall of tiny tabs. */}
                <div className="mb-4 md:mb-6 bg-white p-3 md:p-5 rounded-2xl shadow-sm border space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
                                <ShieldCheck size={23} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-base md:text-xl font-black text-gray-800">StudyGyaan Admin</h2>
                                <p className="text-xs text-gray-500">Mobile: neeche ke buttons use karo. Computer: section upar chuno.</p>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => window.open('/write-blog-secret', '_blank', 'noopener,noreferrer')} className="px-3 py-2 rounded-xl font-bold text-xs bg-orange-50 text-orange-700 border border-orange-100 flex items-center gap-2 hover:bg-orange-100">
                                <FilePenLine size={15} /> <span className="hidden sm:inline">Write a blog</span><span className="sm:hidden">Blog</span>
                            </button>
                            <button onClick={handleLogout} className="px-3 py-2 rounded-xl font-bold text-xs bg-gray-50 text-gray-600 border hover:bg-red-50 hover:text-red-700">Log out</button>
                        </div>
                    </div>

                    <nav aria-label="Admin sections" className="hidden md:grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                        {ADMIN_NAV_GROUPS.map((group) => {
                            const Icon = group.icon;
                            const selected = group.id === activeGroup.id;
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => setActiveTab(group.tabs[0].id)}
                                    aria-current={selected ? 'page' : undefined}
                                    className={`min-h-12 px-3 py-2 rounded-xl border text-left flex items-center gap-2 transition-colors ${selected ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'}`}
                                >
                                    <Icon size={17} className="shrink-0" />
                                    <span className="text-xs md:text-sm font-bold leading-tight">{group.label}</span>
                                </button>
                            );
                        })}
                    </nav>

                    {activeGroup.tabs.length > 1 && (
                        <div className="hidden md:block border-t border-gray-100 pt-3">
                            <div className="flex flex-wrap gap-2" role="tablist" aria-label={`${activeGroup.label} tools`}>
                                {activeGroup.tabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeTab === tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-white hover:border-blue-300'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-gray-600" aria-live="polite">{activeTabInfo.help}</p>
                        </div>
                    )}
                </div>

                {/* 🧩 DYNAMIC TAB CONTENT AREA */}
                <div className="min-h-[60vh]">
                    {activeTab === 'STATUS' && (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 md:p-6">
                                <p className="text-xs font-black uppercase tracking-wide text-blue-700">Start here</p>
                                <h2 className="mt-1 text-lg md:text-xl font-black text-slate-900">Kya karna hai? Neeche se seedha section kholo.</h2>
                                <p className="mt-1 text-sm text-slate-600">Traffic ke liye Search Console & SEO; drafts ko dekhne ke liye AI/job drafts. Public pages bina tumhari review ke auto-publish nahi hote.</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button onClick={() => setActiveTab('SEO')} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">Traffic & SEO kholo</button>
                                    <button onClick={() => setActiveTab('JOBS AI')} className="px-4 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-800 text-sm font-bold hover:bg-blue-100">Drafts review karo</button>
                                    <button onClick={() => setActiveTab('FAST TRACK')} className="px-4 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-800 text-sm font-bold hover:bg-blue-100">Fast Track updates</button>
                                </div>
                            </div>
                            <AdminSystemStatus />
                        </div>
                    )}
                    {activeTab === 'BROWSE' && <AdminBrowseTab />}
                    {activeTab === 'JOBS AI' && (
                        <div className="space-y-4">
                            {/* 📋 Review AI Drafts — PRIMARY workflow: AI-generated full articles review/edit/publish */}
                            <AdminBrowseAIDrafts />
                            {/* 📥 Fetched Job Drafts — auto-fetched jobs (AI queue + review & publish) */}
                            <AdminJobDrafts />
                        </div>
                    )}
                    {activeTab === 'FOLDERS' && <AdminFoldersTab />}
                    {activeTab === 'HOMEPAGE' && <AdminHomepageTab siteContent={siteContent} updateSiteContent={updateSiteContent} />}
                    {activeTab === 'FAST TRACK' && <FastTrackManager />} 
                    {activeTab === 'WEB STORIES' && <AdminWebStories />}
                    {activeTab === 'MOCK TEST' && <AdminMockTest />}
                    {activeTab === 'PREMIUM' && <PremiumTab />}
                    {activeTab === 'ORDERS' && <OrdersTab />}
                    {activeTab === 'NOTIFICATIONS' && <NotificationsTab />}
                    {activeTab === 'SETTINGS' && <SettingsTab />}
                    {activeTab === 'CUSTOMIZE' && <SiteSettings />}
                    {activeTab === 'STORAGE' && <AdminStorageTab />}
                    {/* 🔥 NEW Content for Payments */}
                    {activeTab === 'PAYMENTS' && <AdminPaymentApproval />}
                    {/* 🛑 Automation Control */}
                    {activeTab === 'AUTOMATION' && <AdminAutomationControl />}
                    {/* 🎬 Video Control Center */}
                    {activeTab === 'VIDEO' && <VideoControlCenter />}
                    {activeTab === 'SEO' && <AdminSeoDashboard />}
                    {activeTab === 'OPTIMIZER' && (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5">
                                <h2 className="font-black text-amber-950">Ye sirf preview hai — public blog edit nahi honge.</h2>
                                <p className="mt-1 text-sm text-amber-900">Legacy checker ek run mein adhiktam 5 purane BLOG dekhta hai; Jobs/Fast Track nahi. SEO suggestions ko dekhne aur human review ke liye “Search Console & SEO” tab use karo.</p>
                            </div>
                            <AdminAutoOptimizer />
                        </div>
                    )}
                    {activeTab === 'GROWTH' && (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 md:p-5">
                                <h2 className="font-black text-indigo-950">Video Growth Learning — website SEO se alag.</h2>
                                <p className="mt-1 text-sm text-indigo-900">Ye video views/performance se patterns seekhta hai. Views aur sample data kam hon to “no data” normal hai; isse website search traffic ka direct result na samjhein.</p>
                            </div>
                            <AdminGrowthLearner />
                        </div>
                    )}
                </div>
            </div>

            {isMobileToolsOpen && (
                <div className="md:hidden fixed inset-0 z-[60] flex items-end bg-slate-950/45" onClick={() => setIsMobileToolsOpen(false)}>
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="mobile-admin-tools-title"
                        className="w-full max-h-[82vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
                            <div>
                                <h2 id="mobile-admin-tools-title" className="font-black text-slate-900">Saare Admin tools</h2>
                                <p className="text-xs text-slate-500">Kaam chuno — har naam ke neeche uska use likha hai.</p>
                            </div>
                            <button type="button" aria-label="Tools band karo" onClick={() => setIsMobileToolsOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 space-y-4">
                            {ADMIN_NAV_GROUPS.map((group) => {
                                const Icon = group.icon;
                                return (
                                    <section key={group.id}>
                                        <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
                                            <Icon size={16} className="text-blue-700" /> {group.label}
                                        </h3>
                                        <div className="grid gap-2">
                                            {group.tabs.map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => { setActiveTab(tab.id); setIsMobileToolsOpen(false); }}
                                                    className={`w-full rounded-xl border p-3 text-left ${activeTab === tab.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white active:bg-slate-50'}`}
                                                >
                                                    <span className="block text-sm font-bold text-slate-900">{tab.label}</span>
                                                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{tab.help}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                            <button type="button" onClick={() => { setIsMobileToolsOpen(false); window.open('/write-blog-secret', '_blank', 'noopener,noreferrer'); }} className="w-full rounded-xl border border-orange-200 bg-orange-50 p-3 text-left text-sm font-bold text-orange-800">
                                ✍️ Naya blog likho
                            </button>
                            <button type="button" onClick={() => { setIsMobileToolsOpen(false); void handleLogout(); }} className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm font-bold text-slate-700">
                                Log out
                            </button>
                        </div>
                    </section>
                </div>
            )}

            <nav aria-label="Mobile admin shortcuts" className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-4px_18px_rgba(15,23,42,0.08)] backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="mx-auto grid max-w-xl grid-cols-5">
                    {[
                        { label: 'Home', icon: LayoutDashboard, onClick: () => setActiveTab('STATUS'), selected: activeTab === 'STATUS' },
                        { label: 'Traffic', icon: BarChart3, onClick: () => setActiveTab('SEO'), selected: activeGroup.id === 'traffic' },
                        { label: 'Drafts', icon: BookOpen, onClick: () => setActiveTab('JOBS AI'), selected: activeTab === 'JOBS AI' },
                        { label: 'Updates', icon: Zap, onClick: () => setActiveTab('FAST TRACK'), selected: activeTab === 'FAST TRACK' },
                        { label: 'More', icon: MoreHorizontal, onClick: () => setIsMobileToolsOpen(true), selected: isMobileToolsOpen || !['STATUS', 'SEO', 'OPTIMIZER', 'GROWTH', 'JOBS AI', 'FAST TRACK'].includes(activeTab) },
                    ].map((item) => {
                        const Icon = item.icon;
                        return (
                            <button key={item.label} type="button" onClick={item.onClick} aria-current={item.selected ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 ${item.selected ? 'text-blue-700' : 'text-slate-500'}`}>
                                <Icon size={20} strokeWidth={item.selected ? 2.5 : 2} />
                                <span className="text-[10px] font-bold leading-none">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
            
            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </section>
    );
};

export default AdminPage;
