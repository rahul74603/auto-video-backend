import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockTest } from '@/features/mock-tests/hooks/useMockTest';
import type { MockQuestion } from '@/types/firestore';
import { asText } from '@/types/firestore';
import {
    Clock, CheckCircle, XCircle, ArrowRight,
    Trophy, LayoutGrid, Settings2,
    ToggleRight, ToggleLeft, BookOpen,
    CheckSquare, Lightbulb, X
} from 'lucide-react';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';
import RelatedContent from '../components/RelatedContent';
import ExamHubNavigation from '../components/ExamHubNavigation';
import { buildBreadcrumbPath } from '@/features/internal-linking/data/internalLinkingRepository';

// Strict view of the mock test document used by the player.
interface PlayTestData {
    id: string;
    title?: string;
    slug?: string;
    durationMinutes?: number;
    negativeMarking?: number;
    totalQuestions?: number;
    questions?: MockQuestion[];
}

interface OptionTheme {
    border: string;
    bg: string;
    active: string;
    text: string;
    icon: string;
}

// ================================================
// 🔥 404 SCREEN - Component ke BAHAR (sahi jagah)
// ================================================
const TestNotFoundScreen = () => {
    useEffect(() => {
        let meta = document.querySelector('meta[name="robots"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute("name", "robots");
            document.head.appendChild(meta);
        }
        meta.setAttribute("content", "noindex, nofollow");
        document.title = "Test Not Found | StudyGyaan";
    }, []);

    return (
        <div className="h-screen flex items-center justify-center font-bold text-red-500 bg-slate-50 text-2xl">
            404 - Test Not Found!
        </div>
    );
};

