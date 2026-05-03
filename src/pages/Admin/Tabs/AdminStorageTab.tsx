// @ts-nocheck
import React, { useState } from 'react';
import { db, storage } from '../../../firebase/config';
import { collectionGroup, query, getDocs, doc, deleteDoc, collection } from 'firebase/firestore';
import { ref, listAll, getMetadata, deleteObject } from 'firebase/storage';
import { 
    Trash2, HardDrive, Search, Activity, ExternalLink, 
    Gem, FileText, Briefcase, Filter, Layers, 
    Share2, MousePointer2, PieChart, AlertTriangle, Gauge 
} from 'lucide-react';

const AdminStorageTab = () => {
    const [allFiles, setAllFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeFilter, setActiveFilter] = useState('ALL'); 
    const [status, setStatus] = useState("");

    // 🚀 STORAGE SCANNER
    const scanStorage = async (folderRef) => {
        let files = [];
        try {
            const res = await listAll(folderRef);
            const metas = await Promise.all(res.items.map(async (item) => {
                const m = await getMetadata(item);
                return {
                    id: item.fullPath,
                    title: item.name,
                    size: (m.size / (1024 * 1024)).toFixed(2) + " MB",
                    sizeBytes: m.size,
                    url: `https://firebasestorage.googleapis.com/v0/b/${storage.app.options.storageBucket}/o/${encodeURIComponent(item.fullPath)}?alt=media`,
                    path: item.fullPath,
                    source: 'STORAGE',
                    hits: 0,
                    shares: 0,
                    category: item.fullPath.toLowerCase().includes('premium') ? 'PREMIUM' : 
                              item.fullPath.toLowerCase().includes('job') ? 'JOBS' : 'FREE'
                };
            }));
            files = [...metas];
            for (const sub of res.prefixes) {
                const subFiles = await scanStorage(sub);
                files = [...files, ...subFiles];
            }
        } catch (e) { console.error(e); }
        return files;
    };

    const runUltimateScan = async () => {
        setLoading(true);
        setStatus("System Scanning... डेटा का विश्लेषण हो रहा है।");
        let masterList = [];

        try {
            const dbTargets = [
                { name: 'premium_content', cat: 'PREMIUM' },
                { name: 'premium_notes', cat: 'PREMIUM' },
                { name: 'study_materials', cat: 'FREE' },
                { name: 'pdf', cat: 'FREE' },
                { name: 'types', cat: 'FREE' },
                { name: 'jobs', cat: 'JOBS' }
            ];

            for (const target of dbTargets) {
                const q = query(collectionGroup(db, target.name));
                const snap = await getDocs(q);
                
                snap.docs.forEach(d => {
                    const data = d.data();
                    let link = data.downloadUrl || data.applyLink || data.pdfUrl || "";
                    if(!link) {
                        Object.values(data).forEach(v => {
                            if(typeof v === 'string' && v.includes('firebasestorage')) link = v;
                        });
                    }

                    if (link) {
                        masterList.push({
                            id: d.id,
                            title: data.title || data.name || "Unknown Doc",
                            size: data.fileSize || "0 MB",
                            sizeBytes: (parseFloat(data.fileSize) || 0) * 1024 * 1024,
                            path: d.ref.path,
                            url: link,
                            source: 'DATABASE',
                            hits: data.downloadCount || 0,
                            shares: data.shareCount || 0,
                            category: target.cat
                        });
                    }
                });
            }

            const storageFolders = ['materials', 'premium_content', 'premium_docs', 'categories', 'jobs', 'premium-notes'];
            for (const folder of storageFolders) {
                const fRef = ref(storage, folder);
                const sFiles = await scanStorage(fRef);
                sFiles.forEach(sf => {
                    const exists = masterList.find(ml => ml.url.includes(sf.title) || ml.title === sf.title);
                    if (!exists) masterList.push(sf);
                });
            }

            masterList.sort((a, b) => b.hits - a.hits);
            setAllFiles(masterList);
            setStatus("Scan Complete! डेटा हाज़िर है। ✅");
        } catch (err) { setStatus("Error: " + err.message); }
        finally { setLoading(false); }
    };

    // 🔍 Dynamic Stats Logic
    const filteredData = allFiles.filter(f => activeFilter === 'ALL' || f.category === activeFilter);
    const totalGB = filteredData.reduce((acc, f) => acc + (f.sizeBytes / (1024**3)), 0);
    const totalHits = filteredData.reduce((acc, f) => acc + f.hits, 0);
    const totalShares = filteredData.reduce((acc, f) => acc + f.shares, 0);

    return (
        <div className="space-y-6 font-hindi p-2">
            {/* 🟦 COMMANDER HEADER */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border-b-8 border-indigo-600">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4 text-white">
                        <PieChart className={`text-indigo-400 ${loading ? 'animate-spin' : ''}`} size={36}/>
                        <div>
                            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">Ultimate Dashboard 4.0</h2>
                            <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest">{status || "Deep Analytics Mode"}</p>
                        </div>
                    </div>
                    <button onClick={runUltimateScan} disabled={loading} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-white hover:text-indigo-600 transition-all shadow-xl active:scale-95">
                        {loading ? "ANALYZING..." : "RE-SCAN ALL DATA"}
                    </button>
                </div>
            </div>

            {/* 🚨 BILLING & EFFICIENCY ALERTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-50 p-6 rounded-[2rem] border-2 border-red-100 flex items-start gap-4">
                    <div className="bg-red-500 p-3 rounded-2xl text-white">
                        <AlertTriangle size={24}/>
                    </div>
                    <div>
                        <h4 className="text-red-600 font-black uppercase text-xs tracking-wider">Storage Warning</h4>
                        <p className="text-2xl font-black text-slate-800">{((totalGB / 5) * 100).toFixed(1)}% <span className="text-[10px] text-slate-400">of 5GB</span></p>
                        <p className="text-[10px] text-red-400 font-bold mt-1 uppercase italic">सावधान: 5GB के बाद पैसे लगने शुरू हो जाएंगे।</p>
                    </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100 flex items-start gap-4">
                    <div className="bg-blue-500 p-3 rounded-2xl text-white">
                        <Gauge size={24}/>
                    </div>
                    <div>
                        <h4 className="text-blue-600 font-black uppercase text-xs tracking-wider">Read Efficiency</h4>
                        <p className="text-2xl font-black text-slate-800">~{allFiles.length} <span className="text-[10px] text-slate-400">Reads/Scan</span></p>
                        <p className="text-[10px] text-blue-400 font-bold mt-1 uppercase italic">एक 'Master Scan' आपके इतने Reads खर्च करता है।</p>
                    </div>
                </div>
            </div>

            {/* 📊 DYNAMIC FILTERS */}
            <div className="flex flex-wrap gap-3">
                {[
                    { id: 'ALL', label: 'All Files', icon: <HardDrive size={16}/>, color: 'bg-slate-800' },
                    { id: 'PREMIUM', label: 'Premium', icon: <Gem size={16}/>, color: 'bg-purple-600' },
                    { id: 'FREE', label: 'Free Material', icon: <FileText size={16}/>, color: 'bg-blue-600' },
                    { id: 'JOBS', label: 'Job PDFs', icon: <Briefcase size={16}/>, color: 'bg-emerald-600' }
                ].map(btn => (
                    <button
                        key={btn.id}
                        onClick={() => setActiveFilter(btn.id)}
                        className={`px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all shadow-md ${activeFilter === btn.id ? `${btn.color} text-white scale-105 shadow-xl` : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                    >
                        {btn.icon} {btn.label}
                    </button>
                ))}
            </div>

            {/* 📈 STATS BOXES */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border-b-8 border-indigo-500 shadow-lg">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Space ({activeFilter})</p>
                    <p className="text-xl font-black text-indigo-600">{totalGB.toFixed(3)} GB</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border-b-8 border-blue-500 shadow-lg">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Total Hits</p>
                    <p className="text-xl font-black text-blue-600">{totalHits}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border-b-8 border-emerald-500 shadow-lg">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Total Shares</p>
                    <p className="text-xl font-black text-emerald-600">{totalShares}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border-b-8 border-purple-500 shadow-lg">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Files</p>
                    <p className="text-xl font-black text-purple-600">{filteredData.length}</p>
                </div>
            </div>

            {/* 📉 DETAILED TABLE */}
            <div className="bg-white rounded-[2.5rem] border shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-400 border-b">
                            <tr>
                                <th className="p-5">File & Category</th>
                                <th className="p-5">Size</th>
                                <th className="p-5">Hits</th>
                                <th className="p-5">Shares</th>
                                <th className="p-5 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y text-[13px]">
                            {filteredData.map((file, idx) => (
                                <tr key={idx} className="hover:bg-indigo-50/20 transition-all">
                                    <td className="p-5">
                                        <p className="font-black text-slate-700 uppercase truncate max-w-xs">{file.title}</p>
                                        <div className="flex gap-2 mt-1">
                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase ${file.category === 'PREMIUM' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>{file.category}</span>
                                            <span className="text-[7px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase">{file.source}</span>
                                        </div>
                                    </td>
                                    <td className="p-5 font-black text-slate-500">{file.size}</td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-1 font-black text-blue-600">
                                            <MousePointer2 size={12}/> {file.hits}
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-1 font-black text-emerald-600">
                                            <Share2 size={12}/> {file.shares}
                                        </div>
                                    </td>
                                    <td className="p-5 text-center">
                                        <div className="flex justify-center gap-2">
                                            <a href={file.url} target="_blank" className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><ExternalLink size={16}/></a>
                                            <button onClick={async () => {
                                                if(!confirm("Kya aap ise delete karna chahte hain?")) return;
                                                if(file.source === 'STORAGE') await deleteObject(ref(storage, file.path));
                                                else {
                                                    const pathParts = file.path.split('/');
                                                    const docId = pathParts.pop();
                                                    const colPath = pathParts.join('/');
                                                    await deleteDoc(doc(db, colPath, docId));
                                                }
                                                setAllFiles(prev => prev.filter(f => f.id !== file.id));
                                            }} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="py-20 text-center text-slate-300 font-black italic uppercase text-xs">No files detected.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminStorageTab;