// @ts-nocheck
import { useLanguage } from '@/context/LanguageContext';
import { examCategories } from '@/data/jobs';
import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
  ArrowRight, Briefcase,
  Building2, FileText,
  GraduationCap,
  Landmark,
  Map,
  Shield,
  Train,
  Sparkles
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

const iconMap: Record<string, React.ElementType> = {
  Building2, FileText, Landmark, Train, GraduationCap, Shield, Briefcase, Map
};

const ExamCategories: React.FC = () => {
  const { language, t } = useLanguage();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalJobs, setTotalJobs] = useState(0);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchJobCounts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "jobs"));
        const newCounts: Record<string, number> = {};
        let total = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const jobDate = new Date(data.lastDate);
          
          if (jobDate >= today) {
             const category = data.category ? data.category.toLowerCase() : 'other';
             if (newCounts[category]) newCounts[category]++;
             else newCounts[category] = 1;
             total++;
          }
        });
        setCounts(newCounts);
        setTotalJobs(total);
      } catch (error) {
        console.error("Error fetching counts:", error);
      }
    };

    const fetchStatus = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "category_status"));
        const statusData: Record<string, string> = {};
        querySnapshot.forEach((doc) => {
          statusData[doc.id] = doc.data().text;
        });
        setStatusMap(statusData);
      } catch (error) {
        console.error("Error fetching status:", error);
      }
    };

    fetchJobCounts();
    fetchStatus();
  }, []);

  const handleCategoryClick = (categoryId: string) => {
    const jobsSection = document.getElementById('govt-jobs');
    if (jobsSection) jobsSection.scrollIntoView({ behavior: 'smooth' });
    const filterValue = categoryId === 'all' ? '' : categoryId;
    window.dispatchEvent(new CustomEvent('categorySelect', { detail: filterValue }));
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  };

  const allJobsCard = { id: 'all', name: 'All Jobs', nameHi: 'सभी नौकरियां', icon: 'Briefcase', color: 'from-blue-600 to-blue-800' };
  const stateJobsCard = { id: 'state', name: 'State Jobs', nameHi: 'राज्य नौकरियां', icon: 'Map', color: 'from-emerald-500 to-teal-600' };
  const otherCategories = examCategories.filter(c => !['civil-services', 'upsc', 'state'].includes(c.id.toLowerCase()));
  const civilServicesCard = examCategories.find(c => ['civil-services', 'upsc'].includes(c.id.toLowerCase()));

  const finalList = [
    allJobsCard, civilServicesCard, ...otherCategories.slice(0, 2),
    stateJobsCard, ...otherCategories.slice(2)
  ].filter(Boolean);

  return (
    <section className="py-4 md:py-16 bg-[#F8FAFC] font-hindi antialiased">
      <div className="max-w-7xl mx-auto px-2 md:px-8">
        
        {/* Compact Header */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-3 md:mb-10">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[8px] md:text-xs font-black uppercase tracking-wider mb-1">
            <Sparkles size={10} /> Choose Your Goal
          </div>
          <h2 className="text-[14px] md:text-3xl font-black text-slate-900 mb-0.5">{t('categories.title')}</h2>
        </motion.div>

        {/* 🔥 Decision Hub Grid - Ultra Compact */}
        <motion.div 
          variants={containerVariants} 
          initial="hidden" 
          whileInView="visible" 
          viewport={{ once: true }} 
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 md:gap-4"
        >
          {finalList.map((category: any) => {
            const Icon = iconMap[category.icon] || FileText;
            const isFeatured = category.id === 'all';
            let realCount = category.id === 'all' ? totalJobs : (counts[category.id] || 0);
            let bgGradient = category.color;
            if (['civil-services', 'upsc'].includes(category.id)) bgGradient = 'from-orange-500 to-red-600';

            const displayStatus = statusMap[category.id] || "Check Updates";
            const categoryTitle = language === 'hi' && category.nameHi ? category.nameHi : category.name;

            return (
              <motion.div
                key={category.id}
                variants={itemVariants}
                onClick={() => handleCategoryClick(category.id)}
                whileTap={{ scale: 0.96 }}
                className={`
                    group relative overflow-hidden rounded-lg md:rounded-2xl cursor-pointer shadow-sm hover:shadow-md transition-all border border-white
                    ${isFeatured ? 'bg-white' : ''} h-20 md:h-48
                `}
              >
                {/* Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} opacity-90 group-hover:opacity-100 transition-opacity`} />
                
                {/* Micro Content */}
                <div className="relative p-2 md:p-5 h-full flex flex-col justify-between z-10">
                  
                  <div className="flex justify-between items-start">
                    <div className="w-6 h-6 md:w-10 md:h-10 bg-white/20 backdrop-blur-md rounded-md flex items-center justify-center shadow-inner">
                      <Icon className="w-3.5 h-3.5 md:w-5 md:h-5 text-white" />
                    </div>
                    {realCount > 0 && (
                        <span className="text-[7px] md:text-[10px] font-black text-white bg-black/10 px-1 py-0.5 rounded-full backdrop-blur-sm">
                           {realCount} Jobs
                        </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-[10px] md:text-lg font-black text-white leading-tight mb-0.5 line-clamp-1 group-hover:scale-105 transition-transform origin-left">
                      {categoryTitle}
                    </h3>
                    <p className="text-white/70 text-[7px] md:text-xs font-bold flex items-center gap-0.5 line-clamp-1 uppercase tracking-tighter">
                       {displayStatus}
                    </p>
                  </div>

                  {/* Desktop Only Arrow */}
                  <div className="hidden md:flex mt-2 items-center gap-1 text-white/80 text-[10px] font-black border-t border-white/10 pt-2">
                      Explore Now <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </div>

                </div>

                {/* Decorative Element */}
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-colors" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default ExamCategories;