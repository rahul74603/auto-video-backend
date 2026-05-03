import * as path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  // ✅ FIX 1: इसे './' से बदलकर '/' कर दें (ताकि CSS सही लोड हो)
  base: '/', 
  
  plugins: [react()],
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  
  // ✅ FIX 2: Build को साफ़-सुथरा रखने के लिए ये सेटिंग्स
  build: {
    outDir: 'dist',
    emptyOutDir: true, // हर बार पुरानी फाइलें डिलीट करके नई बनाएगा
    sourcemap: false,  // प्रोडक्शन में कोड हल्का रखने के लिए
    
    // 🚀 MASTER FIX: भारी लाइब्रेरीज़ को अलग-अलग बाँटना
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 1. React कोर पैकेजेस
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react-core';
            }
            // 2. Firebase (यह बहुत भारी है)
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            // 3. Quill Editor (सिर्फ एडमिन/ब्लॉग पेज पर चाहिए, होम पर नहीं)
            if (id.includes('quill')) {
              return 'vendor-quill';
            }
            // 4. Framer Motion (एनीमेशन के लिए)
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            // 5. EmailJS (सिर्फ कांटेक्ट पेज के लिए)
            if (id.includes('emailjs')) {
              return 'vendor-emailjs';
            }
            // 6. बाकी सभी छोटी लाइब्रेरीज़
            return 'vendor-others';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1500,
  }
});