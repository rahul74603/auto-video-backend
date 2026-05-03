// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth, storage } from '../firebase/config'; 
import { onAuthStateChanged } from 'firebase/auth'; 
import { collection, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css'; 
import { Flame, Link as LinkIcon, Sparkles, PlusCircle, Edit, Trash2, X, ShieldAlert, Image as ImageIcon, Save, Globe, UploadCloud, Wand2 } from 'lucide-react';
const AdminBlogWriter = () => {
  const API_BASE_URL = "https://api-hf6vlh5cpq-uc.a.run.app";
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const [aiGenerating, setAiGenerating] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [author, setAuthor] = useState('Rahul Sir');
  const [imageUrl, setImageUrl] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [blogsList, setBlogsList] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [rambanText, setRambanText] = useState('');
  const [rambanLink, setRambanLink] = useState('');

  const [seoDesc, setSeoDesc] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const quillRef = useRef(null); 

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email === ADMIN_EMAIL) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [ADMIN_EMAIL]);

  const fetchBlogs = async () => {
    try {
      const q = query(collection(db, "blogs"), orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      const blogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBlogsList(blogs);
    } catch (error) {
      console.error("Error fetching blogs:", error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBlogs(); 
    }
  }, [user]);

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; 
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob) {
              const newFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
              resolve(newFile);
            } else {
              resolve(file); 
            }
          }, 'image/jpeg', 0.7); 
        };
      };
    });
  };

  const handleCoverUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const compressedFile = await compressImage(file);
      const storageRef = ref(storage, `blog_covers/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);
      setImageUrl(url); 
    } catch (error) {
      console.error("Upload failed", error);
      alert("फोटो अपलोड नहीं हो पाई!");
    } finally {
      setImageUploading(false);
    }
  };

  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files ? input.files[0] : null;
      if (!file) return;
      try {
        const compressedFile = await compressImage(file);
        const storageRef = ref(storage, `blog_content_images/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, compressedFile);
        const url = await getDownloadURL(storageRef);
        
        // @ts-ignore
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', url);
      } catch (e) {
        alert("Editor image upload failed!");
      }
    };
  };

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link', 'image'], 
        ['clean'],
        [{ 'color': [] }, { 'background': [] }]
      ],
      handlers: {
        image: imageHandler 
      }
    }
  }), []);

  const addRambanBox = () => {
    if (!rambanText || !rambanLink) {
      alert("पार्टनर, टेक्स्ट और लिंक दोनों डालो तभी तो मैजिक होगा! ✨");
      return;
    }

    const rambanHtml = `
      <div style="margin: 20px 0; padding: 15px; background: linear-gradient(to right, #fff1f2, #fffbeb); border: 2px dashed #f59e0b; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.2);">
        <p style="margin: 0; font-family: 'Hindi', sans-serif; font-weight: 900; color: #b45309; font-size: 16px;">🔥 रामबाण जानकारी ⭐</p>
        <a href="${rambanLink}" target="_blank" style="display: inline-block; margin-top: 10px; text-decoration: none; color: #1d4ed8; font-weight: 900; font-size: 18px; border-bottom: 2px solid #1d4ed8;">
          ${rambanText} ➔
        </a>
      </div>
      <p><br></p>
    `;

    setContent(content + rambanHtml);
    setRambanText('');
    setRambanLink('');
    alert("जादुई बॉक्स जुड़ गया! अब इसे एडिटर में चेक करें। 🚀");
  };
