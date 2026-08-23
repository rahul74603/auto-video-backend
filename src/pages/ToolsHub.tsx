/**
 * ToolsHub — 🛠️ SARKARI TOOLS (asli working tools, koi 404 nahi!)
 * =================================================================
 * Form-filling students ke roz ke kaam:
 *   🖼️ Photo/Signature Resizer (20KB/50KB form-ready)
 *   🗜️ Image Compressor (KB target)
 *   📅 Age Calculator (eligibility check)
 *   💯 Percentage Calculator
 *   🔤 Word Counter
 * Sab 100% browser me — koi upload server nahi, private & fast.
 */
import { useMemo, useRef, useState } from 'react';
import SEO from '@/components/SEO';
import DynamicSidebar from '@/components/DynamicSidebar';
import {
    Wrench, ImageIcon, FileArchive, CalendarDays, Percent, Type,
    Upload, Download, CheckCircle2, XCircle, Sparkles
} from 'lucide-react';

/* ================= IMAGE ENGINE (canvas) ================= */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

function dataUrlKB(dataUrl: string): number {
    return Math.round((dataUrl.length * 3) / 4 / 1024);
}

/** Resize (optional WxH) + compress to target KB (JPEG quality loop) */
async function processImage(
    file: File,
    opts: { width?: number; height?: number; targetKB: number }
): Promise<{ dataUrl: string; kb: number; w: number; h: number }> {
    const img = await loadImage(file);
    let w = opts.width || img.naturalWidth;
    let h = opts.height || img.naturalHeight;

    const canvas = document.createElement('canvas');
    const draw = (cw: number, ch: number) => {
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
    };

    draw(w, h);
    let quality = 0.92;
    let out = canvas.toDataURL('image/jpeg', quality);

    // Quality loop → phir dimension loop (jab tak target KB na mile)
    let guard = 0;
    while (dataUrlKB(out) > opts.targetKB && guard < 25) {
        guard++;
        if (quality > 0.4) {
            quality -= 0.07;
        } else if (!opts.width && !opts.height) {
            w = Math.round(w * 0.85);
            h = Math.round(h * 0.85);
            draw(w, h);
            quality = 0.8;
        } else {
            break;
        }
        out = canvas.toDataURL('image/jpeg', quality);
    }
    return { dataUrl: out, kb: dataUrlKB(out), w: canvas.width, h: canvas.height };
}

/* ================= SHARED UI ================= */
const card = 'bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm p-4 md:p-6';
const label = 'text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1';
const input = 'w-full p-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-blue-500';
const btn = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95';

const ToolShell = ({ id, icon, title, desc, children }: {
    id: string; icon: React.ReactNode; title: string; desc: string; children: React.ReactNode;
}) => (
    <section id={id} className={`${card} scroll-mt-24`}>
        <div className="flex items-start gap-3 mb-4">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">{icon}</div>
            <div>
                <h2 className="font-black text-slate-800 text-sm md:text-lg leading-tight">{title}</h2>
                <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-0.5">{desc}</p>
            </div>
        </div>
        {children}
    </section>
);

/* ================= TOOL 1: PHOTO/SIGN RESIZER ================= */
const PRESETS = [
    { id: 'photo-2050', name: 'Photo 200×230 (20-50 KB)', w: 200, h: 230, kb: 45 },
    { id: 'photo-cm', name: 'Photo 3.5×4.5 cm (413×531)', w: 413, h: 531, kb: 90 },
    { id: 'sign-small', name: 'Signature 140×60 (10-20 KB)', w: 140, h: 60, kb: 18 },
    { id: 'sign-big', name: 'Signature 300×80 (20-50 KB)', w: 300, h: 80, kb: 45 },
];

