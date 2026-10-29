// Where the coach thinks he is, beside the logo: at the gym, at home, at work, or not recognized.
// A tap says how it was noticed and lets him correct it.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { PlaceId } from '../coach/store';
import { setPlaceByHand } from '../coach/placeFix';
import { loadPlaceCheck, PlaceCheckNote } from '../coach/tasks';
import { Sheet } from './Sheet';
import { C, T } from './theme';

import { ROW, t as tr } from '../i18n';
const NAME: Record<PlaceId, string> = { gym: tr('בחדר הכושר', 'At the gym'), home: tr('בבית', 'At home'), office: tr('בעבודה', 'At work') };
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
  const sub = !place ? '' : gym ? tr(`${minutes} דק'`, `${minutes} min`) : tr(`מ־${hhmm(since)}`, `since ${hhmm(since)}`);
  const color = place ? DOT[place] : '#B8B1A7';
  const how = via === 'Wi-Fi' ? tr('לפי רשת Wi-Fi שנקלטת כאן', 'By a Wi-Fi network seen here') : via === 'מיקום' ? tr('לפי המיקום שהגדרת', 'By the location you set') : via === 'רכב' ? tr('לפי המיקום כשהרכב התנתק', 'By the location when the car disconnected') : via === 'ידני' ? tr('כי סימנת את זה בעצמך', 'Because you marked it yourself') : tr('לפי המיקום או ה־Wi-Fi', 'By location or Wi-Fi');

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
        <Text style={[T.bold, { fontSize: 13, color: gym ? '#fff' : place ? C.ink : C.muted }]}>{place ? NAME[place] : tr('לא מזהה מקום', 'Place unknown')}</Text>
        {sub ? <Text style={[T.base, { fontSize: 12, color: gym ? '#D6D2CC' : C.muted }]}>{sub}</Text> : null}
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={place ? tr(`נראה שאתה ${NAME[place]}`, `Looks like you are ${NAME[place].toLowerCase()}`) : tr('לא מזהה איפה אתה', 'Can\'t tell where you are')}>
        <Text style={[T.base, { fontSize: 14, lineHeight: 21, color: C.muted }]}>
          {place ? tr(`זוהה ${how}, ב־${hhmm(since)}.`, `Noticed ${how.charAt(0).toLowerCase() + how.slice(1)}, at ${hhmm(since)}.`) : tr('אף אחד מהמקומות שהגדרת לא נקלט כרגע: לא המיקום ולא רשת Wi-Fi מוכרת.', 'None of the places you set is in range right now: not the location and not a known Wi-Fi network.')}
        </Text>
        {check && (
          <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>
            {tr('בדיקה אחרונה ב־', 'Last check at ')}{hhmm(check.at)}: {check.result === 'stay' ? tr('עדיין שם', 'Still there') : check.result === 'unknown' ? tr('לא הצליח לבדוק', 'Could not check') : tr('יצאת', 'You left')} ({check.how})
          </Text>
        )}
        <Text style={[T.bold, { fontSize: 14 }]}>{tr('אני בעצם:', 'I am actually:')}</Text>
        <View style={s.options}>
          {(['gym', 'home', 'office'] as PlaceId[]).map((p) => (
            <Pressable key={p} disabled={busy || p === place} onPress={() => fix(p)} style={({ pressed }) => [s.option, p === place && s.optionOn, pressed && { opacity: 0.8 }]}>
              <Text style={[T.bold, { fontSize: 14, color: p === place ? '#fff' : C.ink }]}>{NAME[p]}</Text>
            </Pressable>
          ))}
          <Pressable disabled={busy || !place} onPress={() => fix(null)} style={({ pressed }) => [s.option, !place && s.optionOn, pressed && { opacity: 0.8 }]}>
            <Text style={[T.bold, { fontSize: 14, color: !place ? '#fff' : C.ink }]}>{tr('במקום אחר', 'Somewhere else')}</Text>
          </Pressable>
        </View>
        <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{tr('תיקון גם מלמד אותו: הרשתות שנקלטות כאן ישויכו למקום שבחרת.', 'A correction also teaches it: the networks seen here will belong to the place you chose.')}</Text>
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: ROW, alignItems: 'center', gap: 7, backgroundColor: C.card, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  chipGym: { backgroundColor: C.ink },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  options: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: C.track, backgroundColor: C.bg, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  optionOn: { backgroundColor: C.ink, borderColor: C.ink },
});
