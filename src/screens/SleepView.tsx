import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getGrantedPermissions } from 'react-native-health-connect';
import { DAY_LETTERS, GOALS } from '../config/goals';
import { sourceLabel } from '../config/sources';
import { readNutritionByDay } from '../health/history';
import { clockText, diagnose, hoursText, Night, nightsFrom, readSleepRecords, SleepCheck, SleepSummary, summarize } from '../health/sleep';
import { TargetBars } from '../ui/charts';
import { C, T } from '../ui/theme';

import { ROW, LOCALE, t as tr } from '../i18n';
const DAYS = 14;

interface Loaded {
  sum: SleepSummary;
  check: SleepCheck;
}

async function load(): Promise<Loaded> {
  let records: any[] = [];
  let error: string | undefined;
  try {
    records = await readSleepRecords(DAYS);
  } catch (e: any) {
    error = String(e?.message ?? e).slice(0, 140);
  }
  let granted = true;
  try {
    const g: any[] = await getGrantedPermissions();
    granted = g.some((p) => p.recordType === 'SleepSession' && p.accessType === 'read');
  } catch {
    // Unknown: do not blame the permission
  }
  const kcal = new Map<number, number>();
  try {
    for (const d of await readNutritionByDay(DAYS)) kcal.set(new Date(d.date).setHours(0, 0, 0, 0), d.kcal);
  } catch {
    // Without food the link is simply left out
  }
  const nights = nightsFrom(records, DAYS);
  return {
    sum: summarize(nights, GOALS.sleepHours, kcal),
    check: diagnose({ records, error, granted, nights, days: DAYS, label: sourceLabel }),
  };
}

const dateText = (t: number) => new Date(t).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'numeric' });
const timeOf = (t: number) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

