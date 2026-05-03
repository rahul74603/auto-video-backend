// @ts-nocheck
import React from 'react';
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { testimonials } from '@/data/jobs';

const Testimonials: React.FC = () => {
  const { language, t } = useLanguage();

  // Double the testimonials for seamless loop
  const doubledTestimonials = [...testimonials, ...testimonials];

  return (
    <section className="py-12 md:py-20 bg-gray-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 md:mb-12"
        >
          <h2 className="text-xl md:text-3xl sm:text-4xl font-bold text-gray-900 mb-1.5 md:mb-4">
            {t('testimonials.title')}
          </h2>
          <p className="text-xs md:text-lg text-gray-600 font-medium">
            Hear from our successful students who achieved their dreams
          </p>
        </motion.div>
      </div>

      {/* Marquee Container */}
      <div className="relative">
        {/* Gradient Masks - Smaller on mobile */}
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-gray-50 to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-gray-50 to-transparent z-10" />

        {/* Scrolling Content */}
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{
            duration: 40,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="flex gap-4 md:gap-6 hover:[animation-play-state:paused]"
        >
          {doubledTestimonials.map((testimonial, index) => (
            <motion.div
              key={`${testimonial.id}-${index}`}
              whileHover={{ scale: 1.02 }}
              className="flex-shrink-0 w-[260px] md:w-[350px] bg-white rounded-xl md:rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-lg transition-all"
            >
              {/* Quote Icon - 28% smaller on mobile */}
              <div className="mb-3 md:mb-4">
                <Quote className="w-6 h-6 md:w-8 md:h-8 text-blue-200" />
              </div>

              {/* Rating */}
              <div className="flex gap-1 mb-3 md:mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3 h-3 md:w-4 md:h-4 ${
                      i < testimonial.rating
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>

              {/* Text - Compact on mobile */}
              <p className="text-gray-700 mb-4 md:mb-6 line-clamp-3 text-[11px] md:text-sm leading-relaxed">
                "{language === 'hi' ? testimonial.textHi : testimonial.text}"
              </p>

              {/* Author Section */}
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-9 h-9 md:w-12 md:h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-xs md:text-base">
                  {testimonial.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 text-xs md:text-base">{testimonial.name}</h4>
                  <p className="text-[10px] md:text-sm text-gray-500">{testimonial.exam}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Second Row - Reverse Direction */}
      <div className="relative mt-4 md:mt-6">
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-gray-50 to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-gray-50 to-transparent z-10" />

        <motion.div
          animate={{ x: ['-50%', '0%'] }}
          transition={{
            duration: 45,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="flex gap-4 md:gap-6 hover:[animation-play-state:paused]"
        >
          {[...doubledTestimonials].reverse().map((testimonial, index) => (
            <motion.div
              key={`reverse-${testimonial.id}-${index}`}
              whileHover={{ scale: 1.02 }}
              className="flex-shrink-0 w-[260px] md:w-[350px] bg-white rounded-xl md:rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-lg transition-all"
            >
              <div className="mb-3 md:mb-4">
                <Quote className="w-6 h-6 md:w-8 md:h-8 text-purple-200" />
              </div>

              <div className="flex gap-1 mb-3 md:mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3 h-3 md:w-4 md:h-4 ${
                      i < testimonial.rating
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>

              <p className="text-gray-700 mb-4 md:mb-6 line-clamp-3 text-[11px] md:text-sm leading-relaxed">
                "{language === 'hi' ? testimonial.textHi : testimonial.text}"
              </p>

              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-9 h-9 md:w-12 md:h-12 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold text-xs md:text-base">
                  {testimonial.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 text-xs md:text-base">{testimonial.name}</h4>
                  <p className="text-[10px] md:text-sm text-gray-500">{testimonial.exam}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Testimonials;