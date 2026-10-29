// Settings: which Wi-Fi networks mean home, work and the gym.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { wifiNow, WifiNow } from '../../modules/night-guard';
import { forgetWifi, loadPrints, namesOf, teachHere, toggleNet } from '../coach/wifi';
import { bars, matchPlace, Net, STRONG, WifiPrints } from '../coach/wifiMatch';
import { PLACE_NAMES, PlaceId } from '../coach/store';
import { Card } from '../ui/components';
import { C, T } from '../ui/theme';

import { ROW } from '../i18n';
const ORDER: PlaceId[] = ['home', 'office', 'gym'];

const WHY: Record<string, string> = {
  wifi_off: 'ה Wi-Fi בטלפון כבוי. הדלק אותו כדי שאוכל לראות רשתות.',
  permission: 'אין לי גישה לרשתות. צריך שהמיקום בטלפון יהיה דלוק והרשאת מיקום "תמיד".',
  no_native: 'הגרסה הזו לא תומכת ב Wi-Fi. התקן את הגרסה האחרונה.',
  no_wifi: 'לא נמצא Wi-Fi בטלפון.',
};

function Bars({ rssi }: { rssi: number }) {
  const n = bars(rssi);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: 4, height: 4 + i * 3, borderRadius: 1, backgroundColor: i <= n ? C.ink : C.track }} />
      ))}
    </View>
  );
}

