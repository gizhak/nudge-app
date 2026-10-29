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

import { CHEVRON_ON, ROW } from '../i18n';
/** A new user answers only these; family, routine and the coach's style wait for My File */
const FIRST_RUN_LAST = 3;

export const STEPS = ['עליך', 'המטרה', 'בריאות וניסיון', 'עבודה ולוח זמנים', 'משפחה ובית', 'שגרה ואוכל', 'המאמן'];
const DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

type Field = 'age' | 'height' | 'weight' | 'target';
type Problem = { field: Field; text: string };

function validate(step: number, p: Profile): Problem | null {
  if (step === 0) {
    if (!(p.age >= 16 && p.age <= 90)) return { field: 'age', text: p.age > 0 && p.age < 16 ? 'האפליקציה מיועדת מגיל 16' : 'גיל בשנים, בין 16 ל90' };
    if (!(p.heightCm >= 130 && p.heightCm <= 230)) return { field: 'height', text: 'גובה בסנטימטרים, בין 130 ל230' };
    if (!(p.weightKg >= 35 && p.weightKg <= 250)) return { field: 'weight', text: 'משקל בקילוגרמים, בין 35 ל250' };
  }
  if (step === 1 && p.targetWeightKg !== undefined) {
    const min = minHealthyKg(p.heightCm);
    if (min !== null && p.targetWeightKg < min) return { field: 'target', text: `היעד הנמוך הבריא לגובה שלך: ${fmt(min, 1)} ק"ג. אפשר גם להשאיר ריק.` };
    if (p.targetWeightKg > 250) return { field: 'target', text: 'משקל יעד עד 250 ק"ג, או להשאיר ריק' };
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
          <Text style={[T.bold, { fontSize: 26, lineHeight: 34 }]}>מאמן ותזונאי אישי, שלא מרפה.</Text>
          <Card>
            {[
              'קורא את מה שהשעון והמשקל כבר מודדים, ואת מה שאתה רושם באפליקציית האוכל.',
              'אומר לך מה לעשות עכשיו: לאכול, לשתות, להתאמן או ללכת לישון.',
              'מסביר למה המשקל זז, ושולח דוח שבועי עם פעולה אחת לשבוע הבא.',
            ].map((t, i) => (
              <Text key={t} style={[T.base, { fontSize: 15, lineHeight: 23 }]}>
                {i + 1}. {t}
              </Text>
            ))}
          </Card>
          <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>הנתונים נשארים בטלפון שלך. אין שרת ואין חשבון.</Text>
          <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>4 שאלות קצרות, בערך שתי דקות. את השאר אפשר להשלים אחר כך.</Text>
          {restore ? (
            <Card title="שחזור מגיבוי">
              <Text style={[T.muted, { fontSize: 13 }]}>הדבק כאן את הגיבוי שייצאת מהתיק שלי בטלפון הקודם.</Text>
              <TextField value={backup} onChange={setBackup} placeholder="להדבקת גיבוי" />
              {backup.trim().length > 0 && (
                <PrimaryButton
                  label="שחזור מהגיבוי"
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
              <Text style={[T.bold, { fontSize: 14, color: C.muted, textDecorationLine: 'underline' }]}>עברת מטלפון אחר? שחזור מגיבוי</Text>
            </Pressable>
          )}
        </ScrollView>
        <View style={s.footer}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="בוא נתחיל" onPress={() => setWelcome(false)} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}>
        <View style={s.headRow}>
          <Text style={[T.muted, { fontSize: 14 }]}>{summary ? 'התוכנית שלך' : single ? 'עדכון התיק' : `שלב ${step + 1} מתוך ${total}`}</Text>
          {onCancel && (
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>סגור</Text>
            </Pressable>
          )}
        </View>
        <Bar value={Math.min(step + 1, total)} max={total} height={6} />
        <Text style={[T.bold, { fontSize: 26, lineHeight: 34 }]}>{summary ? 'כך המאמן יעבוד איתך' : STEPS[step]}</Text>
      </View>

      <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Question title="איך לקרוא לך?" hint="המאמן פונה אליך בשם, כמו מאמן אמיתי">
              <TextField value={p.name ?? ''} onChange={(name) => set({ name: name.trim() ? name : undefined })} placeholder="השם שלך" />
            </Question>
            <Question title="מין" hint="משפיע על חישוב חילוף החומרים">
              <Choice options={[{ key: 'male', label: 'גבר' }, { key: 'female', label: 'אישה' }]} value={p.sex} onChange={(sex) => set({ sex })} />
            </Question>
            <NumberField label="גיל" unit="שנים" value={p.age} onChange={(n) => set({ age: n ?? 0 })} error={errOf('age')} onLayoutY={at('age')} />
            <NumberField label="גובה" unit='ס"מ' value={p.heightCm} onChange={(n) => set({ heightCm: n ?? 0 })} error={errOf('height')} onLayoutY={at('height')} />
            <NumberField label="משקל" unit='ק"ג' value={p.weightKg} onChange={(n) => set({ weightKg: n ?? 0 })} error={errOf('weight')} onLayoutY={at('weight')} />
            <NumberField label="היקף מותניים" unit='ס"מ' value={p.waistCm} onChange={(n) => set({ waistCm: n })} optional />
            <Text style={[T.muted, { fontSize: 13 }]}>היקף המותניים מראה ירידה בשומן גם כשהמשקל לא זז, כי השריר מתחיל לעלות.</Text>
            {!initial.completed && !firstRun && (
              <Card title="עברת מטלפון אחר?">
                <Text style={[T.muted, { fontSize: 13 }]}>הדבק כאן את הגיבוי שייצאת מהתיק שלי, ותדלג על השאלון.</Text>
                <TextField value={backup} onChange={setBackup} placeholder="להדבקת גיבוי" />
                {backup.trim().length > 0 && (
                  <PrimaryButton
                    label="שחזור מהגיבוי"
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
            <Question title="מה המטרה?">
              <Choice
                options={(
                  [
                    { key: 'lose', label: 'ירידה במשקל' },
                    { key: 'recomp', label: 'ירידה בשומן ובניית שריר' },
                    { key: 'gain', label: 'בניית שריר' },
                    { key: 'maintain', label: 'שמירה' },
                  ] as { key: Profile['goal']; label: string }[]
                ).filter((o) => !block || !DEFICIT_GOALS.includes(o.key))}
                value={p.goal}
                onChange={(goal) => set({ goal })}
              />
              {block && <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{blockText(block)}</Text>}
            </Question>
            {p.goal === 'lose' && (
              <Question title="קצב" hint="מהיר יותר קשה יותר לשמור, ויש בו סיכון גבוה יותר לאבד שריר">
                <Choice options={[{ key: 'moderate', label: 'מתון, חצי ק"ג בשבוע' }, { key: 'fast', label: 'מהיר' }]} value={p.pace} onChange={(pace) => set({ pace })} />
              </Question>
            )}
            <NumberField label="משקל יעד" unit='ק"ג' value={p.targetWeightKg} onChange={(n) => set({ targetWeightKg: n })} optional error={errOf('target')} onLayoutY={at('target')} />
            <Question title="למה עכשיו?" hint="משפט אחד במילים שלך. המאמן יזכיר לך אותו כשיהיה קשה.">
              <TextField value={p.whyNow} onChange={(whyNow) => set({ whyNow })} placeholder="למשל: רוצה להיות בכושר בשביל הילדים" />
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <Question title="ניסיון באימוני כוח">
              <Choice
                options={[
                  { key: 'beginner', label: 'מתחיל' },
                  { key: 'returning', label: 'חוזר אחרי הפסקה' },
                  { key: 'regular', label: 'מתאמן קבוע' },
                ]}
                value={p.experience}
                onChange={(experience) => set({ experience })}
              />
            </Question>
            <Question title="כאבים או פציעות" hint="תרגילים שמעמיסים על האזור יוחלפו">
              <Multi
                options={[
                  { key: 'knees', label: 'ברכיים' },
                  { key: 'back', label: 'גב' },
                  { key: 'shoulders', label: 'כתפיים' },
                ]}
                values={p.pains}
                onChange={(pains) => set({ pains })}
              />
            </Question>
            <Question title="רופא הגביל אותך בפעילות גופנית?">
              <Choice options={[{ key: 'no', label: 'לא' }, { key: 'yes', label: 'כן' }]} value={p.medicalLimit ? 'yes' : 'no'} onChange={(v) => set({ medicalLimit: v === 'yes' })} />
            </Question>
            <Question title="אחד מאלה רלוונטי?" hint="משפיע על עצימות האימונים">
              <Multi
                options={[
                  { key: 'bp', label: 'לחץ דם' },
                  { key: 'diabetes', label: 'סוכרת' },
                  { key: 'heart', label: 'בעיית לב' },
                ]}
                values={p.chronic ?? []}
                onChange={(chronic) => set({ chronic })}
              />
            </Question>
            {p.experience !== 'beginner' && (
              <Question title="מה גרם לך להפסיק בפעם הקודמת?" hint="כדי לזהות את זה מוקדם אם זה חוזר">
                <Choice
                  options={[
                    { key: 'work', label: 'עומס בעבודה' },
                    { key: 'family', label: 'משפחה' },
                    { key: 'injury', label: 'פציעה' },
                    { key: 'motivation', label: 'חוסר מוטיבציה' },
                  ]}
                  value={p.stopReason}
                  onChange={(stopReason) => set({ stopReason })}
                />
              </Question>
            )}
            <Card>
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
                Nudge הוא כלי עזר ולא תחליף לרופא, דיאטנית או מאמן מוסמך. האחריות לבריאות שלך היא שלך. אם יש לך מצב רפואי, התייעץ עם רופא לפני שמתחילים, ועצור מיד אם יש כאב, סחרחורת או קוצר נשימה.
              </Text>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <Question title="איפה אתה עובד?">
              <Choice
                options={[
                  { key: 'office', label: 'משרד' },
                  { key: 'home', label: 'מהבית' },
                  { key: 'hybrid', label: 'משולב' },
                ]}
                value={p.workMode}
                onChange={(workMode) => set({ workMode })}
              />
            </Question>
            <Question title="כמה העבודה פיזית?" hint="משנה את יעד הקלוריות והצעדים">
              <Choice
                options={[
                  { key: 'desk', label: 'יושב רוב היום' },
                  { key: 'mixed', label: 'חלק בעמידה' },
                  { key: 'physical', label: 'עבודה פיזית' },
                ]}
                value={p.workLoad}
                onChange={(workLoad) => set({ workLoad })}
              />
            </Question>
            <Question title="עבודה במשמרות?" hint="משמרות לילה משנות את שעות השקט">
              <Choice options={[{ key: 'no', label: 'לא' }, { key: 'yes', label: 'כן' }]} value={p.shiftWork === undefined ? undefined : p.shiftWork ? 'yes' : 'no'} onChange={(v) => set({ shiftWork: v === 'yes' })} />
            </Question>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>יום העבודה מתחיל</Text>
              <TimeStepper value={p.workStart} onChange={(workStart) => set({ workStart })} step={30} />
            </View>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>ונגמר</Text>
              <TimeStepper value={p.workEnd} onChange={(workEnd) => set({ workEnd })} step={30} />
            </View>
            <Question title="איך אתה רוצה את סוף השבוע?">
              <Choice
                options={[
                  { key: 'same', label: 'כמו כל יום' },
                  { key: 'normal', label: 'רגיל' },
                  { key: 'flex', label: 'גמיש' },
                ]}
                value={p.weekendStyle ?? 'normal'}
                onChange={(weekendStyle) => set({ weekendStyle })}
              />
              <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                {(p.weekendStyle ?? 'normal') === 'same'
                  ? 'אין לסוף השבוע שום יחס מיוחד: אותם יעדים, אותן שעות, אותו מאמן.'
                  : (p.weekendStyle ?? 'normal') === 'normal'
                    ? 'אותם יעדים. רק השעות זזות: שקילה מאוחרת יותר, ואימון בסוף השבוע מוצע בבוקר.'
                    : 'תקציב קלוריות שבועי: מעט פחות בימי חול, ויותר בסוף השבוע, למשל לארוחה בחוץ. סך השבוע נשאר אותו דבר.'}
              </Text>
            </Question>
            {(p.weekendStyle ?? 'normal') !== 'same' && (
            <Question title="ימי סוף שבוע" hint="ימים בלי עבודה">
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
            <Question title="באילו ימים להתאמן?" hint="בחר ימים, ואז שעה לכל יום">
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
                <Text style={[T.base, s.label]}>יום {DAY_NAMES[slot.day]}</Text>
                <TimeStepper
                  value={slot.time}
                  onChange={(time) => set({ slots: p.slots.map((x) => (x.day === slot.day ? { ...x, time } : x)) })}
                />
              </View>
            ))}
            <Question title="אורך אימון">
              <Choice options={[{ key: 30, label: '30 דקות' }, { key: 45, label: '45 דקות' }, { key: 60, label: '60 דקות' }]} value={p.sessionMinutes} onChange={(sessionMinutes) => set({ sessionMinutes })} />
            </Question>
            <Question title="איפה מתאמנים?">
              <Choice
                options={[
                  { key: 'gym', label: 'חדר כושר' },
                  { key: 'home', label: 'בבית' },
                  { key: 'outdoor', label: 'בחוץ' },
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
                label: x.key === rec.split ? `${x.label} (מומלץ)` : x.label,
              }));
              return (
                <Question title="איך לחלק את האימונים?" hint={SPLITS.find((x) => x.key === chosen)?.hint}>
                  <Choice options={options} value={chosen} onChange={(split) => set({ split })} />
                  <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                    {chosen === rec.split ? rec.why : `ההמלצה שלי: ${SPLITS.find((x) => x.key === rec.split)?.label}. ${rec.why} ההחלטה שלך, והתוכנית תיבנה לפי מה שבחרת.`}
                  </Text>
                </Question>
              );
            })()}
            {p.slots.length > 0 && (
              <Question title="התרגילים בכל אימון" hint="לפי ההמלצה, או מה שתבחר. נשמר לכל חלוקה בנפרד.">
                <View style={s.movesCard}>
                  {editableSessions(p).map((x, i) => (
                    <Pressable key={x.key} onPress={() => setPicking(x)} style={({ pressed }) => [s.movesRow, i > 0 && s.movesSep, pressed && { opacity: 0.6 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[T.bold, { fontSize: 16 }]}>{x.title}</Text>
                        <Text style={[T.muted, { fontSize: 13, color: x.picked ? C.signal : C.muted }]}>
                          {x.picked ? `${x.picked.length} תרגילים · הבחירה שלך` : `${x.recommended.length} תרגילים · לפי ההמלצה`}
                        </Text>
                      </View>
                      <Ionicons name={CHEVRON_ON} size={18} color={C.muted} />
                    </Pressable>
                  ))}
                </View>
              </Question>
            )}
            <Question title="להוסיף בסוף כל אימון?">
              <Multi
                options={[
                  { key: 'rope', label: 'קפיצות חבל' },
                  { key: 'abs', label: 'בטן' },
                ]}
                values={[...(p.rope ? ['rope' as const] : []), ...(p.abs ? ['abs' as const] : [])]}
                onChange={(v) => set({ rope: v.includes('rope'), abs: v.includes('abs') })}
              />
            </Question>
            {p.trainPlace !== 'gym' && (
              <Question title="יש משקולות או גומיות בבית?">
                <Choice options={[{ key: 'no', label: 'לא' }, { key: 'yes', label: 'כן' }]} value={p.homeEquipment ? 'yes' : 'no'} onChange={(v) => set({ homeEquipment: v === 'yes' })} />
              </Question>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Question title="מצב משפחתי">
              <Choice
                options={[
                  { key: 'single', label: 'רווק' },
                  { key: 'partner', label: 'בזוגיות' },
                  { key: 'separated', label: 'גרוש או פרוד' },
                ]}
                value={p.relationship}
                onChange={(relationship) => set({ relationship })}
              />
            </Question>
            <Question title="מי בבית?" hint="כדי שהמאמן יבין לילות קטועים ולא יאשים אותך">
              <Choice
                options={[
                  { key: 'none', label: 'אין ילדים' },
                  { key: 'baby', label: 'תינוק עד גיל שנה' },
                  { key: 'young', label: 'ילדים קטנים' },
                  { key: 'older', label: 'ילדים גדולים' },
                ]}
                value={p.kids}
                onChange={(kids) => set({ kids, nightWakeups: kids === 'baby' || kids === 'young' ? true : p.nightWakeups })}
              />
            </Question>
            {p.relationship === 'separated' && p.kids !== 'none' && (
              <Question title="באילו ימים הילדים אצלך?" hint="בימים האלה המאמן יתכנן סביבם">
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
              <Text style={[T.bold, s.label]}>שעת השכמה</Text>
              <TimeStepper value={p.wakeTime} onChange={(wakeTime) => set({ wakeTime })} />
            </View>
            <View style={s.timeRow}>
              <Text style={[T.bold, s.label]}>שעת שינה</Text>
              <TimeStepper value={p.bedTime} onChange={(bedTime) => set({ bedTime })} />
            </View>
            <Question title="יש התעוררויות בלילה?" hint={p.kids === 'baby' || p.kids === 'young' ? 'בגלל הילדים, או גם בלעדיהם' : 'שירותים, חוסר שקט, כל סיבה'}>
              <Choice options={[{ key: 'no', label: 'לא' }, { key: 'yes', label: 'כן' }]} value={p.nightWakeups ? 'yes' : 'no'} onChange={(v) => set({ nightWakeups: v === 'yes' })} />
            </Question>
            <Question title="נוהג לישון בצהריים?">
              <Choice options={[{ key: 'no', label: 'לא' }, { key: 'yes', label: 'כן' }]} value={p.naps ? 'yes' : 'no'} onChange={(v) => set({ naps: v === 'yes' })} />
            </Question>
            <Question title="כמה ארוחות ביום?">
              <Choice options={[{ key: 3, label: '3' }, { key: 4, label: '4' }, { key: 5, label: '5' }]} value={p.mealsPerDay} onChange={(mealsPerDay) => set({ mealsPerDay })} />
            </Question>
            <Question title="הגבלות תזונה">
              <Multi
                options={[
                  { key: 'vegetarian', label: 'צמחוני' },
                  { key: 'kosher', label: 'כשר' },
                  { key: 'no_dairy', label: 'בלי מוצרי חלב' },
                ]}
                values={p.diet}
                onChange={(diet) => set({ diet })}
              />
            </Question>
            <Question title="מתי הכי קשה לך לשמור על האוכל?" hint="המאמן יקדים אותך בשעות האלה">
              <Multi
                options={[
                  { key: 'evening', label: 'בערב' },
                  { key: 'stress', label: 'בלחץ' },
                  { key: 'boredom', label: 'משעמום' },
                  { key: 'weekend', label: 'בסוף השבוע' },
                ]}
                values={p.hardTimes ?? []}
                onChange={(hardTimes) => set({ hardTimes })}
              />
            </Question>
          </>
        )}

        {step === 6 && (
          <>
            <Question title="כמה נודניק?" hint="אפשר לשנות בכל רגע בלשונית המאמן">
              <Choice
                options={[
                  { key: 'quiet', label: 'שקט' },
                  { key: 'normal', label: 'רגיל' },
                  { key: 'close', label: 'צמוד' },
                  { key: 'drill', label: 'דומיננטי' },
                ]}
                value={p.level}
                onChange={(level) => set({ level })}
              />
            </Question>
            <Question title="איך שהמאמן ידבר?">
              <Choice
                options={[
                  { key: 'direct', label: 'ישיר ועניני' },
                  { key: 'encouraging', label: 'מעודד' },
                ]}
                value={p.tone}
                onChange={(tone) => set({ tone })}
              />
            </Question>
            <Card>
              <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
                {p.tone === 'direct'
                  ? 'דוגמה: "חסרים 60 גרם חלבון. כדאי שארוחת הערב תהיה עשירה בחלבון."'
                  : 'דוגמה: "אתה קרוב. חסרים 60 גרם חלבון, ארוחת ערב עשירה בחלבון תסגור את זה."'}
              </Text>
            </Card>
            <Text style={[T.muted, { fontSize: 13 }]}>את הבית, המשרד וחדר הכושר מגדירים בלשונית המאמן אחרי הסיום.</Text>
          </>
        )}

        {summary && d && (
          <>
            <Card title="יעדים יומיים">
              <Row label="קלוריות" value={fmt(d.goals.calories)} />
              <Row label="חלבון" value={`${d.goals.proteinG} ג'`} />
              <Row label="צעדים" value={fmt(d.goals.steps)} />
              <Row label="שינה" value={`${d.goals.sleepHours} שעות`} />
              <Text style={[T.muted, { fontSize: 13 }]}>
                תחזוקה משוערת: {fmt(d.maintenance)} קלוריות.
                {d.weeklyRateKg > 0 && p.goal !== 'gain' ? ` קצב צפוי: ${d.weeklyRateKg} ק"ג בשבוע.` : ''}
                {d.weeksToTarget ? ` משקל היעד בעוד כ${d.weeksToTarget} שבועות.` : ''}
              </Text>
            </Card>
            <Card title={`אימונים בשבוע: ${d.plan.length}`}>
              {d.plan.length === 0 && <Text style={[T.muted, { fontSize: 14 }]}>לא נבחרו ימים</Text>}
              {d.plan.map((w) => (
                <Row
                  key={w.day}
                  label={`${DAY_NAMES[w.day]} ${pad2(w.hour)}:${pad2(w.minute)}`}
                  value={`${d.sessions[w.session].title}, ${d.sessions[w.session].minutes} דק'`}
                />
              ))}
            </Card>
            {d.notes.length > 0 && (
              <Card title="חשוב לדעת">
                {d.notes.map((n) => (
                  <Text key={n} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
                    {n}
                  </Text>
                ))}
              </Card>
            )}
            {firstRun ? (
              <Card title="כדי שהמאמן יכיר אותך יותר">
                <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>משפחה ובית, שגרת שינה ואוכל, וכמה נודניק המאמן יהיה: אפשר להשלים בכל רגע בלשונית המאמן, תחת "התיק שלי". עד אז המאמן עובד עם ברירות מחדל סבירות.</Text>
              </Card>
            ) : (
              <Text style={[T.muted, { fontSize: 13 }]}>אפשר לחזור ולשנות תשובות בכל רגע ממסך המאמן.</Text>
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
                  label="שמור"
                  onPress={() => {
                    const problem = validate(step, p);
                    if (problem) return showProblem(problem);
                    finish();
                  }}
                />
              ) : (
                <PrimaryButton label={summary ? 'יאללה, מתחילים' : step === (firstRun ? FIRST_RUN_LAST : STEPS.length - 1) ? 'הצג את התוכנית' : 'הבא'} onPress={summary ? finish : next} />
              )}
            </View>
            {!single && (step > 0 || firstRun) && (
              <Pressable onPress={() => (step === 0 ? setWelcome(true) : setStep(firstRun && summary ? FIRST_RUN_LAST : step - 1))} style={s.back}>
                <Text style={[T.bold, { fontSize: 16, color: C.accent }]}>חזרה</Text>
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
