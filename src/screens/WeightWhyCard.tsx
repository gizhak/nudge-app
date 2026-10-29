// Why the scale moved, on the progress screen: the line that joins the weekly average with the
// latest weigh-in, every likely reason, the arithmetic, a row per day, and one thing to do.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DayRow, nextStep, reconcile, WeightStory } from '../report/weightDays';
import { Card } from '../ui/components';
import { C, fmt, T } from '../ui/theme';

import { ROW, START, t as tr } from '../i18n';
const NAMES = [tr('ראשון', 'Sun'), tr('שני', 'Mon'), tr('שלישי', 'Tue'), tr('רביעי', 'Wed'), tr('חמישי', 'Thu'), tr('שישי', 'Fri'), tr('שבת', 'Sat')];
const dm = (t: number) => `${new Date(t).getDate()}.${new Date(t).getMonth() + 1}`;
const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

/** One day in one line, for under the chart when a point is tapped */
export function dayLine(r: DayRow, target: number): string {
  const parts = [`${NAMES[new Date(r.day).getDay()]} ${dm(r.day)}`];
  if (r.kg != null) parts.push(tr(`${r.kg.toFixed(1)} ק"ג`, `${r.kg.toFixed(1)} kg`));
  parts.push(r.logged ? tr(`${fmt(r.kcal)} קלוריות${r.kcal > target * 1.1 ? ', מעל היעד' : ''}`, `${fmt(r.kcal)} calories${r.kcal > target * 1.1 ? ', over the goal' : ''}`) : tr('אוכל לא נרשם במלואו', 'Food not fully logged'));
  if (r.sleepMin != null) parts.push(tr(`שינה ${hm(r.sleepMin)}`, `sleep ${hm(r.sleepMin)}`));
  if (r.workout) parts.push(tr('אימון', 'workout'));
  return parts.join(' · ');
}

