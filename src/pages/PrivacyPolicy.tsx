// @ts-nocheck
import React, { useEffect } from 'react';
import { 
  ShieldCheck, Lock, Eye, Database, UserPlus, Globe, 
  Info, ShieldAlert, FileText, Smartphone, Mail, CheckCircle 
} from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const PrivacyPolicy = () => {
  useEffect(() => {
    // पेज लोड होने पर टॉप पर जाने के लिए
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 md:pt-24 pb-16 px-3 md:px-4 font-hindi antialiased text-left">
      
      {/* 🔥 नया डायनामिक SEO टैग जो प्राइवेसी पॉलिसी की पूरी जानकारी Google को देगा */}
      <SEO 
        customTitle="Privacy Policy - StudyGyaan Official | Your Data Security 2026"
        customDescription="Read the StudyGyaan Privacy Policy. Learn how we protect your personal data while providing Govt Jobs Alert, Free Study Materials, and Premium PDF Notes."
        customUrl="https://studygyaan.in/privacy-policy"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl md:rounded-[3.5rem] overflow-hidden border border-gray-200">
        
        {/* 🛡️ Heavy Header Section */}
        <div className="bg-gradient-to-br from-emerald-700 via-teal-800 to-slate-900 p-10 md:p-20 text-center text-white relative">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full blur-3xl -mr-36 -mt-36"></div>
          <ShieldCheck className="w-16 h-16 md:w-24 md:h-24 mx-auto mb-6 text-emerald-400 animate-pulse" />
          <h1 className="text-3xl md:text-7xl font-black uppercase tracking-tighter mb-4">Privacy Policy</h1>
          <p className="text-sm md:text-xl opacity-80 font-black mt-4 border-t border-white/10 pt-6 uppercase tracking-[0.4em]">
              Data Protection Standards 2026
          </p>
        </div>

        <div className="p-6 md:p-16 space-y-12 text-slate-700 leading-relaxed font-bold">
          
          {/* Section 1: Introduction */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-4xl font-black text-emerald-900 flex items-center gap-3 border-b-4 border-emerald-50 pb-2">
              <Globe size={32} /> 1. गोपनीयता की प्रतिबद्धता
            </h2>
            <p className="text-sm md:text-xl opacity-90 leading-loose">
              **StudyGyaan** (studygyaan.in) में हम आपकी गोपनीयता को अत्यंत गंभीरता से लेते हैं। हमारा मिशन आपको **Latest Govt Jobs Alert** और **Quality Free Study Material** प्रदान करने के साथ-साथ आपकी व्यक्तिगत जानकारी को सुरक्षित रखना भी है। हम भारत के **DPDP Act 2023/2026** के सभी मानकों का पालन करते हैं।
            </p>
          </section>

          {/* Section 2: Data Collection */}
          <section className="bg-slate-50 p-8 md:p-12 rounded-[2.5rem] border border-slate-200 space-y-8">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3 uppercase">
              <UserPlus size={32} className="text-emerald-600" /> 2. सूचना जो हम एकत्र करते हैं
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100">
                  <h4 className="text-emerald-800 font-black mb-3 uppercase flex items-center gap-2">
                    <CheckCircle size={18}/> व्यक्तिगत जानकारी
                  </h4>
                  <p className="text-sm opacity-80">जब आप हमारे **Premium Exam Notes** खरीदने के लिए रजिस्टर करते हैं, तो हम आपका नाम, ईमेल पता, मोबाइल नंबर और ट्रांजेक्शन विवरण एकत्र करते हैं।</p>
               </div>
               <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100">
                  <h4 className="text-emerald-800 font-black mb-3 uppercase flex items-center gap-2">
                    <CheckCircle size={18}/> उपयोग डेटा (Usage Data)
                  </h4>
                  <p className="text-sm opacity-80">हम यह ट्रैक करते हैं कि आप किन **Govt Job Updates** को देख रहे हैं और कौन सा **Study Material** डाउनलोड कर रहे हैं, ताकि हम आपको बेहतर सुझाव दे सकें।</p>
               </div>
            </div>
          </section>

          {/* Section 3: Data Usage */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <Database size={32} className="text-blue-600" /> 3. जानकारी का उपयोग कैसे किया जाता है?
            </h2>
            <p className="text-lg opacity-90">एकत्र की गई जानकारी का उपयोग निम्नलिखित उद्देश्यों के लिए किया जाता है:</p>
            <ul className="grid grid-cols-1 gap-4 font-bold">
               <li className="flex gap-4 p-4 bg-white border border-slate-100 rounded-2xl items-center">
                  <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Smartphone size={20}/></div>
                  <span>आपको आपकी योग्यता के अनुसार **Customized Govt Job Alerts** भेजने के लिए।</span>
               </li>
               <li className="flex gap-4 p-4 bg-white border border-slate-100 rounded-2xl items-center">
                  <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg"><FileText size={20}/></div>
                  <span>आपके खरीदे गए **Premium PDF Notes** और **Mock Tests** तक पहुँच सुनिश्चित करने के लिए।</span>
               </li>
               <li className="flex gap-4 p-4 bg-white border border-slate-100 rounded-2xl items-center">
                  <div className="bg-purple-100 text-purple-600 p-2 rounded-lg"><Lock size={20}/></div>
                  <span>पेमेंट गेटवे के माध्यम से सुरक्षित भुगतान प्रक्रिया (Payment Processing) को पूरा करने के लिए।</span>
               </li>
            </ul>
          </section>

          {/* Section 4: Security */}
          <section className="bg-slate-900 p-8 md:p-14 rounded-[3rem] text-white space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-10"><Lock size={200} /></div>
            <h2 className="text-2xl md:text-3xl font-black text-emerald-400 flex items-center gap-3 uppercase italic">
              <ShieldAlert size={32} /> 4. डेटा सुरक्षा और एन्क्रिप्शन
            </h2>
            <p className="text-sm md:text-lg opacity-80 leading-relaxed relative z-10">
              StudyGyaan में हम आपकी सुरक्षा को प्राथमिकता देते हैं। हम आपके डेटा को स्टोर करने के लिए **Google Firebase** और क्लाउड इन्फ्रास्ट्रक्चर का उपयोग करते हैं। हमारी पूरी वेबसाइट **SSL Encryption** से सुरक्षित है। हम आपका व्यक्तिगत डेटा कभी भी किसी तीसरे पक्ष को नहीं बेचते हैं।
            </p>
          </section>

          {/* Section 5: User Rights (NEW for 2026) */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <CheckCircle size={32} className="text-orange-500" /> 5. आपके अधिकार (Your Rights)
            </h2>
            <p className="text-sm md:text-lg opacity-90">
              नए नियमों के अनुसार आपके पास ये अधिकार हैं: <br/>
              1. **पहुँच का अधिकार:** आप जान सकते हैं कि हम आपका कौन सा डेटा रख रहे हैं। <br/>
              2. **सुधार का अधिकार:** आप अपनी जानकारी को कभी भी अपडेट करवा सकते हैं। <br/>
              3. **मिटाने का अधिकार (Right to Erasure):** आप अपना अकाउंट और डेटा हटाने का अनुरोध कर सकते हैं।
            </p>
          </section>

          {/* 📬 Contact Support */}
          <section className="bg-slate-50 p-8 md:p-14 rounded-[3.5rem] border border-slate-200 text-center space-y-8">
            <div className="bg-emerald-100 text-emerald-700 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto shadow-inner">
               <Mail size={40} />
            </div>
            <div className="space-y-4">
               <h2 className="text-2xl md:text-4xl font-black uppercase text-slate-900 tracking-tight">गोपनीयता सहायता केंद्र</h2>
               <p className="text-sm md:text-lg font-bold text-slate-500 max-w-2xl mx-auto italic">
                  "यदि आपके मन में अपनी प्राइवेसी या डेटा के उपयोग को लेकर कोई भी प्रश्न है, तो हमारी डेटा सुरक्षा टीम आपकी सहायता के लिए सदैव उपलब्ध है।"
               </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto pt-4">
               <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:border-emerald-500 transition-all group">
                  <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Official Privacy Support</p>
                  <p className="text-sm md:text-xl font-black text-slate-800 group-hover:text-emerald-600 transition-colors">studygyaan.help@gmail.com</p>
               </div>
               <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:border-emerald-500 transition-all group">
                  <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Admin Location</p>
                  <p className="text-sm md:text-xl font-black text-slate-800">Tekanpur, Gwalior (M.P.) - 475005</p>
               </div>
            </div>
          </section>

          <div className="pt-10 border-t border-slate-100 text-center">
             <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] md:text-xs">
               Privacy Governance Document © {new Date().getFullYear()} StudyGyaan Hub | All Rights Reserved
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;