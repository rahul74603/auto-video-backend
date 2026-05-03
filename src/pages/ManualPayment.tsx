// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, IndianRupee, ArrowLeft, Loader2, MessageCircle } from 'lucide-react';

const ManualPayment = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const { itemId, itemName, amount } = location.state || { 
        itemId: 'pro_plan_2026', 
        itemName: 'Premium Access', 
        amount: 199 
    };

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    // ✅ नया स्टेट जो यूनीक अमाउंट होल्ड करेगा
    const [finalPayableAmount, setFinalPayableAmount] = useState<number>(amount);

    const upiId = import.meta.env.VITE_UPI_ID; 

    // ✅ 16 Minute Lock & Unique Amount Generator Logic
    useEffect(() => {
        const fetchUniqueAmount = async () => {
            try {
                // 16 मिनट पहले का टाइम निकालें
                const timeLimit = new Date();
                timeLimit.setMinutes(timeLimit.getMinutes() - 60);

                // फायरबेस से इस कोर्स के पेंडिंग पेमेंट्स निकालें
                const q = query(
                    collection(db, "purchases"),
                    where("courseId", "==", itemId),
                    where("status", "==", "pending")
                );
                const snapshot = await getDocs(q);

                // पिछले 16 मिनट में इस्तेमाल हुए सभी अमाउंट्स की लिस्ट बनाएँ
                const usedAmounts: number[] = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const purchaseDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                    if (purchaseDate > timeLimit) {
                        usedAmounts.push(data.amount);
                    }
                });

                // अगर 199 बिजी है, तो 199.01 चेक करो, फिर 199.02...
                let uniqueAmount = amount;
                while (usedAmounts.includes(parseFloat(uniqueAmount.toFixed(2)))) {
                    uniqueAmount += 0.01;
                }
                
                setFinalPayableAmount(parseFloat(uniqueAmount.toFixed(2)));
            } catch (error) {
                console.error("Error generating unique amount:", error);
                setFinalPayableAmount(amount); // एरर आने पर बेस अमाउंट ही दिखा दें
            }
        };

        fetchUniqueAmount();
    }, [itemId, amount]); 
    
    // QR Code URL from Firebase
    const qrCodeUrl = import.meta.env.VITE_QR_CODE_URL; 

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const user = auth.currentUser;

        if (!user) return alert("Please login first!");

        setLoading(true);
        try {
            // ✅ सिर्फ अमाउंट और टाइम सेव होगा, कोई UTR/Photo नहीं
            await addDoc(collection(db, "purchases"), {
                userId: user.uid,
                userEmail: user.email,
                courseId: itemId,
                amount: finalPayableAmount,
                status: "pending",
                timestamp: serverTimestamp()
            });

            setSuccess(true);
        } catch (error) {
            console.error("Payment Error:", error);
            alert("Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-hindi">
                <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 text-center shadow-2xl border border-green-100">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="text-green-600 w-12 h-12" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight">Payment Processing!</h2>
                    
                    <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-2xl mb-6 text-sm font-bold text-left">
                        <p className="mb-2">✔️ आपकी रिक्वेस्ट सबमिट हो गई है।</p>
                        <p className="font-medium text-xs">पेमेंट कन्फर्म होते ही एक्सेस ऑटोमैटिक अनलॉक हो जाएगा (Max 45-60 mins)।</p>
                    </div>

                    {/* 🔥 WhatsApp Support / Fallback Message */}
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 p-4 rounded-2xl mb-8 text-xs text-left shadow-sm">
                        <p className="font-black mb-1 flex items-center gap-1.5"><MessageCircle size={16}/> WhatsApp Support:</p>
                        <p className="font-medium mb-4 leading-relaxed">अगर किसी वजह से 1-2 घंटे में कोर्स अनलॉक नहीं होता है, तो अपना पेमेंट स्क्रीनशॉट और 12 अंकों का UTR नंबर हमारे WhatsApp पर भेज दें।</p>
                        <a 
                            href="https://wa.me/916263396446" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="flex items-center justify-center w-full bg-green-500 text-white py-3.5 rounded-xl font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-200"
                        >
                            WhatsApp पर मैसेज करें
                        </a>
                    </div>

                    <button onClick={() => navigate('/')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
                        होम पेज पर जाएँ
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[90vh] bg-slate-50 p-4 pb-20 font-hindi">
            <div className="max-w-xl mx-auto">
                <button onClick={() => navigate(-1)} className="mb-6 flex items-center text-slate-500 font-bold hover:text-slate-900 transition-all text-sm uppercase tracking-tighter">
                    <ArrowLeft className="mr-2" size={18} /> वापस जाएँ
                </button>

                <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                    <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                        <div>
                            <h1 className="text-xl font-black uppercase tracking-tight">Complete Payment</h1>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Secure UPI Verification</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md">
                            <IndianRupee size={24} />
                        </div>
                    </div>

                    <div className="p-6">
                        <div className="bg-blue-600 rounded-2xl p-5 mb-8 text-white shadow-lg shadow-blue-200">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mb-1">Paying For</p>
                                    <p className="font-black text-lg leading-tight">{itemName}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mb-1">Final Amount</p>
                                    <p className="font-black text-3xl">₹{finalPayableAmount.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>

                        {/* 🔥 Exact Amount Warning */}
                        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-2xl mb-8 text-sm font-bold text-center border border-yellow-200 shadow-sm animate-pulse">
                            ⚠️ <span className="text-red-600 font-black">ध्यान दें:</span> पेमेंट करते समय बिल्कुल यही अमाउंट <span className="text-red-600 text-lg font-black">(₹{finalPayableAmount.toFixed(2)})</span> डालें। अलग अमाउंट डालने पर कोर्स ऑटोमैटिक अनलॉक नहीं होगा।
                        </div>

                        <div className="mb-10 text-center">
                            <div className="flex items-center justify-center mb-6">
                                <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-black mr-3 text-xs shadow-md">1</span>
                                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Scan QR to Pay</h3>
                            </div>
                            
                            <div className="inline-block p-6 border-2 border-dashed border-slate-200 rounded-[3rem] bg-slate-50 group hover:border-blue-400 transition-all">
                                <div className="bg-white p-6 rounded-[2.5rem] shadow-md group-hover:scale-105 transition-transform">
                                    <img 
                                        src={qrCodeUrl} 
                                        alt="UPI QR Code" 
                                        className="w-64 h-64 md:w-80 md:h-80 object-contain mx-auto"
                                        onError={(e) => { e.currentTarget.src = "https://placehold.co/400x400?text=QR+Code+Not+Found"; }}
                                    />
                                </div>
                                <div className="mt-6">
                                    <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Official UPI ID</p>
                                    <p className="text-slate-900 font-black text-xl select-all cursor-pointer bg-white px-4 py-2 rounded-xl border border-slate-100">{upiId}</p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="flex items-center mb-2">
                                <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-black mr-3 text-xs shadow-md">2</span>
                                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Confirm Payment</h3>
                            </div>

                            <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 md:p-8 text-center">
                                <p className="text-sm md:text-base text-slate-600 font-bold mb-6">क्या आपने <span className="text-slate-900 text-lg font-black bg-yellow-100 px-2 py-0.5 rounded">₹{finalPayableAmount.toFixed(2)}</span> का पेमेंट कर दिया है?</p>
                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl font-black uppercase tracking-[0.1em] text-sm md:text-base hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-xl shadow-blue-100 flex items-center justify-center"
                                >
                                    {loading ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle size={20} className="mr-2" />}
                                    {loading ? "Processing..." : "हाँ, मैंने पेमेंट कर दिया है"}
                                </button>
                                <p className="text-[10px] text-slate-400 mt-4 font-bold tracking-widest uppercase">Click only after successful payment</p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManualPayment;