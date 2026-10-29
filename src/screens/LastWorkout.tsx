import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { WorkoutDetail, workoutLabel } from '../health/workouts';
import { Card } from '../ui/components';
import { C, fmt, T } from '../ui/theme';
import { Appear, GrowText } from '../ui/grow';
import { useGrow } from '../ui/tabEnter';
import { Animated } from 'react-native';

import { CHEVRON_ON, ROW, SIDE_START } from '../i18n';
const when = (d: Date) => {
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const day =
    d.toDateString() === today.toDateString()
      ? 'היום'
      : d.toDateString() === y.toDateString()
        ? 'אתמול'
        : d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
  return `${day}, ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
};

/** The latest workout the watch recorded, compared with the one before it of the same kind. */
export default function LastWorkout({ workouts, sessionTitle }: { workouts: WorkoutDetail[] | null; sessionTitle?: string }) {
  const [more, setMore] = useState(false);
  // First load: hold the card's place so the screen does not jump when it arrives
  if (workouts === null) {
    return (
      <Card title="האימון האחרון">
        <View style={{ height: 230 }} />
      </Card>
    );
  }
  if (!workouts.length) {
    return (
      <Card title="האימון האחרון">
        <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
          השעון לא רשם אימון בשלושת השבועות האחרונים. כדי שאימון יירשם עם דופק וקלוריות, הפעל בשעון "אימון כוח" כשאתה מתחיל, ועצור כשאתה מסיים.
        </Text>
      </Card>
    );
  }
  const last = workouts[0];
  const prev = workouts.slice(1).find((w) => w.type === last.type);
  const delta = (a?: number, b?: number, unit = '') =>
    a != null && b != null && a !== b ? { text: `${a > b ? '+' : '−'}${fmt(Math.abs(a - b))}${unit} מהקודם`, up: a > b } : undefined;

  const stats: { label: string; value: string; note?: { text: string; up: boolean } }[] = [
    { label: 'דקות', value: String(last.minutes), note: delta(last.minutes, prev?.minutes) },
  ];
  if (last.activeKcal) stats.push({ label: 'קלוריות פעילות', value: fmt(last.activeKcal), note: delta(last.activeKcal, prev?.activeKcal) });
  if (last.avgHr) stats.push({ label: 'דופק ממוצע', value: String(last.avgHr) });
  if (last.maxHr) stats.push({ label: 'דופק מרבי', value: String(last.maxHr) });
  if (last.steps) stats.push({ label: 'צעדים', value: fmt(last.steps) });
  if (last.distanceKm) stats.push({ label: 'ק"מ', value: String(last.distanceKm) });

  const perMin = last.activeKcal && last.minutes ? last.activeKcal / last.minutes : null;

  return (
    <Card title="האימון האחרון">
      <Text style={[T.bold, { fontSize: 18 }]}>
        {sessionTitle ?? workoutLabel(last)}
      </Text>
      <Text style={[T.muted, { fontSize: 13 }]}>{when(last.start)}</Text>
      <View style={s.grid}>
        {stats.map((x, i) => (
          <View key={x.label} style={s.stat}>
            <Text style={[T.bold, { fontSize: 22, textAlign: 'center' }]}>
              <GrowText text={x.value} delay={150 + i * 40} />
            </Text>
            <Text style={[T.muted, { fontSize: 12, textAlign: 'center' }]}>{x.label}</Text>
            {x.note && (
              <Appear delay={800 + i * 60} style={{ alignItems: 'center', marginTop: 3 }}>
                <Text style={[s.pill, x.note.up ? s.pillUp : s.pillDown]}>{x.note.text}</Text>
              </Appear>
            )}
          </View>
        ))}
      </View>
      {workouts.length >= 3 && <History workouts={workouts} />}
      <Pressable onPress={() => setMore(true)} style={s.link} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>פרטים ואימונים קודמים</Text>
        <Ionicons name={CHEVRON_ON} size={14} color={C.muted} />
      </Pressable>

      <Sheet open={more} onClose={() => setMore(false)} title={sessionTitle ?? workoutLabel(last)}>
        {perMin !== null && (
          <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>
            {perMin >= 6 ? 'קצב גבוה, עבודה טובה.' : perMin >= 4 ? 'קצב סביר. מנוחות של עד 90 שניות בין סטים יעלו אותו.' : 'קצב נמוך. אם המנוחות ארוכות, קצר אותן ל 60 עד 90 שניות.'}
          </Text>
        )}
        {!last.avgHr && <Text style={[T.muted, { fontSize: 13 }]}>דופק לא מגיע מהשעון, ולכן לא מוצג.</Text>}
        {workouts.length > 1 && (
          <View style={{ gap: 6 }}>
            <Text style={[T.bold, { fontSize: 15 }]}>קודמים</Text>
            {workouts.slice(1).map((w) => (
              <View key={w.start.getTime()} style={s.row}>
                <Text style={[T.base, { fontSize: 14, flex: 1 }]} numberOfLines={1}>
                  {w.start.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} · {workoutLabel(w)}
                </Text>
                <Text style={[T.muted, { fontSize: 14 }]}>
                  {w.minutes} דק'{w.activeKcal ? ` · ${fmt(w.activeKcal)} קל'` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </Card>
  );
}

/** Minutes of the last workouts, oldest on the right, the latest in orange; the bars grow in. */
function History({ workouts }: { workouts: WorkoutDetail[] }) {
  const list = workouts.slice(0, 6).reverse();
  const max = Math.max(...list.map((w) => w.minutes), 1);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[T.muted, { fontSize: 12 }]}>דקות ב{list.length} האימונים האחרונים</Text>
      <View style={s.bars}>
        {list.map((w, i) => (
          <HistoryBar key={w.start.getTime()} h={Math.max(6, Math.round((w.minutes / max) * 60))} latest={i === list.length - 1} delay={350 + i * 70} label={`${w.start.getDate()}.${w.start.getMonth() + 1}`} />
        ))}
      </View>
    </View>
  );
}

function HistoryBar({ h, latest, delay, label }: { h: number; latest: boolean; delay: number; label: string }) {
  const g = useGrow(h, { duration: 700, delay });
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <View style={{ height: 60, justifyContent: 'flex-end', alignSelf: 'stretch' }}>
        <Animated.View style={{ height: g, borderRadius: 6, backgroundColor: latest ? C.signal : '#D9D2C7' }} />
      </View>
      <Text style={[T.muted, { fontSize: 10, textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bars: { flexDirection: ROW, alignItems: 'flex-end', gap: 8 },
  pill: { fontFamily: T.bold.fontFamily, fontSize: 11, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  pillUp: { color: C.good, backgroundColor: '#E4F0E7' },
  pillDown: { color: C.muted, backgroundColor: C.track },
  grid: { flexDirection: ROW, flexWrap: 'wrap', rowGap: 10 },
  stat: { width: '33.3%', gap: 1 },
  row: { flexDirection: ROW, justifyContent: 'space-between', gap: 8 },
  link: { flexDirection: ROW, alignItems: 'center', gap: 4, alignSelf: SIDE_START },
});