export default function WeightWhyCard({
  story,
  weights,
  pickedDay,
  onPickDay,
}: {
  story: WeightStory | null;
  weights: { date: Date; kg: number }[];
  pickedDay: number | null;
  onPickDay: (day: number | null) => void;
}) {
  const [more, setMore] = useState(false);
  // Closed by default: one sentence; the reasons, the days and the next step behind "פרטים"
  const [open, setOpen] = useState(false);
  if (!story) return null;
  const { why, rows, target } = story;
  const joined = reconcile(weights);
  const step = why ? nextStep(why.allReasons) : null;
  if (!why && !joined) return null;

  // Newest first; four days unless he asked for more, or picked an older day on the chart
  const newest = [...rows].reverse();
  const olderPicked = pickedDay != null && newest.findIndex((r) => r.day === pickedDay) >= 4;
  const shown = more || olderPicked ? newest : newest.slice(0, 4);
  // The direction is said once, in the black card above; here the reason, so the two never disagree
  const title = tr('למה המשקל זז', 'Why the weight moved');
  const lead = why?.reality ?? why?.allReasons[0] ?? joined ?? why?.headline;

  return (
    <Card title={title}>
      <Pressable onPress={() => setOpen(!open)} style={s.head1} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 15, lineHeight: 22, flex: 1 }]} numberOfLines={open ? undefined : 2}>{lead}</Text>
        <View style={s.more}>
          <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>{open ? tr('סגור', 'Close') : tr('פרטים', 'Details')}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
        </View>
      </Pressable>
      {open && (
        <>
      {why && <Text style={[T.muted, { fontSize: 12 }]}>{tr(`ב ${why.basis}: ${why.headline}`, `Over ${why.basis}: ${why.headline}`)}</Text>}
      {why && joined && <Text style={[T.base, s.joined]}>{joined}</Text>}

      {why && why.allReasons.length > 0 && (
        <View style={{ gap: 8 }}>
          {why.allReasons.map((r, i) => (
            <View key={i} style={s.reason}>
              <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{i + 1}.</Text>
              <Text style={[T.base, { fontSize: 14, lineHeight: 21, flex: 1 }]}>{r}</Text>
            </View>
          ))}
        </View>
      )}
      {why?.reality && <Text style={[T.bold, { fontSize: 14, lineHeight: 21 }]}>{why.reality}</Text>}
      {why?.otherScales && <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{why.otherScales}</Text>}

      {shown.length > 0 && (
        <View style={{ gap: 2 }}>
          <View style={[s.row, s.head]}>
            <Text style={[s.cDay, T.muted, s.hText]}>{tr('יום', 'Day')}</Text>
            <Text style={[s.cNum, T.muted, s.hText]}>{tr('משקל', 'Weight')}</Text>
            <Text style={[s.cNum, T.muted, s.hText]}>{tr('קלוריות', 'Calories')}</Text>
            <Text style={[s.cNum, T.muted, s.hText]}>{tr('שינה', 'Sleep')}</Text>
            <Text style={[s.cIcon, T.muted, s.hText]}>{tr('אימון', 'Workout')}</Text>
          </View>
          {shown.flatMap((r) => {
            const on = r.day === pickedDay;
            const over = r.logged && r.kcal > target * 1.1;
            const shortSleep = r.sleepMin != null && r.sleepMin < 6 * 60;
            const row = (
              <Pressable key={r.day} onPress={() => onPickDay(on ? null : r.day)} style={[s.row, on && s.rowOn]}>
                <Text style={[s.cDay, T.bold, { fontSize: 13 }]}>
                  {NAMES[new Date(r.day).getDay()]} <Text style={[T.muted, { fontSize: 12 }]}>{dm(r.day)}</Text>
                </Text>
                <Text style={[s.cNum, T.bold, { fontSize: 13 }]}>{r.kg != null ? r.kg.toFixed(1) : '—'}</Text>
                <Text style={[s.cNum, T.base, { fontSize: 13, color: !r.logged ? C.muted : over ? C.warn : C.ink }]}>
                  {r.logged ? fmt(r.kcal) : tr('לא נרשם', 'Not logged')}
                </Text>
                <Text style={[s.cNum, T.base, { fontSize: 13, color: shortSleep ? C.warn : C.ink }]}>{r.sleepMin != null ? hm(r.sleepMin) : '—'}</Text>
                <View style={s.cIcon}>{r.workout ? <Ionicons name="barbell" size={15} color={C.good} /> : null}</View>
              </Pressable>
            );
            if (!on) return [row];
            return [
              row,
              (
                // The day's meals, to check the total against the food screen
                <View key={`${r.day}-meals`} style={s.meals}>
                  {r.list?.length ? (
                    r.list.map((m, i) => (
                      <View key={i} style={s.meal}>
                        <Text style={[T.muted, { fontSize: 12, width: 40 }]}>{`${String(m.time.getHours()).padStart(2, '0')}:${String(m.time.getMinutes()).padStart(2, '0')}`}</Text>
                        <Text style={[T.base, { fontSize: 13, flex: 1 }]} numberOfLines={1}>{m.name}</Text>
                        <Text style={[T.bold, { fontSize: 13 }]}>{fmt(Math.round(m.kcal))}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[T.muted, { fontSize: 13 }]}>{tr('אין ארוחות רשומות ביום הזה.', 'No meals logged on this day.')}</Text>
                  )}
                  <Text style={[T.muted, { fontSize: 11 }]}>{tr('היום נספר מההשכמה עד ההשכמה הבאה, כמו במסך התזונה.', 'A day counts from waking to the next waking, as in the food screen.')}</Text>
                </View>
              ),
            ];
          })}
          <Text style={[T.muted, { fontSize: 11, lineHeight: 16 }]}>
            {tr('בכתום: מעל', 'In orange: over')} {fmt(Math.round(target * 1.1))} {tr('קלוריות, או שינה מתחת ל 6 שעות. לחיצה על יום מסמנת אותו בגרף.', 'calories, or sleep under 6 hours. Tap a day to mark it on the chart.')}
          </Text>
          {newest.length > 4 && !olderPicked && (
            <Pressable onPress={() => setMore(!more)} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 13, color: C.muted, textDecorationLine: 'underline' }]}>{more ? tr('רק 4 הימים האחרונים', 'Only the last 4 days') : tr('כל הימים', 'All days')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {step && (
        <View style={s.step}>
          <Text style={[T.bold, { fontSize: 12, color: C.signal }]}>{tr('לשבוע הבא', 'To next week')}</Text>
          <Text style={[T.bold, { fontSize: 15, lineHeight: 22 }]}>{step}</Text>
        </View>
      )}
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  head1: { flexDirection: ROW, alignItems: 'flex-start', gap: 10 },
  more: { flexDirection: ROW, alignItems: 'center', gap: 3, paddingTop: 3 },
  joined: { fontSize: 14, lineHeight: 21, backgroundColor: C.bg, borderRadius: 14, padding: 12, overflow: 'hidden' },
  reason: { flexDirection: ROW, gap: 6, alignItems: 'flex-start' },
  row: { flexDirection: ROW, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 6, borderRadius: 10 },
  rowOn: { backgroundColor: C.bg },
  head: { paddingVertical: 4 },
  hText: { fontSize: 11 },
  cDay: { flex: 1.6, textAlign: START },
  cNum: { flex: 1, textAlign: 'center' },
  cIcon: { width: 40, alignItems: 'center', textAlign: 'center' },
  meals: { gap: 4, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4, backgroundColor: C.bg, borderRadius: 10 },
  meal: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  step: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track, paddingTop: 10 },
});
