/**
 * One-off browser smoke pass for MemoryMate routes.
 * Run: npx --yes -p playwright@1.52.0 node tools/smoke-browser-pass.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const API = process.env.SMOKE_API_URL || "http://localhost:8000/api";

const PUBLIC = [
  { path: "/", marker: "hero-get-started-btn" },
  { path: "/how-it-works", h1: /MemoryMate|capture|remember/i },
  { path: "/about", h1: /About MemoryMate/i },
  { path: "/privacy", h1: /Privacy Policy/i },
  { path: "/terms", h1: /Terms of Service/i },
  { path: "/consent", h1: /Consent/i },
  { path: "/medical-disclaimer", h1: /Medical Disclaimer/i },
  { path: "/data-deletion", marker: "data-deletion-form" },
  { path: "/safety", h1: /Safety Commitment/i },
  { path: "/signup", h2: /Create your account/i },
  { path: "/login", h1: /Welcome back|Log in/i },
  { path: "/foo", redirect: "/" },
];

const PATIENT = [
  { path: "/patient", marker: "patient-home" },
  { path: "/patient/record", marker: "record-memory-page" },
  { path: "/patient/today", h1: /What's happening today/i },
  { path: "/patient/reminders", marker: "patient-reminders-page" },
  { path: "/patient/assistant", marker: "assistant-page" },
  { path: "/patient/people", marker: "patient-people-page" },
  { path: "/patient/places", marker: "patient-places-page" },
  { path: "/patient/emergency", h1: /Emergency/i },
  { path: "/patient/settings", marker: "patient-settings-page" },
  { path: "/patient/notifications", marker: "notification-settings-page" },
  { path: "/patient/memory-book", marker: "patient-memorybook-page" },
  { path: "/patient/share", marker: "share-export-page" },
  { path: "/patient/capture", marker: "capture-start-page" },
  { path: "/patient/meeting", marker: "capture-start-page" },
  { path: "/patient/capture/review", marker: "privacy-review-page" },
  { path: "/patient/capture/vault", marker: "privacy-vault-page" },
  { path: "/patient/capture/settings", marker: "capture-settings-page" },
  { path: "/patient/capture/smart-day-drafts", marker: "smart-day-drafts-page" },
];

const CAREGIVER = [
  { path: "/caregiver", h1: /overview|Today/i },
  { path: "/caregiver/appointments", h1: /Appointments/i },
  { path: "/caregiver/appointments?filter=duplicates", h1: /Appointments/i },
  { path: "/caregiver/calendar", marker: "cg-calendar-page" },
  { path: "/caregiver/reminders", marker: "cg-reminders-page" },
  { path: "/caregiver/memory-book", marker: "cg-memorybook-page" },
  { path: "/caregiver/people", marker: "cg-people-page" },
  { path: "/caregiver/capture/review", marker: "privacy-review-page" },
  { path: "/caregiver/settings", marker: "cg-settings-page" },
  { path: "/caregiver/overview", marker: "patient-overview-page" },
  { path: "/caregiver/timeline", h1: /Daily Timeline/i },
  { path: "/caregiver/medication", marker: "medication-page" },
  { path: "/caregiver/places", marker: "cg-places-page" },
  { path: "/caregiver/family", marker: "cg-family-page" },
  { path: "/caregiver/capture", marker: "capture-start-page" },
  { path: "/caregiver/capture/sessions", marker: "capture-sessions-page" },
  { path: "/caregiver/alerts", marker: "alerts-page" },
  { path: "/caregiver/notes", marker: "caregiver-notes-page" },
  { path: "/caregiver/share", marker: "share-export-page" },
  { path: "/caregiver/notifications", marker: "notification-settings-page" },
  { path: "/caregiver/whatsapp", marker: "cg-whatsapp-page" },
];

const ADMIN = [
  { path: "/admin", marker: "admin-dashboard" },
  { path: "/admin/users", marker: "admin-users-page" },
  { path: "/admin/data", marker: "admin-data-page" },
  { path: "/admin/logs", marker: "admin-logs-page" },
];

async function demoLogin(role) {
  const res = await fetch(`${API}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`demo-login ${role} failed: ${res.status}`);
  return res.json();
}

async function setToken(page, token) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("mm_token", t), token);
}

async function checkRoute(page, spec) {
  const url = `${BASE}${spec.path}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);

  const finalUrl = page.url();
  const pathname = new URL(finalUrl).pathname;
  const expectedPath = spec.redirect || spec.path.split("?")[0];

  let ok = true;
  let note = "";

  if (spec.redirect) {
    ok = pathname === spec.redirect || finalUrl === `${BASE}${spec.redirect}`;
    if (!ok) note = `expected redirect to ${spec.redirect}, got ${pathname}`;
  } else {
    ok = pathname === spec.path.split("?")[0];
    if (!ok) note = `pathname mismatch: ${pathname}`;
  }

  if (spec.marker) {
    const el = page.locator(`[data-testid="${spec.marker}"]`);
    const found = await el.count() > 0;
    if (!found) {
      ok = false;
      note += ` missing ${spec.marker}`;
    }
  }

  if (spec.h1) {
    const h1 = await page.locator("h1").first().innerText({ timeout: 3000 }).catch(() => "");
    if (!spec.h1.test(h1)) {
      ok = false;
      note += ` h1 mismatch: ${h1.slice(0, 40)}`;
    }
  }

  if (spec.h2) {
    const h2 = await page.locator("h2").first().innerText({ timeout: 3000 }).catch(() => "");
    if (!spec.h2.test(h2)) {
      ok = false;
      note += ` h2 mismatch: ${h2.slice(0, 40)}`;
    }
  }

  const bodyLen = await page.evaluate(() => document.body?.innerText?.length || 0);
  if (bodyLen < 50 && !spec.redirect) {
    ok = false;
    note += " thin page content";
  }

  return { path: spec.path, ok, note: note.trim(), final: pathname };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleErrors = [];
  const ignored = [
    /Download the React DevTools/,
    /Manifest: property 'start_url'/,
    /favicon/,
  ];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (!ignored.some((r) => r.test(t))) consoleErrors.push(t);
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  const results = { public: [], patient: [], caregiver: [], admin: [], guards: [], mobile: [], network: null };

  for (const spec of PUBLIC) {
    results.public.push(await checkRoute(page, spec));
  }

  const patientToken = (await demoLogin("patient")).token;
  await setToken(page, patientToken);
  for (const spec of PATIENT) {
    results.patient.push(await checkRoute(page, spec));
  }

  await page.goto(`${BASE}/caregiver/timeline`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const guardPatient = page.url().includes("/patient");
  results.guards.push({ check: "patient->caregiver/timeline", ok: guardPatient });

  const caregiverToken = (await demoLogin("caregiver")).token;
  await setToken(page, caregiverToken);
  await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  results.guards.push({ check: "caregiver->patient", ok: page.url().includes("/caregiver") });

  for (const spec of CAREGIVER) {
    results.caregiver.push(await checkRoute(page, spec));
  }

  const adminToken = (await demoLogin("admin")).token;
  await setToken(page, adminToken);
  for (const spec of ADMIN) {
    results.admin.push(await checkRoute(page, spec));
  }
  await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  results.guards.push({ check: "admin->patient", ok: page.url().includes("/admin") });

  // Mobile caregiver hamburger
  await setToken(page, caregiverToken);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/caregiver`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const menuBtn = page.locator('[data-testid="mobile-menu-btn"]');
  const menuVisible = await menuBtn.isVisible();
  let mobileMenuOk = false;
  if (menuVisible) {
    await menuBtn.click();
    await page.waitForTimeout(400);
    const navTimeline = page.locator('[data-testid="nav-daily-timeline"]').first();
    mobileMenuOk = await navTimeline.isVisible();
    if (mobileMenuOk) {
      await navTimeline.click();
      await page.waitForTimeout(1200);
    }
  }
  results.mobile.push({
    check: "caregiver mobile menu -> timeline",
    ok: menuVisible && mobileMenuOk && page.url().includes("/timeline"),
  });

  await page.goto(`${BASE}/caregiver/record`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  results.mobile.push({ check: "caregiver/record unknown route redirect", ok: page.url().replace(BASE, "") === "/caregiver" });

  await setToken(page, patientToken);
  await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const tiles = await page.locator("[data-testid^='tile-']").count();
  results.mobile.push({ check: "patient mobile tiles visible", ok: tiles >= 6 });

  await page.goto(`${BASE}/patient/record`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const recordMarker = await page.locator('[data-testid="record-memory-page"], [data-testid="memory-text-input"]').count();
  results.mobile.push({ check: "patient record form mobile", ok: recordMarker > 0 });

  // Network-off: load dashboard first, then block API writes
  await setToken(page, caregiverToken);
  await page.goto(`${BASE}/caregiver`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="quick-note-input"]', { timeout: 15000 });
  await page.route(`${API}/**`, (route) => route.abort("failed"));
  const noteInput = page.locator('[data-testid="quick-note-input"]');
  await noteInput.fill("offline smoke test");
  await page.locator('[data-testid="quick-note-save"]').click();
  await page.waitForTimeout(1500);
  const toast = await page.locator("[data-sonner-toast]").first().innerText().catch(() => "");
  const stillOnDashboard = page.url().includes("/caregiver");
  results.network = { ok: stillOnDashboard && /wrong|could not|failed|error/i.test(toast), toast: toast.slice(0, 80) };

  await browser.close();

  const failures = [];
  for (const [group, items] of Object.entries(results)) {
    if (group === "network") {
      if (items && !items.ok) failures.push(`network: ${items.toast}`);
      continue;
    }
    for (const item of items) {
      if (!item.ok) failures.push(`${group}: ${item.check || item.path} — ${item.note || ""}`);
    }
  }

  console.log(JSON.stringify({ results, consoleErrors, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
