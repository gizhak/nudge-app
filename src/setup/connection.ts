// Is an app installed, and is its data actually arriving in Health Connect?
import * as IntentLauncher from 'expo-intent-launcher';
import { readRecords } from 'react-native-health-connect';

export type AppState = 'missing' | 'installed' | 'flowing';

export async function isInstalled(pkg: string): Promise<boolean> {
  try {
    return !!(await IntentLauncher.getApplicationIconAsync(pkg));
  } catch {
    return false;
  }
}

/** True when any of these record types arrived from this app in the last 3 days. */
async function flowsFrom(pkg: string, types: ('Steps' | 'SleepSession' | 'Nutrition' | 'HeartRate')[]): Promise<boolean> {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 24 * 3600 * 1000);
  for (const t of types) {
    try {
      const { records }: any = await readRecords(t, {
        timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
      });
      if (records.some((r: any) => r?.metadata?.dataOrigin === pkg)) return true;
    } catch {
      // no permission for this type yet
    }
  }
  return false;
}

export async function appState(pkg: string, types: ('Steps' | 'SleepSession' | 'Nutrition' | 'HeartRate')[]): Promise<AppState> {
  if (!(await isInstalled(pkg))) return 'missing';
  return (await flowsFrom(pkg, types)) ? 'flowing' : 'installed';
}

/** Steps counted by the phone itself (Android 14 and up), for people without a watch. */
export async function phoneStepsFlowing(): Promise<boolean> {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 24 * 3600 * 1000);
  try {
    const { records }: any = await readRecords('Steps', {
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    });
    return records.length > 0;
  } catch {
    return false;
  }
}
