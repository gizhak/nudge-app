import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../coach/store';
import { dm, makeVacation, onVacation, VacationMode } from '../coach/vacation';
import { applyReminders, ensurePermission } from '../notifications/schedule';
import { loadSettings } from '../notifications/settings';
import { Card, PrimaryButton } from '../ui/components';
import { Choice } from '../ui/inputs';
import { C, T } from '../ui/theme';

import { ROW, t } from '../i18n';
function Stepper({ label, value, min, max, text, onChange }: { label: string; value: number; min: number; max: number; text: string; onChange: (n: number) => void }) {
  return (
    <View style={s.row}>
      <Text style={[T.bold, { fontSize: 15, flex: 1 }]}>{label}</Text>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={s.step} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>−</Text>
      </Pressable>
      <Text style={[T.bold, { fontSize: 15, width: 92, textAlign: 'center' }]}>{text}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={s.step} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>+</Text>
      </Pressable>
    </View>
  );
}

/** Plan a vacation, or end one early. */
export default function VacationSettings({ onChanged }: { onChanged?: () => void }) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(7);
  const [mode, setMode] = useState<VacationMode>('light');
  useEffect(() => {
    loadPrefs().then(setPrefs);
  }, []);

  const save = async (vacation: typeof prefs.vacation) => {
    const next = { ...prefs, vacation };
    setPrefs(next);
    await savePrefs(next);
    if (await ensurePermission()) await applyReminders(await loadSettings());
    onChanged?.();
  };

  const v = prefs.vacation;
  const active = v && v.to >= new Date().setHours(0, 0, 0, 0);
  const preview = makeVacation(start, length, mode);

  if (active && v) {
    const now = onVacation(new Date(), v);
    return (
      <Card title={now ? t('בחופשה', 'On vacation') : t('חופשה מתוכננת', 'Vacation planned')}>
        <Text style={[T.bold, { fontSize: 18 }]}>
          {dm(v.from)} {t('עד', 'to')} {dm(v.to)}
        </Text>
        <Text style={[T.muted, { fontSize: 14 }]}>{v.mode === 'silent' ? t('שקט מלא: בלי הודעות בכלל.', 'Full quiet: no messages at all.') : t('תחזוקה קלה: הודעה אחת ביום לכל היותר, על מים, צעדים או חלבון.', 'Light maintenance: one message a day at most, about water, steps or protein.')}</Text>
        <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>{t('ימי החופשה לא נספרים בדוחות. ביום הראשון אחרי, המאמן יסביר מראש מה המשקל יראה.', 'Vacation days are not counted in the reports. On the first day after, the coach will explain ahead what the scale will show.')}</Text>
        <PrimaryButton
          label={now ? t('חזרתי, סיים את החופשה', 'I am back, end the vacation') : t('בטל את החופשה', 'Cancel the vacation')}
          onPress={() => {
            if (!now) return save(null);
            // Ended today: yesterday was the last vacation day, so today is the first day back
            const y = new Date();
            y.setHours(0, 0, 0, 0);
            y.setDate(y.getDate() - 1);
            return save(y.getTime() >= v.from ? { ...v, to: y.getTime() } : null);
          }}
        />
      </Card>
    );
  }

  return (
    <Card title={t("יוצא לחופשה", 'Going on vacation')}>
      <Stepper label={t("מתחיל", 'Starts')} value={start} min={0} max={60} text={start === 0 ? t('היום', 'Today') : start === 1 ? t('מחר', 'Tomorrow') : dm(preview.from)} onChange={setStart} />
      <Stepper label={t("כמה ימים", 'How many days')} value={length} min={1} max={30} text={t(`${length} ימים`, `${length} days`)} onChange={setLength} />
      <Text style={[T.muted, { fontSize: 13 }]}>
        {dm(preview.from)} {t('עד', 'to')} {dm(preview.to)}
      </Text>
      <Choice
        options={[
          { key: 'light', label: t('תחזוקה קלה', 'Light maintenance') },
          { key: 'silent', label: t('שקט מלא', 'Full quiet') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
        {mode === 'light'
          ? t('הודעה אחת ביום לכל היותר, רק על מים, צעדים או חלבון. בלי רישום אוכל ובלי אימונים.', 'One message a day at most, only about water, steps or protein. No food logging and no workouts.')
          : t('בלי הודעות בכלל עד החזרה. גם תזכורות האימון והשקילה יושבתו.', 'No messages at all until you are back. Workout and weigh-in reminders are off too.')}
      </Text>
      <PrimaryButton label={t("שמור חופשה", 'Save vacation')} onPress={() => save(preview)} />
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  step: { width: 40, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.track, justifyContent: 'center' },
});
