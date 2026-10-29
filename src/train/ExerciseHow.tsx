// How a move is done: a window in the middle of the screen with the start and end photos shown in turn,
// the sets and reps, and the session's other moves a swipe or an arrow away. No instructions, by design.
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../config/goals';
import { C, FONT, T } from '../ui/theme';
import { choicesOf, picsOf } from './exercisePics';
import LoadEditor from './LoadEditor';
import { Load, loadKey, loadLoads } from './loads';

import { CHEVRON_BACK, CHEVRON_ON, ROW, START, t as tr } from '../i18n';
import { moveName, repsText } from '../i18n/moves';
const FLIP_MS = 900;

/** Reps like "40 שניות" carry their own unit; plain numbers are repetitions */
function repsParts(reps: string): { big: string; unit: string } {
  const m = reps.match(/^(.*?\d)\s+(שניות|דקות|דקה)$/);
  return m ? { big: repsText(m[1]), unit: repsText(m[2]) } : { big: repsText(reps), unit: tr('חזרות', 'reps') };
}

export default function ExerciseHow({ list, start, onClose, onLoads }: { list: Exercise[]; start: number | null; onClose: () => void; onLoads?: () => void }) {
  const [i, setI] = useState(start ?? 0);
  const [pick, setPick] = useState(0);
  const [flip, setFlip] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (start != null) loadLoads().then(setLoads).catch(() => undefined);
  }, [start]);

  useEffect(() => {
    if (start != null) {
      setI(start);
      setPick(0);
    }
  }, [start]);

  // Start and end position in turn, while open
  useEffect(() => {
    if (start == null) return;
    const t = setInterval(() => setFlip((f) => !f), FLIP_MS);
    return () => clearInterval(t);
  }, [start]);
  useEffect(() => {
    Animated.timing(fade, { toValue: flip ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [flip, fade]);

  const go = (n: number) => {
    if (n < 0 || n >= list.length) return;
    setI(n);
    setPick(0);
    setFlip(false);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const iRef = useRef(i);
  iRef.current = i;
  // Hebrew pages run right to left: a swipe to the right brings the next move
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) goRef.current(iRef.current + 1);
        else if (g.dx < -50) goRef.current(iRef.current - 1);
      },
    }),
  ).current;

  const e = list[Math.min(i, list.length - 1)];
  if (!e) return null;
  const choices = choicesOf(e.name);
  const name = choices[Math.min(pick, choices.length - 1)];
  const pics = picsOf(name);
  const reps = repsParts(e.reps);
  const first = i === 0;
  const last = i === list.length - 1;

  return (
    <Modal visible={start != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.veil} onPress={onClose} accessibilityLabel={tr("סגור", 'Close')} />
      <View style={s.center} pointerEvents="box-none">
        <View style={s.card} {...pan.panHandlers}>
          <View style={s.top}>
            <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>
              {tr('תרגיל', 'Exercise')} {i + 1} {tr('מתוך', 'of')} {list.length}
            </Text>
            <Pressable onPress={onClose} style={s.close} hitSlop={8} accessibilityLabel={tr("סגור", 'Close')}>
              <Ionicons name="close" size={20} color={C.ink} />
            </Pressable>
          </View>

          {!editing && <View style={s.photo}>
            {pics ? (
              <>
                <Animated.Image source={pics.a} style={[s.img, { opacity: pics.b ? Animated.subtract(1, fade) : 1 }]} resizeMode="contain" />
                {pics.b ? <Animated.Image source={pics.b} style={[s.img, { opacity: fade }]} resizeMode="contain" /> : null}
              </>
            ) : (
              <Text style={[T.muted, { fontSize: 14 }]}>{tr('אין תמונה לתרגיל הזה', 'No photo for this exercise')}</Text>
            )}
          </View>}

          {!editing && choices.length > 1 && (
            <View style={s.toggle}>
              {choices.map((c, k) => (
                <Pressable key={c} onPress={() => setPick(k)} style={[s.opt, k === pick && s.optOn]}>
                  <Text style={[T.bold, { fontSize: 13, color: k === pick ? '#fff' : C.ink }]} numberOfLines={1}>
                    {moveName(c)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={[T.bold, { fontSize: 22, lineHeight: 28 }]}>{moveName(name)}</Text>
          <View style={s.nums}>
            <View style={s.num}>
              <Text style={s.big}>{e.sets}</Text>
              <Text style={[T.muted, { fontSize: 13 }]}>{tr('סטים', 'sets')}</Text>
            </View>
            <View style={s.num}>
              <Text style={s.big}>{reps.big}</Text>
              <Text style={[T.muted, { fontSize: 13 }]}>{reps.unit}</Text>
            </View>
          </View>

          <LoadEditor
            name={e.name}
            load={loads[loadKey(e.name)]}
            onEditing={setEditing}
            onSaved={() => {
              loadLoads().then(setLoads).catch(() => undefined);
              onLoads?.();
            }}
          />

          {!editing && list.length > 1 && (
            <View style={s.nav}>
              <Pressable onPress={() => go(i - 1)} style={[s.arrow, { opacity: first ? 0.35 : 1 }]} disabled={first} accessibilityLabel={tr("התרגיל הקודם", 'Previous exercise')}>
                <Ionicons name={CHEVRON_BACK} size={22} color={C.ink} />
              </Pressable>
              <View style={s.dots}>
                {list.map((_, k) => (
                  <View key={k} style={[s.dot, k === i && s.dotOn]} />
                ))}
              </View>
              <Pressable onPress={() => go(i + 1)} style={[s.arrow, s.arrowNext, { opacity: last ? 0.35 : 1 }]} disabled={last} accessibilityLabel={tr("התרגיל הבא", 'Next exercise')}>
                <Ionicons name={CHEVRON_ON} size={22} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** The small orange play mark on a tag or row that opens the window */
export function HowMark({ size = 16 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.signal, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="play" size={size * 0.55} color="#fff" style={{ marginLeft: size * 0.08 }} />
    </View>
  );
}

const s = StyleSheet.create({
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,26,24,0.6)' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { backgroundColor: '#fff', borderRadius: 28, padding: 16, gap: 12 },
  top: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  photo: { height: 230, borderRadius: 20, backgroundColor: C.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  toggle: { flexDirection: ROW, backgroundColor: C.bg, borderRadius: 14, padding: 4, gap: 4 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 11 },
  optOn: { backgroundColor: C.ink },
  nums: { flexDirection: ROW, gap: 10 },
  num: { flex: 1, backgroundColor: C.bg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  big: { fontFamily: FONT.black, fontSize: 26, color: C.ink, textAlign: START },
  nav: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  arrowNext: { backgroundColor: C.ink },
  dots: { flexDirection: ROW, gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.track },
  dotOn: { width: 20, backgroundColor: C.ink },
});
