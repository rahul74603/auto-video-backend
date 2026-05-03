import { useEffect, useState } from 'react'; // React हटा दिया (Error 2 Fix)
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, ShieldCheck } from 'lucide-react';

const Redirect = () => {
    const [searchParams] = useSearchParams();
    const [counter, setCounter] = useState(10);
    // 🚀 Error 1 Fix: null को हटाकर खाली string ('') डिफॉल्ट कर दिया
    const targetUrl = searchParams.get('url') || ""; 

    useEffect(() => {
        // अगर URL नहीं है, तो वापस होमपेज पर भेज दो
        if (!targetUrl) {
            window.location.href = '/';
            return;
        }

        const timer = setInterval(() => {
            setCounter((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    window.location.href = targetUrl;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [targetUrl]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-hindi">
            <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 text-center animate-in zoom-in duration-300">
                
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck size={40} />
                </div>

                <h1 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                    Please Wait...
                </h1>
                
                <p className="text-slate-500 font-bold mb-8 text-sm">
                    You are being redirected to the official website in a safe and secure way.
                </p>

                <div className="relative w-32 h-32 mx-auto mb-8 flex items-center justify-center">
                    <div className="absolute inset-0 border-8 border-slate-100 rounded-full"></div>
                    <div 
                        className="absolute inset-0 border-8 border-blue-600 rounded-full border-t-transparent animate-spin"
                        style={{ animationDuration: '2s' }}
                    ></div>
                    <span className="text-4xl font-black text-blue-600 absolute">
                        {counter}
                    </span>
                </div>

                <div className="w-full h-24 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center mb-6 text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Advertisement Space
                </div>

                <p className="text-xs font-bold text-slate-400 flex items-center justify-center gap-1">
                    <ExternalLink size={12} /> Target: {targetUrl ? new URL(targetUrl).hostname : 'Official Site'}
                </p>
                
                {counter === 0 && (
                     <a 
                        href={targetUrl} // अब यहाँ Error नहीं आएगा!
                        rel="nofollow noopener noreferrer" 
                        className="mt-6 inline-block text-blue-600 font-black text-sm underline"
                     >
                        Click here if not redirected
                     </a>
                     
                )}
                {/* ✅ SEO FIX: Visually Hidden Internal Links (Fixes 'Orphan page' & 'No outgoing links' without breaking UI) */}
                <div style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
                    <a href="/">Home</a>
                    <a href="/govt-jobs">Latest Govt Jobs</a>
                    <a href="/free-study-material">Free Study Material</a>
                    <a href="/test">Free Mock Tests</a>
                    <a href="/blog">Sarkari Yojana & Blogs</a>
                </div>
            </div>
        </div>
    );
};

export default Redirect;