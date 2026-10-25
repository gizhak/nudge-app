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

const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'אין');
const L = {
  goal: { lose: 'ירידה במשקל', recomp: 'ירידה בשומן ובניית שריר', gain: 'בניית שריר', maintain: 'שמירה' },
  pace: { moderate: 'מתון', fast: 'מהיר' },
  exp: { beginner: 'מתחיל', returning: 'חוזר אחרי הפסקה', regular: 'מתאמן קבוע' },
  pain: { knees: 'ברכיים', back: 'גב', shoulders: 'כתפיים' },
  chronic: { bp: 'לחץ דם', diabetes: 'סוכרת', heart: 'לב' },
  stop: { work: 'עומס בעבודה', family: 'משפחה', injury: 'פציעה', motivation: 'מוטיבציה', never: 'לא הפסקתי' },
  work: { office: 'משרד', home: 'מהבית', hybrid: 'משולב' },
  load: { desk: 'יושב', mixed: 'חלק בעמידה', physical: 'פיזית' },
  rel: { single: 'רווק', partner: 'בזוגיות', separated: 'גרוש או פרוד' },
  kids: { none: 'אין ילדים', baby: 'תינוק', young: 'ילדים קטנים', older: 'ילדים גדולים' },
  place: { gym: 'חדר כושר', home: 'בית', outdoor: 'בחוץ' },
  diet: { vegetarian: 'צמחוני', kosher: 'כשר', no_dairy: 'בלי חלב' },
  hard: { evening: 'ערב', stress: 'לחץ', boredom: 'שעמום', weekend: 'סוף שבוע' },
  level: { quiet: 'שקט', normal: 'רגיל', close: 'צמוד', drill: 'דומיננטי' },
  tone: { direct: 'ישיר', encouraging: 'מעודד' },
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
      title: 'עליך',
      effect: 'קלוריות, חלבון ויעד מים',
      lines: [
        { label: 'שם', value: p.name?.trim() ? p.name.trim() : null },
        { label: 'גיל', value: String(p.age) },
        { label: 'גובה', value: `${p.heightCm} ס"מ` },
        { label: 'משקל בשאלון', value: `${fmt(p.weightKg, 1)} ק"ג` },
      ],
    },
    {
      step: 1,
      title: 'המטרה',
      effect: 'גירעון קלורי, תאריך יעד, והמשפט שהמאמן מזכיר כשקשה',
      lines: [
        { label: 'מטרה', value: L.goal[p.goal] },
        { label: 'קצב', value: L.pace[p.pace] },
        { label: 'משקל יעד', value: p.targetWeightKg ? `${p.targetWeightKg} ק"ג` : 'לא הוגדר' },
        { label: 'למה עכשיו', value: p.whyNow?.trim() ? `"${p.whyNow.trim()}"` : null },
      ],
    },
    {
      step: 2,
      title: 'בריאות וניסיון',
      effect: 'בחירת תרגילים, עצימות, וזיהוי מוקדם של נפילה',
      lines: [
        { label: 'ניסיון', value: L.exp[p.experience] },
        { label: 'כאבים', value: list(p.pains.map((x) => L.pain[x])) },
        { label: 'מגבלה רפואית', value: p.medicalLimit ? 'כן' : 'לא' },
        { label: 'מצב רפואי', value: p.chronic === undefined ? null : list(p.chronic.map((x) => L.chronic[x])) },
        ...(p.experience !== 'beginner' ? [{ label: 'מה הפיל בפעם הקודמת', value: p.stopReason ? L.stop[p.stopReason] : null }] : []),
      ],
    },
    {
      step: 3,
      title: 'עבודה ולוח זמנים',
      effect: 'תזכורות ארוחות, ימי ושעות אימון, יעד צעדים',
      lines: [
        { label: 'עבודה', value: `${L.work[p.workMode]}, ${hhmm(p.workStart)} עד ${hhmm(p.workEnd)}` },
        { label: 'כמה פיזית', value: p.workLoad ? L.load[p.workLoad] : null },
        { label: 'משמרות', value: p.shiftWork === undefined ? null : p.shiftWork ? 'כן' : 'לא' },
        { label: 'סוף שבוע', value: p.weekendStyle === 'same' ? 'כמו כל יום' : `${(p.weekendDays?.length ? p.weekendDays : defaultWeekend()).map((d) => DAY_NAMES[d]).join(' ו')}, ${p.weekendStyle === 'flex' ? 'גמיש' : 'רגיל'}` },
        { label: 'אימונים', value: p.slots.length ? p.slots.map((s) => `${DAY_NAMES[s.day]} ${hhmm(s.time)}`).join(', ') : 'אין' },
        { label: 'מקום', value: `${L.place[p.trainPlace]}, ${p.sessionMinutes} דקות` },
        { label: 'חלוקה', value: SPLITS.find((x) => x.key === (p.split ?? 'full'))?.label ?? 'גוף מלא' },
        { label: 'בסוף כל אימון', value: [p.rope && 'חבל', p.abs && 'בטן'].filter(Boolean).join(', ') || 'כלום' },
      ],
    },
    {
      step: 4,
      title: 'משפחה ובית',
      effect: 'איך המאמן קורא לילה קטוע, ואיך הוא מתכנן ימים עם הילדים',
      lines: [
        { label: 'מצב משפחתי', value: p.relationship ? L.rel[p.relationship] : null },
        { label: 'ילדים', value: L.kids[p.kids] },
        ...(separatedWithKids
          ? [{ label: 'ימים עם הילדים', value: p.kidsDays?.length ? p.kidsDays.map((d) => DAY_LETTERS[d]).join(' ') : null }]
          : []),
      ],
    },
    {
      step: 5,
      title: 'שגרה ואוכל',
      effect: 'שעות שקט, שומר לילה, זמני ארוחות ותזכורות מקדימות',
      lines: [
        { label: 'שינה', value: `${hhmm(p.bedTime)} עד ${hhmm(p.wakeTime)}` },
        { label: 'התעוררויות בלילה', value: p.nightWakeups ? 'כן' : 'לא' },
        { label: 'צהריים', value: p.naps ? 'ישן' : 'לא ישן' },
        { label: 'ארוחות ביום', value: String(p.mealsPerDay) },
        { label: 'הגבלות', value: list(p.diet.map((x) => L.diet[x])) },
        { label: 'הכי קשה', value: p.hardTimes === undefined ? null : list(p.hardTimes.map((x) => L.hard[x])) },
      ],
    },
    {
      step: 6,
      title: 'המאמן',
      effect: 'כמה הודעות ובאיזה טון',
      lines: [
        { label: 'רמה', value: L.level[p.level] },
        { label: 'טון', value: L.tone[p.tone] },
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
        <Text style={[T.bold, { fontSize: 28, lineHeight: 36 }]}>התיק שלי</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={[T.bold, { color: C.muted, fontSize: 15 }]}>סגור</Text>
        </Pressable>
      </View>

      <Card>
        <View style={s.rowBetween}>
          <Text style={[T.bold, { fontSize: 16 }]}>התיק מלא ב {Math.round((answered / lines.length) * 100)}%</Text>
          {gaps.length > 0 && <View style={s.dot} />}
        </View>
        <Bar value={answered} max={lines.length} height={6} />
        <Text style={[T.muted, { fontSize: 13 }]}>
          {gaps.length ? `חסרות תשובות ב: ${gaps.map((g) => g.title).join(', ')}. כל תשובה עושה את המאמן מדויק יותר.` : 'כל השאלות נענו. המאמן ישאל עוד בהמשך, כשזה יהיה רלוונטי.'}
        </Text>
      </Card>

      <Card title="המספרים שלך">
        <Num label="קלוריות ביום" value={fmt(d.goals.calories)} how={`חילוף חומרים ${fmt(d.bmr)}, שמירה ${fmt(d.maintenance)}, לפי המטרה`} />
        <Num label="חלבון" value={`${d.goals.proteinG} ג'`} how="לפי המשקל והמטרה" />
        <Num label="מים" value={`${cups(waterTarget(profile.weightKg, false))} כוסות`} how={'35 מ"ל לכל ק"ג, ועוד 2 כוסות ביום אימון'} />
        <Num label="צעדים" value={fmt(d.goals.steps)} how={profile.workLoad === 'physical' ? 'עבודה פיזית' : 'ברירת מחדל'} />
        <Num label="אימונים בשבוע" value={String(trainingDays)} how="לפי הימים שבחרת" />
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
                <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>עריכה</Text>
              </View>
              {sec.lines.map((l) => (
                <View key={l.label} style={s.rowBetween}>
                  <Text style={[T.muted, { fontSize: 14 }]}>{l.label}</Text>
                  <Text style={[T.bold, { fontSize: 14, flexShrink: 1, textAlign: 'left' }, l.value === null && { color: C.signal }]}>
                    {l.value ?? 'חסר'}
                  </Text>
                </View>
              ))}
              <Text style={[T.muted, { fontSize: 12 }]}>משפיע על: {sec.effect}</Text>
            </Card>
          </Pressable>
        );
      })}

      {d.notes.length > 0 && (
        <Card title="מה המאמן הסיק">
          {d.notes.map((n) => (
            <Text key={n} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
              {n}
            </Text>
          ))}
        </Card>
      )}

      <PrimaryButton label="לעבור על כל השאלון מההתחלה" onPress={onRedoAll} />

      <Card title="גיבוי והעברה לטלפון חדש">
        <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
          הייצוא יוצר טקסט עם התיק, ההגדרות והמקומות. שלח אותו לעצמך, ובטלפון החדש הדבק אותו כאן. ההיסטוריה של צעדים, שינה ואוכל לא נכללת, היא נשמרת ב Health Connect.
        </Text>
        <Pressable
          style={s.outline}
          onPress={async () => {
            await Share.share({ message: await exportBackup() });
          }}
        >
          <Text style={[T.bold, { textAlign: 'center', fontSize: 15 }]}>ייצוא התיק</Text>
        </Pressable>
        <TextField value={backup} onChange={setBackup} placeholder="להדבקת גיבוי" />
        {backup.trim().length > 0 && (
          <Pressable
            style={s.outline}
            onPress={async () => {
              const err = await importBackup(backup);
              setBackupNote(err ?? 'הגיבוי שוחזר.');
              if (!err) {
                setBackup('');
                onReload();
              }
            }}
          >
            <Text style={[T.bold, { textAlign: 'center', fontSize: 15 }]}>שחזור מהגיבוי</Text>
          </Pressable>
        )}
        {backupNote && <Text style={[T.bold, { fontSize: 13 }]}>{backupNote}</Text>}
      </Card>

      <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>
        Nudge הוא כלי עזר ולא תחליף לרופא, דיאטנית או מאמן מוסמך. האחריות לבריאות שלך היא שלך. במצב רפואי, התייעץ עם רופא לפני שינוי באימונים או בתזונה.
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
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  rowBetween: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.signal },
});
