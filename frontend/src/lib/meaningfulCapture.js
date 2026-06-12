/** Client-side meaningful snippet filter (mirrors backend capture_meaningfulness). */
const FILLER = /^(um+|uh+|hmm+|ok+|yeah+|yes+|no+|ah+|oh+|like|so|well|okay)[\s.,!]*$/i;
const KEYWORDS = /\b(remember|appointment|meeting|call|doctor|family|tomorrow|today|later|remind|visit|medicine|pharmacy|clinic)\b/i;
const TIME = /\b(\d{1,2}(:\d{2})?\s*(am|pm)?|tomorrow|today|monday|tuesday|at \d)/i;

export function isMeaningfulCaptureSnippet(transcript, metadata = {}) {
  const text = (transcript || "").trim();
  const duration = Number(metadata.duration_seconds || 0);
  const minSec = Number(metadata.min_snippet_seconds || 3);

  if (!text) return { should_create_draft: false, reason: "empty_transcript", confidence: "low" };
  if (duration > 0 && duration < minSec) return { should_create_draft: false, reason: "too_short_duration", confidence: "low" };
  if (text.length < 12) return { should_create_draft: false, reason: "too_short_text", confidence: "low" };
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return { should_create_draft: false, reason: "too_few_words", confidence: "low" };
  if (FILLER.test(text)) return { should_create_draft: false, reason: "filler_only", confidence: "low" };

  const meaningful = KEYWORDS.test(text) || TIME.test(text) || words.length >= 8;
  if (!meaningful) return { should_create_draft: false, reason: "not_meaningful", confidence: "low" };

  return {
    should_create_draft: true,
    reason: "meaningful_speech",
    suggested_type: /meeting|agenda/i.test(text) ? "meeting_note" : /remind|call/i.test(text) ? "reminder" : "memory",
    confidence: words.length >= 8 ? "high" : "medium",
    suggested_title: text.length > 60 ? `${text.slice(0, 60)}…` : text,
    suggested_summary: text.length > 280 ? `${text.slice(0, 280)}…` : text,
  };
}
