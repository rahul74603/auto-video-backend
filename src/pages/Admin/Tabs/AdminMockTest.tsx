// @ts-nocheck
import { useState, useEffect } from 'react';
import { db, storage } from '../../../firebase/config'; 
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 
import { 
    BookOpen, PlusCircle, Save, Trash2, Clock, CheckCircle, 
    Target, Copy, ImageIcon, Loader2, AlertCircle, MinusSquare, X,
    LayoutGrid, Lightbulb, Edit3, RefreshCcw, Zap 
} from 'lucide-react';
import { toast } from 'sonner';

const AdminMockTest = () => {

    const API_BASE_URL = "https://api-hf6vlh5cpq-uc.a.run.app";
    // ================= STATES =================

    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [imgUploading, setImgUploading] = useState(false);
    const [logicImgUploading, setLogicImgUploading] = useState(false);
    const [tests, setTests] = useState([]);

    const [editingTestId, setEditingTestId] = useState(null);
    const [editingQIndex, setEditingQIndex] = useState(null);

    const [testTitle, setTestTitle] = useState('');
    const [duration, setDuration] = useState('60');
    const [negMark, setNegMark] = useState('0.50');

    const [questions, setQuestions] = useState([]);

    const [qText, setQText] = useState('');
    const [qImage, setQImage] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctOption, setCorrectOption] = useState(0);
    const [qLogic, setQLogic] = useState('');
    const [qLogicImage, setQLogicImage] = useState('');

    // ================= AI STATES =================

    const [category, setCategory] = useState("SSC");
    const [exam, setExam] = useState("SSC CGL");
    const [totalQuestions, setTotalQuestions] = useState(25);

    const examOptions = {
        SSC: ["SSC CGL", "SSC CHSL", "SSC MTS", "SSC GD"],
        Railway: ["RRB NTPC", "RRB Group D", "RRB JE"],
        Banking: ["IBPS PO", "SBI Clerk", "RBI Grade B"],
        UPSC: ["UPSC Prelims", "UPSC Mains"],
        Teaching: ["CTET", "UPTET", "DSSSB"],
        Police: ["UP Police", "Delhi Police", "MP Police"],
        Defence: ["NDA", "CDS", "AFCAT", "Agniveer"]
    };

    // ================= FETCH TESTS =================

    const fetchTests = async () => {
        const snap = await getDocs(collection(db, "mock_tests"));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTests(data.sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        }));
    };

    useEffect(() => { fetchTests(); }, []);

    // ================= AI GENERATE =================

    const handleAIGenerate = async () => {

        setAiLoading(true);
        toast.info("AI Competitive Level Mock Generate kar raha hai...");

        try {

            const response = await fetch(`${API_BASE_URL}/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: `${category} - ${exam}`,
                    totalQuestions: totalQuestions
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "Generation failed");
            }

            toast.success("🔥 Mock Test Successfully Generated!");
            setTimeout(fetchTests, 3000);

        } catch (error) {
            console.error("AI Error:", error);
            toast.error("AI Generation Failed.");
        } finally {
            setAiLoading(false);
        }
    };

    // ================= IMAGE LOGIC =================

    const compressImage = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800; 
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7); 
                };
            };
        });
    };

    const handleImageUpload = async (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        type === 'question' ? setImgUploading(true) : setLogicImgUploading(true);

        try {
            const compressedFile = await compressImage(file);
            const storageRef = ref(storage, `mock_tests/${Date.now()}_${type}.jpg`);
            await uploadBytes(storageRef, compressedFile);
            const url = await getDownloadURL(storageRef);
            type === 'question' ? setQImage(url) : setQLogicImage(url);
            toast.success("Image Uploaded! ✅");
        } catch {
            toast.error("Upload failed!");
        } finally {
            type === 'question' ? setImgUploading(false) : setLogicImgUploading(false);
        }
    };
// ================= ADD QUESTION =================

const addQuestion = () => {

    if (!qText && !qImage)
        return toast.error("सवाल या इमेज डालना ज़रूरी है!");

    if (options.some(opt => !opt))
        return toast.error("सारे ऑप्शंस भरें!");

    const questionData = {
        qText,
        qImage,
        options,
        correctOption,
        qLogic,
        qLogicImage
    };

    if (editingQIndex !== null) {
        const updatedQuestions = [...questions];
        updatedQuestions[editingQIndex] = questionData;
        setQuestions(updatedQuestions);
        setEditingQIndex(null);
        toast.success("Sawal Update ho gaya!");
    } else {
        setQuestions([...questions, questionData]);
        toast.success("Sawal List में जोड़ा गया!");
    }

    setQText('');
    setQImage('');
    setOptions(['', '', '', '']);
    setCorrectOption(0);
    setQLogic('');
    setQLogicImage('');
};
    // ================= SAVE =================

    const saveFullTest = async () => {

        if (!testTitle || questions.length === 0)
            return toast.error("Title और Sawal ज़रूरी हैं!");

        setLoading(true);

        try {

            const testData = {
                title: testTitle,
                durationMinutes: parseInt(duration),
                negativeMarking: parseFloat(negMark),
                totalQuestions: questions.length,
                questions: questions,
                updatedAt: serverTimestamp(),
            };

            if (editingTestId) {
                await setDoc(doc(db, "mock_tests", editingTestId), testData, { merge: true });
                toast.success("🔥 Test Updated Successfully!");
            } else {
                await addDoc(collection(db, "mock_tests"), { ...testData, createdAt: serverTimestamp() });
                toast.success("🔥 New Mock Test Published!");
            }

            setEditingTestId(null);
            setEditingQIndex(null);
            setTestTitle('');
            setQuestions([]);
            fetchTests();

        } catch {
            toast.error("सेव करने में एरर आया।");
        } finally {
            setLoading(false);
        }
    };

    // ================= SINGLE RETURN =================

    return (
        <div className="relative animate-in fade-in duration-500 font-hindi pb-20 bg-slate-50 min-h-screen">
            {/* 🌀 AI GENERATION LOADER OVERLAY */}
            {aiLoading && (
                <div className="fixed inset-0 z-[999] bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-white text-center p-6">
                    <div className="relative mb-8">
                        <Loader2 className="animate-spin text-blue-500" size={100} strokeWidth={3} />
                        <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-400 animate-pulse" size={40} />
                    </div>
                    <h2 className="text-4xl font-black mb-4 uppercase tracking-tighter italic">AI Magic is Working...</h2>
                    <p className="text-slate-400 font-bold max-w-lg text-lg leading-relaxed">
                        Gemini AI आपके लिए 100 कठिन सवाल और डिटेल्ड लॉजिक तैयार कर रहा है। <br/>
                        <span className="text-blue-400 animate-pulse">कृपया 45 सेकंड तक इंतज़ार करें...</span>
                    </p>
                </div>
            )}

            <div className="max-w-[1400px] mx-auto p-4">
                <div className={`bg-white rounded-[48px] shadow-2xl border-2 overflow-hidden transition-all ${editingTestId ? 'border-orange-400' : 'border-slate-100'}`}>
                    
                    {/* HEADER */}
                    <div className={`${editingTestId ? 'bg-orange-600' : 'bg-slate-900'} p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ${editingTestId ? 'bg-white text-orange-600' : 'bg-blue-600 text-white'}`}>
                                {editingTestId ? <Edit3 size={32}/> : <Target size={32}/>}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight">{editingTestId ? 'Edit Mock Test' : 'Pro Mock Test Builder'}</h2>
                                <p className="text-slate-300 text-xs font-bold uppercase tracking-widest">FIREBASE CLOUD INFRASTRUCTURE ACTIVE ✅</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {!editingTestId && (
                                <button onClick={handleAIGenerate} disabled={aiLoading} className="bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-105 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl flex items-center gap-2 border-b-4 border-purple-800 disabled:grayscale">
                                    <Zap size={20}/> AI MAGIC GENERATE
                                </button>
                            )}
                            {editingTestId && <button onClick={() => setEditingTestId(null)} className="bg-white/10 hover:bg-white/20 text-white px-6 py-4 rounded-2xl font-black">CANCEL</button>}
                            <button onClick={saveFullTest} disabled={loading} className={`${editingTestId ? 'bg-white text-orange-600' : 'bg-blue-600 text-white'} px-10 py-4 rounded-2xl font-black transition-all shadow-xl active:scale-95 disabled:grayscale`}>
                                {loading ? 'SAVING...' : editingTestId ? 'UPDATE TEST 🔄' : 'PUBLISH TEST 🚀'}
                            </button>
                        </div>
                    </div>
{/* AI CONTROL PANEL */}
<div className="p-6 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-slate-200">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">

        <select
            value={category}
            onChange={(e) => {
                setCategory(e.target.value);
                setExam(examOptions[e.target.value][0]);
            }}
            className="p-3 rounded-xl border font-bold"
        >
            {Object.keys(examOptions).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
            ))}
        </select>

        <select
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            className="p-3 rounded-xl border font-bold"
        >
            {examOptions[category].map(ex => (
                <option key={ex} value={ex}>{ex}</option>
            ))}
        </select>

        <select
            value={totalQuestions}
            onChange={(e) => setTotalQuestions(Number(e.target.value))}
            className="p-3 rounded-xl border font-bold"
        >
            <option value={10}>10 Questions</option>
            <option value={25}>25 Questions</option>
            <option value={45}>45 Questions</option>
        </select>

    </div>
</div>
                    <div className="p-6 md:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
                        {/* LEFT: FORM SECTION */}
                        <div className="lg:col-span-7 space-y-8">
                            <div className="bg-slate-100/50 p-8 rounded-[40px] border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-inner">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block">Exam Title</label>
                                    <input value={testTitle} onChange={e => setTestTitle(e.target.value)} placeholder="e.g. SSC CGL 2024 Math Mock" className="w-full p-4 rounded-2xl border-none font-bold shadow-sm focus:ring-2 focus:ring-blue-50 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block">Time (Minutes)</label>
                                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-full p-4 rounded-2xl border-none font-bold shadow-sm" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-red-400 uppercase mb-2 ml-1 block">Negative Marking (-)</label>
                                    <input type="number" step="0.25" value={negMark} onChange={e => setNegMark(e.target.value)} className="w-full p-4 rounded-2xl border-none font-bold text-red-600 shadow-sm" />
                                </div>
                            </div>

                            <div className={`bg-white p-8 rounded-[40px] border-2 space-y-6 relative shadow-lg ${editingQIndex !== null ? 'border-blue-400 bg-blue-50/20' : 'border-blue-50'}`}>
                                <div className={`absolute -top-4 right-10 text-white px-6 py-1.5 rounded-full text-xs font-black shadow-lg ${editingQIndex !== null ? 'bg-orange-500' : 'bg-blue-600'}`}>
                                    {editingQIndex !== null ? `EDITING SAWAL NO: ${editingQIndex + 1}` : `CURRENT SAWAL NO: ${questions.length + 1}`}
                                </div>

                                <textarea rows={2} value={qText} onChange={e=>setQText(e.target.value)} placeholder="सवाल का टेक्स्ट यहाँ लिखें..." className="w-full p-6 rounded-[32px] bg-slate-50 border-none font-bold text-lg focus:ring-4 focus:ring-blue-50 transition-all resize-none outline-none" />

                                <div className="flex items-center gap-4">
                                    <label className="flex-1 group relative flex flex-col items-center justify-center h-32 border-4 border-dashed border-slate-100 rounded-[32px] cursor-pointer hover:bg-slate-50 hover:border-blue-200 transition-all overflow-hidden">
                                        {imgUploading ? <Loader2 className="animate-spin text-blue-600" size={24}/> : qImage ? <img src={qImage} className="h-full object-contain p-2" /> : <div className="text-center"><ImageIcon className="text-slate-300 mx-auto mb-1" size={24}/><span className="text-[10px] font-black text-slate-400 uppercase">ADD QUESTION IMAGE</span></div>}
                                        <input type="file" accept="image/*" onChange={e=>handleImageUpload(e, 'question')} className="hidden" />
                                    </label>
                                    {qImage && <button onClick={()=>setQImage('')} className="bg-red-100 text-red-500 p-3 rounded-full hover:bg-red-500 transition-all"><X size={18}/></button>}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {options.map((opt, idx) => (
                                        <div key={idx} className={`flex items-center gap-4 p-3 rounded-2xl border-2 transition-all ${correctOption === idx ? 'border-green-500 bg-green-50' : 'border-slate-50 bg-white'}`}>
                                            <input type="radio" checked={correctOption === idx} onChange={() => setCorrectOption(idx)} className="w-6 h-6 accent-green-600 cursor-pointer" />
                                            <input value={opt} onChange={e => {
                                                const newOptions = [...options];
                                                newOptions[idx] = e.target.value;
                                                setOptions(newOptions);
                                            }} placeholder={`Option ${idx+1}`} className="flex-1 bg-transparent font-bold text-slate-700 outline-none text-sm" />
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-blue-50/50 p-6 rounded-[32px] border border-blue-100 space-y-4">
                                    <h4 className="flex items-center gap-2 font-black text-blue-800 text-xs uppercase tracking-widest"><Lightbulb size={16} className="text-yellow-500"/> Logic / Solution</h4>
                                    <textarea rows={2} value={qLogic} onChange={e=>setQLogic(e.target.value)} placeholder="इसका सही लॉजिक यहाँ लिखें..." className="w-full p-4 rounded-[24px] bg-white border-2 border-white focus:border-blue-300 outline-none font-bold text-sm text-slate-700 shadow-sm" />
                                    <div className="flex items-center gap-4">
                                        <label className="flex-1 h-24 border-2 border-dashed border-blue-200 rounded-[24px] cursor-pointer hover:bg-blue-100/50 flex flex-col items-center justify-center transition-all overflow-hidden bg-white/50">
                                            {logicImgUploading ? <Loader2 className="animate-spin text-blue-600" size={20}/> : qLogicImage ? <img src={qLogicImage} className="h-full object-contain p-2" /> : <div className="text-center text-blue-400 font-black text-[10px] uppercase">ADD LOGIC IMAGE</div>}
                                            <input type="file" accept="image/*" onChange={e=>handleImageUpload(e, 'logic')} className="hidden" />
                                        </label>
                                        {qLogicImage && <button onClick={()=>setQLogicImage('')} className="bg-red-100 text-red-500 p-2 rounded-full"><X size={14}/></button>}
                                    </div>
                                </div>

                                <button onClick={addQuestion} className={`w-full py-5 text-white font-black rounded-3xl active:scale-[0.98] transition-all shadow-xl ${editingQIndex !== null ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-blue-600'}`}>
                                    {editingQIndex !== null ? '🔄 UPDATE QUESTION IN LIST' : '+ ADD QUESTION TO LIST'}
                                </button>
                            </div>
                        </div>

                        {/* RIGHT: LIVE PREVIEW AREA */}
                        <div className="lg:col-span-5 flex flex-col">
                            <div className="bg-slate-900 rounded-[48px] p-8 text-white h-full min-h-[600px] flex flex-col shadow-2xl relative">
                                <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                                    <h3 className="font-black text-xl flex items-center gap-2">
                                        <LayoutGrid className="text-blue-400"/> Live Preview
                                    </h3>
                                    <span className="bg-blue-600 px-4 py-1 rounded-full text-[10px] font-black uppercase">
                                        {questions.length} Sawal Added
                                    </span>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
                                    {questions.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-700 text-center opacity-50">
                                            <PlusCircle size={48} className="mb-4" />
                                            <p className="font-black uppercase tracking-widest text-xs">No questions yet</p>
                                        </div>
                                    ) : (
                                        questions.map((q, idx) => (
                                            <div key={idx} className={`bg-white/5 border p-5 rounded-[32px] relative group animate-in slide-in-from-right-5 ${editingQIndex === idx ? 'border-blue-500 bg-blue-500/10' : 'border-white/5'}`}>
                                                <div className="absolute top-4 right-4 flex gap-2">
                                                    <button onClick={() => {
                                                        setQText(q.qText || q.questionText || '');
                                                        setQImage(q.qImage || '');
                                                        setOptions(q.options);
                                                        setCorrectOption(q.correctOption);
                                                        setQLogic(q.qLogic || '');
                                                        setQLogicImage(q.qLogicImage || '');
                                                        setEditingQIndex(idx); 
                                                        window.scrollTo({ top: 400, behavior: 'smooth' }); 
                                                    }} className="text-slate-400 hover:text-blue-400 transition-all"><Edit3 size={16}/></button>
                                                    <button onClick={() => setQuestions(questions.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-red-400 transition-all"><Trash2 size={16}/></button>
                                                </div>
                                                <p className="text-[10px] font-black text-blue-400 mb-1">QUESTION {idx + 1}</p>
                                                <p className="font-bold text-sm leading-relaxed mb-3 pr-10">{q.qText || q.questionText || "(Image only)"}</p>
                                                {q.qImage && <img src={q.qImage} className="w-full h-32 object-contain rounded-2xl bg-white/10 p-2 mb-3 border border-white/10" />}
                                                <div className="flex justify-between items-center">
                                                    <div className="bg-green-500/10 text-green-400 px-3 py-1 rounded-xl border border-green-500/20 text-[10px] font-black">Ans: {q.options[q.correctOption]}</div>
                                                    {(q.qLogic || q.qLogicImage) && <span className="text-[9px] text-blue-400 font-bold uppercase">✨ Solution added</span>}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Published Test Series Section */}
                <div className="mt-16 space-y-8">
                    <h3 className="text-2xl font-black text-slate-800 px-4 flex items-center gap-3">
                        <Target className="text-blue-600"/> Published Test Series
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {tests.map(test => (
                            <div key={test.id} className="bg-white p-8 rounded-[48px] shadow-xl border border-slate-50 hover:shadow-2xl hover:border-blue-500 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-12 -mt-12 group-hover:bg-blue-600 transition-all duration-500"></div>
                                <h4 className="font-black text-slate-800 text-xl truncate mb-4 pr-10">{test.title}</h4>
                                <div className="flex gap-4 mb-8">
                                    <span className="bg-slate-100 px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2"><Clock size={14}/> {test.durationMinutes} MIN</span>
                                    <span className="bg-slate-100 px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2"><BookOpen size={14}/> {test.totalQuestions} QUES</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => {
                                        setEditingTestId(test.id);
                                        setTestTitle(test.title);
                                        setDuration(test.durationMinutes.toString());
                                        setNegMark(test.negativeMarking.toString());
                                        setQuestions(test.questions || []);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                        toast.info("Editing Mode Active.");
                                    }} className="bg-blue-100 text-blue-700 py-4 rounded-2xl font-black text-xs flex justify-center items-center gap-2 hover:bg-blue-600 hover:text-white transition-all">
                                        <Edit3 size={16}/> EDIT TEST
                                    </button>
                                    <button onClick={async () => {
                                        if (window.confirm("क्या आप इस टेस्ट को डिलीट करना चाहते हैं?")) {
                                            await deleteDoc(doc(db, "mock_tests", test.id));
                                            fetchTests();
                                            toast.success("Deleted!");
                                        }
                                    }} className="bg-red-50 text-red-500 py-4 rounded-2xl font-black text-xs hover:bg-red-500 hover:text-white transition-all">
                                        <Trash2 size={16}/> DELETE
                                    </button>
                                    <button onClick={() => {
                                        const testUrl = `${window.location.origin}/test/${test.id}`;
                                        navigator.clipboard.writeText(testUrl);
                                        toast.success("Link Copied! 📋");
                                    }} className="col-span-2 bg-slate-900 text-white py-4 rounded-2xl font-black text-xs flex justify-center items-center gap-2 shadow-lg active:scale-95 transition-all">
                                        <Copy size={16}/> COPY URL
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {/* Scrollbar hide style */}
            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};

export default AdminMockTest;