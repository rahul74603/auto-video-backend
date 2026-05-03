// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowLeft, FolderPlus, UploadCloud, Folder, Eye, Trash2, 
    FileText, FilePenLine, Edit, X, ShieldCheck, AlignLeft, Save 
} from 'lucide-react';
import { db, storage } from '../../../firebase/config';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const AdminFoldersTab = () => {
    // --- 🛠️ STATES ---
    const [currentFolderId, setCurrentFolderId] = useState('root');
    const [currentFolderName, setCurrentFolderName] = useState('Home');
    const [folderHistory, setFolderHistory] = useState([]);
    const [categories, setCategories] = useState([]);
    const [folderFiles, setFolderFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [postType, setPostType] = useState('MATERIAL');

    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentUploadingFile, setCurrentUploadingFile] = useState('');
    const isSubmitting = useRef(false);

    const [formData, setFormData] = useState({
        title: '', subject: '', fileSize: '', description: '', 
        applyLink: '', lockMessage: '', features: []
    });
    const [featureInput, setFeatureInput] = useState('');

    // --- 📡 DATA FETCHING ---
    useEffect(() => { fetchCategories(); }, []);
    useEffect(() => { if (currentFolderId !== 'root') fetchFolderFiles(); }, [currentFolderId]);

    const fetchCategories = async () => {
        const s = await getDocs(collection(db, "categories"));
        setCategories(s.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    const fetchFolderFiles = async () => {
        try {
            const q1 = query(collection(db, "jobs"), where("category", "==", currentFolderId));
            const q2 = query(collection(db, "study_materials"), where("category", "==", currentFolderId));
            const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            
            const all = [
                ...s1.docs.map(d => ({ id: d.id, ...d.data(), _collection: 'jobs' })),
                ...s2.docs.map(d => ({ id: d.id, ...d.data(), _collection: 'study_materials' }))
            ].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            
            setFolderFiles(all);
        } catch (err) { console.error(err); }
    };

    // --- 📂 FOLDER LOGIC ---
    const handleCreateFolder = async () => {
        if (!newFolderName) return;
        await addDoc(collection(db, "categories"), {
            name: newFolderName, parentId: currentFolderId, createdAt: new Date().toISOString()
        });
        setNewFolderName('');
        fetchCategories();
    };

    const enterFolder = (f) => {
        setFolderHistory([...folderHistory, { id: currentFolderId, name: currentFolderName }]);
        setCurrentFolderId(f.id);
        setCurrentFolderName(f.name);
    };

    const goBack = () => {
        const p = folderHistory.pop();
        if (p) {
            setCurrentFolderId(p.id);
            setCurrentFolderName(p.name);
            setFolderHistory([...folderHistory]);
        }
    };

    // --- 📤 UPLOAD LOGIC ---
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['Bytes', 'KB', 'MB', 'GB'][i];
    };

    const sendTelegramAlert = async (data, docId) => {
    try {
        const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN; 
        const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;

        // 💡 HTML मोड का इस्तेमाल ताकि स्पेशल कैरेक्टर्स से कोड न फटे
        const msg = `<b>📚 नया स्टडी मटीरियल / PDF अपलोड! 📚</b>\n\n` +
                    `📝 <b>Topic:</b> ${data.title}\n` +
                    `📁 <b>Subject:</b> ${data.subject || 'Notes'}\n\n` +
                    `👇 <b>यहाँ से फ्री में डाउनलोड करें:</b>\n` +
                    `<a href="${window.location.origin}/material/${docId}">${window.location.origin}/material/${docId}</a>`;
        
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId, 
                text: msg, 
                parse_mode: 'HTML', // 👈 HTML ज्यादा स्टेबल है
                disable_web_page_preview: false
            })
        });

        const result = await response.json();
        if (!result.ok) {
            console.error("Telegram Material Alert Error:", result.description);
        }

    } catch (e) { 
        console.error("Telegram Failed", e); 
    }
};

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);

        try {
            if (selectedFiles.length > 0) {
                let firstId = null;
                for (let i = 0; i < selectedFiles.length; i++) {
                    const file = selectedFiles[i];
                    setCurrentUploadingFile(file.name);
                    setUploadProgress(((i) / selectedFiles.length) * 100);

                    const fileExt = file.name.split('.').pop();
                    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                    const customPath = `study_materials/${currentFolderId}/studygyaan_${cleanName}_${Date.now()}.${fileExt}`;
                    
                    const sRef = ref(storage, customPath);
                    await uploadBytes(sRef, file);
                    const url = await getDownloadURL(sRef);

                    const payload = {
                        ...formData,
                        title: selectedFiles.length > 1 ? file.name.replace(/\.[^/.]+$/, '') : formData.title,
                        applyLink: url, downloadUrl: url, category: currentFolderId,
                        fileSize: formatFileSize(file.size), storagePath: customPath,
                        type: 'MATERIAL', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString()
                    };
                    const docRef = await addDoc(collection(db, "jobs"), payload);
                    if (!firstId) firstId = docRef.id;
                }
                if (firstId) sendTelegramAlert(formData, firstId);
                alert("All files uploaded!");
            } else if (editingId) {
                await updateDoc(doc(db, "jobs", editingId), { ...formData, updatedAt: new Date().toISOString() });
                alert("Updated!");
            }
            setShowUploadForm(false);
            fetchFolderFiles();
        } catch (err) { alert(err.message); }
        finally { setLoading(false); isSubmitting.current = false; setSelectedFiles([]); setUploadProgress(0); }
    };

    return (
        <div className="bg-white p-3 md:p-6 rounded-2xl border shadow-lg animate-in fade-in w-full overflow-hidden">
            {/* Header & Breadcrumbs */}
            <div className="flex items-center gap-2 mb-6 border-b pb-4">
                {currentFolderId !== 'root' && <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20} /></button>}
                <span className="font-black text-blue-600 text-sm md:text-xl">/{currentFolderName}</span>
            </div>

            {!showUploadForm ? (
                <>
                    {/* Create Folder */}
                    <div className="flex gap-2 mb-6">
                        <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="border p-3 flex-1 rounded-xl text-sm" placeholder="New Folder Name..." />
                        <button onClick={handleCreateFolder} className="bg-yellow-500 text-white px-6 rounded-xl font-bold flex items-center gap-2"><FolderPlus size={18} /> Folder</button>
                    </div>

                    {currentFolderId !== 'root' && (
                        <div className="mb-6 p-4 bg-purple-50 rounded-2xl border border-purple-100 flex justify-between items-center">
                            <div><h4 className="font-black text-purple-800">Upload in this folder</h4><p className="text-xs text-purple-600">PDF, Notes, etc.</p></div>
                            <button onClick={() => { setShowUploadForm(true); setEditingId(null); }} className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"><UploadCloud size={20}/> UPLOAD</button>
                        </div>
                    )}

                    {/* Folders Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                        {categories.filter(c => c.parentId === currentFolderId).map(f => (
                            <div key={f.id} className="flex justify-between items-center bg-gray-50 border p-4 rounded-2xl hover:shadow-md cursor-pointer group" onClick={() => enterFolder(f)}>
                                <span className="font-bold flex items-center gap-2 text-gray-700 group-hover:text-blue-600 truncate"><Folder size={20} className="text-yellow-500" /> {f.name}</span>
                                <button onClick={(e) => { e.stopPropagation(); if(confirm("Delete folder?")) deleteDoc(doc(db, "categories", f.id)).then(fetchCategories); }} className="text-red-300 hover:text-red-500"><Trash2 size={18} /></button>
                            </div>
                        ))}
                    </div>

                    {/* Files List */}
                    {currentFolderId !== 'root' && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Files ({folderFiles.length})</h4>
                            {folderFiles.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-4 border rounded-2xl bg-white shadow-sm hover:border-purple-300 transition-all">
                                    <div className="flex items-center gap-3 truncate">
                                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><FileText size={20}/></div>
                                        <div className="truncate"><p className="font-bold text-gray-700 text-sm truncate">{p.title}</p><p className="text-[10px] text-gray-400">{p.subject} • {p.fileSize}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setFormData(p); setEditingId(p.id); setShowUploadForm(true); }} className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Edit size={16} /></button>
                                        <button onClick={() => { if(confirm("Delete file?")) deleteDoc(doc(db, p._collection, p.id)).then(fetchFolderFiles); }} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* Upload Form */
                <div className="max-w-2xl mx-auto py-4">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-purple-700">{editingId ? 'Edit' : 'Upload'} Files</h3>
                        <button onClick={() => setShowUploadForm(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 border rounded-xl font-bold" placeholder="File Title *" required />
                        <input value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full p-3 border rounded-xl" placeholder="Subject Name" />
                        
                        <div className="p-10 border-2 border-dashed border-purple-200 rounded-2xl text-center bg-purple-50 cursor-pointer" onClick={() => document.getElementById('files').click()}>
                            <input type="file" id="files" multiple className="hidden" onChange={e => setSelectedFiles(Array.from(e.target.files))} />
                            <UploadCloud size={40} className="mx-auto text-purple-400 mb-2" />
                            <p className="font-bold text-purple-700">{selectedFiles.length > 0 ? `${selectedFiles.length} files selected` : 'Click to select multiple files'}</p>
                        </div>

                        {uploadProgress > 0 && (
                            <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                                <div className="bg-purple-600 h-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                        )}

                        <button disabled={loading} className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black shadow-lg">
                            {loading ? `Uploading... ${Math.round(uploadProgress)}%` : 'START UPLOAD'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default AdminFoldersTab;