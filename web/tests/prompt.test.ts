// Tests what the AI is told about each candidate and the rules it must follow.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLegPrompt, describeCandidate } from "../src/lib/server/prompt";
import { defaultTrip } from "../src/lib/storage";
import type { LegRequest, Place, Point } from "../src/lib/types";

const lisbon: Point = { name: "Lisbon, Portugal", lat: 38.7077, lon: -9.1365 };
const bridgeView: Place = { id: "p12", name: "Ponte 25 de Abril viewpoint", category: "sight", lat: 38.6939, lon: -9.2061, address: "", cuisine: "", wikidataId: "Q1", fame: 54, tier: "icon", wikiUrl: "" };
const tasca: Place = { id: "p30", name: "Tasca do Chico", category: "food", lat: 38.7116, lon: -9.1436, address: "", cuisine: "portuguese", wikidataId: "", fame: -1, tier: "local", wikiUrl: "" };

function request(nights: number): LegRequest {
  const trip = defaultTrip();
  return { city: "Lisbon", nights, travelers: 2, currency: "EUR", dailyBudgetPerPerson: 60, preferences: trip.preferences };
}

test("a candidate line carries its tier, fame and distance from the centre", () => {
  assert.equal(describeCandidate(bridgeView, lisbon, ""), "p12 | Ponte 25 de Abril viewpoint | sight | icon, fame 54 | 6.2 km from centre");
});

test("unknown fame is left out, and cuisine and area still follow", () => {
  assert.equal(describeCandidate(tasca, lisbon, "Bairro Alto"), "p30 | Tasca do Chico | food | local | 0.8 km from centre | cuisine: portuguese | area: Bairro Alto");
});

test("the prompt lists candidates with tiers and asks for an icon every day from 3 days", () => {
  const long = buildLegPrompt(request(3), lisbon, [bridgeView, tasca], [], {});
  assert.ok(long.includes("p12 | Ponte 25 de Abril viewpoint | sight | icon, fame 54 | 6.2 km from centre"));
  assert.ok(long.includes("at least one icon every day"));
  assert.ok(long.includes("never zigzag"));

  const short = buildLegPrompt(request(2), lisbon, [bridgeView, tasca], [], {});
  assert.ok(!short.includes("at least one icon every day"));
});

test("each style gives its own rule about hidden and local finds", () => {
  const rules: Record<string, string> = {};
  for (const style of ["classic", "balanced", "adventurous"] as const) {
    const input = request(3);
    input.preferences = { ...input.preferences, tripStyle: style };
    rules[style] = buildLegPrompt(input, lisbon, [bridgeView, tasca], [], {});
  }
  assert.ok(rules.classic.includes("At most 1 hidden or local find per day"));
  assert.ok(rules.balanced.includes("at least 1 hidden or local find every day"));
  assert.ok(rules.adventurous.includes("at least 2 hidden or local finds every day"));
  // Notes for hidden finds may only use what the traveller told us.
  assert.ok(rules.balanced.includes("Never state facts you were not given"));
});
