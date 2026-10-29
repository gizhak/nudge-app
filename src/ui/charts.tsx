import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Circle as Dot } from 'react-native-svg';
import { C, FONT, T } from './theme';

import { ROW, RTL } from '../i18n';
/** Progress ring with the value in the middle and a label under it. */
export function Ring({
  value,
  max,
  color,
  label,
  center,
  sub,
  size = 96,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  center: string;
  sub?: string;
  size?: number;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.track} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * pct} ${circ}`}
            // Start at 12 o'clock and fill counterclockwise, the way Hebrew reads
            transform={`translate(${size} 0) scale(-1 1) rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>{center}</Text>
          {sub ? <Text style={[T.muted, { fontSize: 11, textAlign: 'center' }]}>{sub}</Text> : null}
        </View>
      </View>
      <Text style={[T.bold, { fontSize: 13, textAlign: 'center', color: C.muted }]}>{label}</Text>
    </View>
  );
}

/**
 * Daily bars against a target line. Oldest bar on the right, as Hebrew reads.
 * Bars near the target are green, over it amber, under it gray.
 */
export function TargetBars({
  values,
  labels,
  target,
  height = 90,
  tolerance = 0.1,
  overIsBad = true,
}: {
  values: (number | null)[];
  labels: string[];
  target: number;
  height?: number;
  tolerance?: number;
  overIsBad?: boolean;
}) {
  const top = Math.max(target * 1.3, ...values.map((v) => v ?? 0), 1);
  const color = (v: number) => {
    if (v >= target * (1 - tolerance) && v <= target * (1 + tolerance)) return C.accent;
    if (v > target * (1 + tolerance)) return overIsBad ? C.warn : C.accent;
    return '#D6D2CB';
  };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height }}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: (target / top) * height, borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.muted }} />
        <View style={{ flexDirection: ROW, alignItems: 'flex-end', gap: 8, height }}>
          {values.map((v, i) => (
            <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              {v === null || v === 0 ? (
                <View style={{ height: 3, backgroundColor: C.track, borderRadius: 2 }} />
              ) : (
                <View style={{ height: Math.max(3, (v / top) * height), backgroundColor: color(v), borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              )}
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: ROW, gap: 8 }}>
        {labels.map((l, i) => (
          <Text key={i} style={[T.muted, { flex: 1, textAlign: 'center', fontSize: 12 }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Simple line for a trend (weight). Oldest point on the reading start side. */
export function TrendLine({ values, height = 80, width = 300, ends }: { values: number[]; height?: number; width?: number; ends?: [string, string] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.5);
  const pad = 8;
  const pts = values.map((v, i) => {
    // Time runs the way reading does: oldest at the start side (right in Hebrew, left in English)
    const along = (i / (values.length - 1)) * (width - 2 * pad);
    const x = RTL ? width - pad - along : pad + along;
    const y = pad + (1 - (v - min) / span) * (height - 2 * pad);
    return [x, y] as const;
  });
  const last = pts[pts.length - 1];
  return (
    <View style={{ gap: 2 }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke={C.track} strokeWidth={1} />
        <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
        <Dot cx={last[0]} cy={last[1]} r={4} fill={C.signal} />
      </Svg>
      <View style={{ flexDirection: ROW, justifyContent: 'space-between' }}>
        <Text style={[T.muted, { fontSize: 12, fontFamily: FONT.regular }]}>{values[0].toFixed(1)}{ends ? ` · ${ends[0]}` : ''}</Text>
        <Text style={[T.muted, { fontSize: 12, fontFamily: FONT.regular }]}>{values[values.length - 1].toFixed(1)}{ends ? ` · ${ends[1]}` : ''}</Text>
      </View>
    </View>
  );
}
