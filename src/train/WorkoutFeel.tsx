// Inside the coach's "how were the weights?" message: each move of the workout with his weight and
// three answers. Two answers the same way in a row bring the proposal right there, with yes and not now.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sessionOf } from '../config/goals';
import { C, T } from '../ui/theme';
import { answerOffer, Feel, Load, loadKey, loadLoads, loadText, noteFeel } from './loads';

import { ROW, t } from '../i18n';
import { moveName } from '../i18n/moves';
const FEELS: { v: Feel; label: string; on: string; fg: string }[] = [
  { v: 'easy', label: t('קל', 'Easy'), on: '#E6F0E9', fg: '#3E7A55' },
  { v: 'right', label: t('בדיוק', 'Right'), on: '#ECE7DF', fg: C.ink },
  { v: 'hard', label: t('קשה', 'Hard'), on: '#FDF1EC', fg: '#B4532A' },
];

/** "workout_feel@<start>:<session>" into its parts */
export function parseFeelId(id: string): { at: number; session: string } | null {
  const m = id.match(/@(\d+):(.+)$/);
  return m ? { at: Number(m[1]), session: m[2] } : null;
}

export default function WorkoutFeel({ id }: { id: string }) {
  const p = parseFeelId(id);
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const load = useCallback(() => loadLoads().then(setLoads).catch(() => undefined), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!p) return null;
  const moves = sessionOf(p.session).exercises.filter((e) => loads[loadKey(e.name)]);
  if (!moves.length) return null;

  const feel = async (name: string, v: Feel) => {
    await noteFeel(name, p.at, v).catch(() => null);
    load();
  };
  const offer = async (name: string, yes: boolean) => {
    const l = await answerOffer(name, yes).catch(() => null);
    setDone({ ...done, [loadKey(name)]: yes && l ? t(`עודכן: ${loadText(l)}. מהאימון הבא.`, `Updated: ${loadText(l)}. From the next workout.`) : t('בסדר, נשאר כמו שהוא. נבדוק שוב בעוד שני אימונים.', 'OK, it stays as it is. We will check again in two workouts.') });
    load();
  };

  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {moves.map((e) => {
        const k = loadKey(e.name);
        const l = loads[k];
        const mine = l.feels.find((f) => f.at === p.at)?.v;
        return (
          <View key={k} style={s.move}>
            <View style={s.head}>
              <Text style={[T.bold, { fontSize: 14, flexShrink: 1 }]}>{moveName(e.name)}</Text>
              <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{loadText(l)}</Text>
            </View>
            <View style={s.feels}>
              {FEELS.map((f) => (
                <Pressable key={f.v} onPress={() => feel(e.name, f.v)} style={({ pressed }) => [s.feel, mine === f.v && { backgroundColor: f.on, borderColor: f.fg }, pressed && { opacity: 0.8 }]}>
                  <Text style={[T.bold, { fontSize: 14, color: mine === f.v ? f.fg : C.ink }]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            {l.offer && l.offer.at === p.at && (
              <View style={s.offer}>
                <Text style={[T.base, { fontSize: 14, lineHeight: 20 }]}>
                  {l.offer.dir === 'up' ? t('פעמיים ברצף קל.', 'Easy twice in a row.') : t('פעמיים ברצף קשה.', 'Hard twice in a row.')} {l.offer.dir === 'up' ? t('להעלות', 'Raise') : t('להוריד', 'Lower')} {t('ל', 'to')} {loadText({ ...l, value: l.offer.to })}?
                </Text>
                <View style={{ flexDirection: ROW, gap: 8 }}>
                  <Pressable onPress={() => offer(e.name, true)} style={({ pressed }) => [s.yes, pressed && { opacity: 0.85 }]}>
                    <Text style={[T.bold, { fontSize: 14, color: '#fff' }]}>{t('כן,', 'Yes,')} {l.offer.dir === 'up' ? t('להעלות', 'raise') : t('להוריד', 'lower')}</Text>
                  </Pressable>
                  <Pressable onPress={() => offer(e.name, false)} style={({ pressed }) => [s.no, pressed && { opacity: 0.85 }]}>
                    <Text style={[T.bold, { fontSize: 14 }]}>{t('לא עכשיו', 'Not now')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {done[k] && !(l.offer && l.offer.at === p.at) && <Text style={[T.muted, { fontSize: 13 }]}>{done[k]}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  move: { gap: 6, borderTopWidth: 1, borderTopColor: '#EFEAE3', paddingTop: 8 },
  head: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  feels: { flexDirection: ROW, gap: 6 },
  feel: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#E7E1D8' },
  offer: { backgroundColor: '#FFF6F1', borderRadius: 12, padding: 10, gap: 8, borderWidth: 1.5, borderColor: C.signal },
  yes: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  no: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D9D2C7', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
});
