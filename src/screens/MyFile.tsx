import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { exportBackup, importBackup } from '../profile/backup';
import { TextField } from '../ui/inputs';
import { DAY_LETTERS, DAY_NAMES, pad2, defaultWeekend } from '../config/goals';
import { derive, SPLITS } from '../profile/derive';
import { Profile } from '../profile/profile';
import { cups, waterTarget } from '../nutrition/water';
import { Bar, Card, PrimaryButton } from '../ui/components';
import { C, fmt, T } from '../ui/theme';

import { END, ROW, t } from '../i18n';
const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const list = (xs: string[]) => (xs.length ? xs.join(', ') : t('אין', 'None'));
const L = {
  goal: { lose: t('ירידה במשקל', 'Lose weight'), recomp: t('ירידה בשומן ובניית שריר', 'Lose fat and build muscle'), gain: t('בניית שריר', 'Build muscle'), maintain: t('שמירה', 'Maintain') },
  pace: { moderate: t('מתון', 'Moderate'), fast: t('מהיר', 'Fast') },
  exp: { beginner: t('מתחיל', 'Beginner'), returning: t('חוזר אחרי הפסקה', 'Back after a break'), regular: t('מתאמן קבוע', 'Trains regularly') },
  pain: { knees: t('ברכיים', 'Knees'), back: t('גב', 'Back'), shoulders: t('כתפיים', 'Shoulders') },
  chronic: { bp: t('לחץ דם', 'Blood pressure'), diabetes: t('סוכרת', 'Diabetes'), heart: t('לב', 'Heart') },
  stop: { work: t('עומס בעבודה', 'Busy at work'), family: t('משפחה', 'Family'), injury: t('פציעה', 'Injury'), motivation: t('מוטיבציה', 'Motivation'), never: t('לא הפסקתי', 'Never stopped') },
  work: { office: t('משרד', 'Office'), home: t('מהבית', 'From home'), hybrid: t('משולב', 'Hybrid') },
  load: { desk: t('יושב', 'Sitting'), mixed: t('חלק בעמידה', 'Partly standing'), physical: t('פיזית', 'Physical') },
  rel: { single: t('רווק', 'Single'), partner: t('בזוגיות', 'In a relationship'), separated: t('גרוש או פרוד', 'Divorced or separated') },
  kids: { none: t('אין ילדים', 'No kids'), baby: t('תינוק', 'Baby'), young: t('ילדים קטנים', 'Young kids'), older: t('ילדים גדולים', 'Older kids') },
  place: { gym: t('חדר כושר', 'Gym'), home: t('בית', 'Home'), outdoor: t('בחוץ', 'Outdoors') },
  diet: { vegetarian: t('צמחוני', 'Vegetarian'), kosher: t('כשר', 'Kosher'), no_dairy: t('בלי חלב', 'No dairy') },
  hard: { evening: t('ערב', 'Evening'), stress: t('לחץ', 'Stress'), boredom: t('שעמום', 'Boredom'), weekend: t('סוף שבוע', 'Weekend') },
  level: { quiet: t('שקט', 'Quiet'), normal: t('רגיל', 'Normal'), close: t('צמוד', 'Close'), drill: t('דומיננטי', 'Dominant') },
  tone: { direct: t('ישיר', 'Direct'), encouraging: t('מעודד', 'Encouraging') },
};

interface Line {
  label: string;
  value: string | null; // null = not answered yet
}

interface Section {
  step: number;
  title: string;
  effect: string;
  lines: Line[];
}

