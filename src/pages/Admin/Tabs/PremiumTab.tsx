// C:\Users\Rahul\auto-video-backend\src\pages\Admin\Tabs\PremiumTab.tsx
// ✅ COMPLETELY REPLACED - AI Generator UI

import { useState, useEffect } from 'react';
import { db } from '../../../firebase/config';
import {
  collection, getDocs, query,
  orderBy, doc, getDoc
} from 'firebase/firestore';
import {
  Zap, BookOpen,
  CheckCircle, AlertCircle, Loader2,
  Eye, RefreshCw,
  Cpu, Globe, Hash, FileText
} from 'lucide-react';

// ============================================
// TYPES
// ============================================
interface Course {
  id: string;
  title: string;
}

interface Folder {
  id: string;
  title: string;
  parentId: string | null;
}

interface GenerationLog {
  topic: string;
  exam: string;
  setNumber: number;
  provider: string;
  status: 'success' | 'error';
  message: string;
  id?: string;
  time: string;
}

// ============================================
// CLOUD FUNCTION URL
// ============================================
const CLOUD_FUNCTION_URL =
   "https://generatepremiumnote-hf6vlh5cpq-uc.a.run.app";

// ============================================
// EXAMS LIST
// ============================================
const EXAMS = [
  'SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD',
  'Railway NTPC', 'Railway Group D',
  'UP Police', 'Bihar Police', 'Rajasthan Police',
  'CTET', 'UPTET', 'MPTET',
  'UPSC CSE', 'UPPCS', 'BPSC',
  'Bank PO', 'Bank Clerk', 'IBPS',
  'NDA', 'CDS', 'AFCAT',
  'CUET', 'Delhi Police', 'SSC CPO'
];

