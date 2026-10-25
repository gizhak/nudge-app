// The week laid out as he wants it: seven days, a workout or nothing on each. Hold a workout to lift it
// and drag it to another day (an empty day takes it, a day with a workout trades places with it); a tap
// opens its time and session; a tap on an empty day adds one. This week only, or the fixed plan.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DAY_NAMES, getWeekOverrides, pad2, planThisWeek, PlannedWorkout, SESSIONS, sessionOf, SHORT_SESSION_ID, weekStartKey, WeekOverrides } from '../config/goals';
import { saveWeekOverrides } from '../coach/store';
import { noteChange } from '../coach/replies';
import { applyReminders } from '../notifications/schedule';
import { loadSettings } from '../notifications/settings';
import { applyDerived, derive } from '../profile/derive';
import { loadProfile, saveProfile } from '../profile/profile';
import { TimeStepper } from '../ui/inputs';
import { Sheet } from '../ui/Sheet';
import { C, FONT, T } from '../ui/theme';

type Slot = { session: string; time: number } | null;
const ROW = 62;
const HOLD_MS = 280;
const hm = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const short = (id: string) => sessionOf(id).title;

function weekFrom(plan: PlannedWorkout[]): Slot[] {
  const w: Slot[] = Array(7).fill(null);
  for (const p of plan) if (!w[p.day]) w[p.day] = { session: p.short ? SHORT_SESSION_ID : p.session, time: p.hour * 60 + p.minute };
  return w;
}

