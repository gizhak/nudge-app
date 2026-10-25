import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { runCoach } from '../coach/engine';
import { ackTopic, didIt, doneSince, loadActed } from '../coach/followupStore';
import { dayKey, loadLog, loadPrefs, loadSnoozes, SentMessage } from '../coach/store';
import { addWater, readWaterToday } from '../health/water';
import { Container, waterText } from '../nutrition/water';
import { Route, routeFor } from '../notifications/route';
import { Gear } from '../ui/gear';
import { C, T } from '../ui/theme';
import { topicLook } from './CoachJournal';
import { loadReplies, mergeReplies, Reply, WORKOUT_TOPICS } from '../coach/replies';
import React from 'react';
import { Meal, readMeals, readWeights } from '../health/history';
import { plateMeal, plates } from '../nutrition/meals';
import { readHourFacts } from '../coach/dayFacts';
import { drinkReply, seedOf } from '../coach/voice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadProfile } from '../profile/profile';
import { acceptGuess, rejectGuess, wifiCheck } from '../coach/wifi';

type Mine = { at: number; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string; sub?: string; water?: boolean; reply?: string };

const drankText = (ml: number, container: number) =>
  container === 30
    ? Math.round(ml / 30) === 1
      ? 'לגימה אחת'
      : `${Math.round(ml / 30)} לגימות`
    : container === 250
      ? ml <= 250
        ? 'כוס'
        : `${Math.round((ml / 250) * 10) / 10} כוסות`
      : `${Math.round(ml / 100) / 10} ליטר`;

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** What he did today, from the data: meals, the weigh-in, workouts. Shown as his side of the chat. */
async function readDoings(): Promise<Mine[]> {
  const out: Mine[] = [];
  const [meals, weights, hf] = await Promise.all([
    readMeals().catch(() => [] as Meal[]),
    readWeights(2).catch(() => [] as { date: Date; kg: number }[]),
    readHourFacts().catch(() => null),
  ]);
  for (const plate of plates(meals)) {
    const p = plateMeal(plate);
    out.push({ at: plate[0].time.getTime(), icon: 'restaurant', color: '#E3B26B', text: `אכלתי: ${p.name}`, sub: `${fmt(p.kcal)} קלוריות · ${fmt(p.protein)} ג' חלבון` });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const w of weights) if (w.date.getTime() >= today.getTime()) out.push({ at: w.date.getTime(), icon: 'scale-outline', color: '#9FD3B0', text: `נשקלתי: ${w.kg.toFixed(1)} ק"ג` });
  for (const x of hf?.workouts ?? []) out.push({ at: x.end, icon: x.run ? 'walk' : 'barbell', color: '#F2A58E', text: `${x.run ? 'רצתי' : 'התאמנתי'} ${x.minutes} דקות` });
  return out;
}

const time = (at: number) => new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const baseOf = (id: string) => id.split('@')[0];
const keyOf = (id: string) => (/^meal_\d+$/.test(id) ? 'food' : /^status_\d+$/.test(id) ? 'status' : baseOf(id));

/** What the button inside a message does, by topic. */
function actionOf(m: SentMessage, container = 250): { label: string; kind: 'water' | 'route' | 'gym'; ml?: number } | null {
  const k = baseOf(m.id);
  if (k === 'wifi_guess') return { label: 'כן, זה חדר הכושר', kind: 'gym' };
  if (k === 'water' || k === 'water_morning') {
    if (container === 30) return { label: '10 לגימות', kind: 'water', ml: 300 };
    if (container > 250) return { label: 'חצי בקבוק', kind: 'water', ml: container / 2 };
    return { label: 'שתיתי כוס', kind: 'water', ml: 250 };
  }
  if (/^(weigh_in|weigh_reminder)/.test(k)) return { label: 'לשקילה', kind: 'route' };
  if (k === 'workout_done') return null;
  if (/^(workout_|missed_workout|week_behind|long_break|home_before_workout)/.test(k)) return { label: 'לאימון', kind: 'route' };
  if (/^(food_none|protein_evening|leave_office_protein|pre_workout_snack|meal_reminder)/.test(k)) return { label: 'לתזונה', kind: 'route' };
  if (k === 'run') return { label: 'לריצה', kind: 'route' };
  if (k === 'craving_evening') return { label: 'בא לי משהו', kind: 'route' };
  return null;
}

