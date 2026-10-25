// Small pieces that grow into place when a tab is entered (see tabEnter.ts); still otherwise.
import { ReactNode, useContext, useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { EnterCtx, useGrow, useGrowNumber } from './tabEnter';

const NUM = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s;

/** A text whose first number counts up into place: "1.9 ל'", "4,971", "54 ג'". */
export function GrowText({ text, delay = 120 }: { text: string; delay?: number }) {
  const m = NUM.exec(text);
  const target = m ? Number(m[2].replace(/,/g, '')) : 0;
  const n = useGrowNumber(target, { duration: 850, delay });
  if (!m) return <>{text}</>;
  const decimals = m[2].includes('.') ? m[2].split('.')[1].length : 0;
  const shown = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m[2].includes(',') });
  return <>{`${m[1]}${shown}${m[3]}`}</>;
}

/** Rises and fades in after `delay`; with `pop` it scales up with a small overshoot instead. */
export function Appear({ delay = 0, pop = false, style, children }: { delay?: number; pop?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const v = useGrow(1, { duration: pop ? 380 : 420, delay });
  const t = pop
    ? [{ scale: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1.25, 1] }) }]
    : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }];
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: t }]}>{children}</Animated.View>;
}

/** A soft ring that keeps breathing around something waiting for him, like today's workout. */
export function Pulse({ color, size, on }: { color: string; size: number; on: boolean }) {
  const fresh = useContext(EnterCtx);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(300),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, v, fresh]);
  if (!on) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}
