"""AI features: transcript processing, patient Q&A, caregiver summary, audio transcription.
Uses Claude Sonnet 4.6 via the Emergent LLM key. All functions are defensive and
degrade gracefully so the app keeps working even if the AI call fails."""
import os
import json
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

load_dotenv(Path(__file__).parent / ".env")

LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-4-6"

SAFETY_RULES = (
    "You are MemoryMate, a calm, gentle memory-support assistant for elderly people and "
    "people with early memory loss. SAFETY RULES you must always follow:\n"
    "- Use very simple, short, warm sentences.\n"
    "- Never diagnose any condition. Never say the person has dementia or any illness.\n"
    "- Never say 'you forgot'. Instead say 'here is a reminder'.\n"
    "- Never invent memories, people, medication, or schedules. Only use the information given to you.\n"
    "- For medical questions, gently say to please check with their doctor or caregiver.\n"
    "- Never claim to handle emergencies. If unsafe, suggest calling their emergency contact or local services.\n"
)


def _chat(system_message: str, session_id: str | None = None) -> LlmChat:
    return LlmChat(
        api_key=LLM_KEY,
        session_id=session_id or str(uuid.uuid4()),
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


async def process_transcript(transcript: str) -> dict:
    """Turn a raw memory transcript into a structured summary + extractions."""
    fallback = {
        "title": "Memory note",
        "simple_summary": transcript[:240],
        "timeline": "afternoon",
        "people": [], "places": [], "medications": [],
        "appointments": [], "reminders": [], "caregiver_notes": [],
    }
    system = (
        SAFETY_RULES
        + "\nYou will receive a transcript of something the person said about their day. "
        "Extract structured information. Respond ONLY with valid JSON in exactly this shape:\n"
        "{\n"
        '  "title": "short 3-6 word title",\n'
        '  "simple_summary": "2-4 gentle simple sentences summarizing the day, addressed to the person as \'you\'",\n'
        '  "timeline": "morning | afternoon | evening",\n'
        '  "people": [{"name": "", "relationship": ""}],\n'
        '  "places": [{"name": "", "type": ""}],\n'
        '  "medications": [{"name": "", "instruction": ""}],\n'
        '  "appointments": [{"title": "", "time": "", "location": ""}],\n'
        '  "reminders": [{"title": "", "priority": "low|medium|high", "category": "medication|appointment|family|task|routine|custom"}],\n'
        '  "caregiver_notes": ["short note for the caregiver"]\n'
        "}\n"
        "Use empty arrays when nothing applies. Do not invent anything not in the transcript."
    )
    try:
        chat = _chat(system)
        resp = await chat.send_message(UserMessage(text=f"Transcript:\n{transcript}"))
        data = _extract_json(resp)
        for key in fallback:
            data.setdefault(key, fallback[key])
        return data
    except Exception as e:
        print(f"[ai.process_transcript] failed: {e}")
        return fallback


async def answer_question(context: str, history: list[dict], question: str) -> str:
    """Answer a patient question grounded strictly on their saved data."""
    system = (
        SAFETY_RULES
        + "\nAnswer the person's question using ONLY the saved information below. "
        "If the answer is not in the saved information, gently say: "
        "\"I don't have that saved yet. You can ask your caregiver to add it.\" "
        "Keep answers to 1-3 short, warm sentences.\n\n"
        "=== SAVED INFORMATION ===\n" + context + "\n=== END ==="
    )
    try:
        chat = _chat(system)
        # Replay short history for continuity
        for h in history[-6:]:
            if h.get("role") == "user":
                await chat.send_message(UserMessage(text=h["message"]))
        return await chat.send_message(UserMessage(text=question))
    except Exception as e:
        print(f"[ai.answer_question] failed: {e}")
        return "I'm having a little trouble right now. Please try again in a moment, or ask your caregiver."


async def caregiver_summary(context: str) -> str:
    system = (
        SAFETY_RULES
        + "\nYou are writing a brief daily overview for a family caregiver. "
        "Be factual, calm and supportive. Use the saved information only. "
        "Structure the response in short labelled sections using these exact headings:\n"
        "Today's overview:\nReminders completed:\nReminders missed:\nPossible things to check:\nSuggested check-in questions:\n"
        "Under 'Possible things to check', never use alarming or medical-diagnosis language.\n\n"
        "=== SAVED INFORMATION ===\n" + context + "\n=== END ==="
    )
    try:
        chat = _chat(system)
        return await chat.send_message(UserMessage(text="Please generate today's caregiver summary."))
    except Exception as e:
        print(f"[ai.caregiver_summary] failed: {e}")
        return "Unable to generate the summary right now. Please try again shortly."


async def explain_person(name: str, relationship: str, description: str, explanation: str) -> str:
    base = explanation or description
    system = (
        SAFETY_RULES
        + "\nExplain who a person is to the user in 1-2 very warm, simple sentences. Address the user as 'you'."
    )
    info = f"Name: {name}. Relationship: {relationship}. Notes: {base}"
    try:
        chat = _chat(system)
        return await chat.send_message(UserMessage(text=f"Explain this person simply: {info}"))
    except Exception:
        rel = relationship or "someone important to you"
        return f"{name} is your {rel}. {base}".strip()


async def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe an uploaded audio blob using Whisper."""
    suffix = Path(filename).suffix or ".webm"
    stt = OpenAISpeechToText(api_key=LLM_KEY)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        with open(tmp_path, "rb") as f:
            resp = await stt.transcribe(file=f, model="whisper-1", response_format="json", language="en")
        return resp.text
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
