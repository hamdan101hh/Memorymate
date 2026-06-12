import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { logError } from "../lib/logger";
import { getSpeechRecognitionCtor, localeForCaptureLanguage } from "../lib/captureLanguage";
import { isMeaningfulCaptureSnippet } from "../lib/meaningfulCapture";
import { toast } from "sonner";

const MAX_SNIPPET_MS = 60000;
const SESSION_PROMPT_HOURS = 2;

export function useSmartDayCapture({ enabled, language, minSnippetSeconds, onDraftCreated }) {
  const [listening, setListening] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [speechUnsupported, setSpeechUnsupported] = useState(false);
  const recRef = useRef(null);
  const snippetStartRef = useRef(null);
  const chunkTextRef = useRef("");
  const sessionPromptedRef = useRef(false);

  const stopRecognition = useCallback(() => {
    try {
      recRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
    setDetecting(false);
  }, []);

  const submitChunk = useCallback(async (text, durationSeconds) => {
    const check = isMeaningfulCaptureSnippet(text, {
      duration_seconds: durationSeconds,
      min_snippet_seconds: minSnippetSeconds,
    });
    if (!check.should_create_draft) {
      return { ignored: true, reason: check.reason };
    }
    setDetecting(true);
    try {
      const { data } = await api.post("/capture/smart-day/draft", {
        transcript: text,
        language,
        detected_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        browser_transcript: true,
        source: "smart_day_capture",
      });
      if (data.created && data.draft) {
        onDraftCreated?.(data.draft);
        toast.success("Draft ready for review");
      }
      return data;
    } catch (err) {
      const msg = err.response?.data?.detail;
      if (typeof msg === "string" && msg.includes("voice limit")) {
        toast.error("Voice limit reached. You can still type memories.");
      } else {
        logError("smart day draft", err);
      }
      return { error: true };
    } finally {
      setDetecting(false);
    }
  }, [language, minSnippetSeconds, onDraftCreated]);

  const flushChunk = useCallback(async () => {
    const text = chunkTextRef.current.trim();
    const start = snippetStartRef.current;
    chunkTextRef.current = "";
    snippetStartRef.current = null;
    if (!text) return;
    const duration = start ? (Date.now() - start) / 1000 : 0;
    await submitChunk(text, duration);
  }, [submitChunk]);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSpeechUnsupported(true);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    const locale = localeForCaptureLanguage(language);
    if (locale) rec.lang = locale;

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) {
        if (!snippetStartRef.current) snippetStartRef.current = Date.now();
        chunkTextRef.current = `${chunkTextRef.current} ${final}`.trim();
        const elapsed = Date.now() - snippetStartRef.current;
        if (elapsed >= MAX_SNIPPET_MS) {
          flushChunk();
        }
      }
      if (interim) setDetecting(true);
    };

    rec.onend = () => {
      flushChunk();
      if (enabled && !sessionPromptedRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
        setDetecting(false);
      }
    };

    rec.onerror = () => {
      setSpeechUnsupported(true);
      stopRecognition();
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
      setSpeechUnsupported(false);
    } catch {
      setSpeechUnsupported(true);
    }
  }, [enabled, language, flushChunk, stopRecognition]);

  useEffect(() => {
    if (!enabled) {
      stopRecognition();
      return undefined;
    }
    startRecognition();
    return () => stopRecognition();
  }, [enabled, startRecognition, stopRecognition]);

  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get("/capture/smart-day/status");
        if (data.session_hours >= SESSION_PROMPT_HOURS && !sessionPromptedRef.current) {
          sessionPromptedRef.current = true;
          if (window.confirm("Still using Smart Day Capture? Tap OK to keep listening or Cancel to stop.")) {
            sessionPromptedRef.current = false;
          } else {
            await api.post("/capture/smart-day/stop");
            stopRecognition();
          }
        }
      } catch (e) {
        logError("smart day session check", e);
      }
    }, 60000);
    return () => clearInterval(t);
  }, [enabled, stopRecognition]);

  return { listening, detecting, speechUnsupported, stopRecognition };
}
