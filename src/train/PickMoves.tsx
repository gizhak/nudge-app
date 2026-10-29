// The moves of one session as a checklist: by muscle group, every move the training place allows,
// the recommended ones marked. A summary on top counts the moves and the minutes against the session.
// Tapping a photo shows how the move is done; tapping the row checks or unchecks it.
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EditableSession } from '../profile/derive';
import { C, FONT, T } from '../ui/theme';
import ExerciseHow from './ExerciseHow';
import { picsOf } from './exercisePics';
import { checklistOf, exercisesOf, Gear, minutesOf, recommendedPicks } from './library';

import { CHEVRON_BACK, ROW, t } from '../i18n';
import { moveName, repsText } from '../i18n/moves';
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function PickMoves({
  session,
  gear,
  onSave,
  onClose,
}: {
  session: EditableSession | null;
  gear: Gear[];
  /** undefined: back to the recommendation */
  onSave: (picks: string[] | undefined) => void;
  onClose: () => void;
}) {
  const rec = useMemo(() => (session ? recommendedPicks(session.recommended) : []), [session]);
  const list = useMemo(() => (session ? checklistOf(session.recommended, gear) : { groups: [] }), [session, gear]);
  const [on, setOn] = useState<string[]>([]);
  const [how, setHow] = useState<string | null>(null);
  useEffect(() => {
    if (session) setOn(session.picked?.length ? session.picked : rec);
  }, [session, rec]);

  if (!session) return null;
  const chosen = exercisesOf(on, list);
  const minutes = chosen.reduce((a, e) => a + minutesOf(e), 0);
  const room = Math.max(10, session.minutes - session.finisherMinutes);
  const over = minutes > room + 5;
  const empty = list.groups.filter((g) => !g.moves.some((x) => on.includes(x.name))).map((g) => g.name);
  const warns = [
    empty.length ? t(`אין אף תרגיל ל${empty.join(' ול')}. צריך לפחות אחד.`, `No exercise for ${empty.join(' and ')}. Pick at least one.`) : '',
    over ? t(`יוצא כ ${minutes} דקות, יותר מ ${room} שיש לתרגילים. אפשר להוריד תרגיל, או להאריך את האימון בהגדרות.`, `Comes to about ${minutes} minutes, more than the ${room} there is for exercises. Drop an exercise, or make the workout longer in settings.`) : '',
  ].filter(Boolean);
  const toggle = (name: string) => setOn((xs) => (xs.includes(name) ? xs.filter((x) => x !== name) : [...xs, name]));
  const howMove = how ? list.groups.flatMap((g) => g.moves).find((x) => x.name === how) : undefined;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.screen}>
        <View style={s.head}>
          <View style={s.topRow}>
            <Pressable onPress={onClose} style={s.back} hitSlop={8} accessibilityLabel={t("חזרה", 'Back')}>
              <Ionicons name={CHEVRON_BACK} size={22} color={C.ink} />
            </Pressable>
            {!same(on, rec) && (
              <Pressable onPress={() => setOn(rec)} hitSlop={8}>
                <Text style={[T.bold, { fontSize: 13, color: C.muted, textDecorationLine: 'underline' }]}>{t('חזרה להמלצה', 'Back to the recommendation')}</Text>
              </Pressable>
            )}
          </View>
          <Text style={[T.bold, { fontSize: 26, fontFamily: FONT.black }]}>{session.title}</Text>
          <View style={s.sum}>
            <View style={s.sumRow}>
              <Text style={[T.bold, { fontSize: 19, color: '#fff' }]}>{chosen.length === 1 ? t('נבחר תרגיל אחד', '1 exercise picked') : t(`נבחרו ${chosen.length} תרגילים`, `${chosen.length} exercises picked`)}</Text>
              <Text style={[T.bold, { fontSize: 14, color: over ? '#E9B872' : '#B9B2A8' }]}>
                {t('כ', 'about')} {minutes} {t('דקות מתוך', 'minutes of')} {room}
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.min(100, Math.round((minutes / room) * 100))}%`, backgroundColor: over ? '#E9B872' : '#8FC7A0' }]} />
            </View>
            {warns.map((w) => (
              <Text key={w} style={[T.base, { fontSize: 13, lineHeight: 19, color: '#E9B872' }]}>
                {w}
              </Text>
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }}>
          {list.groups.map((g) => {
            const c = g.moves.filter((x) => on.includes(x.name)).length;
            return (
              <View key={g.group} style={{ gap: 8 }}>
                <View style={s.groupHead}>
                  <Text style={[T.bold, { fontSize: 18, fontFamily: FONT.black }]}>{g.name}</Text>
                  <Text style={[T.bold, { fontSize: 13, color: c ? C.muted : C.warn }]}>{c === 0 ? t('אף תרגיל', 'None') : c === 1 ? t('תרגיל אחד', 'One exercise') : t(`${c} נבחרו`, `${c} picked`)}</Text>
                </View>
                <View style={s.card}>
                  {g.moves.map((x, i) => {
                    const sel = on.includes(x.name);
                    const pics = picsOf(x.name);
                    return (
                      <Pressable
                        key={x.name}
                        onPress={() => toggle(x.name)}
                        style={({ pressed }) => [s.row, i > 0 && s.sep, pressed && { opacity: 0.7 }]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: sel }}
                      >
                        <View style={[s.box, sel ? s.boxOn : s.boxOff]}>{sel && <Ionicons name="checkmark" size={17} color="#fff" />}</View>
                        <Pressable onPress={() => pics && setHow(x.name)} disabled={!pics} accessibilityLabel={t(`${x.name}: איך עושים`, `${moveName(x.name)}: how it is done`)}>
                          {pics ? (
                            <Image source={pics.b ?? pics.a} style={[s.thumb, { opacity: sel ? 1 : 0.55 }]} />
                          ) : (
                            <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                              <Ionicons name="barbell-outline" size={18} color={C.muted} />
                            </View>
                          )}
                        </Pressable>
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={[sel ? T.bold : T.base, { fontSize: 15, color: sel ? C.ink : C.muted }]}>{moveName(x.name)}</Text>
                          <Text style={[T.muted, { fontSize: 12 }]}>
                            {x.sets} × {repsText(x.reps)}
                            {x.rec ? t(' · מומלץ', ' · recommended') : ''}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{t('לחיצה על תמונה מראה איך עושים את התרגיל.', 'Tap a photo to see how the exercise is done.')}</Text>
        </ScrollView>

        <View style={s.foot}>
          <Pressable
            onPress={() => {
              if (empty.length && chosen.length === 0) return;
              onSave(same(on, rec) ? undefined : exercisesOf(on, list).map((e) => e.name));
            }}
            style={({ pressed }) => [s.save, (chosen.length === 0 || pressed) && { opacity: chosen.length === 0 ? 0.4 : 0.85 }]}
            disabled={chosen.length === 0}
          >
            <Text style={[T.bold, { color: '#fff', fontSize: 16, textAlign: 'center' }]}>{t('שמור', 'Save')}</Text>
          </Pressable>
        </View>
      </View>
      <ExerciseHow list={howMove ? [{ name: howMove.name, sets: howMove.sets, reps: howMove.reps }] : []} start={howMove ? 0 : null} onClose={() => setHow(null)} />
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 44 },
  head: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  topRow: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sum: { backgroundColor: C.ink, borderRadius: 20, padding: 14, gap: 8 },
  sumRow: { flexDirection: ROW, alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#3A3733', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  groupHead: { flexDirection: ROW, alignItems: 'baseline', justifyContent: 'space-between' },
  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10 },
  row: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 9 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  box: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.ink },
  boxOff: { borderWidth: 2, borderColor: '#CFC8BE', backgroundColor: '#fff' },
  thumb: { width: 60, height: 40, borderRadius: 9, backgroundColor: C.bg },
  foot: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 },
  save: { backgroundColor: C.ink, borderRadius: 16, paddingVertical: 15 },
});
