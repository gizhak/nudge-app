import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_RUN_PREFS, Reply, Run, RunPrefs } from './analyze';

const RUNS = 'runs.v1';
const PREFS = 'runPrefs.v1';
const KEEP = 80;

export async function loadRuns(): Promise<Run[]> {
  try {
    const raw = await AsyncStorage.getItem(RUNS);
    return raw ? (JSON.parse(raw) as Run[]) : [];
  } catch {
    return [];
  }
}

export async function saveRuns(runs: Run[]) {
  const s = [...runs].sort((a, b) => a.start - b.start).slice(-KEEP);
  await AsyncStorage.setItem(RUNS, JSON.stringify(s));
}

export async function updateRun(id: string, patch: Partial<Run>) {
  const runs = await loadRuns();
  await saveRuns(runs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

export const setReply = (id: string, reply: Reply) => updateRun(id, { reply });

export async function loadRunPrefs(): Promise<RunPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS);
    return raw ? { ...DEFAULT_RUN_PREFS, ...JSON.parse(raw) } : DEFAULT_RUN_PREFS;
  } catch {
    return DEFAULT_RUN_PREFS;
  }
}

export async function saveRunPrefs(p: RunPrefs) {
  await AsyncStorage.setItem(PREFS, JSON.stringify(p));
}