export default function WifiPlaces() {
  const [now, setNow] = useState<WifiNow | null>(null);
  const [prints, setPrints] = useState<WifiPrints>({});
  const [pick, setPick] = useState<Net | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async (scan = false) => {
    setNow(wifiNow(scan));
    setPrints(await loadPrints());
  }, []);
  useEffect(() => {
    refresh(true);
    // A fresh scan takes a few seconds to come back
    const t = setTimeout(() => refresh(false), 4000);
    return () => clearTimeout(t);
  }, [refresh]);

  const seen: Net[] = now?.ok ? ([now.connected, ...now.nearby].filter(Boolean) as Net[]) : [];
  const here = now?.ok ? matchPlace(now.connected, now.nearby, prints) : null;
  // One row per network name, the strongest router of it
  const byName = new Map<string, Net>();
  for (const n of now?.nearby ?? []) {
    const key = n.ssid ?? n.bssid;
    const prev = byName.get(key);
    if (!prev || n.rssi > prev.rssi) byName.set(key, n);
  }
  const list = [...byName.values()].sort((a, b) => b.rssi - a.rssi).slice(0, 12);
  const placeOf = (n: Net) => ORDER.find((p) => prints[p]?.bssids.includes(n.bssid) || (n.ssid && prints[p]?.ssids.includes(n.ssid)));

  return (
    <Card title="Wi-Fi">
      <Text style={[T.muted, { fontSize: 13 }]}>
        הרשת שאתה מחובר אליה, או רשת חזקה שאתה רק רואה (3 פסים ומעלה), מגלה איפה אתה. זה מהיר ומדויק יותר מהמיקום, ובמיוחד בתוך בניין.
      </Text>
      {!now?.ok ? (
        <Text style={[T.base, { fontSize: 14, color: C.bad }]}>{WHY[now?.reason ?? ''] ?? 'לא מצליח לקרוא Wi-Fi כרגע.'}</Text>
      ) : (
        <Text style={[T.bold, { fontSize: 14 }]}>
          {here ? `עכשיו: ${PLACE_NAMES[here.place]}, לפי ${here.how === 'connected' ? 'הרשת שאתה מחובר אליה' : 'רשת חזקה בסביבה'}` : now.connected?.ssid ? `מחובר ל "${now.connected.ssid}", לא שייך לאף מקום` : 'עכשיו: לא מזוהה אף מקום'}
        </Text>
      )}

      {ORDER.map((p) => {
        const pr = prints[p];
        const names = pr ? namesOf(pr, seen) : [];
        return (
          <View key={p} style={s.place}>
            <View style={{ flex: 1 }}>
              <Text style={[T.bold, { fontSize: 15 }]}>{PLACE_NAMES[p]}</Text>
              <Text style={[T.muted, { fontSize: 13 }]} numberOfLines={2}>
                {pr?.bssids.length ? (names.length ? names.join(', ') : `${pr.bssids.length} נתבים שמורים`) : 'לא הוגדרה רשת'}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                const r = await teachHere(p);
                setMsg(r.ok ? `${PLACE_NAMES[p]}: נשמר${r.names.length ? ` (${r.names.join(', ')})` : ''}` : WHY[r.reason ?? ''] ?? 'לא נשמר');
                refresh(false);
              }}
              style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[T.bold, { fontSize: 13, color: '#fff' }]}>אני כאן</Text>
            </Pressable>
            {pr?.bssids.length ? (
              <Pressable
                onPress={async () => {
                  await forgetWifi(p);
                  refresh(false);
                }}
                hitSlop={8}
              >
                <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>נקה</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {msg && <Text style={[T.base, { fontSize: 13, color: C.accent }]}>{msg}</Text>}

      {now?.ok && list.length > 0 && (
        <>
          <View style={s.headRow}>
            <Text style={[T.bold, { fontSize: 14, flex: 1 }]}>מה הטלפון רואה עכשיו</Text>
            <Pressable onPress={() => refresh(true).then(() => setTimeout(() => refresh(false), 4000))} hitSlop={8}>
              <Ionicons name="refresh" size={18} color={C.muted} />
            </Pressable>
          </View>
          {list.map((n) => {
            const at = placeOf(n);
            const open = pick?.bssid === n.bssid;
            return (
              <View key={n.bssid}>
                <Pressable onPress={() => setPick(open ? null : n)} style={s.net}>
                  <Bars rssi={n.rssi} />
                  <Text style={[T.base, { fontSize: 14, flex: 1, color: n.rssi >= STRONG ? C.ink : C.muted }]} numberOfLines={1}>
                    {n.ssid ?? 'רשת נסתרת'}
                    {now.connected?.bssid === n.bssid ? '  (מחובר)' : ''}
                  </Text>
                  <Text style={[T.bold, { fontSize: 13, color: at ? C.good : C.muted }]}>{at ? PLACE_NAMES[at] : 'שייך'}</Text>
                </Pressable>
                {open && (
                  <View style={s.chips}>
                    {ORDER.map((p) => (
                      <Pressable
                        key={p}
                        onPress={async () => {
                          // A network belongs to one place: take it off the others first
                          for (const q of ORDER) if (q !== p && prints[q]?.bssids.includes(n.bssid)) await toggleNet(q, n);
                          if (!prints[p]?.bssids.includes(n.bssid)) await toggleNet(p, n);
                          setPick(null);
                          refresh(false);
                        }}
                        style={[s.chip, at === p && { backgroundColor: C.ink }]}
                      >
                        <Text style={[T.bold, { fontSize: 13, color: at === p ? '#fff' : C.ink }]}>{PLACE_NAMES[p]}</Text>
                      </Pressable>
                    ))}
                    {at && (
                      <Pressable
                        onPress={async () => {
                          await toggleNet(at, n);
                          setPick(null);
                          refresh(false);
                        }}
                        style={s.chip}
                      >
                        <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>לא שייך</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <Text style={[T.muted, { fontSize: 12 }]}>רשת חלשה מ 3 פסים לא נחשבת, כדי שמעבר ליד המקום לא ייראה כמו הגעה.</Text>
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  place: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 6 },
  btn: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  headRow: { flexDirection: ROW, alignItems: 'center', marginTop: 6 },
  net: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  chips: { flexDirection: ROW, flexWrap: 'wrap', gap: 6, paddingBottom: 8 },
  chip: { borderRadius: 12, borderWidth: 1, borderColor: '#D9D2C7', paddingVertical: 6, paddingHorizontal: 12 },
});
