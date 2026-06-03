import { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Send, Loader2, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "What did I do today?",
  "What do I need to do tomorrow?",
  "When is my next appointment?",
  "Who is my emergency contact?",
];

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/chat").then(({ data }) => setMessages(data)).finally(() => setReady(true));
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", message: q, id: `t-${Date.now()}` }]);
    setLoading(true);
    try {
      const { data } = await api.post("/chat", { message: q });
      setMessages((m) => [...m, { role: "assistant", message: data.answer, id: `a-${Date.now()}` }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", message: "I'm having a little trouble right now. Please try again in a moment.", id: `e-${Date.now()}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mm-fade-up flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }} data-testid="assistant-page">
      <PatientPageHeader title="Ask My Assistant" subtitle="I can answer using what's saved for you." />

      <div className="flex-1 space-y-4 overflow-y-auto mm-scrollbar pb-4" data-testid="chat-messages">
        {ready && messages.length === 0 && (
          <div className="rounded-3xl bg-emerald-50 border-2 border-emerald-200 p-6 flex gap-3">
            <Sparkles className="w-7 h-7 text-emerald-600 shrink-0" />
            <p className="text-lg text-stone-700">Hello! Ask me anything about your day, reminders, people, or appointments.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-3xl px-5 py-3 text-lg leading-relaxed ${
              m.role === "user" ? "bg-sky-600 text-white rounded-br-lg" : "bg-white border-2 border-stone-200 rounded-bl-lg"}`}>
              {m.message}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border-2 border-stone-200 rounded-3xl rounded-bl-lg px-5 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="text-base border border-stone-300 rounded-full px-4 py-2 hover:border-sky-400 hover:bg-sky-50 transition-colors" data-testid="chat-suggestion">
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="sticky bottom-0 bg-stone-50 pt-2 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" className="h-14 rounded-2xl text-lg" data-testid="chat-input" />
        <Button type="submit" disabled={loading} className="h-14 w-14 rounded-2xl bg-sky-600 hover:bg-sky-700 shrink-0" data-testid="chat-send-btn">
          <Send className="w-6 h-6" />
        </Button>
      </form>
    </div>
  );
}
