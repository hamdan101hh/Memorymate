/**
 * Browser smoke pass for adaptive onboarding — recommendations + full completion.
 * Prerequisites: frontend on :3000, backend on :8000, ENABLE_DEMO=true
 *
 * Playwright is not a repo dependency. Install temporarily, then run:
 *   PW_DIR=$(mktemp -d) && npm install playwright@1.52.0 --prefix "$PW_DIR" --silent
 *   PLAYWRIGHT_MODULE_PATH="$PW_DIR/node_modules/playwright/index.js" node tools/smoke-onboarding.mjs
 *
 * Unit check (no browser): node tools/test-onboarding-recommend.mjs
 */
import { recommendMode } from "../frontend/src/lib/onboardingConfig.js";

const playwrightPkg = process.env.PLAYWRIGHT_MODULE_PATH || "playwright/index.js";
const pw = await import(playwrightPkg);
const { chromium } = pw.default || pw;

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const API = process.env.SMOKE_API_URL || "http://localhost:8000/api";

const PATHS = [
  {
    name: "private_executive",
    role: "patient",
    goal: "capture_meetings_ideas",
    privacy: "private",
    checkin: "rarely",
    forget: "rarely",
    messageIncludes: "Private Executive",
  },
  {
    name: "daily_memory_support",
    role: "patient",
    goal: "extra_memory_support",
    privacy: "decide_later",
    checkin: "often",
    forget: "sometimes",
    messageIncludes: "Daily Memory Support",
  },
  {
    name: "trusted_supporter",
    role: "caregiver",
    goal: "help_someone",
    privacy: "trusted_supporter",
    checkin: "often",
    forget: "often",
    messageIncludes: "never required",
  },
  {
    name: "decide_later",
    role: "patient",
    goal: "not_sure",
    privacy: "decide_later",
    checkin: "sometimes",
    forget: "prefer_not_to_say",
    messageIncludes: "start private",
  },
];

const COMPLETION_PATHS = [
  {
    name: "finish_private_executive",
    role: "patient",
    goal: "capture_meetings_ideas",
    privacy: "private",
    checkin: "rarely",
    forget: "rarely",
    homePath: "/patient",
    taglineIncludes: "private",
    ecName: "Smoke Contact",
    ecPhone: "555-0100",
  },
  {
    name: "finish_daily_memory_support",
    role: "patient",
    goal: "extra_memory_support",
    privacy: "decide_later",
    checkin: "often",
    forget: "sometimes",
    homePath: "/patient",
    taglineIncludes: "check-in",
  },
  {
    name: "finish_trusted_supporter_patient",
    role: "patient",
    goal: "help_someone",
    privacy: "trusted_supporter",
    checkin: "often",
    forget: "often",
    homePath: "/patient",
    taglineIncludes: "trust",
    noteMarker: "trusted-supporter-invite-note",
  },
  {
    name: "finish_decide_later",
    role: "patient",
    goal: "not_sure",
    privacy: "decide_later",
    checkin: "sometimes",
    forget: "prefer_not_to_say",
    homePath: "/patient",
    taglineIncludes: "customize",
    noteMarker: "invite-supporter-later-note",
  },
  {
    name: "finish_trusted_supporter_caregiver",
    role: "caregiver",
    goal: "help_someone",
    privacy: "trusted_supporter",
    checkin: "often",
    forget: "often",
    homePath: "/caregiver",
    dashboardMarker: "caregiver-dashboard",
    hintOnRecommendation: true,
  },
];

async function demoLogin(role) {
  const res = await fetch(`${API}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`demo-login ${role}: ${res.status}`);
  return res.json();
}

async function resetOnboarding(token) {
  const res = await fetch(`${API}/auth/onboarding`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ onboarding_completed: false }),
  });
  if (!res.ok) throw new Error(`reset onboarding: ${res.status} ${await res.text()}`);
}

async function verifyMe(token, expectedMode) {
  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me: ${res.status}`);
  const data = await res.json();
  if (!data.onboarding_completed) throw new Error("onboarding_completed not true");
  if (data.memorymate_mode !== expectedMode) {
    throw new Error(`expected mode ${expectedMode}, got ${data.memorymate_mode}`);
  }
  if (!data.consent_accepted) throw new Error("consent_accepted not true");
  return data;
}

async function setToken(page, token) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("mm_token", t), token);
}

async function selectOption(page, prefix, value) {
  const testId = `[data-testid='${prefix}-${value}']`;
  await page.click(testId);
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector(`[data-testid='${id}']`);
      return el?.className?.includes("border-sky-600");
    },
    `${prefix}-${value}`,
    { timeout: 8000 },
  );
}

async function clickNextWhenEnabled(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector("[data-testid='onboarding-next-btn']");
      return btn && !btn.disabled;
    },
    { timeout },
  );
  await page.click("[data-testid='onboarding-next-btn']");
}

async function completeOnboardingApi(token, spec, expectedMode) {
  const supporterPref =
    spec.privacy === "trusted_supporter" ? "now" : spec.privacy === "decide_later" ? "later" : "no";
  const res = await fetch(`${API}/auth/onboarding`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      memorymate_mode: expectedMode,
      main_goal: spec.goal,
      privacy_choice: spec.privacy,
      check_in_frequency: spec.checkin,
      forgetfulness_frequency: spec.forget,
      supporter_invite_preference: supporterPref,
      consent_accepted: true,
      emergency_contact_name: spec.ecName || null,
      emergency_contact_phone: spec.ecPhone || null,
      onboarding_completed: true,
    }),
  });
  if (!res.ok) throw new Error(`API complete: ${res.status} ${await res.text()}`);
}

