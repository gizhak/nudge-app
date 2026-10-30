import { useLocationConsent } from '../setup/LocationConsent';
import { loadProfile, saveProfile } from '../profile/profile';
import CarPicker from './CarPicker';
import WifiPlaces from './WifiPlaces';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { runCoach } from '../coach/engine';
import { PlaceResult, searchPlaces } from '../coach/placeSearch';
import { SlotId, SLOTS } from '../nutrition/meals';
import { LEVEL_RULES } from '../coach/rules';
import {
  CoachPrefs,
  DEFAULT_PREFS,
  hhmm,
  loadPlaces,
  loadPrefs,
  NagLevel,
  Place,
  PLACE_NAMES,
  PlaceId,
  savePlaces,
  savePrefs,
} from '../coach/store';
import { CoachStatus, startCoach } from '../coach/tasks';
import { ensurePermission } from '../notifications/schedule';
import { Anchor, Card, PrimaryButton } from '../ui/components';
import { Choice } from '../ui/inputs';
import { CONTAINERS } from '../nutrition/water';
import { C, FONT, T } from '../ui/theme';

import { ROW, START, t as tr } from '../i18n';
const LEVELS: { key: NagLevel; label: string }[] = [
  { key: 'quiet', label: tr('שקט', 'Quiet') },
  { key: 'normal', label: tr('רגיל', 'Normal') },
  { key: 'close', label: tr('צמוד', 'Close') },
  { key: 'drill', label: tr('דומיננטי', 'Dominant') },
];

const LEVEL_TEXT: Record<NagLevel, string> = {
  quiet: tr('רק דברים חשובים, כל נושא פעם ביום.', 'Only important things, each topic once a day.'),
  normal: tr('כולל תזונה, שינה ומים, כל נושא פעם ביום.', 'Includes nutrition, sleep and water, each topic once a day.'),
  close: tr('כולל צעדים ועידוד. מה שלא טופל חוזר כל כמה שעות.', 'Includes steps and encouragement. What was not handled comes back every few hours.'),
  drill: tr('לא מרפה: שקילה, אימון, מים, ארוחות וסנכרון חוזרים עד שמטופלים.', 'Does not let go: weigh-in, workout, water, meals and sync come back until handled.'),
};

const PLACE_ORDER: PlaceId[] = ['home', 'office', 'gym'];
const RADIUS: Record<PlaceId, number> = { home: 150, office: 200, gym: 120 };

/** "31.8781, 34.7394" pasted from Google Maps */
function parseCoords(text: string): { latitude: number; longitude: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

async function describe(latitude: number, longitude: number): Promise<string> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!a) return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    const street = [a.street, a.streetNumber].filter(Boolean).join(' ');
    return [a.name && a.name !== a.streetNumber ? a.name : null, street, a.city].filter(Boolean).join(', ');
  } catch {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
}

