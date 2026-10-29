import { firstTime } from '../ui/once';
import { didIt } from '../coach/followupStore';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ScaleCheckSheet } from './ScaleCheck';
import { ReportsCard } from './Reports';
import { ensureReports } from '../report/run';
import { DEFAULT_REPORT_PREFS, loadReportPrefs, loadReports, markReportRead, ReportPrefs } from '../report/store';
import { cleanBody, DAY, nextWeeklyDue, Progress, progressOf, Report, weekPeriod } from '../report/compute';
import { collectBody, collectDays } from '../report/collect';
import { GOALS } from '../config/goals';
import { readWeights, readWorkoutsByWeek } from '../health/history';
import { setupHealthConnect } from '../health/permissions';
import { GrowNumber, MiniBars, OpenRow, RowsCard, Screen } from '../ui/components';
import { Sparkline } from '../ui/tiles';
import { Sheet } from '../ui/Sheet';
import { C, FONT, fmt, T } from '../ui/theme';
import { sourceLabel } from '../config/sources';
import { CheckpointFlow, CompareView, JourneyCard } from './Journey';
import { loadCheckpoints } from '../progress/store';
import { Checkpoint } from '../progress/journey';
import { readWeightStory, WeightStory } from '../report/weightDays';
import WeightWhyCard, { dayLine } from './WeightWhyCard';
import LogSheet, { LogKind } from './LogSheet';
import { loadWaist } from '../progress/waist';

import { ROW, LOCALE, t as tr } from '../i18n';
const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

/** Sunday is waist day: open the log on waist when there is none in the last six days */
const waistDue = (pts: { at: number }[]) => new Date().getDay() === 0 && !pts.some((p) => Date.now() - p.at < 6 * DAY);

/** Average of the weigh-ins in the last 7 days; smooths daily water swings. */
function weeklyAverage(points: { date: Date; kg: number }[], now = new Date()) {
  const recent = points.filter((p) => now.getTime() - p.date.getTime() <= 7 * 24 * 3600 * 1000);
  if (!recent.length) return null;
  return recent.reduce((a, p) => a + p.kg, 0) / recent.length;
}

// Last data shown, so switching back to this tab does not start empty and jump
const progressCache: {
  weights: { date: Date; kg: number; source?: string }[];
  weeks: { weekStart: Date; count: number }[];
  checkpoints: Checkpoint[];
  reports: Report[];
  reportPrefs: ReportPrefs;
  progress: Progress | null;
  story: WeightStory | null;
  waist: { at: number; cm: number }[];
} = {
  weights: [],
  weeks: [],
  checkpoints: [],
  reports: [],
  reportPrefs: DEFAULT_REPORT_PREFS,
  progress: null,
  story: null,
  waist: [],
};

export default function ProgressScreen({ focusWeigh = 0, openCheckpoint = 0, openReport = 0, focusWaist = 0 }: { focusWeigh?: number; openCheckpoint?: number; openReport?: number; focusWaist?: number }) {
  const [reports, setReports] = useState<Report[]>(progressCache.reports);
  const [reportPrefs, setReportPrefs] = useState<ReportPrefs>(progressCache.reportPrefs);
  const [progress, setProgress] = useState<Progress | null>(progressCache.progress);
  const [openId, setOpenId] = useState<string | null>(null);

  // Reports that are due get made here; then how far the next weekly report is, and what it lacks
  const loadReportsState = useCallback(async () => {
    await ensureReports().catch(() => 0);
    const [list, prefs, cps] = await Promise.all([loadReports(), loadReportPrefs(), loadCheckpoints().catch(() => [] as Checkpoint[])]);
    setReports((progressCache.reports = list));
    setReportPrefs((progressCache.reportPrefs = prefs));
    const now = Date.now();
    const { start } = weekPeriod(nextWeeklyDue(now, prefs.weekDay, prefs.hour));
    const [days, body] = await Promise.all([collectDays(start, now + DAY).catch(() => []), collectBody(start, now).catch(() => [])]);
    const weighDays = cleanBody(body).daily.filter((d) => d.weight != null).length;
    setProgress((progressCache.progress = progressOf(now, prefs.weekDay, prefs.hour, days, weighDays, GOALS, cps.map((c) => c.at))));
  }, []);

  const openReportId = async (id: string) => {
    setOpenId(id);
    await markReportRead(id).catch(() => undefined);
    setReports((list) => (progressCache.reports = list.map((r) => (r.id === id ? { ...r, read: true } : r))));
  };

  // Opened from the "weekly report is ready" notification
  useEffect(() => {
    if (!firstTime('report', openReport)) return;
    (async () => {
      await ensureReports().catch(() => 0);
      const list = await loadReports();
      setReports((progressCache.reports = list));
      const r = list.find((x) => x.kind === 'week') ?? list[0];
      if (r) openReportId(r.id);
    })();
  }, [openReport]);

  const inputRef = useRef<TextInput>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(progressCache.checkpoints);
  const [mode, setMode] = useState<'flow' | 'edit' | 'compare' | null>(null);
  const reloadCheckpoints = useCallback(() => loadCheckpoints().then((c) => setCheckpoints((progressCache.checkpoints = c))), []);
  useEffect(() => {
    reloadCheckpoints();
  }, [reloadCheckpoints]);
  // Opened from the coach's "four weeks, time for a checkpoint" message
  useEffect(() => {
    if (firstTime('checkpoint', openCheckpoint)) setMode('flow');
  }, [openCheckpoint]);
  // Opened from a "you did not weigh in" notification: keyboard up, ready to type
  useEffect(() => {
    if (!firstTime('weigh', focusWeigh)) return;
    setLogKind('weight');
    setLogOpen(true);
    const t = setTimeout(() => inputRef.current?.focus(), 700);
    return () => clearTimeout(t);
  }, [focusWeigh]);
  // Opened from the Sunday waist reminder: the same sheet, on waist
  useEffect(() => {
    if (!firstTime('waist', focusWaist)) return;
    setLogKind('waist');
    setLogOpen(true);
    const t = setTimeout(() => inputRef.current?.focus(), 700);
    return () => clearTimeout(t);
  }, [focusWaist]);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logKind, setLogKind] = useState<LogKind>('weight');
  const [waist, setWaist] = useState<{ at: number; cm: number }[]>(progressCache.waist);
  const [workoutsOpen, setWorkoutsOpen] = useState(false);
  const [weights, setWeights] = useState<{ date: Date; kg: number; source?: string }[]>(progressCache.weights);
  const [weeks, setWeeks] = useState<{ weekStart: Date; count: number }[]>(progressCache.weeks);
  const [loading, setLoading] = useState(false);
  const [story, setStory] = useState<WeightStory | null>(progressCache.story);
  // A day picked on the chart or in the day rows; the two follow each other
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const setup = await setupHealthConnect();
      if (!setup.ok) return;
      const [w, k] = await Promise.all([readWeights(60), readWorkoutsByWeek(4)]);
      setWeights((progressCache.weights = w));
      setWeeks((progressCache.weeks = k));
      readWeightStory()
        .then((st) => setStory((progressCache.story = st)))
        .catch(() => undefined);
      // In the background: the spinner is for the weights, the reports fill in when ready
      loadReportsState().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  // Weekly entries and the checkpoints' waist, one line
  const loadWaistPoints = useCallback(async () => {
    const [weekly, cps] = await Promise.all([loadWaist(), loadCheckpoints().catch(() => [] as Checkpoint[])]);
    const all = [...weekly, ...cps.filter((c) => c.waistCm != null).map((c) => ({ at: c.at, cm: c.waistCm! }))].sort((a, b) => a.at - b.at);
    setWaist((progressCache.waist = all));
  }, []);

  useEffect(() => {
    load();
    loadWaistPoints();
  }, [load, loadWaistPoints]);

  const { width } = useWindowDimensions();
  const avg = weeklyAverage(weights);
  const last = weights[weights.length - 1];
  const last14 = weights.slice(-14);

  if (mode === 'flow' || mode === 'edit') {
    return (
      <CheckpointFlow
        list={checkpoints}
        edit={mode === 'edit' ? checkpoints[checkpoints.length - 1] : undefined}
        onClose={() => {
          setMode(null);
          reloadCheckpoints();
          // A new checkpoint closes the month: the monthly report is made now
          loadReportsState().catch(() => undefined);
        }}
      />
    );
  }
  if (mode === 'compare') {
    return <CompareView list={checkpoints} onClose={() => setMode(null)} onChanged={reloadCheckpoints} />;
  }

  return (
    <Screen title={tr("התקדמות", 'Progress')} enter="progress" refreshing={loading} onRefresh={() => (load(), loadWaistPoints())}>
      {(() => {
        // The week against the week before, from the last 14 days of weigh-ins
        const now = Date.now();
        const wk = weights.filter((p) => now - p.date.getTime() < 7 * DAY);
        const prevWk = weights.filter((p) => now - p.date.getTime() >= 7 * DAY && now - p.date.getTime() < 14 * DAY);
        const mean = (xs: typeof weights) => (xs.length ? xs.reduce((a, p) => a + p.kg, 0) / xs.length : null);
        const a1 = mean(wk);
        const a0 = mean(prevWk);
        const delta = a1 != null && a0 != null ? a1 - a0 : null;
        const down = delta != null && delta <= -0.2;
        const up = delta != null && delta >= 0.2;
        const prev = weights[weights.length - 2];
        const jump = last && prev && Math.abs(last.kg - prev.kg) >= 1 && prev.source !== last.source;
        // The average lags: when the last mornings already point the other way, say it in words
        const fresh = last ? weights.filter((p) => p.source === last.source && last.date.getTime() - p.date.getTime() < 3 * DAY).slice(-2) : [];
        const lead = avg != null && fresh.length ? fresh.reduce((a, p) => a + p.kg, 0) / fresh.length - avg : 0;
        const leadText =
          lead <= -0.4 && !down
            ? tr(`השקילות האחרונות נמוכות מהממוצע ב ${fmt(Math.abs(lead), 1)} ק"ג: אתה בירידה, והממוצע ידביק בימים הקרובים.`, `Your latest weigh-ins are ${fmt(Math.abs(lead), 1)} kg below the average: you are going down, and the average will catch up in the coming days.`)
            : lead >= 0.4 && !up
              ? tr(`השקילות האחרונות גבוהות מהממוצע ב ${fmt(lead, 1)} ק"ג. יום או יומיים זה בעיקר מים; אם זה נמשך, הממוצע יעלה.`, `Your latest weigh-ins are ${fmt(lead, 1)} kg above the average. A day or two is mostly water; if it continues, the average will rise.`)
              : null;
        // Waist beside the weight: the latest, against about a month ago (one measure is noise)
        const wLast = waist[waist.length - 1];
        const wMonth = wLast ? [...waist].reverse().find((p) => wLast.at - p.at >= 25 * DAY) : undefined;
        const wDelta = wLast && wMonth ? Math.round((wLast.cm - wMonth.cm) * 10) / 10 : null;
        const openWaist = () => {
          setLogKind('waist');
          setLogOpen(true);
        };
        return (
          <View style={s.hero}>
            <View style={s.cols}>
              <View style={{ flex: 1.3, gap: 2 }}>
                <Text style={[T.base, { fontSize: 13, color: '#B9B2A8' }]}>{tr('משקל · ממוצע שבועי', 'Weight · weekly average')}</Text>
                {avg !== null ? (
                  <View style={{ flexDirection: ROW, alignItems: 'baseline', gap: 6 }}>
                    <Text style={{ fontFamily: FONT.black, fontSize: 40, color: '#fff' }}><GrowNumber value={avg} from={a0 ?? avg} format={(n) => fmt(n, 1)} delay={150} /></Text>
                    <Text style={[T.base, { fontSize: 14, color: '#B9B2A8' }]}>{tr('ק"ג', 'kg')}</Text>
                  </View>
                ) : (
                  <Text style={[T.bold, { fontSize: 16, color: '#fff' }]}>{last ? tr('אין שקילה בשבוע האחרון', 'No weigh-in in the last week') : tr('עוד אין שקילות', 'No weigh-ins yet')}</Text>
                )}
                {delta != null && (
                  <Text style={[T.bold, { fontSize: 13, color: down ? '#8FC7A0' : up ? '#E9B872' : '#B9B2A8' }]}>
                    {down ? tr(`${fmt(Math.abs(delta), 1)} פחות מהשבוע שעבר`, `${fmt(Math.abs(delta), 1)} less than last week`) : up ? tr(`${fmt(delta, 1)} יותר מהשבוע שעבר`, `${fmt(delta, 1)} more than last week`) : tr('כמו בשבוע שעבר', 'Same as last week')}
                  </Text>
                )}
              </View>
              <View style={s.colSep} />
              <Pressable onPress={openWaist} style={{ flex: 1, gap: 2 }} hitSlop={6}>
                <Text style={[T.base, { fontSize: 13, color: '#B9B2A8' }]}>{tr('היקף מותן', 'Waist')}</Text>
                {wLast ? (
                  <>
                    <View style={{ flexDirection: ROW, alignItems: 'baseline', gap: 6 }}>
                      <Text style={{ fontFamily: FONT.black, fontSize: 40, color: '#fff' }}>{fmt(wLast.cm, 1)}</Text>
                      <Text style={[T.base, { fontSize: 14, color: '#B9B2A8' }]}>{tr('ס"מ', 'cm')}</Text>
                    </View>
                    <Text style={[T.bold, { fontSize: 13, color: wDelta == null ? '#B9B2A8' : wDelta < -0.4 ? '#8FC7A0' : wDelta > 0.4 ? '#E9B872' : '#B9B2A8' }]}>
                      {wDelta == null ? tr(`נמדד ${new Date(wLast.at).getDate()}.${new Date(wLast.at).getMonth() + 1}`, `Measured ${new Date(wLast.at).getMonth() + 1}/${new Date(wLast.at).getDate()}`) : wDelta === 0 ? tr('כמו לפני חודש', 'Same as a month ago') : tr(`${wDelta < 0 ? '−' : '+'}${fmt(Math.abs(wDelta), 1)} בחודש`, `${wDelta < 0 ? '−' : '+'}${fmt(Math.abs(wDelta), 1)} in a month`)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[T.bold, { fontSize: 16, color: '#fff', marginTop: 8 }]}>{tr('עוד לא נמדד', 'Not measured yet')}</Text>
                    <Text style={[T.bold, { fontSize: 13, color: C.signal }]}>{tr('למדוד', 'Measure')}</Text>
                  </>
                )}
              </Pressable>
            </View>
            {leadText && <Text style={[T.bold, { fontSize: 14, lineHeight: 20, color: lead < 0 ? '#8FC7A0' : '#E9B872' }]}>{leadText}</Text>}
            {last14.length >= 2 && (
              <Sparkline
                values={last14.map((p) => p.kg)}
                color={down ? '#8FC7A0' : up ? '#E9B872' : '#FFFFFF'}
                width={width - 72}
                height={80}
                picked={pickedDay == null ? null : (() => {
                  const i = last14.map((p) => dayStart(p.date)).lastIndexOf(pickedDay);
                  return i >= 0 ? i : null;
                })()}
                onPick={(i) => {
                  const d = dayStart(last14[i]!.date);
                  setPickedDay(d === pickedDay ? null : d);
                }}
              />
            )}
            {(() => {
              const row = pickedDay != null ? story?.rows.find((r) => r.day === pickedDay) : undefined;
              if (pickedDay == null) return last14.length >= 2 ? <Text style={[T.base, { fontSize: 11, color: '#6F6A63' }]}>{tr('לחץ על נקודה בגרף לפרטי היום', 'Tap a point on the chart for that day\'s details')}</Text> : null;
              return (
                <Text style={[T.bold, { fontSize: 13, lineHeight: 19, color: '#fff' }]}>
                  {row ? dayLine(row, story!.target) : tr(`${new Date(pickedDay).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'numeric' })} · אין נתוני אוכל ושינה ליום הזה`, `${new Date(pickedDay).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'numeric' })} · no food or sleep data for this day`)}
                </Text>
              );
            })()}
            {last && (
              <Text style={[T.base, { fontSize: 12, color: '#8A847B' }]}>
                {tr('אחרונה', 'Latest')} {fmt(last.kg, 1)} · {last.date.toDateString() === new Date().toDateString() ? tr('היום', 'today') : last.date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' })} · {sourceLabel(last.source)}
              </Text>
            )}
            {jump && (
              <Text style={[T.base, { fontSize: 12, lineHeight: 18, color: '#E9B872' }]}>
                {tr(`הקפיצה מהשקילה הקודמת היא כנראה הבדל בין משקלים: הקודמת מ ${sourceLabel(prev.source)}.`, `The jump from the previous weigh-in is probably a difference between scales: the previous one is from ${sourceLabel(prev.source)}.`)}
              </Text>
            )}
          </View>
        );
      })()}
      <WeightWhyCard story={story} weights={weights} pickedDay={pickedDay} onPickDay={setPickedDay} />
      <ReportsCard reports={reports} progress={progress} prefs={reportPrefs} openId={openId} onOpen={openReportId} onClose={() => setOpenId(null)} />
      <JourneyCard list={checkpoints} onCheckpoint={() => setMode('flow')} onCompare={() => setMode('compare')} onEdit={() => setMode('edit')} />

      <RowsCard>
        <OpenRow
          first
          title={tr("רישום משקל או מותן", 'Log weight or waist')}
          sub={tr("בלי משקל חכם, או המדידה השבועית של המותן", 'Without a smart scale, or the weekly waist measurement')}
          onPress={() => {
            setLogKind(waistDue(waist) ? 'waist' : 'weight');
            setLogOpen(true);
          }}
        />
        <OpenRow
          title={tr("אימונים בשבוע", 'Workouts a week')}
          sub={weeks.length ? tr(`השבוע ${weeks[weeks.length - 1].count} מתוך ${GOALS.workoutsPerWeek}`, `This week ${weeks[weeks.length - 1].count} of ${GOALS.workoutsPerWeek}`) : undefined}
          onPress={() => setWorkoutsOpen(true)}
        />
        <OpenRow title={tr("בדיקת המשקל החכם", 'Smart scale check')} sub={tr("מה מגיע ממנו, ואם המספרים תקינים", 'What comes from it, and whether the numbers are right')} onPress={() => setScaleOpen(true)} />
      </RowsCard>
      <ScaleCheckSheet open={scaleOpen} onClose={() => setScaleOpen(false)} />

      <LogSheet
        ref={inputRef}
        open={logOpen}
        kind={logKind}
        onKind={setLogKind}
        onClose={() => setLogOpen(false)}
        lastWaist={waist[waist.length - 1]?.cm}
        onSaved={(k) => (k === 'weight' ? load() : loadWaistPoints())}
      />

      <Sheet open={workoutsOpen} onClose={() => setWorkoutsOpen(false)} title={tr(`אימונים בשבוע · יעד ${GOALS.workoutsPerWeek}`, `Workouts a week · goal ${GOALS.workoutsPerWeek}`)}>
        <MiniBars
          values={weeks.map((w) => w.count)}
          labels={weeks.map((w, i) => (i === weeks.length - 1 ? tr('השבוע', 'This week') : `${w.weekStart.getDate()}/${w.weekStart.getMonth() + 1}`))}
          target={GOALS.workoutsPerWeek}
          max={GOALS.workoutsPerWeek}
          color={C.warn}
          height={70}
        />
        <Text style={[T.muted, { fontSize: 13 }]}>{tr('נספר לפי אימונים שהשעון רשם, ביקורים בחדר הכושר ו"התאמנתי".', 'Counted by workouts the watch logged, gym visits and "I trained".')}</Text>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  text: { fontSize: 15 },
  weightHead: { flexDirection: ROW, alignItems: 'baseline' },
  hero: { backgroundColor: C.ink, borderRadius: 28, padding: 20, gap: 8 },
  cols: { flexDirection: ROW, alignItems: 'flex-start', gap: 14 },
  colSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: '#4A4640' },
  inputRow: { flexDirection: ROW, gap: 10, alignItems: 'center' },
  input: {
    width: 100,
    borderWidth: 1,
    borderColor: C.track,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: 'center',
    color: C.ink,
    fontFamily: FONT.regular,
  },
});
