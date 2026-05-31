import * as path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: '/',

  plugins: [
    react()
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,

    // ✅ Faster minification
    minify: 'esbuild',

    // ✅ Modern browsers target
    target: 'es2015',

    // ✅ CSS alag file mein — route level split hogi
    cssCodeSplit: true,

    // ✅ Warning sirf tab aaye jab chunk sach mein bada ho
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // ✅ Asset files ka naam consistent rakho
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',

        manualChunks(id) {
          if (id.includes('node_modules')) {

            // 1. React core — sabse pehle load hoga
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/')||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react-core';
            }

            // 2. Firebase — alag alag split
            // Auth alag — sirf login page par chahiye
            if (id.includes('firebase/auth')) {
              return 'vendor-firebase-auth';
            }
            // Storage alag — sirf admin par chahiye
            if (id.includes('firebase/storage')) {
              return 'vendor-firebase-storage';
            }
            // Firestore + app — har jagah chahiye
            if (id.includes('firebase')) {
              return 'vendor-firebase-core';
            }

            // 3. Quill — sirf admin page par
            if (id.includes('quill') || id.includes('react-quill')) {
              return 'vendor-quill';
            }

            // 4. Framer Motion
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }

            // 5. EmailJS
            if (id.includes('emailjs')) {
              return 'vendor-emailjs';
            }

            // 6. Lucide icons — bade hote hain
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }

            // 7. Radix UI components
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }

            // 8. Baaki sab
            return 'vendor-others';
          }
        }
      }
    }
  },

  // ✅ Dev server optimization
  server: {
    hmr: true,
    port: 5173
  },

  // ✅ Dependencies pre-bundle karo — dev fast hoga
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'firebase/app',
      'firebase/firestore',
      'firebase/auth'
    ],
    exclude: [
      'react-quill'  // Quill ko pre-bundle mat karo — lazy load hoga
    ]
  }
});
