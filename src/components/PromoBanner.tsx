const PromoBanner = () => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 shadow-md w-full relative z-50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <span className="bg-yellow-400 text-blue-900 text-xs font-bold px-2 py-1 rounded animate-pulse">
            NEW
          </span>
          <p className="text-sm sm:text-base font-medium">
            सरकारी फॉर्म के लिए फोटो रिसाइज़ और PDF बनाएं बिल्कुल फ्री!
          </p>
        </div>
        <a
          href="https://studygyaan.in/tools/"
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap bg-white text-blue-700 hover:bg-gray-100 px-5 py-1.5 rounded-full text-sm font-bold shadow-sm transition-all"
        >
          Sarkari Toolkit खोलें 🚀
        </a>
      </div>
    </div>
  );
};

export default PromoBanner;