import assert from "node:assert";
import { decideRedirect } from "../src/lib/route-guard.js";

function t(name, fn) {
  try { fn(); console.log("✓", name); } catch (e) { console.error("✗", name, "\n", e); process.exitCode = 1; }
}

// Unauthenticated
t("/ -> /welcome when unauthenticated", () => {
  assert.equal(decideRedirect("/", false, false), "/welcome?next=/");
});

t("/calendar -> /welcome with next when unauthenticated and not onboarded", () => {
  assert.equal(decideRedirect("/calendar", false, false), "/welcome?next=/calendar");
});

t("/calendar -> /auth with next when unauthenticated but onboarded", () => {
  assert.equal(decideRedirect("/calendar", false, true), "/auth?next=/calendar");
});

// Authenticated
t("/welcome -> / when authenticated", () => {
  assert.equal(decideRedirect("/welcome", true, true), "/");
});

t("/auth -> / when authenticated", () => {
  assert.equal(decideRedirect("/auth", true, true), "/");
});

t("/ -> null when authenticated", () => {
  assert.equal(decideRedirect("/", true, true), null);
});

console.log("Done");


