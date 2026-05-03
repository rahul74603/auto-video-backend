import { useState } from 'react';
import { db } from '@/firebase/config';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { RefreshCw, Server } from 'lucide-react';

const PdfSyncManager = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleSync = async () => {
    if (!confirm("Start scanning server folders for new PDFs?")) return;
    
    setLoading(true);
    setStatus('Connecting to Server...');

    try {
      // Fetch scan.php from your domain
      const response = await fetch('https://studygyaan.in/scan.php');
      
      if (!response.ok) throw new Error("Could not connect to scan.php. Check if file exists in public_html");
      
      const serverFiles = await response.json();
      setStatus(`Found ${serverFiles.length} files. Checking Database...`);

      const existingRef = collection(db, 'study_materials');
      const snapshot = await getDocs(existingRef);
      // Create a Set of existing links for fast lookup
      const existingLinks = new Set(snapshot.docs.map(doc => doc.data().applyLink));

      let newAdded = 0;

      for (const file of serverFiles) {
        if (!existingLinks.has(file.link)) {
          // Add to Firebase
          await addDoc(existingRef, {
            title: file.title.replace(/-/g, ' ').replace(/_/g, ' '),
            subject: file.category, // Folder name becomes Subject
            category: 'ssc', // Default category
            applyLink: file.link,
            fileSize: 'PDF',
            type: 'MATERIAL',
            createdAt: new Date().toISOString()
          });
          newAdded++;
        }
      }

      setStatus(newAdded > 0 ? `Sync Complete! 🎉 Added ${newAdded} new files.` : 'Everything is already up to date! ✅');

    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 shadow-sm">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-full shadow-sm text-blue-600">
            <Server size={24} />
          </div>
          <div>
            <h4 className="font-bold text-gray-800">Auto-Sync Server PDFs</h4>
            <p className="text-xs text-gray-600">Scan cPanel folders & add to website automatically.</p>
          </div>
        </div>

        <button 
          onClick={handleSync} 
          disabled={loading}
          className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 text-white shadow-md transition-all ${
            loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
          }`}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Scanning...' : 'Sync Now'}
        </button>
      </div>

      {status && (
        <div className={`mt-3 text-sm font-medium text-center p-2 rounded ${
          status.includes('Error') ? 'text-red-600 bg-red-50' : 'text-green-700 bg-green-50'
        }`}>
          {status}
        </div>
      )}
    </div>
  );
};

export default PdfSyncManager;