const PhotoResizer = () => {
    const [file, setFile] = useState<File | null>(null);
    const [preset, setPreset] = useState(PRESETS[0]);
    const [custom, setCustom] = useState({ w: '', h: '', kb: '' });
    const [useCustom, setUseCustom] = useState(false);
    const [result, setResult] = useState<{ dataUrl: string; kb: number; w: number; h: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const run = async () => {
        if (!file) return;
        setBusy(true);
        try {
            const opts = useCustom
                ? { width: Number(custom.w) || undefined, height: Number(custom.h) || undefined, targetKB: Number(custom.kb) || 50 }
                : { width: preset.w, height: preset.h, targetKB: preset.kb };
            setResult(await processImage(file, opts));
        } finally { setBusy(false); }
    };

    return (
        <ToolShell id="photo-resizer" icon={<ImageIcon size={20} />} title="Photo & Signature Resizer"
            desc="Sarkari form ke exact size me photo/sign — SSC, Railway, Police sab ke liye">
            <div className="space-y-3">
                <button onClick={() => fileRef.current?.click()} className={`${btn} bg-blue-50 text-blue-700 hover:bg-blue-100 w-full justify-center border-2 border-dashed border-blue-200 py-4`}>
                    <Upload size={15} /> {file ? file.name.slice(0, 30) : 'Photo/Signature choose karo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />

                <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                        <button key={p.id} onClick={() => { setPreset(p); setUseCustom(false); }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all ${!useCustom && preset.id === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                            {p.name}
                        </button>
                    ))}
                    <button onClick={() => setUseCustom(true)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black border ${useCustom ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        Custom
                    </button>
                </div>

                {useCustom && (
                    <div className="grid grid-cols-3 gap-2">
                        <div><span className={label}>Width px</span><input className={input} type="number" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} placeholder="200" /></div>
                        <div><span className={label}>Height px</span><input className={input} type="number" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} placeholder="230" /></div>
                        <div><span className={label}>Max KB</span><input className={input} type="number" value={custom.kb} onChange={(e) => setCustom({ ...custom, kb: e.target.value })} placeholder="50" /></div>
                    </div>
                )}

                <button onClick={run} disabled={!file || busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 w-full justify-center`}>
                    {busy ? 'Processing...' : '🚀 Resize Karo'}
                </button>

                {result && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                        <img src={result.dataUrl} alt="result" className="h-16 rounded-lg border border-emerald-300 bg-white" />
                        <div className="flex-1 text-[11px] font-black text-emerald-700">
                            ✅ {result.w}×{result.h}px · {result.kb} KB
                        </div>
                        <a href={result.dataUrl} download="studygyaan-photo.jpg" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                            <Download size={14} /> Download
                        </a>
                    </div>
                )}
            </div>
        </ToolShell>
    );
};

/* ================= TOOL 2: IMAGE COMPRESSOR ================= */
const ImageCompressor = () => {
    const [file, setFile] = useState<File | null>(null);
    const [targetKB, setTargetKB] = useState('100');
    const [result, setResult] = useState<{ dataUrl: string; kb: number; w: number; h: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const run = async () => {
        if (!file) return;
        setBusy(true);
        try { setResult(await processImage(file, { targetKB: Number(targetKB) || 100 })); }
        finally { setBusy(false); }
    };

    return (
        <ToolShell id="image-compressor" icon={<FileArchive size={20} />} title="Image Compressor (KB Target)"
            desc="Badi photo ko chhota karo — jitne KB chahiye utne me">
            <div className="space-y-3">
                <button onClick={() => fileRef.current?.click()} className={`${btn} bg-purple-50 text-purple-700 hover:bg-purple-100 w-full justify-center border-2 border-dashed border-purple-200 py-4`}>
                    <Upload size={15} /> {file ? `${file.name.slice(0, 25)} (${Math.round(file.size / 1024)} KB)` : 'Image choose karo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
                <div>
                    <span className={label}>Target Size (KB)</span>
                    <input className={input} type="number" value={targetKB} onChange={(e) => setTargetKB(e.target.value)} />
                </div>
                <button onClick={run} disabled={!file || busy} className={`${btn} bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 w-full justify-center`}>
                    {busy ? 'Compressing...' : '🗜️ Compress Karo'}
                </button>
                {result && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                        <img src={result.dataUrl} alt="result" className="h-16 rounded-lg border border-emerald-300 bg-white" />
                        <div className="flex-1 text-[11px] font-black text-emerald-700">✅ Ab sirf {result.kb} KB</div>
                        <a href={result.dataUrl} download="studygyaan-compressed.jpg" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                            <Download size={14} /> Download
                        </a>
                    </div>
                )}
            </div>
        </ToolShell>
    );
};

/* ================= TOOL 3: AGE CALCULATOR ================= */
const AgeCalculator = () => {
    const [dob, setDob] = useState('');
    const [asOn, setAsOn] = useState(new Date().toISOString().slice(0, 10));
    const [minAge, setMinAge] = useState('18');
    const [maxAge, setMaxAge] = useState('27');

    const result = useMemo(() => {
        if (!dob) return null;
        const d = new Date(dob), a = new Date(asOn);
        if (isNaN(d.getTime()) || isNaN(a.getTime()) || d >= a) return null;
        let years = a.getFullYear() - d.getFullYear();
        let months = a.getMonth() - d.getMonth();
        let days = a.getDate() - d.getDate();
        if (days < 0) { months--; days += new Date(a.getFullYear(), a.getMonth(), 0).getDate(); }
        if (months < 0) { years--; months += 12; }
        const ageDecimal = years + months / 12 + days / 365;
        const min = Number(minAge) || 0, max = Number(maxAge) || 200;
        return { years, months, days, eligible: ageDecimal >= min && ageDecimal <= max };
    }, [dob, asOn, minAge, maxAge]);

    return (
        <ToolShell id="age-calculator" icon={<CalendarDays size={20} />} title="Age Calculator (Eligibility Check)"
            desc="Notification ki cutoff date pe teri exact age + eligible ho ya nahi">
            <div className="grid grid-cols-2 gap-3">
                <div><span className={label}>Date of Birth</span><input className={input} type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
                <div><span className={label}>Age As On (cutoff)</span><input className={input} type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} /></div>
                <div><span className={label}>Min Age</span><input className={input} type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} /></div>
                <div><span className={label}>Max Age</span><input className={input} type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} /></div>
            </div>
            {result && (
                <div className={`mt-3 rounded-xl p-4 border ${result.eligible ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="font-black text-slate-800 text-sm md:text-base">
                        Teri age: {result.years} saal, {result.months} mahine, {result.days} din
                    </p>
                    <p className={`mt-1 font-black text-xs md:text-sm flex items-center gap-1.5 ${result.eligible ? 'text-emerald-600' : 'text-red-600'}`}>
                        {result.eligible ? <><CheckCircle2 size={14} /> ELIGIBLE HO! Apply kar sakte ho 🎉</> : <><XCircle size={14} /> Is age-limit me eligible nahi</>}
                    </p>
                </div>
            )}
        </ToolShell>
    );
};

/* ================= TOOL 4: PERCENTAGE CALCULATOR ================= */
const PercentageCalculator = () => {
    const [obtained, setObtained] = useState('');
    const [total, setTotal] = useState('');
    const pct = useMemo(() => {
        const o = Number(obtained), t = Number(total);
        if (!t || t <= 0 || o < 0) return null;
        return Math.round((o / t) * 10000) / 100;
    }, [obtained, total]);

    return (
        <ToolShell id="percentage-calculator" icon={<Percent size={20} />} title="Percentage Calculator"
            desc="Marks se percentage — 10th/12th/graduation sab ke liye">
            <div className="grid grid-cols-2 gap-3">
                <div><span className={label}>Obtained Marks</span><input className={input} type="number" value={obtained} onChange={(e) => setObtained(e.target.value)} placeholder="450" /></div>
                <div><span className={label}>Total Marks</span><input className={input} type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="500" /></div>
            </div>
            {pct !== null && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-blue-700">{pct}%</p>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-1">
                        {pct >= 60 ? '🎉 First Division!' : pct >= 50 ? 'Second Division' : pct >= 33 ? 'Pass' : 'Aur mehnat chahiye 💪'}
                    </p>
                </div>
            )}
        </ToolShell>
    );
};

