/**
 * Unit check for onboarding recommendation paths (no browser).
 * Run: node tools/test-onboarding-recommend.mjs
 */
import { recommendMode } from "../frontend/src/lib/onboardingConfig.js";

const CASES = [
  {
    name: "private_executive",
    args: ["capture_meetings_ideas", "private", "rarely", "rarely"],
    expected: "private_executive",
  },
  {
    name: "daily_memory_support_private",
    args: ["extra_memory_support", "private", "often", "sometimes"],
    expected: "daily_memory_support",
  },
  {
    name: "daily_memory_support_decide_later",
    args: ["extra_memory_support", "decide_later", "often", "often"],
    expected: "daily_memory_support",
  },
  {
    name: "trusted_supporter_help_someone",
    args: ["help_someone", "private", "often", "often"],
    expected: "trusted_supporter",
  },
  {
    name: "trusted_supporter_privacy",
    args: ["remember_tasks", "trusted_supporter", "very_often", "very_often"],
    expected: "trusted_supporter",
  },
  {
    name: "decide_later_not_sure",
    args: ["not_sure", "decide_later", "sometimes", "prefer_not_to_say"],
    expected: "decide_later",
  },
  {
    name: "decide_later_productivity_low",
    args: ["capture_meetings_ideas", "decide_later", "rarely", "rarely"],
    expected: "decide_later",
  },
];

let failed = 0;
for (const { name, args, expected } of CASES) {
  const got = recommendMode(...args);
  if (got !== expected) {
    console.error(`FAIL ${name}: expected ${expected}, got ${got}`);
    failed += 1;
  } else {
    console.log(`OK ${name}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log(`All ${CASES.length} recommendation paths passed.`);
