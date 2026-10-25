// The first entrance after the opening animation: screens wait for the splash to start leaving,
// then their cards rise in one after another. Later screens show at once.
type Fn = () => void;
let fired = false;
const waiting = new Set<Fn>();

export function startEnter() {
  if (fired) return;
  fired = true;
  for (const f of waiting) f();
  waiting.clear();
}

/** Calls `f` when the entrance starts; returns false when it already happened (show at once). */
export function onEnter(f: Fn): { pending: boolean; cancel: () => void } {
  if (fired) return { pending: false, cancel: () => undefined };
  waiting.add(f);
  return { pending: true, cancel: () => waiting.delete(f) };
}