/* ================= TOOL 5: WORD COUNTER ================= */
const WordCounter = () => {
    const [text, setText] = useState('');
    const stats = useMemo(() => ({
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        chars: text.length,
        charsNoSpace: text.replace(/\s/g, '').length,
    }), [text]);

    return (
        <ToolShell id="word-counter" icon={<Type size={20} />} title="Word & Character Counter"
            desc="Essay/letter writing practice — word limit check karo">
            <textarea className={`${input} h-32 resize-none font-medium`} value={text}
                onChange={(e) => setText(e.target.value)} placeholder="Yahan likho ya paste karo..." />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {[['Words', stats.words], ['Characters', stats.chars], ['No Spaces', stats.charsNoSpace]].map(([l, v]) => (
                    <div key={l as string} className="bg-slate-50 rounded-xl p-2.5">
                        <p className="text-lg font-black text-slate-800">{v}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
                    </div>
                ))}
            </div>
        </ToolShell>
    );
};

/* ================= HUB PAGE ================= */
export const TOOL_LINKS = [
    { id: 'photo-resizer', label: '🖼️ Photo/Sign Resizer' },
    { id: 'image-compressor', label: '🗜️ Image Compressor' },
    { id: 'age-calculator', label: '📅 Age Calculator' },
    { id: 'percentage-calculator', label: '💯 Percentage Calculator' },
    { id: 'word-counter', label: '🔤 Word Counter' },
];

