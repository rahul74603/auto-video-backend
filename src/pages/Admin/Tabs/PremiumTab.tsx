// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { db } from '../../../firebase/config'; 
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc, query, orderBy, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { FileText, Crown, Trash2, PlusCircle, Loader2, UploadCloud, ArrowLeft, Video, X, FilePenLine, Copy, ExternalLink, FolderPlus, Folder, ChevronRight, Home, ShieldCheck, CheckCircle, Edit, Globe, Link, ChevronUp, ChevronDown, Sparkles, Eye } from 'lucide-react';
import SEO from '../../../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

interface Course { id: string; title: string; price: string; paymentLink?: string; description: string; type: 'premium'; createdAt: string; orderIndex?: number; lockMessage?: string; features?: string[]; }
interface CourseContent { id: string; title: string; seoTitle?: string; link?: string; type: 'PDF' | 'VIDEO' | 'FOLDER' | 'article'; courseId: string; parentId: string | null; setNumber?: number; dynamicSetNum?: number; }

const PremiumTab = () => {
  const storage = getStorage(); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [managingCourse, setManagingCourse] = useState<Course | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null); 
  const [courseContent, setCourseContent] = useState<CourseContent[]>([]);
  
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string, name: string}[]>([]);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressMsg, setProgressMsg] = useState(""); 

  const [aiTopic, setAiTopic] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  
  const [formData, setFormData] = useState({ title: '', price: '499', paymentLink: '', description: '', lockMessage: '', features: [] as string[] });
  const [featureInput, setFeatureInput] = useState(''); 
  const [contentForm, setContentForm] = useState({ title: '', seoTitle: '', link: '', type: 'PDF', setNumber: 1 });

  useEffect(() => { 
    fetchCourses();
    fetchGlobalSettings(); 
  }, []);

  const fetchGlobalSettings = async () => {
    try {
      const settingsRef = doc(db, "site_settings", "global");
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) setGlobalSettings(settingsSnap.data());
    } catch (err) { console.error(err); }
  };

  const fetchCourses = async () => {
    try {
        const q = query(collection(db, "courses")); 
        const snapshot = await getDocs(q);
        let fetchedCourses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
        
        fetchedCourses.sort((a, b) => {
            const indexA = a.orderIndex ?? 999;
            const indexB = b.orderIndex ?? 999;
            return indexA - indexB;
        });

        setCourses(fetchedCourses);
    } catch (err) { console.error("Error fetching courses:", err); }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= courses.length) return;

      const batch = writeBatch(db);
      const currentCourse = courses[index];
      const neighborCourse = courses[newIndex];

      batch.update(doc(db, "courses", currentCourse.id), { orderIndex: newIndex });
      batch.update(doc(db, "courses", neighborCourse.id), { orderIndex: index });

      try {
          await batch.commit();
          fetchCourses(); 
      } catch (err) { alert("Move failed"); }
  };

  const handleCreateNotes = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          const nextIndex = courses.length;
          await addDoc(collection(db, "courses"), { 
              ...formData, 
              type: 'premium', 
              orderIndex: nextIndex,
              createdAt: new Date().toISOString() });
          alert("Notes Created!");
          setShowUploadForm(false); 
          setFormData({ title: '', price: '499', paymentLink: '', description: '', lockMessage: '', features: [] });
          fetchCourses();
      } catch(e) { alert("Error creating Notes"); } finally { setLoading(false); } 
  };

  const fetchCourseContent = async (courseId: string) => {
    const q = query(collection(db, `courses/${courseId}/content`));
    const snapshot = await getDocs(q);
    
    let content = snapshot.docs.map(doc => {
        const data = doc.data();
        const titleMatch = (data.seoTitle || data.title || "").match(/set\s*(\d+)/i);
        const titleNum = titleMatch ? parseInt(titleMatch[1], 10) : null;
        const finalSetNum = titleNum !== null ? titleNum : (Number(data.setNumber) || 1);
        return { id: doc.id, ...data, dynamicSetNum: finalSetNum } as CourseContent;
    });
    
    content.sort((a, b) => (a.dynamicSetNum || 0) - (b.dynamicSetNum || 0));
    setCourseContent(content);

    const maxSet = content.reduce((max, item) => {
        const currentNum = item.dynamicSetNum || 0;
        return currentNum > max ? currentNum : max;
    }, 0);
    
    setContentForm(prev => ({ ...prev, setNumber: maxSet + 1 }));
  };

  const handleUpdateNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!editingCourse) return;
    setLoading(true);
    try {
        await updateDoc(doc(db, "courses", editingCourse.id), {
            ...formData,
            updatedAt: serverTimestamp()
        });
        alert("✅ Notes Updated Successfully!");
        setEditingCourse(null);
        setFormData({ title: '', price: '499', paymentLink: '', description: '', lockMessage: '', features: [] });
        fetchCourses();
    } catch (err) { alert("Update failed"); } finally { setLoading(false); }
};

