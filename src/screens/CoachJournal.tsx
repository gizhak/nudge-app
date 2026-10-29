import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { journal, JournalEntry } from '../coach/journal';
import { Ionicons } from '@expo/vector-icons';
import { followKey, FollowUp } from '../coach/followup';
import { ackTopic, doneSince, loadActed, loadFollowUps } from '../coach/followupStore';
import { dayKey, loadLog, loadSnoozes, SentMessage } from '../coach/store';
import { Card } from '../ui/components';
import { C, T } from '../ui/theme';

import { ROW, SIDE_START, LOCALE, t } from '../i18n';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
/** Each topic's mark: an icon in its color, the only color in the bubble. */
export function topicLook(key: string): { icon: IconName; color: string; label: string } {
  const k = key.toLowerCase();
  if (k.startsWith('focus')) return { icon: 'locate', color: C.signal, label: t('המיקוד של השבוע', 'This week\'s focus') };
  if (k.startsWith('proposal')) return { icon: 'git-compare-outline', color: C.signal, label: t('שינוי בתוכנית', 'Plan change') };
  if (k.startsWith('workout_feel')) return { icon: 'barbell', color: '#F2A58E', label: t('משקלים', 'Weights') };
  if (k.startsWith('sleep_missing')) return { icon: 'moon-outline', color: '#8E9BD8', label: t('שינה', 'Sleep') };
  if (k.startsWith('water')) return { icon: 'water', color: C.water, label: t('מים', 'Water') };
  if (k.startsWith('weigh') || k.startsWith('weight')) return { icon: 'scale-outline', color: C.good, label: t('משקל', 'Weight') };
  if (/^(go_to_sleep|short_sleep|sleep|night)/.test(k)) return { icon: 'moon', color: C.sleep, label: t('שינה', 'Sleep') };
  if (/^(steps|sync_steps)/.test(k)) return { icon: 'footsteps', color: C.good, label: t('צעדים', 'Steps') };
  if (/^(run)/.test(k)) return { icon: 'walk', color: C.signal, label: t('ריצה', 'Run') };
  if (/^(workout|missed_workout|week_behind|long_break|gym|home_before_workout|outing_workout)/.test(k)) return { icon: 'barbell', color: C.signal, label: t('אימון', 'Workout') };
  if (/^(meal|food|protein|evening|leave_office|pre_workout|weekend_guard|craving|outing_prep)/.test(k)) return { icon: 'restaurant', color: C.kcal, label: t('אוכל', 'Food') };
  if (k.startsWith('day_summary')) return { icon: 'reader-outline', color: C.ink, label: t('סיכום היום', 'Day summary') };
  if (k.startsWith('checkin')) return { icon: 'pulse', color: C.ink, label: t('בדיקה', 'Check') };
  return { icon: 'chatbubble-ellipses', color: C.muted, label: t('המאמן', 'The coach') };
}

