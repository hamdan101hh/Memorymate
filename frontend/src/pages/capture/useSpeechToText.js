import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Free, on-device speech-to-text using the browser's built-in Web Speech API.
 *
 * This is the key cost lever for always-on capture: transcription happens in the
 * browser at $0 instead of paying a cloud transcription service per minute. Final
 * recognized chunks are delivered via `onResult`; interim text is exposed for a
 * live preview. Degrades gracefully (`supported === false`) on browsers without
 * the API, where the user can still type or paste a transcript.
 */
export function useSpeechToText({ onResult, lang = "en-US" } = {}) {
  const recognitionRef = useRef(null);
  const wantOnRef = useRef(false);
  const onResultRef = useRef(onResult);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);

  // Keep the latest callback without re-creating the recognizer.
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return undefined; }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += `${chunk} `;
        else interimText += chunk;
      }
      if (finalText && onResultRef.current) onResultRef.current(finalText);
      setInterim(interimText);
    };

    rec.onend = () => {
      // The engine stops itself periodically; restart while the user wants it on.
      if (wantOnRef.current) {
        try { rec.start(); } catch { /* already starting */ }
      } else {
        setListening(false);
        setInterim("");
      }
    };

    rec.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        wantOnRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = rec;
    return () => {
      wantOnRef.current = false;
      try { rec.stop(); } catch { /* noop */ }
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    wantOnRef.current = true;
    try { recognitionRef.current.start(); setListening(true); } catch { /* already running */ }
  }, []);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop(); else start();
  }, [listening, start, stop]);

  return { listening, interim, supported, start, stop, toggle };
}
