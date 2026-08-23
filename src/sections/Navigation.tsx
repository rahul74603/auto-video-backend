import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    Menu, X, LogIn, LogOut, BookCheck,
    Sparkles, Zap, Home, Target, Wrench
} from 'lucide-react';
import { auth } from '../firebase/config';
import {
    GoogleAuthProvider, signInWithPopup,
    signOut, onAuthStateChanged
} from 'firebase/auth';

// Cached/auth user ka minimal shape
interface NavUser {
    displayName?: string | null;
    photoURL?: string | null;
    email?: string | null;
    uid?: string;
}

const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Mock Test', path: '/mock-tests' },
    { name: 'Govt Jobs', path: '/govt-jobs' },
    { name: 'E-Books', path: '/e-books' },
    { name: 'Free Study Material', path: '/free-study-material' },
    { name: 'Blog', path: '/blog' }
];

const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [user, setUser] = useState<NavUser | null>(() => {
        // ✅ localStorage se cached user — instant dikhega (lazy init)
        const cachedUser = localStorage.getItem('sg_user');
        if (!cachedUser) return null;
        try {
            return JSON.parse(cachedUser) as NavUser;
        } catch {
            localStorage.removeItem('sg_user');
            return null;
        }
    });
    const navigate = useNavigate();
    const location = useLocation();
    const authInitialized = useRef(false);

    useEffect(() => {
        let unsubscribe = () => {};

        // ✅ Firebase Auth ko defer karo
        const initAuth = () => {
            if (authInitialized.current) return;
            authInitialized.current = true;

            unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                setUser(currentUser);
                if (currentUser) {
                    localStorage.setItem('sg_user', JSON.stringify({
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        email: currentUser.email,
                        uid: currentUser.uid
                    }));
                } else {
                    localStorage.removeItem('sg_user');
                    setUser(null);
                }
            });
        };

        // ✅ 4 seconds baad ya user interact kare — jo pehle ho
        const timer = setTimeout(initAuth, 4000);

        const onInteract = () => {
            clearTimeout(timer);
            initAuth();
        };

        const events = ['scroll', 'click', 'keydown', 'touchstart'];
        events.forEach(e => {
            window.addEventListener(e, onInteract, { once: true, passive: true });
        });

        return () => {
            clearTimeout(timer);
            events.forEach(e => {
                window.removeEventListener(e, onInteract);
            });
            unsubscribe();
        };
    }, []);

    const handleGoogleLogin = async () => {
        // ✅ Login click par auth init kar do agar nahi hua
        if (!authInitialized.current) {
            authInitialized.current = true;
            onAuthStateChanged(auth, (currentUser) => {
                setUser(currentUser);
                if (currentUser) {
                    localStorage.setItem('sg_user', JSON.stringify({
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        email: currentUser.email,
                        uid: currentUser.uid
                    }));
                }
            });
        }

        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            localStorage.setItem('sg_user', JSON.stringify({
                displayName: result.user.displayName,
                photoURL: result.user.photoURL,
                email: result.user.email,
                uid: result.user.uid
            }));
        } catch (error) {
            console.error(error);
            alert('Login Failed');
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        localStorage.removeItem('sg_user');
        setUser(null);
        setIsOpen(false);
        navigate('/');
    };

    const isActive = (path: string) => location.pathname === path;

    // ========== NEECHE SE SAB SAME HAI — EK LINE BHI NAHI BADLI ==========

    return (
        <nav
            className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-[100] border-b border-slate-100 font-hindi"
            aria-label="Main Navigation"
            style={{ fontSynthesis: 'none' }}
        >
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-14 md:h-16">

                    {/* Logo */}
                    <div
                        className="flex items-center gap-1.5 cursor-pointer group shrink-0"
                        onClick={() => navigate('/')}
                        role="link"
                        aria-label="StudyGyaan Home"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
                        style={{ minWidth: '140px', minHeight: '40px' }}
                    >
                        <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                            <Zap
                                size={18}
                                className="text-white fill-white"
                                aria-hidden="true"
                            />
                        </div>
                        <span className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">
                            Study<span className="text-blue-600">Gyaan</span>
                        </span>
                    </div>

                    {/* Desktop Menu */}
                    <div
                        className="hidden md:flex items-center"
                        style={{ minHeight: '40px' }}
                    >
                        <ul className="flex items-center space-x-1">
                            {navLinks.map((link) => (
                                <li key={link.path}>
                                    <Link
                                        to={link.path}
                                        className={`px-4 py-2 rounded-full text-sm font-black transition-all inline-block ${
                                            isActive(link.path)
                                                ? 'bg-blue-50 text-blue-600'
                                                : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {link.name}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <Link
                                    to="/premium-notes"
                                    className="px-4 py-2 text-slate-700 hover:text-blue-600 font-black text-sm uppercase tracking-tight inline-block"
                                >
                                    Premium Notes
                                </Link>
                            </li>
                        </ul>

                        {/* Auth */}
                        <div
                            className="ml-4 pl-4 border-l border-slate-100 flex items-center gap-3"
                            style={{ minWidth: '120px', minHeight: '40px' }}
                        >
                            {user ? (
                                <div className="flex items-center gap-3">
                                    <Link
                                        to="/my-courses"
                                        className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-black shadow-md hover:bg-slate-900 transition-all"
                                    >
                                        <BookCheck size={14} aria-hidden="true" />
                                        My Study Material
                                    </Link>
                                    <div className="flex items-center gap-2 bg-slate-50 p-1 pr-2 rounded-full border">
                                        {user.photoURL && (
                                            <img
                                                src={user.photoURL}
                                                alt={user.displayName || 'User'}
                                                className="w-7 h-7 rounded-full shadow-sm"
                                                width={28}
                                                height={28}
                                            />
                                        )}
                                        <button
                                            onClick={handleLogout}
                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                            aria-label="Logout"
                                        >
                                            <LogOut size={16} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleGoogleLogin}
                                    className="bg-slate-900 text-white px-5 py-2 rounded-full font-black text-sm hover:bg-blue-600 transition-all shadow-md"
                                >
                                    Login
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mobile Hamburger */}
                    <div className="flex items-center md:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 text-slate-600"
                            aria-label={isOpen ? 'Close Menu' : 'Open Menu'}
                            aria-expanded={isOpen}
                        >
                            {isOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Quick Pills */}
            <div
                className="md:hidden flex overflow-x-auto bg-white border-t border-slate-50 px-3 py-2 gap-2 no-scrollbar"
                role="tablist"
                style={{ height: '44px', alignItems: 'center' }}
            >
                <Link
                    to="/"
                    role="tab"
                    aria-selected={isActive('/')}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border flex items-center gap-1 transition-all shrink-0 ${
                        isActive('/')
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600'
                    }`}
                >
                    <Home size={12} aria-hidden="true" /> Home
                </Link>

                <Link
                    to="/mock-tests"
                    role="tab"
                    aria-selected={isActive('/mock-tests')}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-black border flex items-center gap-1 transition-all shrink-0 ${
                        isActive('/mock-tests')
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100'
                            : 'bg-blue-50 text-blue-700 border-blue-100'
                    }`}
                >
                    <Target size={12} aria-hidden="true" /> Mock Test
                </Link>

                <Link
                    to="/blog"
                    className="whitespace-nowrap bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-1.5 rounded-full text-[11px] font-black shadow-md flex items-center gap-1 shrink-0"
                >
                    <Sparkles size={12} aria-hidden="true" /> Blog
                </Link>

                <Link
                    to="/e-books"
                    role="tab"
                    aria-selected={isActive('/e-books')}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border shrink-0 ${
                        isActive('/e-books')
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600'
                    }`}
                >
                    E-Books
                </Link>

                <Link
                    to="/govt-jobs"
                    role="tab"
                    aria-selected={isActive('/govt-jobs')}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border shrink-0 ${
                        isActive('/govt-jobs')
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600'
                    }`}
                >
                    Jobs
                </Link>

                <Link
                    to="/free-study-material"
                    role="tab"
                    aria-selected={isActive('/free-study-material')}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-bold border shrink-0 ${
                        isActive('/free-study-material')
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600'
                    }`}
                >
                    Free Study Material
                </Link>

                <Link
                    to="/premium-notes"
                    className="whitespace-nowrap bg-yellow-400 text-blue-900 px-4 py-1.5 rounded-full text-[11px] font-black shadow-md border border-yellow-500 shrink-0"
                >
                    Premium Notes
                </Link>

                <Link
                    to="/handwritten-premium"
                    className="flex items-center gap-1 text-amber-500 font-black text-[11px] shrink-0 whitespace-nowrap px-2"
                >
                    Handwritten Premium{' '}
                    <span className="bg-amber-500 text-white text-[8px] px-1 rounded-sm">
                        NEW
                    </span>
                </Link>
            </div>

            {/* Mobile Sidebar */}
            {isOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-white border-t shadow-2xl animate-in slide-in-from-top-2 z-[99]">
                    <ul className="px-4 pt-4 pb-8 space-y-2">
                        <li>
                            <Link
                                to="/"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-black border-b border-slate-50 ${
                                    isActive('/')
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <Home size={16} aria-hidden="true" /> Home
                            </Link>
                        </li>
                        <li>
                            <Link
                                to="/mock-tests"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-black border-b border-slate-50 ${
                                    isActive('/mock-tests')
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <Target size={16} aria-hidden="true" /> Mock Test Series
                            </Link>
                        </li>
                        <li>
                            <Link
                                to="/govt-jobs"
                                onClick={() => setIsOpen(false)}
                                className="block py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50"
                            >
                                Govt Jobs
                            </Link>
                        </li>
                        <li>
                            <Link
                                to="/e-books"
                                onClick={() => setIsOpen(false)}
                                className="block py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50"
                            >
                                E-Books Store
                            </Link>
                        </li>
                        <li>
                            <Link
                                to="/free-study-material"
                                onClick={() => setIsOpen(false)}
                                className="block py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50"
                            >
                                Free Study Material
                            </Link>
                        </li>
                        <li>
                            <a
                                href="https://studygyaan.in/tools/"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50"
                            >
                                <Wrench size={16} aria-hidden="true" /> Sarkari Tools
                            </a>
                        </li>
                        <li>
                            <Link
                                to="/exam-calendar"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-black text-slate-700 hover:bg-slate-50 border-b border-slate-50"
                            >
                                <Target size={16} aria-hidden="true" /> Exam Calendar
                            </Link>
                        </li>

                        {user ? (
                            <div className="pt-4 mt-2">
                                <Link
                                    to="/my-courses"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100 mb-4"
                                >
                                    <BookCheck size={18} aria-hidden="true" />
                                    My Study Material
                                </Link>
                                <div className="flex items-center gap-3 px-4 mb-4">
                                    {user.photoURL && (
                                        <img
                                            src={user.photoURL}
                                            alt={user.displayName || 'User'}
                                            className="w-10 h-10 rounded-full border-2 border-blue-50"
                                            width={40}
                                            height={40}
                                        />
                                    )}
                                    <div>
                                        <p className="text-sm font-black text-slate-900">
                                            {user.displayName}
                                        </p>
                                        <button
                                            onClick={handleLogout}
                                            className="text-red-500 font-bold text-xs"
                                            aria-label="Logout Account"
                                        >
                                            Logout Account
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    handleGoogleLogin();
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm mt-4"
                            >
                                <LogIn size={18} aria-hidden="true" />
                                Login with Google
                            </button>
                        )}
                    </ul>
                </div>
            )}
        </nav>
    );
};

export default Navigation;
