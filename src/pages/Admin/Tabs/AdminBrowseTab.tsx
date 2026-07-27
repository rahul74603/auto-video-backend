import {
    useState, useEffect, useRef,
    useCallback, useMemo
} from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Banknote,
    Edit, Trash2, Plus, X, Save,
    UploadCloud, ShieldCheck, AlertTriangle,
    CheckCircle, Loader2, Eye
} from 'lucide-react';
import { storage } from '../../../firebase/config';
import { jobRepository } from '@/features/jobs/data/jobRepository';
import { jobDraftRepository } from '@/features/job-drafts/data/jobDraftRepository';
import type { JobPost } from '@/types/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type JobFormState = typeof INITIAL_FORM;

interface ToastMsg {
    message: string;
    type: string;
}

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// =========================================================
// 🛠️ CONSTANTS
// =========================================================
const JOB_CATEGORIES = [
    { id: 'ssc', name: 'SSC Exams' },
    { id: 'banking', name: 'Banking Exams' },
    { id: 'railway', name: 'Railway Exams' },
    { id: 'upsc', name: 'UPSC & Civil Services' },
    { id: 'defense', name: 'Defense & Police' },
    { id: 'teaching', name: 'Teaching Exams' },
    { id: 'engineering', name: 'Engineering / PSU' },
    { id: 'medical', name: 'Medical / Nurse' },
    { id: 'state', name: 'State Govt Exams' },
    { id: 'other', name: 'Post Office / Other' }
];

const INITIAL_FORM = {
    title: '', organization: '', vacancies: '', location: 'All India',
    advtNo: '', startDate: '', lastDate: '', qualification: '',
    ageLimit: '', minAge: '18', salary: '', applyLink: '',
    category: 'ssc', description: '', officialSiteLink: '',
    applicationFee: '', selectionProcess: '', eligibility: '',
    notificationLink: '', feeGen: '', feeOBC: '', feeSCST: '',
    feeFemale: '', price: '', imageUrl: '', isLive: true
};

// =========================================================
// 🛠️ HELPERS
// =========================================================
function createSlug(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 80);
}

function formatDateForInput(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
        const ddmmyyyy = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
        if (ddmmyyyy) {
            return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
        return '';
    } catch {
        return '';
    }
}

// =========================================================
// 🗑️ DELETE CONFIRMATION MODAL
// =========================================================
const DeleteModal = ({ jobTitle, onConfirm, onCancel, loading }: { jobTitle: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                    <AlertTriangle size={20} className="text-red-600" />
                </div>
                <h3 className="font-black text-gray-900">Delete Confirm करें?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-1">यह Job permanently delete होगी:</p>
            <p className="text-sm font-black text-gray-900 mb-6 p-3 bg-gray-50 rounded-xl">
                {jobTitle}
            </p>
            <div className="flex gap-3">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl font-black text-sm text-gray-600 hover:bg-gray-50 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    disabled={loading}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Trash2 size={16} />
                    }
                    Delete
                </button>
            </div>
        </div>
    </div>
);

// =========================================================
// 📝 FORM FIELD COMPONENT (Reusable)
// =========================================================
const FormField = ({
    label, value, onChange, type = 'text',
    placeholder = '', required = false,
    className = '', disabled = false
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    placeholder?: string;
    required?: boolean;
    className?: string;
    disabled?: boolean;
}) => (
    <div className={className}>
        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 block">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className="w-full p-2.5 border-2 border-gray-100 rounded-xl font-bold text-sm focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white"
        />
    </div>
);

