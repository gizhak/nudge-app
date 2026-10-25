import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReminderKey = 'workout' | 'weighIn' | 'weekly';

export type ReminderSettings = Record<ReminderKey, boolean>;

export const REMINDER_INFO: Record<ReminderKey, { title: string; when: string }> = {
  workout: { title: 'תזכורת אימון', when: 'שעה לפני, ובערב שלפני אימון בוקר' },
  weighIn: { title: 'שקילת בוקר', when: 'כל יום ב07:00' },
  weekly: { title: 'סיכום שבועי', when: 'נקבע בהגדרות הדוחות' },
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
