import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { collectNumbers, currentWeightAvg, workoutDaysSince } from '../progress/collect';
import { Checkpoint, COMPARE_MIN_DAYS, dayNumber, daysUntilDue, diff, isDue, signed, sorted, verdict } from '../progress/journey';

type Photo = 'front' | 'side' | 'back';
const PHOTO_TITLE: Record<Photo, string> = { front: tr('מקדימה', 'from the front'), side: tr('מהצד', 'from the side'), back: tr('מאחור', 'from the back') };
const NEXT_PHOTO: Record<Photo, Step> = { front: 'side', side: 'back', back: 'waist' };

/** Extended tape measurements: one fixed point each, so month to month compares like with like. */
const EXTRA: { key: 'chestCm' | 'armCm' | 'thighCm'; title: string; how: string; min: number; max: number; hint: string }[] = [
  { key: 'chestCm', title: tr('חזה', 'Chest'), how: tr('בגובה הפטמות, הסרט מקביל לרצפה גם בגב. ידיים לצדדים, בסוף נשיפה רגילה.', 'At nipple height, the tape level with the floor at the back too. Arms at your sides, at the end of a normal breath out.'), min: 60, max: 180, hint: tr('למשל 104', 'e.g. 104') },
  { key: 'armCm', title: tr('זרוע ימין', 'Right arm'), how: tr('רפויה, תלויה לצד הגוף. באמצע בין קצה הכתף למרפק, בנקודה העבה. תמיד ימין, תמיד רפויה.', 'Relaxed, hanging at your side. Halfway between the tip of the shoulder and the elbow, at the thickest point. Always the right, always relaxed.'), min: 18, max: 60, hint: tr('למשל 34', 'e.g. 34') },
  { key: 'thighCm', title: tr('ירך ימין', 'Right thigh'), how: tr('עומדים, המשקל על שתי הרגליים. באמצע בין קפל המפשעה לברך. תמיד ימין.', 'Standing, weight on both legs. Halfway between the groin crease and the knee. Always the right.'), min: 35, max: 100, hint: tr('למשל 58', 'e.g. 58') },
];
import { addCheckpoint, deleteCheckpoint, dropPhotos, givePhotoConsent, keepPhoto, photoConsentGiven } from '../progress/store';
import { Card, PrimaryButton, Screen } from '../ui/components';
import { C, FONT, fmt, T } from '../ui/theme';

import { END, ROW, LOCALE, t as tr } from '../i18n';
// ---------- The card on the Progress tab ----------