// ================================================
// 🎮 MAIN COMPONENT
// ================================================
const PlayMockTest = () => {
    const { id } = useParams();           // ✅ Step 1: id lo
    const navigate = useNavigate();

    // ✅ Step 2: Hook ANDAR call karo, id milne ke baad
    const { test: loadedTest, loading: testLoading } = useMockTest(id);

    // =============== DERIVED DATA ===============
    const testData = loadedTest as PlayTestData | null;
    const questions: MockQuestion[] = useMemo(() => testData?.questions ?? [], [testData]);
    const totalQuestions = testData?.totalQuestions ?? questions.length;
    const loading = testLoading;

    // =============== STATES ===============
    const [testStarted, setTestStarted] = useState(false);
    const [showFullImage, setShowFullImage] = useState(false);
    const [correctMarks, setCorrectMarks] = useState(2);
    const [negOverride, setNegOverride] = useState<number | null>(null);
    const [isNegEnabled, setIsNegEnabled] = useState(true);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [result, setResult] = useState({
        score: 0, correct: 0, wrong: 0, skipped: 0
    });

    // Test ki default negative marking (user start screen par badal sakta hai)
    const negativeMarks = negOverride ?? (testData?.negativeMarking ?? 0.5);

    // =============== OPTION THEMES ===============
    const optionThemes: OptionTheme[] = [
        { 
            border: 'border-blue-400', bg: 'bg-blue-50', 
            active: 'bg-blue-600', text: 'text-blue-900', 
            icon: 'bg-blue-100 text-blue-600' 
        },
        { 
            border: 'border-purple-400', bg: 'bg-purple-50', 
            active: 'bg-purple-600', text: 'text-purple-900', 
            icon: 'bg-purple-100 text-purple-600' 
        },
        { 
            border: 'border-amber-400', bg: 'bg-amber-50', 
            active: 'bg-amber-600', text: 'text-amber-900', 
            icon: 'bg-amber-100 text-amber-600' 
        },
        { 
            border: 'border-emerald-400', bg: 'bg-emerald-50', 
            active: 'bg-emerald-600', text: 'text-emerald-900', 
            icon: 'bg-emerald-100 text-emerald-600' 
        }
    ];

    // =============== EFFECT: DOCUMENT TITLE ===============
    useEffect(() => {
        if (loadedTest) {
            document.title = `Play: ${asText(loadedTest.title)} | StudyGyaan`;
        }
    }, [loadedTest]);

    // =============== EFFECT: TIMER ===============
    useEffect(() => {
        if (!testStarted || isSubmitted || timeLeft <= 0) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [testStarted, isSubmitted, timeLeft]);

    // =============== FUNCTIONS ===============

    // Time format: 3600 => 60:00
    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Option select
    const handleOptionSelect = (optionIndex: number) => {
        setSelectedAnswers(prev => ({
            ...prev,
            [currentQIndex]: optionIndex
        }));
    };

    // Test submit
    const submitTest = useCallback(() => {
        if (questions.length === 0) return;

        let correct = 0;
        let wrong = 0;
        let skipped = 0;
        let score = 0;

        questions.forEach((q, idx) => {
            const userAns = selectedAnswers[idx];
            if (userAns === undefined) {
                skipped++;
            } else if (userAns === q.correctOption) {
                correct++;
                score += correctMarks;
            } else {
                wrong++;
                if (isNegEnabled) score -= negativeMarks;
            }
        });

        setResult({
            score: Math.round(score * 100) / 100,
            correct,
            wrong,
            skipped
        });
        setIsSubmitted(true);
    }, [questions, selectedAnswers, correctMarks, isNegEnabled, negativeMarks]);

    // Timer 0 hone par auto submit (async callback — sync setState-in-effect se bachne ke liye)
    useEffect(() => {
        if (timeLeft !== 0 || !testStarted || isSubmitted || !testData) return;
        const t = setTimeout(() => submitTest(), 0);
        return () => clearTimeout(t);
    }, [timeLeft, testStarted, isSubmitted, testData, submitTest]);

    // Test start karte waqt timer seed
    const startTest = () => {
        setTimeLeft((testData?.durationMinutes || 60) * 60);
        setTestStarted(true);
    };

    // =============== QUIZ SCHEMA ===============
    const quizSchema = testData ? {
        "@context": "https://schema.org",
        "@type": "Quiz",
        "name": testData.title,
        "description": `Free mock test: ${testData.title}. Practice ${totalQuestions} questions.`,
        "hasPart": questions.slice(0, 10).map((q) => {
            const opts = q.options ?? [];
            return {
                "@type": "Question",
                "name": q.qText || "Refer to diagram",
                "eduQuestionType": "Multiple choice",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": opts[q.correctOption ?? 0] || "Correct Option"
                },
                "suggestedAnswer": opts.map((opt) => ({
                    "@type": "Answer",
                    "text": opt
                }))
            };
        })
    } : null;

    // ================================================
    // SCREENS
    // ================================================

    // --- Loading Screen ---
    if (loading) return (
        <div className="h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white font-hindi">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-black text-xs uppercase tracking-widest">Initialising Terminal...</p>
        </div>
    );

    // --- 404 Screen ---
    if (!testData) return <TestNotFoundScreen />;

    // ================================================
    // START SCREEN
    // ================================================
    if (!testStarted) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-hindi overflow-y-auto">
                <SEO 
                    customTitle={`${testData.title} - Ready to Play | StudyGyaan`}
                    customDescription={`Attempt this free '${testData.title}' mock test. Total ${testData.totalQuestions} questions.`}
                    customUrl={`https://studygyaan.in/test/${testData.slug || testData.id || id}`}
                    customImage="https://studygyaan.in/og-image.jpg"
                />
                <script 
                    type="application/ld+json" 
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(quizSchema) }} 
                />

                <div className="bg-white max-w-xl w-full rounded-[40px] shadow-2xl overflow-hidden border-2 border-indigo-50">
                    {/* Header */}
                    <div className="bg-slate-900 p-8 text-white text-center">
                        <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3 animate-bounce" />
                        <h1 className="text-2xl font-black mb-1 uppercase tracking-tight">
                            {testData.title}
                        </h1>
                        <div className="flex justify-center gap-3 mt-4 text-[9px] font-black uppercase tracking-wider">
                            <span className="bg-white/10 px-4 py-1.5 rounded-xl">
                                <BookOpen size={12} className="inline mr-1"/> {totalQuestions} Questions
                            </span>
                            <span className="bg-white/10 px-4 py-1.5 rounded-xl">
                                <Clock size={12} className="inline mr-1"/> {testData.durationMinutes} Min
                            </span>
                        </div>
                    </div>

                    {/* Rules Setup */}
                    <div className="p-8 space-y-6">
                        <section className="bg-blue-50/50 p-6 rounded-[32px] border-2 border-blue-100 space-y-4">
                            <h2 className="font-black text-blue-900 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                                <Settings2 size={16}/> Rules Setup
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Correct Marks */}
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                                        Per Correct Mark (+)
                                    </label>
                                    <input 
                                        type="number" 
                                        value={correctMarks} 
                                        onChange={(e) => setCorrectMarks(Number(e.target.value))} 
                                        className="w-full p-3 rounded-2xl bg-white border-2 border-blue-100 font-black text-xl text-blue-700 outline-none" 
                                    />
                                </div>
                                {/* Negative Marks */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase">
                                            Neg Mark (-)
                                        </label>
                                        <button onClick={() => setIsNegEnabled(!isNegEnabled)}>
                                            {isNegEnabled 
                                                ? <ToggleRight className="text-blue-600" size={28}/> 
                                                : <ToggleLeft className="text-slate-300" size={28}/>
                                            }
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.25"
                                        disabled={!isNegEnabled}
                                        value={negativeMarks}
                                        onChange={(e) => setNegOverride(Number(e.target.value))}
                                        className={`w-full p-3 rounded-2xl border-2 font-black text-xl outline-none transition-all
                                            ${isNegEnabled 
                                                ? 'bg-white border-red-100 text-red-600 focus:border-red-500' 
                                                : 'bg-slate-100 border-transparent text-slate-300'}`} 
                                    />
                                </div>
                            </div>
                        </section>

                        <button
                            onClick={startTest}
                            className="w-full bg-blue-600 hover:bg-slate-900 text-white font-black py-5 rounded-[28px] text-lg transition-all shadow-xl active:scale-95 uppercase tracking-widest"
                        >
                            Start Examination 🚀
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ================================================
    // RESULT SCREEN
    // ================================================
    if (isSubmitted) {
        return (
            <div className="min-h-screen bg-slate-50 py-10 px-4 font-hindi overflow-y-auto">
                <SEO 
                    customTitle={`Result: ${testData.title} | StudyGyaan`}
                    customDescription={`Check your score for '${testData.title}'.`}
                    customUrl={`https://studygyaan.in/test/${testData.slug || testData.id || id}`}
                    customImage="https://studygyaan.in/og-image.jpg"
                />
                <div className="max-w-4xl mx-auto space-y-10 pb-20">
                    
                    {/* Score Card */}
                    <section className="bg-white rounded-[50px] shadow-2xl p-8 text-center border-b-[12px] border-blue-600 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"></div>
                        <Trophy className="mx-auto text-yellow-400 mb-4 animate-pulse" size={50}/>
                        <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter">
                            Performance Result
                        </h1>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8 font-black text-center">
                            <div className="bg-blue-600 p-6 rounded-[35px] text-white shadow-lg">
                                <p className="text-[9px] opacity-60 uppercase mb-1 tracking-widest">SCORE</p>
                                <p className="text-4xl font-black">{result.score}</p>
                            </div>
                            <div className="bg-emerald-50 p-6 rounded-[35px] text-emerald-700 border border-emerald-100">
                                <p className="text-[9px] uppercase mb-1">CORRECT</p>
                                <p className="text-3xl font-black">{result.correct}</p>
                            </div>
                            <div className="bg-red-50 p-6 rounded-[35px] text-red-700 border border-red-100">
                                <p className="text-[9px]">WRONG</p>
                                <p className="text-3xl font-black">{result.wrong}</p>
                            </div>
                            <div className="bg-slate-100 p-6 rounded-[35px] text-slate-500 border border-slate-200">
                                <p className="text-[9px]">SKIPPED</p>
                                <p className="text-3xl font-black">{result.skipped}</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => navigate('/mock-tests')} 
                            className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                        >
                            BACK TO PORTAL
                        </button>
                    </section>

                    {/* Answer Analysis */}
                    <section className="space-y-8">
                        <h2 className="text-2xl font-black text-slate-800 ml-4 flex items-center gap-3 tracking-tight">
                            <CheckSquare className="text-blue-600"/> Answer Analysis
                        </h2>

                        {questions.map((q, idx) => {
                            const userAns = selectedAnswers[idx];
                            const isCorrect = userAns === q.correctOption;
                            return (
                                <article 
                                    key={idx} 
                                    className={`bg-white p-8 rounded-[40px] border-2 transition-all 
                                        ${userAns === undefined 
                                            ? 'border-slate-100' 
                                            : isCorrect 
                                                ? 'border-emerald-400 bg-emerald-50/10' 
                                                : 'border-red-400 bg-red-50/10'}`}
                                >
                                    {/* Question */}
                                    <div className="flex justify-between items-start mb-6">
                                        <h3 className="font-black text-slate-800 text-xl pr-10">
                                            Q{idx + 1}. {q.qText || "Refer diagram"}
                                        </h3>
                                        {userAns !== undefined && (
                                            isCorrect 
                                                ? <CheckCircle className="text-emerald-500 shrink-0" size={32}/> 
                                                : <XCircle className="text-red-500 shrink-0" size={32}/>
                                        )}
                                    </div>

                                    {/* Question Image */}
                                    {q.qImage && (
                                        <img 
                                            src={q.qImage} 
                                            className="max-h-[300px] object-contain rounded-3xl mb-6 border-4 border-white shadow-md" 
                                            alt="Question Diagram" 
                                        />
                                    )}

                                    {/* Options */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                                        {(q.options ?? []).map((opt, oIdx) => (
                                            <div 
                                                key={oIdx} 
                                                className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border 
                                                    ${q.correctOption === oIdx 
                                                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' 
                                                        : userAns === oIdx 
                                                            ? 'bg-red-500 text-white border-red-500 shadow-md' 
                                                            : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                            >
                                                <span className="w-7 h-7 rounded-lg bg-black/10 flex items-center justify-center font-black">
                                                    {String.fromCharCode(65 + oIdx)}
                                                </span>
                                                <span>{opt}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Logic */}
                                    {(q.qLogic || q.qLogicImage) && (
                                        <div className="mt-6 bg-blue-600 p-8 rounded-[35px] text-white shadow-xl relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-125 duration-700"></div>
                                            <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-[0.2em] mb-4 text-blue-100">
                                                <Lightbulb size={18} className="text-yellow-400 animate-pulse"/> Logic Explanation
                                            </div>
                                            {q.qLogic && (
                                                <p className="font-bold text-base leading-relaxed mb-6 whitespace-pre-wrap font-hindi">
                                                    {q.qLogic}
                                                </p>
                                            )}
                                            {q.qLogicImage && (
                                                <div className="bg-white p-3 rounded-2xl w-fit shadow-lg border border-indigo-100">
                                                    <img 
                                                        src={q.qLogicImage} 
                                                        className="max-h-[400px] rounded-xl" 
                                                        alt="logic diagram" 
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </section>
                </div>
            </div>
        );
    }

    // ================================================
    // PLAY SCREEN
    // ================================================
    const question: MockQuestion = questions[currentQIndex] ?? {};
    const sections: string[] = [
        ...new Set(questions.map(q => asText(q.subject) || "General Awareness"))
    ];
    const currentSection = asText(question.subject) || "General Awareness";

    return (
        <div className="h-screen max-h-screen bg-slate-50 flex flex-col font-hindi overflow-hidden selection:bg-blue-600 selection:text-white">
            <SEO 
                customTitle={`Playing: ${testData.title} | StudyGyaan 2026`}
                customDescription={`Attempting live exam: ${testData.title}. Total ${testData.totalQuestions} questions.`}
                customUrl={`https://studygyaan.in/test/${testData.slug || testData.id || id}`}
                customImage="https://studygyaan.in/og-image.jpg"
            />

            {/* ===== HEADER ===== */}
            <header className="bg-slate-900 border-b border-slate-800 px-4 py-1.5 flex justify-between items-center z-30 shadow-xl shrink-0 h-12">
                {/* Logo + Title */}
                <div className="flex items-center gap-2 text-white">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 bg-blue-600 rounded-lg flex items-center justify-center font-black text-[10px] sm:text-xs rotate-3 shadow-lg">
                        SG
                    </div>
                    <div className="leading-tight">
                        <div className="font-black text-[7px] sm:text-[9px] uppercase tracking-tighter truncate max-w-[80px] sm:max-w-[120px]">
                            {testData.title}
                        </div>
                        <p className="text-[5px] sm:text-[6px] font-black text-blue-400 tracking-widest uppercase">Portal</p>
                    </div>
                </div>

                {/* Timer */}
                <div className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl font-mono text-lg sm:text-2xl font-black shadow-inner border-2 
                    ${timeLeft < 300 
                        ? 'bg-red-600 text-white border-white animate-pulse' 
                        : 'bg-white text-slate-900 border-blue-600'}`}>
                    <Clock size={14} className={timeLeft < 300 ? 'animate-spin' : ''}/>
                    {formatTime(timeLeft)}
                </div>

                {/* Submit Button */}
                <button 
                    onClick={() => { 
                        if(window.confirm('फाइनल सबमिट करें?')) submitTest(); 
                    }} 
                    className="bg-emerald-500 hover:bg-white hover:text-emerald-600 text-white px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg font-black text-[7px] sm:text-[8px] shadow-lg transition-all active:scale-95 uppercase border-b-2 sm:border-b-4 border-emerald-700"
                >
                    SUBMIT
                </button>
            </header>

            {/* ===== SECTION NAV ===== */}
            <nav className="bg-white border-b border-slate-200 px-2 sm:px-6 py-1.5 sm:py-2 flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar shrink-0 z-20">
                {sections.map((section, idx) => (
                    <button
                        key={idx}
                        onClick={() => {
                            const firstIdx = questions.findIndex(
                                q => (asText(q.subject) || "General Awareness") === section
                            );
                            setCurrentQIndex(firstIdx);
                        }}
                        className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap shadow-sm
                            ${currentSection === section 
                                ? 'bg-blue-600 text-white ring-2 sm:ring-4 ring-blue-50' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'}`}
                    >
                        {section}
                    </button>
                ))}
            </nav>

            {/* ===== MAIN CONTENT ===== */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* Question Area */}
                <main className="flex-1 overflow-y-auto px-2 sm:px-6 py-2 flex flex-col items-start h-full no-scrollbar border-r border-slate-100">
                    <div className="w-full flex flex-col">
                        
                        {/* Counter + Marks */}
                        <div className="mb-2 flex justify-between items-center px-1 shrink-0">
                            <span className="bg-slate-900 text-white px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[7px] sm:text-[8px] font-black uppercase tracking-widest shadow-md">
                                Q {currentQIndex + 1} / {totalQuestions}
                            </span>
                            <div className="flex gap-1 sm:gap-2 text-[6px] sm:text-[7px] font-black">
                                <span className="bg-white border border-emerald-100 px-1.5 py-0.5 rounded-md sm:rounded-lg text-emerald-600 shadow-sm">
                                    +{correctMarks}
                                </span>
                                <span className="bg-white border border-red-50 px-1.5 py-0.5 rounded-md sm:rounded-lg text-red-500 shadow-sm">
                                    -{isNegEnabled ? negativeMarks : 0}
                                </span>
                            </div>
                        </div>

                        {/* Question Box */}
                        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-3 sm:p-5 rounded-2xl sm:rounded-[25px] shadow-xl border-2 sm:border-4 border-white relative overflow-hidden w-full md:w-[85%] lg:w-[70%] shrink-0 mx-auto">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl"></div>
                            <h2 className="text-xs sm:text-lg font-black text-white leading-snug relative z-10 text-left mb-2">
                                {question.qText || "Refer diagram below:"}
                            </h2>
                            
                            {/* Question Image with Zoom */}
                            {question.qImage && (
                                <div 
                                    onClick={() => setShowFullImage(true)}
                                    className="mt-1 rounded-xl cursor-zoom-in border-2 border-white/20 bg-white p-0.5 relative z-10 w-fit mx-auto overflow-hidden group/img"
                                >
                                    <img 
                                        src={question.qImage} 
                                        alt="question detail" 
                                        className="max-h-[140px] sm:max-h-[180px] w-auto object-contain mx-auto transition-transform group-hover/img:scale-105" 
                                    />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                        <span className="text-[7px] text-white font-black bg-black/40 px-2 py-1 rounded-lg uppercase tracking-widest">
                                            Click to Zoom
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Options */}
                        <div className="flex flex-col items-start gap-1 sm:gap-1.5 mt-3 w-full md:w-[85%] lg:w-[70%] mx-auto">
                            {(question.options ?? []).map((opt, idx) => {
                                const theme = optionThemes[idx] ?? optionThemes[0];
                                const isSelected = selectedAnswers[currentQIndex] === idx;
                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => handleOptionSelect(idx)}
                                        className={`text-left p-1 sm:p-2 rounded-lg sm:rounded-xl border-2 transition-all duration-300 flex items-center gap-2 active:scale-95 shadow-sm w-full
                                            ${isSelected 
                                                ? `${theme.active} border-white shadow-lg` 
                                                : `${theme.bg} ${theme.border} border-opacity-40`}`}
                                    >
                                        <div className={`w-5 h-5 sm:w-7 sm:h-7 rounded-md sm:rounded-lg border flex items-center justify-center font-black text-[8px] sm:text-xs transition-all shrink-0
                                            ${isSelected 
                                                ? 'bg-white text-slate-900 border-white' 
                                                : `${theme.icon} border-white`}`}>
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        <span className={`font-black text-[9px] sm:text-[13px] leading-tight 
                                            ${isSelected ? 'text-white' : theme.text}`}>
                                            {opt}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Prev / Next */}
                        <div className="flex justify-between items-center gap-2 sm:gap-4 py-4 shrink-0 px-1 mt-auto w-full md:w-[85%] lg:w-[70%] mx-auto">
                            <button 
                                onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))} 
                                disabled={currentQIndex === 0} 
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-black text-[7px] text-slate-400 hover:text-blue-600 shadow-sm transition-all flex items-center gap-1 uppercase disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setCurrentQIndex(prev => Math.min(totalQuestions - 1, prev + 1))}
                                disabled={currentQIndex === totalQuestions - 1}
                                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-black hover:bg-blue-600 shadow-lg flex items-center gap-1 active:scale-90 text-[7px] uppercase tracking-wider transition-all disabled:opacity-40"
                            >
                                Next <ArrowRight size={10}/>
                            </button>
                        </div>
                    </div>
                </main>

                {/* Navigator Sidebar */}
                <aside className="w-[85px] sm:w-[240px] xl:w-[280px] bg-white border-l border-slate-200 flex flex-col p-1.5 sm:p-4 z-20 shadow-xl shrink-0 h-full overflow-hidden">
                    <div className="flex items-center gap-1 sm:gap-2 mb-2 border-b pb-1 sm:pb-2 shrink-0">
                        <LayoutGrid size={10} className="text-blue-600 sm:w-4 sm:h-4"/>
                        <h3 className="font-black text-slate-900 text-[5px] sm:text-[9px] uppercase tracking-tight">
                            Navigator
                        </h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2 overflow-y-auto pr-0.5 no-scrollbar h-fit max-h-[70%] py-1 content-start">
                        {questions.map((_, i) => (
                            <button 
                                key={i}
                                onClick={() => setCurrentQIndex(i)}
                                className={`h-6 w-6 sm:h-8 sm:w-8 rounded-md font-black text-[7px] sm:text-[9px] transition-all duration-300 flex items-center justify-center transform active:scale-90 shadow-sm 
                                    ${currentQIndex === i 
                                        ? 'ring-2 ring-blue-100 border-2 border-blue-600 bg-white' 
                                        : selectedAnswers[i] !== undefined 
                                            ? 'bg-emerald-500 text-white border-emerald-400' 
                                            : 'bg-slate-50 text-slate-300 border border-slate-200 hover:bg-white'}`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <div className="mt-2 bg-slate-900 p-1.5 sm:p-3.5 rounded-lg sm:rounded-[22px] text-white shadow-lg shrink-0">
                        <button 
                            onClick={() => { 
                                if(window.confirm('Final Submit?')) submitTest(); 
                            }} 
                            className="w-full py-1.5 sm:py-3 bg-blue-600 hover:bg-emerald-500 text-white rounded-md sm:rounded-[12px] font-black shadow-xl transition-all active:scale-95 text-[5px] sm:text-[8px] tracking-widest uppercase"
                        >
                            FINALIZE
                        </button>
                    </div>
                </aside>
            </div>

            {/* ===== ZOOM MODAL ===== */}
            {showFullImage && question.qImage && (
                <div 
                    className="fixed inset-0 z-[100] bg-slate-950/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setShowFullImage(false)}
                >
                    <button className="absolute top-6 right-6 text-white hover:bg-white/10 p-2 rounded-full transition-colors">
                        <X size={32}/>
                    </button>
                    <div 
                        className="max-w-5xl max-h-[85vh] relative" 
                        onClick={e => e.stopPropagation()}
                    >
                        <img 
                            src={question.qImage} 
                            alt="full view diagram" 
                            className="w-full h-full object-contain rounded-2xl shadow-2xl border-2 border-white/10" 
                        />
                        <div className="mt-4 text-center">
                            <p className="text-white font-black text-xs uppercase tracking-widest bg-blue-600/50 inline-block px-4 py-2 rounded-full">
                                Question Diagram View
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Scrollbar Hide */}
            <style dangerouslySetInnerHTML={{__html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};

export default PlayMockTest;