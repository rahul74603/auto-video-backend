// @ts-nocheck
import { useState, useEffect } from 'react';
// 👇 ONLY 3 sets of dots (सुरक्षित रखा गया है)
import { db } from '../../../firebase/config';
import { collection, getDocs, doc, query, updateDoc, orderBy, deleteDoc } from 'firebase/firestore';
import { ShoppingCart, User, CheckCircle, Trash2, Calendar, Package, Mail, IndianRupee, RefreshCw, Loader2 } from 'lucide-react';
import emailjs from '@emailjs/browser';

interface Order { id: string; customerName: string; customerEmail: string; items: any[]; totalAmount: number; status: string; date: any; }

const OrdersTab = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, "orders"), orderBy("date", "desc"));
      const snapshot = await getDocs(q);
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    } catch (error) { 
      console.error("Error fetching orders:", error); 
    } finally { 
      setLoading(false); 
    }
  };

  // 🔥 SAFE DATE FORMATTER (व्हाइट स्क्रीन एरर रोकने के लिए)
  const formatDate = (dateValue: any) => {
    if (!dateValue) return 'N/A';
    try {
      // अगर Firebase Timestamp है
      if (dateValue.toDate) return dateValue.toDate().toLocaleDateString();
      // अगर String या Number है
      return new Date(dateValue).toLocaleDateString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const markOrderComplete = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if(confirm(`Mark order for ${order.customerName} as Completed?`)) {
      try {
        await updateDoc(doc(db, "orders", orderId), { status: 'completed' });
        
        // Email Logic (Safe Access)
        const productNames = order.items?.map((i:any) => i.product?.name || "Premium Material").join(', ') || "Your Course";
        
        const emailParams = {
            to_name: order.customerName, 
            to_email: order.customerEmail, 
            total_amount: order.totalAmount,
            message: `Your Order for ${productNames} has been APPROVED! Access it on the website.`
        };

        if(import.meta.env.VITE_EMAILJS_PUBLIC_KEY){
            await emailjs.send(
              import.meta.env.VITE_EMAILJS_SERVICE_ID, 
              import.meta.env.VITE_EMAILJS_TEMPLATE_ID, 
              emailParams, 
              import.meta.env.VITE_EMAILJS_PUBLIC_KEY
            );
        }
        alert("✅ Order Approved!"); 
        fetchOrders();
      } catch (error) { 
        alert("Error updating order."); 
      }
    }
  };

  const handleDelete = async (id: string) => {
      if(confirm("Delete this order permanently?")) {
          await deleteDoc(doc(db, "orders", id));
          fetchOrders();
      }
  }

  return (
    <div className="bg-white rounded-xl md:rounded-[2rem] shadow-xl border border-gray-100 p-4 md:p-8 animate-in fade-in duration-500">
        {/* HEADER SECTION */}
        <div className="flex flex-row justify-between items-center gap-4 mb-6 md:mb-8">
            <div>
                <h3 className="font-black text-lg md:text-2xl flex items-center gap-1.5 md:gap-2 text-gray-800">
                    <ShoppingCart className="text-emerald-500 w-5 h-5 md:w-7 md:h-7"/> Order Management
                </h3>
                <p className="text-gray-400 text-[9px] md:text-sm font-bold uppercase tracking-widest mt-0.5 md:mt-1">
                    Total {orders.length} Sales Tracked
                </p>
            </div>
            <button onClick={fetchOrders} className="p-2 md:p-3 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-lg md:rounded-2xl transition-all border border-gray-100 shrink-0">
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
        </div>

        {loading && orders.length === 0 ? (
            <div className="py-12 md:py-20 text-center">
                <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-blue-600 mx-auto mb-4"/>
                <p className="text-gray-400 font-bold text-xs md:text-base">Fetching latest orders...</p>
            </div>
        ) : (
            <div className="space-y-4 md:space-y-6">
                {orders.length === 0 && (
                    <div className="text-center py-12 md:py-20 border-2 border-dashed rounded-xl md:rounded-[2rem] bg-gray-50 border-gray-200">
                        <Package className="w-10 h-10 md:w-16 md:h-16 text-gray-200 mx-auto mb-3 md:mb-4"/>
                        <p className="text-gray-400 font-bold text-xs md:text-base">No orders received yet.</p>
                    </div>
                )}

                {orders.map(o => (
                    <div key={o.id} className={`group border-2 p-3.5 md:p-6 rounded-xl md:rounded-[2rem] transition-all duration-300 ${o.status === 'completed' ? 'bg-white border-gray-50 opacity-80' : 'bg-white border-emerald-100 shadow-md shadow-emerald-500/5'}`}>
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 md:gap-6">
                            
                            {/* CUSTOMER INFO */}
                            <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
                                <div className={`p-2.5 md:p-4 rounded-xl md:rounded-3xl shrink-0 ${o.status === 'completed' ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-600'}`}>
                                    <User className="w-5 h-5 md:w-6 md:h-6" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-black text-sm md:text-xl text-gray-800 truncate">{o.customerName}</p>
                                    <div className="flex flex-wrap items-center gap-y-1 gap-x-3 md:gap-x-4 mt-0.5 md:mt-1 text-[10px] md:text-sm font-medium text-gray-500">
                                        <span className="flex items-center gap-1"><Mail size={12}/> <span className="truncate">{o.customerEmail}</span></span>
                                        <span className="flex items-center gap-1"><Calendar size={12}/> {formatDate(o.date)}</span>
                                    </div>
                                    
                                    {/* PURCHASED ITEMS TAGS */}
                                    <div className="flex flex-wrap gap-1.5 mt-2.5 md:mt-4">
                                        {o.items?.map((item:any, idx:number) => (
                                            <span key={idx} className="bg-blue-50 text-blue-600 text-[8px] md:text-[10px] font-black uppercase tracking-wider px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-blue-100 truncate max-w-[150px]">
                                                {item.product?.name || "Premium Course"}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* PRICE AND STATUS */}
                            <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between w-full lg:w-auto gap-2 md:gap-4 pt-3 md:pt-0 border-t lg:border-t-0 border-gray-50">
                                <div className="text-left lg:text-right">
                                    <p className="text-base md:text-2xl font-black text-gray-900 flex items-center gap-0.5">
                                        <IndianRupee className="w-3.5 h-3.5 md:w-5 md:h-5"/>{o.totalAmount}
                                    </p>
                                    <span className={`text-[8px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-tighter inline-block mt-0.5 ${o.status==='completed'?'bg-gray-100 text-gray-400':'bg-amber-100 text-amber-600 animate-pulse'}`}>
                                        {o.status}
                                    </span>
                                </div>

                                {/* ACTIONS */}
                                <div className="flex gap-1.5 md:gap-2">
                                    {o.status !== 'completed' && (
                                        <button 
                                            onClick={() => markOrderComplete(o.id)} 
                                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 md:px-6 py-1.5 md:py-3 rounded-lg md:rounded-2xl font-black text-[10px] md:text-sm flex items-center gap-1.5 shadow-md shadow-emerald-100 transition-all active:scale-95"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5 md:w-4.5 md:h-4.5"/> APPROVE
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleDelete(o.id)} 
                                        className="bg-rose-50 hover:bg-rose-100 text-rose-500 p-2 md:p-3 rounded-lg md:rounded-2xl transition-all"
                                    >
                                        <Trash2 className="w-4 h-4 md:w-5 md:h-5"/>
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
};

export default OrdersTab;