export function JourneyCard({ list, onCheckpoint, onCompare, onEdit }: { list: Checkpoint[]; onCheckpoint: () => void; onCompare: () => void; onEdit: () => void }) {
  const [live, setLive] = useState<{ weight?: number; workouts?: number }>({});
  const first = sorted(list)[0];
  const last = sorted(list).slice(-1)[0];
  useEffect(() => {
    if (!first) return;
    Promise.all([currentWeightAvg(), workoutDaysSince(first.at)]).then(([weight, workouts]) => setLive({ weight, workouts }));
  }, [first?.id]);

  if (!first) {
    return (
      <Card title={tr("המסע שלך", 'Your journey')}>
        <Text style={[T.base, s.p]}>{tr('נקודת התחלה: שתי תמונות, היקף מותן, והמספרים של היום. כל 4 שבועות ביקורת, ותראה מה השתנה גם כשהמשקל לא זז.', 'A starting point: two photos, waist, and today\'s numbers. A check-in every 4 weeks, and you will see what changed even when the scale does not move.')}</Text>
        <PrimaryButton label={tr("נקודת התחלה", 'Starting point')} onPress={onCheckpoint} />
      </Card>
    );
  }

  const due = isDue(list);
  const left = daysUntilDue(list);
  const weightDelta = live.weight != null && first.weightAvg != null && (dayNumber(list) ?? 1) > 1 ? Math.round((live.weight - first.weightAvg) * 10) / 10 : null;
  // The latest checkpoint stays open for a few days: measurements and photos can be added
  const editable = !!last && Date.now() - last.at < EDIT_DAYS * 24 * 3600 * 1000;
  // What the latest checkpoint still lacks; once nothing is missing the prompt goes away
  const missing = last
    ? [
        !last.front && tr('תמונה מקדימה', 'front photo'),
        !last.side && tr('מהצד', 'side'),
        !last.back && tr('מאחור', 'back'),
        last.waistCm == null && tr('מותן', 'waist'),
        // Neck and the extended tape are optional: they never turn the prompt orange
      ].filter((x): x is string => !!x)
    : [];
  const waistDelta = last && last !== first && last.waistCm != null && first.waistCm != null ? Math.round((last.waistCm - first.waistCm) * 10) / 10 : null;

  return (
    <Card>
      <View style={s.head}>
        <Text style={[T.bold, { fontSize: 22 }]}>{tr('יום', 'Day')} {dayNumber(list)}</Text>
        <Text style={[T.muted, { fontSize: 13 }]}>{due ? tr('הגיע הזמן לביקורת', 'Time for a check-in') : tr(`ביקורת הבאה בעוד ${left} ימים`, `Next check-in in ${left} days`)}</Text>
      </View>
      <View style={s.nums}>
        {/* Against the week before the start; under two weeks it is mostly water, so not shown as a verdict */}
        <Num label={tr("משקל מאז ההתחלה", 'Weight since the start')} value={weightDelta == null ? '—' : (dayNumber(list) ?? 0) < 14 ? tr('מוקדם', 'Early') : signed(weightDelta, tr('ק"ג', 'kg'))} />
        <Num label={tr("מותן", 'Waist')} value={waistDelta == null ? tr('בביקורת', 'At check-in') : signed(waistDelta, tr('ס"מ', 'cm'))} />
        <Num label={tr("אימונים", 'Workouts')} value={live.workouts == null ? '—' : String(live.workouts)} />
      </View>
      {due && <PrimaryButton label={tr("ביקורת 4 שבועות", '4-week check-in')} onPress={onCheckpoint} />}
      {editable && !due && (
        <Pressable onPress={onEdit} style={s.link}>
          {missing.length ? (
            <Text style={[T.bold, { fontSize: 14, color: C.signal, textAlign: 'center' }]}>{tr('חסר:', 'Missing:')} {missing.join(', ')}{tr('. להשלמה', '. To complete')}</Text>
          ) : (
            <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>{tr('ערוך את', 'Edit the')} {list.length === 1 ? tr('נקודת ההתחלה', 'starting point') : tr('הביקורת האחרונה', 'last check-in')}</Text>
          )}
        </Pressable>
      )}
      <Pressable onPress={onCompare} style={s.link}>
        <Text style={[T.bold, { fontSize: 14 }]}>{tr('נקודות ביקורת (', 'Check-ins (')}{list.length})</Text>
      </Pressable>
    </Card>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={[T.bold, { fontSize: 18 }]}>{value}</Text>
      <Text style={[T.muted, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

// ---------- Taking a checkpoint ----------

/** How long after a checkpoint it can still be completed */
const EDIT_DAYS = 3;

type Step = 'consent' | Photo | 'waist' | 'done';

export function CheckpointFlow({ list, onClose, edit }: { list: Checkpoint[]; onClose: (saved: boolean) => void; edit?: Checkpoint }) {
  // Completing a checkpoint compares with the one before it, not with itself
  const prev = sorted(list).filter((c) => c.id !== edit?.id).slice(-1)[0];
  const str = (n?: number) => (n != null ? String(n) : '');
  const [step, setStep] = useState<Step | null>(null);
  const [front, setFront] = useState<string | undefined>(edit?.front);
  const [side, setSide] = useState<string | undefined>(edit?.side);
  const [back, setBack] = useState<string | undefined>(edit?.back);
  const [extra, setExtra] = useState<Record<string, string>>({ chestCm: str(edit?.chestCm), armCm: str(edit?.armCm), thighCm: str(edit?.thighCm) });
  const [showExtra, setShowExtra] = useState(true);
  const [waist, setWaist] = useState(str(edit?.waistCm));
  const [neck, setNeck] = useState(str(edit?.neckCm));
  const [confirmOdd, setConfirmOdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const id = useRef(edit?.id ?? String(Date.now())).current;

  useEffect(() => {
    photoConsentGiven().then((ok) => setStep(ok ? 'front' : 'consent'));
  }, []);

  const photos: Record<Photo, string | undefined> = { front, side, back };
  const pick = async (which: Photo) => {
    setNote(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      // A fresh name each time, so a replaced photo is never shown from cache
      const path = await keepPhoto(r.assets[0].uri, `${id}-${which}-${Date.now()}`);
      (which === 'front' ? setFront : which === 'side' ? setSide : setBack)(path);
    } catch {
      setNote(tr('לא הצלחתי לשמור את התמונה. נסה שוב.', 'Could not save the photo. Try again.'));
    }
  };

  const finish = async () => {
    setBusy(true);
    setNote(null);
    const raw = Number(waist.replace(',', '.'));
    const cm = raw >= 40 && raw <= 200 ? raw : undefined;
    const rawNeck = Number(neck.replace(',', '.'));
    const neckCm = rawNeck >= 25 && rawNeck <= 60 ? rawNeck : undefined;
    // Completing an existing checkpoint keeps the numbers of the day it was taken
    const numbers = edit
      ? { weightAvg: edit.weightAvg, proteinAvg: edit.proteinAvg, sleepAvgH: edit.sleepAvgH, workouts: edit.workouts }
      : await collectNumbers().catch(() => ({}) as Awaited<ReturnType<typeof collectNumbers>>);
    // A big change in the waist while the weight stood still is usually the tape, not the body
    if (!confirmOdd && cm != null && prev?.waistCm != null && Math.abs(cm - prev.waistCm) >= 3) {
      const wDelta = numbers.weightAvg != null && prev.weightAvg != null ? Math.abs(numbers.weightAvg - prev.weightAvg) : null;
      if (wDelta == null || wDelta < 1) {
        setBusy(false);
        setConfirmOdd(true);
        setNote(tr(`${cm > prev.waistCm ? 'עלייה' : 'ירידה'} של ${Math.round(Math.abs(cm - prev.waistCm) * 10) / 10} ס"מ, בזמן שהמשקל כמעט לא זז. זה חשוד: מדוד שוב לפי ההוראות. אם יצא אותו מספר, לחץ שמור שוב.`, `A ${cm > prev.waistCm ? 'gain' : 'drop'} of ${Math.round(Math.abs(cm - prev.waistCm) * 10) / 10} cm while the weight barely moved. That is suspicious: measure again by the instructions. If it comes out the same, tap save again.`));
        return;
      }
    }
    const ext: Partial<Record<(typeof EXTRA)[number]['key'], number>> = {};
    for (const e of EXTRA) {
      const v = Number((extra[e.key] ?? '').replace(',', '.'));
      if (v >= e.min && v <= e.max) ext[e.key] = v;
    }
    await addCheckpoint({ id, at: edit?.at ?? Date.now(), front, side, back, waistCm: cm, neckCm, ...ext, ...numbers });
    if (edit) await dropPhotos([edit.front, edit.side, edit.back].filter((p) => p && ![front, side, back].includes(p)));
    setBusy(false);
    setStep('done');
  };

  if (!step) return null;

  return (
    <Screen title={edit ? (prev ? tr('השלמת הביקורת', 'Completing the check-in') : tr('השלמת נקודת ההתחלה', 'Completing the starting point')) : prev ? tr('ביקורת 4 שבועות', '4-week check-in') : tr('נקודת התחלה', 'Starting point')}>
      {step === 'consent' && (
        <Card title={tr("לפני שמתחילים: התמונות שלך", 'Before we start: your photos')}>
          <Text style={[T.base, s.p]}>{tr('התמונות נשמרות רק בתוך האפליקציה, בטלפון שלך. הן לא עולות לשום שרת, ולא נכנסות לקובץ הגיבוי.', 'The photos are kept only inside the app, on your phone. They are not uploaded to any server, and are not in the backup file.')}</Text>
          <Text style={[T.base, s.p]}>
            {tr('הסכנה האמיתית נמצאת מחוץ לאפליקציה: התמונה המקורית נשארת בגלריה, ואם הגלריה מגובה לענן (למשל Google Photos) היא גם שם. אחרי השמירה כדאי למחוק את המקור.', 'The real risk is outside the app: the original photo stays in the gallery, and if the gallery backs up to the cloud (Google Photos, say) it is there too. After saving, delete the original.')}
          </Text>
          <Text style={[T.base, s.p]}>{tr('בכרטיס השיתוף התמונה כבויה כברירת מחדל. אם תדליק אותה, היא תגיע לכל מי שמקבל את הכרטיס, ומשם אין שליטה.', 'On the share card the photo is off by default. If you turn it on, it goes to everyone who gets the card, and from there you have no control.')}</Text>
          <PrimaryButton
            label={tr("הבנתי, נמשיך", 'Got it, continue')}
            onPress={async () => {
              await givePhotoConsent();
              setStep('front');
            }}
          />
          <Pressable onPress={() => setStep('waist')} style={s.link}>
            <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{tr('בלי תמונות, רק מדידה ומספרים', 'No photos, just measurements and numbers')}</Text>
          </Pressable>
        </Card>
      )}

      {(step === 'front' || step === 'side' || step === 'back') && (
        <Card title={tr(`תמונה ${PHOTO_TITLE[step]}`, `Photo ${PHOTO_TITLE[step]}`)}>
          <Text style={[T.base, s.p]}>
            {prev?.[step]
              ? tr('עמוד כמו בתמונה הקודמת: אותו מקום, אותה תאורה, אותו מרחק ואותה תנוחה. כך ההשוואה מראה את הגוף ולא את הצילום.', 'Stand as in the previous photo: same place, same light, same distance and same pose. Then the comparison shows the body, not the photo.')
              : tr('בבוקר, לפני אוכל, באור טבעי. גוף שלם, ידיים לצדדים, הטלפון בגובה החזה. צלם במצלמה של הטלפון ובחר כאן את התמונה.', 'In the morning, before eating, in daylight. Whole body, arms at your sides, the phone at chest height. Take it with the phone\'s camera and choose the photo here.')}
            {step === 'back' ? tr(' מאחור: מישהו אחר מצלם, או טיימר של המצלמה.', ' From the back: someone else takes it, or the camera timer.') : ''}
          </Text>
          {prev?.[step] && (
            <>
              <Text style={[T.muted, { fontSize: 12 }]}>{tr('בפעם הקודמת:', 'Last time:')}</Text>
              <Image source={{ uri: prev[step] }} style={s.prevImg} resizeMode="contain" />
            </>
          )}
          {photos[step] && <Image source={{ uri: photos[step]! }} style={s.newImg} resizeMode="contain" />}
          <PrimaryButton label={photos[step] ? tr('החלף תמונה', 'Replace photo') : tr('בחר מהגלריה', 'Choose from gallery')} onPress={() => pick(step)} />
          <Pressable onPress={() => setStep(NEXT_PHOTO[step])} style={s.next}>
            <Text style={[T.bold, { color: '#fff', fontSize: 15, textAlign: 'center' }]}>{photos[step] ? tr('הבא', 'Next') : tr('דלג', 'Skip')}</Text>
          </Pressable>
          {note && <Text style={[T.bold, { color: C.warn, fontSize: 13 }]}>{note}</Text>}
        </Card>
      )}

      {step === 'waist' && (
        <Card title={tr("מדידות סרט", 'Tape measurements')}>
          <Text style={[T.bold, { fontSize: 15 }]}>{tr('היקף מותן', 'Waist')}</Text>
          {[
            tr('בבוקר, לפני אוכל ושתייה, באותה שעה כמו בפעם הקודמת.', 'In the morning, before food and drink, at the same time as last time.'),
            tr('עומדים זקוף, רגליים צמודות, הבטן רפויה. לא מכווצים ולא דוחפים.', 'Stand straight, feet together, belly relaxed. Do not suck in or push out.'),
            tr('הסרט בגובה הטבור, מקביל לרצפה מכל הצדדים. בדוק במראה.', 'The tape at navel height, level with the floor all around. Check in a mirror.'),
            tr('נושפים נשיפה רגילה וקוראים את המספר בסוף הנשיפה.', 'Breathe out normally and read the number at the end of the breath.'),
            tr('הסרט צמוד לעור אבל לא לוחץ. מודדים פעמיים; אם יש פער של יותר מחצי ס"מ, פעם שלישית, ורושמים את הממוצע.', 'The tape snug on the skin but not pressing. Measure twice; if they differ by more than half a cm, a third time, and log the average.'),
          ].map((t, i) => (
            <Text key={t} style={[T.base, s.p]}>
              {i + 1}. {t}
            </Text>
          ))}
          {prev?.waistCm ? <Text style={[T.muted, { fontSize: 13 }]}>{tr('בפעם הקודמת:', 'Last time:')} {prev.waistCm} {tr('ס"מ.', 'cm.')}</Text> : null}
          <TextInput value={waist} onChangeText={(t) => { setWaist(t); setConfirmOdd(false); }} placeholder={tr('ס"מ, למשל 92', 'cm, e.g. 92')} keyboardType="decimal-pad" style={s.input} placeholderTextColor={C.muted} />

          <Text style={[T.bold, { fontSize: 15, marginTop: 8 }]}>{tr('היקף צוואר (לא חובה)', 'Neck (optional)')}</Text>
          <Text style={[T.base, s.p]}>
            {tr('ממש מתחת לגרוגרת, הסרט נוטה מעט כלפי מטה לכיוון הקדמי. מבט קדימה, כתפיים רפויות. עם המותן והגובה זה נותן הערכה של אחוז השומן, בלי משקל חכם.', 'Just below the Adam\'s apple, the tape tilted slightly down toward the front. Looking ahead, shoulders relaxed. With the waist and height this gives a body fat estimate, without a smart scale.')}
          </Text>
          {prev?.neckCm ? <Text style={[T.muted, { fontSize: 13 }]}>{tr('בפעם הקודמת:', 'Last time:')} {prev.neckCm} {tr('ס"מ.', 'cm.')}</Text> : null}
          <TextInput value={neck} onChangeText={setNeck} placeholder={tr('ס"מ, למשל 39', 'cm, e.g. 39')} keyboardType="decimal-pad" style={s.input} placeholderTextColor={C.muted} />

          <View style={[s.row, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[T.bold, { fontSize: 15 }]}>{tr('מדידות מורחבות', 'More measurements')}</Text>
              <Text style={[T.muted, { fontSize: 12 }]}>{tr('חזה, זרוע וירך. מראות אם אתה בונה שריר בזמן שהמותן יורדת.', 'Chest, arm and thigh. They show if you are building muscle while the waist goes down.')}</Text>
            </View>
            <Switch value={showExtra} onValueChange={setShowExtra} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
          </View>
          {showExtra &&
            EXTRA.map((e) => (
              <View key={e.key} style={{ gap: 4 }}>
                <Text style={[T.bold, { fontSize: 14 }]}>{e.title}</Text>
                <Text style={[T.base, s.p]}>{e.how}</Text>
                {prev?.[e.key] ? <Text style={[T.muted, { fontSize: 13 }]}>{tr('בפעם הקודמת:', 'Last time:')} {prev[e.key]} {tr('ס"מ.', 'cm.')}</Text> : null}
                <TextInput
                  value={extra[e.key] ?? ''}
                  onChangeText={(t) => setExtra((x) => ({ ...x, [e.key]: t }))}
                  placeholder={tr(`ס"מ, ${e.hint}`, `cm, ${e.hint}`)}
                  keyboardType="decimal-pad"
                  style={s.input}
                  placeholderTextColor={C.muted}
                />
              </View>
            ))}
          {note && <Text style={[T.bold, { color: C.warn, fontSize: 13, lineHeight: 19 }]}>{note}</Text>}
          <PrimaryButton label={busy ? tr('שומר...', 'Saving...') : confirmOdd ? tr('שמור בכל זאת', 'Save anyway') : tr('שמור', 'Save')} onPress={() => !busy && finish()} />
        </Card>
      )}

      {step === 'done' && (
        <Card title={tr("נשמר", 'Saved')}>
          <Text style={[T.base, s.p]}>{prev ? tr('הביקורת נשמרה. ההשוואה מחכה לך בנקודות הביקורת.', 'The check-in is saved. The comparison is waiting for you in the check-ins.') : tr('נקודת ההתחלה נשמרה. בעוד 4 שבועות המאמן יזכיר לך את הביקורת הראשונה.', 'The starting point is saved. In 4 weeks the coach will remind you of the first check-in.')}</Text>
          {(front || side || back) && <Text style={[T.bold, { fontSize: 14, color: C.signal }]}>{tr('העותק שמור באפליקציה. אפשר עכשיו למחוק את המקור מהגלריה.', 'The copy is saved in the app. You can now delete the original from the gallery.')}</Text>}
          <PrimaryButton label={tr("סיום", 'Done')} onPress={() => onClose(true)} />
        </Card>
      )}

      {step !== 'done' && (
        <Pressable onPress={() => onClose(false)} style={s.link}>
          <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>{tr('ביטול', 'Cancel')}</Text>
        </Pressable>
      )}
    </Screen>
  );
}

// ---------- Comparing and sharing ----------

export function CompareView({ list, onClose, onChanged }: { list: Checkpoint[]; onClose: () => void; onChanged: () => void }) {
  const s0 = sorted(list);
  const first = s0[0];
  const last = s0[s0.length - 1];
  const d = diff(s0);
  const days = dayNumber(s0) ?? 0;
  const [view, setView] = useState<Photo>('front');
  const [share, setShare] = useState(false);
  const locked = days - 1 < COMPARE_MIN_DAYS || s0.length < 2;

  return (
    <Screen title={tr("נקודות ביקורת", 'Check-ins')}>
      {locked ? (
        <Card>
          <Text style={[T.base, s.p]}>
            {tr('ההשוואה נפתחת בביקורת של שבוע 4. בשבועות הראשונים השינוי קטן מדי לעין, והשוואה מוקדמת רק מייאשת.', 'The comparison opens at the week 4 check-in. In the first weeks the change is too small to see, and an early comparison only discourages.')}
          </Text>
        </Card>
      ) : (
        <>
          {first[view] && last[view] && <BeforeAfter before={first[view]!} after={last[view]!} />}
          <View style={s.toggle}>
            {(['front', 'side', 'back'] as const).filter((v) => first[v] && last[v]).map((v) => (
              <Pressable key={v} onPress={() => setView(v)} style={[s.chip, view === v && s.chipOn]}>
                <Text style={[T.bold, { fontSize: 13, color: view === v ? '#fff' : C.ink }]}>{PHOTO_TITLE[v]}</Text>
              </Pressable>
            ))}
          </View>
          {d && (
            <Card>
              <Text style={[T.bold, { fontSize: 16 }]}>{tr('יום 1 מול יום', 'Day 1 vs day')} {days}</Text>
              <View style={s.nums}>
                <Num label={tr("משקל ממוצע", 'Average weight')} value={d.weight == null ? '—' : signed(d.weight, tr('ק"ג', 'kg'))} />
                <Num label={tr("מותן", 'Waist')} value={d.waist == null ? '—' : signed(d.waist, tr('ס"מ', 'cm'))} />
                <Num label={tr("אימונים", 'Workouts')} value={String(d.workouts)} />
              </View>
              <TapeTable first={first} last={last} />
              <Text style={[T.base, s.p]}>{verdict(d)}</Text>
              <PrimaryButton label={tr("כרטיס לשיתוף", 'Share card')} onPress={() => setShare(true)} />
            </Card>
          )}
          {share && d && <ShareCard first={first} last={last} days={days} d={d} onClose={() => setShare(false)} />}
        </>
      )}

      <Card title={tr("כל הביקורות", 'All check-ins')}>
        {s0.map((c, i) => (
          <View key={c.id} style={s.row}>
            <Text style={[T.base, { fontSize: 14, flex: 1 }]}>
              {i === 0 ? tr('התחלה', 'Start') : tr(`ביקורת ${i}`, `Check-in ${i}`)} · {new Date(c.at).toLocaleDateString(LOCALE)}
              {c.waistCm ? tr(` · מותן ${c.waistCm}`, ` · waist ${c.waistCm}`) : ''}
              {c.weightAvg ? tr(` · ${c.weightAvg} ק"ג`, ` · ${c.weightAvg} kg`) : ''}
            </Text>
            <Pressable
              onPress={async () => {
                await deleteCheckpoint(c.id);
                onChanged();
              }}
              hitSlop={8}
            >
              <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>{tr('מחק', 'Delete')}</Text>
            </Pressable>
          </View>
        ))}
      </Card>
      <Pressable onPress={onClose} style={s.link}>
        <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>{tr('חזרה', 'Back')}</Text>
      </Pressable>
    </Screen>
  );
}

/** Every tape measurement, first against latest, next to the photos. */
function TapeTable({ first, last }: { first: Checkpoint; last: Checkpoint }) {
  const rows: { title: string; key: 'waistCm' | 'neckCm' | 'chestCm' | 'armCm' | 'thighCm' }[] = [
    { title: tr('מותן', 'Waist'), key: 'waistCm' },
    { title: tr('חזה', 'Chest'), key: 'chestCm' },
    { title: tr('זרוע', 'Arm'), key: 'armCm' },
    { title: tr('ירך', 'Thigh'), key: 'thighCm' },
    { title: tr('צוואר', 'Neck'), key: 'neckCm' },
  ];
  const shown = rows.filter((r) => first[r.key] != null || last[r.key] != null);
  if (!shown.length) return null;
  return (
    <View style={{ gap: 4, paddingVertical: 4 }}>
      {shown.map((r) => {
        const a = first[r.key];
        const b = last[r.key];
        const dl = a != null && b != null ? Math.round((b - a) * 10) / 10 : null;
        return (
          <View key={r.key} style={s.row}>
            <Text style={[T.base, { fontSize: 14, flex: 1 }]}>{r.title}</Text>
            <Text style={[T.muted, { fontSize: 13 }]}>
              {a != null && b != null ? tr(`מ${a} ל${b}`, `${a} to ${b}`) : `${b ?? a}`}
            </Text>
            <Text style={[T.bold, { fontSize: 14, width: 70, textAlign: END }]}>{dl == null ? '' : signed(dl, tr('ס"מ', 'cm'))}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Two photos on top of each other; drag to reveal "after" over "before". */
function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [w, setW] = useState(0);
  const [pos, setPos] = useState(0.5);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;
  const wRef = useRef(0);
  function setFromX(x: number) {
    if (wRef.current) setPos(Math.max(0, Math.min(1, x / wRef.current)));
  }
  return (
    <View
      style={s.ba}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        wRef.current = e.nativeEvent.layout.width;
      }}
      {...pan.panHandlers}
    >
      <Image source={{ uri: before }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { width: w * pos, overflow: 'hidden' }]}>
        <Image source={{ uri: after }} style={{ width: w, height: '100%' }} resizeMode="cover" />
      </View>
      <View style={[s.handle, { left: w * pos - 1 }]} />
      <Text style={[s.tag, { left: 8 }]}>{tr('אחרי', 'After')}</Text>
      <Text style={[s.tag, { right: 8 }]}>{tr('לפני', 'Before')}</Text>
    </View>
  );
}

function ShareCard({ first, last, days, d, onClose }: { first: Checkpoint; last: Checkpoint; days: number; d: NonNullable<ReturnType<typeof diff>>; onClose: () => void }) {
  const ref = useRef<View>(null);
  const [withPhoto, setWithPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const canPhoto = !!(first.front && last.front);

  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: tr('שיתוף התקדמות', 'Share progress') });
    } catch {
      // cancelled or not available
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={tr("כרטיס לשיתוף", 'Share card')}>
      <View ref={ref} collapsable={false} style={s.share}>
        <Text style={s.brand}>
          nudge<Text style={{ color: C.signal }}>.</Text>
        </Text>
        <Text style={[T.bold, { fontSize: 22, color: '#fff' }]}>{tr('יום 1 מול יום', 'Day 1 vs day')} {days}</Text>
        {withPhoto && canPhoto && (
          <View style={s.sharePhotos}>
            <Image source={{ uri: first.front }} style={s.sharePhoto} resizeMode="cover" />
            <Image source={{ uri: last.front }} style={s.sharePhoto} resizeMode="cover" />
          </View>
        )}
        <View style={s.shareNums}>
          {d.waist != null && <ShareNum value={signed(d.waist, tr('ס"מ', 'cm'))} label={tr("מותן", 'Waist')} />}
          {d.weight != null && <ShareNum value={signed(d.weight, tr('ק"ג', 'kg'))} label={tr("משקל ממוצע", 'Average weight')} />}
          <ShareNum value={fmt(d.workouts)} label={tr("אימונים", 'Workouts')} />
        </View>
      </View>
      {canPhoto && (
        <View style={s.row}>
          <Text style={[T.base, { fontSize: 14, flex: 1 }]}>{tr('לכלול תמונות (יגיעו לכל מי שמקבל)', 'Include photos (everyone who gets it will see them)')}</Text>
          <Switch value={withPhoto} onValueChange={setWithPhoto} trackColor={{ true: C.signal, false: C.track }} thumbColor="#fff" />
        </View>
      )}
      <PrimaryButton label={busy ? tr('מכין...', 'Preparing...') : tr('שתף', 'Share')} onPress={() => !busy && share()} />
      <Pressable onPress={onClose} style={s.link}>
        <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>{tr('סגור', 'Close')}</Text>
      </Pressable>
    </Card>
  );
}

function ShareNum({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={[T.bold, { fontSize: 24, color: '#fff' }]}>{value}</Text>
      <Text style={[T.base, { fontSize: 12, color: '#C9C6C0' }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  p: { fontSize: 14, lineHeight: 21 },
  head: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'baseline' },
  nums: { flexDirection: ROW, paddingVertical: 6 },
  link: { paddingVertical: 8, alignItems: 'center' },
  next: { backgroundColor: C.signal, borderRadius: 14, paddingVertical: 12 },
  prevImg: { width: '100%', height: 220, borderRadius: 12, opacity: 0.6, backgroundColor: C.track },
  newImg: { width: '100%', height: 260, borderRadius: 12, backgroundColor: C.track },
  input: { borderWidth: 1, borderColor: C.track, borderRadius: 12, padding: 12, fontSize: 18, textAlign: 'center', color: C.ink, fontFamily: FONT.regular },
  toggle: { flexDirection: ROW, gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: C.track, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: C.card },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  row: { flexDirection: ROW, alignItems: 'center', gap: 8, paddingVertical: 4 },
  ba: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', backgroundColor: C.track },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  tag: { position: 'absolute', top: 8, color: '#fff', fontFamily: FONT.bold, fontSize: 12, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, borderRadius: 6 },
  share: { backgroundColor: C.ink, borderRadius: 20, padding: 20, gap: 12 },
  brand: { fontFamily: FONT.black, fontSize: 22, color: '#fff' },
  sharePhotos: { flexDirection: ROW, gap: 8 },
  sharePhoto: { flex: 1, aspectRatio: 3 / 4, borderRadius: 12 },
  shareNums: { flexDirection: ROW },
});
