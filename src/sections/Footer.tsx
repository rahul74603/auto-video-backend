// @ts-nocheck
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, Sparkles, Zap, Flame } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-[#0F172A] text-gray-400 pt-8 md:pt-16 pb-6 md:pb-8 relative border-t border-white/5 font-hindi" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-8 md:mb-12">
          
          {/* 1. Brand Info - The Identity */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-600/20">
                <Zap className="w-5 h-5 text-white fill-white" aria-hidden="true" />
              </div>
              <span className="text-xl md:text-2xl font-black text-white tracking-tighter">Study<span className="text-blue-500">Gyaan</span></span>
            </div>
            <p className="text-gray-500 mb-6 leading-relaxed text-[11px] md:text-sm">
              विद्यार्थियों की सफलता का सारथी। प्रीमियम स्टडी मटेरियल और एजुकेशन कंटेंट का एकमात्र स्थान।
            </p>
            <div className="flex gap-3">
              {[
                { Icon: Facebook, label: "Follow us on Facebook" },
                { Icon: Twitter, label: "Follow us on Twitter" },
                { Icon: Instagram, label: "Follow us on Instagram" },
                { Icon: Linkedin, label: "Follow us on Linkedin" }
              ].map((social, i) => (
                <a 
                  key={i} 
                  href="#" 
                  aria-label={social.label}
                  className="bg-slate-800/50 p-2 rounded-lg hover:bg-blue-600 hover:text-white transition-all transform hover:-translate-y-1"
                >
                  <social.Icon className="w-4 h-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* 2. Quick Links - The Explore Loop */}
          <nav className="col-span-1" aria-label="Footer Quick Links">
            <h3 className="text-white font-black mb-4 md:mb-6 uppercase tracking-widest text-[10px] md:text-sm flex items-center gap-1.5">
              Explore <Sparkles size={12} className="text-blue-400" aria-hidden="true" />
            </h3>
            <ul className="space-y-2 md:space-y-4 text-[11px] md:text-sm font-bold">
              <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link to="/mock-tests" className="hover:text-white transition-colors">Mock Test</Link></li>
              <li><Link to="/free-study-material" className="hover:text-white transition-colors">Free Study Material</Link></li>
              <li><Link to="/blog" className="text-gray-400 hover:text-white transition-colors font-bold">Blog</Link></li>
              <li><Link to="/govt-jobs" className="hover:text-white transition-colors">Govt Jobs</Link></li>
              <li><Link to="/premium-notes" className="text-gray-400 hover:text-white transition-colors font-bold">Premium Notes</Link></li>
            </ul>
          </nav>

          {/* 3. Legal Section */}
          <nav className="col-span-1" aria-label="Legal Information">
            <h3 className="text-white font-black mb-4 md:mb-6 uppercase tracking-widest text-[10px] md:text-sm">Legal Info</h3>
            <ul className="space-y-2 md:space-y-3 text-[10px] md:text-sm font-medium opacity-80">
              <li><Link to="/about-us" className="hover:text-blue-400 transition-colors">About Us</Link></li>
              <li><Link to="/privacy-policy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms-conditions" className="hover:text-blue-400 transition-colors">Terms & Cond.</Link></li>
              <li><Link to="/refund-cancellation-policy" className="hover:text-blue-400 transition-colors">Refund & Cancellation</Link></li>
              <li><Link to="/shipping-policy" className="hover:text-blue-400 transition-colors">Shipping Policy</Link></li>
              <li><Link to="/disclaimer" className="hover:text-blue-400 transition-colors">Disclaimer</Link></li>
              <li><Link to="/contact-us" className="hover:text-blue-400 transition-colors">Contact Us</Link></li>
            </ul>
          </nav>

          {/* 4. Contact Info - Support */}
          <section className="col-span-2 md:col-span-1 pt-6 md:pt-0 border-t border-white/5 md:border-none">
            <h3 className="text-white font-black mb-4 md:mb-6 uppercase tracking-widest text-[10px] md:text-sm">Get in Touch</h3>
            <ul className="space-y-3 md:space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
                <address className="text-[11px] md:text-sm not-italic">Tekanpur, Gwalior, MP, India</address>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-green-500 shrink-0" aria-hidden="true" />
                <a href="tel:+916263396446" className="hover:text-white transition-colors text-[11px] md:text-sm" aria-label="Call support at +91 6263396446">+91 6263396446</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
                <a href="mailto:contact@studygyaan.in" className="hover:text-white transition-colors text-[11px] md:text-sm" aria-label="Email support at contact@studygyaan.in">contact@studygyaan.in</a>
              </li>
            </ul>
          </section>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/5 pt-6 md:pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] md:text-sm text-gray-500 text-center font-bold">
          <p>© {new Date().getFullYear()} <span className="text-blue-500">StudyGyaan.</span> All rights reserved.</p>
          <div className="flex items-center gap-1 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
            <Flame size={14} className="text-orange-500" aria-hidden="true" />
            <span>Made with ❤️ for Active Students</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;