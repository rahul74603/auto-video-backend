// @ts-nocheck
import React from 'react';
import { Youtube, MessageCircle, Send, Facebook } from 'lucide-react';

const FloatingSocials = () => {
    return (
        // z-[9000] fixed position, compact gap-3
        <div className="fixed right-4 bottom-24 z-[9000] flex flex-col gap-3">
            
            {/* 🔵 Facebook */}
            <a 
                href="https://www.facebook.com/StudyGyaan.in/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-[#1877F2] text-white p-2.5 rounded-full shadow-xl hover:bg-blue-700 transition-transform hover:scale-110 flex items-center justify-center group relative border-2 border-white"
            >
                <Facebook size={24} fill="currentColor" />
                <span className="absolute right-14 bg-black text-white text-xs font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Follow Facebook
                </span>
            </a>

            {/* 🟢 WhatsApp (Ab ye nahi uchlega, sirf pulse karega) */}
            <a 
                href="https://whatsapp.com/channel/0029VbC4vo12ZjCuRpjPrt3b" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-[#25D366] text-white p-2.5 rounded-full shadow-xl hover:bg-green-600 transition-transform hover:scale-110 animate-pulse flex items-center justify-center group relative border-2 border-white"
            >
                <MessageCircle size={24} fill="currentColor" />
                <span className="absolute right-14 bg-black text-white text-xs font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Join WhatsApp
                </span>
            </a>

            {/* 🔵 Telegram (Animate Pulse) */}
            <a 
                href="https://t.me/studygyaan_official" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-[#0088cc] text-white p-2.5 rounded-full shadow-xl hover:bg-blue-600 transition-transform hover:scale-110 animate-pulse flex items-center justify-center group relative border-2 border-white"
            >
                <Send size={24} fill="currentColor" className="-ml-0.5" />
                <span className="absolute right-14 bg-black text-white text-xs font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Join Telegram
                </span>
            </a>

            {/* 🔴 YouTube (Hover Effect Only) */}
            <a 
                href="https://youtube.com/@studygyaan_official" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-[#FF0000] text-white p-2.5 rounded-full shadow-xl hover:bg-red-700 transition-transform hover:-translate-y-1 flex items-center justify-center group relative border-2 border-white"
            >
                <Youtube size={24} />
                <span className="absolute right-14 bg-black text-white text-xs font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Subscribe
                </span>
            </a>

        </div>
    );
};

export default FloatingSocials;