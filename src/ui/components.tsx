import { Gear } from './gear';
import { Children, createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { onEnter } from './enter';
import { EnterCtx, useGrow, useGrowNumber, useTabFresh } from './tabEnter';
import { Ionicons } from '@expo/vector-icons';
import { C, FONT, T } from './theme';

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={[T.bold, s.cardTitle]}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Horizontal progress bar that fills from the right, as Hebrew reads. */
export function Bar({ value, max, color = C.accent, height = 10 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const grow = useGrow(pct, { duration: 800, delay: 300 });
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <Animated.View style={{ width, height, borderRadius: height / 2, backgroundColor: color, alignSelf: 'flex-end' }} />
    </View>
  );
}

/** A number inside a Text that counts up into place when the page is entered */
export function GrowNumber({ value, from, format, delay = 60 }: { value: number; from?: number; format: (n: number) => string; delay?: number }) {
  const n = useGrowNumber(value, { duration: 850, delay, from });
  return <>{format(n)}</>;
}

/** Big number with a small unit or target after it, e.g. "200 / 1,925 קלוריות". */
export function BigStat({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <View style={s.bigRow}>
      <Text style={[T.bold, s.big]}>{value}</Text>
      {suffix ? <Text style={[T.muted, s.bigSuffix]}>{suffix}</Text> : null}
    </View>
  );
}

/** Label on the right, value on the left, in one row. */
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={[T.muted, s.rowText]}>{label}</Text>
      <Text style={[T.bold, s.rowText]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 24, padding: 18, gap: 10 },
  cardTitle: { fontSize: 15, color: C.muted },
  track: { backgroundColor: C.track, width: '100%', overflow: 'hidden' },
  bigRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 },
  big: { fontSize: 34, lineHeight: 40 },
  bigSuffix: { fontSize: 15 },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  rowText: { fontSize: 15 },
});

/** The wordmark: nudge, and the dot that does not go away. */
export function Wordmark({ size = 30, animate = false }: { size?: number; animate?: boolean }) {
  // On the home screen the dot drops in and bounces each time the tab opens, like the opening
  const drop = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    drop.setValue(0);
    Animated.timing(drop, { toValue: 1, duration: 900, delay: 120, easing: Easing.bounce, useNativeDriver: true }).start();
  }, [animate, drop]);
  const dot = Math.round(size * 0.27);
  const y = drop.interpolate({ inputRange: [0, 1], outputRange: [-size * 1.4, 0] });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'flex-end', direction: 'ltr' }}>
      <Text style={{ fontFamily: FONT.black, fontSize: size, color: C.ink, includeFontPadding: false, lineHeight: size * 1.2 }}>nudge</Text>
      <Animated.View
        style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: C.signal, marginLeft: 2, marginBottom: size * 0.24, transform: [{ translateY: y }] }}
      />
    </View>
  );
}

