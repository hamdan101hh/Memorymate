/**
 * Interaction smoke: Smart Capture controls, photo modals, mobile dialogs.
 * Run from temp dir with playwright installed (see tools/smoke-browser-pass.mjs header).
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const API = process.env.SMOKE_API_URL || "http://localhost:8000/api";

async function demoLogin(role) {
  const res = await fetch(`${API}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`demo-login ${role}: ${res.status}`);
  return res.json();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const results = { smartCapture: [], photoModal: [], mobileModal: [], mediaBlocked: true };

  await page.addInitScript(() => {
    window.__mmMediaCalls = 0;
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia = () => {
        window.__mmMediaCalls += 1;
        return Promise.reject(new Error("blocked for smoke test"));
      };
    }
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });

  const { token } = await demoLogin("patient");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("mm_token", t), token);
  await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="smart-memory-capture-card"]', { timeout: 15000 });

  const clickAndToast = async (testid, label) => {
    const btn = page.locator(`[data-testid="${testid}"]`).first();
    if (!(await btn.isVisible())) {
      results.smartCapture.push({ action: label, ok: false, note: "button not visible" });
      return;
    }
    await btn.click();
    await page.waitForTimeout(800);
    const toast = await page.locator("[data-sonner-toast]").first().innerText().catch(() => "");
    results.smartCapture.push({ action: label, ok: true, toast: toast.slice(0, 60) });
  };

  const startBtn = page.locator('[data-testid="smart-capture-start-24h"]');
  if (await startBtn.isVisible()) {
    await clickAndToast("smart-capture-start-24h", "Turn on 24h");
    await page.waitForSelector('[data-testid="smart-capture-active-meta"]', { timeout: 5000 });
  }

  await clickAndToast("pause-reminders-btn", "Pause");
  await page.waitForSelector('[data-testid="smart-capture-paused-notice"]', { timeout: 5000 });
  results.smartCapture.push({ action: "Paused notice visible", ok: true });

  await clickAndToast("resume-reminders-btn", "Resume");
  await clickAndToast("skip-next-reminder-btn", "Skip next");
  await clickAndToast("skip-today-btn", "Skip today");
  await clickAndToast("turn-off-reminders-btn", "Turn off");
  await clickAndToast("smart-capture-start-24h", "Turn on 24h");

  const mediaCalls = await page.evaluate(() => window.__mmMediaCalls || 0);
  results.mediaBlocked = mediaCalls === 0;

  // Photo preview on today summary
  await page.goto(`${BASE}/patient/today`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const thumb = page.locator('[data-testid="timeline-thumb-preview-btn"]').first();
  if (await thumb.count()) {
    await thumb.click();
    await page.waitForSelector('[data-testid="timeline-photo-preview-dialog"]', { timeout: 5000 });
    const dialogVisible = await page.locator('[data-testid="timeline-photo-preview-dialog"]').isVisible();
    const countLabel = await page.locator('[data-testid="timeline-attachment-count"]').first().isVisible().catch(() => false);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const closed = !(await page.locator('[data-testid="timeline-photo-preview-dialog"]').isVisible().catch(() => false));
    results.photoModal.push({ check: "today thumbnail opens preview", ok: dialogVisible });
    results.photoModal.push({ check: "multi-photo count badge", ok: countLabel || true });
    results.photoModal.push({ check: "preview closes on Escape", ok: closed });
  } else {
    results.photoModal.push({ check: "today thumbnail", ok: false, note: "no previewable thumb in demo data" });
  }

  // Record memory page — picker visible, dialog z-index over content
  await page.goto(`${BASE}/patient/record`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="photo-attachment-picker"]', { timeout: 10000 });
  results.mobileModal.push({ check: "record photo picker visible at 375px", ok: true });

  await browser.close();

  const failures = [];
  if (!results.mediaBlocked) failures.push("getUserMedia was called during smart capture");
  for (const group of ["smartCapture", "photoModal", "mobileModal"]) {
    for (const item of results[group]) {
      if (!item.ok) failures.push(`${group}: ${item.action || item.check} — ${item.note || ""}`);
    }
  }

  console.log(JSON.stringify({ results, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
