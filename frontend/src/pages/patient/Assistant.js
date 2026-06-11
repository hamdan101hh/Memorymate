import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Send, Loader2, Sparkles, BookHeart, Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";

const SUGGESTIONS = [
  "What did I do today?",
  "What do I need to do tomorrow?",
  "When is my next appointment?",
  "Who is my emergency contact?",
];

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [sessionNote, setSessionNote] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef(null);

  const load = () => {
    api.get("/chat").then(({ data }) => {
      const list = Array.isArray(data) ? data : data.messages || [];
      setMessages(list);
      setSessionNote(data.session_note || "Chat clears after 24 hours unless you save something.");
    }).finally(() => setReady(true));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", message: q, id: `t-${Date.now()}` }]);
    setLoading(true);
    try {
      const { data } = await api.post("/chat", { message: q });
      setMessages((m) => [...m, { role: "assistant", message: data.answer, id: data.message_id || `a-${Date.now()}` }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", message: "I'm having a little trouble right now. Please try again in a moment.", id: `e-${Date.now()}` }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      await api.delete("/chat");
      setMessages([]);
      toast.success("Chat cleared");
    } catch {
      toast.error("Could not clear chat");
    }
  };

  const saveToMemory = async (m) => {
    try {
      await api.post("/chat/save-memory", { message_id: m.id, message: m.message });
      toast.success("Saved to Memory Book");
    } catch {
      toast.error("Could not save");
    }
  };

  const saveAsReminder = async (m) => {
    try {
      await api.post("/chat/save-reminder", { message_id: m.id, message: m.message });
      toast.success("Saved as reminder");
    } catch {
      toast.error("Could not save reminder");
    }
  };

  return (
    <div className="mm-fade-up flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }} data-testid="assistant-page">
      <PatientPageHeader title="Ask My Assistant" subtitle="Answers from your saved MemoryMate data only." />

      <p className="text-sm text-stone-500 mb-3" data-testid="chat-expiry-note">{sessionNote}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={clearChat} className="rounded-xl" data-testid="clear-chat-btn">
          <Trash2 className="w-4 h-4 mr-1" /> Clear chat now
        </Button>
        <Link to="/patient/reminders"><Button size="sm" variant="outline" className="rounded-xl" data-testid="add-reminder-link">Add reminder</Button></Link>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto mm-scrollbar pb-4" data-testid="chat-messages">
        {ready && messages.length === 0 && (
          <div className="rounded-3xl bg-emerald-50 border-2 border-emerald-200 p-6 flex gap-3">
            <Sparkles className="w-7 h-7 text-emerald-600 shrink-0" />
            <p className="text-lg text-stone-700">Hello! Ask me about your saved reminders, people, or appointments. If I don't know, I'll say so.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[85%] rounded-3xl px-5 py-3 text-lg leading-relaxed ${
              m.role === "user" ? "bg-sky-600 text-white rounded-br-lg" : "bg-white border-2 border-stone-200 rounded-bl-lg"}`}>
              {m.message}
            </div>
            {m.role === "assistant" && (
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => saveToMemory(m)} className="text-xs text-sky-700 font-medium flex items-center gap-1" data-testid="save-answer-memory-btn">
                  <BookHeart className="w-3 h-3" /> Save to Memory Book
                </button>
                <button type="button" onClick={() => saveAsReminder(m)} className="text-xs text-violet-700 font-medium flex items-center gap-1" data-testid="save-answer-reminder-btn">
                  <Bell className="w-3 h-3" /> Save as reminder
                </button>
              </div>
            )}
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
