/**
 * Browser smoke pass for adaptive onboarding recommendation paths.
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

async function setToken(page, token) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("mm_token", t), token);
}

async function walkToRecommendation(page, spec) {
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("[data-testid='onboarding-page']", { timeout: 15000 });

  await page.click(`[data-testid='onboarding-goal-${spec.goal}']`);
  await page.click("[data-testid='onboarding-next-btn']");

  await page.click(`[data-testid='onboarding-privacy-${spec.privacy}']`);
  await page.click("[data-testid='onboarding-next-btn']");

  await page.click(`[data-testid='onboarding-checkin-${spec.checkin}']`);
  await page.click(`[data-testid='onboarding-forget-${spec.forget}']`);
  await page.click("[data-testid='onboarding-next-btn']");

  await page.waitForSelector("[data-testid='onboarding-recommendation-message']", { timeout: 10000 });
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
          `FAIL ${spec.name}: message missing "${spec.messageIncludes}" — got: ${msg?.slice(0, 80)}`,
        );
        failed += 1;
        continue;
      }

      const selected = await page.locator(`[data-testid='onboarding-mode-${expected}']`).getAttribute("class");
      if (!selected?.includes("border-sky-600")) {
        console.error(`FAIL ${spec.name}: expected selected mode ${expected}`);
        failed += 1;
        continue;
      }

      const suggested = await page.locator(`[data-testid='onboarding-mode-${expected}']`).getAttribute("data-suggested");
      if (suggested !== "true") {
        console.error(`FAIL ${spec.name}: expected suggested highlight on ${expected}`);
        failed += 1;
        continue;
      }

      console.log(`OK ${spec.name} → ${expected}`);
    } catch (err) {
      console.error(`FAIL ${spec.name}:`, err.message);
      failed += 1;
    }
  }

  await browser.close();

  if (failed) {
    console.error(`${failed} onboarding path(s) failed`);
    process.exit(1);
  }
  console.log(`All ${PATHS.length} onboarding smoke paths passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