function sections(p: Profile): Section[] {
  const separatedWithKids = p.relationship === 'separated' && p.kids !== 'none';
  return [
    {
      step: 0,
      title: t('עליך', 'About you'),
      effect: t('קלוריות, חלבון ויעד מים', 'Calories, protein and water target'),
      lines: [
        { label: t('שם', 'Name'), value: p.name?.trim() ? p.name.trim() : null },
        { label: t('גיל', 'Age'), value: String(p.age) },
        { label: t('גובה', 'Height'), value: t(`${p.heightCm} ס"מ`, `${p.heightCm} cm`) },
        { label: t('משקל בשאלון', 'Weight in the questions'), value: t(`${fmt(p.weightKg, 1)} ק"ג`, `${fmt(p.weightKg, 1)} kg`) },
      ],
    },
    {
      step: 1,
      title: t('המטרה', 'The goal'),
      effect: t('גירעון קלורי, תאריך יעד, והמשפט שהמאמן מזכיר כשקשה', 'Calorie deficit, target date, and the sentence the coach reminds you of when it is hard'),
      lines: [
        { label: t('מטרה', 'Goal'), value: L.goal[p.goal] },
        { label: t('קצב', 'Pace'), value: L.pace[p.pace] },
        { label: t('משקל יעד', 'Target weight'), value: p.targetWeightKg ? t(`${p.targetWeightKg} ק"ג`, `${p.targetWeightKg} kg`) : t('לא הוגדר', 'Not set') },
        { label: t('למה עכשיו', 'Why now'), value: p.whyNow?.trim() ? `"${p.whyNow.trim()}"` : null },
      ],
    },
    {
      step: 2,
      title: t('בריאות וניסיון', 'Health and experience'),
      effect: t('בחירת תרגילים, עצימות, וזיהוי מוקדם של נפילה', 'Choice of moves, intensity, and spotting a slip early'),
      lines: [
        { label: t('ניסיון', 'Experience'), value: L.exp[p.experience] },
        { label: t('כאבים', 'Pain'), value: list(p.pains.map((x) => L.pain[x])) },
        { label: t('מגבלה רפואית', 'Medical limit'), value: p.medicalLimit ? t('כן', 'Yes') : t('לא', 'No') },
        { label: t('מצב רפואי', 'Medical condition'), value: p.chronic === undefined ? null : list(p.chronic.map((x) => L.chronic[x])) },
        ...(p.experience !== 'beginner' ? [{ label: t('מה הפיל בפעם הקודמת', 'What made you stop last time'), value: p.stopReason ? L.stop[p.stopReason] : null }] : []),
      ],
    },
    {
      step: 3,
      title: t('עבודה ולוח זמנים', 'Work and schedule'),
      effect: t('תזכורות ארוחות, ימי ושעות אימון, יעד צעדים', 'Meal reminders, workout days and hours, step target'),
      lines: [
        { label: t('עבודה', 'Work'), value: t(`${L.work[p.workMode]}, ${hhmm(p.workStart)} עד ${hhmm(p.workEnd)}`, `${L.work[p.workMode]}, ${hhmm(p.workStart)} to ${hhmm(p.workEnd)}`) },
        { label: t('כמה פיזית', 'How physical'), value: p.workLoad ? L.load[p.workLoad] : null },
        { label: t('משמרות', 'Shifts'), value: p.shiftWork === undefined ? null : p.shiftWork ? t('כן', 'Yes') : t('לא', 'No') },
        { label: t('סוף שבוע', 'Weekend'), value: p.weekendStyle === 'same' ? t('כמו כל יום', 'Like any day') : t(`${(p.weekendDays?.length ? p.weekendDays : defaultWeekend()).map((d) => DAY_NAMES[d]).join(' ו')}, ${p.weekendStyle === 'flex' ? 'גמיש' : 'רגיל'}`, `${(p.weekendDays?.length ? p.weekendDays : defaultWeekend()).map((d) => DAY_NAMES[d]).join(' and ')}, ${p.weekendStyle === 'flex' ? 'flexible' : 'normal'}`) },
        { label: t('אימונים', 'Workouts'), value: p.slots.length ? p.slots.map((s) => `${DAY_NAMES[s.day]} ${hhmm(s.time)}`).join(', ') : t('אין', 'None') },
        { label: t('מקום', 'Place'), value: t(`${L.place[p.trainPlace]}, ${p.sessionMinutes} דקות`, `${L.place[p.trainPlace]}, ${p.sessionMinutes} minutes`) },
        { label: t('חלוקה', 'Split'), value: SPLITS.find((x) => x.key === (p.split ?? 'full'))?.label ?? t('גוף מלא', 'Full body') },
        { label: t('בסוף כל אימון', 'After each workout'), value: [p.rope && t('חבל', 'Rope'), p.abs && t('בטן', 'Abs')].filter(Boolean).join(', ') || t('כלום', 'Nothing') },
      ],
    },
    {
      step: 4,
      title: t('משפחה ובית', 'Family and home'),
      effect: t('איך המאמן קורא לילה קטוע, ואיך הוא מתכנן ימים עם הילדים', 'How the coach reads a broken night, and how it plans days with the kids'),
      lines: [
        { label: t('מצב משפחתי', 'Relationship status'), value: p.relationship ? L.rel[p.relationship] : null },
        { label: t('ילדים', 'Kids'), value: L.kids[p.kids] },
        ...(separatedWithKids
          ? [{ label: t('ימים עם הילדים', 'Days with the kids'), value: p.kidsDays?.length ? p.kidsDays.map((d) => DAY_LETTERS[d]).join(' ') : null }]
          : []),
      ],
    },
    {
      step: 5,
      title: t('שגרה ואוכל', 'Routine and food'),
      effect: t('שעות שקט, שומר לילה, זמני ארוחות ותזכורות מקדימות', 'Quiet hours, night guard, meal times and early reminders'),
      lines: [
        { label: t('שינה', 'Sleep'), value: t(`${hhmm(p.bedTime)} עד ${hhmm(p.wakeTime)}`, `${hhmm(p.bedTime)} to ${hhmm(p.wakeTime)}`) },
        { label: t('התעוררויות בלילה', 'Waking at night'), value: p.nightWakeups ? t('כן', 'Yes') : t('לא', 'No') },
        { label: t('צהריים', 'Noon'), value: p.naps ? t('ישן', 'Naps') : t('לא ישן', 'No nap') },
        { label: t('ארוחות ביום', 'Meals a day'), value: String(p.mealsPerDay) },
        { label: t('הגבלות', 'Restrictions'), value: list(p.diet.map((x) => L.diet[x])) },
        { label: t('הכי קשה', 'Hardest'), value: p.hardTimes === undefined ? null : list(p.hardTimes.map((x) => L.hard[x])) },
      ],
    },
    {
      step: 6,
      title: t('המאמן', 'The coach'),
      effect: t('כמה הודעות ובאיזה טון', 'How many messages and in what tone'),
      lines: [
        { label: t('רמה', 'Level'), value: L.level[p.level] },
        { label: t('טון', 'Tone'), value: L.tone[p.tone] },
      ],
    },
  ];
}

