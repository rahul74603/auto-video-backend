// @ts-nocheck
import { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { ArrowRight, Loader2, Zap, FileText, CheckCircle, BookOpen, Briefcase, Award } from 'lucide-react';

interface UpdateItem {
  id: string;
  title: string;
  applyLink: string;
  type: string; // Ab hum seedha TYPE check karenge
  createdAt?: string;
}

const UpdatesGrid = () => {
  // 🗂️ STATE FOR ALL CATEGORIES
  const [results, setResults] = useState<UpdateItem[]>([]);
  const [admitCards, setAdmitCards] = useState<UpdateItem[]>([]);
  const [latestJobs, setLatestJobs] = useState<UpdateItem[]>([]);
  const [answerKeys, setAnswerKeys] = useState<UpdateItem[]>([]);
  const [syllabus, setSyllabus] = useState<UpdateItem[]>([]);
  const [liveUpdates, setLiveUpdates] = useState<UpdateItem[]>([]);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        // Firebase se latest 50 items layenge taaki sab categories bhar sakein
        const q = query(collection(db, "jobs"), orderBy("updatedAt", "desc"), limit(60));
        const querySnapshot = await getDocs(q);
        
        const rawResults: UpdateItem[] = [];
        const rawAdmitCards: UpdateItem[] = [];
        const rawJobs: UpdateItem[] = [];
        const rawAnswerKeys: UpdateItem[] = [];
        const rawSyllabus: UpdateItem[] = [];
        const rawLiveUpdates: UpdateItem[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data() as UpdateItem;
          const item = { ...data, id: doc.id };
          
          // 🧠 SMART SORTING BASED ON 'TYPE' (Jo Admin Panel se aa raha hai)
          switch (data.type) {
            case 'RESULT': rawResults.push(item); break;
            case 'ADMIT_CARD': rawAdmitCards.push(item); break;
            case 'JOB': rawJobs.push(item); break;
            case 'ANSWER_KEY': rawAnswerKeys.push(item); break;
            case 'SYLLABUS': rawSyllabus.push(item); break;
            case 'LIVE_UPDATE': rawLiveUpdates.push(item); break;
            default: rawJobs.push(item); // Fallback
          }
        });

        setResults(rawResults.slice(0, 10));
        setAdmitCards(rawAdmitCards.slice(0, 10));
        setLatestJobs(rawJobs.slice(0, 10));
        setAnswerKeys(rawAnswerKeys.slice(0, 10));
        setSyllabus(rawSyllabus.slice(0, 10));
        setLiveUpdates(rawLiveUpdates.slice(0, 5));

      } catch (error) {
        console.error("Error fetching updates:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUpdates();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  // --- REUSABLE CARD COMPONENT ---
  const UpdateCard = ({ title, color, items, icon: Icon }: any) => (
    <div className={`border-2 ${color.border} rounded-xl overflow-hidden shadow-md bg-white h-full flex flex-col`}>
      {/* Header - Compact on Mobile */}
      <div className={`${color.bg} text-white font-bold text-center py-1.5 md:py-2 px-2 text-sm md:text-lg uppercase flex items-center justify-center gap-1.5 md:gap-2 tracking-wide`}>
        <Icon className="w-4 h-4 md:w-5 md:h-5" /> {title}
      </div>
      
      {/* List - Thinner items on Mobile */}
      <div className="flex-grow">
        <ul className="divide-y divide-gray-100">
          {items.length === 0 ? (
            <li className="p-4 md:p-6 text-center text-gray-400 text-[10px] md:text-sm italic">Coming Soon...</li>
          ) : (
            items.map((item: UpdateItem, index: number) => (
              <li key={item.id} className="group transition-colors hover:bg-gray-50">
                <a 
                  href={item.applyLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-2 md:p-3 text-[11px] md:text-sm font-medium text-gray-700 leading-snug flex items-start gap-1.5 md:gap-2"
                >
                  <span className={`${color.text} mt-0.5 shrink-0 text-[10px] md:text-xs`}>➤</span>
                  <span className="group-hover:text-blue-600 group-hover:underline decoration-blue-300 underline-offset-2">
                    {item.title}
                    {index === 0 && <span className="ml-1.5 bg-red-500 text-white text-[7px] md:text-[9px] px-1.5 py-0.5 rounded-full animate-pulse uppercase font-black shrink-0">New</span>}
                  </span>
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
      
      {/* View More Button */}
      <div className="p-1.5 md:p-2 bg-gray-50 text-center border-t">
        <button className={`text-[9px] md:text-xs font-bold uppercase ${color.text} hover:underline flex items-center justify-center mx-auto gap-1`}>
          View More <ArrowRight className="w-2.5 h-2.5 md:w-3 md:h-3" />
        </button>
      </div>
    </div>
  );

  return (
    <section className="py-4 md:py-8 px-2 md:px-4 max-w-7xl mx-auto space-y-4 md:space-y-8">
      
      {/* 🔴 SECTION 1: LIVE UPDATES (Highlight Box) */}
      {liveUpdates.length > 0 && (
        <div className="bg-gradient-to-r from-pink-50 to-red-50 border border-pink-200 rounded-xl p-2.5 md:p-4 shadow-sm">
           <h3 className="text-pink-700 font-bold text-xs md:text-lg mb-2 md:mb-3 flex items-center gap-1.5 md:gap-2 animate-pulse uppercase tracking-wider">
             <Zap className="w-3.5 h-3.5 md:w-5 md:h-5" fill="currentColor" /> Breaking News & Live Updates
           </h3>
           <div className="flex flex-wrap gap-1.5 md:gap-2">
             {liveUpdates.map((update) => (
                <a 
                  key={update.id} 
                  href={update.applyLink} 
                  target="_blank" 
                  rel="noreferrer"
                  className="bg-white border border-pink-200 text-gray-800 text-[10px] md:text-sm font-bold px-2.5 py-1 md:px-4 md:py-2 rounded-full shadow-sm hover:bg-pink-600 hover:text-white transition-all flex items-center gap-1.5"
                >
                  🔥 {update.title}
                </a>
             ))}
           </div>
        </div>
      )}

      {/* 🔵 SECTION 2: MAIN 3 COLUMNS (Result, Admit, Job) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
        <UpdateCard 
          title="Latest Results" 
          items={results} 
          icon={Award}
          color={{ border: 'border-red-500', bg: 'bg-red-600', text: 'text-red-600' }} 
        />
        <UpdateCard 
          title="Admit Cards" 
          items={admitCards} 
          icon={CheckCircle}
          color={{ border: 'border-blue-500', bg: 'bg-blue-600', text: 'text-blue-600' }} 
        />
        <UpdateCard 
          title="Latest Jobs" 
          items={latestJobs} 
          icon={Briefcase}
          color={{ border: 'border-gray-800', bg: 'bg-gray-900', text: 'text-gray-900' }} 
        />
      </div>

      {/* 🟢 SECTION 3: SECONDARY COLUMNS (Answer Key, Syllabus) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
        <UpdateCard 
          title="Answer Keys" 
          items={answerKeys} 
          icon={FileText}
          color={{ border: 'border-green-500', bg: 'bg-green-600', text: 'text-green-600' }} 
        />
        <UpdateCard 
          title="Syllabus" 
          items={syllabus} 
          icon={BookOpen}
          color={{ border: 'border-purple-500', bg: 'bg-purple-600', text: 'text-purple-600' }} 
        />
      </div>

    </section>
  );
};

export default UpdatesGrid;