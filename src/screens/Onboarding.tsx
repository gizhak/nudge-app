import { useEffect, useRef, useState } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { blockText, deficitBlock, DEFICIT_GOALS, minHealthyKg } from '../profile/safety';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DAY_NAMES, defaultWeekend, pad2 } from '../config/goals';
import { commitProfile } from '../profile/bootstrap';
import { importBackup } from '../profile/backup';
import { derive, EditableSession, editableSessions, recommendSplit, SPLITS } from '../profile/derive';
import PickMoves from '../train/PickMoves';
import { gearFor } from '../train/library';
import { Ionicons } from '@expo/vector-icons';
import { Profile, WorkoutSlot } from '../profile/profile';
import { Bar, Card, PrimaryButton, Row, Wordmark } from '../ui/components';
import { Choice, Multi, NumberField, Question, TextField, TimeStepper } from '../ui/inputs';
import { C, fmt, T } from '../ui/theme';

import { CHEVRON_ON, ROW, t as tr } from '../i18n';
/** A new user answers only these; family, routine and the coach's style wait for My File */
const FIRST_RUN_LAST = 3;

export const STEPS = [tr('עליך', 'About you'), tr('המטרה', 'The goal'), tr('בריאות וניסיון', 'Health and experience'), tr('עבודה ולוח זמנים', 'Work and schedule'), tr('משפחה ובית', 'Family and home'), tr('שגרה ואוכל', 'Routine and food'), tr('המאמן', 'The coach')];
const DAY_SHORT = [tr('א', 'S'), tr('ב', 'M'), tr('ג', 'T'), tr('ד', 'W'), tr('ה', 'T'), tr('ו', 'F'), tr('ש', 'S')];

type Field = 'age' | 'height' | 'weight' | 'target';
type Problem = { field: Field; text: string };

function validate(step: number, p: Profile): Problem | null {
  if (step === 0) {
    if (!(p.age >= 16 && p.age <= 90)) return { field: 'age', text: p.age > 0 && p.age < 16 ? tr('האפליקציה מיועדת מגיל 16', 'The app is for ages 16 and up') : tr('גיל בשנים, בין 16 ל90', 'Age in years, between 16 and 90') };
    if (!(p.heightCm >= 130 && p.heightCm <= 230)) return { field: 'height', text: tr('גובה בסנטימטרים, בין 130 ל230', 'Height in centimeters, between 130 and 230') };
    if (!(p.weightKg >= 35 && p.weightKg <= 250)) return { field: 'weight', text: tr('משקל בקילוגרמים, בין 35 ל250', 'Weight in kilograms, between 35 and 250') };
  }
  if (step === 1 && p.targetWeightKg !== undefined) {
    const min = minHealthyKg(p.heightCm);
    if (min !== null && p.targetWeightKg < min) return { field: 'target', text: tr(`היעד הנמוך הבריא לגובה שלך: ${fmt(min, 1)} ק"ג. אפשר גם להשאיר ריק.`, `The lowest healthy target for your height: ${fmt(min, 1)} kg. You can also leave it empty.`) };
    if (p.targetWeightKg > 250) return { field: 'target', text: tr('משקל יעד עד 250 ק"ג, או להשאיר ריק', 'Target weight up to 250 kg, or leave it empty') };
  }
  return null;
}

