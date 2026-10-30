import { useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { carState, CarState, listPairedDevices, PairedDevice, setCar } from '../../modules/night-guard';
import { C, T } from '../ui/theme';

import { ROW, t as tr } from '../i18n';
/**
 * "My car": pick it from the paired Bluetooth devices. While the phone is connected to it
 * the coach stays silent; connecting and disconnecting mark leaving and arriving.
 */
export default function CarPicker({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<CarState>(carState());
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Live status, so he can check it in the car; only while the screen is in front
  useEffect(() => {
    const t = setInterval(() => {
      if (AppState.currentState === 'active') setState(carState());
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const pick = async () => {
    setNote(null);
    if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
      const r = await PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT' as any).catch(() => 'denied');
      if (r !== PermissionsAndroid.RESULTS.GRANTED) {
        setNote(tr('בלי הרשאת "מכשירים בקרבת מקום" אני לא יכול לראות את הרכב. אפשר לאשר בהגדרות האפליקציה.', 'Without the "Nearby devices" permission I cannot see the car. You can allow it in the app settings.'));
        return;
      }
    }
    const list = listPairedDevices();
    if (list === null) return setNote(tr('אין הרשאה לקרוא את מכשירי ה Bluetooth.', 'No permission to read Bluetooth devices.'));
    if (!list.length) return setNote(tr('אין מכשירים מצומדים. חבר קודם את הטלפון לרכב פעם אחת.', 'No paired devices. Connect the phone to the car once first.'));
    setDevices(list.sort((a, b) => a.name.localeCompare(b.name)));
  };

  const choose = (d: PairedDevice | null) => {
    setCar(d?.address ?? '', d?.name ?? '');
    setDevices(null);
    setState(carState());
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={[T.bold, { fontSize: 15 }]}>{tr('הרכב שלי', 'My car')}</Text>
          <Text style={[T.muted, { fontSize: 13 }]}>
            {state.address
              ? tr(`${state.name}: ${state.connected ? 'מחובר עכשיו, המאמן שקט' : 'לא מחובר'}`, `${state.name}: ${state.connected ? 'connected now, the coach is quiet' : 'not connected'}`)
              : compact
                ? tr('בזמן נהיגה המאמן שותק, ויודע מתי יצאת ומתי הגעת', 'While driving the coach is quiet, and knows when you left and when you arrived')
                : tr('לא נבחר. בזמן נהיגה המאמן שותק, וחיבור לרכב מסמן יציאה והגעה.', 'Not chosen. While driving the coach is quiet, and connecting to the car marks leaving and arriving.')}
          </Text>
        </View>
        <Pressable onPress={pick} style={s.btn}>
          <Text style={[T.bold, { color: '#fff', fontSize: 13 }]}>{state.address ? tr('החלף', 'Change') : tr('בחר רכב', 'Choose a car')}</Text>
        </Pressable>
        {state.address && (
          <Pressable onPress={() => choose(null)} style={s.ghost}>
            <Text style={[T.bold, { fontSize: 13 }]}>{tr('בטל', 'Cancel')}</Text>
          </Pressable>
        )}
      </View>
      {devices && (
        <View style={s.list}>
          {devices.map((d) => (
            <Pressable key={d.address} onPress={() => choose(d)} style={s.item}>
              <Text style={[T.bold, { fontSize: 14 }]}>{d.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setDevices(null)}>
            <Text style={[T.muted, { fontSize: 13 }]}>{tr('סגור', 'Close')}</Text>
          </Pressable>
        </View>
      )}
      {note && <Text style={[T.bold, { fontSize: 13, color: C.warn }]}>{note}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  btn: { backgroundColor: C.ink, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  ghost: { borderWidth: 1, borderColor: C.track, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  list: { borderWidth: 1, borderColor: C.track, borderRadius: 12, padding: 8, gap: 2 },
  item: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.track },
});
