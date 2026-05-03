// @ts-nocheck
import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LogIn, LogOut, User, BookCheck, Sparkles, Zap, Home, Target } from 'lucide-react';
import { auth } from '../firebase/config';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("Login Failed");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsOpen(false);
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  // ✅ मुख्य नेविगेशन लिंक्स (Centralized)
  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Mock Test', path: '/mock-tests' },
    { name: 'Govt Jobs', path: '/govt-jobs' },
    { name: 'E-Books', path: '/e-books' },
    { name: 'Free Study Material', path: '/free-study-material' },
    { name: 'Blog', path: '/blog' }
  ];

  return (
    <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-[100] border-b border-slate-100 font-hindi" aria-label="Main Navigation">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 md:h-16">
          
          {/* Logo Section */}
          <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                <Zap size={18} className="text-white fill-white" aria-hidden="true" />
            </div>
            <span className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">
                Study<span className="text-blue-600">Gyaan</span>
            </span>
          </div>

          {/* Desktop Menu (Semantic List) */}
          <div className="hidden md:flex items-center">
            <ul className="flex items-center space-x-1">
              {navLinks.map((link) => (
                <li key={link.path}>
                  <Link 
                    to={link.path} 
                    className={`px-4 py-2 rounded-full text-sm font-black transition-all inline-block ${
                        isActive(link.path) ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                    }`}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/premium-notes" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-black text-sm uppercase tracking-tight inline-block">
                  Premium Notes
                </Link>
              </li>
            </ul>
            
            {/* Auth Section */}
            <div className="ml-4 pl-4 border-l border-slate-100 flex items-center gap-3">
                {user ? (
                    <div className="flex items-center gap-3">
                        <Link to="/my-courses" className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-black shadow-md hover:bg-slate-900 transition-all">
                            <BookCheck size={14} aria-hidden="true"/> My Study Material
                        </Link>
                        <div className="flex items-center gap-2 bg-slate-50 p-1 pr-2 rounded-full border">
                            <img src={user.photoURL} alt={user.displayName || "User"} className="w-7 h-7 rounded-full shadow-sm" />
                            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors" aria-label="Logout">
                                <LogOut size={16} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={handleGoogleLogin} className="bg-slate-900 text-white px-5 py-2 rounded-full font-black text-sm hover:bg-blue-600 transition-all shadow-md">
                        Login
                    </button>
                )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button 
              onClick={() => setIsOpen(!isOpen)} 
              className="p-2 text-slate-600" 
              aria-label={isOpen ? "Close Menu" : "Open Menu"}
              aria-expanded={isOpen}
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Quick Pills (Horizontal Scrollbar) */}
      <div className="md:hidden flex overflow-x-auto bg-white border-t border-slate-50 px-3 py-2.5 gap-2 no-scrollbar" role="tablist">
          <Link to="/" className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border flex items-center gap-1 transition-all ${isActive('/') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
             <Home size={12} aria-hidden="true" /> Home
          </Link>
          <Link to="/mock-tests" className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-black border flex items-center gap-1 transition-all ${isActive('/mock-tests') ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
             <Target size={12} aria-hidden="true" /> Mock Test
          </Link>
          <Link to="/blog" className="whitespace-nowrap bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-1.5 rounded-full text-[11px] font-black shadow-md flex items-center gap-1">
             <Sparkles size={12} aria-hidden="true" /> Blog
          </Link>
          <Link to="/e-books" className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border ${isActive('/e-books') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
             E-Books
          </Link>
          <Link to="/govt-jobs" className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border ${isActive('/govt-jobs') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
             Jobs
          </Link>
          <Link to="/free-study-material" className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border ${isActive('/free-study-material') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
             Free Study Material
          </Link>
          <Link to="/premium-notes" className="whitespace-nowrap bg-yellow-400 text-blue-900 px-4 py-1.5 rounded-full text-[11px] font-black shadow-md border border-yellow-500">
             Premium notes
          </Link>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white border-t shadow-2xl animate-in slide-in-from-top-2">
          <ul className="px-4 pt-4 pb-8 space-y-2">
            <li>
              <Link to="/" onClick={() => setIsOpen(false)} className={`flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-black border-b border-slate-50 ${isActive('/') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                 <Home size={16} aria-hidden="true" /> Home
              </Link>
            </li>
            <li>
              <Link to="/mock-tests" onClick={() => setIsOpen(false)} className={`flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-black border-b border-slate-50 ${isActive('/mock-tests') ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                 <Target size={16} aria-hidden="true" /> Mock Test Series
              </Link>
            </li>
            <li>
              <Link to="/govt-jobs" onClick={() => setIsOpen(false)} className="block py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50">Govt Jobs</Link>
            </li>
            <li>
              <Link to="/e-books" onClick={() => setIsOpen(false)} className="block py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50">E-Books Store</Link>
            </li>
            <li>
              <Link to="/free-study-material" onClick={() => setIsOpen(false)} className="block py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50">Free Study Material</Link>
            </li>
            
            {user ? (
                <div className="pt-4 mt-2">
                    <Link to="/my-courses" onClick={() => setIsOpen(false)} className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100 mb-4">
                        <BookCheck size={18} aria-hidden="true" /> My Study Material
                    </Link>
                    <div className="flex items-center gap-3 px-4 mb-4">
                        <img src={user.photoURL} alt={user.displayName} className="w-10 h-10 rounded-full border-2 border-blue-50" />
                        <div>
                            <p className="text-sm font-black text-slate-900">{user.displayName}</p>
                            <button onClick={handleLogout} className="text-red-500 font-bold text-xs" aria-label="Logout Account">Logout Account</button>
                        </div>
                    </div>
                </div>
            ) : (
                <button onClick={() => { handleGoogleLogin(); setIsOpen(false); }} className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm mt-4">
                    <LogIn size={18} aria-hidden="true" /> Login with Google
                </button>
            )}
          </ul>
        </div>
      )}
    </nav>
  );
};

export default Navigation;