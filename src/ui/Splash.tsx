// The opening: the orange dot drops in, bounces and lands at the end of "nudge",
// the word takes the hit with a small push. Loops until the app is ready, at least one landing.
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { startEnter } from './enter';
import { C, FONT } from './theme';

const CYCLE = 2200;
/** It leaves right after the second landing, when the word is still: about 4 seconds */
const LEAVE_AT = 1.8 * CYCLE;
const LETTERS = ['n', 'u', 'd', 'g', 'e'];

export default function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const away = useRef(new Animated.Value(0)).current;
  const start = useRef(Date.now()).current;
  const leaving = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: true }));
    const barLoop = Animated.loop(Animated.timing(bar, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    barLoop.start();
    return () => {
      loop.stop();
      barLoop.stop();
    };
  }, [t, bar]);

  useEffect(() => {
    if (!ready || leaving.current) return;
    // The next still moment (the word settled after a landing) from the second landing on
    const elapsed = Date.now() - start;
    let at = LEAVE_AT;
    while (at < elapsed) at += CYCLE;
    const wait = at - elapsed;
    const id = setTimeout(() => {
      leaving.current = true;
      // The word flies up to where the logo sits on the home screen while the cards rise in
      startEnter();
      Animated.parallel([
        Animated.timing(away, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 420, delay: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => onDone());
    }, wait);
    return () => clearTimeout(id);
  }, [ready, fade, onDone, start]);

  // The fall speeds up like gravity, then two smaller bounces
  const y = t.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.38, 0.43, 0.48, 0.54, 0.6, 0.64, 0.68, 0.72, 0.76, 1],
    outputRange: [-260, -242, -188, -98, 0, -52, -70, -52, 0, -14, -18, -14, 0, 0],
  });
  const sx = t.interpolate({ inputRange: [0, 0.36, 0.38, 0.42, 0.48, 0.58, 0.6, 0.64, 1], outputRange: [1, 1, 1.35, 1, 0.9, 1, 1.15, 1, 1] });
  const sy = t.interpolate({ inputRange: [0, 0.36, 0.38, 0.42, 0.48, 0.58, 0.6, 0.64, 1], outputRange: [1.2, 1.2, 0.6, 1, 1.1, 1, 0.85, 1, 1] });
  const push = t.interpolate({ inputRange: [0, 0.78, 0.84, 0.9, 0.96, 1], outputRange: [0, 0, -6, 3, 0, 0] });

  const { width, height } = Dimensions.get('window');
  const flyX = away.interpolate({ inputRange: [0, 1], outputRange: [0, width / 2 - 70] });
  const flyY = away.interpolate({ inputRange: [0, 1], outputRange: [0, -(height / 2 - 70)] });
  const shrink = away.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });
  const ground = fade.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={[StyleSheet.absoluteFill, s.layer]} pointerEvents={leaving.current ? 'none' : 'auto'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, opacity: ground }]} />
      <Animated.View style={[s.word, { opacity: fade, transform: [{ translateX: flyX }, { translateY: flyY }, { scale: shrink }, { translateX: push }] }]}>
        {LETTERS.map((ch, i) => {
          const d = i * 0.023;
          const op = t.interpolate({ inputRange: [0, 0.3 + d, 0.45 + d, 0.97, 1], outputRange: [0, 0, 1, 1, 0] });
          const ty = t.interpolate({ inputRange: [0, 0.3 + d, 0.45 + d, 1], outputRange: [14, 14, 0, 0] });
          return (
            <Animated.Text key={ch} style={[s.letter, { opacity: op, transform: [{ translateY: ty }] }]}>
              {ch}
            </Animated.Text>
          );
        })}
        <Animated.View style={[s.dot, { transform: [{ translateY: y }, { scaleX: sx }, { scaleY: sy }] }]} />
      </Animated.View>
      <Animated.View style={[s.track, { opacity: fade }]}>
        <Animated.View style={[s.fill, { transform: [{ scaleX: bar }] }]} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  layer: { alignItems: 'center', justifyContent: 'center', zIndex: 100, elevation: 100 },
  word: { flexDirection: 'row', alignItems: 'flex-end', direction: 'ltr' },
  letter: { fontFamily: FONT.black, fontSize: 60, lineHeight: 72, color: C.ink, letterSpacing: -1.5, includeFontPadding: false },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.signal, marginLeft: 4, marginBottom: 14 },
  track: { position: 'absolute', bottom: 120, width: 120, height: 4, borderRadius: 2, backgroundColor: '#E9E3D9', overflow: 'hidden' },
  fill: { width: 120, height: 4, borderRadius: 2, backgroundColor: C.ink, transformOrigin: 'right' },
});
