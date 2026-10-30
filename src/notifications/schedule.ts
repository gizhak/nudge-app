import { activeLearned } from '../learn/store';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isWeekend, pad2, planThisWeek, sessionOf } from '../config/goals';
import { ReminderSettings } from './settings';
import { DEFAULT_REPORT_PREFS, loadReportPrefs, ReportPrefs } from '../report/store';
import { onVacation, Vacation } from '../coach/vacation';
import { loadPrefs } from '../coach/store';
import type { Container } from '../nutrition/water';

import { t } from '../i18n';
const CHANNEL = 'coach';

/** Three levels, each its own Android channel so its sound and vibration can be set in the phone settings. */
export const CHANNELS = { urgent: 'coach_urgent', normal: 'coach_normal', info: 'coach_info' } as const;
export type Importance = keyof typeof CHANNELS;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNELS.urgent, {
      name: t('Nudge: חשוב', 'Nudge: important'),
      description: t('אימון, שינה, חיבורים ומה שאסור לפספס', 'Workout, sleep, connections and what must not be missed'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#FF4D2E',
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.normal, {
      name: t('Nudge: רגיל', 'Nudge: regular'),
      description: t('ארוחות, מים, חלבון וצעדים', 'Meals, water, protein and steps'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.info, {
      name: t('Nudge: מידע', 'Nudge: info'),
      description: t('עידוד וסיכומים, בלי צליל', 'Encouragement and summaries, no sound'),
      importance: Notifications.AndroidImportance.LOW,
    });
    // Old single channel, kept so existing scheduled reminders still show
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t('תזכורות מאמן', 'Coach reminders'),
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Expo weekday: 1 = Sunday ... 7 = Saturday. JS day: 0 = Sunday. */
const weekly = (jsDay: number, hour: number, minute: number, channel: string = CHANNELS.normal): Notifications.WeeklyTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
  channelId: channel,
  weekday: ((jsDay + 7) % 7) + 1,
  hour,
  minute,
});

const daily = (hour: number, minute: number, channel: string = CHANNELS.normal): Notifications.DailyTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  channelId: channel,
  hour,
  minute,
});

interface Planned {
  title: string;
  body: string;
  trigger: Notifications.NotificationTriggerInput;
  category?: string;
  /** Where a tap leads, see routeFor */
  topic: string;
}

export function plannedReminders(
  s: ReminderSettings,
  rp: ReportPrefs = DEFAULT_REPORT_PREFS,
  vacation: Vacation | null = null,
  /** His usual weigh-in time, learned: minutes after midnight */
  weighAt: { weekday?: number; weekend?: number } = {},
): Planned[] {
  const out: Planned[] = [];
  if (s.workout) {
    // One-off reminders for the next 7 days, from this week's actual plan, so a moved
    // workout is reminded on its new day and nothing fires on the old one.
    const now = new Date();
    for (let d = 0; d <= 7; d++) {
      const date = new Date(now);
      date.setDate(now.getDate() + d);
      for (const w of planThisWeek(date).filter((x) => x.day === date.getDay())) {
        const session = sessionOf(w.session);
        const at = `${pad2(w.hour)}:${pad2(w.minute)}`;
        const start = new Date(date);
        start.setHours(w.hour, w.minute, 0, 0);
        const morning = w.hour < 10;
        // Morning session: the evening before at 21:00, so the bag is ready. Otherwise an hour before.
        const when = new Date(start.getTime() - 60 * 60000);
        if (morning) {
          when.setTime(start.getTime());
          when.setDate(start.getDate() - 1);
          when.setHours(21, 0, 0, 0);
        }
        if (when <= now || onVacation(start, vacation)) continue;
        out.push({
          title: morning ? t('מחר בבוקר: אימון', 'Tomorrow morning: workout') : t(`אימון ב${at}`, `Workout at ${at}`),
          body: morning
            ? t(`${session.title} ב${at}, ${session.minutes} דקות. כדאי להכין תיק כבר הערב.`, `${session.title} at ${at}, ${session.minutes} minutes. Pack your bag tonight.`)
            : t(`${session.title}, ${session.minutes} דקות.`, `${session.title}, ${session.minutes} minutes.`),
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNELS.urgent },
          category: 'workout',
          topic: 'workout_reminder',
        });
      }
    }
  }
  if (s.weighIn) {
    // The next 7 mornings, one at a time so a vacation can skip them; on the weekend later
    const now = new Date();
    for (let d = 0; d <= 7; d++) {
      const at = new Date(now);
      at.setDate(now.getDate() + d);
      const wk = isWeekend(at.getDay());
      const learnedAt = wk ? weighAt.weekend : weighAt.weekday;
      // Ten minutes before he usually weighs, once that is known
      const m = learnedAt != null ? Math.max(5 * 60, learnedAt - 10) : wk ? 9 * 60 : 7 * 60;
      at.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if (at <= now || onVacation(at, vacation)) continue;
      out.push({
        title: t('שקילת בוקר', 'Morning weigh-in'),
        body: t('לפני אוכל ושתייה. לחץ כאן כדי להזין.', 'Before food and drink. Tap here to enter it.'),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNELS.normal },
        topic: 'weigh_reminder',
        category: 'nag',
      });
    }
  }
  // The weekly report, at the day and hour he chose
  if (rp.weekly) {
    out.push({ title: t('הדוח השבועי מוכן', 'The weekly report is ready'), body: t('איפה אתה עומד, מה השפיע, ומה עושים השבוע.', 'Where you stand, what had an effect, and what to do this week.'), trigger: weekly(rp.weekDay, rp.hour, 0, CHANNELS.info), topic: 'weekly_report' });
  }
  return out;
}

/** Replaces all scheduled reminders with the ones enabled in settings. */
export async function applyReminders(s: ReminderSettings): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const prefs = await loadPrefs().catch(() => null);
  const learned = await activeLearned().catch(() => null);
  const fact = (k: string) => learned?.facts.find((f) => f.key === k && f.confidence >= 0.4)?.value;
  const planned = plannedReminders(s, await loadReportPrefs(), prefs?.vacation ?? null, { weekday: fact('weigh_time_weekday'), weekend: fact('weigh_time_weekend') });
  for (const p of planned) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, categoryIdentifier: p.category, data: { topic: p.topic } },
      trigger: p.trigger,
    });
  }
  return planned.length;
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: t('בדיקת התראה', 'Test notification'), body: t('ההתראות של Coach עובדות.', 'Coach notifications work.') },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNELS.urgent },
  });
}

/** Buttons on the coach's "go to sleep" message. The second one only for people with broken nights. */
export async function setNightButtons(brokenLabel: string | null, container: Container = 250) {
  const actions: Notifications.NotificationAction[] = [
    { identifier: 'sleeping', buttonTitle: t('הולך לישון', 'Going to sleep'), options: { opensAppToForeground: false } },
    { identifier: 'ack', buttonTitle: t('ידוע לי, זה בסדר', 'I know, it\'s fine'), options: { opensAppToForeground: false } },
  ];
  if (brokenLabel) actions.push({ identifier: 'baby', buttonTitle: brokenLabel, options: { opensAppToForeground: false } });
  await Notifications.setNotificationCategoryAsync('night', actions).catch(() => undefined);
  const gotIt: Notifications.NotificationAction = { identifier: 'snooze', buttonTitle: t('הבנתי', 'Got it'), options: { opensAppToForeground: false } };
  await Notifications.setNotificationCategoryAsync('nag', [gotIt]).catch(() => undefined);
  await Notifications.setNotificationCategoryAsync('workout', [
    { identifier: 'trained', buttonTitle: t('התאמנתי', 'I trained'), options: { opensAppToForeground: false } },
    { identifier: 'reschedule', buttonTitle: t('לא מסתדר', 'Can\'t make it'), options: { opensAppToForeground: true } },
    gotIt,
  ]).catch(() => undefined);
  // A network that looks like a gym: yes or no, nothing in between
  await Notifications.setNotificationCategoryAsync('gym_guess', [
    { identifier: 'gym_yes', buttonTitle: t('כן, זה חדר הכושר', 'Yes, that\'s the gym'), options: { opensAppToForeground: false } },
    { identifier: 'gym_no', buttonTitle: t('לא', 'No'), options: { opensAppToForeground: false } },
  ]).catch(() => undefined);
  // Meal reminder: he ate but did not log it
  await Notifications.setNotificationCategoryAsync('meal', [
    { identifier: 'ate', buttonTitle: t('אכלתי, לא רשמתי', 'I ate, didn\'t log'), options: { opensAppToForeground: false } },
    gotIt,
  ]).catch(() => undefined);
  // Water: one tap logs what he drank, in his own unit
  const drink: Notifications.NotificationAction[] =
    container === 250
      ? [{ identifier: 'drank_250', buttonTitle: t('שתיתי כוס', 'I drank a glass'), options: { opensAppToForeground: false } }]
      : container === 30
      ? [
          { identifier: 'drank_150', buttonTitle: t('5 לגימות', '5 sips'), options: { opensAppToForeground: false } },
          { identifier: 'drank_300', buttonTitle: t('10 לגימות', '10 sips'), options: { opensAppToForeground: false } },
        ]
      : [
          { identifier: `drank_${container / 2}`, buttonTitle: t('חצי בקבוק', 'Half a bottle'), options: { opensAppToForeground: false } },
          { identifier: `drank_${container}`, buttonTitle: t('בקבוק', 'Bottle'), options: { opensAppToForeground: false } },
        ];
  await Notifications.setNotificationCategoryAsync('water', [...drink, gotIt]).catch(() => undefined);
}
