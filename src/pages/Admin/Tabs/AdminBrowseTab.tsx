// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    Briefcase, FileText, Clock, Banknote, Users, GraduationCap, 
    MapPin, CheckCircle, ExternalLink, Edit, Trash2, FilePenLine, 
    Plus, X, AlignLeft, Tag, Image as ImageIcon, ShoppingCart, Save, 
    UploadCloud, ShieldCheck 
} from 'lucide-react';

import { db, storage } from '../../../firebase/config';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const JOB_CATEGORIES = [
    { id: 'ssc', name: 'SSC Exams' }, { id: 'banking', name: 'Banking Exams' }, { id: 'railway', name: 'Railway Exams' },
    { id: 'upsc', name: 'UPSC & Civil Services' }, { id: 'defense', name: 'Defense & Police' }, { id: 'teaching', name: 'Teaching Exams' },
    { id: 'engineering', name: 'Engineering / PSU' }, { id: 'medical', name: 'Medical / Nurse' }, { id: 'state', name: 'State Govt Exams' },
    { id: 'other', name: 'Post Office / Other' }, { id: 'all', name: 'All Jobs Box' }
];

const AdminBrowseTab = () => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [postType, setPostType] = useState('JOB');
    const [editingId, setEditingId] = useState(null);
    const [currentDraftId, setCurrentDraftId] = useState(null);
    
    const [pdfFile, setPdfFile] = useState(null); 
    
    const isSubmitting = useRef(false);

    const navigate = useNavigate();
    const location = useLocation(); 
    const draftData = location.state?.draftData; 

    const [formData, setFormData] = useState({
        title: '', organization: '', vacancies: '', location: '', advtNo: '', startDate: '', lastDate: '',
        qualification: '', ageLimit: '', minAge: '', salary: '', applyLink: '', category: 'ssc', description: '',
        officialSiteLink: '', applicationFee: '', selectionProcess: '', eligibility: '',
        notificationLink: '', feeGen: '', feeOBC: '', feeSCST: '', feeFemale: '',
        price: '', imageUrl: ''
    });

    const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';

    try {
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const cleanedDate = dateStr.replace(/[\/.]/g, '-');
        const secondAttempt = new Date(cleanedDate);
        
        if (!isNaN(secondAttempt.getTime())) {
            return secondAttempt.toISOString().split('T')[0];
        }

        return ''; 
    } catch (e) {
        return '';
    }
};

    useEffect(() => {
        if (draftData) {
            const actualData = { ...(draftData[0] || {}), ...draftData };

            setFormData(prev => ({
                ...prev,
                title: actualData.title || '',
                organization: actualData.organization || '',
                vacancies: actualData.vacancies || '',
                location: actualData.location || 'All India',
                advtNo: actualData.advtNo || '',
                startDate: formatDateForInput(actualData.startDate),
                lastDate: formatDateForInput(actualData.lastDate),
                qualification: actualData.qualification || '',
                ageLimit: actualData.ageLimit || '',
                minAge: actualData.minAge || '18',
                salary: actualData.salary || '',
                applyLink: actualData.applyLink || '',
                category: actualData.category || 'ssc',
                description: actualData.description || '',
                officialSiteLink: actualData.officialSiteLink || '',
                applicationFee: actualData.applicationFee || '',
                selectionProcess: actualData.selectionProcess || '',
                eligibility: actualData.eligibility || '',
                notificationLink: actualData.notificationLink || '',
                feeGen: actualData.feeGen || '',
                feeOBC: actualData.feeOBC || '',
                feeSCST: actualData.feeSCST || '',
                feeFemale: actualData.feeFemale || '',
                price: actualData.price || '',
                imageUrl: actualData.imageUrl || ''
            }));

            setPostType(actualData.type || 'JOB');
            setShowUploadForm(true);
            setEditingId(null); 
            
            const targetId = location.state?.draftId || actualData.id || actualData.docId;
            setCurrentDraftId(targetId);
        }
    }, [draftData]);

    const handleUpdateDraftOnly = async () => {
        const finalDraftId = currentDraftId || location.state?.draftId || (draftData && draftData.id);
        
        if (!finalDraftId) {
            alert("❌ Error: Draft ID is completely missing! Refresh and try again.");
            return;
        }

        setLoading(true);
        try {
            let finalNotificationLink = formData.notificationLink || "";

            if (pdfFile) {
                const storageRef = ref(storage, `job_notifications/draft_${Date.now()}_${pdfFile.name}`);
                await uploadBytes(storageRef, pdfFile);
                finalNotificationLink = await getDownloadURL(storageRef);
            }

            const rawPayload = { 
                ...formData, 
                notificationLink: finalNotificationLink, 
                type: postType, 
                updatedAt: new Date().toISOString() 
            };
            
            const cleanPayload = Object.fromEntries(Object.entries(rawPayload).filter(([_, v]) => v !== undefined));

            await setDoc(doc(db, "job_drafts", String(finalDraftId)), cleanPayload, { merge: true });
            
            alert(`✅ DRAFT SAVED SUCCESSFULLY!\n\nAll your text changes and file uploads are securely saved.`);
            
            setShowUploadForm(false);
            setPdfFile(null);
            
            navigate('/secret-admin', { replace: true, state: { activeTab: 'JOBS AI' } });
            
        } catch (err) { 
            console.error(err);
            alert("❌ Save Failed: " + err.message); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { fetchContent(); }, []);

    const fetchContent = async () => {
        try {
            const q = query(collection(db, "jobs"), where("type", "in", ["JOB", "AFFILIATE"]));
            const s = await getDocs(q);
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            setPosts(data);
        } catch (err) { console.error(err); }
    };

    const sendTelegramJugad = async (jobData, docId) => {
        const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
        const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

        const message = `🚨 *New Govt Job Alert!* 🚨\n\n` +
                        `📌 *Post:* ${jobData.title || 'Official Update'}\n` +
                        `🏢 *Dept:* ${jobData.organization || 'Govt Department'}\n` +
                        `🎓 *Qualification:* ${jobData.qualification || 'Check Notification'}\n` +
                        `⏳ *Last Date:* ${jobData.lastDate || 'Not specified'}\n\n` +
                        `🔗 *Apply & Read Full Details:* \nhttps://studygyaan.in/job/${docId}\n\n` +
                        `Join @studygyaan_channel for fastest updates!`;

        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            });
        } catch (err) { console.error("❌ Telegram Jugad Failed:", err); }
    };

    // 🚀 NEW: GitHub Actions Webhook Trigger
    const triggerGitHubVideoRender = async (jobData) => {
        const GITHUB_PAT = import.meta.env.VITE_GITHUB_PAT;
        const GITHUB_OWNER = import.meta.env.VITE_GITHUB_OWNER; 
        const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO;   

        if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
            console.warn("GitHub Credentials missing in .env, video render skipped.");
            return;
        }

        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;

        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${GITHUB_PAT}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event_type: 'generate_video', // Ye nam GitHub yml se match karega
                    client_payload: {
                        jobData: jobData
                    }
                })
            });
            console.log("✅ GitHub Action Triggered for Video!");
        } catch (err) {
            console.error("❌ GitHub Action Failed:", err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);

        try {
            let finalNotificationLink = formData.notificationLink || "";

            if (pdfFile) {
                const storageRef = ref(storage, `job_notifications/${Date.now()}_${pdfFile.name}`);
                await uploadBytes(storageRef, pdfFile);
                finalNotificationLink = await getDownloadURL(storageRef);
            }

            const rawPayload = { 
                ...formData, 
                notificationLink: finalNotificationLink, 
                type: postType, 
                updatedAt: new Date().toISOString() 
            };
            const cleanPayload = Object.fromEntries(Object.entries(rawPayload).filter(([_, v]) => v !== undefined));
            
            if (editingId) {
                await setDoc(doc(db, "jobs", String(editingId)), cleanPayload, { merge: true });
                alert("Updated Live Post Successfully! ✅");
            } else {
                const docRef = await addDoc(collection(db, "jobs"), { 
                    ...cleanPayload, 
                    createdAt: new Date().toISOString() 
                });

                if (postType === 'JOB') {
                    // Telegram Pe Message
                    await sendTelegramJugad(cleanPayload, docRef.id);
                    // GitHub Actions se Video aur Pinterest Trigger
                    await triggerGitHubVideoRender(cleanPayload);
                }

                if (currentDraftId) {
                    await deleteDoc(doc(db, "job_drafts", String(currentDraftId)));
                }

                alert("Published Live Successfully! 🚀");
            }

            setShowUploadForm(false);
            setPdfFile(null); 
            fetchContent(); 
            navigate(location.pathname, { replace: true, state: {} });

        } catch (err) { 
            alert("Error: " + err.message); 
        } finally { 
            setLoading(false); 
            isSubmitting.current = false; 
        }
    };

    const handleEdit = (p) => {
        setEditingId(p.id);
        setPostType(p.type);
        setFormData({ ...formData, ...p });
        setPdfFile(null); 
        setCurrentDraftId(null); 
        setShowUploadForm(true);
    };

    return (
        <div className="mt-16 md:mt-24 bg-white rounded-xl shadow-lg border p-3 md:p-6 animate-in fade-in w-full overflow-hidden font-hindi">
            {!showUploadForm ? (
                <>
                    <div className="flex gap-2 mb-6 justify-center">
                        <button onClick={() => { setPostType('JOB'); setEditingId(null); setCurrentDraftId(null); setFormData({...formData, title: '', notificationLink: ''}); setShowUploadForm(true); }} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-blue-700 transition-all active:scale-95">ADD NEW JOB</button>
                        
                        <button onClick={() => { setPostType('AFFILIATE'); setEditingId(null); setCurrentDraftId(null); setFormData({...formData, title: ''}); setShowUploadForm(true); }} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-emerald-700 transition-all active:scale-95">ADD PRODUCT</button>
                    </div>
                    <div className="space-y-3">
                        {posts.map(p => (
                            <div key={p.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border rounded-2xl bg-white shadow-sm hover:border-blue-300 transition-all gap-3">
                                <div className="truncate flex-1">
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase mr-2 ${p.type === 'JOB' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{p.type}</span>
                                    <span className="font-bold text-gray-700 text-sm md:text-base">{p.title}</span>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button onClick={() => handleEdit(p)} className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => { if(confirm("Delete this?")) deleteDoc(doc(db, "jobs", p.id)).then(fetchContent); }} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="max-w-5xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-blue-700 uppercase tracking-tight">{editingId ? 'Edit Live' : (currentDraftId ? 'Review Draft' : 'Add New')} {postType}</h3>
                        <button onClick={() => {setShowUploadForm(false); setPdfFile(null); navigate(location.pathname, { replace: true, state: {} });}} className="p-2 bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"><X size={24}/></button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Post Title *</label>
                                <input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl font-bold text-sm focus:border-blue-500 outline-none transition-all" required placeholder="Enter Job Title..." />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Category</label>
                                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl font-bold text-sm bg-white outline-none">
                                    {JOB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {postType === 'JOB' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-2xl border-2 border-gray-100">
                                    <div><label className="text-[10px] font-black text-gray-400 uppercase">Organization</label><input value={formData.organization} onChange={e => setFormData({...formData, organization: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm" placeholder="e.g. SSC, UPSC" /></div>
                                    <div><label className="text-[10px] font-black text-gray-400 uppercase">Advt No</label><input value={formData.advtNo} onChange={e => setFormData({...formData, advtNo: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm" placeholder="01/2026" /></div>
                                    <div><label className="text-[10px] font-black text-gray-400 uppercase">Start Date</label><input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full p-3 border rounded-xl text-sm font-bold" /></div>
                                    <div><label className="text-[10px] font-black text-gray-400 uppercase">Last Date</label><input type="date" value={formData.lastDate} onChange={e => setFormData({...formData, lastDate: e.target.value})} className="w-full p-3 border rounded-xl text-sm font-bold" /></div>
                                </div>

                                <div className="bg-blue-50 p-5 rounded-2xl border-2 border-blue-100 shadow-sm">
                                    <h4 className="text-xs font-black text-blue-700 mb-4 uppercase flex items-center gap-2 tracking-widest"><ShieldCheck size={16}/> Job Specifications</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Total Vacancies</label><input value={formData.vacancies} onChange={e => setFormData({...formData, vacancies: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="e.g. 5000+" /></div>
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Pay Scale (Salary)</label><input value={formData.salary} onChange={e => setFormData({...formData, salary: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="₹21,700 - 69,100" /></div>
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Qualification</label><input value={formData.qualification} onChange={e => setFormData({...formData, qualification: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="10th, 12th, Degree" /></div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Min Age</label><input value={formData.minAge} onChange={e => setFormData({...formData, minAge: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="18" /></div>
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Max Age</label><input value={formData.ageLimit} onChange={e => setFormData({...formData, ageLimit: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="25/30" /></div>
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Job Location</label><input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="All India" /></div>
                                        <div><label className="text-[9px] font-black text-blue-400 uppercase">Selection Process</label><input value={formData.selectionProcess} onChange={e => setFormData({...formData, selectionProcess: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="Written/PET" /></div>
                                    </div>
                                    <div className="mt-4"><label className="text-[9px] font-black text-blue-400 uppercase">Physical Eligibility / Extra Details</label><input value={formData.eligibility} onChange={e => setFormData({...formData, eligibility: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-blue-900" placeholder="Chest: 80cm, Height: 170cm..." /></div>
                                </div>

                                <div className="bg-yellow-50 p-5 rounded-2xl border-2 border-yellow-100">
                                    <h4 className="text-xs font-black text-yellow-700 mb-4 uppercase flex items-center gap-2 tracking-widest"><Banknote size={16}/> Application Fees (₹)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div><label className="text-[9px] font-black text-yellow-600 uppercase">General/OBC/EWS</label><input value={formData.feeGen} onChange={e => setFormData({...formData, feeGen: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-yellow-900" placeholder="₹500" /></div>
                                        <div><label className="text-[9px] font-black text-yellow-600 uppercase">SC / ST / PH</label><input value={formData.feeSCST} onChange={e => setFormData({...formData, feeSCST: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-yellow-900" placeholder="₹0" /></div>
                                        <div><label className="text-[9px] font-black text-yellow-600 uppercase">Female</label><input value={formData.feeFemale} onChange={e => setFormData({...formData, feeFemale: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-yellow-900" placeholder="₹100" /></div>
                                        <div><label className="text-[9px] font-black text-yellow-600 uppercase">Other Fee</label><input value={formData.feeOBC} onChange={e => setFormData({...formData, feeOBC: e.target.value})} className="w-full p-2.5 border-2 border-white rounded-xl bg-white text-sm font-black text-yellow-900" placeholder="Any other" /></div>
                                    </div>
                                    <div className="mt-4"><label className="text-[9px] font-black text-yellow-600 uppercase">Fee Description (Text Area)</label><textarea value={formData.applicationFee} onChange={e => setFormData({...formData, applicationFee: e.target.value})} rows={2} className="w-full p-3 border-2 border-white rounded-xl bg-white text-sm font-bold outline-none" placeholder="Online payment only, SBI Challan etc..." /></div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-red-50/50 p-5 rounded-2xl border-2 border-red-100">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-red-600 uppercase flex items-center gap-1"><UploadCloud size={14}/> Upload PDF or Image (Pic)</label>
                                        <input type="file" accept="application/pdf, image/*" onChange={(e) => setPdfFile(e.target.files[0])} className="w-full p-2 text-xs border-2 border-red-200 rounded-xl bg-white font-bold text-red-700 cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-black file:bg-red-100 file:text-red-700 hover:file:bg-red-200" />
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-red-400 font-bold italic">OR</span>
                                            <input value={formData.notificationLink} onChange={e => setFormData({...formData, notificationLink: e.target.value})} disabled={!!pdfFile} className={`flex-1 p-2.5 border-2 border-red-100 rounded-xl text-xs font-black text-red-700 bg-white outline-none ${pdfFile ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`} placeholder="Paste https:// link here..." />
                                        </div>
                                    </div>
                                    <div><label className="text-[10px] font-black text-blue-600 uppercase flex items-center gap-1 mt-1"><ExternalLink size={14}/> Apply Online Link</label><input value={formData.applyLink} onChange={e => setFormData({...formData, applyLink: e.target.value})} className="w-full p-3 border-2 border-blue-100 rounded-xl text-sm font-black text-blue-700 bg-white outline-none mt-1" placeholder="https://..." /></div>
                                    <div><label className="text-[10px] font-black text-gray-600 uppercase flex items-center gap-1 mt-1"><Briefcase size={14}/> Official Website</label><input value={formData.officialSiteLink} onChange={e => setFormData({...formData, officialSiteLink: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm font-black text-gray-700 bg-white outline-none mt-1" placeholder="https://..." /></div>
                                </div>
                            </div>
                        )}

                        {postType === 'AFFILIATE' && (
                            <div className="space-y-4 bg-green-50 p-6 rounded-2xl border-2 border-green-100">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black text-green-700 uppercase">Product Price (₹)</label><input value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full p-3 border-2 border-white rounded-xl font-black text-sm text-green-900" placeholder="999" /></div>
                                    <div><label className="text-[10px] font-black text-green-700 uppercase">Product Image URL</label><input value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} className="w-full p-3 border-2 border-white rounded-xl text-sm text-green-900" placeholder="https://..." /></div>
                                </div>
                                <div><label className="text-[10px] font-black text-green-800 uppercase">Affiliate Buy Link</label><input value={formData.applyLink} onChange={e => setFormData({...formData, applyLink: e.target.value})} className="w-full p-3 border-2 border-green-300 rounded-xl text-sm font-black text-green-900 bg-white" placeholder="Amazon/Flipkart URL..." /></div>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block tracking-widest">Full Detailed Description</label>
                            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={14} className="w-full p-5 border-2 border-gray-100 rounded-2xl font-medium text-sm focus:border-blue-500 outline-none transition-all leading-relaxed" placeholder="Enter full job details here (HTML/Markdown supported)..." />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mt-4">
                            {currentDraftId && !editingId && (
                                <button type="button" onClick={handleUpdateDraftOnly} disabled={loading} className="w-full sm:w-1/2 flex justify-center items-center gap-2 py-4 bg-slate-200 text-slate-700 rounded-2xl font-black uppercase text-sm border-2 border-slate-300 active:scale-95 transition-all">
                                    {loading ? "SAVING..." : <><Edit size={20}/> UPDATE DRAFT ONLY</>}
                                </button>
                            )}
                            <button type="submit" disabled={loading} className={`w-full ${currentDraftId && !editingId ? 'sm:w-1/2' : ''} flex justify-center items-center gap-3 py-4 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-2xl font-black shadow-2xl transition-all uppercase text-sm active:scale-95 disabled:opacity-50`}>
                                {loading ? <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : <><Save size={20}/> {editingId ? "UPDATE LIVE POST" : "PUBLISH LIVE POST"}</>}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default AdminBrowseTab;