const addFeature = () => {
    if (featureInput.trim()) {
        setFormData(prev => ({
            ...prev,
            features: [...(prev.features || []), featureInput.trim()]
        }));
        setFeatureInput('');
    }
};

const removeFeature = (index: number) => {
    setFormData(prev => ({
        ...prev,
        features: prev.features.filter((_, i) => i !== index)
    }));
};

const handleCreateFolder = async () => {
    if(!managingCourse) return;
    const folderName = prompt("Enter Folder Name (e.g. GK, History):");
    if(!folderName) return;
    try {
        await addDoc(collection(db, `courses/${managingCourse.id}/content`), {
            title: folderName,
            type: 'FOLDER',
            courseId: managingCourse.id,
            parentId: currentFolderId, 
            createdAt: serverTimestamp()
        });
        fetchCourseContent(managingCourse.id);
    } catch (e) { alert("Error creating folder"); }
};

const enterFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
};

const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
        setCurrentFolderId(null);
        setFolderPath([]);
    } else {
        const newPath = folderPath.slice(0, index + 1);
        setFolderPath(newPath);
        setCurrentFolderId(newPath[newPath.length - 1].id);
    }
};

const visibleContent = courseContent.filter(item => {
    if (currentFolderId === null) return !item.parentId;
    return item.parentId === currentFolderId;
});

const handleDeleteItem = async (id: string) => {
    if(confirm("Delete this Notes?")) {
        await deleteDoc(doc(db, 'courses', id));
        fetchCourses();
    }
};

const handleRenameContent = async (contentId: string, oldTitle: string) => {
    if(!managingCourse) return;
    const newTitle = prompt("Enter new Display Title (SEO Name):", oldTitle);
    if(!newTitle || newTitle === oldTitle) return;
    try {
        await updateDoc(doc(db, `courses/${managingCourse.id}/content`, contentId), { seoTitle: newTitle });
        fetchCourseContent(managingCourse.id);
    } catch (err) { alert("Error renaming."); }
};

const copyToClipboard = (id: string) => {
    const link = `${window.location.origin}/pdf/${id}`;
    navigator.clipboard.writeText(link);
    alert("✅ Copied Short Link: " + link);
};

const handleGenerateAINote = async () => {
    if (!aiTopic.trim()) return alert("पहिले टॉपिक तो लिखो भाई! 😂");
    if (!managingCourse) return;

    setAiGenerating(true);
    try {
        const response = await fetch("https://generatepremiumnote-hf6vlh5cpq-uc.a.run.app", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: aiTopic,
                packId: managingCourse.id,
                folderId: currentFolderId || null,
                setNumber: contentForm.setNumber 
            })
        });

        const data = await response.json();
        if (data.success) {
            alert("✨ StudyGyaan AI: प्रीमियम नोट (SET " + contentForm.setNumber + ") जोड़ दिया गया है!");
            setAiTopic("");
            fetchCourseContent(managingCourse.id); 
        } else {
            throw new Error(data.error || "Generation failed");
        }
    } catch (err: any) {
        alert("AI Error: " + err.message);
    } finally {
        setAiGenerating(false);
    }
};

const handleAddContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!managingCourse) return;

    const files = fileInputRef.current?.files;
    const hasFiles = files && files.length > 0;
    const hasLink = contentForm.link.trim() !== "";

    if (!hasLink && !hasFiles) { alert("Please Paste a Link OR Select Files!"); return; }

    setUploading(true); 
    setProgressMsg("");

    try {
        const autoFolderPathName = folderPath.map(f => f.name).join(" - ");
        let currentSetNum = contentForm.setNumber;

        if (hasFiles) {
            const totalFiles = files.length;
            for (let i = 0; i < totalFiles; i++) {
                const file = files[i];
                setProgressMsg(`Uploading ${i + 1} of ${totalFiles}...`); 

                const storageRef = ref(storage, `premium_content/${managingCourse.id}/${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const finalLink = await getDownloadURL(snapshot.ref);
                
                const fileNameTitle = file.name.replace(/\.[^/.]+$/, "").replace(/-/g, ' ');
                const finalInternalTitle = contentForm.title || fileNameTitle;

                const smartSeoTitle = contentForm.seoTitle 
                  ? `${contentForm.seoTitle} - ${finalInternalTitle}` 
                  : (autoFolderPathName ? `${autoFolderPathName} - ${finalInternalTitle}` : finalInternalTitle);

                await addDoc(collection(db, `courses/${managingCourse.id}/content`), {
                    title: finalInternalTitle,
                    seoTitle: smartSeoTitle, 
                    link: finalLink,
                    type: 'PDF', 
                    setNumber: currentSetNum,
                    courseId: managingCourse.id,
                    parentId: currentFolderId, 
                    createdAt: serverTimestamp()
                });
                currentSetNum++;
            }
            alert(`✅ Successfully uploaded ${totalFiles} files with Unique SEO!`);
        } else if (hasLink) {
            const finalTitle = contentForm.title || "Untitled Link";
            const smartSeoTitle = contentForm.seoTitle ? `${contentForm.seoTitle} - ${finalTitle}` : finalTitle;

            await addDoc(collection(db, `courses/${managingCourse.id}/content`), {
                title: finalTitle,
                seoTitle: smartSeoTitle, 
                link: contentForm.link,
                type: 'PDF',
                setNumber: currentSetNum,
                courseId: managingCourse.id,
                parentId: currentFolderId, 
                createdAt: serverTimestamp()
            });
            alert("✅ Link Added with Unique SEO!");
            currentSetNum++;
        }

        setContentForm({ title: '', seoTitle: '', link: '', type: 'PDF', setNumber: currentSetNum });
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchCourseContent(managingCourse.id);

    } catch (e:any) { 
        alert("Upload Failed: " + e.message); 
    } finally { 
        setUploading(false);
        setProgressMsg("");
    }
};

const handleDeleteContent = async (id: string) => {
    if(confirm("Delete content?")) {
        await deleteDoc(doc(db, `courses/${managingCourse?.id}/content`, id));
        if(managingCourse) fetchCourseContent(managingCourse.id);
    }
};

  return (
    <div className="bg-white rounded-lg md:rounded-2xl shadow-lg border p-3 md:p-8 animate-in fade-in w-full overflow-hidden font-hindi">
        
        {/* 🔥 एडमिन पैनल के लिए डायनामिक टाइटल सेटअप */}
        <SEO 
            customTitle={managingCourse ? `Manage Content: ${managingCourse.title} | Admin` : "Premium Notes Management | StudyGyaan Admin"} 
            customDescription="Admin control panel for managing premium study notes, uploading PDFs and generating AI content."
        />

        {managingCourse ? (
            <div>
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 md:p-6 rounded-xl md:rounded-2xl border-2 border-purple-100 mb-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-purple-600 rounded-lg text-white">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h4 className="font-black text-purple-900 text-sm md:text-lg uppercase">AI Premium Note Creator</h4>
                            <p className="text-[10px] md:text-xs text-purple-600 font-bold uppercase tracking-widest">StudyGyaan Pattern: Header + 25 Q&A + Logics</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
                        <input 
                            value={aiTopic}
                            onChange={(e) => setAiTopic(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleGenerateAINote()}
                            placeholder="Enter Topic (e.g. Percentage, Mughal Empire, Blood Relation)" 
                            className="flex-1 p-3 md:p-4 rounded-xl border-2 border-purple-100 focus:border-purple-400 outline-none font-bold text-sm md:text-base shadow-inner bg-white"
                        />
                        <button 
                            onClick={handleGenerateAINote}
                            disabled={aiGenerating}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 md:py-4 rounded-xl font-black text-sm md:text-base flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-purple-200 disabled:opacity-50"
                        >
                            {aiGenerating ? (
                                <><Loader2 className="animate-spin" size={20} /> Generating...</>
                            ) : (
                                <><Sparkles size={20} /> Generate AI Note</>
                            )}
                        </button>
                    </div>
                </div>

                <button onClick={() => { setManagingCourse(null); setFolderPath([]); setCurrentFolderId(null); }} className="text-gray-500 mb-3 md:mb-6 font-bold flex items-center gap-1.5 md:gap-2 hover:text-gray-800 text-[10px] md:text-base">
                  <ArrowLeft className="w-3.5 h-3.5 md:w-5 md:h-5"/> Back to All Notess
                </button>
                
                <div className="bg-blue-50/50 p-3 md:p-6 rounded-lg md:rounded-2xl border border-blue-100 mb-4 md:mb-8">
                    <h3 className="text-sm md:text-xl font-black mb-2 md:mb-4 text-blue-900 border-b border-blue-200 pb-1.5 md:pb-2">
                        Managing: {managingCourse.title}
                    </h3>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4 mb-3 md:mb-6">
                        <div className="flex items-center gap-1.5 md:gap-2 text-[8px] md:text-sm bg-white px-2 py-1 md:px-4 md:py-2 rounded-md md:rounded-xl shadow-sm border border-blue-100 w-full md:w-auto overflow-x-auto hide-scrollbar">
                            <button onClick={() => navigateToBreadcrumb(-1)} className="flex items-center gap-1 text-blue-600 hover:underline font-bold whitespace-nowrap shrink-0">
                                <Home className="w-3 h-3 md:w-4 md:h-4"/> Root
                            </button>
                            {folderPath.map((folder, index) => (
                                <div key={folder.id} className="flex items-center gap-1 md:gap-2 shrink-0">
                                    <ChevronRight className="w-3 h-3 md:w-4 md:h-4 text-gray-400"/>
                                    <button 
                                        onClick={() => navigateToBreadcrumb(index)} 
                                        className={`hover:underline whitespace-nowrap ${index === folderPath.length - 1 ? "font-black text-gray-800" : "text-blue-600"}`}
                                    >
                                        {folder.name}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={handleCreateFolder} 
                            className="bg-white text-blue-700 border md:border-2 border-blue-200 px-3 py-1.5 md:px-5 md:py-2 rounded-md md:rounded-xl font-bold flex items-center gap-1.5 md:gap-2 hover:bg-blue-50 hover:border-blue-300 transition shadow-sm w-full md:w-auto justify-center text-[10px] md:text-base shrink-0"
                        >
                            <FolderPlus className="w-4 h-4 md:w-5 md:h-5"/> Create New Folder
                        </button>
                    </div>

                    <form onSubmit={handleAddContent} className="flex flex-col gap-2.5 md:gap-4 bg-white p-3 md:p-6 rounded-lg md:rounded-2xl border border-blue-100 shadow-sm">
                        <div className="border border-dashed md:border-2 border-blue-200 bg-blue-50/30 p-3 md:p-6 rounded-md md:rounded-xl text-center cursor-pointer hover:bg-blue-50 transition" onClick={() => fileInputRef.current?.click()}>
                            <input type="file" ref={fileInputRef} multiple accept=".pdf,.doc,.docx" className="hidden" />
                            <UploadCloud className="mx-auto text-blue-500 mb-1 md:mb-2 w-6 h-6 md:w-8 md:h-8"/>
                            <p className="font-bold text-gray-700 text-[10px] md:text-base">Click to Select Files (PDFs)</p>
                        </div>
                        
                        <div className="bg-yellow-50/30 p-2 md:p-4 rounded-md md:rounded-xl border border-yellow-100">
                            <label className="text-[7px] md:text-[10px] font-black text-yellow-600 uppercase mb-0.5 md:mb-1 block">SEO Attractive Title (For all files/links added below)</label>
                            <div className="relative">
                               <Globe className="absolute left-2 top-2 md:left-3 md:top-3 text-yellow-400 w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/>
                               <input value={contentForm.seoTitle} onChange={e=>setContentForm({...contentForm, seoTitle: e.target.value})} placeholder="e.g. SSC CGL 2026: Maths Best Notes" className="w-full pl-7 md:pl-10 p-1.5 md:p-3 border rounded-md md:rounded-xl font-bold bg-white outline-none focus:ring-1 md:focus:ring-2 focus:ring-yellow-400 text-[10px] md:text-base"/>
                            </div>
                        </div>

                        <div className="flex items-center justify-center text-gray-400 font-bold text-[8px] md:text-xs uppercase tracking-widest">- OR ADD LINK -</div>
                        
                        <div className="flex flex-col md:flex-row gap-1.5 md:gap-2">
                            <input value={contentForm.title} onChange={e=>setContentForm({...contentForm, title: e.target.value})} placeholder="Internal Title" className="border p-1.5 md:p-3 rounded-md md:rounded-lg flex-1 font-medium text-[10px] md:text-base"/>
                            <input value={contentForm.link} onChange={e=>setContentForm({...contentForm, link: e.target.value})} placeholder="Paste Set URL" className="border p-1.5 md:p-3 rounded-md md:rounded-lg flex-1 text-[10px] md:text-base"/>
                            <div className="border p-1.5 md:p-3 rounded-md md:rounded-lg bg-white font-bold text-[10px] md:text-base flex items-center gap-1">
                                <span className="text-gray-400">SET</span>
                                <select value={contentForm.setNumber} onChange={e=>setContentForm({...contentForm, setNumber: parseInt(e.target.value)})} className="outline-none bg-transparent text-blue-700">
                                    {[...Array(1000)].map((_, i) => (
                                        <option key={i+1} value={i+1}>{i+1}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <button className="bg-blue-600 hover:bg-blue-700 text-white p-2 md:px-6 md:py-3 rounded-md md:rounded-lg font-bold flex items-center justify-center gap-1.5 md:gap-2 transition active:scale-95" disabled={uploading}>
                                {uploading ? (
                                    <>
                                        <Loader2 className="animate-spin w-3 h-3 md:w-5 md:h-5" /> 
                                        <span className="text-[10px] md:text-sm">{progressMsg || "Uploading..."}</span>
                                    </>
                                ) : (
                                    <PlusCircle className="w-4 h-4 md:w-5 md:h-5"/>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="space-y-1.5 md:space-y-3">
                    <h4 className="font-bold text-gray-400 text-[9px] md:text-xs uppercase ml-1">
                        Contents ({visibleContent.length})
                    </h4>

                    {visibleContent.filter(c => c.type === 'FOLDER').map(folder => (
                        <div key={folder.id} onClick={() => enterFolder(folder.id, folder.title)} className="flex justify-between items-center p-2.5 md:p-4 border md:border-2 border-yellow-100 bg-yellow-50 rounded-lg md:rounded-xl cursor-pointer hover:border-yellow-300 hover:shadow-md transition group">
                            <div className="flex items-center gap-2 md:gap-3">
                                <Folder className="text-yellow-600 fill-yellow-200 w-5 h-5 md:w-6 md:h-6"/>
                                <span className="font-bold text-yellow-900 text-xs md:text-lg">{folder.title}</span>
                            </div>
                            <div className="flex gap-1 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                                <button onClick={(e) => { e.stopPropagation(); handleRenameContent(folder.id, folder.title); }} className="p-1 md:p-2 bg-white rounded md:rounded-lg text-purple-500 hover:text-purple-700"><FilePenLine className="w-3.5 h-3.5 md:w-4 md:h-4"/></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteContent(folder.id); }} className="p-1 md:p-2 bg-white rounded md:rounded-lg text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4"/></button>
                            </div>
                        </div>
                    ))}

                    {visibleContent.filter(c => c.type !== 'FOLDER').map(content => (
                        <div key={content.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-2.5 md:p-4 border rounded-lg md:rounded-xl bg-white hover:shadow-sm transition group gap-2 md:gap-0">
                            <div className="flex items-center gap-2 md:gap-3 overflow-hidden flex-1">
                                <div className={`p-1.5 md:p-2 rounded md:rounded-lg shrink-0 ${content.type === 'PDF' || content.type === 'article' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {content.type === 'PDF' || content.type === 'article' ? <FileText className="w-4 h-4 md:w-5 md:h-5"/> : <Video className="w-4 h-4 md:w-5 md:h-5"/>}
                                </div>
                                <div className="truncate flex-1">
                                    <p className="font-bold text-gray-800 text-[10px] md:text-base truncate">{content.seoTitle || content.title}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 md:gap-2 text-[8px] md:text-xs text-gray-400 mt-0.5">
                                        <span className="bg-blue-100 text-blue-700 px-1.5 rounded font-black whitespace-nowrap">SET {content.dynamicSetNum}</span>
                                        <span className="text-[7px] md:text-[10px] text-gray-300">| {content.type === 'article' ? 'AI ARTICLE' : 'ID: ' + content.title}</span>
                                        {content.type !== 'FOLDER' && content.link && <a href={content.link} target="_blank" className="text-blue-500 hover:underline flex items-center gap-0.5 md:gap-1" onClick={(e)=>e.stopPropagation()}><ExternalLink className="w-2.5 h-2.5 md:w-3 md:h-3"/> View</a>}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex gap-1 md:gap-2 self-end sm:self-auto">
                                <a href={`/pdf/${content.id}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500 p-1.5 md:p-2 bg-emerald-50 md:bg-transparent hover:bg-emerald-100 rounded md:rounded-lg transition inline-flex items-center justify-center" title="View Note"><Eye className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/></a>
                                
                                <button onClick={() => copyToClipboard(content.id)} className="text-blue-500 p-1.5 md:p-2 bg-blue-50 md:bg-transparent hover:bg-blue-100 rounded md:rounded-lg transition" title="Copy Link"><Copy className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/></button>
                                <button onClick={() => handleRenameContent(content.id, content.seoTitle || content.title)} className="text-purple-500 p-1.5 md:p-2 bg-purple-50 md:bg-transparent hover:bg-purple-100 rounded md:rounded-lg transition" title="Rename"><FilePenLine className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/></button>
                                <button onClick={() => handleDeleteContent(content.id)} className="text-red-500 p-1.5 md:p-2 bg-red-50 md:bg-transparent hover:bg-red-100 rounded md:rounded-lg transition" title="Delete"><Trash2 className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/></button>
                            </div>
                        </div>
                    ))}

                    {visibleContent.length === 0 && (
                        <div className="text-center py-6 md:py-12 border border-dashed md:border-2 rounded-xl md:rounded-2xl bg-gray-50">
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[8px] md:text-xs">Folder is empty</p>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 md:gap-0 mb-4 md:mb-6">
                    <h3 className="text-base md:text-2xl font-black flex items-center gap-1.5 md:gap-2 text-gray-800"><Crown className="text-yellow-500 w-5 h-5 md:w-6 md:h-6"/> Premium Notess</h3>
                    <button onClick={() => setShowUploadForm(true)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 md:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl font-black text-[10px] md:text-base flex justify-center items-center gap-1.5 md:gap-2 transition shadow-lg shadow-yellow-100 active:scale-95 w-full sm:w-auto"><PlusCircle className="w-4 h-4 md:w-5 md:h-5"/> New Notes</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                    {courses.map((course, index) => (
                        <div key={course.id} className="border md:border-2 p-3 md:p-6 rounded-2xl md:rounded-3xl text-center hover:shadow-2xl transition-all relative group bg-white border-yellow-50 hover:border-yellow-300">
                            
                            <div className="absolute top-2 left-2 md:top-4 md:left-4 flex flex-col gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className={`p-1 md:p-1.5 rounded-md md:rounded-lg shadow-sm border bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-white`} title="Move Up"><ChevronUp size={16} /></button>
                                <button onClick={() => handleMove(index, 'down')} disabled={index === courses.length - 1} className={`p-1 md:p-1.5 rounded-md md:rounded-lg shadow-sm border bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-white`} title="Move Down"><ChevronDown size={16} /></button>
                            </div>

                            <div className="absolute top-2 right-2 md:top-4 md:right-4 opacity-100 md:opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col md:flex-row gap-1 md:gap-0">
                                <button className="text-blue-500 p-1.5 md:p-2.5 bg-blue-50 hover:bg-blue-100 rounded-md md:rounded-xl md:mr-2 transition" onClick={() => { setEditingCourse(course); setFormData({ title: course.title, price: course.price, paymentLink: course.paymentLink || '', description: course.description, lockMessage: course.lockMessage || '', features: course.features || [] }); }}><Edit className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/></button>
                                <button className="text-red-500 p-1.5 md:p-2.5 bg-red-50 hover:bg-red-100 rounded-md md:rounded-xl transition" onClick={() => handleDeleteItem(course.id)}><Trash2 className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]"/></button>
                            </div>
                            
                            <div className="w-8 h-8 md:w-16 md:h-16 mx-auto bg-yellow-50 rounded-lg md:rounded-2xl flex items-center justify-center mb-2 md:mb-5 shadow-inner"><Crown className="text-yellow-500 w-4 h-4 md:w-8 md:h-8"/></div>
                            <h4 className="text-[10px] md:text-xl font-black mb-0.5 md:mb-1 text-gray-800 uppercase tracking-tight">{course.title}</h4>
                            <p className="text-[8px] md:text-sm text-gray-400 mb-2 md:mb-5 line-clamp-2 font-medium px-1 md:px-4">{course.description}</p>
                            
                            <div className="flex flex-wrap items-center justify-center gap-1 md:gap-2 mb-3 md:mb-8">
                                <span className="line-through text-gray-400 text-[8px] md:text-sm font-bold italic">
                                  Rs.{globalSettings?.mrpPrice || '499'}
                                </span>
                                <span className="text-red-500 font-black text-[8px] md:text-sm">
                                  {globalSettings?.discountPercent || '85'}% OFF
                                </span>
                                <div className="font-black text-emerald-600 bg-emerald-50 inline-block px-2 md:px-5 py-0.5 md:py-1.5 rounded-full text-[9px] md:text-lg shadow-sm border border-emerald-100 uppercase tracking-tighter">
                                    Rs.{Math.round((globalSettings?.mrpPrice || 499) * (1 - (globalSettings?.discountPercent || 85) / 100))}
                                </div>
                            </div>

                            <button onClick={() => { setManagingCourse(course); fetchCourseContent(course.id); }} className="w-full bg-gray-900 hover:bg-black text-white py-2 md:py-3.5 rounded-lg md:rounded-2xl font-black transition-all shadow-xl active:scale-95 uppercase tracking-widest text-[8px] md:text-xs">Manage Content</button>
                        </div>
                    ))}
                </div>
            </>
        )}

        {(showUploadForm || editingCourse) && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
              <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] border md:border-2 border-yellow-100 relative animate-in zoom-in-95 duration-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <button onClick={() => { setShowUploadForm(false); setEditingCourse(null); setFormData({ title: '', price: '499', paymentLink: '', description: '', lockMessage: '', features: [] }); }} className="absolute top-3 right-3 md:top-6 md:right-6 text-gray-300 hover:text-red-500 transition"><X className="w-5 h-5 md:w-7 md:h-7"/></button>
                <h4 className="text-sm md:text-2xl font-black mb-3 md:mb-6 text-gray-800 uppercase tracking-tight pr-6">{editingCourse ? `Edit Notes` : 'Create New Notes'}</h4>
                <form onSubmit={editingCourse ? handleUpdateNotes : handleCreateNotes} className="space-y-3 md:space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                        <div><label className="text-[7px] md:text-[10px] font-black text-gray-400 uppercase mb-0.5 md:mb-1 block">Notes Name</label><input value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full p-2 md:p-4 bg-gray-50 border-none rounded-lg md:rounded-2xl focus:ring-1 md:focus:ring-2 focus:ring-yellow-400 outline-none font-black text-[10px] md:text-base" placeholder="SSC Dhamaka 2026" required/></div>
                        <div><label className="text-[7px] md:text-[10px] font-black text-gray-400 uppercase mb-0.5 md:mb-1 block">Internal MRP (₹)</label><input value={formData.price} onChange={e=>setFormData({...formData, price: e.target.value})} className="w-full p-2 md:p-4 bg-gray-50 border-none rounded-lg md:rounded-2xl focus:ring-1 md:focus:ring-2 focus:ring-yellow-400 outline-none font-black text-[10px] md:text-base" placeholder="499" type="number" required/></div>
                    </div>
                    
                    <div>
                        <label className="text-[7px] md:text-[10px] font-black text-blue-600 uppercase mb-0.5 md:mb-1 block flex items-center gap-1.5">
                            <Link size={12}/> Secure Payment Link
                        </label>
                        <input value={formData.paymentLink} onChange={e=>setFormData({...formData, paymentLink: e.target.value})} className="w-full p-2 md:p-4 bg-blue-50/30 border border-blue-100 rounded-lg md:rounded-2xl focus:ring-1 md:focus:ring-2 focus:ring-blue-400 outline-none font-bold text-[10px] md:text-base text-blue-800" placeholder="Paste payment gateway URL here..." />
                    </div>

                    <div><label className="text-[7px] md:text-[10px] font-black text-gray-400 uppercase mb-0.5 md:mb-1 block">Short Description</label><textarea value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} className="w-full p-2 md:p-4 bg-gray-50 border-none rounded-lg md:rounded-2xl focus:ring-1 md:focus:ring-2 focus:ring-yellow-400 outline-none font-bold h-16 md:h-24 resize-none text-[10px] md:text-base" placeholder="Mention subjects and exam years..." /></div>

                    <div className="bg-blue-50/50 p-3 md:p-6 rounded-xl md:rounded-3xl border border-blue-100 space-y-2.5 md:space-y-4 shadow-inner">
                        <h4 className="text-[9px] md:text-xs font-black text-blue-700 uppercase flex items-center gap-1.5 md:gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 md:w-5 md:h-5" /> Premium Display Settings (For SEO)
                        </h4>
                        <div>
                            <label className="text-[7px] md:text-[10px] font-black text-gray-400 mb-0.5 md:mb-1 block uppercase tracking-widest">Lock Screen Message</label>
                            <textarea name="lockMessage" value={formData.lockMessage} onChange={e=>setFormData({...formData, lockMessage: e.target.value})} placeholder="Explain why they should buy this..." className="w-full p-2 md:p-4 bg-white border border-blue-100 rounded-lg md:rounded-2xl font-bold text-[10px] md:text-sm h-12 md:h-20 resize-none outline-none focus:ring-1 md:focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div>
                            <label className="text-[7px] md:text-[10px] font-black text-gray-400 mb-0.5 md:mb-1 block uppercase tracking-widest">Notes Features (True Features)</label>
                            <div className="flex flex-col sm:flex-row gap-1.5 md:gap-2 mb-2 md:mb-3">
                                <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())} placeholder="e.g. Bilingual Support" className="flex-1 p-2 md:p-3 bg-white border border-blue-100 rounded-md md:rounded-xl font-black text-[10px] md:text-sm outline-none" />
                                <button type="button" onClick={addFeature} className="bg-blue-600 text-white px-3 md:px-5 py-2 md:py-0 rounded-md md:rounded-xl font-black hover:bg-blue-700 transition text-[10px] md:text-base shrink-0">Add</button>
                            </div>
                            <div className="flex flex-wrap gap-1 md:gap-2">
                                {formData.features?.map((feat, idx) => (
                                    <div key={idx} className="bg-blue-600 text-white px-2 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black flex items-center gap-1 md:gap-2 shadow-lg shadow-blue-500/20">
                                        <CheckCircle className="w-2.5 h-2.5 md:w-3 md:h-3" /> {feat}
                                        <button type="button" onClick={() => removeFeature(idx)} className="text-blue-200 hover:text-white"><X className="w-2.5 h-2.5 md:w-3 md:h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 md:py-4 rounded-xl md:rounded-3xl font-black text-[10px] md:text-xl shadow-xl shadow-yellow-500/20 transition-all active:scale-95" disabled={loading}>{loading ? "Saving..." : editingCourse ? "Update Notes" : "Launch Notes"}</button>
                </form>
              </div>
            </div>
        )}
    </div>
  );
};

export default PremiumTab;