export default function CoachSettings() {
  const [prefs, setPrefs] = useState<CoachPrefs>(DEFAULT_PREFS);
  const [places, setPlaces] = useState<Partial<Record<PlaceId, Place>>>({});
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<PlaceId | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [askConsent, consentSheet] = useLocationConsent();

  useEffect(() => {
    loadPrefs().then(setPrefs);
    loadPlaces().then(setPlaces);
    startCoach().then(setStatus).catch(() => undefined);
  }, []);

  const update = async (next: CoachPrefs) => {
    setPrefs(next);
    await savePrefs(next);
    // The profile keeps the same choice, so saving the profile later does not bring the old one back
    if (next.level !== prefs.level || next.tone !== prefs.tone) {
      const prof = await loadProfile().catch(() => null);
      if (prof && (prof.level !== next.level || prof.tone !== next.tone)) await saveProfile({ ...prof, level: next.level, tone: next.tone }).catch(() => undefined);
    }
  };

  const enableLocation = async (): Promise<boolean> => {
    if (!(await askConsent())) return false;
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) {
      setMessage({ text: tr('בלי הרשאת מיקום המאמן לא יזהה בית, משרד וחדר כושר.', 'Without location permission the coach will not recognize home, office and gym.'), ok: false });
      return false;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) {
      setMessage({ text: tr('כדי לזהות הגעה ויציאה צריך לבחור "אפשר כל הזמן" בהרשאת המיקום.', 'To notice arriving and leaving, choose "Allow all the time" in the location permission.'), ok: false });
    }
    return true;
  };

  const savePlace = async (id: PlaceId, latitude: number, longitude: number, label: string) => {
    const next = { ...places, [id]: { latitude, longitude, radius: RADIUS[id], label } };
    setPlaces(next);
    await savePlaces(next);
    setStatus(await startCoach());
    setMessage({ text: tr(`${PLACE_NAMES[id]} נשמר: ${label}`, `${PLACE_NAMES[id]} saved: ${label}`), ok: true });
  };

  const openEditor = (id: PlaceId) => {
    setEditing(editing === id ? null : id);
    setQuery('');
    setFound(null);
    setResults([]);
    setMessage(null);
  };

  const search = async () => {
    if (!query.trim()) return setMessage({ text: tr('כתוב שם מקום או כתובת, למשל "קניון יבנה"', 'Write a place name or an address, for example "Yavne Mall"'), ok: false });
    setBusy('search');
    setMessage(null);
    setFound(null);
    setResults([]);
    try {
      const coords = parseCoords(query);
      if (coords) {
        setFound({ ...coords, label: await describe(coords.latitude, coords.longitude) });
        return;
      }
      // The Android geocoder needs location permission; the map search works without it
      await Location.requestForegroundPermissionsAsync();
      const list = await searchPlaces(query.trim(), describe);
      if (!list.length) {
        return setMessage({ text: tr('לא נמצא. נסה להוסיף עיר, או הדבק קואורדינטות מ Google Maps.', 'Not found. Try adding a city, or paste coordinates from Google Maps.'), ok: false });
      }
      if (list.length === 1) setFound(list[0]);
      else setResults(list);
    } catch {
      setMessage({ text: tr('החיפוש נכשל. בדוק חיבור לאינטרנט ונסה שוב.', 'The search failed. Check the internet connection and try again.'), ok: false });
    } finally {
      setBusy(null);
    }
  };

  const confirmFound = async () => {
    if (!editing || !found) return;
    await savePlace(editing, found.latitude, found.longitude, found.label);
    setEditing(null);
    setFound(null);
    setResults([]);
    setQuery('');
  };

  const setHere = async (id: PlaceId) => {
    setBusy(id);
    setMessage(null);
    try {
      if (!(await enableLocation())) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      await savePlace(id, latitude, longitude, await describe(latitude, longitude));
      setEditing(null);
    } catch {
      setMessage({ text: tr('לא הצלחתי לקבל מיקום. ודא שה GPS דלוק ונסה שוב.', 'Could not get a location. Make sure GPS is on and try again.'), ok: false });
    } finally {
      setBusy(null);
    }
  };

  const activate = async () => {
    setBusy('activate');
    setMessage(null);
    try {
      await ensurePermission();
      await enableLocation();
      setStatus(await startCoach());
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    setBusy('run');
    try {
      const sent = await runCoach(undefined, new Date(), { manual: true });
      setMessage({
        text: sent.length ? tr(`נשלחו ${sent.length} הודעות`, `${sent.length} messages sent`) : tr('שעות שקט, והמאמן לא מצא סיבה להעיר אותך.', 'Quiet hours, and the coach found no reason to wake you.'),
        ok: true,
      });
    } catch {
      setMessage({ text: tr('הבדיקה נכשלה', 'The check failed'), ok: false });
    } finally {
      setBusy(null);
    }
  };

  const ready = status?.geofencing && status?.periodic;

  return (
    <>
      <Anchor id="coach">
      <Card title={tr("המאמן", 'The coach')}>
        <View style={s.row}>
          <Text style={[T.bold, s.text]}>{tr('מאמן פעיל', 'Coach active')}</Text>
          <Switch
            value={prefs.enabled}
            onValueChange={(v) => update({ ...prefs, enabled: v })}
            trackColor={{ true: C.accent, false: C.track }}
            thumbColor="#fff"
          />
        </View>
        <Text style={[T.bold, s.text]}>{tr('כמה נודניק', 'How much nagging')}</Text>
        <View style={s.segment}>
          {LEVELS.map((l) => (
            <Pressable
              key={l.key}
              onPress={() => update({ ...prefs, level: l.key })}
              style={[s.segBtn, prefs.level === l.key && s.segOn]}
            >
              <Text style={[T.bold, { textAlign: 'center', fontSize: 14, color: prefs.level === l.key ? '#fff' : C.ink }]}>
                {l.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[T.muted, { fontSize: 13 }]}>
          {tr('עד', 'Up to')} {LEVEL_RULES[prefs.level].maxPerDay} {tr('הודעות ביום, בלי התגובות לארוחות.', 'messages a day, not counting meal replies.')}{' '}
          {LEVEL_TEXT[prefs.level] ?? ''}
        </Text>
        <Text style={[T.muted, { fontSize: 13 }]}>
          {tr('שקט מ', 'Quiet from ')}{hhmm(prefs.quietStart)} {tr('עד', 'to')} {hhmm(prefs.quietEnd)}{tr(', לפי שעות השינה בפרופיל. תזכורת שינה חצי שעה לפני.', ', by the sleep hours in your profile. Sleep reminder half an hour before.')}
        </Text>
      </Card>
      </Anchor>

      <Anchor id="meals">
      <Card title={tr("ארוחות", 'Meals')}>
        <Text style={[T.muted, { fontSize: 13 }]}>{tr('סמן את הארוחות שאתה אוכל. המאמן יזכיר רק אם ארוחה לא נרשמה, ובימי אימון ערב ארוחת הערב זזה לאחרי האימון.', 'Mark the meals you eat. The coach reminds you only if a meal was not logged, and on evening workout days dinner moves to after the workout.')}</Text>
        <View style={s.slotWrap}>
          {SLOTS.map((slot) => {
            const on = prefs.mealSlots.includes(slot.id);
            return (
              <Pressable
                key={slot.id}
                onPress={() =>
                  update({
                    ...prefs,
                    mealSlots: on
                      ? prefs.mealSlots.filter((x) => x !== slot.id)
                      : SLOTS.map((x) => x.id).filter((x): x is SlotId => x === slot.id || prefs.mealSlots.includes(x)),
                  })
                }
                style={[s.slotChip, on && s.slotOn]}
              >
                <Text style={[T.bold, { fontSize: 14, color: on ? '#fff' : C.ink }]}>{slot.label}</Text>
                <Text style={[T.base, { fontSize: 12, color: on ? '#fff' : C.muted }]}>{hhmm(slot.remindAt)}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.row}>
          <Text style={[T.bold, s.text]}>{tr('תזכורות לארוחות', 'Meal reminders')}</Text>
          <Switch value={prefs.mealReminders} onValueChange={(v) => update({ ...prefs, mealReminders: v })} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
        </View>
        <View style={s.row}>
          <Text style={[T.bold, s.text]}>{tr('משוב על כל ארוחה', 'Feedback on every meal')}</Text>
          <Switch value={prefs.mealFeedback} onValueChange={(v) => update({ ...prefs, mealFeedback: v })} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
        </View>
      </Card>
      </Anchor>

      <Anchor id="water">
      <Card title={tr("מים", 'Water')}>
        <View style={s.row}>
          <Text style={[T.bold, s.text]}>{tr('תזכורות לשתות מים', 'Water reminders')}</Text>
          <Switch value={prefs.waterReminders} onValueChange={(v) => update({ ...prefs, waterReminders: v })} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
        </View>
        <Text style={[T.bold, s.text]}>{tr('ממה אתה שותה?', 'What do you drink from?')}</Text>
        <Choice
          options={CONTAINERS}
          value={prefs.waterContainer}
          onChange={async (waterContainer) => {
            await update({ ...prefs, waterContainer });
            setStatus(await startCoach());
          }}
        />
      </Card>
      </Anchor>

      <Anchor id="alerts">
      <Card title={tr("רכב, הגעה ולילה", 'Car, arrivals and night')}>
        <View style={s.row}>
          <Text style={[T.bold, s.text]}>{tr('הודעות הגעה ויציאה (בית, עבודה, חדר כושר)', 'Arrival and leaving messages (home, work, gym)')}</Text>
          <Switch value={prefs.placeMessages !== false} onValueChange={(v) => update({ ...prefs, placeMessages: v })} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
        </View>
        <CarPicker />
        <View style={s.row}>
          <Text style={[T.bold, s.text]}>{tr('שומר לילה', 'Night guard')}</Text>
          <Switch
            value={prefs.nightGuard}
            onValueChange={async (v) => {
              await update({ ...prefs, nightGuard: v });
              setStatus(await startCoach());
            }}
            trackColor={{ true: C.accent, false: C.track }}
            thumbColor="#fff"
          />
        </View>
        <Text style={[T.muted, { fontSize: 13 }]}>
          {tr('פתחת את הטלפון אחרי שעת השינה? תקבל הודעה. דורש התראה קבועה קטנה בשורת המצב.', 'Opened the phone after bedtime? You will get a message. Needs a small permanent notification in the status bar.')}
        </Text>
      </Card>
      </Anchor>

      <Anchor id="places">
      <Card title={tr("מקומות", 'Places')}>
        <Text style={[T.muted, { fontSize: 13 }]}>{tr('הגדר לפי כתובת, או לחץ "אני כאן" כשאתה במקום. המאמן יזהה הגעה ויציאה.', 'Set by address, or tap "I am here" when you are at the place. The coach will notice arriving and leaving.')}</Text>
        {PLACE_ORDER.map((id) => (
          <View key={id} style={s.place}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[T.bold, s.text]}>{PLACE_NAMES[id]}</Text>
                <Text style={[T.muted, { fontSize: 13, color: places[id] ? C.accent : C.muted }]} numberOfLines={2}>
                  {places[id] ? places[id]!.label || tr('מוגדר', 'Set') : tr('לא מוגדר', 'Not set')}
                </Text>
              </View>
              {busy === id ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <View style={s.btnPair}>
                  <Pressable onPress={() => openEditor(id)} style={s.smallBtn}>
                    <Text style={[T.bold, { color: C.accent, fontSize: 14 }]}>{tr('כתובת', 'Address')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setHere(id)} style={s.smallBtn}>
                    <Text style={[T.bold, { color: C.accent, fontSize: 14 }]}>{tr('אני כאן', 'I am here')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            {editing === id && (
              <View style={s.editor}>
                <TextInput
                  value={query}
                  onChangeText={(t) => {
                    setQuery(t);
                    setFound(null);
                    setResults([]);
                  }}
                  placeholder={tr("שם מקום או כתובת, למשל קניון יבנה", 'Place name or address, for example Yavne Mall')}
                  placeholderTextColor={C.muted}
                  style={s.input}
                  returnKeyType="search"
                  onSubmitEditing={search}
                />
                <Text style={[T.muted, { fontSize: 12 }]}>{tr('אפשר גם להדביק קואורדינטות מ Google Maps, למשל 31.8781, 34.7394', 'You can also paste coordinates from Google Maps, for example 31.8781, 34.7394')}</Text>
                {busy === 'search' ? (
                  <ActivityIndicator color={C.accent} />
                ) : found ? (
                  <View style={{ gap: 8 }}>
                    <Text style={[T.bold, { fontSize: 14 }]}>{tr('נמצא:', 'Found:')} {found.label}</Text>
                    <PrimaryButton label={tr(`שמור כ${PLACE_NAMES[id]}`, `Save as ${PLACE_NAMES[id]}`)} onPress={confirmFound} />
                  </View>
                ) : results.length ? (
                  <View style={{ gap: 6 }}>
                    <Text style={[T.bold, { fontSize: 14 }]}>{tr('בחר את המקום הנכון', 'Choose the right place')}</Text>
                    {results.map((r, i) => (
                      <Pressable
                        key={i}
                        onPress={() => {
                          setFound(r);
                          setResults([]);
                        }}
                        style={s.result}
                      >
                        <Text style={[T.base, { fontSize: 14 }]} numberOfLines={2}>
                          {r.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <PrimaryButton label={tr("חפש", 'Search')} onPress={search} />
                )}
              </View>
            )}
          </View>
        ))}
      </Card>
      </Anchor>

      <Anchor id="wifi">
        <WifiPlaces />
      </Anchor>

      <Anchor id="status">
      <Card title={tr("מצב", 'Status')}>
        <StatusRow label={tr("מיקום ברקע", 'Background location')} ok={!!status?.backgroundLocation} />
        <StatusRow label={tr(`זיהוי מקומות (${status?.places ?? 0} מתוך 3)`, `Place detection (${status?.places ?? 0} of 3)`)} ok={!!status?.geofencing} />
        <StatusRow label={tr("בדיקה תקופתית כל 15 דקות בערך", 'Periodic check about every 15 minutes')} ok={!!status?.periodic} />
        <StatusRow label={tr("שומר לילה: מזהה פתיחת טלפון אחרי שעת השינה", 'Night guard: notices the phone opened after bedtime')} ok={!!status?.nightGuard} />
        {message && <Text style={[T.base, { fontSize: 14, color: message.ok ? C.accent : C.bad }]}>{message.text}</Text>}
        {busy === 'activate' || busy === 'run' ? (
          <ActivityIndicator color={C.accent} />
        ) : ready ? (
          <PrimaryButton label={tr("הרץ את המאמן עכשיו", 'Run the coach now')} onPress={runNow} />
        ) : (
          <PrimaryButton label={tr("הפעל מאמן", 'Turn on the coach')} onPress={activate} />
        )}
      </Card>
      </Anchor>
      {consentSheet}
    </>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[s.row, { justifyContent: 'flex-start', gap: 8 }]}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok ? C.accent : C.bad }} />
      <Text style={[T.base, { fontSize: 14 }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  text: { fontSize: 15 },
  row: { flexDirection: ROW, alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 2 },
  segment: { flexDirection: ROW, backgroundColor: C.track, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10 },
  segOn: { backgroundColor: C.accent },
  stepper: { flexDirection: ROW, alignItems: 'center', gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { borderWidth: 1.5, borderColor: C.accent, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  btnPair: { flexDirection: ROW, gap: 8 },
  slotWrap: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  slotChip: { borderWidth: 1.5, borderColor: C.track, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12, alignItems: 'center', backgroundColor: C.card },
  slotOn: { backgroundColor: C.accent, borderColor: C.accent },
  result: { backgroundColor: C.card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: C.track },
  place: { gap: 8, paddingVertical: 4 },
  editor: { gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 10 },
  input: {
    borderWidth: 1,
    borderColor: C.track,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.ink,
    fontFamily: FONT.regular,
    textAlign: START,
  },
});
