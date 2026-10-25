// Taps on the water + (or -) in a row: blue water rises from the bottom of the screen with a moving
// wave, a big count above it. The level follows today's water against the target. Touches pass
// through, so the buttons keep working under it. It goes away a moment after the last tap.
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TextStyle, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, FONT } from './theme';

const WAVE_H = 24;

function wavePath(w: number) {
  // Two screen widths of gentle bumps, so sliding by one width loops without a seam
  const step = w / 4;
  let d = `M0 12 Q ${step / 2} 0 ${step} 12`;
  for (let x = step * 2; x <= w * 2 + 0.5; x += step) d += ` T ${x} 12`;
  return `${d} V ${WAVE_H} H 0 Z`;
}

export default function WaterWave({
  active,
  count,
  ml,
  target,
  cup,
}: {
  /** True while taps are coming in */
  active: boolean;
  /** Net taps in this burst, minus taps count down */
  count: number;
  ml: number;
  target: number;
  cup: number;
}) {
  const { width, height } = Dimensions.get('window');
  const show = useRef(new Animated.Value(0)).current;
  const level = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [slide]);

  useEffect(() => {
    Animated.timing(show, { toValue: active ? 1 : 0, duration: active ? 180 : 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [active, show]);

  // From a low base up to about the middle at the daily target, always below the number
  const frac = target > 0 ? Math.max(0, Math.min(1, ml / target)) : 0;
  const rise = 90 + frac * height * 0.45;
  useEffect(() => {
    Animated.spring(level, { toValue: rise, friction: 6, tension: 70, useNativeDriver: true }).start();
  }, [rise, level]);

  useEffect(() => {
    if (!active) return;
    pop.setValue(0.82);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
  }, [count, active, pop]);

  const ty = level.interpolate({ inputRange: [0, height], outputRange: [height, 0], extrapolate: 'clamp' });
  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });
  const n = Math.abs(count);
  const sign = count < 0 ? '−' : '';
  const unit =
    cup === 30 ? (n === 1 ? 'לגימה' : 'לגימות') : cup === 250 ? (n === 1 ? 'כוס' : 'כוסות') : `${((n * cup) / 1000).toFixed(1)} ליטר`;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.layer, { opacity: show }]}>
      <Animated.View style={[s.water, { height, transform: [{ translateY: ty }] }]}>
        <Animated.View style={{ position: 'absolute', top: -WAVE_H + 1, left: 0, transform: [{ translateX: tx }] }}>
          <Svg width={width * 2} height={WAVE_H}>
            <Path d={wavePath(width)} fill={C.water} />
          </Svg>
        </Animated.View>
      </Animated.View>
      <View style={[s.center, { top: height * 0.3 }]}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Outlined style={s.big} width={4}>{`${sign}${n}`}</Outlined>
        </Animated.View>
        <Outlined style={s.unit} width={2}>{unit}</Outlined>
        <Outlined style={s.total} width={2}>{`היום ${(Math.round(ml / 100) / 10).toFixed(1)} ליטר${target > 0 ? ` מתוך ${(Math.round(target / 100) / 10).toFixed(1)}` : ''}`}</Outlined>
      </View>
    </Animated.View>
  );
}

/** Text with a light edge around every letter, so it reads on dark cards, on water and on text alike */
function Outlined({ children, style, width }: { children: string; style: TextStyle; width: number }) {
  const ring: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ring.push([Math.round(Math.cos(a) * width * 10) / 10, Math.round(Math.sin(a) * width * 10) / 10]);
  }
  return (
    <View>
      {ring.map(([x, y], i) => (
        <Text key={i} style={[style, s.edge, { transform: [{ translateX: x }, { translateY: y }] }]}>
          {children}
        </Text>
      ))}
      <Text style={style}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 50, elevation: 50 },
  edge: { position: 'absolute', left: 0, right: 0, top: 0, color: C.bg, textShadowRadius: 0 },
  water: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: C.water, opacity: 0.92 },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 4 },
  big: { fontFamily: FONT.black, fontSize: 120, lineHeight: 140, color: C.ink, includeFontPadding: false, textAlign: 'center' },
  unit: { fontFamily: FONT.bold, fontSize: 20, color: C.ink, textAlign: 'center' },
  total: { fontFamily: FONT.bold, fontSize: 15, color: C.ink, textAlign: 'center' },
});