const handleAIGenerateBlog = async () => {
  if (!title) {
    alert("पहले Topic/Title डालो ✍️");
    return;
  }

  try {
    setAiGenerating(true);

    const res = await fetch(`${API_BASE_URL}/generate-blog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ topic: title })
    });

    const data = await res.json();
if (data.success && data.data) {
  setTitle(data.data.title || "");
  setContent(data.data.content || "");
  setSeoDesc(data.data.metaDescription || "");
  setImageUrl(data.data.imageUrl || ""); 
  setSeoKeywords(
    Array.isArray(data.data.tags)
      ? data.data.tags.join(", ")
      : ""
  );

  alert("✨ AI Blog Generated Successfully!\n(यह डेटाबेस में सेव हो चुका है और Telegram पर भी जा चुका है!)");
  fetchBlogs(); 
} else {
  alert("AI generation failed");
}

  } catch (err) {
    console.error(err);
    alert("Server error during AI generation");
  } finally {
    setAiGenerating(false);
  }
};
  const handlePublish = async (action: 'publish' | 'draft') => {
    if (!title || !content) {
      alert('भाई, कम से कम Title और Content तो डालना पड़ेगा! 😅');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        category: category || 'General',
        author,
        imageUrl: imageUrl || 'https://via.placeholder.com/1200x600?text=StudyGyaan',
        content,
        seoDesc, 
        seoKeywords, 
        status: action 
      };

      if (editingId) {
        const blogRef = doc(db, 'blogs', editingId);
        await updateDoc(blogRef, payload);
        
        // Update Sidebar if Title changed
        try {
            const settingsRef = doc(db, 'site_settings', 'global');
            const settingsSnap = await getDoc(settingsRef);
            if(settingsSnap.exists() && action === 'publish') {
                const currentData = settingsSnap.data();
                const currentRelated = currentData.relatedBlogs || [];
                const updatedRelated = currentRelated.map((item: any) => 
                    item.url === `/blog/${editingId}` ? { ...item, title: title } : item
                );
                await updateDoc(settingsRef, { relatedBlogs: updatedRelated });
            }
        } catch(e) {}

        alert(action === 'draft' ? '✅ ड्राफ्ट सेव हो गया!' : '✅ कमाल है! आपका ब्लॉग सफलतापूर्वक अपडेट हो गया है!');
      } else {
        const docRef = await addDoc(collection(db, 'blogs'), {
          ...payload,
          date: serverTimestamp(),
        });
        
        if (action === 'publish') {
          try {
            const newBlogId = docRef.id;
            const settingsRef = doc(db, 'site_settings', 'global');
            const settingsSnap = await getDoc(settingsRef);
            
            if(settingsSnap.exists()) {
               const currentData = settingsSnap.data();
               const currentRelated = currentData.relatedBlogs || [];
               
               const newSidebarLink = { title: title, url: `/blog/${newBlogId}` };
               const updatedRelated = [newSidebarLink, ...currentRelated].slice(0, 5);
               
               await updateDoc(settingsRef, { relatedBlogs: updatedRelated });
            }
          } catch (sidebarErr) {
            console.log("Sidebar auto-update skipped:", sidebarErr);
          }

        
        }

        alert(action === 'draft' ? '📝 नया ब्लॉग ड्राफ्ट में सेव हो गया!' : '🎉 बधाई हो! आपका नया ब्लॉग वेबसाइट और Telegram पर लाइव हो गया!');
      }
      
      cancelEdit();
      fetchBlogs();
    } catch (error) {
      console.error('Error saving blog: ', error);
      alert('कुछ गड़बड़ हो गई भाई, फिर से ट्राई करो।');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (blog: any) => {
    setEditingId(blog.id);
    setTitle(blog.title || '');
    setCategory(blog.category || '');
    setAuthor(blog.author || 'Rahul Sir');
    setImageUrl(blog.imageUrl || '');
    setContent(blog.content || '');
    setSeoDesc(blog.seoDesc || ''); 
    setSeoKeywords(blog.seoKeywords || ''); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setCategory('');
    setAuthor('Rahul Sir');
    setImageUrl('');
    setContent('');
    setSeoDesc('');
    setSeoKeywords('');
  };

  // ✅ SUPER DELETER FUNCTION ADDED HERE
  const handleDelete = async (id: string, blogTitle: string) => {
    const isConfirmed = window.confirm(`⚠️ चेतावनी!\nक्या आप सच में "${blogTitle}" ब्लॉग को हमेशा के लिए मिटाना (Delete) चाहते हैं?`);
    if (!isConfirmed) return;

    try {
      // 1. Delete from Main Blogs Collection
      await deleteDoc(doc(db, "blogs", id));

      // 2. Delete strictly from Sidebar (Trending Articles)
      try {
          const settingsRef = doc(db, 'site_settings', 'global');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
              const currentData = settingsSnap.data();
              const currentRelated = currentData.relatedBlogs || [];
              // Filter out the deleted blog by matching the URL
              const updatedRelated = currentRelated.filter((item: any) => item.url !== `/blog/${id}`);
              await updateDoc(settingsRef, { relatedBlogs: updatedRelated });
          }
      } catch (sidebarErr) {
          console.log("Error removing from sidebar:", sidebarErr);
      }

      alert("🗑️ ब्लॉग हमेशा के लिए डिलीट हो गया (साइडबार से भी)!");
      fetchBlogs(); 
      if (editingId === id) cancelEdit(); 
    } catch (error) {
      console.error("Delete Error:", error);
      alert("डिलीट करने में समस्या आई।");
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 font-black text-blue-600">Checking Security Clearance... 🛡️</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 font-hindi">
        <div className="bg-white p-10 rounded-2xl shadow-2xl text-center border-t-8 border-red-600 max-w-md">
          <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-4 animate-bounce" />
          <h1 className="text-2xl font-black text-gray-800 mb-2">ACCESS DENIED! 🛑</h1>
          <p className="text-gray-500 font-bold mb-6">आपके पास इस पेज को खोलने की अनुमति (Permission) नहीं है।</p>
          <p className="text-xs text-gray-400">सिर्फ Admin (मालिक) ही ब्लॉग लिख या मिटा सकता है।</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 font-hindi">
      
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-2xl mb-12 relative border-t-8 border-blue-600">
        
        {editingId && (
            <div className="absolute -top-4 right-4 bg-red-100 text-red-600 px-4 py-1 rounded-full font-black text-sm flex items-center gap-2 border border-red-200 shadow-md">
                <span>Editing Mode Active</span>
                <button onClick={cancelEdit} className="hover:bg-red-200 p-1 rounded-full"><X size={14}/></button>
            </div>
        )}

        <h1 className="text-3xl font-black text-blue-900 mb-6 border-b pb-4 flex items-center gap-3">
          {editingId ? "✏️ Edit Your Blog" : "✍️ StudyGyaan - Secret Blog Writer"} <Sparkles className="text-yellow-500" />
        </h1>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          
          <div>
            <label className="block text-gray-700 font-bold mb-2">ब्लॉग का टाइटल (Title)</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="जैसे: RRB ALP 2026 की तैयारी कैसे करें?"
              className="w-full border-2 border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 font-bold text-lg"
            />
            <div className="flex justify-end mt-3">
  <button
    type="button"
    onClick={handleAIGenerateBlog}
    disabled={aiGenerating}
    className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-2 rounded-xl font-black flex items-center gap-2 shadow-lg hover:scale-105 transition-all disabled:opacity-50"
  >
    <Wand2 size={16} />
    {aiGenerating ? "Generating..." : "Generate Blog with AI"}
  </button>
</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-700 font-bold mb-2">कैटेगरी (Category)</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border-2 border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 bg-white font-bold text-gray-700"
              >
                <option value="">-- कैटेगरी चुनें --</option>
                <option value="Syllabus & Pattern">Syllabus & Pattern</option>
                <option value="Exam Strategy">Exam Strategy</option>
                <option value="Job Profile">Job Profile</option>
                <option value="Previous Papers">Previous Papers</option>
                <option value="Cutoff Analysis">Cutoff Analysis</option>
                <option value="Admit Card">Admit Card</option>
                <option value="Results">Results</option>
                <option value="General Info">General Info</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">लेखक (Author)</label>
              <input 
                type="text" 
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full border-2 border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 bg-gray-50 font-bold"
              />
            </div>
          </div>

          <div className="bg-blue-50 p-5 rounded-2xl border-2 border-dashed border-blue-200">
             <label className="block text-blue-900 font-black mb-3 flex items-center gap-2"><ImageIcon size={18}/> कवर फोटो अपलोड करें (Direct Upload)</label>
             <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 w-full relative">
                   <input type="file" accept="image/*" onChange={handleCoverUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                   <div className="bg-white border-2 border-blue-300 border-dashed rounded-xl p-4 text-center text-blue-600 font-bold hover:bg-blue-100 transition flex flex-col items-center justify-center gap-2">
                      {imageUploading ? <><UploadCloud className="animate-bounce"/> Uploading & Compressing...</> : <><UploadCloud/> Click Here to Upload Photo</>}
                   </div>
                </div>
                <div className="text-gray-400 font-black">OR</div>
                <input 
                  type="text" 
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Paste Image URL here..."
                  className="flex-1 w-full border-2 border-white shadow-sm p-3 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
                />
             </div>
             {imageUrl && (
                <div className="mt-4 border-4 border-white shadow-lg rounded-xl overflow-hidden w-full max-w-[200px] aspect-video relative mx-auto md:mx-0">
                   <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
             )}
          </div>

          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 p-5 rounded-2xl border-2 border-dashed border-orange-300">
            <h3 className="text-orange-700 font-black flex items-center gap-2 mb-4">
              <Flame size={20} className="animate-pulse" /> रामबाण लिंक बॉक्स (Click Magnet)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input 
                type="text" 
                placeholder="चटपटा टेक्स्ट (जैसे: 5000+ रिपीट सवाल यहाँ देखें)" 
                value={rambanText}
                onChange={(e) => setRambanText(e.target.value)}
                className="p-3 rounded-xl border-2 border-white shadow-sm focus:border-orange-500 outline-none font-bold text-sm"
              />
              <input 
                type="text" 
                placeholder="ब्लॉग या PDF का लिंक डालें" 
                value={rambanLink}
                onChange={(e) => setRambanLink(e.target.value)}
                className="p-3 rounded-xl border-2 border-white shadow-sm focus:border-orange-500 outline-none font-mono text-xs"
              />
            </div>
            <button 
              type="button"
              onClick={addRambanBox}
              className="bg-orange-500 text-white px-6 py-2 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-orange-600 transition-all shadow-md active:scale-95"
            >
              <PlusCircle size={18} /> आर्टिकल के बीच में चिपकाएँ
            </button>
          </div>

          <div className="mb-12">
            <label className="block text-gray-700 font-bold mb-2">पूरी कहानी यहाँ लिखें (Content)</label>
            <div className="h-96 mb-12 md:mb-10">
              <ReactQuill 
                ref={quillRef} 
                theme="snow" 
                value={content} 
                onChange={setContent} 
                modules={quillModules} 
                className="h-full rounded-lg bg-white"
                placeholder="यहाँ से लिखना शुरू करें... अब आप Toolbar से Photo भी डाल सकते हैं!"
              />
            </div>
          </div>

          <div className="bg-purple-50 p-5 rounded-2xl border-2 border-purple-100 mb-6">
            <h3 className="text-purple-800 font-black flex items-center gap-2 mb-4">
              <Globe size={20} /> Google SEO Settings (रैंकिंग के लिए)
            </h3>
            <div className="space-y-3">
               <div>
                  <label className="block text-[10px] font-bold text-purple-600 uppercase mb-1">Meta Description (Short Summary)</label>
                  <textarea value={seoDesc} onChange={e => setSeoDesc(e.target.value)} rows={2} className="w-full p-3 rounded-xl border border-white shadow-sm text-sm outline-none focus:border-purple-400" placeholder="Google पर दिखने वाली 2 लाइन की जानकारी..."></textarea>
               </div>
               <div>
                  <label className="block text-[10px] font-bold text-purple-600 uppercase mb-1">Keywords (Tags)</label>
                  <input value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} className="w-full p-3 rounded-xl border border-white shadow-sm text-sm outline-none focus:border-purple-400" placeholder="rrb alp tips, ssc strategy, etc." />
               </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 pt-4 border-t-2 border-gray-100">
            <button 
              type="button" 
              onClick={() => handlePublish('draft')}
              disabled={loading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-lg py-4 rounded-xl shadow-sm transition-transform active:scale-95 flex justify-center items-center gap-2"
            >
              <Save size={20}/> {loading ? 'Saving...' : 'Save as Draft'}
            </button>
            
            <button 
              type="button" 
              onClick={() => handlePublish('publish')}
              disabled={loading}
              className={`flex-[2] text-white font-black text-xl py-4 rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-95 ${loading ? 'bg-gray-400' : editingId ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}
            >
              {loading ? 'Please Wait... ⏳' : editingId ? '🔄 Update Live Blog' : '🚀 Publish to Website'}
            </button>
          </div>

          {editingId && (
             <button type="button" onClick={cancelEdit} className="w-full mt-3 py-3 text-red-600 font-bold hover:bg-red-50 rounded-xl transition-colors">
                Cancel Edit
             </button>
          )}

        </form>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-xl border-t-8 border-slate-800">
         <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2 border-b pb-4">
            📚 All Written Blogs
            <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{blogsList.length} Total</span>
         </h2>

         {blogsList.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-bold">अभी तक कोई ब्लॉग नहीं लिखा गया है।</div>
         ) : (
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                        <th className="p-4 rounded-tl-xl">Title & Status</th>
                        <th className="p-4">Category</th>
                        <th className="p-4 rounded-tr-xl text-center">Action</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                     {blogsList.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/50 transition-colors group">
                           <td className="p-4 max-w-[250px]">
                              <div className="font-bold text-slate-700 truncate" title={b.title}>{b.title}</div>
                              {b.status === 'draft' ? 
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-black uppercase">Draft</span> : 
                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-black uppercase">Published</span>
                              }
                           </td>
                           <td className="p-4 text-sm text-slate-500 font-bold">{b.category}</td>
                           <td className="p-4 flex items-center justify-center gap-3">
                              <button 
                                onClick={() => startEdit(b)} 
                                className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors flex items-center gap-1 font-bold text-xs"
                              >
                                 <Edit size={14}/> Edit
                              </button>
                              
                              <button 
                                onClick={() => handleDelete(b.id, b.title)} 
                                className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-1 font-bold text-xs"
                              >
                                 <Trash2 size={14}/> Delete
                              </button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         )}
      </div>

    </div>
  );
};

export default AdminBlogWriter;