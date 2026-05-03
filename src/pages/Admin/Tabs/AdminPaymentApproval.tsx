// @ts-nocheck
import { useEffect, useState } from 'react';
// 🔥 Path check: 'src' folder tak pahunchne ke liye 3 levels piche
import { db } from '../../../firebase/config';
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    updateDoc, 
    setDoc, 
    serverTimestamp 
} from 'firebase/firestore';
import { 
    Check, 
    X, 
    ExternalLink, 
    Clock, 
    User, 
    Hash, 
    IndianRupee, 
    Loader2, 
    AlertCircle 
} from 'lucide-react';

const AdminPaymentApproval = () => {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        // Sirf 'pending' requests ko real-time fetch karein
        const q = query(collection(db, "purchases"), where("status", "==", "pending"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reqData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRequests(reqData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleAction = async (requestId: string, userId: string, itemId: string, action: 'approved' | 'rejected') => {
        const confirmMsg = `Kya aap is payment ko ${action === 'approved' ? 'APPROVE' : 'REJECT'} karna chahte hain?`;
        if (!window.confirm(confirmMsg)) return;

        setProcessingId(requestId);
        try {
            // 1. Update the Payment Request Status in 'purchases' collection
            const requestRef = doc(db, "purchases", requestId);
            
            // Note: Backend completed status match karne ke liye isko completed kar rahe hain
            const finalAction = action === 'approved' ? 'completed' : 'rejected';
            
            await updateDoc(requestRef, { 
                status: finalAction,
                processedAt: new Date().toISOString()
            });

            if (finalAction === 'completed') {
                // 2. Unlock only the specific item for the user
                const userRef = doc(db, "users", userId);
                
                // setDoc with merge:true is the safest way (works for new & old users)
                await setDoc(userRef, {
                    // 🔥 Dynamic key: purchased_COURSE_ID ko true set karega
                    [`purchased_${itemId}`]: true, 
                    lastPurchaseDate: new Date().toISOString()
                }, { merge: true });

                alert("✅ Payment Approved! Course unlocked successfully.");
            } else {
                alert("❌ Payment Rejected.");
            }
        } catch (error) {
            console.error("Action Error:", error);
            alert("Error processing action. Check console.");
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) return (
        <div className="p-10 text-center font-black uppercase tracking-widest text-slate-400">
            <Loader2 className="animate-spin mx-auto mb-2 text-blue-600" /> Loading Requests...
        </div>
    );

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Payment Desk</h1>
                        <p className="text-slate-500 font-bold italic">Verify manually uploaded screenshots</p>
                    </div>
                    <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Requests</p>
                        <p className="text-2xl font-black text-blue-600">{requests.length}</p>
                    </div>
                </div>

                {requests.length === 0 ? (
                    <div className="bg-white rounded-[2.5rem] p-16 text-center border-2 border-dashed border-slate-200 shadow-inner">
                        <Check className="mx-auto text-green-200 mb-4" size={64} />
                        <p className="text-slate-400 font-black uppercase tracking-[0.2em]">All Clear! No Pending Payments.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {requests.map((req) => (
                            <div key={req.id} className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col hover:border-blue-200 transition-all">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center bg-amber-50 px-4 py-1.5 rounded-full border border-amber-100">
                                        <Clock size={14} className="text-amber-600 mr-2" />
                                        <span className="text-amber-600 text-[10px] font-black uppercase tracking-wider">Awaiting Approval</span>
                                    </div>
                                    <p className="text-slate-400 text-[10px] font-bold">
                                        {/* Fallback for both new and old timestamp fields */}
                                        {req.timestamp?.toDate() ? new Date(req.timestamp.toDate()).toLocaleString() : req.createdAt?.toDate() ? new Date(req.createdAt.toDate()).toLocaleString() : 'Just Now'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">User Email</p>
                                            <div className="flex items-center text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                <User size={14} className="mr-2 shrink-0" />
                                                <span className="text-xs font-bold truncate">{req.userEmail}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">UTR / Trans ID</p>
                                            <div className="flex items-center text-slate-900 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                <Hash size={14} className="mr-2 text-blue-500" />
                                                <span className="text-sm font-black uppercase">{req.utr || "Auto-Generated"}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Amount Paid</p>
                                            <div className="flex items-center text-green-600 bg-green-50 p-2 rounded-xl border border-green-100">
                                                <IndianRupee size={14} className="mr-2" />
                                                <span className="text-xl font-black tracking-tighter">₹{req.amount}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col">
                                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1 text-center">Screenshot</p>
                                        <a href={req.screenshotUrl || "#"} target="_blank" rel="noreferrer" className="relative group rounded-2xl overflow-hidden border-2 border-slate-100 aspect-square bg-slate-100 block shadow-inner">
                                            <img src={req.screenshotUrl || "https://placehold.co/400x400?text=No+Screenshot"} alt="Screenshot" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-blue-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                                <ExternalLink className="text-white" size={24} />
                                            </div>
                                        </a>
                                    </div>
                                </div>

                                <div className="mt-auto pt-4 border-t border-slate-50">
                                    <div className="flex items-center gap-2 mb-4 bg-blue-50/50 p-3 rounded-xl border border-blue-50">
                                        <AlertCircle size={14} className="text-blue-500 shrink-0" />
                                        <p className="text-[11px] font-bold text-slate-600">
                                            Item: <span className="text-blue-700 font-black">{req.itemName || req.courseId}</span>
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={() => handleAction(req.id, req.userId, req.itemId || req.courseId, 'rejected')}
                                            disabled={processingId === req.id}
                                            className="flex items-center justify-center py-3.5 bg-white text-red-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-50 transition-all border-2 border-red-100 disabled:opacity-50"
                                        >
                                            <X size={14} className="mr-2" /> Reject
                                        </button>
                                        <button 
                                            onClick={() => handleAction(req.id, req.userId, req.itemId || req.courseId, 'approved')}
                                            disabled={processingId === req.id}
                                            className="flex items-center justify-center py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:bg-slate-400"
                                        >
                                            {processingId === req.id ? (
                                                <Loader2 className="animate-spin" size={14} />
                                            ) : (
                                                <><Check size={14} className="mr-2" /> Approve</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPaymentApproval;