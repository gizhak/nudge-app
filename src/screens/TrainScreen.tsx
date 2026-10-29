import { loadPlaceState } from '../coach/store';
import { useCallback, useEffect, useState } from 'react';
import Countdown from '../ui/Countdown';
import { Appear, Pulse } from '../ui/grow';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DAY_LETTERS, DAY_NAMES, GOALS, MINIMUM_WORKOUT, nextWorkout, pad2, planThisWeek, Session, SESSIONS, WEEKLY_PLAN } from '../config/goals';
import Reschedule from './Reschedule';
import WeekPlanner from './WeekPlanner';
import { orderText, retimeWorkout, swapWithNext } from '../coach/reschedule';
import { noteChange, sessionLine } from '../coach/replies';
import { getWeekOverrides, PlannedWorkout, sessionOf } from '../config/goals';
import { markWorkoutDone, saveWeekOverrides, snoozeToday } from '../coach/store';
import { didIt } from '../coach/followupStore';
import { applyReminders } from '../notifications/schedule';
import { loadSettings } from '../notifications/settings';
import { TimeStepper } from '../ui/inputs';
import { PrimaryButton } from '../ui/components';
import LastWorkout from './LastWorkout';
import { readWorkoutDetails, WorkoutDetail } from '../health/workouts';
import { readWorkoutDaysThisWeek } from '../health/history';
import { setupHealthConnect } from '../health/permissions';
import { Card, Screen } from '../ui/components';
import { OpenRow, RowsCard } from '../ui/components';
import { Sheet } from '../ui/Sheet';
import { RunCard } from './Run';
import { RUN_TYPES } from '../run/read';
import { Ionicons } from '@expo/vector-icons';
import { C, T } from '../ui/theme';
import { Exercise } from '../config/goals';
import ExerciseHow, { HowMark } from '../train/ExerciseHow';
import { hasHow } from '../train/exercisePics';
import PickMoves from '../train/PickMoves';
import { kindOf, Load, loadKey, loadLoads, loadText } from '../train/loads';
import { gearFor } from '../train/library';
import { applyDerived, derive, EditableSession, editableSessions } from '../profile/derive';
import { loadProfile, Profile, saveProfile } from '../profile/profile';

import { ROW, SIDE_START, t as tr } from '../i18n';
/** The moves of a session; a move with photos opens the how-to window */
function ExerciseList({ list, onHow, loads }: { list: Exercise[]; onHow: (list: Exercise[], i: number) => void; loads: Record<string, Load> }) {
  return (
    <>
      {list.map((e, i) => {
        const how = hasHow(e.name);
        const l = loads[loadKey(e.name)];
        return (
          <Pressable key={e.name} disabled={!how && !kindOf(e.name)} onPress={() => onHow(list, i)} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
            <View style={{ flexDirection: ROW, alignItems: 'center', gap: 8, flex: 1 }}>
              {how && <HowMark />}
              <Text style={[T.base, s.text, { flexShrink: 1 }]}>{e.name}</Text>
            </View>
            <Text style={[T.muted, s.text]}>
              {l ? <Text style={[T.bold, { color: C.ink }]}>{loadText(l)} · </Text> : null}
              {e.sets} × {e.reps}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

// What the tab showed last time, so opening it again does not start empty and jump
const cache: { done: Set<number>; recent: WorkoutDetail[] | null } = { done: new Set(), recent: null };

export default function TrainScreen({ openReschedule = false, onEditDays, openRun = 0 }: { openReschedule?: boolean; onEditDays?: () => void; openRun?: number }) {
  const [done, setDone] = useState<Set<number>>(cache.done);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Session['id'] | null>(null);
  const [, setTick] = useState(0);
  const [resched, setResched] = useState(openReschedule);
  const [recent, setRecent] = useState<WorkoutDetail[] | null>(cache.recent);
  const [tips, setTips] = useState(false);
  const [minimum, setMinimum] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  // The how-to window: which list of moves, and which one it opened on
  const [how, setHow] = useState<{ list: Exercise[]; i: number } | null>(null);
  const openHow = (list: Exercise[], i: number) => setHow({ list, i });
  // His weight per move, shown on the tags and in the lists
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const reloadLoads = () => loadLoads().then(setLoads).catch(() => undefined);
  useEffect(() => {
    reloadLoads();
  }, []);
  // Picking the moves of a session, from its exercise list
  const [picking, setPicking] = useState<{ profile: Profile; session: EditableSession } | null>(null);
  const openPick = async (id: string) => {
    const profile = await loadProfile();
    const session = editableSessions(profile).find((x) => x.id === id);
    if (session) setPicking({ profile, session });
  };
  const savePick = async (picks: string[] | undefined) => {
    if (!picking) return;
    const next = { ...(picking.profile.picks ?? {}) };
    if (picks) next[picking.session.key] = picks;
    else delete next[picking.session.key];
    const profile = { ...picking.profile, picks: next };
    await saveProfile(profile);
    applyDerived(derive(profile));
    setPicking(null);
    setTick((t) => t + 1);
  };
  const now = new Date();
  const next = nextWorkout(now, done.has(now.getDay()));
  const week = planThisWeek(now);
  const planned = new Map(week.map((w) => [w.day, w]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const setup = await setupHealthConnect();
      if (setup.ok) {
        // The same days the coach counts: workouts the watch logged, gym visits and "I trained"
        const hc = await readWorkoutDaysThisWeek();
        const place = await loadPlaceState().catch(() => null);
        const sunday = new Date();
        sunday.setHours(0, 0, 0, 0);
        sunday.setDate(sunday.getDate() - sunday.getDay());
        for (const d of place?.gymDays ?? []) if (d >= sunday.getTime()) hc.add(new Date(d).getDay());
        cache.done = hc;
        cache.recent = await readWorkoutDetails().catch(() => []);
        setDone(cache.done);
        setRecent(cache.recent);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen title={tr("אימון", 'Training')} enter="train" refreshing={loading} onRefresh={load}>
      <View style={s.hero}>
        {/* A tap on the workout opens today's workout: done, another hour, another day */}
        <Pressable onPress={() => setResched(true)} style={({ pressed }) => [{ flexDirection: ROW, alignItems: 'center', gap: 14 }, pressed && { opacity: 0.85 }]}>
          {next.at && <Countdown at={next.at} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[T.bold, { fontSize: 12, color: '#BDB8B0' }]}>{tr('הבא ·', 'Next ·')} {next.label} · {next.session.minutes} {tr('דקות', 'minutes')}</Text>
            <Text style={[T.bold, { fontSize: 24, color: '#fff' }]}>{next.session.title}</Text>
            <Text style={[T.base, { fontSize: 12, color: '#8A847B' }]}>{tr('לחץ לשינוי שעה או יום', 'Tap to change the time or day')}</Text>
          </View>
        </Pressable>
        {/* The exercises as small tags, each rising in after the one before */}
        <View style={s.moves}>
          {next.session.exercises.slice(0, 4).map((e, i) => (
            <Appear key={e.name} delay={220 + i * 60}>
              <Pressable
                disabled={!hasHow(e.name) && !kindOf(e.name)}
                onPress={() => openHow(next.session.exercises, i)}
                style={({ pressed }) => [s.moveTag, pressed && { opacity: 0.7 }]}
                accessibilityLabel={tr(`${e.name}: איך עושים`, `${e.name}: how it is done`)}
              >
                <Text style={s.moveText}>
                  {e.name}
                  {loads[loadKey(e.name)] ? <Text style={{ fontWeight: '700' }}> · {loadText(loads[loadKey(e.name)])}</Text> : null}
                </Text>
                {hasHow(e.name) && <HowMark />}
              </Pressable>
            </Appear>
          ))}
          {next.session.exercises.length > 4 && (
            <Appear delay={220 + 4 * 60}>
              <Pressable onPress={() => openHow(next.session.exercises, 4)} style={({ pressed }) => [s.moveTag, pressed && { opacity: 0.7 }]}>
                <Text style={s.moveText}>{tr('ועוד', 'and')} {next.session.exercises.length - 4}</Text>
              </Pressable>
            </Appear>
          )}
        </View>
        <View style={s.heroBtns}>
          <Pressable onPress={() => setPlanOpen(true)} style={({ pressed }) => [s.heroBtn, pressed && { opacity: 0.85 }]}>
            <Text style={[T.bold, { fontSize: 15, color: C.ink, textAlign: 'center' }]}>{tr('התרגילים', 'Exercises')}</Text>
          </Pressable>
          <Pressable onPress={() => setResched(true)} style={({ pressed }) => [s.heroGhost, pressed && { opacity: 0.85 }]}>
            <Text style={[T.bold, { fontSize: 15, color: '#fff', textAlign: 'center' }]}>{tr('לא מסתדר', 'Can\'t make it')}</Text>
          </Pressable>
        </View>
      </View>

      <Card title={tr(`השבוע: ${done.size} מתוך ${GOALS.workoutsPerWeek}${done.size >= GOALS.workoutsPerWeek && GOALS.workoutsPerWeek > 0 ? ' · הושלם' : ''}`, `This week: ${done.size} of ${GOALS.workoutsPerWeek}${done.size >= GOALS.workoutsPerWeek && GOALS.workoutsPerWeek > 0 ? ' · done' : ''}`)}>
        <View style={s.week}>
          {DAY_LETTERS.map((letter, day) => {
            const isPlanned = planned.has(day);
            const isDone = done.has(day);
            const isToday = day === now.getDay();
            // Done days fill one after the other, then a small check pops on each
            const order = [...done].sort((a, b) => a - b).indexOf(day);
            return (
              <View key={day} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                <Pulse color={C.signal} size={38} on={isToday && isPlanned && !isDone} />
                <View
                  style={[
                    s.day,
                    isPlanned && { borderColor: C.ink, borderWidth: 1.5 },
                    isDone && { borderColor: C.accent },
                    isToday && !isDone && { backgroundColor: C.track },
                    isToday && isPlanned && !isDone && { borderColor: C.signal, borderWidth: 2 },
                  ]}
                >
                  {isDone && (
                    <Appear pop delay={250 + order * 120} style={[StyleSheet.absoluteFill, { borderRadius: 19, backgroundColor: C.accent }]}>
                      <View />
                    </Appear>
                  )}
                  <Text style={[T.bold, { textAlign: 'center', color: isDone ? '#fff' : isPlanned ? C.accent : C.muted }]}>
                    {letter}
                  </Text>
                </View>
                {isDone && (
                  <Appear pop delay={400 + order * 120} style={s.check}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </Appear>
                )}
              </View>
            );
          })}
        </View>
        {/* The fixed days every week starts from, and where to change them */}
        <View style={s.fixedRow}>
          <Text style={[T.muted, { fontSize: 13, flex: 1 }]}>
            {tr('קבוע:', 'Fixed:')} {WEEKLY_PLAN.length ? WEEKLY_PLAN.map((w) => `${DAY_NAMES[w.day]} ${pad2(w.hour)}:${pad2(w.minute)}`).join(' · ') : tr('אין ימי אימון', 'No workout days')}
          </Text>
          <Pressable onPress={() => setPlannerOpen(true)} hitSlop={8}>
            <Text style={[T.bold, { fontSize: 13, color: C.muted, textDecorationLine: 'underline' }]}>{tr('לסדר את השבוע', 'Arrange the week')}</Text>
          </Pressable>
        </View>
        {week.some((w) => w.moved || w.short) && (
          <Text style={[T.muted, { fontSize: 13 }]}>
            {tr('שינויים השבוע:', 'Changes this week:')} {week.filter((w) => w.moved || w.short).map((w) => tr(`${w.short ? 'קצר' : 'הועבר'} ביום ${DAY_LETTERS[w.day]}`, `${w.short ? 'short' : 'moved'} on ${DAY_LETTERS[w.day]}`)).join(', ')}
          </Text>
        )}
      </Card>

      {/* A run has its own card below; the generic one would show it twice */}
      {!(recent?.[0] && RUN_TYPES.includes(recent[0].type)) && <LastWorkout
        workouts={recent}
        sessionTitle={(() => {
          // The planned session of that day this week, when the workout matches one
          const w = recent?.[0];
          if (!w) return undefined;
          const sunday = new Date(now);
          sunday.setHours(0, 0, 0, 0);
          sunday.setDate(sunday.getDate() - sunday.getDay());
          const sameWeek = w.start.getTime() >= sunday.getTime();
          const p = sameWeek ? week.find((x) => x.day === w.start.getDay()) : undefined;
          return p ? SESSIONS[p.session]?.title : undefined;
        })()}
      />}

      <RunCard openTick={openRun} />

      {(() => {
        // Today's workout if it has not happened yet, even when its time passed
        const todays = week.find((w) => w.day === now.getDay());
        const target = todays && !done.has(now.getDay()) ? todays : next.workout;
        const isToday = target.day === now.getDay();
        const close = () => {
          setResched(false);
          setTick((t) => t + 1);
        };
        return (
          <Sheet open={resched} onClose={close} title={tr(`${isToday ? 'האימון של היום' : 'האימון הבא'}: ${sessionOf(target.session).title}`, `${isToday ? 'Today\'s workout' : 'Next workout'}: ${sessionOf(target.session).title}`)}>
            {isToday && (
              <PrimaryButton
                label={tr("התאמנתי", 'I trained')}
                onPress={async () => {
                  await markWorkoutDone();
                  await didIt(['workout']).catch(() => undefined);
                  await Promise.all(['workout_today', 'workout_now', 'missed_workout', 'outing_workout'].map((t) => snoozeToday(t)));
                  setDone(new Set([...done, now.getDay()]));
                  await noteChange(tr('התאמנתי היום', 'I trained today'), tr('כל הכבוד. רשמתי את האימון של היום, ועכשיו חלבון ומים.', 'Well done. I logged today\'s workout; now protein and water.'));
                  close();
                }}
              />
            )}
            <Pressable onPress={() => { setResched(false); setPlannerOpen(true); }} style={({ pressed }) => [s.planBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="calendar-outline" size={18} color={C.ink} />
              <Text style={[T.bold, { fontSize: 15 }]}>{tr('לסדר את השבוע', 'Arrange the week')}</Text>
            </Pressable>
            <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{tr('להזיז אימון ליום אחר, להחליף בין אימונים, לשנות שעה או להוסיף יום.', 'Move a workout to another day, swap workouts, change the time or add a day.')}</Text>
            <Reschedule workout={target} onDone={close} compact />
          </Sheet>
        );
      })()}

      <RowsCard>
        <OpenRow first title={tr("אין זמן? 10 דקות בבית", 'No time? 10 minutes at home')} sub={tr("עדיף 10 דקות מאפס", '10 minutes beats zero')} onPress={() => setMinimum(true)} />
        <OpenRow title={tr("כל האימונים", 'All workouts')} sub={Object.values(SESSIONS).map((x) => x.title).join(' · ')} onPress={() => setAllOpen(true)} />
        <OpenRow title={tr("איך להתאמן", 'How to train')} sub={tr("משקלים, חזרות ומנוחה", 'Weights, reps and rest')} onPress={() => setTips(true)} />
      </RowsCard>

      <Sheet open={planOpen} onClose={() => setPlanOpen(false)} title={tr(`${next.session.title} · ${next.session.minutes} דקות`, `${next.session.title} · ${next.session.minutes} minutes`)}>
        <Card>
          <ExerciseList list={next.session.exercises} onHow={openHow} loads={loads} />
        </Card>
        {next.session.id !== 'F' && next.session.id !== 'MIN' && (
          <Pressable onPress={() => openPick(next.session.id)} style={({ pressed }) => [s.pickBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="list" size={18} color={C.ink} />
            <Text style={[T.bold, { fontSize: 15 }]}>{tr('בחירת תרגילים', 'Pick exercises')}</Text>
          </Pressable>
        )}
        <Text style={[T.muted, { fontSize: 13 }]}>{next.label}</Text>
      </Sheet>

      <Sheet open={allOpen} onClose={() => setAllOpen(false)} title={tr("כל האימונים", 'All workouts')}>
        {Object.values(SESSIONS).map((session) => (
          <Pressable key={session.id} onPress={() => setOpen(open === session.id ? null : session.id)}>
            <Card>
              <View style={s.row}>
                <Text style={[T.bold, s.text]}>{session.title}</Text>
                <Text style={[T.muted, s.text]}>{session.minutes} {tr('דקות', 'minutes')}</Text>
              </View>
              {open === session.id && <ExerciseList list={session.exercises} onHow={openHow} loads={loads} />}
            </Card>
          </Pressable>
        ))}
      </Sheet>

      <Sheet open={minimum} onClose={() => setMinimum(false)} title={tr("10 דקות בבית", '10 minutes at home')}>
        <Card>
          <ExerciseList list={MINIMUM_WORKOUT} onHow={openHow} loads={loads} />
        </Card>
        <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('עדיף 10 דקות מאפס. זה שומר על הרצף, והרצף הוא מה שבונה הרגל.', '10 minutes beats zero. It keeps the streak going, and the streak is what builds a habit.')}</Text>
      </Sheet>

      <Sheet open={tips} onClose={() => setTips(false)} title={tr("איך להתאמן", 'How to train')}>
        <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{tr('שבועיים ראשונים: 60 עד 70 אחוז מהמשקל שהרמת בעבר.', 'First two weeks: 60 to 70 percent of the weight you used to lift.')}</Text>
        <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{tr('אם 2 החזרות האחרונות קלות, מוסיפים משקל בפעם הבאה.', 'If the last 2 reps are easy, add weight next time.')}</Text>
        <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{tr('מנוחה של 60 עד 90 שניות בין סטים.', 'Rest 60 to 90 seconds between sets.')}</Text>
        <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('בעיגולים של השבוע: מסגרת היא אימון מתוכנן, ומלא הוא אימון שהשעון רשם.', 'In the week\'s circles: an outline is a planned workout, and filled is a workout the watch logged.')}</Text>
      </Sheet>

      <WeekPlanner
        open={plannerOpen}
        done={done}
        onClose={(changed) => {
          setPlannerOpen(false);
          if (changed) setTick((t) => t + 1);
        }}
      />
      {picking && (
        <PickMoves
          session={picking.session}
          gear={gearFor(picking.profile.trainPlace, picking.profile.homeEquipment)}
          onClose={() => setPicking(null)}
          onSave={savePick}
        />
      )}
      <ExerciseHow list={how?.list ?? []} start={how ? how.i : null} onClose={() => setHow(null)} onLoads={reloadLoads} />
    </Screen>
  );
}

/** Another hour, same day: a little earlier or later */
function RetimeRow({ workout, onSave }: { workout: PlannedWorkout; onSave: (time: number) => void }) {
  const usual = workout.hour * 60 + workout.minute;
  const [time, setTime] = useState(usual);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[T.bold, { fontSize: 15 }]}>{tr('שעה אחרת, באותו יום', 'Another time, same day')}</Text>
      <View style={{ flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <TimeStepper value={time} onChange={setTime} step={15} />
        <Pressable
          disabled={time === usual}
          onPress={() => onSave(time)}
          style={{ backgroundColor: time === usual ? C.track : C.ink, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 }}
        >
          <Text style={[T.bold, { color: '#fff', fontSize: 14 }]}>{tr('שמור', 'Save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  week: { flexDirection: ROW, justifyContent: 'space-between' },
  hero: { backgroundColor: C.ink, borderRadius: 28, padding: 20, gap: 8 },
  moves: { flexDirection: ROW, flexWrap: 'wrap', gap: 6 },
  planBtn: { flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, paddingVertical: 13 },
  pickBtn: { flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 13 },
  moveTag: { flexDirection: ROW, alignItems: 'center', gap: 6, backgroundColor: '#2C2A27', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  moveText: { fontFamily: T.base.fontFamily, fontSize: 13, color: '#fff' },
  move: { fontFamily: T.base.fontFamily, fontSize: 13, color: '#fff', backgroundColor: '#2C2A27', borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' },
  check: { position: 'absolute', top: -3, left: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: C.good, alignItems: 'center', justifyContent: 'center' },
  heroBtns: { flexDirection: ROW, gap: 8, paddingTop: 4 },
  heroBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12 },
  heroGhost: { flex: 1, borderWidth: 1, borderColor: '#4A4743', borderRadius: 12, paddingVertical: 12 },
  fixedRow: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  day: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.track, justifyContent: 'center' },
  row: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center' },
  text: { fontSize: 15 },
  link: { flexDirection: ROW, alignItems: 'center', gap: 4, alignSelf: SIDE_START },
  openRow: { flexDirection: ROW, alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18 },
  ghost: { borderWidth: 1, borderColor: C.track, borderRadius: 12, paddingVertical: 10, backgroundColor: C.card },
});
