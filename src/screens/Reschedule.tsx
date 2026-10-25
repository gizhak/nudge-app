import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DAY_NAMES, getWeekOverrides, pad2, PlannedWorkout, planThisWeek, sessionOf } from '../config/goals';
import { moveStats, moveWorkout, orderText, shortenWorkout, skipWorkout, suggestDays } from '../coach/reschedule';
import { noteChange, sessionLine, WORKOUT_TOPICS } from '../coach/replies';
import { snoozeToday } from '../coach/store';
import { saveWeekOverrides } from '../coach/store';
import { applyReminders } from '../notifications/schedule';
import { loadSettings } from '../notifications/settings';
import { loadProfile } from '../profile/profile';
import { Card } from '../ui/components';
import { TimeStepper } from '../ui/inputs';
import { C, T } from '../ui/theme';

/** "Can't make it": move to another day this week, a short home version, or skip. */
export default function Reschedule({ workout, onDone }: { workout: PlannedWorkout; onDone: () => void }) {
  const now = new Date();
  const ov = getWeekOverrides();
  const stats = moveStats(ov, now, workout);
  const [kidsDays, setKidsDays] = useState<number[] | undefined>(undefined);
  const [picked, setPicked] = useState<{ day: number; time: number } | null>(null);
  useEffect(() => {
    loadProfile().then((p) => setKidsDays(p.relationship === 'separated' ? p.kidsDays : undefined));
  }, []);

  const usual = workout.hour * 60 + workout.minute;
  const suggestions = suggestDays(now, planThisWeek(now), workout, { usualTime: usual, kidsDays });
  const canMove = stats.thisOne < 2;
  const session = sessionOf(workout.session);

  const hhmm = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  const isToday = workout.day === now.getDay();
  const name = (id: string) => sessionOf(id).title.split(':')[0];
  /** Saves, quiets today's workout messages when today changed, and says it in the chat */
  const save = async (next: ReturnType<typeof moveWorkout>, mine: string, reply: string) => {
    await saveWeekOverrides(next);
    await applyReminders(await loadSettings()).catch(() => 0);
    if (isToday) await Promise.all(WORKOUT_TOPICS.map((t) => snoozeToday(t))).catch(() => undefined);
    await noteChange(mine, reply);
    onDone();
  };
  const preview = picked ? orderText(moveWorkout(ov, now, workout, picked.day, picked.time), now, name) : '';

  return (
    <Card>
      <Text style={[T.bold, { fontSize: 16 }]}>לא מסתדר: {session.title}</Text>
      {stats.week >= 1 && (
        <Text style={[T.bold, { fontSize: 14, color: C.signal }]}>
          {stats.thisOne >= 2 ? 'האימון הזה כבר זז פעמיים השבוע. נשארו רק גרסה קצרה או ויתור.' : 'זה כבר השינוי השני השבוע. מה מפריע? אם זה קבוע, כדאי לשנות את הימים בתיק שלי.'}
        </Text>
      )}

      {canMove && (
        <>
          <Text style={[T.muted, { fontSize: 13 }]}>להעביר ליום אחר השבוע:</Text>
          {suggestions.length === 0 && <Text style={[T.base, { fontSize: 14 }]}>אין יום פנוי מתאים השבוע.</Text>}
          {suggestions.map((sg) => {
            const on = picked?.day === sg.day;
            return (
              <Pressable key={sg.day} onPress={() => setPicked({ day: sg.day, time: sg.time })} style={[s.option, on && s.optionOn]}>
                <Text style={[T.bold, { fontSize: 15, color: on ? '#fff' : C.ink }]}>{sg.label}</Text>
                <Text style={[T.muted, { fontSize: 12, color: on ? '#ddd' : C.muted }]}>{sg.why}</Text>
              </Pressable>
            );
          })}
          {picked && <Text style={[T.base, { fontSize: 13, color: C.muted }]}>הסדר אחרי ההעברה: {preview}</Text>}
          {picked && (
            <View style={s.timeRow}>
              <Text style={[T.bold, { fontSize: 14 }]}>שעה</Text>
              <TimeStepper value={picked.time} onChange={(time) => setPicked({ ...picked, time })} />
              <Pressable
                style={s.btn}
                onPress={() => {
                  const next = moveWorkout(ov, now, workout, picked.day, picked.time);
                  save(
                    next,
                    `מעביר את ${session.title} ליום ${DAY_NAMES[picked.day]} ב${hhmm(picked.time)}`,
                    (() => {
                      // When the order puts another session on today, the coach says what today is now
                      const today = planThisWeek(now, undefined, next).find((w) => w.day === now.getDay());
                      const s = today ? sessionOf(today.session) : null;
                      return `קיבלתי. מעכשיו: ${orderText(next, now, name)}.${s ? ` היום ${s.title}: ${sessionLine(s.exercises)}` : isToday ? ' היום מנוחה, אז מים וחלבון כרגיל.' : ''}`;
                    })(),
                  );
                }}
              >
                <Text style={[T.bold, { color: '#fff', fontSize: 14 }]}>העבר</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      <View style={s.row}>
        <Pressable style={s.ghost} onPress={() => save(shortenWorkout(ov, now, workout), `במקום ${session.title}, 20 דקות בבית`, 'בסדר. 20 דקות זה עדיין אימון, והוא נספר.')}>
          <Text style={[T.bold, { fontSize: 14 }]}>20 דקות בבית במקום</Text>
        </Pressable>
        <Pressable style={s.ghost} onPress={() => save(skipWorkout(ov, now, workout), `מוותר על ${session.title} השבוע`, 'בסדר, לא אציק על האימון הזה. נתראה באימון הבא.')}>
          <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>לוותר השבוע</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDone}>
        <Text style={[T.muted, { fontSize: 13 }]}>סגור, אני כן מתאמן ב{pad2(workout.hour)}:{pad2(workout.minute)}</Text>
      </Pressable>
    </Card>
  );
}

const s = StyleSheet.create({
  option: { borderWidth: 1, borderColor: C.track, borderRadius: 12, padding: 10, gap: 2 },
  optionOn: { backgroundColor: C.ink, borderColor: C.ink },
  timeRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' },
  btn: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  ghost: { borderWidth: 1, borderColor: C.track, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.card },
});
