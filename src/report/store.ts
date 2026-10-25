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
/**
 * Reports made before the plain labels: "נסחף" and "תקוע" become what happened, and a week whose
 * eating and training were on target while the scale went up becomes "water", as a new report would.
 */
function upgrade(r: Report): Report {
  if (r.verdict === 'drifting') {
    const on = (k: string) => ['good', 'ok'].includes(r.metrics?.find((m) => m.key === k)?.status ?? '');
    const rest = r.headline.replace(/^נסחף:\s*/, '');
    if (on('kcal') && on('workouts'))
      return { ...r, verdict: 'water', headline: `ההרגלים במקום, המשקל עוד לא: ${rest} האוכל והאימונים היו ביעד, אז זה מים ולא שומן. אם זה ימשיך עוד שבוע, נבדוק.` };
    return { ...r, headline: r.headline.replace(/^נסחף:/, 'המשקל עלה:') };
  }
  if (r.verdict === 'stuck') return { ...r, headline: r.headline.replace(/^תקוע:/, 'המשקל עומד:') };
  return r;
}

export async function loadReports(): Promise<Report[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST);
    const list: Report[] = (raw ? JSON.parse(raw) : []).map(upgrade);
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
