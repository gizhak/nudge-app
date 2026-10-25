// A notification opens something once. The tab's screen mounts again on every visit with the
// same tick, so each tick is remembered here and handled only the first time.
const handled = new Map<string, number>();

export function firstTime(key: string, tick: number): boolean {
  if (!tick || handled.get(key) === tick) return false;
  handled.set(key, tick);
  return true;
}
