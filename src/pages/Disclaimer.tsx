// @ts-nocheck
import React, { useEffect } from 'react';
import { AlertTriangle, ShieldAlert, Info, ExternalLink, Gavel, FileWarning, Mail, Smartphone, Globe } from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const Disclaimer = () => {
  useEffect(() => {
    // पेज लोड होने पर टॉप पर जाने के लिए
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 md:pt-24 pb-16 px-3 md:px-4 font-hindi antialiased text-left">
      
      {/* 🔥 नया डायनामिक SEO टैग जो डिस्क्लेमर की पूरी जानकारी Google/WhatsApp को देगा */}
      <SEO 
        customTitle="Disclaimer - StudyGyaan Official Legal Notice 2026"
        customDescription="Official Disclaimer for StudyGyaan. We provide Govt Jobs Alert and Study Materials for educational purposes only. Read our legal notice for more details."
        customUrl="https://studygyaan.in/disclaimer"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl md:rounded-[3rem] overflow-hidden border border-gray-200">
        
        {/* 🔥 Header Section */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-black p-10 md:p-16 text-center text-white relative">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full -mr-24 -mt-24 blur-3xl"></div>
          <FileWarning className="w-16 h-16 mx-auto mb-6 text-yellow-400 animate-pulse" />
          <h1 className="text-3xl md:text-6xl font-black uppercase tracking-tighter">Legal Disclaimer</h1>
          <p className="text-sm md:text-lg opacity-80 font-black mt-4 uppercase tracking-[0.3em] border-t border-white/20 pt-4">
              Official Notice & Transparency 2026
          </p>
        </div>

        <div className="p-6 md:p-16 space-y-12 text-slate-700 leading-relaxed font-bold">
          
          {/* Section 1: No Govt Affiliation (MOST IMPORTANT) */}
          <section className="bg-red-50 p-8 md:p-12 rounded-[2.5rem] border-2 border-red-100 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-red-700 flex items-center gap-3">
              <ShieldAlert size={32} /> 1. कोई सरकारी संबद्धता नहीं (No Govt Affiliation)
            </h2>
            <div className="space-y-4 text-red-900/90">
              <p className="text-lg md:text-xl">
                StudyGyaan (studygyaan.in) एक निजी शैक्षिक पोर्टल है। हमारा किसी भी **केंद्र सरकार, राज्य सरकार, या किसी अन्य सरकारी संस्था/विभाग** के साथ कोई प्रत्यक्ष या अप्रत्यक्ष संबंध नहीं है। 
              </p>
              <p>हम केवल सार्वजनिक डोमेन में उपलब्ध सूचनाओं को एकत्रित करके छात्रों की सहायता के लिए सरल भाषा में प्रस्तुत करते हैं। हम स्वयं को एक सरकारी पोर्टल के रूप में प्रदर्शित नहीं करते हैं।</p>
            </div>
          </section>

          {/* Section 2: Information Accuracy */}
          <section className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-blue-900 flex items-center gap-3">
              <Info size={28} /> 2. सूचना की सटीकता (Accuracy of Information)
            </h2>
            <p className="text-lg opacity-90">
              यद्यपि हम **Latest Govt Jobs Alert** और **Study Materials** प्रदान करते समय पूर्ण सावधानी बरतते हैं, लेकिन हम वेबसाइट पर प्रकाशित किसी भी जानकारी की 100% सटीकता, पूर्णता या विश्वसनीयता की गारंटी नहीं देते हैं। 
            </p>
            <div className="p-6 bg-blue-50 border-l-8 border-blue-500 rounded-xl italic">
              "किसी भी सरकारी भर्ती या सूचना पर कार्रवाई करने से पहले, हम छात्रों को आधिकारिक वेबसाइट (Official Website) और समाचार पत्रों (Employment News) के माध्यम से जानकारी की पुष्टि करने की पुरज़ोर सलाह देते हैं।"
            </div>
          </section>

          {/* Section 3: Professional Advice */}
          <section className="bg-slate-50 p-8 md:p-12 rounded-[2.5rem] border border-slate-200 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <Gavel size={28} className="text-indigo-600" /> 3. व्यावसायिक सलाह (Not Professional Advice)
            </h2>
            <p className="text-lg opacity-90">
              हमारी वेबसाइट पर उपलब्ध सामग्री केवल शैक्षिक उद्देश्यों (Educational Purposes) के लिए है। हमारे द्वारा प्रदान किए गए **Premium Exam Notes** या **Strategy Guides** का उद्देश्य केवल मार्गदर्शन करना है। सफलता पूरी तरह से छात्र की मेहनत, अभ्यास और व्यक्तिगत कौशल पर निर्भर करती है। हम किसी भी प्रतियोगी परीक्षा में "गारंटीड सिलेक्शन" का दावा नहीं करते हैं।
            </p>
          </section>

          {/* Section 4: External Links Policy */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-black text-blue-900 flex items-center gap-3">
              <ExternalLink size={28} /> 4. बाहरी लिंक (External Links Disclaimer)
            </h2>
            <p className="text-lg">
              StudyGyaan में हम अन्य आधिकारिक वेबसाइटों (जैसे SSC, UPSC, Railway आदि) के लिंक प्रदान कर सकते हैं। इन बाहरी वेबसाइटों की सामग्री और उनकी प्राइवेसी नीतियों पर हमारा कोई नियंत्रण नहीं है। किसी भी बाहरी लिंक पर क्लिक करने के बाद होने वाली किसी भी गतिविधि के लिए StudyGyaan जिम्मेदार नहीं होगा।
            </p>
          </section>

          {/* Section 5: Limitation of Liability */}
          <section className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-200 space-y-4 text-amber-900">
            <h2 className="text-2xl md:text-3xl font-black flex items-center gap-3 uppercase">
              <AlertTriangle size={28} /> 5. दायित्व की सीमा (Limitation of Liability)
            </h2>
            <p className="font-bold opacity-90">
              इस वेबसाइट के उपयोग से होने वाले किसी भी प्रत्यक्ष या अप्रत्यक्ष नुकसान (Data Loss, Monetary Loss, or Emotional Stress) के लिए StudyGyaan या इसकी टीम उत्तरदायी नहीं होगी। वेबसाइट का उपयोग पूरी तरह से आपके स्वयं के जोखिम (At Your Own Risk) पर है।
            </p>
          </section>

          {/* Section 6: Contact for Legal Concerns */}
          <section className="bg-slate-900 p-8 md:p-12 rounded-[3rem] text-white space-y-8">
            <div className="text-center">
               <h2 className="text-2xl md:text-4xl font-black uppercase mb-4 tracking-tighter">कानूनी संपर्क सूत्र</h2>
               <p className="opacity-70 font-medium">यदि आपके मन में हमारे डिस्क्लेमर या किसी भी कानूनी पहलू को लेकर कोई प्रश्न है, तो आप बेझिझक संपर्क कर सकते हैं।</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="flex items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <Mail className="text-blue-400" size={32} />
                  <div>
                    <p className="text-[10px] uppercase font-black opacity-50">Legal Queries Email</p>
                    <p className="text-lg font-black">studygyaan.help@gmail.com</p>
                  </div>
               </div>
               <div className="flex items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <Smartphone className="text-emerald-400" size={32} />
                  <div>
                    <p className="text-[10px] uppercase font-black opacity-50">Support WhatsApp</p>
                    <p className="text-lg font-black">+91 6263396446</p>
                  </div>
               </div>
            </div>
          </section>

          <div className="pt-10 border-t border-slate-100 text-center">
             <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">StudyGyaan Hub - Powered by Excellence | Tekanpur, Gwalior (M.P.)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Disclaimer;