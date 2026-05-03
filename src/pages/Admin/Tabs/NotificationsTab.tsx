import { useState, useEffect } from 'react';
// 👇 FIXED: Sirf 3 dots hone chahiye
// 👇 ONLY 3 sets of dots
import { db } from '../../../firebase/config';
import { collection, getDocs, doc, setDoc, deleteDoc, query } from 'firebase/firestore';
import { Bell, Trash2, Save } from 'lucide-react';

const JOB_CATEGORIES = [
  { id: 'ssc', name: 'SSC Exams' }, { id: 'banking', name: 'Banking Exams' }, { id: 'railway', name: 'Railway Exams' },
  { id: 'upsc', name: 'UPSC & Civil Services' }, { id: 'defense', name: 'Defense & Police' }, { id: 'teaching', name: 'Teaching Exams' },
  { id: 'engineering', name: 'Engineering / PSU' }, { id: 'medical', name: 'Medical / Nurse' }, { id: 'state', name: 'State Govt Exams' },
  { id: 'other', name: 'Post Office / Other' }, { id: 'all', name: 'All Jobs Box' }
];

const NotificationsTab = () => {
  const [statusCategory, setStatusCategory] = useState('ssc');
  const [statusText, setStatusText] = useState('');
  const [allStatuses, setAllStatuses] = useState<{id: string, text: string}[]>([]);

  useEffect(() => { fetchStatuses(); }, []);

  const fetchStatuses = async () => {
      const q = query(collection(db, "category_status"));
      const s = await getDocs(q);
      setAllStatuses(s.docs.map(d => ({ id: d.id, text: d.data().text })));
  };

  const handleUpdate = async () => {
      if(!statusText) return alert("Text required");
      await setDoc(doc(db, "category_status", statusCategory), { text: statusText, updatedAt: new Date() });
      alert("Updated!"); setStatusText(''); fetchStatuses();
  };

  const handleDelete = async (id: string) => {
      if(confirm("Delete?")) { await deleteDoc(doc(db, "category_status", id)); fetchStatuses(); }
  };

  return (
    <div className="bg-white p-6 rounded-xl border shadow-lg">
        <h3 className="font-bold text-xl mb-6 flex items-center gap-2"><Bell className="text-pink-500"/> Manage Status Cards</h3>
        
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-gray-50 p-4 rounded-xl border">
            <select value={statusCategory} onChange={e => setStatusCategory(e.target.value)} className="border p-3 rounded-lg bg-white font-medium">{JOB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input value={statusText} onChange={e => setStatusText(e.target.value)} className="border p-3 flex-1 rounded-lg" placeholder="e.g. Admit Card Released..."/>
            <button onClick={handleUpdate} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 justify-center"><Save size={18}/> Update</button>
        </div>

        <div className="space-y-2">
            {allStatuses.map(s => (
                <div key={s.id} className="flex justify-between items-center p-3 bg-white border rounded-lg hover:shadow-sm transition">
                    <div><span className="font-bold text-blue-600 mr-2 uppercase bg-blue-50 px-2 py-1 rounded text-xs">{s.id}</span><span className="text-gray-700">{s.text}</span></div>
                    <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                </div>
            ))}
            {allStatuses.length === 0 && <p className="text-center text-gray-400">No active status cards.</p>}
        </div>
    </div>
  );
};

export default NotificationsTab;