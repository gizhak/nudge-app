import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DAY_LETTERS, DAY_NAMES, pad2 } from '../config/goals';
import { applyReminders, ensurePermission } from '../notifications/schedule';
import { loadSettings } from '../notifications/settings';
import { DEFAULT_REPORT_PREFS, loadReportPrefs, ReportPrefs, saveReportPrefs } from '../report/store';
import { Card } from '../ui/components';
import { C, T } from '../ui/theme';

/** When the weekly report comes, and whether the monthly one does. */
export default function ReportSettings() {
  const [p, setP] = useState<ReportPrefs>(DEFAULT_REPORT_PREFS);
  useEffect(() => {
    loadReportPrefs().then(setP);
  }, []);

  const update = async (next: ReportPrefs) => {
    setP(next);
    await saveReportPrefs(next);
    // The "report is ready" notification moves with the setting
    if (await ensurePermission()) await applyReminders(await loadSettings());
  };

  return (
    <Card title="דוחות">
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={[T.bold, { fontSize: 15 }]}>דוח שבועי</Text>
          <Text style={[T.muted, { fontSize: 13 }]}>
            {p.weekly ? `כל יום ${DAY_NAMES[p.weekDay]} ב${pad2(p.hour)}:00, על שבעת הימים שלפניו` : 'כבוי'}
          </Text>
        </View>
        <Switch value={p.weekly} onValueChange={(v) => update({ ...p, weekly: v })} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
      </View>
      {p.weekly && (
        <>
          <View style={s.days}>
            {DAY_LETTERS.map((l, i) => (
              <Pressable key={l} onPress={() => update({ ...p, weekDay: i })} style={[s.day, p.weekDay === i && s.on]}>
                <Text style={[T.bold, { fontSize: 14, textAlign: 'center', color: p.weekDay === i ? '#fff' : C.ink }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.row}>
            <Text style={[T.base, { fontSize: 14, flex: 1 }]}>שעה</Text>
            <Pressable onPress={() => update({ ...p, hour: (p.hour + 23) % 24 })} style={s.step} hitSlop={6}>
              <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>−</Text>
            </Pressable>
            <Text style={[T.bold, { fontSize: 16, width: 64, textAlign: 'center' }]}>{pad2(p.hour)}:00</Text>
            <Pressable onPress={() => update({ ...p, hour: (p.hour + 1) % 24 })} style={s.step} hitSlop={6}>
              <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>+</Text>
            </Pressable>
          </View>
          <Text style={[T.muted, { fontSize: 12 }]}>כדאי אחרי שקילת הבוקר, כדי שהשקילה תיכנס לתמונה.</Text>
        </>
      )}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={[T.bold, { fontSize: 15 }]}>דוח חודשי</Text>
          <Text style={[T.muted, { fontSize: 13 }]}>כל 4 שבועות, ביום הביקורת: עם מותן, תמונות, דפוסים ותחזית</Text>
        </View>
        <Switch value={p.monthly} onValueChange={(v) => update({ ...p, monthly: v })} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 4 },
  days: { flexDirection: 'row-reverse', gap: 6 },
  day: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.track },
  on: { backgroundColor: C.ink, borderColor: C.ink },
  step: { width: 40, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.track, justifyContent: 'center' },
});
