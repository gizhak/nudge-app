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

import { LANG, Lang, ROW, SIDE_END, START } from '../i18n';
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
    if (!allowed) return setStatus('ההתראות חסומות. אפשר אותן בהגדרות הטלפון עבור Coach.');
    const count = await applyReminders(next);
    setStatus(`${count} תזכורות מתוזמנות`);
  };

  const test = async () => {
    if (!(await ensurePermission())) return setStatus('ההתראות חסומות. אפשר אותן בהגדרות הטלפון עבור Coach.');
    await sendTestNotification();
    setStatus('התראת בדיקה תגיע בעוד 5 שניות');
  };

  if (section === 'coach')
    return (
      <Screen title="הגדרות המאמן" onBack={leave} focus={focus}>
        <CoachSettings />
      </Screen>
    );

  if (section === 'reminders')
    return (
      <Screen title="תזכורות" onBack={leave}>
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
          <PrimaryButton label="שלח התראת בדיקה" onPress={test} />
        </Card>
      </Screen>
    );

  if (section === 'learned')
    return (
      <Screen title="מה המאמן למד" onBack={leave}>
        <Learned />
      </Screen>
    );

  if (section === 'vacation')
    return (
      <Screen title="חופשה" onBack={leave}>
        <VacationSettings />
      </Screen>
    );

  if (section === 'reports')
    return (
      <Screen title="דוחות" onBack={leave}>
        <ReportSettings />
      </Screen>
    );

  if (section === 'plan')
    return (
      <Screen title="יעדים ואימונים" onBack={leave}>
        <Card title="יעדים">
          <Row label="קלוריות ביום" value={fmt(GOALS.calories)} />
          <Row label="חלבון ביום" value={`${GOALS.proteinG} ג'`} />
          <Row label="צעדים ביום" value={fmt(GOALS.steps)} />
          <Row label="שינה" value={`${GOALS.sleepHours} שעות`} />
        </Card>
        <Card title="לוח אימונים">
          {WEEKLY_PLAN.map((w) => (
            <Row key={w.day} label={`${DAY_NAMES[w.day]} ${pad2(w.hour)}:${pad2(w.minute)}`} value={SESSIONS[w.session].title} />
          ))}
        </Card>
        <Text style={[T.muted, { fontSize: 13 }]}>היעדים ולוח האימונים נגזרים מהתיק שלך. כדי לשנות, ערוך את התיק.</Text>
      </Screen>
    );

  return (
    <Screen title="הגדרות" onBack={onClose} backLabel="סגור">
      <View style={s.search}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="חיפוש: אוכל, מים, שינה, רכב..."
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
            <Text style={[T.muted, { fontSize: 14, textAlign: START }]}>לא מצאתי. נסה מילה אחרת, למשל "ארוחה" או "שינה".</Text>
          );
        })()
      ) : (
        <>
          <Text style={s.group}>אני</Text>
          <RowsCard>
            <OpenRow first title="התיק שלי" sub="מטרה, בריאות, עבודה, שינה ואוכל" onPress={onEditProfile} />
            {onEditSchedule && <OpenRow title="סוף שבוע וימי אימון" sub="כמו כל יום, רגיל או גמיש" onPress={onEditSchedule} />}
            <OpenRow title="חופשה" sub="שקט או תחזוקה קלה, וימים שלא נספרים בדוחות" onPress={() => setSection('vacation')} />
          </RowsCard>
          <Text style={s.group}>המאמן</Text>
          <RowsCard>
            <OpenRow first title="הגדרות המאמן" sub="רמת הנדנוד, ארוחות, מים, מקומות, רכב" onPress={() => setSection('coach')} />
            <OpenRow title="תזכורות" sub="אימון ושקילת בוקר" onPress={() => setSection('reminders')} />
            <OpenRow title="דוחות" sub="מתי מגיע הדוח השבועי והחודשי" onPress={() => setSection('reports')} />
            <OpenRow title="מה המאמן למד עליך" sub="השעות שלך, מה עובד עליך, והאם הוא רץ ברקע" onPress={() => setSection('learned')} />
          </RowsCard>
          <Text style={s.group}>מערכת</Text>
          <RowsCard>
            <OpenRow first title="יעדים ולוח אימונים" sub={`${fmt(GOALS.calories)} קלוריות · ${GOALS.proteinG} ג' חלבון · ${WEEKLY_PLAN.length} אימונים`} onPress={() => setSection('plan')} />
            <OpenRow title="בדיקת מוכנות וחיבורים" sub="שעון, אוכל, Health Connect" onPress={onOpenReadiness} />
          </RowsCard>

          <RowsCard>
            <OpenRow first title="שפה · Language" sub={LANG === 'en' ? 'English' : 'עברית'} onPress={() => setLangOpen(true)} />
          </RowsCard>
          <Sheet open={langOpen} onClose={() => setLangOpen(false)} title="שפה · Language">
            {(
              [
                ['he', 'עברית', ''],
                ['en', 'English', 'בבנייה: חלק מהטקסטים עדיין בעברית'],
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
