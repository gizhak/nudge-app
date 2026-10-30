// The prominent disclosure Google Play asks for before the background location prompt: what is
// collected, why, that it stays on the phone, and that the app works without it. Shown before
// Android's own dialog every time it is about to appear, until he agrees once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ROW, t as tr } from '../i18n';
import { Sheet } from '../ui/Sheet';
import { C, T } from '../ui/theme';

const KEY = 'location.consent.v1';

const POINTS = [
  tr('המיקום משמש רק כדי לזהות מתי הגעת לחדר הכושר, הביתה או למשרד ומתי יצאת, גם כשהאפליקציה סגורה.', 'Location is used only to notice when you arrive at or leave the gym, home or the office, also when the app is closed.'),
  tr('כך המאמן יודע שהתאמנת, ושולח תזכורות בזמן הנכון ולא באמצע הדרך.', 'That is how the coach knows you trained, and sends reminders at the right time, not on the way.'),
  tr('המיקום נשאר בטלפון. הוא לא נשלח לשום שרת ולא משותף עם אף אחד, גם לא לפרסום.', 'Your location stays on the phone. It is not sent to any server and not shared with anyone, advertising included.'),
  tr('זה לא חובה. בלי זה כל השאר עובד, ורק הזיהוי האוטומטי לא יפעל. אפשר לבטל בכל רגע בהגדרות המכשיר.', 'It is optional. Without it everything else works, only the automatic detection is off. You can turn it off any time in the phone settings.'),
];

/** [ask, sheet]: await ask() before requesting location; render sheet somewhere in the screen */
export function useLocationConsent(): [() => Promise<boolean>, ReactNode] {
  const [open, setOpen] = useState(false);
  const done = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(async () => {
    try {
      if ((await AsyncStorage.getItem(KEY)) === 'yes') return true;
    } catch {
      // ask again
    }
    return new Promise<boolean>((resolve) => {
      done.current = resolve;
      setOpen(true);
    });
  }, []);

  const finish = (ok: boolean) => {
    setOpen(false);
    if (ok) AsyncStorage.setItem(KEY, 'yes').catch(() => undefined);
    done.current?.(ok);
    done.current = null;
  };

  const sheet = (
    <Sheet open={open} onClose={() => finish(false)} title={tr('זיהוי אוטומטי של מקומות', 'Automatic place detection')}>
      <View style={{ gap: 10 }}>
        {POINTS.map((p, i) => (
          <View key={i} style={s.point}>
            <Text style={[T.bold, { fontSize: 15, minWidth: 18 }]}>{i + 1}.</Text>
            <Text style={[T.base, { fontSize: 15, lineHeight: 22, flex: 1 }]}>{p}</Text>
          </View>
        ))}
        <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
          {tr('במסך הבא של אנדרואיד צריך לבחור "אפשר כל הזמן".', 'On the next Android screen, choose "Allow all the time".')}
        </Text>
        <Pressable onPress={() => finish(true)} style={({ pressed }) => [s.yes, pressed && { opacity: 0.85 }]}>
          <Text style={[T.bold, { color: '#fff', fontSize: 16, textAlign: 'center' }]}>{tr('מסכים, להמשיך', 'I agree, continue')}</Text>
        </Pressable>
        <Pressable onPress={() => finish(false)} style={({ pressed }) => [s.no, pressed && { opacity: 0.85 }]}>
          <Text style={[T.bold, { fontSize: 16, textAlign: 'center' }]}>{tr('לא עכשיו', 'Not now')}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
  return [ask, sheet];
}

const s = StyleSheet.create({
  point: { flexDirection: ROW, gap: 8, alignItems: 'flex-start' },
  yes: { backgroundColor: C.ink, borderRadius: 14, paddingVertical: 13 },
  no: { backgroundColor: C.bg, borderRadius: 14, paddingVertical: 13 },
});
