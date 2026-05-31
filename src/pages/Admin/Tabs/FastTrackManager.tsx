// @ts-nocheck
import React, {
    useState, useEffect, useCallback,
    useRef, useMemo
} from 'react';
import { db } from '@/firebase/config';
import {
    collection, addDoc, updateDoc, deleteDoc,
    doc, getDocs, query, orderBy, serverTimestamp,
    limit
} from 'firebase/firestore';
import {
    Save, Trash2, Edit2, Database, Plus, X,
    CheckCircle, RefreshCw, Loader2, Filter,
    AlertTriangle, ExternalLink, Eye
} from 'lucide-react';

// =========================================================
// 🛠️ HELPERS
// =========================================================
function createSlug(title) {
    if (!title) return `update-${Date.now()}`;
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 80);
}

const INITIAL_FORM = {
    title: '',
    category: 'Result',
    org: '',
    updateDate: '',
    shortInfo: '',
    directLink: '',
    status: 'draft'
};

// =========================================================
// 🍞 TOAST COMPONENT
// =========================================================
const Toast = ({ toasts, removeToast }) => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
            <div
                key={toast.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl font-black text-sm text-white animate-in slide-in-from-right max-w-sm ${toast.type === 'error' ? 'bg-red-600'
                    : toast.type === 'warning' ? 'bg-yellow-600'
                        : 'bg-green-600'
                }`}
            >
                {toast.type === 'error' ? <AlertTriangle size={16} />
                    : toast.type === 'warning' ? <AlertTriangle size={16} />
                        : <CheckCircle size={16} />
                }
                {toast.message}
                <button
                    onClick={() => removeToast(toast.id)}
                    className="ml-auto opacity-70 hover:opacity-100"
                >
                    <X size={14} />
                </button>
            </div>
        ))}
    </div>
);

// =========================================================
// 🗑️ DELETE CONFIRM MODAL
// =========================================================
const DeleteModal = ({ item, onConfirm, onCancel, loading }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                    <AlertTriangle size={20} className="text-red-600" />
                </div>
                <h3 className="font-black text-gray-900">Delete करें?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">यह permanently delete होगा:</p>
            <p className="text-sm font-black text-gray-900 p-3 bg-gray-50 rounded-xl mb-6 line-clamp-2">
                {item?.title}
            </p>
            <div className="flex gap-3">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl font-black text-sm hover:bg-gray-50 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    disabled={loading}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete
                </button>
            </div>
        </div>
    </div>
);

// =========================================================
// ✅ APPROVE CONFIRM MODAL
// =========================================================
const ApproveModal = ({ item, onConfirm, onCancel, loading }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-full">
                    <CheckCircle size={20} className="text-green-600" />
                </div>
                <h3 className="font-black text-gray-900">Live Publish करें?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">यह website पर live हो जाएगा:</p>
            <p className="text-sm font-black text-gray-900 p-3 bg-green-50 rounded-xl mb-4 line-clamp-2">
                {item?.title}
            </p>
            <p className="text-xs text-gray-500 mb-6 p-3 bg-blue-50 rounded-xl">
                📢 Telegram notification और Video भी automatically generate होगा
            </p>
            <div className="flex gap-3">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl font-black text-sm hover:bg-gray-50 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    disabled={loading}
                    className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-black text-sm hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Approve & Publish
                </button>
            </div>
        </div>
    </div>
);



// =========================================================
// 📋 FORM FIELD COMPONENT
// =========================================================
const FormField = ({ label, name, value, onChange, type = 'text', placeholder = '', required = false, className = '' }) => (
    <div className={className}>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
        />
    </div>
);

// =========================================================
// 🃏 UPDATE CARD COMPONENT
// =========================================================
const UpdateCard = React.memo(({ item, onEdit, onDelete, onApprove }) => {
    const isDraft = item.status === 'draft';

    const categoryConfig = {
        'Result': 'bg-green-100 text-green-700',
        'Admit Card': 'bg-red-100 text-red-700',
        'Answer Key': 'bg-blue-100 text-blue-700',
        'Syllabus': 'bg-purple-100 text-purple-700'
    };

    return (
        <div className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-2xl hover:shadow-md transition-all group ${isDraft
            ? 'bg-yellow-50/50 border-yellow-200'
            : 'bg-slate-50/50 border-slate-100'
        }`}>
            <div className="mb-3 md:mb-0 pr-4 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {/* Status Badge */}
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${isDraft
                        ? 'bg-yellow-200 text-yellow-800'
                        : 'bg-green-100 text-green-700'
                    }`}>
                        {isDraft ? '🟡 Draft' : '🟢 Live'}
                    </span>

                    {/* Category Badge */}
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${categoryConfig[item.category] || 'bg-gray-100 text-gray-700'}`}>
                        {item.category}
                    </span>

                    {/* PDF Badge */}
                    {item.syllabusPDF && (
                        <a
                            href={item.syllabusPDF}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-purple-100 text-purple-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-md hover:bg-purple-200 transition-colors inline-flex items-center gap-1"
                        >
                            📄 PDF
                        </a>
                    )}

                    {/* Video Badge */}
                    {item.videoSent && (
                        <span className="bg-blue-100 text-blue-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                            🎬 Video
                        </span>
                    )}
                </div>

                <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
                    {item.title}
                </h4>

                {item.org && (
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        {item.org} {item.updateDate && `• ${item.updateDate}`}
                    </p>
                )}

                {item.directLink && (
                    <p className="text-[9px] text-slate-300 mt-0.5 truncate max-w-xs">
                        {item.directLink}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
                {/* View Live */}
                {!isDraft && (
                    <a
                        href={`/update/${item.slug || item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                        title="Live Preview"
                    >
                        <Eye size={14} />
                    </a>
                )}

                {/* Approve Draft */}
                {isDraft && (
                    <button
                        onClick={() => onApprove(item)}
                        className="p-2 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-xl transition-colors flex items-center gap-1 text-xs font-black"
                        title="Approve & Publish"
                    >
                        <CheckCircle size={14} />
                        <span className="hidden sm:inline">Approve</span>
                    </button>
                )}

                {/* Edit */}
                <button
                    onClick={() => onEdit(item)}
                    className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-colors"
                    title="Edit"
                >
                    <Edit2 size={14} />
                </button>

                {/* Delete */}
                <button
                    onClick={() => onDelete(item)}
                    className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-colors"
                    title="Delete"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
});

UpdateCard.displayName = 'UpdateCard';

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
const FastTrackManager = () => {
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [activeTab, setActiveTab] = useState('draft');
    const [editingId, setEditingId] = useState(null);
    const [deleteModal, setDeleteModal] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [approveModal, setApproveModal] = useState(null);
    const [approveLoading, setApproveLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Toast system
    const [toasts, setToasts] = useState([]);

    const [formData, setFormData] = useState(INITIAL_FORM);
    const isSubmitting = useRef(false);

    // =========================================================
    // 🍞 TOAST FUNCTIONS
    // =========================================================
    const showToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // =========================================================
    // 📡 FETCH DATA (One-time, not real-time)
    // =========================================================
    const fetchUpdates = useCallback(async () => {
        setFetchLoading(true);
        try {
            const q = query(
                collection(db, "fast_track"),
                orderBy("createdAt", "desc"),
                limit(200)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setUpdates(data);
        } catch (err) {
            console.error("Fetch error:", err);
            showToast("Data load failed: " + err.message, 'error');
        } finally {
            setFetchLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchUpdates();
    }, [fetchUpdates]);

    // =========================================================
    // 📝 FORM FIELD UPDATER
    // =========================================================
    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    // =========================================================
    // 💾 SAVE / UPDATE
    // =========================================================
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;

        if (!formData.title?.trim()) {
            showToast("Title जरूरी है!", 'error');
            return;
        }
        if (!formData.directLink?.trim()) {
            showToast("Direct Link जरूरी है!", 'error');
            return;
        }

        isSubmitting.current = true;
        setLoading(true);

        try {
            if (editingId) {
                // ✅ Update existing
                await updateDoc(doc(db, "fast_track", editingId), {
                    ...formData,
                    updatedAt: serverTimestamp()
                });
                showToast("✅ Update saved!");

                // Local state update
                setUpdates(prev => prev.map(item =>
                    item.id === editingId
                        ? { ...item, ...formData }
                        : item
                ));

            } else {
                // ✅ Add new
                const slug = createSlug(formData.title);
                const dateSuffix = new Date().toLocaleString('en-IN', {
                    month: 'short', year: 'numeric'
                }).toLowerCase().replace(' ', '-');
                const finalSlug = `${slug}-${dateSuffix}`;

                const docRef = await addDoc(collection(db, "fast_track"), {
                    ...formData,
                    slug: finalSlug,
                    createdAt: serverTimestamp()
                });

                showToast("✅ New update added!");

                // ✅ Trigger notifications if published
                if (formData.status === 'published') {
                    const payload = {
                        ...formData,
                        id: docRef.id,
                        slug: finalSlug
                    };
                    await triggerGitHubAction('send_telegram_alert', {
                        jobData: payload,
                        docId: docRef.id,
                        type: 'FAST_TRACK'
                    });
                    await triggerGitHubAction('generate_video', {
                        jobData: payload
                    });
                    showToast("📢 Telegram & Video triggered!", 'success');
                }

                // Refresh list
                await fetchUpdates();
            }

            // Reset form
            setFormData(INITIAL_FORM);
            setEditingId(null);

        } catch (err) {
            console.error("Save error:", err);
            showToast("Error: " + err.message, 'error');
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    // =========================================================
    // ✏️ EDIT
    // =========================================================
    const handleEdit = useCallback((item) => {
        setFormData({
            title: item.title || '',
            category: item.category || 'Result',
            org: item.org || '',
            updateDate: item.updateDate || '',
            shortInfo: item.shortInfo || '',
            directLink: item.directLink || '',
            status: item.status || 'draft'
        });
        setEditingId(item.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    // =========================================================
    // 🗑️ DELETE
    // =========================================================
    const handleDeleteConfirm = async () => {
        if (!deleteModal) return;
        setDeleteLoading(true);
        try {
            await deleteDoc(doc(db, "fast_track", deleteModal.id));
            setUpdates(prev => prev.filter(u => u.id !== deleteModal.id));
            showToast("✅ Deleted successfully!");
        } catch (err) {
            showToast("Delete failed: " + err.message, 'error');
        } finally {
            setDeleteLoading(false);
            setDeleteModal(null);
        }
    };

    // =========================================================
    // ✅ APPROVE
    // =========================================================
    const handleApproveConfirm = async () => {
        if (!approveModal) return;
        setApproveLoading(true);
        try {
            await updateDoc(doc(db, "fast_track", approveModal.id), {
                status: 'published',
                publishedAt: serverTimestamp()
            });

            // Local state update
            setUpdates(prev => prev.map(item =>
                item.id === approveModal.id
                    ? { ...item, status: 'published' }
                    : item
            ));

            showToast("✅ Published successfully!");

           

        } catch (err) {
            showToast("Approve failed: " + err.message, 'error');
        } finally {
            setApproveLoading(false);
            setApproveModal(null);
        }
    };

    // =========================================================
    // 🔄 AUTO FETCH FROM SCRAPER
    // =========================================================
    const handleManualFetch = async () => {
        if (isFetching) return;

        setIsFetching(true);
        try {
            // ✅ Header से auth, URL में नहीं!
            const response = await fetch(
                "https://us-central1-studymaterial-406ad.cloudfunctions.net/fetchFastTrackUpdates",
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-auth-key': localStorage.getItem('sg_admin_token') || 'StudyGyaan_FastTrack_786'
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                showToast(`✅ ${data.count || 0} new updates fetched!`);
                await fetchUpdates(); // Refresh list
            } else {
                showToast("⚠️ " + (data.error || "Something went wrong"), 'warning');
            }
        } catch (err) {
            showToast("Fetch error: " + err.message, 'error');
        } finally {
            setIsFetching(false);
        }
    };

    // =========================================================
    // 🔢 FILTERED UPDATES (Memoized)
    // =========================================================
    const filteredUpdates = useMemo(() => {
        let list = updates;

        // Tab filter
        if (activeTab !== 'all') {
            list = list.filter(item =>
                activeTab === 'published'
                    ? item.status === 'published' || !item.status
                    : item.status === activeTab
            );
        }

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(item =>
                item.title?.toLowerCase().includes(q) ||
                item.org?.toLowerCase().includes(q) ||
                item.category?.toLowerCase().includes(q)
            );
        }

        return list;
    }, [updates, activeTab, searchQuery]);

    // =========================================================
    // 📊 STATS
    // =========================================================
    const stats = useMemo(() => ({
        total: updates.length,
        drafts: updates.filter(u => u.status === 'draft').length,
        live: updates.filter(u => u.status === 'published' || !u.status).length
    }), [updates]);

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-hindi">

            {/* Toast Notifications */}
            <Toast toasts={toasts} removeToast={removeToast} />

            {/* Delete Modal */}
            {deleteModal && (
                <DeleteModal
                    item={deleteModal}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setDeleteModal(null)}
                    loading={deleteLoading}
                />
            )}

            {/* Approve Modal */}
            {approveModal && (
                <ApproveModal
                    item={approveModal}
                    onConfirm={handleApproveConfirm}
                    onCancel={() => setApproveModal(null)}
                    loading={approveLoading}
                />
            )}

            {/* Header */}
            <div className="mb-6 border-b border-slate-200 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
                        <Database className="text-blue-600" size={28} />
                        Fast Track <span className="text-blue-600">Manager</span>
                    </h2>
                    <div className="flex gap-3 mt-1">
                        <span className="text-xs font-bold text-slate-400">
                            Total: {stats.total}
                        </span>
                        <span className="text-xs font-bold text-yellow-600">
                            Drafts: {stats.drafts}
                        </span>
                        <span className="text-xs font-bold text-green-600">
                            Live: {stats.live}
                        </span>
                    </div>
                </div>

                <button
                    onClick={handleManualFetch}
                    disabled={isFetching}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-60"
                >
                    {isFetching
                        ? <Loader2 className="animate-spin w-4 h-4" />
                        : <RefreshCw className="w-4 h-4" />
                    }
                    {isFetching ? "Fetching..." : "Auto Fetch"}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* =========================================
                    FORM
                ========================================= */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-blue-50 sticky top-4">
                        <h3 className="font-black text-blue-700 mb-5 text-lg uppercase flex items-center gap-2">
                            {editingId
                                ? <><Edit2 size={18} /> Edit Update</>
                                : <><Plus size={18} /> Add New</>
                            }
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-4">

                            {/* Category + Status */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                        Category
                                    </label>
                                    <select
                                        name="category"
                                        value={formData.category}
                                        onChange={handleChange}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                    >
                                        <option value="Result">Result</option>
                                        <option value="Admit Card">Admit Card</option>
                                        <option value="Answer Key">Answer Key</option>
                                        <option value="Syllabus">Syllabus</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                        Status
                                    </label>
                                    <select
                                        name="status"
                                        value={formData.status}
                                        onChange={handleChange}
                                        className={`w-full p-2.5 border rounded-xl font-bold text-sm outline-none focus:ring-2 ${formData.status === 'draft'
                                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200 focus:ring-yellow-200'
                                            : 'bg-green-50 text-green-700 border-green-200 focus:ring-green-200'
                                        }`}
                                    >
                                        <option value="published">🟢 Published</option>
                                        <option value="draft">🟡 Draft</option>
                                    </select>
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                    Title <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="title"
                                    value={formData.title}
                                    onChange={handleChange}
                                    placeholder="e.g. SSC CGL 2025 Tier 1 Result"
                                    required
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                />
                                {/* Slug Preview */}
                                {formData.title && (
                                    <p className="text-[9px] text-gray-400 mt-1">
                                        🔗 /update/{createSlug(formData.title)}-...
                                    </p>
                                )}
                            </div>

                            {/* Org + Date */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                        Organization
                                    </label>
                                    <input
                                        name="org"
                                        value={formData.org}
                                        onChange={handleChange}
                                        placeholder="e.g. SSC"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                        Update Date
                                    </label>
                                    <input
                                        name="updateDate"
                                        value={formData.updateDate}
                                        onChange={handleChange}
                                        placeholder="e.g. 15 March 2025"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>
                            </div>

                            {/* Short Info */}
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                    Short Description
                                </label>
                                <textarea
                                    name="shortInfo"
                                    value={formData.shortInfo}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="Brief description..."
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                />
                            </div>

                            {/* Direct Link */}
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 block">
                                    Direct Link <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="directLink"
                                    value={formData.directLink}
                                    onChange={handleChange}
                                    placeholder="https://..."
                                    required
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                />
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-2xl font-black text-sm uppercase shadow-lg active:scale-95 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {loading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <Save size={16} />
                                    }
                                    {loading ? "Saving..." : (editingId ? "Update" : "Save")}
                                </button>

                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingId(null);
                                            setFormData(INITIAL_FORM);
                                        }}
                                        className="p-3.5 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all"
                                        aria-label="Cancel Edit"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                {/* =========================================
                    LIST
                ========================================= */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-5 rounded-[2rem] shadow-lg border border-slate-100">

                        {/* List Header */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-3">
                            <h3 className="font-black text-slate-800 text-lg uppercase flex items-center gap-2">
                                <Filter size={18} className="text-blue-500" />
                                Updates
                                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                                    {filteredUpdates.length}
                                </span>
                            </h3>

                            {/* Tab Buttons */}
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                {[
                                    { id: 'draft', label: '🟡 Drafts' },
                                    { id: 'published', label: '🟢 Live' },
                                    { id: 'all', label: 'All' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeTab === tab.id
                                            ? 'bg-white shadow-sm text-blue-600'
                                            : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search */}
                        <input
                            type="search"
                            placeholder="Search updates..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                        />

                        {/* List */}
                        {fetchLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 size={24} className="animate-spin text-blue-600" />
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
                                {filteredUpdates.length === 0 ? (
                                    <div className="text-center py-16 text-slate-400 font-bold italic text-sm">
                                        {searchQuery
                                            ? `"${searchQuery}" के लिए कोई result नहीं`
                                            : "इस tab में कोई update नहीं है"
                                        }
                                    </div>
                                ) : (
                                    filteredUpdates.map(item => (
                                        <UpdateCard
                                            key={item.id}
                                            item={item}
                                            onEdit={handleEdit}
                                            onDelete={setDeleteModal}
                                            onApprove={setApproveModal}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
};

export default FastTrackManager;
