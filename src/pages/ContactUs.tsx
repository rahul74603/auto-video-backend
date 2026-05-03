// @ts-nocheck
import React, { useEffect } from 'react';
import { Mail, MessageCircle, MapPin, Smartphone, Clock, ShieldCheck, Send, HelpCircle, Users, CheckCircle } from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const ContactUs = () => {
  useEffect(() => {
    // पेज लोड होने पर टॉप पर जाने के लिए
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pt-16 md:pt-24 pb-16 px-3 md:px-4 font-hindi antialiased text-left">
      
      {/* 🔥 नया डायनामिक SEO टैग जो सपोर्ट पेज की पूरी जानकारी Google/WhatsApp को देगा */}
      <SEO 
        customTitle="Contact Us - StudyGyaan Official Support Hub | 2026 Help Desk"
        customDescription="Contact StudyGyaan official support for help with Premium Notes, Mock Tests, or Govt Jobs alerts. Reach us via WhatsApp, Email, or visit our Gwalior office."
        customUrl="https://studygyaan.in/contact-us"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-2xl md:rounded-[3rem] overflow-hidden border border-gray-200">
        
        {/* 🌌 Ultra-Premium Header Section */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-700 to-blue-900 p-10 md:p-20 text-center text-white relative">
          <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 rounded-full -ml-32 -mt-32 blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full -mr-32 -mb-32 blur-3xl"></div>
          
          <div className="relative z-10">
            <MessageCircle className="w-16 h-16 md:w-24 md:h-24 mx-auto mb-6 text-yellow-400 animate-bounce" />
            <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-4">Get In Touch</h1>
            <p className="text-sm md:text-xl opacity-90 font-black uppercase tracking-[0.2em] max-w-2xl mx-auto leading-relaxed">
               StudyGyaan Support Hub: Dedicated to your success since 2024.
            </p>
          </div>
        </div>

        <div className="p-6 md:p-16">
          
          {/* 🛠️ Top Stats / Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 text-center">
             <div className="p-8 bg-blue-50 rounded-[2.5rem] border border-blue-100 shadow-sm group hover:bg-blue-600 transition-all duration-500">
                <Users size={40} className="mx-auto mb-4 text-blue-600 group-hover:text-white transition-colors" />
                <h4 className="text-xl font-black text-slate-900 group-hover:text-white mb-2 uppercase">Happy Students</h4>
                <p className="text-slate-500 group-hover:text-blue-100 font-bold">Helping 50,000+ Aspirants Daily</p>
             </div>
             <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100 shadow-sm group hover:bg-emerald-600 transition-all duration-500">
                <Clock size={40} className="mx-auto mb-4 text-emerald-600 group-hover:text-white transition-colors" />
                <h4 className="text-xl font-black text-slate-900 group-hover:text-white mb-2 uppercase">Fast Response</h4>
                <p className="text-slate-500 group-hover:text-emerald-100 font-bold">Avg. Reply Time: 2 Hours</p>
             </div>
             <div className="p-8 bg-purple-50 rounded-[2.5rem] border border-purple-100 shadow-sm group hover:bg-purple-600 transition-all duration-500">
                <ShieldCheck size={40} className="mx-auto mb-4 text-purple-600 group-hover:text-white transition-colors" />
                <h4 className="text-xl font-black text-slate-900 group-hover:text-white mb-2 uppercase">Secure Help</h4>
                <p className="text-slate-500 group-hover:text-purple-100 font-bold">100% Verified Support</p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            
            {/* 📬 Left Side: Contact Methods (Detailed) */}
            <div className="space-y-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-6 uppercase flex items-center gap-3">
                  <Send className="text-blue-600" /> संपर्क करने के तरीके
                </h2>
                <p className="text-lg text-slate-600 font-bold leading-relaxed mb-8">
                  चाहे आपको **Premium Notes** डाउनलोड करने में समस्या हो, या आप किसी **Govt Job Notification** के बारे में स्पष्टीकरण चाहते हों, हमारी टीम आपकी सहायता के लिए 24/7 तैयार है। 
                </p>
              </div>

              <div className="space-y-6">
                {/* Email Card */}
                <div className="flex items-center gap-6 p-6 bg-white border border-slate-100 rounded-3xl shadow-lg hover:shadow-xl transition-all border-l-[10px] border-l-blue-600">
                   <div className="bg-blue-50 p-4 rounded-2xl text-blue-600 shrink-0"><Mail size={32} /></div>
                   <div className="min-w-0">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Official Email Support</p>
                      <h4 className="text-lg md:text-2xl font-black text-slate-800 break-all">studygyaan.help@gmail.com</h4>
                   </div>
                </div>

                {/* WhatsApp Card */}
                <div className="flex items-center gap-6 p-6 bg-white border border-slate-100 rounded-3xl shadow-lg hover:shadow-xl transition-all border-l-[10px] border-l-emerald-500">
                   <div className="bg-emerald-50 p-4 rounded-2xl text-emerald-600 shrink-0"><Smartphone size={32} /></div>
                   <div className="min-w-0">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">WhatsApp Chat Only</p>
                      <h4 className="text-lg md:text-2xl font-black text-slate-800">+91 6263396446</h4>
                   </div>
                </div>

                {/* Address Card */}
                <div className="flex items-center gap-6 p-6 bg-white border border-slate-100 rounded-3xl shadow-lg hover:shadow-xl transition-all border-l-[10px] border-l-indigo-600">
                   <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 shrink-0"><MapPin size={32} /></div>
                   <div className="min-w-0">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Headquarters Location</p>
                      <h4 className="text-lg md:text-2xl font-black text-slate-800 leading-tight">Tekanpur, Gwalior, Madhya Pradesh - 475005</h4>
                   </div>
                </div>
              </div>
            </div>

            {/* 📝 Right Side: Why Reach Out? */}
            <div className="bg-slate-900 rounded-[3rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
              <h3 className="text-2xl md:text-4xl font-black uppercase mb-8 border-b border-white/10 pb-4 italic">Common Queries</h3>
              
              <div className="space-y-6">
                <div className="space-y-2 group">
                   <h5 className="font-black text-blue-400 flex items-center gap-2 uppercase tracking-wide">
                     <CheckCircle size={18} /> Payment Related Issue
                   </h5>
                   <p className="text-slate-400 font-bold text-sm md:text-base leading-relaxed group-hover:text-slate-200 transition-colors">
                     यदि पेमेंट सफल होने के बाद आपका **Premium Course** अनलॉक नहीं हुआ है, तो कृपया ट्रांजेक्शन आईडी हमें व्हाट्सएप करें।
                   </p>
                </div>

                <div className="space-y-2 group">
                   <h5 className="font-black text-emerald-400 flex items-center gap-2 uppercase tracking-wide">
                     <CheckCircle size={18} /> PDF File Errors
                   </h5>
                   <p className="text-slate-400 font-bold text-sm md:text-base leading-relaxed group-hover:text-slate-200 transition-colors">
                     अगर कोई **Study Material PDF** ओपन नहीं हो रही है या लिंक टूटा हुआ है, तो हमें रिपोर्ट करें। हम उसे तुरंत अपडेट करेंगे।
                   </p>
                </div>

                <div className="space-y-2 group">
                   <h5 className="font-black text-orange-400 flex items-center gap-2 uppercase tracking-wide">
                     <CheckCircle size={18} /> Job Alert Clarification
                   </h5>
                   <p className="text-slate-400 font-bold text-sm md:text-base leading-relaxed group-hover:text-slate-200 transition-colors">
                     किसी भी **Official Job Notification** में दी गई जानकारी जैसे - पात्रता, उम्र सीमा, या फॉर्म कैसे भरें - पर सवाल पूछें।
                   </p>
                </div>

                <div className="pt-6">
                   <div className="bg-white/5 p-6 rounded-2xl border border-white/10 text-center">
                      <HelpCircle className="mx-auto text-yellow-400 mb-2" size={32} />
                      <p className="font-black uppercase text-xs tracking-widest mb-1">Current Support Status</p>
                      <span className="bg-emerald-500/20 text-emerald-400 px-4 py-1 rounded-full text-[10px] font-black uppercase">Online & Active</span>
                   </div>
                </div>
              </div>
            </div>

          </div>

          {/* 🏛️ Footer Message inside card */}
          <div className="mt-16 pt-10 border-t border-slate-100 text-center">
              <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px] md:text-sm">
                 StudyGyaan Education Portal | Powered by Excellence
              </p>
              <div className="mt-4 flex justify-center gap-4 text-blue-600 font-black text-xs md:text-base">
                 <span className="hover:text-slate-900 cursor-pointer transition-colors">Facebook</span>
                 <span className="opacity-20">•</span>
                 <span className="hover:text-slate-900 cursor-pointer transition-colors">Instagram</span>
                 <span className="opacity-20">•</span>
                 <span className="hover:text-slate-900 cursor-pointer transition-colors">YouTube</span>
              </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ContactUs;