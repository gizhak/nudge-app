// "Got it" that is followed up: stored per day, with an exact-time notification that
// is cancelled as soon as the data shows the task done.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { planThisWeek } from '../config/goals';
import { CHANNELS } from '../notifications/schedule';
import { dueTime, Facts, followKey, FollowUp, followUpMessage, familyOf, isResolved } from './followup';
import { categoryFor } from './category';
import { dayKey, loadLog, loadPrefs, snoozeToday, snoozeTopic } from './store';

const KEY = 'coach.followups.v1';

export async function loadFollowUps(now = new Date()): Promise<Record<string, FollowUp>> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    return raw.day === dayKey(now) ? raw.items ?? {} : {};
  } catch {
    return {};
  }
}

async function save(items: Record<string, FollowUp>, now = new Date()) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ day: dayKey(now), items }));
}

/** Topics that would repeat the same nag; quiet until the follow-up is due. */
const FAMILY_TOPICS: Record<string, string[]> = {
  weigh: ['weigh_in'],
  water: ['water', 'water_morning'],
  workout: ['workout_today', 'workout_now', 'missed_workout', 'outing_workout'],
  sync: ['sync_steps', 'sync_sleep'],
  hc: ['hc_broken'],
  food: ['food_none'],
};

/**
 * "Got it". On something the data can check, it postpones and schedules the return;
 * on anything else it just quiets the topic (fallbackMs, or until midnight).
 */
export async function ackTopic(topic: string, now = new Date(), fallbackMs?: number): Promise<void> {
  const base = topic.split('@')[0];
  const key = followKey(base);
  const quietOthers = () => (fallbackMs ? snoozeTopic(base, fallbackMs, now.getTime()) : snoozeToday(base, now));
  if (!key) return quietOthers();
  const prefs = await loadPrefs();
  let start: number | null = null;
  if (familyOf(base) === 'workout') {
    const w = planThisWeek(now).find((p) => p.day === now.getDay());
    start = w ? w.hour * 60 + w.minute : null;
  }
  const due = dueTime(base, now, prefs, start);
  if (!due) return quietOthers();

  const all = await loadFollowUps(now);
  const prev = all[key];
  if (prev?.notifId) await Notifications.cancelScheduledNotificationAsync(prev.notifId).catch(() => undefined);
  const f: FollowUp = { key, topic: base, ackAt: now.getTime(), dueAt: due.getTime(), count: (prev?.count ?? 0) + 1 };
  const msg = followUpMessage(f);
  f.notifId = await Notifications.scheduleNotificationAsync({
    content: { title: msg.title, body: msg.body, categoryIdentifier: categoryFor(base), data: { topic: base, followUp: key } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due, channelId: CHANNELS[msg.level] },
  }).catch(() => undefined);
  all[key] = f;
  await save(all, now);
  // The regular nag stays quiet until a little after the follow-up
  const quietMs = due.getTime() - now.getTime() + 20 * 60000;
  for (const t of key.startsWith('meal_reminder_') ? [key] : FAMILY_TOPICS[key] ?? [base]) await snoozeTopic(t, quietMs, now.getTime());
}

/** He did it in the app: no follow-up. */
export async function resolveFollowUps(keys: string[], now = new Date()) {
  const all = await loadFollowUps(now);
  let changed = false;
  for (const k of keys) {
    const f = all[k];
    if (!f) continue;
    if (f.notifId) await Notifications.cancelScheduledNotificationAsync(f.notifId).catch(() => undefined);
    delete all[k];
    changed = true;
  }
  if (changed) await save(all, now);
}

/** Every coach run: whatever the data now shows done is closed, and its pending return cancelled. */
export async function checkFollowUps(facts: Facts, now = new Date()): Promise<Record<string, FollowUp>> {
  const all = await loadFollowUps(now);
  const done = Object.values(all).filter((f) => isResolved(f, facts)).map((f) => f.key);
  if (done.length) await resolveFollowUps(done, now);
  return loadFollowUps(now);
}

const ACTED_KEY = 'coach.acted.v1';

/** When he last did each kind of task today, from the app or a notification button. */
export async function loadActed(now = new Date()): Promise<Record<string, number>> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(ACTED_KEY)) ?? '{}');
    return raw.day === dayKey(now) ? raw.items ?? {} : {};
  } catch {
    return {};
  }
}

/**
 * He did it: drank, weighed, trained, ate. Closes the follow-up, marks the coach's
 * messages on it as done, and clears its notifications from the shade right away.
 */
export async function didIt(keys: string[], now = new Date()) {
  await resolveFollowUps(keys, now);
  const marks = new Set(keys.map(markOf));
  const acted = await loadActed(now);
  for (const k of marks) acted[k] = now.getTime();
  await AsyncStorage.setItem(ACTED_KEY, JSON.stringify({ day: dayKey(now), items: acted }));
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    for (const n of shown) {
      const topic = (n.request.content.data as any)?.topic;
      if (typeof topic === 'string' && familyOf(topic) && marks.has(markOf(topic))) await Notifications.dismissNotificationAsync(n.request.identifier);
    }
  } catch {
    // best effort
  }
}

/** What "done" is recorded under: each meal on its own, everything else by kind. */
function markOf(keyOrTopic: string): string {
  const fam = familyOf(keyOrTopic);
  if (fam === 'meal') return keyOrTopic.split('@')[0];
  return fam ?? keyOrTopic;
}

/**
 * The data shows a task done, even if he did it outside the app (a smart scale writing
 * through Zepp, a meal logged in the food app): close it like a "done" tap would.
 */
export async function syncDoneFromData(facts: Facts, now = new Date()): Promise<Record<string, FollowUp>> {
  const pending = await checkFollowUps(facts, now);
  const probe = (topic: string) => isResolved({ key: followKey(topic) ?? topic, topic, ackAt: 0, dueAt: 0, count: 0 }, facts);
  const done: string[] = [];
  for (const t of ['weigh_in', 'water', 'workout_today', 'hc_broken', 'food_none']) if (probe(t)) done.push(t);
  if (probe('sync_steps') && probe('sync_sleep')) done.push('sync_steps');
  for (const slot of facts.mealSlotsDone ?? []) done.push(`meal_reminder_${slot}`);
  // Only what the coach actually said today and is not yet marked done
  const acted = await loadActed(now);
  const log = (await loadLog()).filter((m) => m.day === dayKey(now));
  const open = done.filter((t) => log.some((m) => familyOf(m.id) && markOf(m.id) === markOf(t) && m.at > (acted[markOf(t)] ?? 0)));
  if (open.length) await didIt(open, now);
  return pending;
}

/** A message is outdated when he did that kind of task after it was sent. */
export const doneSince = (acted: Record<string, number>, id: string, at: number) => !!familyOf(id) && (acted[markOf(id)] ?? 0) > at;
