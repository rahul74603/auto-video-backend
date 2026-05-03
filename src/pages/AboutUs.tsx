// @ts-nocheck
import React, { useEffect } from 'react';
import { 
  Target, Users, BookOpen, CheckCircle, Briefcase, Zap, 
  Trophy, Shield, Globe, Rocket, Award, Heart, Star, 
  MapPin, GraduationCap, Flame, Search, Smartphone, ShieldCheck
} from 'lucide-react';
import SEO from '../components/SEO'; // ✅ नया SEO कम्पोनेंट यहाँ इम्पोर्ट किया है

const AboutUs = () => {
  
  useEffect(() => {
    // window.scrollTo फिक्स रखा है ताकि पेज ऊपर से लोड हो
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pt-16 md:pt-28 pb-16 px-3 md:px-6 font-hindi antialiased text-left">
      
      {/* 🔥 नया डायनामिक SEO टैग जो About Us पेज की पूरी डिटेल Google/WhatsApp को देगा */}
      <SEO 
        customTitle="About StudyGyaan | India's #1 Govt Jobs & Free Study Material Hub"
        customDescription="Learn about StudyGyaan, our journey from Tekanpur, Gwalior to becoming India's most trusted portal for Latest Govt Jobs Alert, Premium Exam Notes, and Free Mock Tests 2026."
        customUrl="https://studygyaan.in/about-us"
        customImage="https://studygyaan.in/og-image.jpg"
      />

      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* 🔥 1. MEGA HERO SECTION */}
        <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-[3rem] md:rounded-[5rem] overflow-hidden shadow-2xl p-8 md:p-24 text-center text-white">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
             <div className="absolute top-10 left-10 animate-bounce"><Star size={40} /></div>
             <div className="absolute bottom-20 right-20 animate-pulse"><Zap size={60} /></div>
          </div>
          
          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 border border-blue-400/30 px-6 py-2 rounded-full text-xs md:text-sm font-black uppercase tracking-[0.3em] mb-4">
               <Flame size={18} className="fill-current" /> Empowering Aspirants Since 2024
            </div>
            <h1 className="text-4xl md:text-8xl font-black uppercase tracking-tighter leading-none">
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 italic font-serif">StudyGyaan</span> Story
            </h1>
            <p className="text-sm md:text-2xl font-bold text-slate-300 max-w-4xl mx-auto leading-relaxed">
              सरकारी नौकरी का सपना अब हर घर में सच होगा। हम लेकर आए हैं देश का सबसे भरोसेमंद प्लेटफार्म, जहाँ शिक्षा और सूचना का संगम होता है।
            </p>
          </div>
        </div>

        {/* 🎯 2. OUR CORE AIM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16 items-center py-10">
          <div className="space-y-6">
             <h2 className="text-3xl md:text-5xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-4">
                <Target className="text-blue-600" size={40} /> हमारा लक्ष्य (Our Aim)
             </h2>
             <div className="space-y-4 text-sm md:text-xl text-slate-600 font-bold leading-loose">
                <p>
                  **StudyGyaan** का जन्म एक छोटे से शहर **Tekanpur (Gwalior, MP)** में एक बड़े सपने के साथ हुआ था। हमारा उद्देश्य केवल एक वेबसाइट बनाना नहीं था, बल्कि एक ऐसा डिजिटल पारिस्थितिकी तंत्र तैयार करना था जहाँ एक छात्र को उसकी तैयारी के पहले दिन से लेकर सिलेक्शन तक की हर चीज़ मिल सके।
                </p>
                <p>
                  हम जानते हैं कि प्रतियोगी परीक्षाओं के इस दौर में **सटीक सूचना (Right Information)** की कितनी कीमत है। इसलिए, हम लाखों छात्रों को बिना किसी भ्रम के, सबसे तेज़ और सटीक **Govt Jobs Alert** पहुँचाने के लिए प्रतिबद्ध हैं।
                </p>
             </div>
          </div>
          <div className="bg-white p-4 rounded-[3rem] shadow-2xl border border-slate-100 md:rotate-2">
             <div className="bg-blue-600 rounded-[2.5rem] p-8 md:p-12 text-white text-center space-y-6 shadow-inner">
                <Trophy size={80} className="mx-auto text-yellow-400" />
                <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tighter">StudyGyaan Mission</h3>
                <p className="text-lg opacity-80 font-bold italic">"Providing World-Class Study Material to every corner of India."</p>
             </div>
          </div>
        </div>

        {/* 🛠️ 3. MEGA FEATURE ECOSYSTEM */}
        <div className="bg-white rounded-[3rem] md:rounded-[4rem] border border-slate-100 shadow-xl p-8 md:p-16">
          <div className="text-center mb-12 md:mb-20">
             <h3 className="text-2xl md:text-5xl font-black text-slate-900 uppercase mb-4 tracking-tighter">हम क्या प्रदान करते हैं?</h3>
             <div className="h-2 w-24 bg-blue-600 mx-auto rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
            
            <div className="group bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-blue-500 transition-all duration-500 hover:bg-white hover:shadow-2xl">
              <div className="bg-blue-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                <Briefcase size={30} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-3 uppercase">Govt Job Alerts</h4>
              <p className="text-slate-500 font-bold text-sm leading-relaxed">हम SSC, Railway, Banking, और State Exams की हर नोटिफिकेशन को सबसे पहले आप तक पहुँचाते हैं। एडमिट कार्ड से रिजल्ट तक, सब कुछ यहाँ मिलता है।</p>
            </div>

            <div className="group bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-emerald-500 transition-all duration-500 hover:bg-white hover:shadow-2xl">
              <div className="bg-emerald-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                <BookOpen size={30} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-3 uppercase">Premium PDF Notes</h4>
              <p className="text-slate-500 font-bold text-sm leading-relaxed">हमारे एक्सपर्ट्स द्वारा तैयार किए गए सब्जेक्ट-वाइज नोट्स (History, Polity, Science) परीक्षा के नवीनतम पैटर्न को ध्यान में रखकर बनाए गए हैं।</p>
            </div>

            <div className="group bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-orange-500 transition-all duration-500 hover:bg-white hover:shadow-2xl">
              <div className="bg-orange-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-200 group-hover:scale-110 transition-transform">
                <Zap size={30} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-3 uppercase">Live Mock Tests</h4>
              <p className="text-slate-500 font-bold text-sm leading-relaxed">असली परीक्षा का अनुभव देने के लिए हमारे पास एडवांस्ड पोर्टल है, जहाँ छात्र मॉक टेस्ट देकर अपनी अखिल भारतीय रैंकिंग देख सकते हैं।</p>
            </div>

            <div className="group bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-purple-500 transition-all duration-500 hover:bg-white hover:shadow-2xl">
              <div className="bg-purple-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-purple-200 group-hover:scale-110 transition-transform">
                <Search size={30} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-3 uppercase">Exam Strategies</h4>
              <p className="text-slate-500 font-bold text-sm leading-relaxed">हम केवल मटेरियल नहीं देते, बल्कि तैयारी करने का सही तरीका भी बताते हैं। हमारे ब्लॉग्स में टॉपर्स की रणनीतियाँ साझा की जाती हैं।</p>
            </div>

            <div className="group bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-pink-500 transition-all duration-500 hover:bg-white hover:shadow-2xl">
              <div className="bg-pink-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-pink-200 group-hover:scale-110 transition-transform">
                <Shield size={30} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-3 uppercase">Free Resources</h4>
              <p className="text-slate-500 font-bold text-sm leading-relaxed">शिक्षा को व्यापार नहीं, अधिकार बनाने के लिए हमारी लाइब्रेरी में हजारों पुराने पेपर्स और प्रैक्टिस सेट्स मुफ्त में उपलब्ध हैं।</p>
            </div>

            <div className="group bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-amber-500 transition-all duration-500 hover:bg-white hover:shadow-2xl">
              <div className="bg-amber-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-amber-200 group-hover:scale-110 transition-transform">
                <Smartphone size={30} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-3 uppercase">Direct Support</h4>
              <p className="text-slate-500 font-bold text-sm leading-relaxed">हमारी टीम व्हाट्सएप और ईमेल के माध्यम से हर छात्र की समस्या का समाधान करती है। हम छात्रों के साथ उनके सिलेक्शन तक खड़े रहते हैं।</p>
            </div>

          </div>
        </div>

        {/* 👥 4. OUR TEAM & ROOTS */}
        <div className="bg-slate-900 rounded-[3rem] md:rounded-[4rem] p-8 md:p-20 text-white flex flex-col lg:flex-row gap-12 items-center overflow-hidden relative">
           <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
           <div className="lg:w-1/2 space-y-6 text-left relative z-10">
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-blue-400">हमारी टीम और जड़ें</h2>
              <p className="text-sm md:text-xl font-bold opacity-80 leading-relaxed">
                ग्वालियर (मध्य प्रदेश) के **टेकनपुर** से शुरू हुआ यह सफर अब पूरे भारत के छात्रों तक पहुँच चुका है। हमारी टीम में वे लोग शामिल हैं जो स्वयं प्रतियोगी परीक्षाओं की बारीकियों को समझते हैं। 
              </p>
              <div className="space-y-4">
                 <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                    <MapPin className="text-red-400" size={24} />
                    <span className="font-black uppercase text-xs md:text-lg">Tekanpur, Gwalior (M.P.) - The Heart of StudyGyaan</span>
                 </div>
                 <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                    <Users className="text-blue-400" size={24} />
                    <span className="font-black uppercase text-xs md:text-lg">Dedicated Subject Experts & Tech Team</span>
                 </div>
              </div>
           </div>
           <div className="lg:w-1/2 grid grid-cols-2 gap-4 w-full relative z-10">
              <div className="bg-white/10 p-6 rounded-3xl text-center backdrop-blur-sm border border-white/10">
                 <Trophy size={32} className="mx-auto text-yellow-400 mb-2" />
                 <p className="text-2xl font-black">100%</p>
                 <p className="text-[10px] uppercase font-bold opacity-60 tracking-widest">Quality Content</p>
              </div>
              <div className="bg-white/10 p-6 rounded-3xl text-center backdrop-blur-sm border border-white/10">
                 <Rocket size={32} className="mx-auto text-blue-400 mb-2" />
                 <p className="text-2xl font-black">Fastest</p>
                 <p className="text-[10px] uppercase font-bold opacity-60 tracking-widest">Job Updates</p>
              </div>
              <div className="bg-white/10 p-6 rounded-3xl text-center backdrop-blur-sm border border-white/10">
                 <Award size={32} className="mx-auto text-emerald-400 mb-2" />
                 <p className="text-2xl font-black">1L+</p>
                 <p className="text-[10px] uppercase font-bold opacity-60 tracking-widest">Students Trusted</p>
              </div>
              <div className="bg-white/10 p-6 rounded-3xl text-center backdrop-blur-sm border border-white/10">
                 <Heart size={32} className="mx-auto text-rose-400 mb-2" />
                 <p className="text-2xl font-black">24/7</p>
                 <p className="text-[10px] uppercase font-bold opacity-60 tracking-widest">Support System</p>
              </div>
           </div>
        </div>

        {/* 🌟 5. FINAL CALL TO ACTION */}
        <div className="py-10 text-center space-y-8 bg-white rounded-[3rem] border border-slate-100 shadow-xl p-10">
           <h3 className="text-2xl md:text-5xl font-black text-slate-800 uppercase tracking-tighter">तैयार हैं अपनी सफलता की कहानी लिखने के लिए?</h3>
           <p className="text-slate-500 font-bold text-sm md:text-xl max-w-2xl mx-auto">
             आज ही StudyGyaan परिवार का हिस्सा बनें और अपनी तैयारी को उन ऊंचाइयों पर ले जाएं जहाँ से सिर्फ कामयाबी दिखती है।
           </p>
           <button 
             onClick={() => window.location.href = '/'}
             className="bg-blue-600 hover:bg-slate-900 text-white px-10 py-5 rounded-2xl font-black text-xs md:text-xl shadow-[0_20px_50px_rgba(37,99,235,0.3)] transition-all active:scale-95 uppercase tracking-widest flex items-center gap-3 mx-auto"
           >
             Get Started Now <Rocket size={24} />
           </button>
        </div>

      </div>
    </div>
  );
};

export default AboutUs;