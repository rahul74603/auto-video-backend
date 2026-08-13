import { useState, useRef, useEffect } from "react";
import { ARTICLE_API_BASE } from "@/features/ai-articles/data/aiArticleRepository";

/**
 * 🤖 StudyGyaan AI Sathi — floating RAG assistant widget.
 *
 * Ye widget backend ke Vertex AI Agent Builder endpoints ko call karta hai:
 *   GET  {API}/vertex/health   → config + credit status
 *   POST {API}/vertex/chat     → grounded conversational answer
 *
 * Vertex configured nahi ho to bhi ye gracefully fail hota hai (kuch nahi
 * toota) — user ko bas ek chhota "unavailable" note dikhta hai.
 */

type Msg = { role: "user" | "ai"; text: string };

const API = ARTICLE_API_BASE;

export default function StudyGyaanAIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [convId, setConvId] = useState("");
  const [sources, setSources] = useState<{ title?: string; uri?: string; rank?: number }[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Health check — Vertex configured hai ya nahi (koi billing nahi hoti)
    fetch(`${API}/vertex/health`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setReady(Boolean(d?.success && d?.vertex?.configured)))
      .catch(() => setReady(false));
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    setSources([]);
    try {
      const res = await fetch(`${API}/vertex/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.success) {
        const hint = data?.code === "VERTEX_NOT_CONFIGURED"
          ? "AI Sathi abhi setup nahi hai. Jaldi hi aa raha hai."
          : data?.error || "Abhi kuch reply nahi aa paya.";
        setMessages((m) => [...m, { role: "ai", text: hint }]);
      } else {
        setMessages((m) => [...m, { role: "ai", text: data.reply || "..." }]);
        if (data.conversationId) setConvId(data.conversationId);
        if (Array.isArray(data.sources) && data.sources.length) setSources(data.sources);
      }
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "AI Sathi is waqt unavailable hai. Baad me try karo." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        aria-label="StudyGyaan AI Sathi"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-2xl flex items-center justify-center hover:bg-indigo-700 transition"
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[92vw] max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: "min(70vh, 520px)" }}>
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white">
            <span className="font-semibold">StudyGyaan AI Sathi</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/20">
              {ready === true ? "● Live" : ready === false ? "Setup pending" : "…"}
            </span>
          </div>

          <div ref={boxRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500 text-center mt-6">
                Namaste! 🙏 Jobs, syllabus ya StudyGyaan content ke baare me poochhiye.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] text-sm whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-2xl px-3 py-2">Soch raha hoon…</div>
              </div>
            )}
          </div>

          {sources.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 bg-white">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Sources</p>
              <div className="space-y-0.5">
                {sources.map((s, i) => (
                  <a key={i} href={s.uri || "#"} target="_blank" rel="noreferrer" className="block text-xs text-indigo-600 hover:underline truncate">
                    {s.title || s.uri}
                  </a>
                ))}
              </div>
            </div>
          )}

          <form
            className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-2"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message likhiye…"
              className="flex-1 text-sm border border-gray-300 rounded-full px-3 py-2 outline-none focus:border-indigo-500"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-indigo-600 text-white h-9 w-9 flex items-center justify-center disabled:opacity-40">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
