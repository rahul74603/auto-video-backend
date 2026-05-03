// @ts-nocheck
import React, { useEffect } from 'react';
import { RefreshCcw, AlertOctagon, HelpCircle, Calendar, Banknote, ShieldCheck, Mail, History } from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const RefundPolicy = () => {
  useEffect(() => {
    // पेज लोड होने पर टॉप पर जाने के लिए
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 md:pt-24 pb-16 px-3 md:px-4 font-hindi antialiased">
      
      {/* 🔥 नया डायनामिक SEO टैग जो रिफंड पॉलिसी की पूरी जानकारी Google को देगा */}
      <SEO 
        customTitle="Refund & Cancellation Policy - StudyGyaan Official | 2026 Guide"
        customDescription="Read the comprehensive Refund and Cancellation policy of StudyGyaan. Information regarding Premium PDF Notes, Mock Tests, and digital course refunds."
        customUrl="https://studygyaan.in/refund-policy"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl md:rounded-[3rem] overflow-hidden border border-gray-200 text-left">
        
        {/* 🔥 Header Section */}
        <div className="bg-gradient-to-br from-rose-600 via-red-700 to-red-900 p-10 md:p-16 text-center text-white relative">
          <div className="absolute top-0 left-0 w-40 h-40 bg-white/5 rounded-full -ml-20 -mt-20 blur-3xl"></div>
          <RefreshCcw className="w-16 h-16 mx-auto mb-6 text-white animate-spin-slow" />
          <h1 className="text-3xl md:text-6xl font-black uppercase tracking-tighter">Refund & Cancellation</h1>
          <p className="text-sm md:text-lg opacity-80 font-black mt-4 uppercase tracking-[0.2em] border-t border-white/20 pt-4">
              StudyGyaan Digital Commerce Policy 2026
          </p>
        </div>

        <div className="p-6 md:p-16 space-y-12 text-slate-700 leading-relaxed font-bold">
          
          {/* Section 1: Digital Nature */}
          <section className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-red-900 flex items-center gap-3">
              <AlertOctagon size={28} /> 1. डिजिटल उत्पादों की प्रकृति (Nature of Products)
            </h2>
            <p className="text-lg opacity-90">
              StudyGyaan (studygyaan.in) मुख्य रूप से डिजिटल सामग्री प्रदान करता है, जिसमें **Premium Subject-wise PDF Notes**, **Latest Pattern Mock Tests**, और **Exam Strategy E-books** शामिल हैं। चूँकि ये उत्पाद "अमूर्त" (Intangible) हैं और खरीद के तुरंत बाद डाउनलोड या एक्सेस किए जा सकते हैं, इसलिए इनका उपयोग शुरू होने के बाद इन्हें "वापस" (Return) करना तकनीकी रूप से संभव नहीं है।
            </p>
          </section>

          {/* Section 2: Cancellation Policy */}
          <section className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <Calendar size={28} className="text-blue-600" /> 2. रद्दीकरण नीति (Cancellation Policy)
            </h2>
            <div className="space-y-4 opacity-90">
              <p>एक बार जब कोई छात्र किसी **Premium Course** या **Notes Bundle** के लिए भुगतान सफलतापूर्वक पूरा कर लेता है, तो उस आर्डर को रद्द (Cancel) नहीं किया जा सकता है।</p>
              <p>हम छात्रों को सलाह देते हैं कि वे भुगतान करने से पहले वेबसाइट पर उपलब्ध "Free Study Material" और "Demo Content" को ध्यान से देख लें ताकि वे हमारी सामग्री की गुणवत्ता से संतुष्ट हो सकें।</p>
            </div>
          </section>

          {/* Section 3: Refund Eligibility */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-blue-900 flex items-center gap-3">
              <Banknote size={28} /> 3. रिफंड के लिए पात्रता (Refund Eligibility)
            </h2>
            <p className="text-lg">हम केवल निम्नलिखित विशेष परिस्थितियों में ही रिफंड अनुरोध पर विचार करते हैं:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
                <h4 className="font-black text-blue-800 mb-2 uppercase">दोहरा भुगतान (Double Payment)</h4>
                <p className="text-sm opacity-80 font-bold">यदि तकनीकी खराबी के कारण एक ही कोर्स के लिए आपके बैंक खाते से दो बार पैसे कट गए हैं, तो हम अतिरिक्त भुगतान को 100% रिफंड करेंगे।</p>
              </div>
              <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
                <h4 className="font-black text-blue-800 mb-2 uppercase">एक्सेस विफलता (Access Failure)</h4>
                <p className="text-sm opacity-80 font-bold">यदि भुगतान के बाद 24-48 घंटों तक भी आपको **Premium Dashboard** का एक्सेस नहीं मिलता है और हमारी टेक्निकल टीम इसे हल नहीं कर पाती है।</p>
              </div>
            </div>
          </section>

          {/* Section 4: Non-Refundable Cases */}
          <section className="bg-red-50 p-8 md:p-12 rounded-[2.5rem] border border-red-100 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-red-700 flex items-center gap-3">
              <ShieldCheck size={28} /> 4. इन स्थितियों में रिफंड नहीं मिलेगा
            </h2>
            <ul className="list-disc ml-8 space-y-4 font-bold text-red-900/80">
              <li>"गलती से खरीद लिया" या "अब मुझे इसकी ज़रूरत नहीं है" जैसे व्यक्तिगत कारणों पर।</li>
              <li>यदि छात्र ने सामग्री का 10% से अधिक हिस्सा डाउनलोड या देख लिया है।</li>
              <li>वेबसाइट के नियमों और शर्तों (Terms & Conditions) का उल्लंघन करने पर खाता ब्लॉक होने की स्थिति में।</li>
              <li>परीक्षा की तारीख बदल जाने या परीक्षा रद्द हो जाने की स्थिति में।</li>
            </ul>
          </section>

          {/* Section 5: Process & Timeline */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <History size={28} className="text-indigo-600" /> 5. रिफंड प्रक्रिया और समयसीमा (Timeline)
            </h2>
            <div className="space-y-4 text-lg">
              <p>रिफंड अनुरोध जमा करने के लिए, आपको **studygyaan.help@gmail.com** पर अपने पेमेंट स्क्रीनशॉट और ट्रांजेक्शन आईडी के साथ ईमेल करना होगा।</p>
              <div className="flex flex-col md:flex-row gap-4 py-4">
                <div className="flex-1 bg-indigo-50 p-6 rounded-2xl text-center border border-indigo-100">
                   <p className="text-2xl font-black text-indigo-700">3-5 Days</p>
                   <p className="text-xs uppercase font-black opacity-60">Internal Audit</p>
                </div>
                <div className="flex-1 bg-emerald-50 p-6 rounded-2xl text-center border border-emerald-100">
                   <p className="text-2xl font-black text-emerald-700">7-10 Days</p>
                   <p className="text-xs uppercase font-black opacity-60">Bank Processing</p>
                </div>
              </div>
              <p className="text-sm italic opacity-70">नोट: रिफंड हमेशा उसी मूल भुगतान स्रोत (Source Account) में वापस किया जाएगा जिससे पैसे कटे थे।</p>
            </div>
          </section>

          {/* Section 6: Contact Support */}
          <section className="bg-slate-900 p-8 md:p-12 rounded-[3rem] text-white text-center space-y-6">
            <HelpCircle size={48} className="mx-auto text-yellow-400 animate-bounce" />
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight">अभी भी कोई सवाल है?</h2>
            <p className="text-lg opacity-80 font-bold max-w-2xl mx-auto">
              हमारा उद्देश्य आपकी सहायता करना है। यदि आपके मन में रिफंड या कैंसलेशन को लेकर कोई भी शंका है, तो बेझिझक हमारी टीम से संपर्क करें।
            </p>
            <div className="flex flex-col md:flex-row justify-center gap-4 pt-4">
               <div className="bg-white/10 px-8 py-4 rounded-2xl border border-white/20">
                  <p className="text-[10px] uppercase font-black opacity-60">Official Email</p>
                  <p className="text-sm md:text-lg font-black">studygyaan.help@gmail.com</p>
               </div>
               <div className="bg-white/10 px-8 py-4 rounded-2xl border border-white/20">
                  <p className="text-[10px] uppercase font-black opacity-60">WhatsApp Support</p>
                  <p className="text-lg font-black">+91 6263396446</p>
               </div>
            </div>
          </section>

          <div className="pt-10 border-t border-slate-100 text-center">
             <p className="text-slate-400 font-black uppercase tracking-widest text-xs">© {new Date().getFullYear()} StudyGyaan Hub | Tekanpur, Gwalior, MP</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefundPolicy;