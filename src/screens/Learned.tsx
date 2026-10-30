import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadLog } from '../coach/store';
import { GYM_MIN, GymEntry, loadGymLog } from '../coach/gymDays';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fact, hhmm } from '../learn/compute';
import { Beat, learn, Learned as L, loadBeats, loadLearned, loadOff, setOff } from '../learn/store';
import { applyReminders } from '../notifications/schedule';
import { loadSettings } from '../notifications/settings';
import { Card, PrimaryButton } from '../ui/components';
import { C, T } from '../ui/theme';

import { LANG, SIDE_END, LOCALE, t as tr } from '../i18n';
const HOUR = 3600000;

/**
 * Whether the phone lets the coach run when the app is closed: runs in the last day, and the
 * longest stretch without one between 07:00 and 23:00 (at night Android legitimately waits).
 */
function background(beats: Beat[], now: number) {
  const bg = beats.filter((b) => now - b.at < 24 * HOUR && b.how !== 'manual').sort((a, b) => a.at - b.at);
  let gap = 0;
  for (let t = now - 24 * HOUR; t <= now; t += 10 * 60000) {
    const h = new Date(t).getHours();
    if (h < 7 || h >= 23) continue;
    const prev = [...bg].reverse().find((b) => b.at <= t)?.at ?? now - 24 * HOUR;
    // Time since the last run, counting only daytime
    let since = 0;
    for (let u = prev; u < t; u += 10 * 60000) {
      const hu = new Date(u).getHours();
      if (hu >= 7 && hu < 23) since += 10 * 60000;
    }
    gap = Math.max(gap, since);
  }
  const last = bg[bg.length - 1];
  const ok = bg.length >= 12 && gap < 2.5 * HOUR;
  return { count: bg.length, gapH: Math.round((gap / HOUR) * 10) / 10, last: last?.at, ok, first: beats.length ? Math.min(...beats.map((b) => b.at)) : now };
}

function FactRow({ f, off, onToggle }: { f: Fact; off: boolean; onToggle: () => void }) {
  return (
    <View style={[s.fact, off && { opacity: 0.45 }]}>
      <Text style={[T.bold, { fontSize: 15 }]}>{f.title}</Text>
      <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>{f.detail}</Text>
      <Text style={[T.base, { fontSize: 13, lineHeight: 19 }]}>{off ? tr('סימנת שזה לא נכון: המאמן לא משתמש בזה.', 'You marked this as wrong: the coach does not use it.') : f.effect}</Text>
      <Pressable onPress={onToggle} hitSlop={8} style={{ alignSelf: SIDE_END }}>
        <Text style={[T.bold, { fontSize: 13, color: C.muted, textDecorationLine: 'underline' }]}>{off ? tr('זה כן נכון', 'This is right') : tr('לא נכון', 'Not right')}</Text>
      </Pressable>
    </View>
  );
}

/** What the coach learned about him, the evidence, what it changes, and a way to say it is wrong. */
export default function Learned() {
  const [l, setL] = useState<L | null>(null);
  const [off, setOffList] = useState<string[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ at: number; msg: string; where?: string } | null>(null);
  const [gym, setGym] = useState<GymEntry[]>([]);
  const [lastMsg, setLastMsg] = useState<number | null>(null);
  const [run, setRun] = useState<any>(null);
  const [runLog, setRunLog] = useState<any[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([loadLearned(), loadOff(), loadBeats()]);
    // Learned in the other language: shown after learning again, so the texts match the app
    if ((a.lang ?? 'he') !== LANG) learn().then(setL).catch(() => undefined);
    setL(a);
    setOffList(b);
    setBeats(c);
    try {
      setErr(JSON.parse((await AsyncStorage.getItem('coach.lastError.v1')) ?? 'null'));
      setRun(JSON.parse((await AsyncStorage.getItem('coach.lastRun.v1')) ?? 'null'));
      setRunLog(JSON.parse((await AsyncStorage.getItem('coach.runLog.v1')) ?? '[]'));
      setGym(await loadGymLog());
      const log = await loadLog();
      setLastMsg(log.length ? Math.max(...log.map((m) => m.at)) : null);
    } catch {
      // diagnostics only
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!l) return <ActivityIndicator color={C.ink} style={{ marginVertical: 24 }} />;
  const now = Date.now();
  const bg = background(beats, now);
  const young = now - bg.first < 20 * HOUR;

  return (
    <View style={{ gap: 12 }}>
      {gym.length > 0 && (
        <Card title={tr("ביקורים בחדר הכושר", 'Gym visits')}>
          <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('יום נספר כאימון רק אחרי', 'A day counts as a workout only after')} {GYM_MIN} {tr('דקות בחדר הכושר, או אימון מהשעון, או "התאמנתי".', 'minutes at the gym, or a workout from the watch, or "I trained".')}</Text>
          {[...gym].reverse().slice(0, 12).map((g, i) => (
            <Text key={i} style={[T.base, { fontSize: 13 }]}>
              {new Date(g.at).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} ·{' '}
              {g.kind === 'enter' ? tr('הגעה', 'Arrival') : g.kind === 'exit' ? tr(`יציאה אחרי ${g.minutes ?? 0} דק'`, `Left after ${g.minutes ?? 0} min`) : tr(`נספר כאימון, ${g.minutes} דק'`, `Counted as a workout, ${g.minutes} min`)}
              {g.via ? tr(` · לפי ${g.via}`, ` · by ${({ 'מיקום': 'location', 'רכב': 'car', 'ידני': 'hand' } as Record<string, string>)[g.via ?? ''] ?? g.via}`) : ''}
            </Text>
          ))}
        </Card>
      )}
      <Card title={tr("המאמן ברקע", 'The coach in the background')}>
        {young ? (
          <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{tr('מתחיל למדוד עכשיו. אחרי יום אפשר יהיה לראות אם הטלפון נותן למאמן לרוץ כשהאפליקציה סגורה.', 'Starting to measure now. After a day you will see whether the phone lets the coach run while the app is closed.')}</Text>
        ) : (
          <>
            <Text style={[T.bold, { fontSize: 15, color: bg.ok ? C.ink : C.signal }]}>
              {bg.ok ? tr('רץ כמו שצריך', 'Running as it should') : tr('נראה שהטלפון עוצר אותו', 'The phone seems to be stopping it')}
            </Text>
            <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
              {tr('ב 24 השעות האחרונות:', 'In the last 24 hours:')} {bg.count} {tr('הפעלות כשהאפליקציה סגורה. הפער הארוך ביותר בשעות היום:', 'runs while the app was closed. The longest gap during the day:')} {bg.gapH} {tr('שעות.', 'hours.')}
              {bg.last ? tr(` האחרונה ב ${hhmm(new Date(bg.last).getHours() * 60 + new Date(bg.last).getMinutes())}.`, ` The last at ${hhmm(new Date(bg.last).getHours() * 60 + new Date(bg.last).getMinutes())}.`) : ''}
            </Text>
            {!bg.ok && (
              <>
                <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
                  {tr('בטלפונים של Xiaomi: הגדרות, אפליקציות, Nudge. שם: "הפעלה אוטומטית" פועל, ו"חיסכון בסוללה" על "ללא הגבלות". אחר כך ננעל את האפליקציה בתפריט האפליקציות האחרונות (מנעול על החלון שלה).', 'On Xiaomi phones: Settings, Apps, Nudge. There: "Autostart" on, and "Battery saver" on "No restrictions". Then lock the app in the recent apps menu (the lock on its window).')}
                </Text>
                <PrimaryButton label={tr("פתח את הגדרות האפליקציה", 'Open the app settings')} onPress={() => Linking.openSettings()} />
              </>
            )}
          </>
        )}
        {lastMsg && (
          <Text style={[T.muted, { fontSize: 13 }]}>
            {tr('ההודעה האחרונה שנשלחה:', 'The last message sent:')} {new Date(lastMsg).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        {run && (
          <Text style={[T.muted, { fontSize: 13 }]} selectable>
            {tr('בדיקה אחרונה ב', 'Last check at')} {new Date(run.at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}:{' '}
            {run.why === 'driving'
              ? tr('שקט, כי נראה שאתה נוהג (הרכב מחובר)', 'Quiet, since you seem to be driving (the car is connected)')
              : run.why === 'sent'
                ? tr('נשלחה הודעה', 'A message was sent')
                : run.why === 'said'
                  ? tr('אין משהו חדש, כל מה שרלוונטי כבר נאמר היום', 'Nothing new, everything relevant was already said today')
                : run.why === 'caps'
                  ? tr(`היה מה להגיד אבל הוחזק (${(run.held ?? []).join(', ')})`, `There was something to say but it was held (${(run.held ?? []).join(', ')})`)
                  : run.why === 'snoozed'
                    ? tr(`הכל מושתק אחרי "הבנתי" (${(run.candidates ?? []).join(', ')})`, `All muted after "Got it" (${(run.candidates ?? []).join(', ')})`)
                    : tr('לא היה מה להגיד', 'There was nothing to say')}
            {run.data === false ? tr('. אין נתוני בריאות', '. No health data') : ''}
            {typeof run.sentToday === 'number' ? tr(`. היום נשלחו ${run.sentToday}`, `. Sent today: ${run.sentToday}`) : ''}
          </Text>
        )}
        {runLog.length > 0 && (
          <Pressable onPress={() => setLogOpen(!logOpen)} hitSlop={6}>
            <Text style={[T.bold, { fontSize: 13, color: C.muted, textDecorationLine: 'underline' }]}>
              {logOpen ? tr('הסתר', 'Hide') : tr(`כל הבדיקות מאז אתמול (${runLog.length})`, `All checks since yesterday (${runLog.length})`)}
            </Text>
          </Pressable>
        )}
        {logOpen &&
          [...runLog].reverse().map((x, i) => (
            <Text key={i} style={[T.muted, { fontSize: 12, lineHeight: 18 }]} selectable>
              {new Date(x.at).toLocaleString(LOCALE, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} ·{' '}
              {x.how === 'manual' ? tr('ידני', 'Manual') : x.how === 'unlock' ? tr('פתיחת מסך', 'Screen open') : x.how === 'place' ? tr('מקום', 'Place') : tr('רקע', 'Background')} ·{' '}
              {x.why === 'driving' ? tr('נהיגה, שקט', 'Driving, quiet') : x.why === 'sent' ? tr(`נשלח: ${(x.sent ?? []).join(', ')}`, `Sent: ${(x.sent ?? []).join(', ')}`) : x.why === 'caps' ? tr(`הוחזק: ${(x.held ?? []).join(', ')}`, `Held: ${(x.held ?? []).join(', ')}`) : x.why === 'said' ? tr('כבר נאמר', 'Already said') : x.why === 'snoozed' ? tr('מושתק', 'Muted') : tr('אין מה להגיד', 'Nothing to say')}
            </Text>
          ))}
        {err && now - err.at < 24 * HOUR && (
          <Text style={[T.base, { fontSize: 13, color: C.signal }]} selectable>
            {tr('תקלה ב', 'Error at')} {new Date(err.at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}: {err.msg} {err.where ? `(${err.where})` : ''}
          </Text>
        )}
      </Card>

      <Card title={tr("מה המאמן למד עליך", 'What the coach learned about you')}>
        {l.facts.length ? (
          l.facts.map((f) => (
            <FactRow
              key={f.key}
              f={f}
              off={off.includes(f.key)}
              onToggle={async () => {
                await setOff(f.key, !off.includes(f.key));
                await load();
                // The weigh-in reminder follows the learned time: reschedule with the change
                if (f.key.startsWith('weigh_time')) applyReminders(await loadSettings()).catch(() => 0);
              }}
            />
          ))
        ) : (
          <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
            {tr('עוד מוקדם. כדי ללמוד מתי אתה קם ושוקל צריך לפחות שבוע של נתונים, וכדי ללמוד אילו הודעות עובדות עליך צריך לפחות 4 פעמים מכל סוג.', 'Too early. To learn when you get up and weigh in it needs at least a week of data, and to learn which messages work on you it needs at least 4 of each kind.')}
          </Text>
        )}
        <Text style={[T.muted, { fontSize: 12 }]}>
          {l.at ? tr(`עודכן ב ${new Date(l.at).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}. `, `Updated ${new Date(l.at).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}. `) : ''}
          {tr('הלמידה רצה פעם ב 12 שעות, על 3 השבועות האחרונים, ונשארת בטלפון.', 'Learning runs every 12 hours, on the last 3 weeks, and stays on the phone.')}
        </Text>
        <PrimaryButton
          label={busy ? tr('לומד...', 'Learning...') : tr('למד עכשיו', 'Learn now')}
          onPress={async () => {
            if (busy) return;
            setBusy(true);
            await learn(Date.now(), true).catch(() => null);
            await load();
            applyReminders(await loadSettings()).catch(() => 0);
            setBusy(false);
          }}
        />
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  fact: { gap: 3, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
});