export default function MyFile({
  profile,
  onEdit,
  onRedoAll,
  onClose,
  onReload,
}: {
  profile: Profile;
  onEdit: (step: number) => void;
  onRedoAll: () => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const [backup, setBackup] = useState('');
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const all = sections(profile);
  const lines = all.flatMap((s) => s.lines);
  const answered = lines.filter((l) => l.value !== null).length;
  const gaps = all.filter((s) => s.lines.some((l) => l.value === null));
  const d = derive(profile);
  const trainingDays = profile.slots.length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} stickyHeaderIndices={[0]}>
      <View style={s.head}>
        <Text style={[T.bold, { fontSize: 28, lineHeight: 36 }]}>{t('התיק שלי', 'My file')}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={[T.bold, { color: C.muted, fontSize: 15 }]}>{t('סגור', 'Close')}</Text>
        </Pressable>
      </View>

      <Card>
        <View style={s.rowBetween}>
          <Text style={[T.bold, { fontSize: 16 }]}>{t('התיק מלא ב', 'Your file is complete at')} {Math.round((answered / lines.length) * 100)}%</Text>
          {gaps.length > 0 && <View style={s.dot} />}
        </View>
        <Bar value={answered} max={lines.length} height={6} />
        <Text style={[T.muted, { fontSize: 13 }]}>
          {gaps.length ? t(`חסרות תשובות ב: ${gaps.map((g) => g.title).join(', ')}. כל תשובה עושה את המאמן מדויק יותר.`, `Missing answers in: ${gaps.map((g) => g.title).join(', ')}. Every answer makes the coach more accurate.`) : t('כל השאלות נענו. המאמן ישאל עוד בהמשך, כשזה יהיה רלוונטי.', 'All questions answered. The coach will ask more later, when it is relevant.')}
        </Text>
      </Card>

      <Card title={t("המספרים שלך", 'Your numbers')}>
        <Num label={t("קלוריות ביום", 'Calories a day')} value={fmt(d.goals.calories)} how={t(`חילוף חומרים ${fmt(d.bmr)}, שמירה ${fmt(d.maintenance)}, לפי המטרה`, `Metabolism ${fmt(d.bmr)}, maintenance ${fmt(d.maintenance)}, by the goal`)} />
        <Num label={t("חלבון", 'Protein')} value={t(`${d.goals.proteinG} ג'`, `${d.goals.proteinG} g`)} how={t("לפי המשקל והמטרה", 'By weight and goal')} />
        <Num label={t("מים", 'Water')} value={t(`${cups(waterTarget(profile.weightKg, false))} כוסות`, `${cups(waterTarget(profile.weightKg, false))} cups`)} how={t('35 מ"ל לכל ק"ג, ועוד 2 כוסות ביום אימון', '35 ml per kg, plus 2 cups on a workout day')} />
        <Num label={t("צעדים", 'Steps')} value={fmt(d.goals.steps)} how={profile.workLoad === 'physical' ? t('עבודה פיזית', 'Physical work') : t('ברירת מחדל', 'Default')} />
        <Num label={t("אימונים בשבוע", 'Workouts a week')} value={String(trainingDays)} how={t("לפי הימים שבחרת", 'By the days you chose')} />
      </Card>

      {all.map((sec) => {
        const missing = sec.lines.some((l) => l.value === null);
        return (
          <Pressable key={sec.step} onPress={() => onEdit(sec.step)}>
            <Card>
              <View style={s.rowBetween}>
                <View style={s.titleRow}>
                  {missing && <View style={s.dot} />}
                  <Text style={[T.bold, { fontSize: 17 }]}>{sec.title}</Text>
                </View>
                <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{t('עריכה', 'Edit')}</Text>
              </View>
              {sec.lines.map((l) => (
                <View key={l.label} style={s.rowBetween}>
                  <Text style={[T.muted, { fontSize: 14 }]}>{l.label}</Text>
                  <Text style={[T.bold, { fontSize: 14, flexShrink: 1, textAlign: END }, l.value === null && { color: C.signal }]}>
                    {l.value ?? t('חסר', 'Missing')}
                  </Text>
                </View>
              ))}
              <Text style={[T.muted, { fontSize: 12 }]}>{t('משפיע על:', 'Affects:')} {sec.effect}</Text>
            </Card>
          </Pressable>
        );
      })}

      {d.notes.length > 0 && (
        <Card title={t("מה המאמן הסיק", 'What the coach concluded')}>
          {d.notes.map((n) => (
            <Text key={n} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
              {n}
            </Text>
          ))}
        </Card>
      )}

      <PrimaryButton label={t("לעבור על כל השאלון מההתחלה", 'Go through all the questions from the start')} onPress={onRedoAll} />

      <Card title={t("גיבוי והעברה לטלפון חדש", 'Backup and moving to a new phone')}>
        <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
          {t('הייצוא יוצר טקסט עם התיק, ההגדרות והמקומות. שלח אותו לעצמך, ובטלפון החדש הדבק אותו כאן. ההיסטוריה של צעדים, שינה ואוכל לא נכללת, היא נשמרת ב Health Connect.', 'The export makes a text with your file, settings and places. Send it to yourself, and paste it here on the new phone. The history of steps, sleep and food is not included, it is kept in Health Connect.')}
        </Text>
        <Pressable
          style={s.outline}
          onPress={async () => {
            await Share.share({ message: await exportBackup() });
          }}
        >
          <Text style={[T.bold, { textAlign: 'center', fontSize: 15 }]}>{t('ייצוא התיק', 'Export my file')}</Text>
        </Pressable>
        <TextField value={backup} onChange={setBackup} placeholder={t("להדבקת גיבוי", 'Paste the backup')} />
        {backup.trim().length > 0 && (
          <Pressable
            style={s.outline}
            onPress={async () => {
              const err = await importBackup(backup);
              setBackupNote(err ?? t('הגיבוי שוחזר.', 'The backup was restored.'));
              if (!err) {
                setBackup('');
                onReload();
              }
            }}
          >
            <Text style={[T.bold, { textAlign: 'center', fontSize: 15 }]}>{t('שחזור מהגיבוי', 'Restore from the backup')}</Text>
          </Pressable>
        )}
        {backupNote && <Text style={[T.bold, { fontSize: 13 }]}>{backupNote}</Text>}
      </Card>

      <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>
        {t('Nudge הוא כלי עזר ולא תחליף לרופא, דיאטנית או מאמן מוסמך. האחריות לבריאות שלך היא שלך. במצב רפואי, התייעץ עם רופא לפני שינוי באימונים או בתזונה.', 'Nudge is a helper, not a replacement for a doctor, dietitian or certified trainer. You are responsible for your health. With a medical condition, talk to a doctor before changing your workouts or diet.')}
      </Text>
    </ScrollView>
  );
}

function Num({ label, value, how }: { label: string; value: string; how: string }) {
  return (
    <View style={{ gap: 1 }}>
      <View style={s.rowBetween}>
        <Text style={[T.muted, { fontSize: 14 }]}>{label}</Text>
        <Text style={[T.bold, { fontSize: 16 }]}>{value}</Text>
      </View>
      <Text style={[T.muted, { fontSize: 12 }]}>{how}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  outline: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, paddingVertical: 11, backgroundColor: C.card },
  head: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  rowBetween: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  titleRow: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.signal },
});