function Stages({ n }: { n: Night }) {
  if (n.deep == null) return null;
  const parts = [
    { key: tr('עמוקה', 'Deep'), min: n.deep, color: C.ink },
    { key: 'REM', min: n.rem ?? 0, color: '#4B4741' },
    { key: tr('קלה', 'Light'), min: n.light ?? 0, color: C.data },
    { key: tr('ער', 'Awake'), min: n.awake ?? 0, color: C.track },
  ].filter((p) => p.min > 0);
  const total = parts.reduce((a, p) => a + p.min, 0) || 1;
  return (
    <View style={{ gap: 6 }}>
      <View style={s.bar}>
        {parts.map((p) => (
          <View key={p.key} style={{ flex: p.min / total, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={s.legend}>
        {parts.map((p) => (
          <View key={p.key} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: p.color }]} />
            <Text style={[T.muted, { fontSize: 12 }]}>
              {p.key} {hoursText(p.min)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function consistency(spread?: number): string | null {
  if (spread == null) return null;
  if (spread <= 30) return tr('אתה נרדם בשעה קבועה. זה הבסיס לשינה טובה.', 'You fall asleep at a steady time. That is the base of good sleep.');
  if (spread <= 60) return tr(`שעת ההירדמות זזה בכשעה בין לילות (${Math.round(spread)} דקות). שעה קבועה יותר תעזור.`, `Your sleep time moves by about an hour between nights (${Math.round(spread)} minutes). A steadier time will help.`);
  return tr(`שעת ההירדמות משתנה מאוד בין לילות (כ ${Math.round(spread)} דקות). שעה קבועה, גם בסוף השבוע, משפרת את השינה ואת הרעב למחרת.`, `Your sleep time changes a lot between nights (about ${Math.round(spread)} minutes). A steady time, weekends too, improves sleep and the next day's hunger.`);
}

/** The sleep drawer: last night, the week, the pattern, and where the data comes from. */
export default function SleepView() {
  const [d, setD] = useState<Loaded | null>(null);
  useEffect(() => {
    load().then(setD);
  }, []);
  if (!d) return <ActivityIndicator color={C.ink} style={{ marginVertical: 24 }} />;
  const { sum, check } = d;
  const last = sum.nights[sum.nights.length - 1];
  const week = sum.nights.slice(-7);
  const target = GOALS.sleepHours;

  // Seven bars, one per day, empty where nothing arrived
  const today = new Date().setHours(0, 0, 0, 0);
  const bars = Array.from({ length: 7 }, (_, i) => today - (6 - i) * 86400000);
  const values = bars.map((day) => {
    const n = sum.nights.find((x) => x.day === day);
    return n ? n.asleepMin / 60 : null;
  });

  return (
    <View style={{ gap: 16 }}>
      {last ? (
        <View style={{ gap: 8 }}>
          <Text style={[T.muted, { fontSize: 13 }]}>{last.day === today ? tr('הלילה האחרון', 'Last night') : tr(`הלילה האחרון שהגיע: ${dateText(last.day)}`, `The last night that arrived: ${dateText(last.day)}`)}</Text>
          <Text style={[T.bold, { fontSize: 30 }]}>{hoursText(last.asleepMin)} {tr('שעות', 'hours')}</Text>
          <Text style={[T.muted, { fontSize: 14 }]}>
            {timeOf(last.bed)} {tr('עד', 'to')} {timeOf(last.wake)}
            {last.asleepMin < target * 60 - 30 ? tr(` · ${hoursText(target * 60 - last.asleepMin)} פחות מהיעד`, ` · ${hoursText(target * 60 - last.asleepMin)} under the goal`) : ''}
          </Text>
          <Stages n={last} />
        </View>
      ) : (
        <Text style={[T.bold, { fontSize: 18 }]}>{tr('אין נתוני שינה', 'No sleep data')}</Text>
      )}

      {sum.avgMin != null && (
        <View style={{ gap: 8 }}>
          <Text style={[T.bold, { fontSize: 15 }]}>{tr('השבוע', 'This week')}</Text>
          <TargetBars values={values} labels={bars.map((t) => DAY_LETTERS[new Date(t).getDay()])} target={target} overIsBad={false} height={70} />
          <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
            {tr('ממוצע', 'Average')} {hoursText(sum.avgMin)} {tr('שעות ·', 'hours ·')} {sum.onTarget} {tr('מתוך', 'of')} {week.length} {tr('לילות סביב היעד (', 'nights around the goal (')}{target} {tr('שעות)', 'hours)')}
          </Text>
          {sum.avgBed != null && sum.avgWake != null && (
            <Text style={[T.muted, { fontSize: 13 }]}>
              {tr('נרדם בממוצע ב', 'Asleep on average at')} {clockText(sum.avgBed)}{tr(', קם ב', ', up at')} {clockText(sum.avgWake)}
            </Text>
          )}
          {consistency(sum.bedSpread) && <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{consistency(sum.bedSpread)}</Text>}
          {sum.link && <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{sum.link}</Text>}
        </View>
      )}

      {sum.nights.length > 1 && (
        <View style={{ gap: 2 }}>
          <Text style={[T.bold, { fontSize: 15, marginBottom: 4 }]}>{tr('לילה אחרי לילה', 'Night by night')}</Text>
          {[...sum.nights].reverse().map((n) => (
            <View key={n.day} style={s.night}>
              <Text style={[T.base, { fontSize: 13, width: 82 }]}>{dateText(n.day)}</Text>
              <Text style={[T.bold, { fontSize: 13, width: 44, color: n.asleepMin < target * 60 - 30 ? C.warn : C.ink }]}>{hoursText(n.asleepMin)}</Text>
              <Text style={[T.muted, { fontSize: 12, flex: 1 }]}>
                {timeOf(n.bed)} {tr('עד', 'to')} {timeOf(n.wake)}
                {n.deep != null ? tr(` · עמוקה ${hoursText(n.deep)}`, ` · deep ${hoursText(n.deep)}`) : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={[s.check, !check.ok && { borderColor: C.signal }]}>
        <Text style={[T.bold, { fontSize: 14 }]}>{tr('מאיפה זה מגיע', 'Where this comes from')}</Text>
        {check.lines.map((l) => (
          <Text key={l} style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: ROW, height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.track },
  legend: { flexDirection: ROW, flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: ROW, alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  night: { flexDirection: ROW, alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  check: { gap: 4, borderWidth: 1, borderColor: C.track, borderRadius: 14, padding: 12 },
});
