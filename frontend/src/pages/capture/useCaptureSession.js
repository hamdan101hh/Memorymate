import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { logError } from "../../lib/logger";
import { toast } from "sonner";

/**
 * Encapsulates all data/logic for a single capture session: loading, status
 * transitions, manual notes and transcript processing. Keeps the page component
 * focused on rendering.
 */
export function useCaptureSession() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("active");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    return api.get(`/capture/sessions/${id}`)
      .then(({ data }) => {
        setSession(data);
        setStatus(data.status);
        if (data.status === "completed") {
          setResult({ events: data.events, meeting_summary: data.meeting_summary, review_items: null });
        }
      })
      .catch((e) => logError("Failed to load session", e));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = useCallback(async (s) => {
    setStatus(s);
    try {
      await api.patch(`/capture/sessions/${id}`, { status: s });
    } catch (e) {
      logError("Failed to update session status", e);
      toast.error("Couldn't update the session. Please try again.");
    }
  }, [id]);

  const addNote = useCallback(async (note) => {
    if (!note.trim()) return false;
    try {
      await api.post(`/capture/sessions/${id}/note`, { note });
      toast.success("Note added");
      return true;
    } catch (e) {
      logError("Failed to add note", e);
      toast.error("Could not add note");
      return false;
    }
  }, [id]);

  const process = useCallback(async (transcript) => {
    if (!transcript.trim()) { toast.error("Paste a transcript to process."); return; }
    setProcessing(true);
    try {
      const { data } = await api.post(`/capture/sessions/${id}/process`, { transcript });
      setResult(data);
      setStatus("completed");
      toast.success(`Saved ${data.events.length} memory event(s)`);
    } catch (err) {
      logError("Failed to process session", err);
      toast.error(formatApiError(err.response?.data?.detail) || "Could not process");
    } finally {
      setProcessing(false);
    }
  }, [id]);

  return { session, status, processing, result, changeStatus, addNote, process };
}
