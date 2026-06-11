/** Capture / speech language options — browser speech recognition locales. */
export const CAPTURE_LANGUAGES = [
  { value: "auto", label: "Auto-detect", locale: null },
  { value: "en-US", label: "English", locale: "en-US" },
  { value: "ar", label: "Arabic", locale: "ar" },
  { value: "ur-PK", label: "Urdu", locale: "ur-PK" },
  { value: "ru-RU", label: "Russian", locale: "ru-RU" },
  { value: "zh-CN", label: "Chinese", locale: "zh-CN" },
];

export function speechRecognitionSupported() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

export function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function localeForCaptureLanguage(value) {
  const item = CAPTURE_LANGUAGES.find((l) => l.value === value);
  return item?.locale;
}
