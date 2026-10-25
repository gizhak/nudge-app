// The coach runs when he looks at the app: a meal logged in Zepp a moment ago gets its answer now.
// Shared by the app and the chat, at most every 30 seconds (a meal logged between two looks still counts).
import { runCoach } from './engine';

let last = 0;
let running: Promise<number> | null = null;

/** Runs the coach unless it ran in the last 30 seconds; resolves to how many messages went out */
export function lookNow(): Promise<number> {
  if (running) return running;
  if (Date.now() - last < 30_000) return Promise.resolve(0);
  last = Date.now();
  running = runCoach(undefined, new Date(), { active: true })
    .then((sent) => sent.length)
    .catch(() => 0)
    .finally(() => {
      running = null;
    });
  return running;
}