export default function WeekPlanner({ open, onClose, done }: { open: boolean; onClose: (changed: boolean) => void; done: Set<number> }) {
  const now = new Date();
  const today = now.getDay();
  const start = useMemo(() => weekFrom(planThisWeek(now)), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [week, setWeek] = useState<Slot[]>(start);
  const [always, setAlways] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const y = useRef(new Animated.Value(0)).current;
  const listTop = useRef(0);
  const listRef = useRef<View>(null);
  useEffect(() => {
    if (open) {
      setWeek(start);
      setAlways(false);
      setEdit(null);
    }
  }, [open, start]);

  // Past days are done: nothing moves onto them or off them, today included once trained
  const locked = (i: number) => i < today || (i === today && done.has(i));
  const ids = Object.keys(SESSIONS).filter((k) => k !== SHORT_SESSION_ID);

  // The gesture state lives in refs: the responder is made once
  const st = useRef({ week, drag: null as number | null, timer: null as ReturnType<typeof setTimeout> | null, startY: 0, moved: false, index: -1 });
  st.current.week = week;
  const indexAt = (pageY: number) => Math.max(0, Math.min(6, Math.floor((pageY - listTop.current) / ROW)));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      // Rows are counted from where the finger went down (layout can shift while dragging)
      onPanResponderGrant: (e) => {
        const s = st.current;
        s.startY = e.nativeEvent.pageY;
        s.moved = false;
        s.drag = null;
        if (s.timer) clearTimeout(s.timer);
        const pageY = e.nativeEvent.pageY;
        listRef.current?.measure((_x, _y, _w, _h, _px, top) => {
          listTop.current = top + 4;
          const i = indexAt(pageY);
          s.index = i;
          if (!s.week[i] || locked(i)) return;
          s.timer = setTimeout(() => {
            if (s.moved) return;
            s.drag = i;
            y.setValue(i * ROW);
            setDrag(i);
            setHover(i);
            setLanded(null);
          }, HOLD_MS);
        });
      },
      onPanResponderMove: (_e, g) => {
        const s = st.current;
        if (Math.abs(g.dy) > 8) s.moved = true;
        if (s.drag == null) return;
        y.setValue(Math.max(0, Math.min(6 * ROW, s.drag * ROW + g.dy)));
        setHover(Math.max(0, Math.min(6, s.drag + Math.round(g.dy / ROW))));
      },
      onPanResponderRelease: (_e, g) => {
        const s = st.current;
        if (s.timer) clearTimeout(s.timer);
        if (s.drag != null) {
          const from = s.drag;
          const to = Math.max(0, Math.min(6, from + Math.round(g.dy / ROW)));
          s.drag = null;
          setDrag(null);
          setHover(null);
          if (to !== from && !locked(to)) {
            const next = s.week.slice();
            next[to] = s.week[from];
            next[from] = s.week[to];
            setWeek(next);
            setLanded(to);
          }
          return;
        }
        // A tap: edit the day's workout, or add one on a free day
        if (!s.moved) {
          const i = s.index;
          if (i < 0 || locked(i)) return;
          if (!s.week[i]) {
            const before = s.week.slice(0, i).reverse().find(Boolean) ?? s.week.find(Boolean);
            setWeek(s.week.map((x, k) => (k === i ? { session: ids[0] ?? 'A', time: before?.time ?? 20 * 60 } : x)));
          }
          setEdit(i);
        }
      },
      onPanResponderTerminate: () => {
        const s = st.current;
        if (s.timer) clearTimeout(s.timer);
        s.drag = null;
        setDrag(null);
        setHover(null);
      },
    }),
  ).current;

  const changed = JSON.stringify(week) !== JSON.stringify(start);
  const count = week.filter(Boolean).length;

  const save = async () => {
    const plan: PlannedWorkout[] = week.flatMap((x, day) => (x ? [{ day, hour: Math.floor(x.time / 60), minute: x.time % 60, session: x.session === SHORT_SESSION_ID ? ids[0] : x.session }] : []));
    const ov = getWeekOverrides();
    const key = weekStartKey(now);
    const base: WeekOverrides = ov.week === key ? ov : { week: key, moves: [], skips: [], shorts: [] };
    if (always) {
      // The fixed plan: the profile's training days, each with its session
      const p = await loadProfile();
      const next = { ...p, slots: plan.map((w) => ({ day: w.day, time: w.hour * 60 + w.minute, session: w.session })) };
      await saveProfile(next);
      applyDerived(derive(next));
      await saveWeekOverrides({ ...base, plan: undefined, moves: [], sessionAt: undefined });
    } else {
      // Days he took the workout off are not skipped any more; short versions stay where they still are
      await saveWeekOverrides({ ...base, plan, moves: [], sessionAt: undefined, skips: base.skips.filter((d) => !week[d]), shorts: base.shorts.filter((d) => week[d]?.session === SHORT_SESSION_ID) });
    }
    await applyReminders(await loadSettings()).catch(() => 0);
    const line = plan.map((w) => `${w.day === today ? 'היום' : DAY_NAMES[w.day]} ${short(w.session).split(':')[0]} ב${pad2(w.hour)}:${pad2(w.minute)}`).join(' · ');
    await noteChange(always ? 'קבעתי שבוע חדש' : 'סידרתי את השבוע', `סגור. ${always ? 'מעכשיו כל שבוע' : 'השבוע'}: ${line || 'בלי אימונים'}.`);
    onClose(true);
  };

  const e = edit != null ? week[edit] : null;

  return (
    <Modal visible={open} animationType="slide" onRequestClose={() => onClose(false)} statusBarTranslucent>
      <View style={s.screen}>
        <View style={s.top}>
          <Pressable onPress={() => onClose(false)} style={s.back} hitSlop={8} accessibilityLabel="סגור">
            <Ionicons name="chevron-forward" size={22} color={C.ink} />
          </Pressable>
          {changed && (
            <Pressable onPress={() => setWeek(start)} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 13, color: C.muted, textDecorationLine: 'underline' }]}>לבטל שינויים</Text>
            </Pressable>
          )}
        </View>
        <Text style={[T.bold, { fontSize: 28, fontFamily: FONT.black, paddingHorizontal: 16 }]}>השבוע שלי</Text>
        <View style={s.hint}>
          <Text style={[T.base, { fontSize: 14, lineHeight: 20, color: '#fff' }]}>
            {drag != null ? 'גרור ליום אחר ושחרר. ביום עם אימון הם מתחלפים.' : 'החזק אימון וגרור אותו ליום אחר. לחיצה: שעה וסוג. יום ריק: לחיצה מוסיפה אימון.'}
          </Text>
        </View>

        <View
          ref={listRef}
          style={s.list}
          onLayout={() => listRef.current?.measureInWindow((_x, top) => (listTop.current = top + 4))}
          {...pan.panHandlers}
        >
          {week.map((x, i) => {
            const lock = locked(i);
            const target = drag != null && hover === i && i !== drag && !lock;
            return (
              <View key={i} style={[s.row, i > 0 && s.sep]}>
                <View style={{ width: 54 }}>
                  <Text style={[T.bold, { fontSize: 15, fontFamily: FONT.black, color: i === today ? C.signal : lock ? C.muted : C.ink }]}>{DAY_NAMES[i]}</Text>
                  <Text style={[T.muted, { fontSize: 11 }]}>{i === today ? (done.has(i) ? 'היום, בוצע' : 'היום') : lock ? 'עבר' : ''}</Text>
                </View>
                {x ? (
                  <View style={[s.chip, lock && s.chipLocked, drag === i && { opacity: 0.25 }, target && s.chipTarget, landed === i && s.chipLanded]}>
                    <Text style={[T.bold, { fontSize: 15, color: lock ? C.muted : '#fff', flex: 1 }]} numberOfLines={1}>
                      {short(x.session)}
                    </Text>
                    <Text style={[T.bold, { fontSize: 14, color: lock ? C.muted : '#D8D3CB' }]}>{hm(x.time)}</Text>
                  </View>
                ) : (
                  <View style={[s.empty, target && s.emptyTarget, lock && { opacity: 0.4 }]}>
                    <Text style={[T.bold, { fontSize: 14, color: target ? C.signal : C.muted }]}>{lock ? 'מנוחה' : target ? 'להעביר לכאן' : '+ אימון'}</Text>
                  </View>
                )}
              </View>
            );
          })}
          {drag != null && week[drag] && (
            <Animated.View pointerEvents="none" style={[s.float, { transform: [{ translateY: y }] }]}>
              <Text style={[T.bold, { fontSize: 15, color: '#fff', flex: 1 }]} numberOfLines={1}>
                {short(week[drag]!.session)}
              </Text>
              <Text style={[T.bold, { fontSize: 14, color: '#fff' }]}>{hm(week[drag]!.time)}</Text>
            </Animated.View>
          )}
        </View>

        <View style={s.scope}>
          <Pressable onPress={() => setAlways(false)} style={[s.opt, !always && s.optOn]}>
            <Text style={[T.bold, { fontSize: 14, color: !always ? '#fff' : C.ink }]}>השבוע בלבד</Text>
          </Pressable>
          <Pressable onPress={() => setAlways(true)} style={[s.opt, always && s.optOn]}>
            <Text style={[T.bold, { fontSize: 14, color: always ? '#fff' : C.ink }]}>כל שבוע</Text>
          </Pressable>
        </View>
        <Text style={[T.muted, { fontSize: 12, paddingHorizontal: 16, lineHeight: 18 }]}>
          {always ? `התוכנית הקבועה: ${count} אימונים בשבוע, בימים ובשעות האלה.` : `${count} אימונים השבוע. מהשבוע הבא חוזרים לתוכנית הקבועה.`}
        </Text>

        <View style={s.foot}>
          <Pressable onPress={save} disabled={!changed && !always} style={({ pressed }) => [s.save, (!changed && !always) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
            <Text style={[T.bold, { color: '#fff', fontSize: 16, textAlign: 'center' }]}>שמור</Text>
          </Pressable>
        </View>
      </View>

      <Sheet open={edit != null} onClose={() => setEdit(null)} title={edit != null ? `יום ${DAY_NAMES[edit]}` : undefined}>
        {e && (
          <>
            <View style={s.editRow}>
              <Text style={[T.bold, { fontSize: 15 }]}>שעה</Text>
              <TimeStepper value={e.time} step={30} onChange={(t) => setWeek(week.map((x, k) => (k === edit ? { ...x!, time: t } : x)))} />
            </View>
            <Text style={[T.bold, { fontSize: 15 }]}>איזה אימון</Text>
            <View style={{ gap: 8 }}>
              {ids.map((id) => (
                <Pressable key={id} onPress={() => setWeek(week.map((x, k) => (k === edit ? { ...x!, session: id } : x)))} style={[s.kind, e.session === id && s.kindOn]}>
                  <Text style={[T.bold, { fontSize: 14, color: e.session === id ? '#fff' : C.ink }]}>{short(id)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
              <Pressable onPress={() => setEdit(null)} style={[s.save, { flex: 1 }]}>
                <Text style={[T.bold, { color: '#fff', fontSize: 15, textAlign: 'center' }]}>אישור</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setWeek(week.map((x, k) => (k === edit ? null : x)));
                  setEdit(null);
                }}
                style={[s.remove, { flex: 1 }]}
              >
                <Text style={[T.bold, { color: C.bad, fontSize: 15, textAlign: 'center' }]}>בלי אימון ביום הזה</Text>
              </Pressable>
            </View>
          </>
        )}
      </Sheet>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 44, gap: 10 },
  top: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  hint: { backgroundColor: C.ink, borderRadius: 18, padding: 12, marginHorizontal: 16, minHeight: 66, justifyContent: 'center' },
  list: { backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 4, marginHorizontal: 16 },
  row: { height: ROW, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  chip: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.ink, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  chipLocked: { backgroundColor: C.track },
  chipTarget: { borderWidth: 2, borderColor: C.signal },
  chipLanded: { borderWidth: 2, borderColor: C.accent },
  empty: { flex: 1, borderWidth: 2, borderStyle: 'dashed', borderColor: '#DDD6CC', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
  emptyTarget: { borderColor: C.signal, backgroundColor: '#FDF1EC' },
  float: {
    position: 'absolute',
    top: 4 + (ROW - 46) / 2,
    height: 46,
    right: 76,
    left: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.signal,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  scope: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 14, padding: 4, gap: 4, marginHorizontal: 16 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 },
  optOn: { backgroundColor: C.ink },
  foot: { marginTop: 'auto', paddingHorizontal: 16, paddingBottom: 24 },
  save: { backgroundColor: C.ink, borderRadius: 16, paddingVertical: 15 },
  remove: { borderWidth: 1.5, borderColor: C.track, borderRadius: 16, paddingVertical: 14, backgroundColor: '#fff' },
  editRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  kind: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: C.bg },
  kindOn: { backgroundColor: C.ink },
});
