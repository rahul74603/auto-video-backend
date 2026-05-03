// @ts-nocheck
import React, { useEffect } from 'react';
import { Truck, Zap, CloudDownload, ShieldCheck, Clock, Smartphone, Mail, Globe } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const ShippingPolicy = () => {
  useEffect(() => {
    // टैब टाइटल और पेज पोजीशन फिक्स
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 md:pt-24 pb-16 px-3 md:px-4 font-hindi antialiased">
      
      {/* 🔥 नया डायनामिक SEO टैग जो शिपिंग पॉलिसी की डिटेल Google/WhatsApp को देगा */}
      <SEO 
        customTitle="Shipping & Delivery Policy - StudyGyaan Digital Delivery 2026"
        customDescription="Official Shipping and Delivery policy for StudyGyaan digital products. Learn about instant delivery of Premium Notes and Mock Tests."
        customUrl="https://studygyaan.in/shipping-policy"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <Helmet>
        <meta name="keywords" content="StudyGyaan Delivery, Digital Product Shipping, Instant PDF Access, Govt Job Notes Fulfillment" />
      </Helmet>

      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl md:rounded-[3rem] overflow-hidden border border-gray-200 text-left">
        
        {/* 🔥 Header Section */}
        <div className="bg-gradient-to-br from-indigo-700 via-blue-800 to-slate-900 p-10 md:p-16 text-center text-white relative">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl"></div>
          <Zap className="w-16 h-16 mx-auto mb-6 text-yellow-400 animate-pulse" />
          <h1 className="text-3xl md:text-6xl font-black uppercase tracking-tighter">Shipping & Delivery</h1>
          <p className="text-sm md:text-lg opacity-80 font-black mt-4 uppercase tracking-[0.3em] border-t border-white/20 pt-4">
              Fastest Digital Fulfillment System 2026
          </p>
        </div>

        <div className="p-6 md:p-16 space-y-12 text-slate-700 leading-relaxed font-bold">
          
          {/* Section 1: Digital Nature */}
          <section className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-blue-900 flex items-center gap-3">
              <Globe size={28} /> 1. डिजिटल उत्पादों की प्रकृति (Digital Nature)
            </h2>
            <p className="text-lg opacity-90">
              StudyGyaan (studygyaan.in) मुख्य रूप से **Educational Digital Goods** प्रदान करता है। इसमें हमारे विशेषज्ञों द्वारा तैयार किए गए **Premium PDF Notes**, **Online Mock Tests**, और **Govt Job Exam Material** शामिल हैं। कृपया ध्यान दें कि हम किसी भी प्रकार के 'भौतिक उत्पाद' (Physical Goods) जैसे प्रिंटेड किताबें या हार्ड कॉपी आपके घर के पते पर नहीं भेजते हैं। 
            </p>
          </section>

          {/* Section 2: Instant Delivery Logic */}
          <section className="bg-blue-50 p-8 md:p-12 rounded-[2.5rem] border border-blue-100 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-blue-900 flex items-center gap-3">
              <Zap size={28} className="text-yellow-500" /> 2. तत्काल डिलीवरी (Instant Fulfillment)
            </h2>
            <div className="space-y-4">
              <p className="text-lg">हमारी डिलीवरी प्रक्रिया पूरी तरह से स्वचालित (Automated) है:</p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <li className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 flex gap-3">
                   <CheckCircle className="text-emerald-500 shrink-0" size={20} />
                   <span>सफल भुगतान के तुरंत बाद कंटेंट आपके **Student Dashboard** में एक्टिव हो जाता है।</span>
                </li>
                <li className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 flex gap-3">
                   <CheckCircle className="text-emerald-500 shrink-0" size={20} />
                   <span>पेमेंट कन्फर्मेशन ईमेल आपके पंजीकृत ईमेल आईडी पर तुरंत भेज दिया जाता है।</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Section 3: Timeline & Delays */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <Clock size={28} className="text-blue-600" /> 3. डिलीवरी समयसीमा (Timeline)
            </h2>
            <p className="text-lg">सामान्यतः डिलीवरी **10 सेकंड से 5 मिनट** के भीतर हो जाती है। हालांकि, दुर्लभ मामलों में निम्नलिखित कारणों से देरी हो सकती है:</p>
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
               <ul className="list-disc ml-6 space-y-3 opacity-80">
                  <li>बैंक सर्वर या पेमेंट गेटवे की तरफ से तकनीकी समस्या।</li>
                  <li>इंटरनेट कनेक्टिविटी में रुकावट।</li>
                  <li>गलत ईमेल आईडी या मोबाइल नंबर प्रदान करना।</li>
               </ul>
            </div>
            <p className="italic text-sm text-slate-500">यदि भुगतान के 24 घंटे बाद भी आपको एक्सेस नहीं मिलता है, तो यह 'Technical Failure' माना जाएगा और हम उसे मैन्युअल रूप से एक्टिव करेंगे।</p>
          </section>

          {/* Section 4: Shipping Charges */}
          <section className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-emerald-900 flex items-center gap-3">
              <ShieldCheck size={28} /> 4. शिपिंग शुल्क (Shipping Charges)
            </h2>
            <p className="text-lg">चूँकि सभी सेवाएँ डिजिटल माध्यम से प्रदान की जाती हैं, इसलिए StudyGyaan किसी भी प्रकार का **Shipping Charge, Handling Fee, या Delivery Fee** नहीं लेता है। आप केवल कोर्स या नोट्स की निर्धारित कीमत का ही भुगतान करते हैं।</p>
          </section>

          {/* Section 5: Access Methods */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <CloudDownload size={28} className="text-indigo-600" /> 5. कंटेंट तक कैसे पहुँचें?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-black text-center">
               <div className="p-6 bg-white border-2 border-slate-100 rounded-3xl">
                  <p className="text-blue-600 text-2xl mb-1">01</p>
                  <p className="text-xs uppercase opacity-60">Login to Account</p>
               </div>
               <div className="p-6 bg-white border-2 border-slate-100 rounded-3xl">
                  <p className="text-blue-600 text-2xl mb-1">02</p>
                  <p className="text-xs uppercase opacity-60">Go to Dashboard</p>
               </div>
               <div className="p-6 bg-white border-2 border-slate-100 rounded-3xl">
                  <p className="text-blue-600 text-2xl mb-1">03</p>
                  <p className="text-xs uppercase opacity-60">Start Learning</p>
               </div>
            </div>
          </section>

          {/* Section 6: Support Details */}
          <section className="bg-slate-900 p-8 md:p-12 rounded-[3rem] text-white space-y-8">
            <div className="text-center">
               <h2 className="text-2xl md:text-4xl font-black uppercase mb-4">डिलीवरी सहायता केंद्र</h2>
               <p className="opacity-70 font-medium">यदि आपको अपनी डिजिटल फाइल्स प्राप्त करने में कोई भी समस्या आ रही है, तो हमारी सपोर्ट टीम आपकी मदद के लिए तत्पर है।</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="flex items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <Mail className="text-blue-400" size={32} />
                  <div>
                    <p className="text-[10px] uppercase font-black opacity-50">Email Support</p>
                    <p className="text-lg font-black">studygyaan.help@gmail.com</p>
                  </div>
               </div>
               <div className="flex items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <Smartphone className="text-emerald-400" size={32} />
                  <div>
                    <p className="text-[10px] uppercase font-black opacity-50">WhatsApp Support</p>
                    <p className="text-lg font-black">+91 6263396446</p>
                  </div>
               </div>
            </div>
          </section>

          <div className="pt-10 border-t border-slate-100 text-center">
             <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Official Fulfillment Center: Tekanpur, Gwalior, MP</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Internal Helper Icon
const CheckCircle = ({className, size}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);

export default ShippingPolicy;