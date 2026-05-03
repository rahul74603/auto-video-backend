// @ts-nocheck
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    type User as FirebaseUser,
    GoogleAuthProvider, 
    signInWithPopup 
} from 'firebase/auth';
import {
    Briefcase, FilePenLine, Globe, Settings, ShieldCheck, User, Sparkles, Zap, Layers, IndianRupee
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { useSiteContent } from '../hooks/useSiteContent';

// --- 🛠️ TAB COMPONENTS IMPORT ---
import AdminSidebarControl from './Admin/AdminSidebarControl';
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
import FastTrackManager from './Admin/Tabs/FastTrackManager'; 
import AdminWebStories from './Admin/Tabs/AdminWebStories';
// 🔥 NEW: Payment Approval Tab Import
import AdminPaymentApproval from './Admin/Tabs/AdminPaymentApproval';

const AdminPage = () => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
    
    const location = useLocation(); 

    // ✅ Active Tab State (Added 'PAYMENTS')
    const [activeTab, setActiveTab] = useState<'BROWSE' | 'FOLDERS' | 'PREMIUM' | 'ORDERS' | 'NOTIFICATIONS' | 'SETTINGS' | 'HOMEPAGE' | 'FAST TRACK' | 'WEB STORIES' | 'CUSTOMIZE' | 'SIDEBAR' | 'MOCK TEST' | 'STORAGE' | 'JOBS AI' | 'PAYMENTS'>('BROWSE');

    const { content: siteContent, updateContent: updateSiteContent } = useSiteContent();

    // --- 🚀 TAB SWITCHING LOGIC ---
    useEffect(() => {
        if (location.state?.activeTab) {
            setActiveTab(location.state.activeTab);
        }
    }, [location.state]);

    // --- 🔐 AUTHENTICATION LOGIC ---
    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (err: any) {
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

                <form onSubmit={async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, loginEmail, loginPassword); } catch (err: any) { setLoginError("Invalid Credentials") } }}>
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
        <section className="py-2 md:py-10 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto px-1.5 md:px-4">
                {/* 🏷️ TOP HEADER & NAVIGATION */}
                <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-4 md:mb-8 bg-white p-2 md:p-6 rounded-lg md:rounded-2xl shadow-sm border gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h2 className="text-sm md:text-xl font-black text-gray-800 uppercase tracking-tighter">StudyGyaan</h2>
                            <p className="text-[8px] md:text-xs text-gray-400 font-bold uppercase tracking-widest">Admin Control Panel</p>
                        </div>
                    </div>
                    
                    {/* NAVIGATION TABS (Added PAYMENTS) */}
                    <div className="flex flex-wrap gap-1 md:gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scroll-smooth items-center no-scrollbar">
                        {['BROWSE', 'JOBS AI', 'MOCK TEST', 'WEB STORIES', 'HOMEPAGE', 'FAST TRACK', 'PAYMENTS', 'SIDEBAR', 'FOLDERS', 'PREMIUM', 'ORDERS', 'NOTIFICATIONS', 'SETTINGS', 'CUSTOMIZE', 'STORAGE'].map(t => (
                            <button 
                                key={t} 
                                onClick={() => setActiveTab(t as any)} 
                                className={`px-3 py-1.5 md:px-5 md:py-2.5 rounded-md md:rounded-xl font-black text-[9px] md:text-xs whitespace-nowrap shrink-0 transition-all uppercase tracking-tighter ${activeTab === t ? 'bg-blue-600 text-white shadow-xl scale-105' : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-white hover:text-blue-600 hover:shadow-md'}`}
                            >
                                {t === 'JOBS AI' ? <span className="flex items-center gap-1"><Sparkles size={12}/> JOBS AI</span> : 
                                 t === 'FAST TRACK' ? <span className="flex items-center gap-1"><Zap size={12}/> FAST TRACK</span> : 
                                 t === 'WEB STORIES' ? <span className="flex items-center gap-1"><Layers size={12}/> WEB STORIES</span> : 
                                 t === 'PAYMENTS' ? <span className="flex items-center gap-1 text-green-500 group-hover:text-white"><IndianRupee size={12}/> PAYMENTS</span> :
                                 t}
                            </button>
                        ))}
                        
                        <div className="h-6 w-[1px] bg-gray-200 mx-1 hidden md:block"></div>

                        <button onClick={() => window.open('/write-blog-secret', '_blank')} className="px-3 py-1.5 md:px-5 md:py-2.5 rounded-md md:rounded-xl font-black text-[9px] md:text-xs bg-orange-50 text-orange-600 border border-orange-100 shrink-0 whitespace-nowrap flex items-center gap-1 shadow-sm hover:bg-orange-600 hover:text-white transition-all">
                            <FilePenLine size={14} /> BLOG
                        </button>

                        <button onClick={handleLogout} className="px-3 py-1.5 md:px-5 md:py-2.5 rounded-md md:rounded-xl font-black text-[9px] md:text-xs bg-red-50 text-red-600 border border-red-100 shrink-0 whitespace-nowrap hover:bg-red-600 hover:text-white transition-all shadow-sm">LOGOUT</button>
                    </div>
                </div>

                {/* 🧩 DYNAMIC TAB CONTENT AREA */}
                <div className="min-h-[60vh]">
                    {activeTab === 'BROWSE' && <AdminBrowseTab />}
                    {activeTab === 'JOBS AI' && <AdminJobDrafts />}
                    {activeTab === 'FOLDERS' && <AdminFoldersTab />}
                    {activeTab === 'HOMEPAGE' && <AdminHomepageTab siteContent={siteContent} updateSiteContent={updateSiteContent} />}
                    {activeTab === 'FAST TRACK' && <FastTrackManager />} 
                    {activeTab === 'WEB STORIES' && <AdminWebStories />}
                    {activeTab === 'SIDEBAR' && <AdminSidebarControl />}
                    {activeTab === 'MOCK TEST' && <AdminMockTest />}
                    {activeTab === 'PREMIUM' && <PremiumTab />}
                    {activeTab === 'ORDERS' && <OrdersTab />}
                    {activeTab === 'NOTIFICATIONS' && <NotificationsTab />}
                    {activeTab === 'SETTINGS' && <SettingsTab />}
                    {activeTab === 'CUSTOMIZE' && <SiteSettings />}
                    {activeTab === 'STORAGE' && <AdminStorageTab />}
                    {/* 🔥 NEW Content for Payments */}
                    {activeTab === 'PAYMENTS' && <AdminPaymentApproval />}
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </section>
    );
};

export default AdminPage;