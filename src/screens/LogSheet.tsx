// One sheet to log by hand on the progress screen: weight or waist, picked at the top.
// The weekly waist reminder opens it on waist, the "no weigh-in" reminder on weight.
import { forwardRef, useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { didIt } from '../coach/followupStore';
import { saveWeight } from '../health/history';
import { saveWaist } from '../progress/waist';
import { PrimaryButton } from '../ui/components';
import { Sheet } from '../ui/Sheet';
import { C, FONT, fmt, T } from '../ui/theme';

import { ROW } from '../i18n';
export type LogKind = 'weight' | 'waist';

const HOW: Record<LogKind, string> = {
  weight: 'בבוקר, אחרי השירותים ולפני אוכל ושתייה.',
  waist: 'בגובה הטבור, בבוקר אחרי השקילה, אחרי נשיפה רגילה. הסרט צמוד ולא לוחץ. כל פעם באותה צורה.',
};

const LogSheet = forwardRef<
  TextInput,
  { open: boolean; kind: LogKind; onKind: (k: LogKind) => void; onClose: () => void; onSaved: (k: LogKind) => void; lastWaist?: number }
>(function LogSheet({ open, kind, onKind, onClose, onSaved, lastWaist }, ref) {
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    setInput('');
    setMsg(null);
  }, [kind, open]);

  const save = async () => {
    const n = Number(input.replace(',', '.'));
    if (kind === 'weight') {
      if (!Number.isFinite(n) || n < 30 || n > 250) return setMsg({ text: 'משקל בקילוגרמים, למשל 80.6', ok: false });
      try {
        await saveWeight(n);
        await didIt(['weigh']).catch(() => undefined);
      } catch {
        return setMsg({ text: 'השמירה נכשלה. בדוק הרשאת כתיבת משקל ב Health Connect.', ok: false });
      }
    } else {
      if (!Number.isFinite(n) || n < 50 || n > 180) return setMsg({ text: 'היקף בסנטימטרים, למשל 92.5', ok: false });
      await saveWaist(n);
    }
    Keyboard.dismiss();
    setInput('');
    setMsg({ text: `נשמר: ${fmt(n, 1)} ${kind === 'weight' ? 'ק"ג' : 'ס"מ'}`, ok: true });
    onSaved(kind);
  };

  return (
    <Sheet open={open} onClose={onClose} title="רישום ידני">
      <View style={s.toggle}>
        {(['weight', 'waist'] as LogKind[]).map((k) => (
          <Pressable key={k} onPress={() => onKind(k)} style={[s.opt, kind === k && s.optOn]}>
            <Text style={[T.bold, { fontSize: 14, color: kind === k ? '#fff' : C.ink }]}>{k === 'weight' ? 'משקל' : 'היקף מותן'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>{HOW[kind]}</Text>
      <View style={s.row}>
        <TextInput
          ref={ref}
          value={input}
          onChangeText={(t) => {
            setInput(t.replace(/[^0-9.,]/g, ''));
            setMsg(null);
          }}
          placeholder={kind === 'weight' ? '80.6' : lastWaist ? fmt(lastWaist, 1) : '92.5'}
          keyboardType="decimal-pad"
          style={s.input}
          placeholderTextColor={C.muted}
        />
        <Text style={[T.muted, { fontSize: 14 }]}>{kind === 'weight' ? 'ק"ג' : 'ס"מ'}</Text>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="שמור" onPress={save} />
        </View>
      </View>
      {msg && <Text style={[T.bold, { fontSize: 14, color: msg.ok ? C.good : C.bad }]}>{msg.text}</Text>}
    </Sheet>
  );
});

export default LogSheet;

const s = StyleSheet.create({
  toggle: { flexDirection: ROW, backgroundColor: C.bg, borderRadius: 14, padding: 4, gap: 4 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  optOn: { backgroundColor: C.ink },
  row: { flexDirection: ROW, gap: 10, alignItems: 'center' },
  input: {
    width: 100,
    borderWidth: 1,
    borderColor: C.track,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: 'center',
    color: C.ink,
    fontFamily: FONT.regular,
  },
});
