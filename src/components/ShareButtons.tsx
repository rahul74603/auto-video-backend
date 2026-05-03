// @ts-nocheck
import React, { useState } from 'react';
import { Share2, MessageCircle, Copy, Check } from 'lucide-react';

interface ShareProps {
  title: string;
  url?: string; 
}

const ShareButtons: React.FC<ShareProps> = ({ title, url }) => {
  const [copied, setCopied] = useState(false);
  
  // अगर URL नहीं मिला तो current page का लिंक लेगा
  const shareUrl = url || window.location.href;

  // ✅ WhatsApp के लिए: Title ऊपर और Link सबसे नीचे
  const whatsappText = `🔥 *${title}*\n\nयहाँ क्लिक करें 👇\n${shareUrl}`;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: title,
          url: shareUrl,
        });
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
    window.open(waUrl, '_blank');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl); 
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2 mt-2 md:mt-3 pt-2 md:pt-3 border-t border-dashed border-gray-200 w-full">
        {/* Helper text */}
        <span className="text-[7px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Share this update</span>
        
        <div className="flex gap-1.5 md:gap-2 justify-center">
            
            {/* WhatsApp Button with Label */}
            <button 
                onClick={handleWhatsApp} 
                className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-green-50 text-green-600 rounded-md md:rounded-lg hover:bg-green-600 hover:text-white transition-all shadow-sm shrink-0"
                title="WhatsApp पर भेजें"
            >
                <MessageCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="text-[8px] md:text-[10px] font-bold">WhatsApp</span>
            </button>

            {/* Other Share Options with Label */}
            <button 
                onClick={handleNativeShare} 
                className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-blue-50 text-blue-600 rounded-md md:rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm shrink-0"
                title="अन्य विकल्प"
            >
                <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="text-[8px] md:text-[10px] font-bold">Share</span>
            </button>

            {/* Copy Link Button with Label */}
            <button 
                onClick={handleCopy} 
                className={`flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg transition-all shadow-sm shrink-0 ${copied ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-200'}`}
                title="लिंक कॉपी करें"
            >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="text-[8px] md:text-[10px] font-bold">{copied ? 'Copied' : 'Link'}</span>
            </button>
        </div>
    </div>
  );
};

export default ShareButtons;