import AsyncStorage from '@react-native-async-storage/async-storage';

import { t } from '../i18n';
export type ReminderKey = 'workout' | 'weighIn' | 'weekly';

export type ReminderSettings = Record<ReminderKey, boolean>;

export const REMINDER_INFO: Record<ReminderKey, { title: string; when: string }> = {
  workout: { title: t('תזכורת אימון', 'Workout reminder'), when: t('שעה לפני, ובערב שלפני אימון בוקר', 'An hour before, and the evening before a morning workout') },
  weighIn: { title: t('שקילת בוקר', 'Morning weigh-in'), when: t('כל יום ב07:00', 'Every day at 07:00') },
  weekly: { title: t('סיכום שבועי', 'Weekly summary'), when: t('נקבע בהגדרות הדוחות', 'Set in the report settings') },
};

export const DEFAULT_SETTINGS: ReminderSettings = { workout: true, weighIn: true, weekly: true };

const KEY = 'coach.reminders.v1';

export async function loadSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