/** A conversation with the coach: his messages on the right, your answers on the left, today. */
export default function ChatScreen({ onRoute, tick = 0 }: { onRoute: (r: Route) => void; tick?: number }) {
  const [log, setLog] = useState<SentMessage[] | null>(null);
  const [quiet, setQuiet] = useState<Record<string, number>>({});
  const [acted, setActed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [doings, setDoings] = useState<Mine[]>([]);
  const [who, setWho] = useState<{ name?: string; target: number }>({ target: 0 });
  const [container, setContainer] = useState(250);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const [l, q, a] = await Promise.all([loadLog(), loadSnoozes(), loadActed()]);
    setLog(l.filter((m) => m.day === dayKey()).sort((x, y) => x.at - y.at));
    setQuiet(q);
    setActed(a);
    setReplies(await loadReplies());
    readDoings().then(setDoings).catch(() => undefined);
    try {
      const t = JSON.parse((await AsyncStorage.getItem('coach.waterTarget.v1')) ?? 'null');
      const pr = await loadProfile();
      setWho({ name: pr.name?.trim() || undefined, target: t && t.day === dayKey() ? t.target : 0 });
    } catch {
      // the reply works without them
    }
    setContainer((await loadPrefs()).waterContainer ?? 250);
  }, []);
  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => sub.remove();
  }, [load, tick]);

  if (!log) return <ActivityIndicator style={{ marginTop: 80 }} color={C.ink} />;

  // Only the latest message of a topic carries the answer and the buttons
  const latestOf = new Map<string, number>();
  for (const m of log) latestOf.set(keyOf(m.id), m.at);

  const answer = async (m: SentMessage) => {
    await ackTopic(baseOf(m.id));
    await load();
  };
  const act = async (m: SentMessage) => {
    const a = actionOf(m, container);
    if (!a) return;
    if (a.kind === 'water') {
      try {
        await addWater(a.ml);
        await didIt(['water']);
        const total = await readWaterToday().catch(() => null);
        setNote({ text: `נרשם: ${a.label}.${total != null ? ` היום ${waterText(total, container as Container)}.` : ''}` });
      } catch (e: any) {
        setNote({ text: `לא נשמר: ${String(e?.message ?? e)}. בדוק את הרשאת המים בבדיקת מוכנות.`, bad: true });
      }
      setTimeout(() => setNote(null), 4000);
      return load();
    }
    if (a.kind === 'gym') {
      const ok = await acceptGuess().catch(() => false);
      await ackTopic('wifi_guess').catch(() => undefined);
      setNote(ok ? { text: 'שמרתי. מעכשיו אזהה את חדר הכושר לפי הרשת.' } : { text: 'הרשת כבר לא נראית. אפשר להגדיר אותה בהגדרות, תחת Wi-Fi.', bad: true });
      setTimeout(() => setNote(null), 4000);
      if (ok) {
        const arrived = await wifiCheck().catch(() => null);
        if (arrived) await runCoach(arrived).catch(() => undefined);
      }
      return load();
    }
    onRoute(routeFor(baseOf(m.id)));
  };
  const ask = async () => {
    setBusy(true);
    try {
      await runCoach(undefined, new Date(), { manual: true });
    } finally {
      setBusy(false);
      await load();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.head}>
        <View style={s.avatar}>
          <View style={s.avatarDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[T.bold, { fontSize: 22 }]}>המאמן</Text>
          <Text style={[T.muted, { fontSize: 13 }]}>{log.length ? `${log.length} הודעות היום` : 'עוד לא היו הודעות היום'}</Text>
        </View>
        <Gear />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={s.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {(() => {
          const coachTimes = log.map((x) => x.at);
          const drinks = mergeReplies(replies, coachTimes);
          const mineItems: Mine[] = [
            ...(() => {
              // Each reply knows the one before it, so two in a row never read the same
              const prev: string[] = [];
              return [...drinks].sort((a, b) => a.at - b.at).map((r) => {
                const reply = r.total != null ? drinkReply(r.total, who.target, seedOf(`drink${r.at}`), who.name, prev.slice(-2)) : undefined;
                if (reply) prev.push(reply);
                return { at: r.at, icon: 'water' as const, color: '#9CC3EA', text: `שתיתי ${drankText(r.ml, container)}`, sub: r.total != null ? `היום ${Math.round(r.total / 100) / 10} ליטר` : undefined, water: true, reply };
              });
            })(),
            ...doings,
            // His changes to the workout, each with the coach's answer
            ...replies
              .filter((r) => r.kind === 'plan' && r.text)
              .map((r) => ({ at: r.at, icon: 'calendar' as const, color: '#E9B872', text: r.text!, reply: r.reply })),
          ];
          // Workout messages sent before his last change to the plan are moot now
          const lastChange = Math.max(0, ...replies.filter((r) => r.kind === 'plan').map((r) => r.at));
          type Item = { at: number; coach?: SentMessage; me?: Mine };
          const items: Item[] = [...log.map((m) => ({ at: m.at, coach: m })), ...mineItems.map((x) => ({ at: x.at, me: x }))].sort((a, b) => a.at - b.at);
          let lastStamp = 0;
          return items.map((it, i) => {
            const stamp = it.at - lastStamp > 15 * 60000;
            if (stamp) lastStamp = it.at;
            const stampEl = stamp ? <Text style={s.stamp}>{time(it.at)}</Text> : null;
            if (it.me) {
              const x = it.me;
              return (
                <View key={'me' + x.at + x.text} style={{ gap: 8 }}>
                  {stampEl}
                  <View style={s.me}>
                    <Ionicons name={x.icon} size={15} color={x.color} />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[T.bold, { fontSize: 15, color: '#fff' }]}>{x.text}</Text>
                      {x.sub ? <Text style={[T.base, { fontSize: 12, color: '#C9C6C0' }]}>{x.sub}</Text> : null}
                    </View>
                  </View>
                  {x.reply ? (
                    <View style={s.coachShort}>
                      <Text style={[T.base, { fontSize: 15, lineHeight: 21 }]}>{x.reply}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }
            const m = it.coach!;
            const key = keyOf(m.id);
            const latest = latestOf.get(key) === m.at;
            const done = doneSince(acted, key, m.at);
            const acked = (quiet[baseOf(m.id)] ?? 0) > Date.now();
            const moot = lastChange > m.at && WORKOUT_TOPICS.includes(baseOf(m.id));
            const answerable = key !== 'food' && key !== 'status';
            const look = topicLook(m.id);
            const a = actionOf(m, container);
            const drankAfter = key.startsWith('water') && drinks.some((r) => r.at >= m.at);
            return (
              <View key={m.id + m.at} style={{ gap: 8 }}>
                {stampEl}
                <View style={s.coach}>
                  <View style={s.tag}>
                    <Ionicons name={look.icon} size={13} color={look.color} />
                    <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>{look.label}</Text>
                  </View>
                  <Text style={[T.bold, { fontSize: 16, lineHeight: 22 }]}>{m.title}</Text>
                  <Text style={[T.base, { fontSize: 15, lineHeight: 22, color: '#4A453F' }]}>{m.body}</Text>
                  {moot && <Text style={[T.muted, { fontSize: 13 }]}>עדכנת את האימון אחרי ההודעה הזו.</Text>}
                  {latest && answerable && !done && !acked && !moot && (
                    <View style={s.btns}>
                      {a && (
                        <Pressable onPress={() => act(m)} style={({ pressed }) => [s.btnDark, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: '#fff' }]}>{a.label}</Text>
                        </Pressable>
                      )}
                      {a?.kind === 'gym' ? (
                        // A question gets its two answers, not "got it"
                        <Pressable
                          onPress={async () => {
                            await rejectGuess().catch(() => undefined);
                            await ackTopic('wifi_guess', new Date(), 24 * 3600 * 1000).catch(() => undefined);
                            setNote({ text: 'בסדר, לא אשאל על הרשת הזו שוב.' });
                            setTimeout(() => setNote(null), 4000);
                            load();
                          }}
                          style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}
                        >
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>לא, זה לא חדר הכושר</Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => answer(m)} style={({ pressed }) => [a ? s.btnLight : s.btnDark, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: a ? C.ink : '#fff' }]}>הבנתי</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                {latest && answerable && (done || acked) && !drankAfter && !moot && (
                  <View style={s.me}>
                    <Text style={[T.bold, { fontSize: 15, color: '#fff' }]}>{done ? 'בוצע' : 'הבנתי'}</Text>
                    {done && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                )}
              </View>
            );
          });
        })()}
        {!log.length && <Text style={[T.muted, { fontSize: 14, textAlign: 'center', marginTop: 40 }]}>כשהמאמן יגיד משהו, זה יופיע כאן.</Text>}
      </ScrollView>

      {note && (
        <View style={[s.note, note.bad && { backgroundColor: C.signal }]}>
          <Text style={[T.bold, { fontSize: 14, color: '#fff', textAlign: 'right' }]}>{note.text}</Text>
        </View>
      )}
      <View style={s.bottom}>
        <Pressable onPress={() => onRoute({ tab: 'food', focus: 'craving' })} style={({ pressed }) => [s.quick, { backgroundColor: C.signal }, pressed && { opacity: 0.85 }]}>
          <Text style={[T.bold, { fontSize: 15, color: '#fff', textAlign: 'center' }]}>בא לי משהו</Text>
        </Pressable>
        <Pressable onPress={ask} disabled={busy} style={({ pressed }) => [s.quick, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={C.ink} /> : <Text style={[T.bold, { fontSize: 15, textAlign: 'center' }]}>מה עכשיו?</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  avatarDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.signal },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  stamp: { textAlign: 'center', fontSize: 12, color: '#8A847B' },
  // The coach on the right, its tail corner small; your answers on the left, dark
  coach: { alignSelf: 'flex-end', width: '86%', backgroundColor: C.card, borderRadius: 22, borderBottomRightRadius: 8, padding: 14, gap: 6 },
  coachShort: { alignSelf: 'flex-end', maxWidth: '80%', backgroundColor: C.card, borderRadius: 18, borderBottomRightRadius: 6, paddingVertical: 9, paddingHorizontal: 14 },
  tag: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  btns: { flexDirection: 'row-reverse', gap: 8, paddingTop: 4 },
  btnDark: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  btnLight: { borderWidth: 1, borderColor: '#D9D2C7', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  me: { alignSelf: 'flex-start', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.ink, borderRadius: 22, borderBottomLeftRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  note: { marginHorizontal: 16, marginBottom: 6, backgroundColor: C.water, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bottom: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  quick: { flex: 1, height: 50, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
});
