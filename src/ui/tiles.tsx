// The calm look: white tiles, one big number each, color only on the data mark.
import { ReactNode, useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { C, T } from './theme';
import { EnterCtx, useGrow } from './tabEnter';
import { onEnter } from './enter';
import { GrowText } from './grow';

import { ROW, RTL } from '../i18n';
const ACircle = Animated.createAnimatedComponent(Circle);
const APolyline = Animated.createAnimatedComponent(Polyline);

/**
 * A small ring with no text inside: the number sits next to it. Fills counterclockwise.
 * When `replay` changes (a glass of water added) it sweeps again from empty up to where it stands, like recharging.
 */
export function MiniRing({ value, max, color, size = 46, icon, replay }: { value: number; max: number; color: string; size?: number; icon?: ReactNode; replay?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fresh = useContext(EnterCtx);
  const sweep = useRef(new Animated.Value(fresh ? 0 : pct)).current;
  const first = useRef(true);
  const mountedAt = useRef(Date.now()).current;
  useEffect(() => {
    // The page was just entered: sweep into place, also when the data arrives a moment later
    if (fresh && Date.now() - mountedAt < 4000) {
      const wasFirst = first.current;
      first.current = false;
      let a: Animated.CompositeAnimation | null = null;
      const run = () => {
        a = Animated.timing(sweep, { toValue: pct, duration: 900, delay: wasFirst ? 120 : 0, easing: Easing.out(Easing.cubic), useNativeDriver: false });
        a.start();
      };
      const e = onEnter(run);
      if (!e.pending) run();
      return () => {
        e.cancel();
        a?.stop();
      };
    }
    if (first.current) {
      first.current = false;
      sweep.setValue(pct);
      return;
    }
    if (replay === undefined) {
      sweep.setValue(pct);
      return;
    }
    sweep.setValue(0);
    Animated.timing(sweep, { toValue: pct, duration: 650 + pct * 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [replay, pct, sweep]);
  const dash = sweep.interpolate({ inputRange: [0, 1], outputRange: [`0 ${circ}`, `${circ} ${circ}`] });
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.track} strokeWidth={stroke} fill="none" />
        {pct > 0 && (
          <ACircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={dash as any}
            transform={`translate(${size} 0) scale(-1 1) rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {icon ? <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{icon}</View> : null}
    </View>
  );
}

/** One fact: a mark, a big number, a few words under it. */
export function Tile({ mark, value, label, sub, onPress, right }: { mark: ReactNode; value: string; label: string; sub?: string; onPress?: () => void; right?: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.tile, pressed && { opacity: 0.8 }]}>
      {mark}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[T.bold, { fontSize: 21, lineHeight: 26 }]} numberOfLines={1}>
          <GrowText text={value} />
        </Text>
        <Text style={[T.muted, { fontSize: 12 }]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={[T.muted, { fontSize: 12 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** Two tiles a row. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={s.grid}>{children}</View>;
}

/** A short task: done ones crossed out, the one that needs action with an orange edge. */
export function Chip({ label, done, urgent, icon, onPress }: { label: string; done?: boolean; urgent?: boolean; icon?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.chip, urgent && !done && s.chipUrgent, pressed && { opacity: 0.75 }]}>
      {icon}
      <Text style={[done ? T.muted : T.bold, { fontSize: 14 }, done && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A tiny trend line, oldest on the right as Hebrew reads, the last point marked. */
export function Sparkline({
  values,
  color,
  width = 104,
  height = 36,
  onPick,
  picked,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  /** A tap on the line picks the nearest point */
  onPick?: (index: number) => void;
  /** The picked point, marked with a line down and a ring */
  picked?: number | null;
}) {
  // Drawn from the oldest point to today when the page is entered, then the dot pops
  const draw = useGrow(1, { duration: 950, delay: 150 });
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = 4;
  // Time runs the way reading does: oldest at the start side (right in Hebrew, left in English)
  const pts = values.map((v, i) => [RTL ? width - pad - (i / (values.length - 1)) * (width - 2 * pad) : pad + (i / (values.length - 1)) * (width - 2 * pad), pad + (1 - (v - lo) / (hi - lo || 1)) * (height - 2 * pad)]);
  const last = pts[pts.length - 1];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const offset = draw.interpolate({ inputRange: [0, 1], outputRange: [len, 0] });
  const r = draw.interpolate({ inputRange: [0, 0.85, 0.95, 1], outputRange: [0, 0, 6, 4] });
  const chart = (
    <Svg width={width} height={height} style={{ overflow: 'visible' }}>
      <APolyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${len} ${len}`}
        strokeDashoffset={offset as any}
      />
      <ACircle cx={last[0]} cy={last[1]} r={r as any} fill={C.signal} />
      {picked != null && pts[picked] && (
        <>
          <Line x1={pts[picked][0]} y1={0} x2={pts[picked][0]} y2={height} stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
          <Circle cx={pts[picked][0]} cy={pts[picked][1]} r={6} fill="none" stroke={color} strokeWidth={2} />
        </>
      )}
    </Svg>
  );
  if (!onPick) return chart;
  // The whole line is the target: the nearest point by where the finger landed
  return (
    <Pressable
      onPress={(e) => {
        const x = e.nativeEvent.locationX;
        let best = 0;
        pts.forEach((p, i) => {
          if (Math.abs(p[0] - x) < Math.abs((pts[best]?.[0] ?? 0) - x)) best = i;
        });
        onPick(best);
      }}
      hitSlop={10}
    >
      {chart}
    </Pressable>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: ROW, flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: C.card,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: ROW,
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    flexDirection: ROW,
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: C.card,
  },
  chipUrgent: { borderColor: C.signal },
});

/** Two rings, one inside the other: the day's calories outside, protein inside. */
function GrowRing({ size, r, w, v, delay }: { size: number; r: number; w: number; v: { value: number; max: number; color: string }; delay: number }) {
  const circ = 2 * Math.PI * r;
  const pct = v.max > 0 ? Math.max(0, Math.min(1, v.value / v.max)) : 0;
  const grow = useGrow(pct, { duration: 900, delay });
  const dash = grow.interpolate({ inputRange: [0, 1], outputRange: [`0 ${circ}`, `${circ} ${circ}`] });
  return (
    <>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.track} strokeWidth={w} fill="none" />
      {pct > 0 && (
        <ACircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={v.color}
          strokeWidth={w}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash as any}
          transform={`translate(${size} 0) scale(-1 1) rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </>
  );
}

/** Two rings, calories outside and protein inside; they sweep into place when the page is entered. */
export function DoubleRing({ outer, inner, size = 112 }: { outer: { value: number; max: number; color: string }; inner: { value: number; max: number; color: string }; size?: number }) {
  return (
    <Svg width={size} height={size}>
      <GrowRing size={size} r={size / 2 - 7} w={11} v={outer} delay={60} />
      <GrowRing size={size} r={size / 2 - 24} w={9} v={inner} delay={180} />
    </Svg>
  );
}
