import assert from "node:assert/strict";
import { test } from "node:test";
import { allow, allowPlan, visitorId } from "../src/lib/server/rateLimit";

function requestFrom(address: string): Request {
  return new Request("http://localhost/api/plan-leg", { headers: { "x-forwarded-for": address + ", 10.0.0.1" } });
}

test("a key is allowed up to its limit, then refused", () => {
  assert.equal(allow("test-a", 2, 60000), true);
  assert.equal(allow("test-a", 2, 60000), true);
  assert.equal(allow("test-a", 2, 60000), false);
  // Another key has its own count.
  assert.equal(allow("test-b", 2, 60000), true);
});

test("a finished window starts counting again", () => {
  assert.equal(allow("test-c", 1, -1), true);
  assert.equal(allow("test-c", 1, -1), true);
});

test("the visitor is the first forwarded address", () => {
  assert.equal(visitorId(requestFrom("203.0.113.7")), "203.0.113.7");
  assert.equal(visitorId(new Request("http://localhost/")), "local");
});

test("plans are capped per minute for one visitor, with a plain message", () => {
  process.env.PLAN_LIMIT_PER_MINUTE = "2";
  const visitor = requestFrom("198.51.100.9");
  assert.equal(allowPlan(visitor).ok, true);
  assert.equal(allowPlan(visitor).ok, true);
  const third = allowPlan(visitor);
  assert.equal(third.ok, false);
  assert.match(third.message, /Wait a moment/);
  // A different visitor is not affected.
  assert.equal(allowPlan(requestFrom("198.51.100.10")).ok, true);
  delete process.env.PLAN_LIMIT_PER_MINUTE;
});
