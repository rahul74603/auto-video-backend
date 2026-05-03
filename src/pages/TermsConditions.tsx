// @ts-nocheck
import React, { useEffect } from 'react';
import { 
  Scale, ShieldAlert, Globe, UserCheck, Gavel, Lock, 
  FileText, CheckCircle, AlertTriangle, Briefcase, GraduationCap 
} from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const TermsAndConditions = () => {
  useEffect(() => {
    // पेज ऊपर से लोड हो इसके लिए scrollTo फिक्स रखा है
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 md:pt-24 pb-16 px-3 md:px-4 font-hindi antialiased text-left">
      
      {/* 🔥 नया डायनामिक SEO टैग जो नियमों और शर्तों की पूरी जानकारी Google को देगा */}
      <SEO 
        customTitle="Terms & Conditions - StudyGyaan Official Portal | Rules 2026"
        customDescription="Official Terms and Conditions for StudyGyaan. Read our governance rules for Free Study Material, Premium Exam Notes, Govt Jobs Alert, and Online Mock Tests 2026."
        customUrl="https://studygyaan.in/terms-conditions"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl md:rounded-[3rem] overflow-hidden border border-gray-200">
        
        {/* 🏛️ Heavy Header Section */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-black p-10 md:p-20 text-center text-white relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          <Scale className="w-16 h-16 md:w-24 md:h-24 mx-auto mb-6 text-blue-500 animate-pulse" />
          <h1 className="text-3xl md:text-7xl font-black uppercase tracking-tighter mb-4">Terms of Service</h1>
          <p className="text-sm md:text-xl opacity-70 font-black mt-4 border-t border-white/10 pt-6 uppercase tracking-[0.4em]">
              Legal Governance Framework 2026
          </p>
        </div>

        <div className="p-6 md:p-16 space-y-12 text-slate-700 leading-relaxed font-bold">
          
          {/* Section 1: Introduction */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-4xl font-black text-blue-900 flex items-center gap-3 border-b-4 border-blue-50 pb-2">
              <Globe size={32} /> 1. सेवा की शर्तें (Acceptance of Terms)
            </h2>
            <p className="text-sm md:text-xl opacity-90 leading-loose">
              **StudyGyaan** (URL: studygyaan.in) में आपका हार्दिक स्वागत है। यह वेबसाइट एक स्वतंत्र शैक्षिक मंच है जो छात्रों को **Latest Govt Jobs Alert**, **Free Study Materials**, **SSC Railway Exam Notes**, और **Mock Test Series** प्रदान करता है। इस वेबसाइट का उपयोग करके, आप स्वीकार करते हैं कि आपने इन नियमों और शर्तों को पढ़ लिया है, समझ लिया है और आप इनका पूर्ण रूप से पालन करने के लिए कानूनी रूप से बाध्य हैं। यदि आप किसी भी शर्त से असहमत हैं, तो कृपया पोर्टल का उपयोग तत्काल बंद कर दें।
            </p>
          </section>

          {/* Section 2: Intellectual Property Protection */}
          <section className="bg-slate-900 p-8 md:p-12 rounded-[2.5rem] text-white space-y-6 relative overflow-hidden">
            <div className="absolute bottom-0 right-0 opacity-10"><Lock size={150} /></div>
            <h2 className="text-2xl md:text-3xl font-black text-blue-400 flex items-center gap-3 uppercase italic">
              <ShieldAlert size={32} /> 2. बौद्धिक संपदा और कॉपीराइट (IPR)
            </h2>
            <p className="text-sm md:text-lg opacity-80 font-medium">
              StudyGyaan पर प्रकाशित सभी सामग्री, जिसमें बिना किसी सीमा के - **Premium PDF Notes**, **Handwritten Notes**, **Exam Question Banks**, **Graphics**, और **Website Design** शामिल हैं, StudyGyaan की विशेष संपत्ति है। 
            </p>
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
               <h4 className="text-yellow-400 font-black mb-2 uppercase flex items-center gap-2"><AlertTriangle size={18}/> सख्त प्रतिबंध:</h4>
               <ul className="list-disc ml-6 space-y-2 text-xs md:text-base text-slate-300">
                  <li>हमारे प्रीमियम नोट्स को किसी अन्य वेबसाइट, टेलीग्राम चैनल, या व्हाट्सएप ग्रुप पर साझा करना वर्जित है।</li>
                  <li>सामग्री का व्यावसायिक उपयोग या पुनर्विक्रय (Resale) कानूनी अपराध माना जाएगा।</li>
                  <li>पकड़े जाने पर बिना किसी सूचना के आपका अकाउंट ब्लॉक कर दिया जाएगा और कानूनी कार्रवाई की जाएगी।</li>
               </ul>
            </div>
          </section>

          {/* Section 3: User Registration & Conduct */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tight">
              <UserCheck size={32} className="text-blue-600" /> 3. उपयोगकर्ता पंजीकरण (Account Terms)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
                  <h5 className="font-black text-blue-800 mb-2 uppercase">सटीकता (Accuracy)</h5>
                  <p className="text-sm opacity-80">खाता बनाते समय आपको सही नाम, मोबाइल नंबर और ईमेल देना अनिवार्य है। गलत जानकारी देने पर सेवाएँ बाधित की जा सकती हैं।</p>
               </div>
               <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                  <h5 className="font-black text-emerald-800 mb-2 uppercase">सुरक्षा (Security)</h5>
                  <p className="text-sm opacity-80">आप अपने पासवर्ड और लॉगिन विवरण की गोपनीयता के लिए स्वयं जिम्मेदार हैं। संदिग्ध गतिविधि दिखने पर हमें सूचित करें।</p>
               </div>
            </div>
          </section>

          {/* Section 4: Content & Links */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <Briefcase size={32} className="text-orange-500" /> 4. जॉब अलर्ट और बाहरी लिंक
            </h2>
            <p className="text-sm md:text-lg opacity-90">
              हम विभिन्न आधिकारिक स्रोतों जैसे **Employment News (रोजगार समाचार)** और सरकारी वेबसाइटों से जानकारी एकत्र कर **Govt Jobs Alert** प्रकाशित करते हैं। हम केवल सूचना के वाहक हैं। हम अनुशंसा करते हैं कि छात्र आवेदन करने से पहले आधिकारिक विज्ञापन (Official Notification) को अवश्य पढ़ें। किसी भी विसंगति के लिए StudyGyaan उत्तरदायी नहीं होगा।
            </p>
          </section>

          {/* Section 5: Payment & Cancellation */}
          <section className="bg-slate-50 p-8 md:p-12 rounded-[3rem] border border-slate-200 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3 uppercase">
              <Gavel size={32} className="text-indigo-600" /> 5. भुगतान एवं रिफंड (E-Commerce)
            </h2>
            <p className="text-sm md:text-lg">
              वेबसाइट पर उपलब्ध **Premium Notes** के लिए किया गया भुगतान अंतिम माना जाएगा। चूँकि हमारी सेवाएँ डिजिटल हैं, इसलिए खरीदारी के बाद कोई भी 'Order Cancellation' स्वीकार नहीं किया जाएगा। रिफंड केवल हमारी **Refund & Cancellation Policy** के विशिष्ट नियमों के तहत ही संभव होगा।
            </p>
            <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs uppercase font-black tracking-widest text-slate-500">
               <CheckCircle size={16} className="text-emerald-500" /> Secure Payment via Authorized Gateways
            </div>
          </section>

          {/* Section 6: Jurisdiction */}
          <section className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <GraduationCap size={32} className="text-blue-600" /> 6. कानून और अधिकार क्षेत्र
            </h2>
            <p className="text-sm md:text-lg opacity-90">
              इन नियमों और शर्तों का अर्थ और प्रवर्तन भारतीय कानूनों के अनुसार किया जाएगा। StudyGyaan और उपयोगकर्ता के बीच किसी भी प्रकार के विवाद की स्थिति में, न्याय क्षेत्र (Jurisdiction) केवल **ग्वालियर (मध्य प्रदेश)** की अदालतों तक ही सीमित रहेगा।
            </p>
          </section>

          {/* Support Section */}
          <section className="bg-slate-900 p-8 md:p-12 rounded-[3rem] text-white text-center space-y-6">
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight">प्रश्नों के लिए संपर्क करें</h2>
            <p className="text-sm md:text-lg opacity-70 font-bold max-w-2xl mx-auto leading-relaxed">
              यदि आपके पास इन नियमों और शर्तों के बारे में कोई प्रश्न है, तो कृपया हमारी सहायता टीम से संपर्क करने में संकोच न करें।
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto pt-6">
               <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <p className="text-[10px] uppercase font-black opacity-50 mb-1">Email Queries</p>
                  <p className="text-sm md:text-lg font-black">studygyaan.help@gmail.com</p>
               </div>
               <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <p className="text-[10px] uppercase font-black opacity-50 mb-1">Office Location</p>
                  <p className="text-sm md:text-lg font-black">Tekanpur, Gwalior (M.P.)</p>
               </div>
            </div>
          </section>

          <div className="pt-10 border-t border-slate-100 text-center">
             <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] md:text-xs">
               Official Governance Document © {new Date().getFullYear()} StudyGyaan Hub
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;