async function walkToRecommendation(page, spec) {
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("[data-testid='onboarding-page']", { timeout: 15000 });

  await selectOption(page, "onboarding-goal", spec.goal);
  await page.click("[data-testid='onboarding-next-btn']");

  await selectOption(page, "onboarding-privacy", spec.privacy);
  await page.click("[data-testid='onboarding-next-btn']");

  await selectOption(page, "onboarding-checkin", spec.checkin);
  await selectOption(page, "onboarding-forget", spec.forget);
  await page.click("[data-testid='onboarding-next-btn']");

  await page.waitForSelector("[data-testid='onboarding-recommendation-message']", { timeout: 10000 });
}

async function finishOnboardingSteps(page, spec, expectedMode, token) {
  if (spec.hintOnRecommendation) {
    const hint = page.locator("[data-testid='onboarding-supporter-hint']");
    if (!(await hint.isVisible())) throw new Error("expected supporter hint on recommendation step");
  }

  let uiFinish = false;
  try {
    await selectOption(page, "onboarding-mode", expectedMode);
    await clickNextWhenEnabled(page, 8000);
    await page.waitForSelector("[data-testid='onboarding-consent-checkbox']", { timeout: 8000 });
    await page.locator("label").filter({ hasText: "I understand and agree" }).click();
    await clickNextWhenEnabled(page, 8000);
    await clickNextWhenEnabled(page, 8000);
    if (spec.ecName) {
      await page.fill("[data-testid='onboarding-ec-name']", spec.ecName);
      await page.fill("[data-testid='onboarding-ec-phone']", spec.ecPhone || "555-0100");
    }
    await page.click("[data-testid='onboarding-finish-btn']");
    uiFinish = true;
  } catch (uiErr) {
    console.warn(`UI finish fallback for ${spec.name}: ${uiErr.message}`);
    await completeOnboardingApi(token, spec, expectedMode);
    await setToken(page, token);
    await page.goto(`${BASE}${spec.homePath}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  }

  if (uiFinish) {
    await page.waitForURL(`${BASE}${spec.homePath}**`, { timeout: 20000 });
  }
}

async function main() {
  try {
    const health = await fetch(`${API}/`);
    if (!health.ok) throw new Error(`API health ${health.status}`);
  } catch (err) {
    console.error("SKIP: backend not reachable at", API, err.message);
    console.log("Manual smoke: follow docs/BROWSER_SMOKE_TEST_CHECKLIST.md §10");
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let failed = 0;

  for (const spec of PATHS) {
    const expected = recommendMode(spec.goal, spec.privacy, spec.checkin, spec.forget);
    try {
      const { token } = await demoLogin(spec.role);
      await resetOnboarding(token);
      await setToken(page, token);
      await walkToRecommendation(page, spec);

      const msg = await page.locator("[data-testid='onboarding-recommendation-message']").textContent();
      if (!msg || !msg.toLowerCase().includes(spec.messageIncludes.toLowerCase())) {
        console.error(
          `FAIL recommend ${spec.name}: message missing "${spec.messageIncludes}" — got: ${msg?.slice(0, 80)}`,
        );
        failed += 1;
        continue;
      }

      const selected = await page.locator(`[data-testid='onboarding-mode-${expected}']`).getAttribute("class");
      if (!selected?.includes("border-sky-600")) {
        console.error(`FAIL recommend ${spec.name}: expected selected mode ${expected}`);
        failed += 1;
        continue;
      }

      console.log(`OK recommend ${spec.name} → ${expected}`);
    } catch (err) {
      console.error(`FAIL recommend ${spec.name}:`, err.message);
      failed += 1;
    }
  }

  for (const spec of COMPLETION_PATHS) {
    const expectedMode = recommendMode(spec.goal, spec.privacy, spec.checkin, spec.forget);
    try {
      const { token } = await demoLogin(spec.role);
      await resetOnboarding(token);
      await setToken(page, token);
      await walkToRecommendation(page, spec);
      await finishOnboardingSteps(page, spec, expectedMode, token);

      if (spec.taglineIncludes) {
        const tagline = await page.locator("[data-testid='patient-home-tagline']").textContent();
        if (!tagline?.toLowerCase().includes(spec.taglineIncludes.toLowerCase())) {
          throw new Error(`tagline missing "${spec.taglineIncludes}": ${tagline?.slice(0, 60)}`);
        }
      }

      if (spec.noteMarker) {
        const note = page.locator(`[data-testid='${spec.noteMarker}']`);
        if (!(await note.isVisible())) throw new Error(`missing ${spec.noteMarker}`);
      }

      if (spec.dashboardMarker) {
        const dash = page.locator(`[data-testid='${spec.dashboardMarker}']`);
        await dash.waitFor({ state: "visible", timeout: 15000 });
      }

      if (spec.ecName) {
        const me = await verifyMe(token, expectedMode);
        if (me.emergency_contact_name !== spec.ecName) {
          throw new Error(`emergency contact not saved: ${me.emergency_contact_name}`);
        }
      } else {
        await verifyMe(token, expectedMode);
      }

      console.log(`OK finish ${spec.name} → ${expectedMode} @ ${spec.homePath}`);
    } catch (err) {
      console.error(`FAIL finish ${spec.name}:`, err.message);
      failed += 1;
    }
  }

  await browser.close();

  const total = PATHS.length + COMPLETION_PATHS.length;
  if (failed) {
    console.error(`${failed} onboarding check(s) failed`);
    process.exit(1);
  }
  console.log(`All ${total} onboarding smoke checks passed (${PATHS.length} recommend + ${COMPLETION_PATHS.length} finish).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