const time = (at: number) => new Date(at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

/** Today's coach messages, one line per topic. `limit` shows a short preview with a link to the rest. */
export default function CoachJournal({ limit, onMore, tick = 0 }: { limit?: number; onMore?: () => void; tick?: number }) {
  const [log, setLog] = useState<SentMessage[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [quiet, setQuiet] = useState<Record<string, number>>({});
  const [follow, setFollow] = useState<Record<string, FollowUp>>({});
  const [acted, setActed] = useState<Record<string, number>>({});
  useEffect(() => {
    loadActed().then(setActed);
    loadLog().then((l) => setLog(l.filter((m) => m.day === dayKey())));
    loadSnoozes().then(setQuiet);
    loadFollowUps().then(setFollow);
  }, [tick]);
  const gotIt = async (key: string) => {
    await ackTopic(key);
    setQuiet(await loadSnoozes());
    setFollow(await loadFollowUps());
  };

  const entries = journal(log);
  if (!entries.length) return null;
  const stateOf = (e: JournalEntry) => {
    const f = followKey(e.key) ? follow[followKey(e.key)!] : undefined;
    const done = doneSince(acted, e.key, e.at);
    const acked = (quiet[e.key] ?? 0) > Date.now();
    const answerable = e.key !== 'food' && e.key !== 'status';
    const overdue = !done && !!f && Date.now() >= f.dueAt;
    // Waiting for him: something he can answer, not done, and not answered yet (or answered and still not done in time)
    const waiting = answerable && !done && (!acked || overdue);
    return { f, done, acked, overdue, waiting };
  };
  const waiting = entries.filter((e) => stateOf(e).waiting);
  const rest = entries.filter((e) => !stateOf(e).waiting);
  const shownRest = limit ? rest.slice(0, Math.max(0, limit - waiting.length)) : rest;

  return (
    <View style={{ gap: 10 }}>
      <Text style={[T.muted, { fontSize: 13 }]}>{log.length === 1 ? t('הודעה אחת היום', 'One message today') : t(`${log.length} הודעות היום`, `${log.length} messages today`)}</Text>
      {waiting.length > 0 && <Text style={[T.bold, s.section]}>{t('מחכה לך', 'Waiting for you')}</Text>}
      {waiting.map((e) => {
        const st = stateOf(e);
        return (
          <Entry
            key={e.key}
            e={e}
            open={open === e.key}
            onToggle={() => setOpen(open === e.key ? null : e.key)}
            compact={false}
            acked={st.acked}
            follow={st.f}
            done={st.done}
            onGotIt={() => gotIt(e.key)}
          />
        );
      })}
      {shownRest.length > 0 && <Text style={[T.bold, s.section, waiting.length > 0 && { marginTop: 8 }]}>{t('מה היה היום', 'What happened today')}</Text>}
      {shownRest.map((e) => {
        const st = stateOf(e);
        const status = st.done ? t('בוצע', 'Done') : st.acked ? t('הבנתי', 'Got it') : e.count > 1 ? t(`${e.count} פעמים`, `${e.count} times`) : '';
        const isOpen = open === e.key;
        const look = topicLook(e.key);
        return (
          <Pressable key={e.key} onPress={() => setOpen(isOpen ? null : e.key)} style={[s.bubble, s.bubbleQuiet]}>
            <View style={s.head}>
              <Ionicons name={look.icon} size={14} color={look.color} />
              <Text style={[T.base, { fontSize: 14, flex: 1, color: C.ink }]} numberOfLines={isOpen ? undefined : 1}>
                {e.title}
              </Text>
              {status ? <Text style={[T.muted, { fontSize: 12 }]}>{status}</Text> : null}
              <Text style={[T.muted, { fontSize: 12 }]}>{time(e.at)}</Text>
            </View>
            {isOpen &&
              (e.items && e.items.length > 1 ? (
                e.items.map((m) => (
                  <View key={m.id + m.at} style={s.item}>
                    <Text style={[T.muted, { fontSize: 12 }]}>{time(m.at)}</Text>
                    <Text style={[T.base, { fontSize: 13, lineHeight: 19, flex: 1 }]}>{m.body}</Text>
                  </View>
                ))
              ) : (
                <Text style={[T.base, { fontSize: 14, lineHeight: 21, color: C.muted }]}>{e.body}</Text>
              ))}
          </Pressable>
        );
      })}
      {limit && entries.length > limit && onMore && (
        <Pressable onPress={onMore} hitSlop={8}>
          <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{t('עוד', 'More')} {entries.length - limit} {t('נושאים בלשונית מאמן', 'topics in the coach tab')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Entry({
  e,
  open,
  onToggle,
  compact,
  acked,
  follow,
  done,
  onGotIt,
}: {
  follow?: FollowUp;
  done: boolean;
  e: JournalEntry;
  open: boolean;
  onToggle: () => void;
  compact: boolean;
  acked: boolean;
  onGotIt?: () => void;
}) {
  const expandable = !!e.items && e.items.length > 1;
  const overdue = !done && !!follow && Date.now() >= follow.dueAt;
  return (
    <Pressable onPress={expandable ? onToggle : undefined} style={[s.bubble, overdue && { borderColor: C.signal }, ((acked && !follow) || done) && { opacity: 0.5 }]}>
      <View style={s.head}>
        <Ionicons name={topicLook(e.key).icon} size={14} color={topicLook(e.key).color} />
        <Text style={[T.bold, { fontSize: 12, color: topicLook(e.key).color === C.muted ? C.muted : C.ink, flex: 1 }]}>{topicLook(e.key).label}</Text>
        <Text style={[T.muted, { fontSize: 12 }]}>{time(e.at)}</Text>
      </View>
      <View style={s.head}>
        {overdue && <Ionicons name="alert-circle" size={18} color={C.signal} />}
        <Text style={[T.bold, { fontSize: 16, lineHeight: 22, flex: 1 }]} numberOfLines={2}>
          {e.title}
        </Text>
        {e.count > 1 && !e.items && <Text style={[T.muted, s.badge]}>{e.count} {t('פעמים', 'times')}</Text>}
        {done && <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>{t('בוצע', 'Done')}</Text>}
        {onGotIt &&
          !done &&
          (overdue ? (
            <Pressable onPress={onGotIt} hitSlop={8} style={[s.gotIt, { backgroundColor: C.signal }]}>
              <Text style={[T.bold, { fontSize: 12, color: '#fff' }]}>{t('הבנתי', 'Got it')}</Text>
            </Pressable>
          ) : acked ? (
            <Text style={[T.muted, s.acked]}>{t('הבנתי', 'Got it')}</Text>
          ) : (
            <Pressable onPress={onGotIt} hitSlop={8} style={s.gotIt}>
              <Text style={[T.bold, { fontSize: 12, color: '#fff' }]}>{t('הבנתי', 'Got it')}</Text>
            </Pressable>
          ))}
      </View>
      {!open && (
        <Text style={[T.base, { fontSize: 14, lineHeight: 21, color: '#4A453F' }]} numberOfLines={compact ? 1 : 3}>
          {e.body}
        </Text>
      )}
      {follow && !done && (
        <Text style={[T.bold, { fontSize: 12, color: overdue ? C.signal : C.muted }]}>
          {overdue
            ? t(`הבנתי ב${time(follow.ackAt)}, אבל לא בוצע${follow.count > 1 ? ` (${follow.count} פעמים)` : ''}`, `Got it at ${time(follow.ackAt)}, but not done${follow.count > 1 ? ` (${follow.count} times)` : ''}`)
            : t(`הבנתי ב${time(follow.ackAt)}. אבדוק שוב ב${time(follow.dueAt)}`, `Got it at ${time(follow.ackAt)}. I will check again at ${time(follow.dueAt)}`)}
        </Text>
      )}
      {expandable && !open && <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>{t('הצג הכל', 'Show all')}</Text>}
      {open &&
        e.items!.map((m) => (
          <View key={m.id + m.at} style={s.item}>
            <Text style={[T.muted, { fontSize: 12 }]}>{time(m.at)}</Text>
            <Text style={[T.base, { fontSize: 13, lineHeight: 19, flex: 1 }]}>{m.body}</Text>
          </View>
        ))}
    </Pressable>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 13, color: C.muted },
  line: { gap: 4, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.track },
  entry: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderColor: C.track },
  // A message bubble from the coach: on the right, the corner by its tail smaller
  bubble: { alignSelf: SIDE_START, maxWidth: '92%', backgroundColor: C.card, borderRadius: 22, borderBottomRightRadius: 8, paddingVertical: 12, paddingHorizontal: 14, gap: 6, borderWidth: 1.5, borderColor: C.card },
  bubbleQuiet: { paddingVertical: 10, gap: 4, backgroundColor: '#FBFAF7', borderColor: '#FBFAF7' },
  head: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  badge: { fontSize: 11, color: C.muted, borderWidth: 1, borderColor: C.track, borderRadius: 8, paddingHorizontal: 6 },
  gotIt: { borderWidth: 0, backgroundColor: C.ink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  acked: { fontSize: 12, paddingHorizontal: 8, textDecorationLine: 'line-through' },
  item: { flexDirection: ROW, gap: 8, paddingTop: 4 },
});
