// Entering a tab: rings, numbers, lines and bars grow into place instead of just appearing.
// Coming back to a tab within a few seconds shows it at once, so quick switching does not nag.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { onEnter } from './enter';

const leftAt: Record<string, number> = {};
const QUICK_BACK_MS = 5000;

/** True when this tab was not seen in the last few seconds; remembers when it is left. */
export function useTabFresh(tab?: string): boolean {
  const [fresh] = useState(() => !!tab && Date.now() - (leftAt[tab] ?? 0) > QUICK_BACK_MS);
  useEffect(
    () => () => {
      if (tab) leftAt[tab] = Date.now();
    },
    [tab],
  );
  return fresh;
}

/** Whether the page around us was just entered */
export const EnterCtx = createContext(false);

/**
 * A value that grows to `to` when the page was just entered (from `from`, 0 by default), and then
 * follows later changes smoothly, like data arriving a moment later. Otherwise it simply sits at `to`.
 */
export function useGrow(to: number, opt: { duration?: number; delay?: number; from?: number } = {}): Animated.Value {
  const fresh = useContext(EnterCtx);
  const { duration = 900, delay = 0, from = 0 } = opt;
  const v = useRef(new Animated.Value(fresh ? from : to)).current;
  const first = useRef(true);
  useEffect(() => {
    if (!fresh) {
      v.setValue(to);
      return;
    }
    const d = first.current ? delay : 0;
    first.current = false;
    let a: Animated.CompositeAnimation | null = null;
    const run = () => {
      a = Animated.timing(v, { toValue: to, duration, delay: d, easing: Easing.out(Easing.cubic), useNativeDriver: false });
      a.start();
    };
    // On the first screen after the opening, wait for the opening to leave
    const e = onEnter(run);
    if (!e.pending) run();
    return () => {
      e.cancel();
      a?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, fresh]);
  return v;
}

/** The shown number of a growing value, for text */
export function useGrowNumber(to: number, opt: { duration?: number; delay?: number; from?: number } = {}): number {
  const fresh = useContext(EnterCtx);
  const v = useGrow(to, opt);
  const [n, setN] = useState(fresh ? opt.from ?? 0 : to);
  useEffect(() => {
    const id = v.addListener(({ value }) => setN(value));
    return () => v.removeListener(id);
  }, [v]);
  return fresh ? n : to;
}