// ============================================
// MAIN COMPONENT
// ============================================
const PremiumTab = () => {

  // Form State
  const [topic, setTopic]           = useState('');
  const [exam, setExam]             = useState('SSC CGL');
  const [subject, setSubject]       = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [setNumber, setSetNumber]   = useState(1);
  const [provider, setProvider]     = useState<'gemini' | 'vertex'>('gemini');
  const [bulkCount, setBulkCount]   = useState(1);

  // Data State
  const [courses, setCourses]       = useState<Course[]>([]);
  const [folders, setFolders]       = useState<Folder[]>([]);

  // Generation State
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress]     = useState('');
  const [percent, setPercent]       = useState(0);
  const [logs, setLogs]             = useState<GenerationLog[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  // UI State
  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');

  // ============================================
  // FETCH COURSES
  // ============================================
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'courses'), orderBy('createdAt', 'desc'))
        );
        const list: Course[] = snap.docs.map(d => ({
          id: d.id,
          title: d.data().title || d.id
        }));
        setCourses(list);
        if (list.length > 0) setSelectedCourse(list[0].id);
      } catch (err) {
        console.error('Courses fetch error:', err);
      }
    };
    fetchCourses();
  }, []);

  // ============================================
  // FETCH FOLDERS when course changes
  // ============================================
  useEffect(() => {
    if (!selectedCourse) return;
    const fetchFolders = async () => {
      try {
        const snap = await getDocs(
          collection(db, 'courses', selectedCourse, 'content')
        );
        const list: Folder[] = snap.docs
          .filter(d => d.data().type === 'FOLDER')
          .map(d => ({
            id: d.id,
            title: d.data().title || d.id,
            parentId: d.data().parentId || null
          }));
        setFolders(list);
        setSelectedFolder('');
      } catch (err) {
        console.error('Folders fetch error:', err);
      }
    };
    fetchFolders();
  }, [selectedCourse]);

  // ============================================
  // ADD LOG
  // ============================================
  const addLog = (log: GenerationLog) => {
    setLogs(prev => [log, ...prev].slice(0, 20));
  };

  // ============================================
  // SINGLE GENERATE
  // ============================================
  const generateSingle = async (
    topicValue: string,
    setNum: number
  ): Promise<boolean> => {

    setProgress(`Generating Set ${setNum} for "${topicValue}"...`);
    setPercent(30);

    try {
      const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicValue,
          exam: exam,
          subject: subject || topicValue,
          packId: selectedCourse,
          folderId: selectedFolder || null,
          setNumber: setNum,
          provider: provider
        })
      });

      const data = await response.json();
      setPercent(90);

      if (data.success) {
        addLog({
          topic: topicValue,
          exam,
          setNumber: setNum,
          provider: data.provider,
          status: 'success',
          message: `✅ Saved! ID: ${data.id} | Type: ${data.subjectType}`,
          id: data.id,
          time: new Date().toLocaleTimeString()
        });
        setLastResult(data);
        return true;
      } else {
        throw new Error(data.error || 'Unknown error');
      }

    } catch (err: any) {
      addLog({
        topic: topicValue,
        exam,
        setNumber: setNum,
        provider,
        status: 'error',
        message: `❌ ${err.message}`,
        time: new Date().toLocaleTimeString()
      });
      return false;
    }
  };

  // ============================================
  // HANDLE GENERATE (Single + Bulk)
  // ============================================
  const handleGenerate = async () => {
    if (!topic.trim()) return alert('Topic भरो!');
    if (!selectedCourse) return alert('Course select करो!');

    setGenerating(true);
    setPercent(10);
    setLastResult(null);

    try {
      if (bulkCount === 1) {
        // Single
        await generateSingle(topic, setNumber);
      } else {
        // Bulk
        for (let i = 0; i < bulkCount; i++) {
          const currentSetNum = setNumber + i;
          setProgress(
            `Bulk: Set ${i + 1}/${bulkCount} generating...`
          );
          setPercent(Math.round((i / bulkCount) * 100));

          const ok = await generateSingle(topic, currentSetNum);

          // Wait between requests to avoid rate limit
          if (ok && i < bulkCount - 1) {
            setProgress(`Set ${i + 1} done. Waiting 3s...`);
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }

      setProgress('Complete! ✅');
      setPercent(100);

    } finally {
      setGenerating(false);
      setTimeout(() => {
        setProgress('');
        setPercent(0);
      }, 3000);
    }
  };

  // ============================================
  // PREVIEW LAST GENERATED
  // ============================================
  const handlePreview = async () => {
    if (!lastResult?.id || !selectedCourse) return;
    try {
      const snap = await getDoc(
        doc(db, 'courses', selectedCourse, 'content', lastResult.id)
      );
      if (snap.exists()) {
        setPreviewHTML(snap.data().content || '');
        setShowPreview(true);
      }
    } catch (err) {
      console.error('Preview error:', err);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="max-w-5xl mx-auto space-y-6 p-2">

      {/* ===== HEADER ===== */}
      <div className="bg-gradient-to-r from-blue-700 to-purple-700 rounded-2xl p-5 text-white">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-300" />
              AI Premium Content Generator
            </h1>
            <p className="text-blue-200 text-sm mt-1">
              One Click → Gemini/Vertex → Firestore → Live
            </p>
          </div>
          <div className="text-right text-xs text-blue-200">
            <p className="font-bold text-white text-sm">📚 StudyGyaan.in</p>
            <p>📞 6263396446</p>
            <p>✉️ contact@studygyaan.in</p>
          </div>
        </div>
      </div>

      {/* ===== MAIN FORM ===== */}
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <h2 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Generation Settings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Topic */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              📖 Topic *
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Speed Distance Time / मौर्य साम्राज्य / Blood Relations"
              className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              disabled={generating}
            />
          </div>

          {/* Exam */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              🏛️ Exam *
            </label>
            <select
              value={exam}
              onChange={e => setExam(e.target.value)}
              disabled={generating}
              className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            >
              {EXAMS.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              📚 Subject (Optional)
            </label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Mathematics, Reasoning, History"
              className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              disabled={generating}
            />
          </div>

          {/* Course */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              📦 Course/Pack *
            </label>
            <select
              value={selectedCourse}
              onChange={e => setSelectedCourse(e.target.value)}
              disabled={generating}
              className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            >
              <option value="">-- Course Select करो --</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Folder */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              📂 Folder (Optional)
            </label>
            <select
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              disabled={generating || folders.length === 0}
              className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            >
              <option value="">-- Root Level --</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>
                  📁 {f.title}
                </option>
              ))}
            </select>
          </div>

          {/* AI Provider */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              🤖 AI Provider
            </label>
            <div className="flex gap-2">
              {(['gemini',] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  disabled={generating}
                  className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all ${
                    provider === p
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Cpu className="w-4 h-4 inline mr-1" />
                  {p === 'gemini' ? 'Gemini' : 'Vertex AI'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Auto-fallback: {provider === 'gemini' ? 'Gemini → Vertex' : 'Vertex → Gemini'}
            </p>
          </div>

          {/* Set Number + Bulk */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              🔢 Set Number & Bulk
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Start Set#</p>
                <input
                  type="number"
                  value={setNumber}
                  onChange={e => setSetNumber(Number(e.target.value))}
                  min={1}
                  disabled={generating}
                  className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Total Sets</p>
                <select
                  value={bulkCount}
                  onChange={e => setBulkCount(Number(e.target.value))}
                  disabled={generating}
                  className="w-full p-3 border-2 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                >
                  {[1, 2, 3, 5, 10].map(n => (
                    <option key={n} value={n}>
                      {n === 1 ? '1 (Single)' : `${n} Sets (Bulk)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {bulkCount > 1 && (
              <p className="text-xs text-orange-500 mt-1">
                ⚠️ Bulk: Set {setNumber} to Set {setNumber + bulkCount - 1}
                will be generated
              </p>
            )}
          </div>
        </div>

        {/* ===== GENERATE BUTTON ===== */}
        <div className="mt-6">
          <button
            onClick={handleGenerate}
            disabled={generating || !topic || !selectedCourse}
            className={`w-full py-4 rounded-xl text-lg font-black text-white
              transition-all transform active:scale-95 ${
              generating || !topic || !selectedCourse
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-xl hover:scale-[1.01]'
            }`}
          >
            {generating ? (
              <span className="flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                {progress || 'Generating...'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Zap className="w-5 h-5 text-yellow-300" />
                {bulkCount > 1
                  ? `Generate ${bulkCount} Sets (Bulk)`
                  : 'Generate Content'}
              </span>
            )}
          </button>

          {/* Progress Bar */}
          {generating && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">
                {percent}% • Provider: {provider}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== LAST RESULT ===== */}
      {lastResult && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-green-800">
                  Content Generated Successfully!
                </p>
                <p className="text-sm text-green-600 mt-1">
                  ID: {lastResult.id} |
                  Provider: {lastResult.provider} |
                  Type: {lastResult.subjectType}
                </p>
                {lastResult.seo && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-green-700">
                      <Globe className="w-3 h-3 inline mr-1" />
                      SEO Title: {lastResult.seo.metaTitle}
                    </p>
                    <p className="text-xs text-green-700">
                      <Hash className="w-3 h-3 inline mr-1" />
                      Slug: /notes/{lastResult.seo.slug}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handlePreview}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-bold
                flex items-center gap-1 hover:bg-green-700 shrink-0"
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
          </div>
        </div>
      )}

      {/* ===== GENERATION LOGS ===== */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            Generation Logs ({logs.length})
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {logs.map((log, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl text-sm border ${
                  log.status === 'success'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {log.status === 'success'
                      ? <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    }
                    <div>
                      <p className={`font-bold ${
                        log.status === 'success' ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {log.topic} - Set {log.setNumber}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {log.message}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-400">{log.time}</span>
                    <br />
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                      {log.provider}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setLogs([])}
            className="mt-3 text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Clear Logs
          </button>
        </div>
      )}

      {/* ===== QUICK TIPS ===== */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <h3 className="font-bold text-blue-800 mb-3">💡 Quick Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-700">
          <div className="flex items-start gap-2">
            <span className="shrink-0">📐</span>
            <p>Math/Reasoning topics → Auto Formula + Solution</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0">📚</span>
            <p>GK/History topics → Only Question Table</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0">🤖</span>
            <p>Vertex AI → Better quality, Gemini → Faster</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0">🔄</span>
            <p>Auto-fallback: अगर एक fail हो, दूसरा try होगा</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0">📦</span>
            <p>Bulk = Multiple sets एक click में</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0">🌐</span>
            <p>SEO auto-generate होता है हर content के साथ</p>
          </div>
        </div>
      </div>

      {/* ===== PREVIEW MODAL ===== */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-lg">
                👁️ Content Preview
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-xl font-bold text-gray-500"
              >
                ✕ Close
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-6 prose max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHTML }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PremiumTab;