function asStr(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

/** Map a Firestore job/draft document into the form shape. */
function mapPostToForm(post: Record<string, unknown>): JobFormState {
    return {
        ...INITIAL_FORM,
        title: asStr(post.title),
        organization: asStr(post.organization),
        vacancies: asStr(post.vacancies),
        location: asStr(post.location) || 'All India',
        advtNo: asStr(post.advtNo),
        startDate: formatDateForInput(asStr(post.startDate)),
        lastDate: formatDateForInput(asStr(post.lastDate)),
        qualification: asStr(post.qualification),
        ageLimit: asStr(post.ageLimit),
        minAge: asStr(post.minAge) || '18',
        salary: asStr(post.salary),
        applyLink: asStr(post.applyLink),
        category: asStr(post.category) || 'ssc',
        description: asStr(post.description),
        officialSiteLink: asStr(post.officialSiteLink),
        applicationFee: asStr(post.applicationFee),
        selectionProcess: asStr(post.selectionProcess),
        eligibility: asStr(post.eligibility),
        notificationLink: asStr(post.notificationLink),
        feeGen: asStr(post.feeGen),
        feeOBC: asStr(post.feeOBC),
        feeSCST: asStr(post.feeSCST),
        feeFemale: asStr(post.feeFemale),
        price: asStr(post.price),
        imageUrl: asStr(post.imageUrl),
        isLive: true
    };
}

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
const AdminBrowseTab = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Draft data passed through router state is used ONLY to initialize state.
    const initialDraft = (() => {
        const raw: unknown = location.state?.draftData;
        if (!raw) return null;
        const data = Array.isArray(raw) ? raw[0] : raw;
        return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    })();
    const initialDraftId = location.state?.draftId
        || asStr(initialDraft?.id)
        || asStr(initialDraft?.docId)
        || null;

    // State
    const [posts, setPosts] = useState<JobPost[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [showForm, setShowForm] = useState(() => Boolean(initialDraft));
    const [postType, setPostType] = useState(() => asStr(initialDraft?.type) || 'JOB');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [currentDraftId, setCurrentDraftId] = useState<string | null>(initialDraftId);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [deleteModal, setDeleteModal] = useState<JobPost | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [toast, setToast] = useState<ToastMsg | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState<JobFormState>(() => (initialDraft ? mapPostToForm(initialDraft) : INITIAL_FORM));
    const isSubmitting = useRef(false);

    // =========================================================
    // 🍞 TOAST NOTIFICATION
    // =========================================================
    const showToast = useCallback((message: string, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    // =========================================================
    // 📝 FORM FIELD UPDATER
    // =========================================================
    const updateField = useCallback((field: keyof JobFormState | string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

    // =========================================================
    // 📡 FETCH POSTS
    // =========================================================
    const fetchContent = useCallback(async () => {
        setFetchLoading(true);
        try {
            const data = await jobRepository.list({
                typeIn: ["JOB", "AFFILIATE"],
                orderField: "updatedAt",
                limitCount: 100
            });
            setPosts(data);
        } catch (err) {
            console.error("Fetch error:", err);
            showToast("Jobs load नहीं हो सकी: " + errMsg(err), 'error');
        } finally {
            setFetchLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        let cancelled = false;
        jobRepository
            .list({ typeIn: ["JOB", "AFFILIATE"], orderField: "updatedAt", limitCount: 100 })
            .then((data) => {
                if (!cancelled) setPosts(data);
            })
            .catch((err) => {
                if (!cancelled) showToast("Jobs load नहीं हो सकी: " + errMsg(err), 'error');
            });
        return () => {
            cancelled = true;
        };
    }, [showToast]);

    // =========================================================
    // 📤 FILE UPLOAD HELPER
    // =========================================================
    async function uploadFile(file: File | null, folder: string): Promise<string | null> {
        if (!file) return null;
        const ext = file.name.split('.').pop();
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    }

    // =========================================================
    // 💾 SAVE DRAFT ONLY
    // =========================================================
    const handleUpdateDraftOnly = async () => {
        const draftId = currentDraftId;
        if (!draftId) {
            showToast("Draft ID नहीं मिला!", 'error');
            return;
        }

        setLoading(true);
        try {
            let notificationLink: string | null = formData.notificationLink;
            if (pdfFile) {
                notificationLink = await uploadFile(pdfFile, 'job_notifications');
            }

            let imageUrl: string | null = formData.imageUrl;
            if (imageFile) {
                imageUrl = await uploadFile(imageFile, 'job_images');
            }

            const payload = {
                ...formData,
                notificationLink,
                imageUrl,
                type: postType,
                updatedAt: new Date().toISOString()
            };

            const clean = Object.fromEntries(
                Object.entries(payload).filter(([, v]) => v !== undefined)
            );

            await jobDraftRepository.updateDraft(String(draftId), clean);

            showToast("✅ Draft Successfully Save हो गया!");
            setShowForm(false);
            setPdfFile(null);
            setImageFile(null);
            navigate('/sg-admin', { replace: true, state: { activeTab: 'JOBS AI' } });

        } catch (err) {
            showToast("Save Failed: " + errMsg(err), 'error');
        } finally {
            setLoading(false);
        }
    };

    // =========================================================
    // 🚀 PUBLISH / UPDATE
    // =========================================================
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (isSubmitting.current) return;

        if (!formData.title.trim()) {
            showToast("Title जरूरी है!", 'error');
            return;
        }

        isSubmitting.current = true;
        setLoading(true);

        try {
            let notificationLink: string | null = formData.notificationLink;
            if (pdfFile) {
                notificationLink = await uploadFile(pdfFile, 'job_notifications');
            }

            let imageUrl: string | null = formData.imageUrl;
            if (imageFile) {
                imageUrl = await uploadFile(imageFile, 'job_images');
            }

            const slug = createSlug(formData.title);

            const payload = {
                ...formData,
                notificationLink,
                imageUrl,
                type: postType,
                slug,
                isLive: true,
                updatedAt: new Date().toISOString()
            };

            const clean = Object.fromEntries(
                Object.entries(payload).filter(([, v]) => v !== undefined)
            );

            if (editingId) {
                await jobRepository.update(String(editingId), clean);
                showToast("✅ Live Post Update हो गया!");
            } else {
                let liveJobId;

                if (currentDraftId) {
                    liveJobId = String(currentDraftId);
                    await jobRepository.set(liveJobId, {
                        ...clean,
                        slug: liveJobId,
                        createdAt: new Date().toISOString()
                    });
                    await jobDraftRepository.deleteDraft(liveJobId).catch(() => {});
                } else {
                    liveJobId = await jobRepository.add({
                        ...clean,
                        createdAt: new Date().toISOString()
                    });
                    await jobRepository.update(liveJobId, {
                        slug: createSlug(formData.title) || liveJobId
                    });
                }
                showToast("🚀 Job Successfully Publish हो गई!");
            }

            setShowForm(false);
            setPdfFile(null);
            setImageFile(null);
            setEditingId(null);
            setCurrentDraftId(null);
            setFormData(INITIAL_FORM);
            await fetchContent();
            navigate(location.pathname, { replace: true, state: {} });

        } catch (err) {
            showToast("Error: " + errMsg(err), 'error');
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    // =========================================================
    // ✏️ EDIT
    // =========================================================
    const handleEdit = useCallback((post: JobPost) => {
        setEditingId(post.id);
        setPostType(post.type || 'JOB');
        setFormData(mapPostToForm(post));
        setPdfFile(null);
        setImageFile(null);
        setCurrentDraftId(null);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    // =========================================================
    // 🗑️ DELETE
    // =========================================================
    const handleDeleteConfirm = async () => {
        if (!deleteModal) return;
        setDeleteLoading(true);
        try {
            await jobRepository.remove(deleteModal.id);
            setPosts(prev => prev.filter(p => p.id !== deleteModal.id));
            showToast("✅ Job Delete हो गई!");
        } catch (err) {
            showToast("Delete Failed: " + errMsg(err), 'error');
        } finally {
            setDeleteLoading(false);
            setDeleteModal(null);
        }
    };

    // =========================================================
    // 🏷️ CHECK IF JOB IS EXPIRED
    // =========================================================
    const isJobExpired = useCallback((lastDate?: string | null) => {
        if (!lastDate) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const last = new Date(lastDate);
        if (isNaN(last.getTime())) return false;
        return last < today;
    }, []);

    // =========================================================
    // 🔍 FILTERED + SORTED POSTS
    // Expired jobs automatically end में जाएंगी
    // =========================================================
    const filteredPosts = useMemo(() => {
        let result = posts;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = posts.filter(p =>
                p.title?.toLowerCase().includes(q) ||
                p.organization?.toLowerCase().includes(q)
            );
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return [...result].sort((a, b) => {
            const aLastDate = a.lastDate ? new Date(a.lastDate) : null;
            const bLastDate = b.lastDate ? new Date(b.lastDate) : null;

            const aExpired = aLastDate && !isNaN(aLastDate.getTime())
                ? aLastDate < today
                : false;
            const bExpired = bLastDate && !isNaN(bLastDate.getTime())
                ? bLastDate < today
                : false;

            // Expired को end में
            if (aExpired && !bExpired) return 1;
            if (!aExpired && bExpired) return -1;

            // Same group में original order (updatedAt desc already from firestore)
            return 0;
        });
    }, [posts, searchQuery]);

    // =========================================================
    // 🔄 FORM RESET & CLOSE
    // =========================================================
    const handleClose = useCallback(() => {
        setShowForm(false);
        setPdfFile(null);
        setImageFile(null);
        setEditingId(null);
        setCurrentDraftId(null);
        setFormData(INITIAL_FORM);
        navigate(location.pathname, { replace: true, state: {} });
    }, [navigate, location.pathname]);

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <div className="mt-16 md:mt-24 bg-white rounded-xl shadow-lg border p-3 md:p-6 font-hindi">

            {/* ✅ Toast Notification */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-2xl font-black text-sm flex items-center gap-2 animate-in slide-in-from-right ${toast.type === 'error'
                    ? 'bg-red-600 text-white'
                    : 'bg-green-600 text-white'
                    }`}>
                    {toast.type === 'error'
                        ? <AlertTriangle size={16} />
                        : <CheckCircle size={16} />
                    }
                    {toast.message}
                </div>
            )}

            {/* ✅ Delete Modal */}
            {deleteModal && (
                <DeleteModal
                    jobTitle={deleteModal.title || 'इस Job को'}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setDeleteModal(null)}
                    loading={deleteLoading}
                />
            )}

            {/* =========================================================
                LIST VIEW
            ========================================================= */}
            {!showForm ? (
                <>
                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 mb-5 justify-between items-center">
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setPostType('JOB');
                                    setEditingId(null);
                                    setCurrentDraftId(null);
                                    setFormData(INITIAL_FORM);
                                    setShowForm(true);
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-1.5"
                            >
                                <Plus size={14} />
                                New Job
                            </button>
                            <button
                                onClick={() => {
                                    setPostType('AFFILIATE');
                                    setEditingId(null);
                                    setCurrentDraftId(null);
                                    setFormData(INITIAL_FORM);
                                    setShowForm(true);
                                }}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-1.5"
                            >
                                <Plus size={14} />
                                Product
                            </button>
                        </div>

                        {/* Search */}
                        <input
                            type="search"
                            placeholder="Search jobs..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64"
                        />
                    </div>

                    {/* Posts List */}
                    {fetchLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 size={24} className="animate-spin text-blue-600" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredPosts.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 font-bold text-sm">
                                    {searchQuery
                                        ? 'कोई result नहीं मिला'
                                        : 'कोई Job नहीं है अभी'
                                    }
                                </div>
                            ) : filteredPosts.map(post => {
                                const expired = isJobExpired(post.lastDate);

                                return (
                                    <div
                                        key={post.id}
                                        className={`flex flex-col sm:flex-row justify-between sm:items-center p-3 md:p-4 border rounded-xl bg-white shadow-sm transition-all gap-2 ${expired
                                            ? 'opacity-60 border-gray-200 hover:border-gray-300 hover:shadow-sm'
                                            : 'hover:border-blue-200 hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">

                                            {/* Type Badge */}
                                            <span className={`shrink-0 text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${post.type === 'JOB'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-green-100 text-green-700'
                                                }`}>
                                                {post.type}
                                            </span>

                                            {/* Live / Draft Status */}
                                            <span className={`shrink-0 text-[8px] font-black px-2 py-0.5 rounded-full ${post.isLive === false
                                                ? 'bg-red-100 text-red-600'
                                                : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                {post.isLive === false ? 'Draft' : 'Live'}
                                            </span>

                                            {/* ✅ Expired Badge */}
                                            {expired && (
                                                <span className="shrink-0 text-[8px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 flex items-center gap-0.5">
                                                    ⏰ Expired
                                                </span>
                                            )}

                                            {/* Title */}
                                            <span className={`font-bold text-sm truncate ${expired
                                                ? 'text-gray-400'
                                                : 'text-gray-800'
                                                }`}>
                                                {post.title}
                                            </span>

                                            {/* ✅ Last Date - Expired jobs के लिए */}
                                            {expired && post.lastDate && (
                                                <span className="text-[9px] text-orange-400 font-bold shrink-0">
                                                    Last: {new Date(post.lastDate).toLocaleDateString('en-IN', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex gap-1.5 shrink-0">
                                            {/* View */}
                                            <a
                                                href={`/job/${post.slug || post.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                                title="Live Preview"
                                            >
                                                <Eye size={14} />
                                            </a>
                                            {/* Edit */}
                                            <button
                                                onClick={() => handleEdit(post)}
                                                className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                                                title="Edit"
                                            >
                                                <Edit size={14} />
                                            </button>
                                            {/* Delete */}
                                            <button
                                                onClick={() => setDeleteModal({ id: post.id, title: post.title })}
                                                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (

                /* =========================================================
                    FORM VIEW
                ========================================================= */
                <div className="max-w-5xl mx-auto">
                    {/* Form Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-black text-blue-700 uppercase">
                                {editingId
                                    ? '✏️ Edit'
                                    : currentDraftId
                                        ? '📋 Review Draft'
                                        : '➕ Add New'
                                } {postType}
                            </h3>
                            {currentDraftId && !editingId && (
                                <p className="text-xs text-gray-500 font-bold mt-0.5">
                                    Draft ID: {currentDraftId}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2 bg-gray-100 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            aria-label="Close Form"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <FormField
                                    label="Post Title"
                                    value={formData.title}
                                    onChange={v => updateField('title', v)}
                                    placeholder="e.g. SSC CGL 2026 Recruitment"
                                    required
                                />
                                {/* Slug Preview */}
                                {formData.title && (
                                    <p className="text-[9px] text-gray-400 font-bold mt-1">
                                        🔗 URL: /job/{createSlug(formData.title)}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 block">
                                    Category
                                </label>
                                <select
                                    value={formData.category}
                                    onChange={e => updateField('category', e.target.value)}
                                    className="w-full p-2.5 border-2 border-gray-100 rounded-xl font-bold text-sm bg-white outline-none focus:border-blue-500"
                                >
                                    {JOB_CATEGORIES.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* JOB SPECIFIC FIELDS */}
                        {postType === 'JOB' && (
                            <div className="space-y-4">

                                {/* Basic Job Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border-2 border-gray-100">
                                    <FormField
                                        label="Organization"
                                        value={formData.organization}
                                        onChange={v => updateField('organization', v)}
                                        placeholder="e.g. SSC, UPSC, Railway"
                                    />
                                    <FormField
                                        label="Advt No"
                                        value={formData.advtNo}
                                        onChange={v => updateField('advtNo', v)}
                                        placeholder="01/2026"
                                    />
                                    <FormField
                                        label="Start Date"
                                        value={formData.startDate}
                                        onChange={v => updateField('startDate', v)}
                                        type="date"
                                    />
                                    <FormField
                                        label="Last Date"
                                        value={formData.lastDate}
                                        onChange={v => updateField('lastDate', v)}
                                        type="date"
                                    />
                                </div>

                                {/* Job Specs */}
                                <div className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-100">
                                    <h4 className="text-xs font-black text-blue-700 mb-4 uppercase flex items-center gap-2">
                                        <ShieldCheck size={14} />
                                        Job Specifications
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                                        <FormField
                                            label="Total Vacancies"
                                            value={formData.vacancies}
                                            onChange={v => updateField('vacancies', v)}
                                            placeholder="5000+"
                                        />
                                        <FormField
                                            label="Salary"
                                            value={formData.salary}
                                            onChange={v => updateField('salary', v)}
                                            placeholder="₹21,700 - 69,100"
                                        />
                                        <FormField
                                            label="Qualification"
                                            value={formData.qualification}
                                            onChange={v => updateField('qualification', v)}
                                            placeholder="10th/12th/Degree"
                                        />
                                        <FormField
                                            label="Min Age"
                                            value={formData.minAge}
                                            onChange={v => updateField('minAge', v)}
                                            placeholder="18"
                                        />
                                        <FormField
                                            label="Max Age"
                                            value={formData.ageLimit}
                                            onChange={v => updateField('ageLimit', v)}
                                            placeholder="25/30"
                                        />
                                        <FormField
                                            label="Location"
                                            value={formData.location}
                                            onChange={v => updateField('location', v)}
                                            placeholder="All India"
                                        />
                                    </div>
                                    <FormField
                                        label="Selection Process"
                                        value={formData.selectionProcess}
                                        onChange={v => updateField('selectionProcess', v)}
                                        placeholder="Written Test / Interview / Merit"
                                    />
                                    <div className="mt-3">
                                        <FormField
                                            label="Extra Eligibility"
                                            value={formData.eligibility}
                                            onChange={v => updateField('eligibility', v)}
                                            placeholder="Physical requirements, etc."
                                        />
                                    </div>
                                </div>

                                {/* Fees */}
                                <div className="bg-yellow-50 p-4 rounded-2xl border-2 border-yellow-100">
                                    <h4 className="text-xs font-black text-yellow-700 mb-4 uppercase flex items-center gap-2">
                                        <Banknote size={14} />
                                        Application Fees
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <FormField
                                            label="Gen/OBC/EWS"
                                            value={formData.feeGen}
                                            onChange={v => updateField('feeGen', v)}
                                            placeholder="₹500"
                                        />
                                        <FormField
                                            label="SC/ST/PH"
                                            value={formData.feeSCST}
                                            onChange={v => updateField('feeSCST', v)}
                                            placeholder="₹0"
                                        />
                                        <FormField
                                            label="Female"
                                            value={formData.feeFemale}
                                            onChange={v => updateField('feeFemale', v)}
                                            placeholder="₹100"
                                        />
                                        <FormField
                                            label="Other"
                                            value={formData.feeOBC}
                                            onChange={v => updateField('feeOBC', v)}
                                            placeholder="Any other"
                                        />
                                    </div>
                                    <div className="mt-3">
                                        <label className="text-[9px] font-black text-yellow-700 uppercase mb-1 block">
                                            Fee Description
                                        </label>
                                        <textarea
                                            value={formData.applicationFee}
                                            onChange={e => updateField('applicationFee', e.target.value)}
                                            rows={2}
                                            className="w-full p-3 border-2 border-white rounded-xl bg-white text-sm font-bold outline-none"
                                            placeholder="Online payment only, SBI Challan etc..."
                                        />
                                    </div>
                                </div>

                                {/* Links & Files */}
                                <div className="bg-red-50 p-4 rounded-2xl border-2 border-red-100">
                                    <h4 className="text-xs font-black text-red-700 mb-4 uppercase">
                                        Links & Files
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                        {/* PDF Upload */}
                                        <div>
                                            <label className="text-[9px] font-black text-red-600 uppercase mb-1 flex items-center gap-1">
                                                <UploadCloud size={12} />
                                                Notification PDF / Image
                                            </label>
                                            <input
                                                type="file"
                                                accept="application/pdf,image/*"
                                                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                                                className="w-full p-2 text-xs border-2 border-red-200 rounded-xl bg-white font-bold cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-black file:bg-red-100 file:text-red-700"
                                            />
                                            <p className="text-[9px] text-gray-400 mt-1">
                                                या नीचे link paste करो
                                            </p>
                                            <input
                                                value={formData.notificationLink}
                                                onChange={e => updateField('notificationLink', e.target.value)}
                                                disabled={!!pdfFile}
                                                placeholder="https://..."
                                                className="w-full mt-1 p-2 border border-red-200 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                                            />
                                        </div>

                                        {/* Job Image Upload */}
                                        <div>
                                            <label className="text-[9px] font-black text-blue-600 uppercase mb-1 flex items-center gap-1">
                                                <UploadCloud size={12} />
                                                Job Featured Image
                                            </label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                                                className="w-full p-2 text-xs border-2 border-blue-200 rounded-xl bg-white font-bold cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-black file:bg-blue-100 file:text-blue-700"
                                            />
                                            <p className="text-[9px] text-gray-400 mt-1">
                                                या URL paste करो
                                            </p>
                                            <input
                                                value={formData.imageUrl}
                                                onChange={e => updateField('imageUrl', e.target.value)}
                                                disabled={!!imageFile}
                                                placeholder="https://..."
                                                className="w-full mt-1 p-2 border border-blue-200 rounded-xl text-xs font-bold disabled:opacity-40 bg-white"
                                            />
                                        </div>

                                        <FormField
                                            label="Apply Online Link"
                                            value={formData.applyLink}
                                            onChange={v => updateField('applyLink', v)}
                                            placeholder="https://..."
                                        />
                                        <FormField
                                            label="Official Website"
                                            value={formData.officialSiteLink}
                                            onChange={v => updateField('officialSiteLink', v)}
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* AFFILIATE FIELDS */}
                        {postType === 'AFFILIATE' && (
                            <div className="bg-green-50 p-5 rounded-2xl border-2 border-green-100 space-y-4">
                                <h4 className="text-xs font-black text-green-700 uppercase">
                                    Product Details
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        label="Price (₹)"
                                        value={formData.price}
                                        onChange={v => updateField('price', v)}
                                        placeholder="999"
                                    />
                                    <FormField
                                        label="Product Image URL"
                                        value={formData.imageUrl}
                                        onChange={v => updateField('imageUrl', v)}
                                        placeholder="https://..."
                                    />
                                    <div className="md:col-span-2">
                                        <FormField
                                            label="Affiliate Buy Link"
                                            value={formData.applyLink}
                                            onChange={v => updateField('applyLink', v)}
                                            placeholder="Amazon/Flipkart URL..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        <div>
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 block">
                                Full Description
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={e => updateField('description', e.target.value)}
                                rows={12}
                                className="w-full p-4 border-2 border-gray-100 rounded-2xl font-medium text-sm focus:border-blue-500 outline-none transition-all leading-relaxed"
                                placeholder="Job की पूरी जानकारी यहाँ लिखें..."
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-8">

                            {/* Save Draft (only for AI drafts) */}
                            {currentDraftId && !editingId && (
                                <button
                                    type="button"
                                    onClick={handleUpdateDraftOnly}
                                    disabled={loading}
                                    className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-black uppercase text-sm border-2 border-slate-200 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {loading
                                        ? <Loader2 size={18} className="animate-spin" />
                                        : <><Edit size={18} /> Draft Save करो</>
                                    }
                                </button>
                            )}

                            {/* Publish Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-black uppercase text-sm shadow-xl hover:from-blue-700 hover:to-blue-800 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {loading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <>
                                        <Save size={18} />
                                        {editingId ? 'Update Live Post' : 'Publish Live 🚀'}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default AdminBrowseTab;