/** First screen after the opening: each card rises in a moment after the one above it. */
function Rise({ index, children, tab = false }: { index: number; children: ReactNode; tab?: boolean }) {
  const [waiting] = useState(() => {
    const e = onEnter(() => undefined);
    e.cancel();
    return e.pending;
  });
  const play = waiting || tab;
  const v = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!waiting) {
      // A tab just entered: the cards rise in one after the other, quicker than after the opening
      if (tab) Animated.timing(v, { toValue: 1, duration: 420, delay: Math.max(0, index - 1) * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    const e = onEnter(() =>
      Animated.timing(v, { toValue: 1, duration: 480, delay: 120 + index * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(),
    );
    if (!e.pending) v.setValue(1);
    return e.cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, index, v]);
  if (!play) return <>{children}</>;
  const y = v.interpolate({ inputRange: [0, 1], outputRange: [waiting ? 28 : 18, 0] });
  // gap: a fragment inside keeps the page's spacing between its cards
  return <Animated.View style={{ gap: 14, opacity: v, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

/** A place inside a page that search can jump to: the page scrolls to it and it lights up for a moment. */
const AnchorCtx = createContext<{ focus?: string; found: (id: string, y: number) => void }>({ found: () => undefined });

export function Anchor({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(AnchorCtx);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (ctx.focus !== id) return;
    setLit(true);
    const t = setTimeout(() => setLit(false), 2200);
    return () => clearTimeout(t);
  }, [ctx.focus, id]);
  return (
    <View onLayout={(e) => ctx.found(id, e.nativeEvent.layout.y)}>
      {children}
      {lit && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 2.5, borderColor: C.signal }]} />}
    </View>
  );
}

/** Scrollable page with a large title and pull to refresh. */
export function Screen({
  title,
  subtitle,
  refreshing = false,
  onRefresh,
  children,
  brand = false,
  onBack,
  backLabel = 'חזרה',
  focus,
  enter,
  brandSide,
}: {
  /** Shown beside the logo on the home screen */
  brandSide?: ReactNode;
  /** A tab name: its contents grow into place when the tab is entered */
  enter?: string;
  /** An Anchor id to scroll to and light up */
  focus?: string;
  brand?: boolean;
  /** A back button that stays on top while the page scrolls */
  onBack?: () => void;
  backLabel?: string;
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  // The spinner shows only for a pull; loading when the tab opens happens quietly
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    if (!refreshing) setPulled(false);
  }, [refreshing]);
  const scroll = useRef<ScrollView>(null);
  const jumped = useRef<string | undefined>(undefined);
  const found = (id: string, y: number) => {
    if (!focus || id !== focus || jumped.current === focus) return;
    jumped.current = focus;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 70), animated: true }), 250);
  };
  const fresh = useTabFresh(enter);
  return (
    <EnterCtx.Provider value={fresh}>
    <AnchorCtx.Provider value={{ focus, found }}>
    <ScrollView
      ref={scroll}
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={pulled && refreshing}
            onRefresh={() => {
              setPulled(true);
              onRefresh();
            }}
            colors={[C.signal]}
            tintColor={C.signal}
            progressBackgroundColor={C.card}
          />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={onBack ? [0] : undefined}
    >
      {onBack ? (
        <View style={{ backgroundColor: C.bg, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
          <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => [{ alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 42, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14 }, pressed && { opacity: 0.7 }]}>
            <Ionicons name="chevron-forward" size={16} color={C.ink} />
            <Text style={[T.bold, { fontSize: 15 }]}>{backLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      {brand ? (
        <Rise index={0}>
          {/* The logo, and beside it what the coach knows right now (where he is) */}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark animate />
            {brandSide}
          </View>
        </Rise>
      ) : null}
      <Rise index={1}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            {subtitle ? <Text style={[T.muted, { fontSize: 14 }]}>{subtitle}</Text> : null}
            <Text style={[T.bold, { fontSize: 28, lineHeight: 36 }]}>{title}</Text>
          </View>
          <Gear />
        </View>
      </Rise>
      {Children.toArray(children).map((c, i) => (
        <Rise key={(c as any)?.key ?? i} index={i + 2} tab={fresh}>
          {c}
        </Rise>
      ))}
    </ScrollView>
    </AnchorCtx.Provider>
    </EnterCtx.Provider>
  );
}

/** Small vertical bar chart. Bars at or above `target` are drawn in the accent color. */
export function MiniBars({
  values,
  labels,
  target,
  max,
  color = C.protein,
  height = 80,
}: {
  values: number[];
  labels: string[];
  target?: number;
  max?: number;
  color?: string;
  height?: number;
}) {
  const top = Math.max(max ?? 0, target ?? 0, ...values, 1);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, height }}>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View
              style={{
                height: Math.max(3, (v / top) * height),
                backgroundColor: target !== undefined && v >= target ? C.accent : color,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
        {labels.map((l, i) => (
          <Text key={i} style={[T.muted, { flex: 1, textAlign: 'center', fontSize: 12 }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s2.btn, pressed && { opacity: 0.85 }]}>
      <Text style={[T.bold, { color: '#fff', textAlign: 'center', fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}

const s2 = StyleSheet.create({
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16 },
});

/** A white card holding rows that open their details. */
export function RowsCard({ children }: { children: ReactNode }) {
  return <View style={r.card}>{children}</View>;
}

/** One line that opens its details: a title, one line under it, a dot when something is new or missing. */
export function OpenRow({ title, sub, dot, onPress, first, right }: { title: string; sub?: string; dot?: boolean; onPress: () => void; first?: boolean; right?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [r.line, !first && r.sep, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[T.bold, { fontSize: 15 }]}>{title}</Text>
        {sub ? (
          <View style={r.sub}>
            {dot && <View style={r.dot} />}
            <Text style={[T.muted, { fontSize: 13, flex: 1 }]} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        ) : null}
      </View>
      {right}
      <Ionicons name="chevron-back" size={16} color={C.muted} />
    </Pressable>
  );
}

const r = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 18 },
  line: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  sub: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.signal },
});