const ToolsHub = () => (
    <div className="bg-slate-50 min-h-screen py-4 md:py-8">
        <SEO
            customTitle="Sarkari Tools: Free Photo Resizer, Age Calculator & More | StudyGyaan"
            customDescription="Free sarkari form tools — photo/signature resizer (20KB/50KB), image compressor, age eligibility calculator, percentage calculator. 100% free, browser me hi."
        />
        <div className="max-w-6xl mx-auto px-3 md:px-4">
            {/* Header */}
            <div className="bg-gradient-to-br from-fuchsia-700 via-purple-800 to-indigo-900 rounded-2xl md:rounded-[2rem] p-5 md:p-8 text-white mb-5 md:mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><Wrench size={110} /></div>
                <p className="text-yellow-300 font-black text-[10px] md:text-xs uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <Sparkles size={12} /> 100% Free · No Login · Browser Me Hi
                </p>
                <h1 className="text-lg md:text-3xl font-black leading-tight">🛠️ Sarkari Tools — Form Bharne Ke Saare Tools</h1>
                <p className="mt-2 text-purple-100 text-[11px] md:text-sm font-bold">
                    Photo resize, age check, percentage — sab ek jagah. Files upload NAHI hoti, sab tere phone me hi process hota hai 🔒
                </p>
                {/* Quick jump chips */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {TOOL_LINKS.map((t) => (
                        <a key={t.id} href={`#${t.id}`} className="px-3 py-1.5 bg-white/10 hover:bg-white/25 border border-white/20 rounded-xl text-[10px] md:text-xs font-black transition-all">
                            {t.label}
                        </a>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-8">
                <div className="lg:col-span-2 space-y-5">
                    <PhotoResizer />
                    <ImageCompressor />
                    <AgeCalculator />
                    <PercentageCalculator />
                    <WordCounter />
                    <p className="text-[10px] font-bold text-slate-400 bg-white rounded-xl border border-slate-100 p-3">
                        🔒 Privacy: Saare tools 100% browser me chalte hain — teri photo/data kisi server pe NAHI jata. · Aur naye tools jald aa rahe hain!
                    </p>
                </div>
                <aside className="space-y-4">
                    <DynamicSidebar />
                </aside>
            </div>
        </div>
    </div>
);

export default ToolsHub;
