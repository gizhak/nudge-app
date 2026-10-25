// Where the coach thinks he is, beside the logo: at the gym, at home, at work, or not recognized.
// A tap says how it was noticed and lets him correct it.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { PlaceId } from '../coach/store';
import { setPlaceByHand } from '../coach/placeFix';
import { loadPlaceCheck, PlaceCheckNote } from '../coach/tasks';
import { Sheet } from './Sheet';
import { C, T } from './theme';

const NAME: Record<PlaceId, string> = { gym: 'בחדר הכושר', home: 'בבית', office: 'בעבודה' };
const DOT: Record<PlaceId, string> = { gym: C.signal, home: C.good, office: C.water };

const hhmm = (t: number) => `${String(new Date(t).getHours()).padStart(2, '0')}:${String(new Date(t).getMinutes()).padStart(2, '0')}`;

export default function PlaceChip({ place, since, via, onChanged }: { place: PlaceId | null; since: number; via?: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<PlaceCheckNote | null>(null);
  useEffect(() => {
    if (open) loadPlaceCheck().then(setCheck).catch(() => undefined);
  }, [open]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // A soft pulse while at the gym
  const ping = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (place !== 'gym') return;
    const loop = Animated.loop(Animated.timing(ping, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [place, ping]);

  const gym = place === 'gym';
  const minutes = since ? Math.max(0, Math.round((now - since) / 60000)) : 0;
  const sub = !place ? '' : gym ? `${minutes} דק'` : `מ־${hhmm(since)}`;
  const color = place ? DOT[place] : '#B8B1A7';
  const how = via === 'Wi-Fi' ? 'לפי רשת Wi-Fi שנקלטת כאן' : via === 'מיקום' ? 'לפי המיקום שהגדרת' : via === 'רכב' ? 'לפי המיקום כשהרכב התנתק' : via === 'ידני' ? 'כי סימנת את זה בעצמך' : 'לפי המיקום או ה־Wi-Fi';

  const fix = async (to: PlaceId | null) => {
    setBusy(true);
    await setPlaceByHand(to).catch(() => undefined);
    setBusy(false);
    setOpen(false);
    onChanged();
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={({ pressed }) => [s.chip, gym ? s.chipGym : null, pressed && { opacity: 0.8 }]}>
        <View style={{ width: 10, height: 10 }}>
          {gym && (
            <Animated.View
              style={[
                s.dot,
                { backgroundColor: color, opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] },
              ]}
            />
          )}
          <View style={[s.dot, { backgroundColor: color }]} />
        </View>
        <Text style={[T.bold, { fontSize: 13, color: gym ? '#fff' : place ? C.ink : C.muted }]}>{place ? NAME[place] : 'לא מזהה מקום'}</Text>
        {sub ? <Text style={[T.base, { fontSize: 12, color: gym ? '#D6D2CC' : C.muted }]}>{sub}</Text> : null}
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={place ? `נראה שאתה ${NAME[place]}` : 'לא מזהה איפה אתה'}>
        <Text style={[T.base, { fontSize: 14, lineHeight: 21, color: C.muted }]}>
          {place ? `זוהה ${how}, ב־${hhmm(since)}.` : 'אף אחד מהמקומות שהגדרת לא נקלט כרגע: לא המיקום ולא רשת Wi-Fi מוכרת.'}
        </Text>
        {check && (
          <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>
            בדיקה אחרונה ב־{hhmm(check.at)}: {check.result === 'stay' ? 'עדיין שם' : check.result === 'unknown' ? 'לא הצליח לבדוק' : 'יצאת'} ({check.how})
          </Text>
        )}
        <Text style={[T.bold, { fontSize: 14 }]}>אני בעצם:</Text>
        <View style={s.options}>
          {(['gym', 'home', 'office'] as PlaceId[]).map((p) => (
            <Pressable key={p} disabled={busy || p === place} onPress={() => fix(p)} style={({ pressed }) => [s.option, p === place && s.optionOn, pressed && { opacity: 0.8 }]}>
              <Text style={[T.bold, { fontSize: 14, color: p === place ? '#fff' : C.ink }]}>{NAME[p]}</Text>
            </Pressable>
          ))}
          <Pressable disabled={busy || !place} onPress={() => fix(null)} style={({ pressed }) => [s.option, !place && s.optionOn, pressed && { opacity: 0.8 }]}>
            <Text style={[T.bold, { fontSize: 14, color: !place ? '#fff' : C.ink }]}>במקום אחר</Text>
          </Pressable>
        </View>
        <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>תיקון גם מלמד אותו: הרשתות שנקלטות כאן ישויכו למקום שבחרת.</Text>
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: C.card, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  chipGym: { backgroundColor: C.ink },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  options: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: C.track, backgroundColor: C.bg, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  optionOn: { backgroundColor: C.ink, borderColor: C.ink },
});
