// Debug helpers for the server.
// Every failure carries two messages: one for the traveller, one for you in the terminal.

export class PlannerError extends Error {
  status: number;
  userMessage: string;

  constructor(status: number, userMessage: string, developerDetail: string) {
    super(developerDetail);
    this.status = status;
    this.userMessage = userMessage;
  }
}

// Set PLANNER_DEBUG=1 in .env.local to see every step and its timing in the terminal.
function debugEnabled(): boolean {
  return process.env.PLANNER_DEBUG === "1";
}

export function logStep(step: string, detail: string): void {
  if (debugEnabled()) {
    console.log("[planner] " + step + ": " + detail);
  }
}

// Errors are always printed, debug mode or not.
export function logError(step: string, error: unknown): void {
  let message = String(error);
  if (error instanceof Error) {
    message = error.message;
  }
  console.error("[planner] FAILED at " + step + ": " + message);
}

// Measure how long a step takes. Usage: const done = startTimer("geocode"); ... done("Lisbon");
export function startTimer(step: string): (detail: string) => void {
  const startedAt = Date.now();
  function finish(detail: string): void {
    const elapsed = Date.now() - startedAt;
    logStep(step, detail + " (" + elapsed + " ms)");
  }
  return finish;
}

// Turn any error into a JSON response: the traveller gets the friendly message,
// the terminal gets the real cause.
export function errorResponse(step: string, error: unknown): Response {
  logError(step, error);
  if (error instanceof PlannerError) {
    return Response.json({ error: error.userMessage }, { status: error.status });
  }
  return Response.json({ error: "Something went wrong on our side. Check the terminal for details." }, { status: 500 });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new PlannerError(
      500,
      "The planner isn't set up yet: an API key is missing on the server.",
      "Missing " + name + " in .env.local — copy .env.example to .env.local and fill it in, then restart npm run dev.",
    );
  }
  return value.trim();
}
