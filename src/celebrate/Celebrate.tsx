// The moment on the screen: the logo's orange dot in four ways (the sketch the user chose).
//   workout: the dot drops in, bounces, and bursts into small dots
//   day:     four dots in the targets' colors come together into one
//   low:     the big one, more dots and a little longer
//   streak:  seven dots light up one after another
// One to two seconds, then gone. With reduce motion on, only the words show.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { C, FONT } from '../ui/theme';
import type { Celebration } from './due';

const DOT = '#E06A45';
const INK = '#1E1B18';
const GOALS_COLORS = ['#C9862B', '#C4553A', '#2F5D8A', '#3E7A55'];

export default function Celebrate({ c, onDone }: { c: Celebration; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState<boolean | null>(null);
  // The screen re-renders while this plays: keep the latest callback without restarting
  const done = useRef(onDone);
  done.current = onDone;
  const big = c.kind === 'low';
  const dur = big ? 2000 : 1500;

  const parts = useMemo(() => {
    const n = c.kind === 'low' ? 22 : c.kind === 'workout' ? 12 : 0;
    return Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n + ((i * 37) % 10) / 30;
      const d = (big ? 90 : 70) + ((i * 53) % 40);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d + 30, r: 3 + ((i * 29) % 4), color: i % 3 ? DOT : INK };
    });
  }, [c.kind, big]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => setReduce(false));
  }, []);

  useEffect(() => {
    if (reduce === null) return;
    const wordIn = Animated.spring(word, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 });
    const wordOut = Animated.timing(word, { toValue: 0, duration: 250, useNativeDriver: true });
    if (reduce) {
      Animated.sequence([wordIn, Animated.delay(1400), wordOut]).start(() => done.current());
      return;
    }
    const show = c.kind === 'streak' ? 0.7 : c.kind === 'day' ? 0.55 : 0.35;
    Animated.parallel([
      Animated.timing(t, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      Animated.sequence([Animated.delay(dur * show), wordIn, Animated.delay(dur * (1 - show) + 500), wordOut]),
    ]).start(() => done.current());
  }, [reduce, c.kind, dur, t, word]);

  const range = (a: number, b: number, from: number, to: number) => t.interpolate({ inputRange: [0, a, b, 1], outputRange: [from, from, to, to], extrapolate: 'clamp' });

  const dot = (key: string, size: number, color: string, style: object) => (
    <Animated.View key={key} style={[s.dot, { width: size * 2, height: size * 2, borderRadius: size, backgroundColor: color, marginLeft: -size, marginTop: -size }, style]} />
  );

  let marks: React.ReactNode = null;
  if (!reduce && reduce !== null) {
    if (c.kind === 'workout' || c.kind === 'low') {
      // The drop: from above, a bounce, settle; then the burst
      const y = t.interpolate({ inputRange: [0, 0.2, 0.27, 0.35, 1], outputRange: [-120, 0, -22, 0, 0], extrapolate: 'clamp' });
      const shrink = range(0.35, 0.5, 1, 0);
      marks = (
        <>
          {dot('main', 14, DOT, { transform: [{ translateY: y }, { scale: shrink }] })}
          {parts.map((p, i) => {
            const e = t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1], easing: Easing.out(Easing.cubic), extrapolate: 'clamp' });
            return dot(`p${i}`, p.r, p.color, {
              opacity: range(0.35, 1, 1, 0),
              transform: [{ translateX: e.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) }, { translateY: e.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) }, { scale: range(0.35, 1, 1, 0.4) }],
            });
          })}
        </>
      );
    } else if (c.kind === 'day') {
      const e = t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1], easing: Easing.out(Easing.cubic), extrapolate: 'clamp' });
      marks = (
        <>
          {GOALS_COLORS.map((col, i) => {
            const a = Math.PI / 4 + (i * Math.PI) / 2;
            return dot(`g${i}`, 10, col, {
              opacity: range(0.5, 0.7, 1, 0),
              transform: [{ translateX: e.interpolate({ inputRange: [0, 1], outputRange: [Math.cos(a) * 80, 0] }) }, { translateY: e.interpolate({ inputRange: [0, 1], outputRange: [Math.sin(a) * 80, 0] }) }],
            });
          })}
          {dot('one', 14, DOT, {
            opacity: t.interpolate({ inputRange: [0, 0.5, 0.55, 0.85, 1], outputRange: [0, 0, 1, 1, 0], extrapolate: 'clamp' }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 0.62, 0.75, 1], outputRange: [0, 0, 1.45, 1, 1], extrapolate: 'clamp' }) }],
          })}
        </>
      );
    } else {
      const GAP = 26;
      marks = Array.from({ length: 7 }, (_, j) => {
        const at = j * 0.09;
        const pop = t.interpolate({ inputRange: [0, at, at + 0.06, at + 0.12, 1], outputRange: [1, 1, 1.4, 1, 1], extrapolate: 'clamp' });
        return (
          <Animated.View key={`s${j}`} style={[s.dot, { width: 14, height: 14, borderRadius: 7, marginLeft: -7, marginTop: -7, transform: [{ translateX: (3 - j) * GAP }, { scale: pop }] }]}>
            <View style={[StyleSheet.absoluteFill, { borderRadius: 7, backgroundColor: '#E7E1D8' }]} />
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 7, backgroundColor: j < 4 ? DOT : INK, opacity: range(at, at + 0.02, 0, 1) }]} />
          </Animated.View>
        );
      });
    }
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={s.center}>{marks}</View>
      <Animated.View style={[s.words, { opacity: word, transform: [{ scale: word.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
        <Text style={s.title}>{c.title}</Text>
        <Text style={s.sub}>{c.sub}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { position: 'absolute', left: '50%', top: '40%', width: 0, height: 0 },
  dot: { position: 'absolute', left: 0, top: 0 },
  words: { position: 'absolute', left: 0, right: 0, top: '48%', alignItems: 'center', paddingHorizontal: 24 },
  title: { fontFamily: FONT.black, fontSize: 26, color: C.ink, textAlign: 'center' },
  sub: { fontFamily: FONT.regular, fontSize: 15, color: C.muted, textAlign: 'center', marginTop: 2 },
});
