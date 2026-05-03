import React, { useState } from 'react';
import { db } from '@/firebase/config';
import { collection, addDoc } from 'firebase/firestore';
import { UploadCloud, X, FileText, CheckCircle, Loader2 } from 'lucide-react';

interface Props {
  folderId: string;
  folderName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DirectUploadModal = ({ folderId, folderName, onClose, onSuccess }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('Select File');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      // Auto-fill title from filename (removing .pdf)
      setTitle(selected.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
    }
  };

  const handleUpload = async () => {
    if (!file || !title) return alert("Please select a file and enter a title.");

    setLoading(true);
    setUploadProgress('Uploading to Server...');

    try {
      // 1. Send File to PHP Script
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('https://studygyaan.in/upload.php', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.status !== 'success') throw new Error(data.message || "Upload failed");

      setUploadProgress('Saving to Database...');

      // 2. Save Metadata to Firestore
      await addDoc(collection(db, 'study_materials'), {
        title: title,
        subject: folderName,     // Folder Name
        category: folderId,      // Folder ID
        applyLink: data.url,     // Server Link from PHP
        fileSize: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        type: 'MATERIAL',
        createdAt: new Date().toISOString()
      });

      setUploadProgress('Done! 🎉');
      setTimeout(() => {
        onSuccess(); // Refresh list in AdminPage
        onClose();   // Close Modal
      }, 1000);

    } catch (error: any) {
      console.error(error);
      alert("Error: " + error.message);
      setUploadProgress('Failed ❌');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-blue-600 p-4 flex justify-between items-center text-white">
          <h3 className="font-bold flex items-center gap-2">
            <UploadCloud size={20} /> Upload in "{folderName}"
          </h3>
          <button onClick={onClose} className="hover:bg-blue-700 p-1 rounded-full"><X size={20}/></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          
          {/* File Input */}
          <div className="border-2 border-dashed border-blue-200 bg-blue-50 rounded-xl p-6 text-center group hover:border-blue-400 transition-colors relative">
            <input 
              type="file" 
              accept="application/pdf"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {file ? (
              <div className="text-blue-700">
                <FileText size={32} className="mx-auto mb-2"/>
                <p className="font-bold text-sm truncate px-4">{file.name}</p>
                <p className="text-xs text-blue-500">Click to change</p>
              </div>
            ) : (
              <div className="text-gray-500">
                <UploadCloud size={32} className="mx-auto mb-2 text-gray-400 group-hover:text-blue-500"/>
                <p className="font-medium text-sm">Tap to Select PDF</p>
              </div>
            )}
          </div>

          {/* Title Input */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Title</label>
            <input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter File Name"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
            />
          </div>

          {/* Action Button */}
          <button 
            onClick={handleUpload}
            disabled={loading || !file}
            className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 active:scale-95'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            {loading ? uploadProgress : 'Upload Now'}
          </button>

        </div>
      </div>
    </div>
  );
};

export default DirectUploadModal;