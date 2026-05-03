// @ts-nocheck
import React from 'react';
import { motion } from 'framer-motion';
import { Globe, Award, Clock, Gift, CheckCircle, Star } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const features = [
  {
    icon: Globe,
    title: 'why.bilingual',
    titleHi: 'द्विभाषी सामग्री',
    description: 'why.bilingual.desc',
    descriptionHi: 'हिंदी और अंग्रेजी दोनों भाषाओं में स्टडी मटेरियल उपलब्ध',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Award,
    title: 'why.expert',
    titleHi: 'एक्सपर्ट द्वारा तैयार सामग्री',
    description: 'why.expert.desc',
    descriptionHi: 'विषय विशेषज्ञों और टॉपर्स द्वारा तैयार कंटेंट',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Clock,
    title: 'why.updates',
    titleHi: 'नियमित अपडेट्स',
    description: 'why.updates.desc',
    descriptionHi: 'रोजाना नौकरी अपडेट्स और करंट अफेयर्स',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: Gift,
    title: 'why.free',
    titleHi: 'मुफ्त एक्सेस',
    description: 'why.free.desc',
    descriptionHi: 'हमारा अधिकांश कंटेंट सभी के लिए पूरी तरह मुफ्त है',
    color: 'from-green-500 to-emerald-500',
  },
];

const stats = [
  { value: '10L+', label: 'Active Students', labelHi: 'सक्रिय छात्र' },
  { value: '50K+', label: 'Study Materials', labelHi: 'स्टडी मटेरियल' },
  { value: '1K+', label: 'Success Stories', labelHi: 'सफलता की कहानियां' },
  { value: '100+', label: 'Expert Teachers', labelHi: 'विशेषज्ञ शिक्षक' },
];

const WhyChooseUs: React.FC = () => {
  const { language, t } = useLanguage();

  return (
    <section id="about" className="py-12 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 md:mb-16"
        >
          <h2 className="text-2xl md:text-4xl font-bold text-gray-900 mb-1.5 md:mb-4">
            {t('why.title')}
          </h2>
          <p className="text-xs md:text-lg text-gray-600 max-w-2xl mx-auto font-medium">
            We provide the best learning experience for competitive exam preparation
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12 md:mb-20">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="group relative"
            >
              <div className="relative bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-100 shadow-lg hover:shadow-xl transition-all overflow-hidden h-full">
                {/* Gradient Background on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
                
                {/* Icon Container - 28% Smaller on Mobile */}
                <div className={`w-10 h-10 md:w-14 md:h-14 rounded-lg md:rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-5 h-5 md:w-7 md:h-7 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-sm md:text-lg font-bold text-gray-900 mb-1 md:mb-2">
                  {language === 'hi' ? feature.titleHi : t(feature.title)}
                </h3>
                <p className="text-gray-600 text-[11px] md:text-sm leading-relaxed">
                  {language === 'hi' ? feature.descriptionHi : t(feature.description)}
                </p>

                {/* Checkmark */}
                <div className="absolute top-3 right-3 md:top-4 md:right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl md:rounded-3xl transform rotate-1 opacity-10" />
          <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl md:rounded-3xl p-5 md:p-12 shadow-xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="text-xl md:text-4xl font-black text-white mb-0.5 md:mb-2">
                    {stat.value}
                  </div>
                  <div className="text-white/80 text-[10px] md:text-sm font-medium">
                    {language === 'hi' ? stat.labelHi : stat.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 md:mt-16 flex flex-wrap justify-center gap-4 md:gap-8"
        >
          {[
            { icon: Star, label: '4.9 Rating', labelHi: '4.9 रेटिंग' },
            { icon: CheckCircle, label: 'Verified Content', labelHi: 'सत्यापित सामग्री' },
            { icon: Award, label: 'Expert Teachers', labelHi: 'विशेषज्ञ शिक्षक' },
          ].map((badge) => (
            <div key={badge.label} className="flex items-center space-x-1.5 md:space-x-2 text-gray-600">
              <badge.icon className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
              <span className="font-bold text-[11px] md:text-base">
                {language === 'hi' ? badge.labelHi : badge.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default WhyChooseUs;