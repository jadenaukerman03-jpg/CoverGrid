// Runs the automation cycle on a timer for as long as this server process is
// alive — no pg_cron, no external scheduler, no public URL required. This is
// what makes the call-off-to-coverage loop actually autonomous instead of
// something a human has to remember to trigger.
//
// Real limit: this only runs while the process stays up. It covers "the app
// is running somewhere" (a dev server left open, a deployed instance) but not
// "nobody is running anything" — that still needs the app deployed somewhere
// that stays up 24/7, which is a separate, later decision.
import { runAutomationCycle } from "./automation.server";

const DEFAULT_INTERVAL_MINUTES = 10;

declare global {
  var __covergridAutomationSchedulerStarted: boolean | undefined;
}

function intervalMs(): number {
  const raw = Number(process.env["AUTOMATION_INTERVAL_MINUTES"]);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60_000;
}

async function tick() {
  try {
    const result = await runAutomationCycle({ source: "autopilot" });
    if (!result.skipped) {
      console.log(`[automation] cycle ran: ${result.summary}`);
    }
  } catch (error) {
    // A bad cycle should never take the server down.
    console.error("[automation] cycle failed", error);
  }
}

export function startAutomationScheduler() {
  // Vite's dev-server HMR can re-evaluate this module on file changes; a
  // process-global guard stops duplicate timers from stacking up.
  if (globalThis.__covergridAutomationSchedulerStarted) return;
  globalThis.__covergridAutomationSchedulerStarted = true;

  const ms = intervalMs();
  console.log(`[automation] autonomous scheduler started, running every ${ms / 60_000} minute(s)`);
  setInterval(() => void tick(), ms);
}
