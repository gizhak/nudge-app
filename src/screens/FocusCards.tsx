// Home, under "now": the week's focus with its days, and a plan change waiting for an answer.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DAY_LETTERS, weekStartKey } from '../config/goals';
import { dayLine, Focus, focusProgress, isRealFocus, loadFocus } from '../coach/focus';
import type { DayData, Targets } from '../report/compute';
import { answerProposal, loadProposal, Proposal } from '../coach/proposals';
import { ackTopic } from '../coach/followupStore';
import { Sheet } from '../ui/Sheet';
import { C, FONT, T } from '../ui/theme';

export default function FocusCards({ tick = 0 }: { tick?: number }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [days, setDays] = useState<(boolean | null)[]>([]);
  const [prop, setProp] = useState<Proposal | null>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<(DayData | null)[]>([]);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const f = await loadFocus().catch(() => null);
    // Last week's focus is not shown once the week turned; the coach picks the new one on its next run
    if (isRealFocus(f) && f.week === weekStartKey(new Date())) {
      setFocus(f);
      focusProgress(f)
        .then((p) => {
          setDays(p.days);
          setRows(p.rows);
          setTargets(p.targets);
        }).catch(() => undefined);
    } else setFocus(null);
    const p = await loadProposal().catch(() => null);
    setProp(p?.status === 'open' ? p : null);
  }, []);
  useEffect(() => {
    load();
  }, [load, tick]);

  const answer = async (yes: boolean) => {
    const reply = await answerProposal(yes).catch(() => '');
    await ackTopic('proposal').catch(() => undefined);
    setProp(null);
    setNote(reply || null);
    setTimeout(() => setNote(null), 5000);
  };

  if (!focus && !prop && !note) return null;
  const hit = days.filter((x) => x === true).length;
  const today = new Date().getDay();

  return (
    <>
      {focus && (
        <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
          <View style={s.row}>
            <Text style={[T.bold, { fontSize: 12, color: C.signal }]}>המיקוד של השבוע</Text>
            <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>
              {hit} מתוך {focus.need}
            </Text>
          </View>
          <Text style={[T.bold, { fontSize: 17, fontFamily: FONT.black }]}>{focus.title}</Text>
          <View style={s.days}>
            {DAY_LETTERS.map((l, i) => {
              const v = days[i];
              return (
                <Pressable
                  key={i}
                  onPress={() => setPick(i)}
                  hitSlop={4}
                  style={({ pressed }) => [s.day, v === true && s.dayHit, v === false && s.dayMiss, i === today && v == null && s.dayToday, pressed && { opacity: 0.7 }]}
                >
                  {v === true ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={[T.bold, { fontSize: 12, color: v === false ? '#fff' : C.muted }]}>{l}</Text>}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      )}
      {prop && (
        <View style={[s.card, s.ask]}>
          <Text style={[T.bold, { fontSize: 12, color: C.signal }]}>המאמן מציע שינוי בתוכנית</Text>
          <Text style={[T.bold, { fontSize: 17, fontFamily: FONT.black }]}>{prop.title}</Text>
          <Text style={[T.base, { fontSize: 14, lineHeight: 21, color: '#4A453F' }]}>{prop.body}</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <Pressable onPress={() => answer(true)} style={({ pressed }) => [s.yes, pressed && { opacity: 0.85 }]}>
              <Text style={[T.bold, { color: '#fff', fontSize: 15, textAlign: 'center' }]}>כן, לעדכן</Text>
            </Pressable>
            <Pressable onPress={() => answer(false)} style={({ pressed }) => [s.no, pressed && { opacity: 0.85 }]}>
              <Text style={[T.bold, { fontSize: 15, textAlign: 'center' }]}>לא עכשיו</Text>
            </Pressable>
          </View>
        </View>
      )}
      {note && (
        <View style={s.card}>
          <Text style={[T.base, { fontSize: 15, lineHeight: 22 }]}>{note}</Text>
        </View>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="המיקוד של השבוע">
        {focus && (
          <>
            <Text style={[T.bold, { fontSize: 20, fontFamily: FONT.black }]}>{focus.title}</Text>
            <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>למה דווקא זה: {focus.why}</Text>
            <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>
              המטרה: {focus.need} ימים מתוך 7. עד עכשיו {hit}.
            </Text>
            {focus.last && (
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
                בשבוע שעבר: {focus.last.title}, {focus.last.hit} מתוך {focus.last.need}.
              </Text>
            )}
            <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>המיקוד נבחר בכל יום ראשון לפי השבועיים שלפניו: הדבר שהכי משפיע על המטרה שלך ועוד לא ביעד.</Text>
          </>
        )}
      </Sheet>

      <Sheet open={pick != null} onClose={() => setPick(null)} title={focus && targets && pick != null ? dayLine(focus.key, pick, rows[pick] ?? null, targets).title : ''}>
        {focus && targets && pick != null && (
          <>
            <Text style={[T.base, { fontSize: 16, lineHeight: 24 }]}>{dayLine(focus.key, pick, rows[pick] ?? null, targets).body}</Text>
            <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>המיקוד: {focus.title}</Text>
          </>
        )}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 14, gap: 8 },
  ask: { borderWidth: 2, borderColor: C.signal },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'baseline' },
  days: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 2 },
  day: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: C.track, alignItems: 'center', justifyContent: 'center' },
  dayHit: { backgroundColor: C.good, borderColor: C.good },
  dayMiss: { backgroundColor: '#B9B2A8', borderColor: '#B9B2A8' },
  dayToday: { borderColor: C.signal, borderWidth: 2 },
  yes: { flex: 1, backgroundColor: C.ink, borderRadius: 14, paddingVertical: 12 },
  no: { flex: 1, borderWidth: 1.5, borderColor: C.track, borderRadius: 14, paddingVertical: 12, backgroundColor: '#fff' },
});
