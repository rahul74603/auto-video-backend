/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
// Legacy merged Premium manager: rule suppressions are scoped to this file so
// Article Studio CI can run without changing its existing course behavior.
// ✅ MERGED - AI Generator + Manual Course/Folder Manager (Restored old screen)

import { useState, useEffect } from 'react';
import { db } from '../../../firebase/config';
import {
  collection, getDocs, query,
  orderBy, doc, getDoc,
  addDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
  Zap, BookOpen,
  CheckCircle, AlertCircle, Loader2,
  Eye, RefreshCw,
  Cpu, Globe, Hash, FileText,
  FolderPlus, Folder, Trash2, Edit2, Plus, Search,
  ArrowLeft, Home, Layers, Package, Save, X as XIcon
} from 'lucide-react';


// ============================================
// TYPES
// ============================================
interface Course {
  id: string;
  title: string;
  createdAt?: any;
  updatedAt?: any;
}

interface Folder {
  id: string;
  title: string;
  parentId: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  type: string; // FOLDER or NOTE etc
  parentId: string | null;
  content?: string;
  createdAt?: any;
  setNumber?: number;
  exam?: string;
  subject?: string;
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

  // ===== TOP TAB SWITCHER =====
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

  // =======================================================
  // AI GENERATOR STATE (UNCHANGED LOGIC)
  // =======================================================
  const [topic, setTopic]           = useState('');
  const [exam, setExam]             = useState('SSC CGL');
  const [subject, setSubject]       = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [setNumber, setSetNumber]   = useState(1);
  const [provider, setProvider]     = useState<'gemini' | 'vertex'>('gemini');
  const [bulkCount, setBulkCount]   = useState(1);

