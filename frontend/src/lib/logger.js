// Guarded logger. Real error paths use this instead of raw console so that
// production builds stay quiet while development still surfaces problems.
// User-visible fallbacks (toasts / fallback screens) are handled at the call site.
const isDev = process.env.NODE_ENV !== "production";

export const logError = (...args) => { if (isDev) console.error(...args); };
export const logWarn = (...args) => { if (isDev) console.warn(...args); };