export default function Onboarding({
  initial,
  onDone,
  onCancel,
  startStep = 0,
  single = false,
}: {
  initial: Profile;
  onDone: () => void;
  onCancel?: () => void;
  /** Open at one section */
  startStep?: number;
  /** Edit only that section and save, from My File */
  single?: boolean;
}) {
  const [p, setP] = useState<Profile>(initial);
  // The session whose moves are being picked
  const [picking, setPicking] = useState<EditableSession | null>(null);
  const [step, setStep] = useState(startStep);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<Problem | null>(null);
  const scroll = useRef<ScrollView>(null);
  const fieldY = useRef<Partial<Record<Field, number>>>({});
  const at = (f: Field) => (y: number) => (fieldY.current[f] = y);
  const errOf = (f: Field) => (bad?.field === f ? bad.text : null);
  /** Marks the field and scrolls up to it, so the reason is in view */
  const showProblem = (pr: Problem) => {
    setBad(pr);
    const y = fieldY.current[pr.field];
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };
  const [saving, setSaving] = useState(false);
  const [backup, setBackup] = useState('');
  // First run: a welcome page, then four short steps instead of seven
  const firstRun = !initial.completed && !single;
  const [welcome, setWelcome] = useState(firstRun && startStep === 0);
  const [restore, setRestore] = useState(false);
  const total = firstRun ? FIRST_RUN_LAST + 1 : STEPS.length;
  const set = (patch: Partial<Profile>) => {
    setP({ ...p, ...patch });
    setError(null);
    setBad(null);
  };

  // Under 18 or under a healthy weight: no deficit goals to choose
  const block = deficitBlock(p);
  useEffect(() => {
    if (block && DEFICIT_GOALS.includes(p.goal)) setP((x) => ({ ...x, goal: 'maintain' }));
  }, [block, p.goal]);

  const next = () => {
    const problem = validate(step, p);
    if (problem) return showProblem(problem);
    setStep(firstRun && step >= FIRST_RUN_LAST ? STEPS.length : step + 1);
  };

  const weekend = p.weekendDays?.length ? p.weekendDays : defaultWeekend();
  const toggleWeekend = (day: number) =>
    set({ weekendDays: weekend.includes(day) ? weekend.filter((d) => d !== day) : [...weekend, day].sort((a, b) => a - b) });

  const toggleDay = (day: number) => {
    const has = p.slots.some((s) => s.day === day);
    const slots: WorkoutSlot[] = has
      ? p.slots.filter((s) => s.day !== day)
      : [...p.slots, { day, time: weekend.includes(day) ? 8 * 60 : 20 * 60 + 30 }].sort((a, b) => a.day - b.day);
    set({ slots });
  };

  const finish = async () => {
    setSaving(true);
    await commitProfile(p);
    onDone();
  };

  const summary = step >= STEPS.length;
  const d = summary ? derive(p) : null;

  if (welcome) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={[s.body, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
          <Wordmark size={40} />
          <Text style={[T.bold, { fontSize: 26, lineHeight: 34 }]}>{tr('מאמן ותזונאי אישי, שלא מרפה.', 'A personal trainer and nutritionist that does not let go.')}</Text>
          <Card>
            {[
              tr('קורא את מה שהשעון והמשקל כבר מודדים, ואת מה שאתה רושם באפליקציית האוכל.', 'Reads what your watch and scale already measure, and what you log in your food app.'),
              tr('אומר לך מה לעשות עכשיו: לאכול, לשתות, להתאמן או ללכת לישון.', 'Tells you what to do now: eat, drink, train or go to sleep.'),
              tr('מסביר למה המשקל זז, ושולח דוח שבועי עם פעולה אחת לשבוע הבא.', 'Explains why your weight moved, and sends a weekly report with one action for the next week.'),
            ].map((t, i) => (
              <Text key={t} style={[T.base, { fontSize: 15, lineHeight: 23 }]}>
                {i + 1}. {t}
              </Text>
            ))}
          </Card>
          <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('הנתונים נשארים בטלפון שלך. אין שרת ואין חשבון.', 'Your data stays on your phone. No server and no account.')}</Text>
          <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('4 שאלות קצרות, בערך שתי דקות. את השאר אפשר להשלים אחר כך.', '4 short questions, about two minutes. The rest can be filled in later.')}</Text>
          {restore ? (
            <Card title={tr("שחזור מגיבוי", 'Restore from backup')}>
              <Text style={[T.muted, { fontSize: 13 }]}>{tr('הדבק כאן את הגיבוי שייצאת מהתיק שלי בטלפון הקודם.', 'Paste here the backup you exported from My file on your old phone.')}</Text>
              <TextField value={backup} onChange={setBackup} placeholder={tr("להדבקת גיבוי", 'Paste the backup')} />
              {backup.trim().length > 0 && (
                <PrimaryButton
                  label={tr("שחזור מהגיבוי", 'Restore from the backup')}
                  onPress={async () => {
                    const err = await importBackup(backup);
                    if (err) setError(err);
                    else onDone();
                  }}
                />
              )}
              {error && <Text style={[T.bold, { color: C.bad, fontSize: 14 }]}>{error}</Text>}
            </Card>
          ) : (
            <Pressable onPress={() => setRestore(true)} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 14, color: C.muted, textDecorationLine: 'underline' }]}>{tr('עברת מטלפון אחר? שחזור מגיבוי', 'Moved from another phone? Restore from backup')}</Text>
            </Pressable>
          )}
        </ScrollView>
        <View style={s.footer}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label={tr("בוא נתחיל", 'Let\'s start')} onPress={() => setWelcome(false)} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}>
        <View style={s.headRow}>
          <Text style={[T.muted, { fontSize: 14 }]}>{summary ? tr('התוכנית שלך', 'Your plan') : single ? tr('עדכון התיק', 'Update your file') : tr(`שלב ${step + 1} מתוך ${total}`, `Step ${step + 1} of ${total}`)}</Text>
          {onCancel && (
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{tr('סגור', 'Close')}</Text>
            </Pressable>
          )}
        </View>
        <Bar value={Math.min(step + 1, total)} max={total} height={6} />
        <Text style={[T.bold, { fontSize: 26, lineHeight: 34 }]}>{summary ? tr('כך המאמן יעבוד איתך', 'How the coach will work with you') : STEPS[step]}</Text>
      </View>

      <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Question title={tr("איך לקרוא לך?", 'What should I call you?')} hint={tr("המאמן פונה אליך בשם, כמו מאמן אמיתי", 'The coach calls you by name, like a real coach')}>
              <TextField value={p.name ?? ''} onChange={(name) => set({ name: name.trim() ? name : undefined })} placeholder={tr("השם שלך", 'Your name')} />
            </Question>
            <Question title={tr("מין", 'Sex')} hint={tr("משפיע על חישוב חילוף החומרים", 'Affects the metabolism calculation')}>
              <Choice options={[{ key: 'male', label: tr('גבר', 'Male') }, { key: 'female', label: tr('אישה', 'Female') }]} value={p.sex} onChange={(sex) => set({ sex })} />
            </Question>
            <NumberField label={tr("גיל", 'Age')} unit={tr("שנים", 'years')} value={p.age} onChange={(n) => set({ age: n ?? 0 })} error={errOf('age')} onLayoutY={at('age')} />
            <NumberField label={tr("גובה", 'Height')} unit={tr('ס"מ', 'cm')} value={p.heightCm} onChange={(n) => set({ heightCm: n ?? 0 })} error={errOf('height')} onLayoutY={at('height')} />
            <NumberField label={tr("משקל", 'Weight')} unit={tr('ק"ג', 'kg')} value={p.weightKg} onChange={(n) => set({ weightKg: n ?? 0 })} error={errOf('weight')} onLayoutY={at('weight')} />
            <NumberField label={tr("היקף מותניים", 'Waist')} unit={tr('ס"מ', 'cm')} value={p.waistCm} onChange={(n) => set({ waistCm: n })} optional />
            <Text style={[T.muted, { fontSize: 13 }]}>{tr('היקף המותניים מראה ירידה בשומן גם כשהמשקל לא זז, כי השריר מתחיל לעלות.', 'Your waist shows fat loss even when the weight does not move, because muscle starts to grow.')}</Text>
            {!initial.completed && !firstRun && (
              <Card title={tr("עברת מטלפון אחר?", 'Moved from another phone?')}>
                <Text style={[T.muted, { fontSize: 13 }]}>{tr('הדבק כאן את הגיבוי שייצאת מהתיק שלי, ותדלג על השאלון.', 'Paste here the backup you exported from My file, and skip the questions.')}</Text>
                <TextField value={backup} onChange={setBackup} placeholder={tr("להדבקת גיבוי", 'Paste the backup')} />
                {backup.trim().length > 0 && (
                  <PrimaryButton
                    label={tr("שחזור מהגיבוי", 'Restore from the backup')}
                    onPress={async () => {
                      const err = await importBackup(backup);
                      if (err) setError(err);
                      else onDone();
                    }}
                  />
                )}
              </Card>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Question title={tr("מה המטרה?", 'What is the goal?')}>
              <Choice
                options={(
                  [
                    { key: 'lose', label: tr('ירידה במשקל', 'Lose weight') },
                    { key: 'recomp', label: tr('ירידה בשומן ובניית שריר', 'Lose fat and build muscle') },
                    { key: 'gain', label: tr('בניית שריר', 'Build muscle') },
                    { key: 'maintain', label: tr('שמירה', 'Maintain') },
                  ] as { key: Profile['goal']; label: string }[]
                ).filter((o) => !block || !DEFICIT_GOALS.includes(o.key))}
                value={p.goal}
                onChange={(goal) => set({ goal })}
              />
              {block && <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{blockText(block)}</Text>}
            </Question>
            {p.goal === 'lose' && (
              <Question title={tr("קצב", 'Pace')} hint={tr("מהיר יותר קשה יותר לשמור, ויש בו סיכון גבוה יותר לאבד שריר", 'Faster is harder to keep, and risks losing more muscle')}>
                <Choice options={[{ key: 'moderate', label: tr('מתון, חצי ק"ג בשבוע', 'Moderate, half a kilo a week') }, { key: 'fast', label: tr('מהיר', 'Fast') }]} value={p.pace} onChange={(pace) => set({ pace })} />
              </Question>
            )}
            <NumberField label={tr("משקל יעד", 'Target weight')} unit={tr('ק"ג', 'kg')} value={p.targetWeightKg} onChange={(n) => set({ targetWeightKg: n })} optional error={errOf('target')} onLayoutY={at('target')} />
            <Question title={tr("למה עכשיו?", 'Why now?')} hint={tr("משפט אחד במילים שלך. המאמן יזכיר לך אותו כשיהיה קשה.", 'One sentence in your own words. The coach will remind you of it when it gets hard.')}>
              <TextField value={p.whyNow} onChange={(whyNow) => set({ whyNow })} placeholder={tr("למשל: רוצה להיות בכושר בשביל הילדים", 'For example: I want to be fit for my kids')} />
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <Question title={tr("ניסיון באימוני כוח", 'Strength training experience')}>
              <Choice
                options={[
                  { key: 'beginner', label: tr('מתחיל', 'Beginner') },
                  { key: 'returning', label: tr('חוזר אחרי הפסקה', 'Coming back after a break') },
                  { key: 'regular', label: tr('מתאמן קבוע', 'Train regularly') },
                ]}
                value={p.experience}
                onChange={(experience) => set({ experience })}
              />
            </Question>
            <Question title={tr("כאבים או פציעות", 'Pain or injuries')} hint={tr("תרגילים שמעמיסים על האזור יוחלפו", 'Moves that load the area will be swapped')}>
              <Multi
                options={[
                  { key: 'knees', label: tr('ברכיים', 'Knees') },
                  { key: 'back', label: tr('גב', 'Back') },
                  { key: 'shoulders', label: tr('כתפיים', 'Shoulders') },
                ]}
                values={p.pains}
                onChange={(pains) => set({ pains })}
              />
            </Question>
            <Question title={tr("רופא הגביל אותך בפעילות גופנית?", 'Has a doctor limited your physical activity?')}>
              <Choice options={[{ key: 'no', label: tr('לא', 'No') }, { key: 'yes', label: tr('כן', 'Yes') }]} value={p.medicalLimit ? 'yes' : 'no'} onChange={(v) => set({ medicalLimit: v === 'yes' })} />
            </Question>
            <Question title={tr("אחד מאלה רלוונטי?", 'Do any of these apply?')} hint={tr("משפיע על עצימות האימונים", 'Affects how hard the workouts are')}>
              <Multi
                options={[
                  { key: 'bp', label: tr('לחץ דם', 'Blood pressure') },
                  { key: 'diabetes', label: tr('סוכרת', 'Diabetes') },
                  { key: 'heart', label: tr('בעיית לב', 'Heart condition') },
                ]}
                values={p.chronic ?? []}
                onChange={(chronic) => set({ chronic })}
              />
            </Question>
            {p.experience !== 'beginner' && (
              <Question title={tr("מה גרם לך להפסיק בפעם הקודמת?", 'What made you stop last time?')} hint={tr("כדי לזהות את זה מוקדם אם זה חוזר", 'To notice it early if it comes back')}>
                <Choice
                  options={[
                    { key: 'work', label: tr('עומס בעבודה', 'Busy at work') },
                    { key: 'family', label: tr('משפחה', 'Family') },
                    { key: 'injury', label: tr('פציעה', 'Injury') },
                    { key: 'motivation', label: tr('חוסר מוטיבציה', 'Lack of motivation') },
                  ]}
                  value={p.stopReason}
                  onChange={(stopReason) => set({ stopReason })}
                />
              </Question>
            )}
            <Card>
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
                {tr('Nudge הוא כלי עזר ולא תחליף לרופא, דיאטנית או מאמן מוסמך. האחריות לבריאות שלך היא שלך. אם יש לך מצב רפואי, התייעץ עם רופא לפני שמתחילים, ועצור מיד אם יש כאב, סחרחורת או קוצר נשימה.', 'Nudge is a helper, not a replacement for a doctor, dietitian or certified trainer. You are responsible for your health. If you have a medical condition, talk to a doctor before you start, and stop at once if you feel pain, dizziness or shortness of breath.')}
              </Text>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <Question title={tr("איפה אתה עובד?", 'Where do you work?')}>
              <Choice
                options={[
                  { key: 'office', label: tr('משרד', 'Office') },
                  { key: 'home', label: tr('מהבית', 'From home') },
                  { key: 'hybrid', label: tr('משולב', 'Hybrid') },
                ]}
                value={p.workMode}
                onChange={(workMode) => set({ workMode })}
              />
            </Question>
            <Question title={tr("כמה העבודה פיזית?", 'How physical is your work?')} hint={tr("משנה את יעד הקלוריות והצעדים", 'Changes the calorie and step targets')}>
              <Choice
                options={[
                  { key: 'desk', label: tr('יושב רוב היום', 'Sitting most of the day') },
                  { key: 'mixed', label: tr('חלק בעמידה', 'Partly standing') },
                  { key: 'physical', label: tr('עבודה פיזית', 'Physical work') },
                ]}
                value={p.workLoad}
                onChange={(workLoad) => set({ workLoad })}
              />
            </Question>
            <Question title={tr("עבודה במשמרות?", 'Shift work?')} hint={tr("משמרות לילה משנות את שעות השקט", 'Night shifts change the quiet hours')}>
              <Choice options={[{ key: 'no', label: tr('לא', 'No') }, { key: 'yes', label: tr('כן', 'Yes') }]} value={p.shiftWork === undefined ? undefined : p.shiftWork ? 'yes' : 'no'} onChange={(v) => set({ shiftWork: v === 'yes' })} />
            </Question>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>{tr('יום העבודה מתחיל', 'The work day starts')}</Text>
              <TimeStepper value={p.workStart} onChange={(workStart) => set({ workStart })} step={30} />
            </View>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>{tr('ונגמר', 'and ends')}</Text>
              <TimeStepper value={p.workEnd} onChange={(workEnd) => set({ workEnd })} step={30} />
            </View>
            <Question title={tr("איך אתה רוצה את סוף השבוע?", 'How do you want the weekend?')}>
              <Choice
                options={[
                  { key: 'same', label: tr('כמו כל יום', 'Like any day') },
                  { key: 'normal', label: tr('רגיל', 'Normal') },
                  { key: 'flex', label: tr('גמיש', 'Flexible') },
                ]}
                value={p.weekendStyle ?? 'normal'}
                onChange={(weekendStyle) => set({ weekendStyle })}
              />
              <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                {(p.weekendStyle ?? 'normal') === 'same'
                  ? tr('אין לסוף השבוע שום יחס מיוחד: אותם יעדים, אותן שעות, אותו מאמן.', 'The weekend gets no special treatment: same targets, same hours, same coach.')
                  : (p.weekendStyle ?? 'normal') === 'normal'
                    ? tr('אותם יעדים. רק השעות זזות: שקילה מאוחרת יותר, ואימון בסוף השבוע מוצע בבוקר.', 'Same targets. Only the hours move: a later weigh-in, and weekend workouts offered in the morning.')
                    : tr('תקציב קלוריות שבועי: מעט פחות בימי חול, ויותר בסוף השבוע, למשל לארוחה בחוץ. סך השבוע נשאר אותו דבר.', 'A weekly calorie budget: a little less on weekdays, and more on the weekend, for example for a meal out. The week\'s total stays the same.')}
              </Text>
            </Question>
            {(p.weekendStyle ?? 'normal') !== 'same' && (
            <Question title={tr("ימי סוף שבוע", 'Weekend days')} hint={tr("ימים בלי עבודה", 'Days without work')}>
              <View style={s.days}>
                {DAY_SHORT.map((l, day) => {
                  const on = weekend.includes(day);
                  return (
                    <Pressable key={day} onPress={() => toggleWeekend(day)} style={[s.day, on && s.dayOn]}>
                      <Text style={[T.bold, { textAlign: 'center', color: on ? '#fff' : C.ink }]}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Question>
            )}
            <Question title={tr("באילו ימים להתאמן?", 'Which days to train?')} hint={tr("בחר ימים, ואז שעה לכל יום", 'Choose days, then a time for each day')}>
              <View style={s.days}>
                {DAY_SHORT.map((l, day) => {
                  const on = p.slots.some((x) => x.day === day);
                  return (
                    <Pressable key={day} onPress={() => toggleDay(day)} style={[s.day, on && s.dayOn]}>
                      <Text style={[T.bold, { textAlign: 'center', color: on ? '#fff' : C.ink }]}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Question>
            {p.slots.map((slot) => (
              <View key={slot.day} style={s.timeRow}>
                <Text style={[T.base, s.label]}>{tr('יום', 'Day')} {DAY_NAMES[slot.day]}</Text>
                <TimeStepper
                  value={slot.time}
                  onChange={(time) => set({ slots: p.slots.map((x) => (x.day === slot.day ? { ...x, time } : x)) })}
                />
              </View>
            ))}
            <Question title={tr("אורך אימון", 'Workout length')}>
              <Choice options={[{ key: 30, label: tr('30 דקות', '30 minutes') }, { key: 45, label: tr('45 דקות', '45 minutes') }, { key: 60, label: tr('60 דקות', '60 minutes') }]} value={p.sessionMinutes} onChange={(sessionMinutes) => set({ sessionMinutes })} />
            </Question>
            <Question title={tr("איפה מתאמנים?", 'Where do you train?')}>
              <Choice
                options={[
                  { key: 'gym', label: tr('חדר כושר', 'Gym') },
                  { key: 'home', label: tr('בבית', 'At home') },
                  { key: 'outdoor', label: tr('בחוץ', 'Outdoors') },
                ]}
                value={p.trainPlace}
                onChange={(trainPlace) => set({ trainPlace })}
              />
            </Question>
            {p.trainPlace === 'gym' && p.slots.length > 0 && (() => {
              const rec = recommendSplit(p);
              const chosen = p.split ?? rec.split;
              const options = SPLITS.filter((x) => p.slots.length >= x.minDays).map((x) => ({
                key: x.key,
                label: x.key === rec.split ? tr(`${x.label} (מומלץ)`, `${x.label} (recommended)`) : x.label,
              }));
              return (
                <Question title={tr("איך לחלק את האימונים?", 'How to split the workouts?')} hint={SPLITS.find((x) => x.key === chosen)?.hint}>
                  <Choice options={options} value={chosen} onChange={(split) => set({ split })} />
                  <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                    {chosen === rec.split ? rec.why : tr(`ההמלצה שלי: ${SPLITS.find((x) => x.key === rec.split)?.label}. ${rec.why} ההחלטה שלך, והתוכנית תיבנה לפי מה שבחרת.`, `My recommendation: ${SPLITS.find((x) => x.key === rec.split)?.label}. ${rec.why} The choice is yours, and the plan is built from what you choose.`)}
                  </Text>
                </Question>
              );
            })()}
            {p.slots.length > 0 && (
              <Question title={tr("התרגילים בכל אימון", 'The moves in each workout')} hint={tr("לפי ההמלצה, או מה שתבחר. נשמר לכל חלוקה בנפרד.", 'As recommended, or what you choose. Kept for each split separately.')}>
                <View style={s.movesCard}>
                  {editableSessions(p).map((x, i) => (
                    <Pressable key={x.key} onPress={() => setPicking(x)} style={({ pressed }) => [s.movesRow, i > 0 && s.movesSep, pressed && { opacity: 0.6 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[T.bold, { fontSize: 16 }]}>{x.title}</Text>
                        <Text style={[T.muted, { fontSize: 13, color: x.picked ? C.signal : C.muted }]}>
                          {x.picked ? tr(`${x.picked.length} תרגילים · הבחירה שלך`, `${x.picked.length} moves · your choice`) : tr(`${x.recommended.length} תרגילים · לפי ההמלצה`, `${x.recommended.length} moves · as recommended`)}
                        </Text>
                      </View>
                      <Ionicons name={CHEVRON_ON} size={18} color={C.muted} />
                    </Pressable>
                  ))}
                </View>
              </Question>
            )}
            <Question title={tr("להוסיף בסוף כל אימון?", 'Add at the end of each workout?')}>
              <Multi
                options={[
                  { key: 'rope', label: tr('קפיצות חבל', 'Jump rope') },
                  { key: 'abs', label: tr('בטן', 'Abs') },
                ]}
                values={[...(p.rope ? ['rope' as const] : []), ...(p.abs ? ['abs' as const] : [])]}
                onChange={(v) => set({ rope: v.includes('rope'), abs: v.includes('abs') })}
              />
            </Question>
            {p.trainPlace !== 'gym' && (
              <Question title={tr("יש משקולות או גומיות בבית?", 'Weights or bands at home?')}>
                <Choice options={[{ key: 'no', label: tr('לא', 'No') }, { key: 'yes', label: tr('כן', 'Yes') }]} value={p.homeEquipment ? 'yes' : 'no'} onChange={(v) => set({ homeEquipment: v === 'yes' })} />
              </Question>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Question title={tr("מצב משפחתי", 'Relationship status')}>
              <Choice
                options={[
                  { key: 'single', label: tr('רווק', 'Single') },
                  { key: 'partner', label: tr('בזוגיות', 'In a relationship') },
                  { key: 'separated', label: tr('גרוש או פרוד', 'Divorced or separated') },
                ]}
                value={p.relationship}
                onChange={(relationship) => set({ relationship })}
              />
            </Question>
            <Question title={tr("מי בבית?", 'Who is at home?')} hint={tr("כדי שהמאמן יבין לילות קטועים ולא יאשים אותך", 'So the coach understands broken nights and does not blame you')}>
              <Choice
                options={[
                  { key: 'none', label: tr('אין ילדים', 'No kids') },
                  { key: 'baby', label: tr('תינוק עד גיל שנה', 'A baby under one') },
                  { key: 'young', label: tr('ילדים קטנים', 'Young kids') },
                  { key: 'older', label: tr('ילדים גדולים', 'Older kids') },
                ]}
                value={p.kids}
                onChange={(kids) => set({ kids, nightWakeups: kids === 'baby' || kids === 'young' ? true : p.nightWakeups })}
              />
            </Question>
            {p.relationship === 'separated' && p.kids !== 'none' && (
              <Question title={tr("באילו ימים הילדים אצלך?", 'Which days are the kids with you?')} hint={tr("בימים האלה המאמן יתכנן סביבם", 'On these days the coach plans around them')}>
                <View style={s.days}>
                  {DAY_SHORT.map((d, i) => {
                    const on = (p.kidsDays ?? []).includes(i);
                    return (
                      <Pressable
                        key={i}
                        onPress={() => set({ kidsDays: on ? (p.kidsDays ?? []).filter((x) => x !== i) : [...(p.kidsDays ?? []), i].sort() })}
                        style={[s.day, on && s.dayOn]}
                      >
                        <Text style={[T.bold, { textAlign: 'center', color: on ? '#fff' : C.ink }]}>{d}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Question>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>{tr('שעת השכמה', 'Wake up time')}</Text>
              <TimeStepper value={p.wakeTime} onChange={(wakeTime) => set({ wakeTime })} />
            </View>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>{tr('שעת שינה', 'Bedtime')}</Text>
              <TimeStepper value={p.bedTime} onChange={(bedTime) => set({ bedTime })} />
            </View>
            <Question title={tr("יש התעוררויות בלילה?", 'Do you wake up at night?')} hint={p.kids === 'baby' || p.kids === 'young' ? tr('בגלל הילדים, או גם בלעדיהם', 'Because of the kids, or also without them') : tr('שירותים, חוסר שקט, כל סיבה', 'Bathroom, restlessness, any reason')}>
              <Choice options={[{ key: 'no', label: tr('לא', 'No') }, { key: 'yes', label: tr('כן', 'Yes') }]} value={p.nightWakeups ? 'yes' : 'no'} onChange={(v) => set({ nightWakeups: v === 'yes' })} />
            </Question>
            <Question title={tr("נוהג לישון בצהריים?", 'Do you nap at noon?')}>
              <Choice options={[{ key: 'no', label: tr('לא', 'No') }, { key: 'yes', label: tr('כן', 'Yes') }]} value={p.naps ? 'yes' : 'no'} onChange={(v) => set({ naps: v === 'yes' })} />
            </Question>
            <Question title={tr("כמה ארוחות ביום?", 'How many meals a day?')}>
              <Choice options={[{ key: 3, label: '3' }, { key: 4, label: '4' }, { key: 5, label: '5' }]} value={p.mealsPerDay} onChange={(mealsPerDay) => set({ mealsPerDay })} />
            </Question>
            <Question title={tr("הגבלות תזונה", 'Diet restrictions')}>
              <Multi
                options={[
                  { key: 'vegetarian', label: tr('צמחוני', 'Vegetarian') },
                  { key: 'kosher', label: tr('כשר', 'Kosher') },
                  { key: 'no_dairy', label: tr('בלי מוצרי חלב', 'No dairy') },
                ]}
                values={p.diet}
                onChange={(diet) => set({ diet })}
              />
            </Question>
            <Question title={tr("מתי הכי קשה לך לשמור על האוכל?", 'When is it hardest to stick to the food?')} hint={tr("המאמן יקדים אותך בשעות האלה", 'The coach will get ahead of you at those hours')}>
              <Multi
                options={[
                  { key: 'evening', label: tr('בערב', 'In the evening') },
                  { key: 'stress', label: tr('בלחץ', 'Under stress') },
                  { key: 'boredom', label: tr('משעמום', 'When bored') },
                  { key: 'weekend', label: tr('בסוף השבוע', 'On the weekend') },
                ]}
                values={p.hardTimes ?? []}
                onChange={(hardTimes) => set({ hardTimes })}
              />
            </Question>
          </>
        )}

        {step === 6 && (
          <>
            <Question title={tr("כמה נודניק?", 'How much nagging?')} hint={tr("אפשר לשנות בכל רגע בלשונית המאמן", 'You can change it any time in the Coach tab')}>
              <Choice
                options={[
                  { key: 'quiet', label: tr('שקט', 'Quiet') },
                  { key: 'normal', label: tr('רגיל', 'Normal') },
                  { key: 'close', label: tr('צמוד', 'Close') },
                  { key: 'drill', label: tr('דומיננטי', 'Dominant') },
                ]}
                value={p.level}
                onChange={(level) => set({ level })}
              />
            </Question>
            <Question title={tr("איך שהמאמן ידבר?", 'How should the coach talk?')}>
              <Choice
                options={[
                  { key: 'direct', label: tr('ישיר ועניני', 'Direct and to the point') },
                  { key: 'encouraging', label: tr('מעודד', 'Encouraging') },
                ]}
                value={p.tone}
                onChange={(tone) => set({ tone })}
              />
            </Question>
            <Card>
              <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
                {p.tone === 'direct'
                  ? tr('דוגמה: "חסרים 60 גרם חלבון. כדאי שארוחת הערב תהיה עשירה בחלבון."', 'Example: "60 grams of protein missing. Make dinner rich in protein."')
                  : tr('דוגמה: "אתה קרוב. חסרים 60 גרם חלבון, ארוחת ערב עשירה בחלבון תסגור את זה."', 'Example: "You are close. 60 grams of protein missing, a protein rich dinner will close it."')}
              </Text>
            </Card>
            <Text style={[T.muted, { fontSize: 13 }]}>{tr('את הבית, המשרד וחדר הכושר מגדירים בלשונית המאמן אחרי הסיום.', 'Home, office and gym are set in the Coach tab after you finish.')}</Text>
          </>
        )}

        {summary && d && (
          <>
            <Card title={tr("יעדים יומיים", 'Daily targets')}>
              <Row label={tr("קלוריות", 'Calories')} value={fmt(d.goals.calories)} />
              <Row label={tr("חלבון", 'Protein')} value={tr(`${d.goals.proteinG} ג'`, `${d.goals.proteinG} g`)} />
              <Row label={tr("צעדים", 'Steps')} value={fmt(d.goals.steps)} />
              <Row label={tr("שינה", 'Sleep')} value={tr(`${d.goals.sleepHours} שעות`, `${d.goals.sleepHours} hours`)} />
              <Text style={[T.muted, { fontSize: 13 }]}>
                {tr('תחזוקה משוערת:', 'Estimated maintenance:')} {fmt(d.maintenance)} {tr('קלוריות.', 'calories.')}
                {d.weeklyRateKg > 0 && p.goal !== 'gain' ? tr(` קצב צפוי: ${d.weeklyRateKg} ק"ג בשבוע.`, ` Expected pace: ${d.weeklyRateKg} kg a week.`) : ''}
                {d.weeksToTarget ? tr(` משקל היעד בעוד כ${d.weeksToTarget} שבועות.`, ` Target weight in about ${d.weeksToTarget} weeks.`) : ''}
              </Text>
            </Card>
            <Card title={tr(`אימונים בשבוע: ${d.plan.length}`, `Workouts a week: ${d.plan.length}`)}>
              {d.plan.length === 0 && <Text style={[T.muted, { fontSize: 14 }]}>{tr('לא נבחרו ימים', 'No days chosen')}</Text>}
              {d.plan.map((w) => (
                <Row
                  key={w.day}
                  label={`${DAY_NAMES[w.day]} ${pad2(w.hour)}:${pad2(w.minute)}`}
                  value={tr(`${d.sessions[w.session].title}, ${d.sessions[w.session].minutes} דק'`, `${d.sessions[w.session].title}, ${d.sessions[w.session].minutes} min`)}
                />
              ))}
            </Card>
            {d.notes.length > 0 && (
              <Card title={tr("חשוב לדעת", 'Good to know')}>
                {d.notes.map((n) => (
                  <Text key={n} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
                    {n}
                  </Text>
                ))}
              </Card>
            )}
            {firstRun ? (
              <Card title={tr("כדי שהמאמן יכיר אותך יותר", 'So the coach knows you better')}>
                <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{tr('משפחה ובית, שגרת שינה ואוכל, וכמה נודניק המאמן יהיה: אפשר להשלים בכל רגע בלשונית המאמן, תחת "התיק שלי". עד אז המאמן עובד עם ברירות מחדל סבירות.', 'Family and home, sleep and food routine, and how much the coach nags: you can fill these in any time in the Coach tab, under My file. Until then the coach works with sensible defaults.')}</Text>
              </Card>
            ) : (
              <Text style={[T.muted, { fontSize: 13 }]}>{tr('אפשר לחזור ולשנות תשובות בכל רגע ממסך המאמן.', 'You can come back and change answers any time from the Coach screen.')}</Text>
            )}
          </>
        )}
        {error && <Text style={[T.bold, { color: C.bad, fontSize: 14 }]}>{error}</Text>}
      </ScrollView>
      {/* Cards slide softly under the title instead of being cut by a hard line */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 22 }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="headFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.bg} stopOpacity="1" />
              <Stop offset="1" stopColor={C.bg} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#headFade)" />
        </Svg>
      </View>
      </View>

      <View style={s.footer}>
        {saving ? (
          <ActivityIndicator color={C.accent} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {single ? (
                <PrimaryButton
                  label={tr("שמור", 'Save')}
                  onPress={() => {
                    const problem = validate(step, p);
                    if (problem) return showProblem(problem);
                    finish();
                  }}
                />
              ) : (
                <PrimaryButton label={summary ? tr('יאללה, מתחילים', 'Let\'s go') : step === (firstRun ? FIRST_RUN_LAST : STEPS.length - 1) ? tr('הצג את התוכנית', 'Show the plan') : tr('הבא', 'Next')} onPress={summary ? finish : next} />
              )}
            </View>
            {!single && (step > 0 || firstRun) && (
              <Pressable onPress={() => (step === 0 ? setWelcome(true) : setStep(firstRun && summary ? FIRST_RUN_LAST : step - 1))} style={s.back}>
                <Text style={[T.bold, { fontSize: 16, color: C.accent }]}>{tr('חזרה', 'Back')}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
      <PickMoves
        session={picking}
        gear={gearFor(p.trainPlace, p.homeEquipment)}
        onClose={() => setPicking(null)}
        onSave={(picks) => {
          const next = { ...(p.picks ?? {}) };
          if (picks) next[picking!.key] = picks;
          else delete next[picking!.key];
          set({ picks: next });
          setPicking(null);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  movesCard: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14 },
  movesRow: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 13 },
  movesSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  header: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  headRow: { flexDirection: ROW, justifyContent: 'space-between' },
  body: { padding: 16, gap: 18, paddingBottom: 32 },
  label: { fontSize: 16 },
  timeRow: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center' },
  days: { flexDirection: ROW, justifyContent: 'space-between' },
  day: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.track, backgroundColor: C.card, justifyContent: 'center' },
  dayOn: { backgroundColor: C.accent, borderColor: C.accent },
  footer: {
    flexDirection: ROW,
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.track,
    backgroundColor: C.card,
    alignItems: 'center',
  },
  back: { paddingVertical: 12, paddingHorizontal: 16 },
});