  const [courses, setCourses]       = useState<Course[]>([]);
  const [folders, setFolders]       = useState<Folder[]>([]);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress]     = useState('');
  const [percent, setPercent]       = useState(0);
  const [logs, setLogs]             = useState<GenerationLog[]>([]);
  type LastGenerationResult = {
    id?: string;
    provider?: string;
    subjectType?: string;
    seo?: { metaTitle?: string; slug?: string };
  };
  const [lastResult, setLastResult] = useState<LastGenerationResult | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');

  // =======================================================
  // MANUAL MANAGER STATE (RESTORED OLD SCREEN)
  // =======================================================
  const [allContentItems, setAllContentItems] = useState<ContentItem[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualCurrentFolderId, setManualCurrentFolderId] = useState<string | null>(null);
  const [manualHistory, setManualHistory] = useState<{id: string | null, name: string}[]>([]);

  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseTitle, setEditingCourseTitle] = useState('');

  const [newFolderNameManual, setNewFolderNameManual] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderTitle, setEditingFolderTitle] = useState('');

  const [searchCourse, setSearchCourse] = useState('');
  const [searchContent, setSearchContent] = useState('');

  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editingContentTitle, setEditingContentTitle] = useState('');

  const [contentPreviewHTML, setContentPreviewHTML] = useState('');
  const [showContentPreview, setShowContentPreview] = useState(false);
  const [contentPreviewTitle, setContentPreviewTitle] = useState('');

  // ============================================
  // FETCH COURSES (shared for both tabs)
  // ============================================
  const fetchCourses = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'courses'), orderBy('createdAt', 'desc'))
      );
      const list: Course[] = snap.docs.map(d => ({
        id: d.id,
        title: d.data().title || d.id,
        createdAt: d.data().createdAt,
        updatedAt: d.data().updatedAt
      }));
      setCourses(list);
      if (!selectedCourse && list.length > 0) setSelectedCourse(list[0].id);
    } catch (err) {
      console.error('Courses fetch error:', err);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  // ============================================
  // FETCH ALL CONTENT FOR SELECTED COURSE
  // ============================================
  const fetchAllContent = async (courseId: string) => {
    if (!courseId) return;
    setManualLoading(true);
    try {
      const snap = await getDocs(
        collection(db, 'courses', courseId, 'content')
      );
      const all: ContentItem[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || d.id,
          type: data.type || (data.content ? 'NOTE' : 'FOLDER'),
          parentId: data.parentId || null,
          content: data.content || '',
          createdAt: data.createdAt,
          setNumber: data.setNumber,
          exam: data.exam,
          subject: data.subject,
        };
      });
      setAllContentItems(all);
      const folderList: Folder[] = all
        .filter(d => d.type === 'FOLDER')
        .map(d => ({
          id: d.id,
          title: d.title,
          parentId: d.parentId
        }));
      setFolders(folderList);
      // reset folder selection for AI dropdown if its folder was deleted
      if (selectedFolder && !folderList.find(f => f.id === selectedFolder)) {
        setSelectedFolder('');
      }
    } catch (err) {
      console.error('Content fetch error:', err);
    } finally {
      setManualLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedCourse) return;
    fetchAllContent(selectedCourse);
    // reset manual navigation when course changes
    setManualCurrentFolderId(null);
    setManualHistory([]);
    setSearchContent('');
  }, [selectedCourse]);

  // ============================================
  // COURSE CRUD
  // ============================================
  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return alert('Course title भरो!');
    try {
      const docRef = await addDoc(collection(db, 'courses'), {
        title: newCourseTitle.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setNewCourseTitle('');
      await fetchCourses();
      setSelectedCourse(docRef.id);
    } catch (e: any) {
      alert('Course create error: ' + e.message);
    }
  };

  const handleUpdateCourse = async () => {
    if (!editingCourseId || !editingCourseTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'courses', editingCourseId), {
        title: editingCourseTitle.trim(),
        updatedAt: new Date().toISOString()
      });
      setEditingCourseId(null);
      setEditingCourseTitle('');
      await fetchCourses();
    } catch (e: any) {
      alert('Update error: ' + e.message);
    }
  };

  const handleDeleteCourse = async (courseId: string, title: string) => {
    if (!confirm(`"${title}" course delete करना है? ⚠️ अंदर का content Firebase में रह सकता है, लेकिन course list से हट जाएगा।`)) return;
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      if (selectedCourse === courseId) {
        setSelectedCourse('');
        setAllContentItems([]);
        setFolders([]);
      }
      await fetchCourses();
    } catch (e: any) {
      alert('Delete error: ' + e.message);
    }
  };

  // ============================================
  // FOLDER NAVIGATION & CRUD (Manual)
  // ============================================
  const getFolderById = (id: string | null) => {
    if (!id) return null;
    return allContentItems.find(c => c.id === id && c.type === 'FOLDER') || null;
  };

  const enterFolderManual = (folder: ContentItem | Folder) => {
    const currentName = manualCurrentFolderId 
      ? (getFolderById(manualCurrentFolderId)?.title || 'Folder')
      : 'Root';
    setManualHistory(prev => [...prev, { id: manualCurrentFolderId, name: currentName }]);
    setManualCurrentFolderId(folder.id);
  };

  const goBackManual = () => {
    if (manualHistory.length === 0) {
      setManualCurrentFolderId(null);
      return;
    }
    const prev = manualHistory[manualHistory.length - 1];
    setManualCurrentFolderId(prev.id);
    setManualHistory(prevHist => prevHist.slice(0, -1));
  };

  const goToRootManual = () => {
    setManualCurrentFolderId(null);
    setManualHistory([]);
  };

  const goToHistoryIndex = (index: number) => {
    // index -1 = root, 0.. = history items
    if (index === -1) {
      goToRootManual();
      return;
    }
    const target = manualHistory[index];
    setManualCurrentFolderId(target.id);
    setManualHistory(manualHistory.slice(0, index));
  };

  const handleCreateFolderManual = async () => {
    if (!selectedCourse) return alert('पहले Course select करो!');
    if (!newFolderNameManual.trim()) return alert('Folder name भरो!');
    try {
      await addDoc(collection(db, 'courses', selectedCourse, 'content'), {
        title: newFolderNameManual.trim(),
        type: 'FOLDER',
        parentId: manualCurrentFolderId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setNewFolderNameManual('');
      await fetchAllContent(selectedCourse);
    } catch (e: any) {
      alert('Folder create error: ' + e.message);
    }
  };

  const handleUpdateFolderManual = async () => {
    if (!selectedCourse || !editingFolderId || !editingFolderTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'courses', selectedCourse, 'content', editingFolderId), {
        title: editingFolderTitle.trim(),
        updatedAt: new Date().toISOString()
      });
      setEditingFolderId(null);
      setEditingFolderTitle('');
      await fetchAllContent(selectedCourse);
    } catch (e: any) {
      alert('Update error: ' + e.message);
    }
  };

  const handleDeleteFolderManual = async (folderId: string, title: string) => {
    if (!selectedCourse) return;
    // check if folder has children
    const hasChildren = allContentItems.some(c => c.parentId === folderId);
    if (hasChildren) {
      if (!confirm(`"${title}" के अंदर ${allContentItems.filter(c => c.parentId === folderId).length} items हैं! फिर भी delete करना है? (child items orphan हो जाएंगे)`)) return;
    } else {
      if (!confirm(`Folder "${title}" delete करना है?`)) return;
    }
    try {
      await deleteDoc(doc(db, 'courses', selectedCourse, 'content', folderId));
      if (manualCurrentFolderId === folderId) {
        goBackManual();
      }
      await fetchAllContent(selectedCourse);
    } catch (e: any) {
      alert('Delete error: ' + e.message);
    }
  };

  // ============================================
  // CONTENT (NOTE) CRUD
  // ============================================
  const handleUpdateContentTitle = async () => {
    if (!selectedCourse || !editingContentId || !editingContentTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'courses', selectedCourse, 'content', editingContentId), {
        title: editingContentTitle.trim(),
        updatedAt: new Date().toISOString()
      });
      setEditingContentId(null);
      setEditingContentTitle('');
      await fetchAllContent(selectedCourse);
    } catch (e: any) {
      alert('Update error: ' + e.message);
    }
  };

  const handleDeleteContent = async (contentId: string, title: string) => {
    if (!selectedCourse) return;
    if (!confirm(`"${title}" delete करना है? ये वापस नहीं आएगा!`)) return;
    try {
      await deleteDoc(doc(db, 'courses', selectedCourse, 'content', contentId));
      await fetchAllContent(selectedCourse);
    } catch (e: any) {
      alert('Delete error: ' + e.message);
    }
  };

  const handlePreviewContent = async (item: ContentItem) => {
    if (!selectedCourse) return;
    try {
      const snap = await getDoc(doc(db, 'courses', selectedCourse, 'content', item.id));
      if (snap.exists()) {
        setContentPreviewHTML(snap.data().content || '<p>No content</p>');
        setContentPreviewTitle(snap.data().title || item.title);
        setShowContentPreview(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered lists for manual UI
  const filteredCourses = courses.filter(c => 
    !searchCourse || c.title.toLowerCase().includes(searchCourse.toLowerCase())
  );

  const currentFolders = allContentItems
    .filter(c => c.type === 'FOLDER' && c.parentId === manualCurrentFolderId)
    .filter(c => !searchContent || c.title.toLowerCase().includes(searchContent.toLowerCase()));

  const currentNotes = allContentItems
    .filter(c => c.type !== 'FOLDER' && c.parentId === manualCurrentFolderId)
    .filter(c => !searchContent || c.title.toLowerCase().includes(searchContent.toLowerCase()))
    .sort((a,b) => (b.setNumber || 0) - (a.setNumber || 0));

  // For breadcrumb display
  const breadcrumbPath = [
    { id: null as string | null, name: 'Root' },
    ...manualHistory.map(h => ({ id: h.id, name: h.name })),
    ...(manualCurrentFolderId ? [{ id: manualCurrentFolderId, name: getFolderById(manualCurrentFolderId)?.title || 'Folder' }] : [])
  ];

  // ============================================
  // AI GENERATOR LOGIC (UNCHANGED)
  // ============================================
  const addLog = (log: GenerationLog) => {
    setLogs(prev => [log, ...prev].slice(0, 20));
  };

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
        // refresh manual content too so new note appears
        if (selectedCourse) await fetchAllContent(selectedCourse);
        return true;
      } else {
        throw new Error(data.error || 'Unknown error');
      }

    } catch (err: unknown) {
      addLog({
        topic: topicValue,
        exam,
        setNumber: setNum,
        provider,
        status: 'error',
        message: `❌ ${err instanceof Error ? err.message : String(err)}`,
        time: new Date().toLocaleTimeString()
      });
      return false;
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return alert('Topic भरो!');
    if (!selectedCourse) return alert('Course select करो!');

    setGenerating(true);
    setPercent(10);
    setLastResult(null);

    try {
      if (bulkCount === 1) {
        await generateSingle(topic, setNumber);
      } else {
        for (let i = 0; i < bulkCount; i++) {
          const currentSetNum = setNumber + i;
          setProgress(
            `Bulk: Set ${i + 1}/${bulkCount} generating...`
          );
          setPercent(Math.round((i / bulkCount) * 100));

          const ok = await generateSingle(topic, currentSetNum);

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
    <div className="max-w-7xl mx-auto space-y-5 p-2">

      {/* ===== HEADER WITH TABS ===== */}
      <div className="bg-gradient-to-r from-blue-700 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Layers className="w-6 h-6 text-yellow-300" />
              Premium Content Studio
            </h1>
            <p className="text-blue-200 text-sm mt-1">
              AI Generator + Manual Folder Manager — Ek hi jagah
            </p>
          </div>
          <div className="text-right text-xs text-blue-200">
            <p className="font-bold text-white text-sm">📚 StudyGyaan.in</p>
            <p>📞 6263396446</p>
            <p>✉️ contact@studygyaan.in</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex gap-2 bg-white/15 p-1 rounded-xl w-fit backdrop-blur">
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'ai' 
                ? 'bg-white text-blue-700 shadow-md' 
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" /> 🤖 AI Generator
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'manual' 
                ? 'bg-white text-blue-700 shadow-md' 
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Folder className="w-4 h-4" /> 📁 Courses & Folders
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* AI TAB CONTENT - YOUR ORIGINAL CODE AS-IS */}
      {/* ====================================================== */}
      {activeTab === 'ai' && (
        <div className="space-y-6 animate-in fade-in">

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
                <p className="text-[11px] text-gray-400 mt-1">💡 Folder नहीं दिख रहा? Manual tab में जाकर बना लो</p>
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
      )}

      {/* ====================================================== */}
      {/* MANUAL TAB - RESTORED OLD SCREEN */}
      {/* ====================================================== */}
      {activeTab === 'manual' && (
        <div className="space-y-4 animate-in fade-in">

          {/* Top Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600"><Package className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase">Total Courses</p>
                <p className="text-xl font-black text-gray-800">{courses.length}</p>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl text-purple-600"><Folder className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase">Total Folders</p>
                <p className="text-xl font-black text-gray-800">{allContentItems.filter(c=>c.type==='FOLDER').length}</p>
              </div>
            </div>
            <div className="bg-white border rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-xl text-green-600"><FileText className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase">Total Notes</p>
                <p className="text-xl font-black text-gray-800">{allContentItems.filter(c=>c.type!=='FOLDER').length}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">

            {/* ===== LEFT: COURSES PANEL ===== */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b bg-gray-50/50">
                <h3 className="font-black text-gray-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" /> Courses / Packs
                </h3>

                {/* Create Course */}
                <div className="mt-3 flex gap-2">
                  <input
                    value={newCourseTitle}
                    onChange={e=>setNewCourseTitle(e.target.value)}
                    placeholder="New Course Name... e.g. SSC CGL Premium Pack"
                    className="flex-1 p-2.5 border-2 rounded-xl text-sm focus:border-blue-500 outline-none"
                    onKeyDown={e=>{ if(e.key==='Enter') handleCreateCourse(); }}
                  />
                  <button
                    onClick={handleCreateCourse}
                    className="px-4 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-1 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>

                {/* Search Course */}
                <div className="mt-3 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchCourse}
                    onChange={e=>setSearchCourse(e.target.value)}
                    placeholder="Search courses..."
                    className="w-full pl-9 p-2.5 border rounded-xl text-sm focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[70vh] lg:max-h-[calc(100vh-250px)]">
                {filteredCourses.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-10">No courses found</p>
                )}
                {filteredCourses.map(course => (
                  <div
                    key={course.id}
                    className={`group p-3 rounded-xl border-2 text-sm cursor-pointer transition-all ${
                      selectedCourse === course.id
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={()=>setSelectedCourse(course.id)}
                  >
                    {editingCourseId === course.id ? (
                      <div className="flex gap-2" onClick={e=>e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editingCourseTitle}
                          onChange={e=>setEditingCourseTitle(e.target.value)}
                          className="flex-1 p-2 border rounded-lg text-sm"
                          onKeyDown={e=>{
                            if(e.key==='Enter') handleUpdateCourse();
                            if(e.key==='Escape') { setEditingCourseId(null); setEditingCourseTitle(''); }
                          }}
                        />
                        <button onClick={handleUpdateCourse} className="p-2 bg-green-600 text-white rounded-lg"><Save className="w-4 h-4" /></button>
                        <button onClick={()=>{ setEditingCourseId(null); setEditingCourseTitle(''); }} className="p-2 bg-gray-200 rounded-lg"><XIcon className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold truncate ${selectedCourse===course.id?'text-blue-800':'text-gray-700'}`}>{course.title}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{course.id}</p>
                          <div className="flex gap-2 mt-1.5">
                            <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                              📁 {allContentItems.filter(c=>c.type==='FOLDER').length} folders
                            </span>
                            {selectedCourse===course.id && (
                              <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full text-blue-700">
                                {manualLoading ? 'Loading...' : `${currentFolders.length + currentNotes.length} items here`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e)=>{ e.stopPropagation(); setEditingCourseId(course.id); setEditingCourseTitle(course.title); }}
                            className="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e)=>{ e.stopPropagation(); handleDeleteCourse(course.id, course.title); }}
                            className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-3 border-t bg-gray-50 text-[11px] text-gray-400">
                💡 Tip: Course select करो तो right side में उसके folders दिखेंगे
              </div>
            </div>

            {/* ===== RIGHT: FOLDER + CONTENT BROWSER ===== */}
            <div className="col-span-12 lg:col-span-8 space-y-4">

              {!selectedCourse ? (
                <div className="bg-white border-2 border-dashed rounded-2xl p-12 text-center">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="font-bold text-gray-600">पहले Course select करो</p>
                  <p className="text-sm text-gray-400 mt-1">बाएँ side से कोई course चुनो या नया बनाओ</p>
                </div>
              ) : (
                <>
                  {/* Breadcrumb + Actions */}
                  <div className="bg-white rounded-2xl border shadow-sm p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">

                      {/* Breadcrumb */}
                      <div className="flex items-center gap-1 text-sm font-bold flex-wrap">
                        <button onClick={goToRootManual} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600">
                          <Home className="w-4 h-4" /> Root
                        </button>

                        {breadcrumbPath.slice(1).map((b, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="text-gray-300">/</span>
                            <button
                              onClick={()=>{
                                // calculate original history index
                                if (idx === breadcrumbPath.length-2) {
                                  // current folder — no navigation
                                  return;
                                }
                                // map breadcrumb index to history
                                // breadcrumb = [Root, history[0], history[1], ..., current]
                                // history length = breadcrumb.length -2
                                // clicking on breadcrumb idx+1 corresponds to history idx
                                goToHistoryIndex(idx - (breadcrumbPath.length - manualHistory.length - 2));
                              }}
                              className={`px-2.5 py-1.5 rounded-lg ${idx === breadcrumbPath.length-2 ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                            >
                              {b.name}
                            </button>
                          </div>
                        ))}

                        {manualCurrentFolderId && (
                          <button onClick={goBackManual} className="ml-2 p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200">
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            value={searchContent}
                            onChange={e=>setSearchContent(e.target.value)}
                            placeholder="Search folder / notes..."
                            className="pl-8 pr-3 py-2 border rounded-xl text-sm w-44 focus:border-blue-500 outline-none"
                          />
                        </div>
                        <button
                          onClick={()=>selectedCourse && fetchAllContent(selectedCourse)}
                          className="p-2 bg-gray-50 border rounded-xl hover:bg-gray-100"
                          title="Refresh"
                        >
                          <RefreshCw className={`w-4 h-4 ${manualLoading?'animate-spin':''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Create Folder Bar */}
                    <div className="mt-4 flex gap-2 bg-purple-50 border border-purple-100 p-3 rounded-xl">
                      <div className="flex-1 flex items-center gap-2">
                        <FolderPlus className="w-5 h-5 text-purple-600 shrink-0" />
                        <input
                          value={newFolderNameManual}
                          onChange={e=>setNewFolderNameManual(e.target.value)}
                          placeholder={manualCurrentFolderId ? `New folder inside "${getFolderById(manualCurrentFolderId)?.title}"` : 'New folder in Root (e.g. Mathematics, Reasoning)'}
                          className="flex-1 p-2.5 border rounded-xl text-sm focus:border-purple-400 outline-none"
                          onKeyDown={e=>{ if(e.key==='Enter') handleCreateFolderManual(); }}
                        />
                      </div>
                      <button
                        onClick={handleCreateFolderManual}
                        className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 flex items-center gap-2"
                      >
                        <FolderPlus className="w-4 h-4" /> Create Folder
                      </button>
                    </div>

                    <p className="text-[11px] text-gray-400 mt-2">
                      📍 Location: <span className="font-bold text-gray-600">
                        {selectedCourse ? courses.find(c=>c.id===selectedCourse)?.title : ''} 
                        {manualCurrentFolderId ? ` → ${getFolderById(manualCurrentFolderId)?.title}` : ' → Root'}
                      </span>
                      &nbsp;|&nbsp; Kis jagah konsa course hai — yahan se pura hierarchy dikhेगा
                    </p>
                  </div>

                  {/* Folders Grid */}
                  <div className="bg-white rounded-2xl border shadow-sm p-4">
                    <h4 className="font-black text-gray-700 mb-3 flex items-center gap-2">
                      <Folder className="w-5 h-5 text-yellow-500" />
                      Folders in this location ({currentFolders.length})
                    </h4>

                    {manualLoading ? (
                      <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>
                    ) : currentFolders.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed rounded-xl bg-gray-50/50">
                        <Folder className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400 font-bold">No folders here</p>
                        <p className="text-xs text-gray-400 mt-1">ऊपर से नया folder बनाओ</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {currentFolders.map(folder => (
                          <div
                            key={folder.id}
                            className="group border-2 border-gray-100 rounded-xl p-3 flex items-center justify-between bg-white hover:border-purple-200 hover:shadow-md transition-all"
                          >
                            {editingFolderId === folder.id ? (
                              <div className="flex-1 flex gap-2">
                                <input
                                  autoFocus
                                  value={editingFolderTitle}
                                  onChange={e=>setEditingFolderTitle(e.target.value)}
                                  className="flex-1 p-2 border rounded-lg text-sm"
                                  onKeyDown={e=>{
                                    if(e.key==='Enter') handleUpdateFolderManual();
                                    if(e.key==='Escape') { setEditingFolderId(null); setEditingFolderTitle(''); }
                                  }}
                                />
                                <button onClick={handleUpdateFolderManual} className="p-2 bg-green-600 text-white rounded-lg"><Save className="w-4 h-4" /></button>
                                <button onClick={()=>{ setEditingFolderId(null); setEditingFolderTitle(''); }} className="p-2 bg-gray-200 rounded-lg"><XIcon className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={()=>enterFolderManual(folder)}
                                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                >
                                  <div className="p-2 bg-yellow-100 rounded-lg text-yellow-600 group-hover:bg-yellow-200 transition-colors">
                                    <Folder className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-700 truncate">{folder.title}</p>
                                    <p className="text-[11px] text-gray-400">
                                      {allContentItems.filter(c=>c.parentId===folder.id).length} items inside
                                    </p>
                                  </div>
                                </button>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={()=>{ setEditingFolderId(folder.id); setEditingFolderTitle(folder.title); }}
                                    className="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={()=>handleDeleteFolderManual(folder.id, folder.title)}
                                    className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes / Premium Content List */}
                  <div className="bg-white rounded-2xl border shadow-sm p-4">
                    <h4 className="font-black text-gray-700 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      Premium Notes / Content in this folder ({currentNotes.length})
                    </h4>

                    {manualLoading ? (
                      <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : currentNotes.length === 0 ? (
                      <div className="py-8 text-center border border-dashed rounded-xl">
                        <FileText className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400">यहाँ अभी कोई notes नहीं हैं</p>
                        <p className="text-xs text-gray-400 mt-1">AI Generator से बना कर यहीं पर save करो</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                        {currentNotes.map(note => (
                          <div key={note.id} className="border rounded-xl p-3 flex items-center justify-between bg-gray-50/70 hover:bg-white hover:shadow-sm hover:border-blue-200 transition-all">
                            {editingContentId === note.id ? (
                              <div className="flex-1 flex gap-2">
                                <input
                                  autoFocus
                                  value={editingContentTitle}
                                  onChange={e=>setEditingContentTitle(e.target.value)}
                                  className="flex-1 p-2 border rounded-lg text-sm"
                                  onKeyDown={e=>{
                                    if(e.key==='Enter') handleUpdateContentTitle();
                                    if(e.key==='Escape') { setEditingContentId(null); setEditingContentTitle(''); }
                                  }}
                                />
                                <button onClick={handleUpdateContentTitle} className="p-2 bg-green-600 text-white rounded-lg"><Save className="w-4 h-4" /></button>
                                <button onClick={()=>{ setEditingContentId(null); setEditingContentTitle(''); }} className="p-2 bg-gray-200 rounded-lg"><XIcon className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-sm text-gray-700 truncate">{note.title}</p>
                                    <div className="flex gap-2 mt-0.5 flex-wrap">
                                      {note.setNumber && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Set #{note.setNumber}</span>}
                                      {note.exam && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{note.exam}</span>}
                                      {note.subject && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{note.subject}</span>}
                                      <span className="text-[10px] text-gray-400">{note.id.slice(0,8)}...</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-1.5 shrink-0 ml-2">
                                  <button
                                    onClick={()=>handlePreviewContent(note)}
                                    className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                                    title="Preview"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={()=>{ setEditingContentId(note.id); setEditingContentTitle(note.title); }}
                                    className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={()=>handleDeleteContent(note.id, note.title)}
                                    className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Help Box */}
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-4">
                    <h4 className="font-black text-yellow-800 text-sm mb-2">💡 Old Screen - Kaise Use Karen?</h4>
                    <ul className="text-xs text-yellow-800 space-y-1.5 list-disc pl-4">
                      <li><b>Course banao:</b> Left side में नाम लिखो → Add → वो select हो जाएगा</li>
                      <li><b>Folder banao:</b> Right side में folder name → Create Folder — Root में या किसी folder के अंदर जाकर nested बना सकते हो</li>
                      <li><b>Navigation:</b> Folder पर click करके अंदर जाओ, Breadcrumb से वापस आओ</li>
                      <li><b>Kis jagah konsa course hai:</b> Left में courses, Right में उस course के अंदर सारे folders & notes दिखते हैं — पूरा hierarchy यहाँ clear है</li>
                      <li><b>AI Generator se connection:</b> Manual में बनाया folder तुरंत AI Generator वाले dropdown में भी दिखेगा</li>
                      <li><b>Delete / Edit:</b> Hover करने पर ✏️ 🗑️ icons आते हैं</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== SHARED PREVIEW MODALS ===== */}
      {showContentPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <h3 className="font-bold text-lg truncate pr-4">
                👁️ {contentPreviewTitle}
              </h3>
              <button
                onClick={() => setShowContentPreview(false)}
                className="p-2 hover:bg-gray-200 rounded-xl font-bold text-gray-500 shrink-0"
              >
                ✕ Close
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-6 prose max-w-none"
              dangerouslySetInnerHTML={{ __html: contentPreviewHTML }}
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default PremiumTab;

