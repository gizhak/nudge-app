import Learned from './Learned';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { reloadApp, setAppLang } from '../../modules/night-guard';
import { Ionicons } from '@expo/vector-icons';
import { searchSettings, SettingEntry } from './settingsIndex';
import { GOALS, pad2, SESSIONS, WEEKLY_PLAN, DAY_NAMES } from '../config/goals';
import { applyReminders, ensurePermission, sendTestNotification } from '../notifications/schedule';
import { DEFAULT_SETTINGS, loadSettings, REMINDER_INFO, ReminderKey, ReminderSettings, saveSettings } from '../notifications/settings';
import { Card, OpenRow, PrimaryButton, Row, RowsCard, Screen } from '../ui/components';
import CoachSettings from './CoachSettings';
import ReportSettings from './ReportSettings';
import VacationSettings from './VacationSettings';
import { C, fmt, FONT, T } from '../ui/theme';

import { LANG, Lang, ROW, SIDE_END, START, t } from '../i18n';
export default function SettingsScreen({ onEditProfile, onOpenReadiness, onEditSchedule, onClose }: { onEditProfile: () => void; onOpenReadiness: () => void; onEditSchedule?: () => void; onClose?: () => void }) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string | null>(null);
  /** One settings area at a time, instead of every card on one long page */
  const [section, setSection] = useState<null | 'coach' | 'reminders' | 'reports' | 'plan' | 'vacation' | 'learned'>(null);
  const [query, setQuery] = useState('');
  // The language: chosen here, in effect from the next start
  const [langOpen, setLangOpen] = useState(false);
  const [langPicked, setLangPicked] = useState<Lang | null>(null);
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const open = (e: SettingEntry) => {
    if (e.target === 'myfile') return onEditProfile();
    if (e.target === 'readiness') return onOpenReadiness();
    if (e.target === 'schedule') return onEditSchedule?.();
    setFocus(e.anchor);
    setSection(e.target);
  };
  const leave = () => {
    setFocus(undefined);
    setSection(null);
  };

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const toggle = async (key: ReminderKey, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await saveSettings(next);
    const allowed = await ensurePermission();
    if (!allowed) return setStatus(t('ההתראות חסומות. אפשר אותן בהגדרות הטלפון עבור Coach.', 'Notifications are blocked. Allow them for the app in the phone\'s settings.'));
    const count = await applyReminders(next);
    setStatus(t(`${count} תזכורות מתוזמנות`, `${count} reminders scheduled`));
  };

  const test = async () => {
    if (!(await ensurePermission())) return setStatus(t('ההתראות חסומות. אפשר אותן בהגדרות הטלפון עבור Coach.', 'Notifications are blocked. Allow them for the app in the phone\'s settings.'));
    await sendTestNotification();
    setStatus(t('התראת בדיקה תגיע בעוד 5 שניות', 'A test notification will arrive in 5 seconds'));
  };

  if (section === 'coach')
    return (
      <Screen title={t("הגדרות המאמן", 'Coach settings')} onBack={leave} focus={focus}>
        <CoachSettings />
      </Screen>
    );

  if (section === 'reminders')
    return (
      <Screen title={t("תזכורות", 'Reminders')} onBack={leave}>
        <Card>
          {(Object.keys(REMINDER_INFO) as ReminderKey[]).filter((key) => key !== 'weekly').map((key) => (
            <View key={key} style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[T.bold, s.text]}>{REMINDER_INFO[key].title}</Text>
                <Text style={[T.muted, { fontSize: 13 }]}>{REMINDER_INFO[key].when}</Text>
              </View>
              <Switch value={settings[key]} onValueChange={(v) => toggle(key, v)} trackColor={{ true: C.accent, false: C.track }} thumbColor="#fff" />
            </View>
          ))}
          {status && <Text style={[T.base, { fontSize: 14, color: C.accent }]}>{status}</Text>}
          <PrimaryButton label={t("שלח התראת בדיקה", 'Send a test notification')} onPress={test} />
        </Card>
      </Screen>
    );

  if (section === 'learned')
    return (
      <Screen title={t("מה המאמן למד", 'What the coach learned')} onBack={leave}>
        <Learned />
      </Screen>
    );

  if (section === 'vacation')
    return (
      <Screen title={t("חופשה", 'Vacation')} onBack={leave}>
        <VacationSettings />
      </Screen>
    );

  if (section === 'reports')
    return (
      <Screen title={t("דוחות", 'Reports')} onBack={leave}>
        <ReportSettings />
      </Screen>
    );

  if (section === 'plan')
    return (
      <Screen title={t("יעדים ואימונים", 'Goals and workouts')} onBack={leave}>
        <Card title={t("יעדים", 'Goals')}>
          <Row label={t("קלוריות ביום", 'Calories a day')} value={fmt(GOALS.calories)} />
          <Row label={t("חלבון ביום", 'Protein a day')} value={t(`${GOALS.proteinG} ג'`, `${GOALS.proteinG} g`)} />
          <Row label={t("צעדים ביום", 'Steps a day')} value={fmt(GOALS.steps)} />
          <Row label={t("שינה", 'Sleep')} value={t(`${GOALS.sleepHours} שעות`, `${GOALS.sleepHours} hours`)} />
        </Card>
        <Card title={t("לוח אימונים", 'Workout plan')}>
          {WEEKLY_PLAN.map((w) => (
            <Row key={w.day} label={`${DAY_NAMES[w.day]} ${pad2(w.hour)}:${pad2(w.minute)}`} value={SESSIONS[w.session].title} />
          ))}
        </Card>
        <Text style={[T.muted, { fontSize: 13 }]}>{t('היעדים ולוח האימונים נגזרים מהתיק שלך. כדי לשנות, ערוך את התיק.', 'The goals and the workout plan come from your file. To change them, edit your file.')}</Text>
      </Screen>
    );

  return (
    <Screen title={t("הגדרות", 'Settings')} onBack={onClose} backLabel={t("סגור", 'Close')}>
      <View style={s.search}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("חיפוש: אוכל, מים, שינה, רכב...", 'Search: food, water, sleep, car...')}
          placeholderTextColor="#9C968D"
          style={s.searchInput}
          textAlign="right"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={C.muted} />
          </Pressable>
        )}
      </View>
      {query.trim() ? (
        (() => {
          const hits = searchSettings(query);
          return hits.length ? (
            <RowsCard>
              {hits.map((e, i) => (
                <OpenRow key={e.title + e.path} first={i === 0} title={e.title} sub={e.path} onPress={() => open(e)} />
              ))}
            </RowsCard>
          ) : (
            <Text style={[T.muted, { fontSize: 14, textAlign: START }]}>{t('לא מצאתי. נסה מילה אחרת, למשל "ארוחה" או "שינה".', 'Nothing found. Try another word, like "meal" or "sleep".')}</Text>
          );
        })()
      ) : (
        <>
          <Text style={s.group}>{t('אני', 'Me')}</Text>
          <RowsCard>
            <OpenRow first title={t("התיק שלי", 'My file')} sub={t("מטרה, בריאות, עבודה, שינה ואוכל", 'Goal, health, work, sleep and food')} onPress={onEditProfile} />
            {onEditSchedule && <OpenRow title={t("סוף שבוע וימי אימון", 'Weekend and workout days')} sub={t("כמו כל יום, רגיל או גמיש", 'Like any day, regular or flexible')} onPress={onEditSchedule} />}
            <OpenRow title={t("חופשה", 'Vacation')} sub={t("שקט או תחזוקה קלה, וימים שלא נספרים בדוחות", 'Quiet or light upkeep, and days the reports skip')} onPress={() => setSection('vacation')} />
          </RowsCard>
          <Text style={s.group}>{t('המאמן', 'The coach')}</Text>
          <RowsCard>
            <OpenRow first title={t("הגדרות המאמן", 'Coach settings')} sub={t("רמת הנדנוד, ארוחות, מים, מקומות, רכב", 'Nagging level, meals, water, places, car')} onPress={() => setSection('coach')} />
            <OpenRow title={t("תזכורות", 'Reminders')} sub={t("אימון ושקילת בוקר", 'Workout and morning weigh-in')} onPress={() => setSection('reminders')} />
            <OpenRow title={t("דוחות", 'Reports')} sub={t("מתי מגיע הדוח השבועי והחודשי", 'When the weekly and monthly reports arrive')} onPress={() => setSection('reports')} />
            <OpenRow title={t("מה המאמן למד עליך", 'What the coach learned about you')} sub={t("השעות שלך, מה עובד עליך, והאם הוא רץ ברקע", 'Your hours, what works on you, and whether it runs in the background')} onPress={() => setSection('learned')} />
          </RowsCard>
          <Text style={s.group}>{t('מערכת', 'System')}</Text>
          <RowsCard>
            <OpenRow first title={t("יעדים ולוח אימונים", 'Goals and workout plan')} sub={t(`${fmt(GOALS.calories)} קלוריות · ${GOALS.proteinG} ג' חלבון · ${WEEKLY_PLAN.length} אימונים`, `${fmt(GOALS.calories)} calories · ${GOALS.proteinG} g protein · ${WEEKLY_PLAN.length} workouts`)} onPress={() => setSection('plan')} />
            <OpenRow title={t("בדיקת מוכנות וחיבורים", 'Readiness and connections')} sub={t("שעון, אוכל, Health Connect", 'Watch, food, Health Connect')} onPress={onOpenReadiness} />
          </RowsCard>

          <RowsCard>
            <OpenRow first title="שפה · Language" sub={LANG === 'en' ? 'English' : 'עברית'} onPress={() => setLangOpen(true)} />
          </RowsCard>
          <Sheet open={langOpen} onClose={() => setLangOpen(false)} title="שפה · Language">
            {(
              [
                ['he', 'עברית', ''],
                ['en', 'English', ''],
              ] as [Lang, string, string][]
            ).map(([k, label, note]) => {
              const on = (langPicked ?? LANG) === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                    setAppLang(k);
                    setLangPicked(k);
                  }}
                  style={({ pressed }) => [{ borderWidth: 1.5, borderColor: on ? C.ink : C.track, borderRadius: 16, padding: 14, gap: 2 }, pressed && { opacity: 0.8 }]}
                >
                  <Text style={[T.bold, { fontSize: 16 }]}>{label}</Text>
                  {note ? <Text style={[T.muted, { fontSize: 13 }]}>{note}</Text> : null}
                </Pressable>
              );
            })}
            {langPicked && langPicked !== LANG && (
              <>
                <PrimaryButton label="להחליף עכשיו · Switch now" onPress={() => (reloadApp() ? undefined : BackHandler.exitApp())} />
                <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>האפליקציה תיפתח מחדש בשפה שבחרת. The app restarts in the language you chose.</Text>
              </>
            )}
          </Sheet>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  text: { fontSize: 15 },
  search: { flexDirection: ROW, alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, height: 48 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, fontFamily: FONT.regular, writingDirection: 'rtl', paddingVertical: 0 },
  group: { fontSize: 13, color: C.muted, textAlign: START, marginBottom: -6, marginTop: 4, fontFamily: FONT.bold },
  back: { alignSelf: SIDE_END, paddingVertical: 4 },
  toggleRow: { flexDirection: ROW, alignItems: 'center', gap: 12, paddingVertical: 4 },
});
