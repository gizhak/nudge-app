// Reports kept on the phone, and when to make them.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Report } from './compute';

export interface ReportPrefs {
  weekly: boolean;
  /** 0 = Sunday */
  weekDay: number;
  hour: number;
  monthly: boolean;
}

export const DEFAULT_REPORT_PREFS: ReportPrefs = { weekly: true, weekDay: 0, hour: 9, monthly: true };

const PREFS = 'reports.prefs.v1';
const LIST = 'reports.list.v1';
const KEEP = 60;

export async function loadReportPrefs(): Promise<ReportPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS);
    return raw ? { ...DEFAULT_REPORT_PREFS, ...JSON.parse(raw) } : DEFAULT_REPORT_PREFS;
  } catch {
    return DEFAULT_REPORT_PREFS;
  }
}

export const saveReportPrefs = (p: ReportPrefs) => AsyncStorage.setItem(PREFS, JSON.stringify(p));

/** Newest first. */
export async function loadReports(): Promise<Report[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST);
    const list: Report[] = raw ? JSON.parse(raw) : [];
    return list.sort((a, b) => b.end - a.end || b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveReport(r: Report) {
  const list = (await loadReports()).filter((x) => x.id !== r.id);
  list.unshift(r);
  await AsyncStorage.setItem(LIST, JSON.stringify(list.sort((a, b) => b.end - a.end).slice(0, KEEP)));
}

export async function markReportRead(id: string) {
  const list = await loadReports();
  const r = list.find((x) => x.id === id);
  if (!r || r.read) return;
  r.read = true;
  await AsyncStorage.setItem(LIST, JSON.stringify(list));
}
