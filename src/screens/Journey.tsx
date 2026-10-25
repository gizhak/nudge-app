import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { collectNumbers, currentWeightAvg, workoutDaysSince } from '../progress/collect';
import { Checkpoint, COMPARE_MIN_DAYS, dayNumber, daysUntilDue, diff, isDue, signed, sorted, verdict } from '../progress/journey';

type Photo = 'front' | 'side' | 'back';
const PHOTO_TITLE: Record<Photo, string> = { front: 'מקדימה', side: 'מהצד', back: 'מאחור' };
const NEXT_PHOTO: Record<Photo, Step> = { front: 'side', side: 'back', back: 'waist' };

/** Extended tape measurements: one fixed point each, so month to month compares like with like. */
const EXTRA: { key: 'chestCm' | 'armCm' | 'thighCm'; title: string; how: string; min: number; max: number; hint: string }[] = [
  { key: 'chestCm', title: 'חזה', how: 'בגובה הפטמות, הסרט מקביל לרצפה גם בגב. ידיים לצדדים, בסוף נשיפה רגילה.', min: 60, max: 180, hint: 'למשל 104' },
  { key: 'armCm', title: 'זרוע ימין', how: 'רפויה, תלויה לצד הגוף. באמצע בין קצה הכתף למרפק, בנקודה העבה. תמיד ימין, תמיד רפויה.', min: 18, max: 60, hint: 'למשל 34' },
  { key: 'thighCm', title: 'ירך ימין', how: 'עומדים, המשקל על שתי הרגליים. באמצע בין קפל המפשעה לברך. תמיד ימין.', min: 35, max: 100, hint: 'למשל 58' },
];
import { addCheckpoint, deleteCheckpoint, dropPhotos, givePhotoConsent, keepPhoto, photoConsentGiven } from '../progress/store';
import { Card, PrimaryButton, Screen } from '../ui/components';
import { C, FONT, fmt, T } from '../ui/theme';

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
      <Card title="המסע שלך">
        <Text style={[T.base, s.p]}>נקודת התחלה: שתי תמונות, היקף מותן, והמספרים של היום. כל 4 שבועות ביקורת, ותראה מה השתנה גם כשהמשקל לא זז.</Text>
        <PrimaryButton label="נקודת התחלה" onPress={onCheckpoint} />
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
        !last.front && 'תמונה מקדימה',
        !last.side && 'מהצד',
        !last.back && 'מאחור',
        last.waistCm == null && 'מותן',
        // Neck and the extended tape are optional: they never turn the prompt orange
      ].filter((x): x is string => !!x)
    : [];
  const waistDelta = last && last !== first && last.waistCm != null && first.waistCm != null ? Math.round((last.waistCm - first.waistCm) * 10) / 10 : null;

  return (
    <Card>
      <View style={s.head}>
        <Text style={[T.bold, { fontSize: 22 }]}>יום {dayNumber(list)}</Text>
        <Text style={[T.muted, { fontSize: 13 }]}>{due ? 'הגיע הזמן לביקורת' : `ביקורת הבאה בעוד ${left} ימים`}</Text>
      </View>
      <View style={s.nums}>
        {/* Against the week before the start; under two weeks it is mostly water, so not shown as a verdict */}
        <Num label="משקל מאז ההתחלה" value={weightDelta == null ? '—' : (dayNumber(list) ?? 0) < 14 ? 'מוקדם' : signed(weightDelta, 'ק"ג')} />
        <Num label="מותן" value={waistDelta == null ? 'בביקורת' : signed(waistDelta, 'ס"מ')} />
        <Num label="אימונים" value={live.workouts == null ? '—' : String(live.workouts)} />
      </View>
      {due && <PrimaryButton label="ביקורת 4 שבועות" onPress={onCheckpoint} />}
      {editable && !due && (
        <Pressable onPress={onEdit} style={s.link}>
          {missing.length ? (
            <Text style={[T.bold, { fontSize: 14, color: C.signal, textAlign: 'center' }]}>חסר: {missing.join(', ')}. להשלמה</Text>
          ) : (
            <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>ערוך את {list.length === 1 ? 'נקודת ההתחלה' : 'הביקורת האחרונה'}</Text>
          )}
        </Pressable>
      )}
      <Pressable onPress={onCompare} style={s.link}>
        <Text style={[T.bold, { fontSize: 14 }]}>נקודות ביקורת ({list.length})</Text>
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
      setNote('לא הצלחתי לשמור את התמונה. נסה שוב.');
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
        setNote(`${cm > prev.waistCm ? 'עלייה' : 'ירידה'} של ${Math.round(Math.abs(cm - prev.waistCm) * 10) / 10} ס"מ, בזמן שהמשקל כמעט לא זז. זה חשוד: מדוד שוב לפי ההוראות. אם יצא אותו מספר, לחץ שמור שוב.`);
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
    <Screen title={edit ? (prev ? 'השלמת הביקורת' : 'השלמת נקודת ההתחלה') : prev ? 'ביקורת 4 שבועות' : 'נקודת התחלה'}>
      {step === 'consent' && (
        <Card title="לפני שמתחילים: התמונות שלך">
          <Text style={[T.base, s.p]}>התמונות נשמרות רק בתוך האפליקציה, בטלפון שלך. הן לא עולות לשום שרת, ולא נכנסות לקובץ הגיבוי.</Text>
          <Text style={[T.base, s.p]}>
            הסכנה האמיתית נמצאת מחוץ לאפליקציה: התמונה המקורית נשארת בגלריה, ואם הגלריה מגובה לענן (למשל Google Photos) היא גם שם. אחרי השמירה כדאי למחוק את המקור.
          </Text>
          <Text style={[T.base, s.p]}>בכרטיס השיתוף התמונה כבויה כברירת מחדל. אם תדליק אותה, היא תגיע לכל מי שמקבל את הכרטיס, ומשם אין שליטה.</Text>
          <PrimaryButton
            label="הבנתי, נמשיך"
            onPress={async () => {
              await givePhotoConsent();
              setStep('front');
            }}
          />
          <Pressable onPress={() => setStep('waist')} style={s.link}>
            <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>בלי תמונות, רק מדידה ומספרים</Text>
          </Pressable>
        </Card>
      )}

      {(step === 'front' || step === 'side' || step === 'back') && (
        <Card title={`תמונה ${PHOTO_TITLE[step]}`}>
          <Text style={[T.base, s.p]}>
            {prev?.[step]
              ? 'עמוד כמו בתמונה הקודמת: אותו מקום, אותה תאורה, אותו מרחק ואותה תנוחה. כך ההשוואה מראה את הגוף ולא את הצילום.'
              : 'בבוקר, לפני אוכל, באור טבעי. גוף שלם, ידיים לצדדים, הטלפון בגובה החזה. צלם במצלמה של הטלפון ובחר כאן את התמונה.'}
            {step === 'back' ? ' מאחור: מישהו אחר מצלם, או טיימר של המצלמה.' : ''}
          </Text>
          {prev?.[step] && (
            <>
              <Text style={[T.muted, { fontSize: 12 }]}>בפעם הקודמת:</Text>
              <Image source={{ uri: prev[step] }} style={s.prevImg} resizeMode="contain" />
            </>
          )}
          {photos[step] && <Image source={{ uri: photos[step]! }} style={s.newImg} resizeMode="contain" />}
          <PrimaryButton label={photos[step] ? 'החלף תמונה' : 'בחר מהגלריה'} onPress={() => pick(step)} />
          <Pressable onPress={() => setStep(NEXT_PHOTO[step])} style={s.next}>
            <Text style={[T.bold, { color: '#fff', fontSize: 15, textAlign: 'center' }]}>{photos[step] ? 'הבא' : 'דלג'}</Text>
          </Pressable>
          {note && <Text style={[T.bold, { color: C.warn, fontSize: 13 }]}>{note}</Text>}
        </Card>
      )}

      {step === 'waist' && (
        <Card title="מדידות סרט">
          <Text style={[T.bold, { fontSize: 15 }]}>היקף מותן</Text>
          {[
            'בבוקר, לפני אוכל ושתייה, באותה שעה כמו בפעם הקודמת.',
            'עומדים זקוף, רגליים צמודות, הבטן רפויה. לא מכווצים ולא דוחפים.',
            'הסרט בגובה הטבור, מקביל לרצפה מכל הצדדים. בדוק במראה.',
            'נושפים נשיפה רגילה וקוראים את המספר בסוף הנשיפה.',
            'הסרט צמוד לעור אבל לא לוחץ. מודדים פעמיים; אם יש פער של יותר מחצי ס"מ, פעם שלישית, ורושמים את הממוצע.',
          ].map((t, i) => (
            <Text key={t} style={[T.base, s.p]}>
              {i + 1}. {t}
            </Text>
          ))}
          {prev?.waistCm ? <Text style={[T.muted, { fontSize: 13 }]}>בפעם הקודמת: {prev.waistCm} ס"מ.</Text> : null}
          <TextInput value={waist} onChangeText={(t) => { setWaist(t); setConfirmOdd(false); }} placeholder='ס"מ, למשל 92' keyboardType="decimal-pad" style={s.input} placeholderTextColor={C.muted} />

          <Text style={[T.bold, { fontSize: 15, marginTop: 8 }]}>היקף צוואר (לא חובה)</Text>
          <Text style={[T.base, s.p]}>
            ממש מתחת לגרוגרת, הסרט נוטה מעט כלפי מטה לכיוון הקדמי. מבט קדימה, כתפיים רפויות. עם המותן והגובה זה נותן הערכה של אחוז השומן, בלי משקל חכם.
          </Text>
          {prev?.neckCm ? <Text style={[T.muted, { fontSize: 13 }]}>בפעם הקודמת: {prev.neckCm} ס"מ.</Text> : null}
          <TextInput value={neck} onChangeText={setNeck} placeholder='ס"מ, למשל 39' keyboardType="decimal-pad" style={s.input} placeholderTextColor={C.muted} />

          <View style={[s.row, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[T.bold, { fontSize: 15 }]}>מדידות מורחבות</Text>
              <Text style={[T.muted, { fontSize: 12 }]}>חזה, זרוע וירך. מראות אם אתה בונה שריר בזמן שהמותן יורדת.</Text>
            </View>
            <Switch value={showExtra} onValueChange={setShowExtra} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
          </View>
          {showExtra &&
            EXTRA.map((e) => (
              <View key={e.key} style={{ gap: 4 }}>
                <Text style={[T.bold, { fontSize: 14 }]}>{e.title}</Text>
                <Text style={[T.base, s.p]}>{e.how}</Text>
                {prev?.[e.key] ? <Text style={[T.muted, { fontSize: 13 }]}>בפעם הקודמת: {prev[e.key]} ס"מ.</Text> : null}
                <TextInput
                  value={extra[e.key] ?? ''}
                  onChangeText={(t) => setExtra((x) => ({ ...x, [e.key]: t }))}
                  placeholder={`ס"מ, ${e.hint}`}
                  keyboardType="decimal-pad"
                  style={s.input}
                  placeholderTextColor={C.muted}
                />
              </View>
            ))}
          {note && <Text style={[T.bold, { color: C.warn, fontSize: 13, lineHeight: 19 }]}>{note}</Text>}
          <PrimaryButton label={busy ? 'שומר...' : confirmOdd ? 'שמור בכל זאת' : 'שמור'} onPress={() => !busy && finish()} />
        </Card>
      )}

      {step === 'done' && (
        <Card title="נשמר">
          <Text style={[T.base, s.p]}>{prev ? 'הביקורת נשמרה. ההשוואה מחכה לך בנקודות הביקורת.' : 'נקודת ההתחלה נשמרה. בעוד 4 שבועות המאמן יזכיר לך את הביקורת הראשונה.'}</Text>
          {(front || side || back) && <Text style={[T.bold, { fontSize: 14, color: C.signal }]}>העותק שמור באפליקציה. אפשר עכשיו למחוק את המקור מהגלריה.</Text>}
          <PrimaryButton label="סיום" onPress={() => onClose(true)} />
        </Card>
      )}

      {step !== 'done' && (
        <Pressable onPress={() => onClose(false)} style={s.link}>
          <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>ביטול</Text>
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
    <Screen title="נקודות ביקורת">
      {locked ? (
        <Card>
          <Text style={[T.base, s.p]}>
            ההשוואה נפתחת בביקורת של שבוע 4. בשבועות הראשונים השינוי קטן מדי לעין, והשוואה מוקדמת רק מייאשת.
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
              <Text style={[T.bold, { fontSize: 16 }]}>יום 1 מול יום {days}</Text>
              <View style={s.nums}>
                <Num label="משקל ממוצע" value={d.weight == null ? '—' : signed(d.weight, 'ק"ג')} />
                <Num label="מותן" value={d.waist == null ? '—' : signed(d.waist, 'ס"מ')} />
                <Num label="אימונים" value={String(d.workouts)} />
              </View>
              <TapeTable first={first} last={last} />
              <Text style={[T.base, s.p]}>{verdict(d)}</Text>
              <PrimaryButton label="כרטיס לשיתוף" onPress={() => setShare(true)} />
            </Card>
          )}
          {share && d && <ShareCard first={first} last={last} days={days} d={d} onClose={() => setShare(false)} />}
        </>
      )}

      <Card title="כל הביקורות">
        {s0.map((c, i) => (
          <View key={c.id} style={s.row}>
            <Text style={[T.base, { fontSize: 14, flex: 1 }]}>
              {i === 0 ? 'התחלה' : `ביקורת ${i}`} · {new Date(c.at).toLocaleDateString('he-IL')}
              {c.waistCm ? ` · מותן ${c.waistCm}` : ''}
              {c.weightAvg ? ` · ${c.weightAvg} ק"ג` : ''}
            </Text>
            <Pressable
              onPress={async () => {
                await deleteCheckpoint(c.id);
                onChanged();
              }}
              hitSlop={8}
            >
              <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>מחק</Text>
            </Pressable>
          </View>
        ))}
      </Card>
      <Pressable onPress={onClose} style={s.link}>
        <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>חזרה</Text>
      </Pressable>
    </Screen>
  );
}

/** Every tape measurement, first against latest, next to the photos. */
function TapeTable({ first, last }: { first: Checkpoint; last: Checkpoint }) {
  const rows: { title: string; key: 'waistCm' | 'neckCm' | 'chestCm' | 'armCm' | 'thighCm' }[] = [
    { title: 'מותן', key: 'waistCm' },
    { title: 'חזה', key: 'chestCm' },
    { title: 'זרוע', key: 'armCm' },
    { title: 'ירך', key: 'thighCm' },
    { title: 'צוואר', key: 'neckCm' },
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
              {a != null && b != null ? `מ${a} ל${b}` : `${b ?? a}`}
            </Text>
            <Text style={[T.bold, { fontSize: 14, width: 70, textAlign: 'left' }]}>{dl == null ? '' : signed(dl, 'ס"מ')}</Text>
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
      <Text style={[s.tag, { left: 8 }]}>אחרי</Text>
      <Text style={[s.tag, { right: 8 }]}>לפני</Text>
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
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'שיתוף התקדמות' });
    } catch {
      // cancelled or not available
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="כרטיס לשיתוף">
      <View ref={ref} collapsable={false} style={s.share}>
        <Text style={s.brand}>
          nudge<Text style={{ color: C.signal }}>.</Text>
        </Text>
        <Text style={[T.bold, { fontSize: 22, color: '#fff' }]}>יום 1 מול יום {days}</Text>
        {withPhoto && canPhoto && (
          <View style={s.sharePhotos}>
            <Image source={{ uri: first.front }} style={s.sharePhoto} resizeMode="cover" />
            <Image source={{ uri: last.front }} style={s.sharePhoto} resizeMode="cover" />
          </View>
        )}
        <View style={s.shareNums}>
          {d.waist != null && <ShareNum value={signed(d.waist, 'ס"מ')} label="מותן" />}
          {d.weight != null && <ShareNum value={signed(d.weight, 'ק"ג')} label="משקל ממוצע" />}
          <ShareNum value={fmt(d.workouts)} label="אימונים" />
        </View>
      </View>
      {canPhoto && (
        <View style={s.row}>
          <Text style={[T.base, { fontSize: 14, flex: 1 }]}>לכלול תמונות (יגיעו לכל מי שמקבל)</Text>
          <Switch value={withPhoto} onValueChange={setWithPhoto} trackColor={{ true: C.signal, false: C.track }} thumbColor="#fff" />
        </View>
      )}
      <PrimaryButton label={busy ? 'מכין...' : 'שתף'} onPress={() => !busy && share()} />
      <Pressable onPress={onClose} style={s.link}>
        <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>סגור</Text>
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
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'baseline' },
  nums: { flexDirection: 'row-reverse', paddingVertical: 6 },
  link: { paddingVertical: 8, alignItems: 'center' },
  next: { backgroundColor: C.signal, borderRadius: 14, paddingVertical: 12 },
  prevImg: { width: '100%', height: 220, borderRadius: 12, opacity: 0.6, backgroundColor: C.track },
  newImg: { width: '100%', height: 260, borderRadius: 12, backgroundColor: C.track },
  input: { borderWidth: 1, borderColor: C.track, borderRadius: 12, padding: 12, fontSize: 18, textAlign: 'center', color: C.ink, fontFamily: FONT.regular },
  toggle: { flexDirection: 'row-reverse', gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: C.track, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: C.card },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 },
  ba: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', backgroundColor: C.track },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  tag: { position: 'absolute', top: 8, color: '#fff', fontFamily: FONT.bold, fontSize: 12, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, borderRadius: 6 },
  share: { backgroundColor: C.ink, borderRadius: 20, padding: 20, gap: 12 },
  brand: { fontFamily: FONT.black, fontSize: 22, color: '#fff' },
  sharePhotos: { flexDirection: 'row-reverse', gap: 8 },
  sharePhoto: { flex: 1, aspectRatio: 3 / 4, borderRadius: 12 },
  shareNums: { flexDirection: 'row-reverse' },
});
