// Tests how the Gemini client behaves when Google is busy or refuses us.
// fetch is replaced with a fake that answers from a script, so no network is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { PlannerError } from "../src/lib/server/debug";
import { generateJson, retrySettings } from "../src/lib/server/gemini";

process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
retrySettings.pausesMs = [1, 1];

const okBody = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok": true}' }] }, finishReason: "STOP" }] });
const busyBody = JSON.stringify({ error: { code: 503, message: "This model is currently experiencing high demand." } });

// Replace fetch with a fake that returns the given statuses in order, and count the calls.
function fakeGoogle(statuses: number[]): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = async function () {
    const status = statuses[counter.calls];
    counter.calls = counter.calls + 1;
    let body = busyBody;
    if (status === 200) {
      body = okBody;
    }
    return new Response(body, { status });
  };
  return counter;
}

const schema = z.object({ ok: z.boolean() });

test("a busy model is retried and the plan still arrives", async () => {
  const counter = fakeGoogle([503, 503, 200]);
  const answer = await generateJson("system", "prompt", schema);
  assert.equal(answer.ok, true);
  assert.equal(counter.calls, 3);
});

test("if Google stays busy, the traveller gets a clear 'busy' message", async () => {
  const counter = fakeGoogle([503, 503, 503]);
  await assert.rejects(generateJson("system", "prompt", schema), function (error: unknown) {
    assert.ok(error instanceof PlannerError);
    assert.equal(error.status, 503);
    assert.match(error.userMessage, /very busy/);
    return true;
  });
  assert.equal(counter.calls, 3);
});

test("a rejected key is not retried", async () => {
  const counter = fakeGoogle([403]);
  await assert.rejects(generateJson("system", "prompt", schema));
  assert.equal(counter.calls, 1);
});
