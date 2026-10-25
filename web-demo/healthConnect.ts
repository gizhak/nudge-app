// Web demo only: a stand-in for Health Connect with two weeks of a made-up person's data
// (weigh-ins, meals, sleep, steps, water, workouts), shaped like the real records. Nothing here
// reaches the Android build: metro maps the package to this file only for the web demo.
const DAY = 86400000;
const MIN = 60000;
const ZEPP = 'com.huami.watch.hmwatchmanager';
const MI = 'com.xiaomi.wearable';

const sod = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const at = (day: number, h: number, m = 0) => day + h * 3600000 + m * MIN;
const iso = (t: number) => new Date(t).toISOString();
let seq = 0;
const meta = (origin: string, method = 1) => ({ id: `demo-${++seq}`, dataOrigin: origin, recordingMethod: method });

// A gentle wave: a heavier weekend, then down again
const WEIGHTS = [84.6, 84.4, 84.5, 84.1, 84.3, 84.0, 84.6, 85.2, 85.0, 84.4, 84.0, 83.8, 83.6, 83.4];
const MEALS: [number, number, string, number, number, number, number][] = [
  // hour, minute, name, kcal, protein, carbs, fat
  [7, 40, 'שיבולת שועל עם חלב ובננה', 380, 16, 58, 9],
  [10, 15, 'לחם מלא עם קוטג׳ 5%', 290, 21, 30, 9],
  [13, 0, 'חזה עוף, אורז וסלט', 640, 48, 62, 18],
  [16, 30, 'יוגורט חלבון ואגוזים', 260, 22, 12, 13],
  [20, 0, 'חביתה, סלט וגבינה', 470, 31, 18, 29],
];
const BIG_DAYS = new Set([6, 7]); // the weekend before last: pizza night

type Rec = Record<string, any>;
const store: Record<string, Rec[]> = {};
let builtFor = '';

/** His answers in the questionnaire: the data is shaped around his weight and size */
function person(): { kg: number; scale: number } {
  try {
    const p = JSON.parse((globalThis as any).localStorage?.getItem('coach.profile.v1') ?? 'null');
    const kg = p?.completed && p.weightKg > 30 ? p.weightKg : 84;
    return { kg, scale: Math.max(0.7, Math.min(1.3, kg / 84)) };
  } catch {
    return { kg: 84, scale: 1 };
  }
}

function build(now: number) {
  const { kg, scale } = person();
  const key = `${kg}`;
  if (builtFor === key) return;
  builtFor = key;
  const shift = kg - 84;
  const today = sod(now);
  const days = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY);
  for (const k of ['Weight', 'Nutrition', 'SleepSession', 'Steps', 'Hydration', 'ExerciseSession', 'HeartRate', 'RestingHeartRate', 'Distance', 'ActiveCaloriesBurned']) store[k] = [];
  days.forEach((day, i) => {
    const isToday = day === today;
    const dow = new Date(day).getDay();
    store.Weight.push({ time: iso(at(day, 6, 50 + (i % 3) * 4)), weight: { inKilograms: Math.round((WEIGHTS[i] + shift) * 10) / 10 }, metadata: meta(ZEPP) });
    // Sleep: the night that ended this morning
    const bed = at(day - DAY, 23, 20 + (i % 4) * 10);
    const wake = at(day, 6, 25 + (i % 3) * 5) - (i === 9 ? 95 * MIN : 0);
    store.SleepSession.push({ startTime: iso(bed), endTime: iso(wake), stages: [], metadata: meta(MI, 2) });
    store.RestingHeartRate.push({ time: iso(at(day, 7)), beatsPerMinute: 58 + (i % 4), metadata: meta(MI, 2) });
    // Meals
    MEALS.forEach(([h, m, name, kcal, p, c, f], j) => {
      const t = at(day, h, m);
      if (t > now) return;
      const big = BIG_DAYS.has(i) && j === 4;
      store.Nutrition.push({
        startTime: iso(t),
        endTime: iso(t + 15 * MIN),
        name: big ? 'פיצה משפחתית ובירה' : name,
        energy: { inKilocalories: Math.round((big ? 1450 : kcal) * scale) },
        protein: { inGrams: Math.round((big ? 45 : p) * scale) },
        totalCarbohydrate: { inGrams: big ? 160 : c },
        totalFat: { inGrams: big ? 58 : f },
        mealType: j === 0 ? 1 : j === 2 ? 2 : j === 4 ? 3 : 4,
        metadata: meta(ZEPP),
      });
    });
    // Steps through the day, hour by hour
    for (let h = 7; h <= 21; h++) {
      const t = at(day, h);
      if (t > now) break;
      const count = h === 8 || h === 17 ? 1400 : h === 13 ? 900 : 350 + ((h * 37 + i * 11) % 300);
      store.Steps.push({ startTime: iso(t), endTime: iso(t + 59 * MIN), count, metadata: meta(MI, 2) });
    }
    // Water: a cup now and then
    if (!isToday) {
      for (let k = 0; k < 9; k++) {
        const t = at(day, 8 + k * 1.5);
        store.Hydration.push({ startTime: iso(t - MIN), endTime: iso(t), volume: { inMilliliters: 250 }, metadata: meta('com.gizhak.coach') });
      }
    } else {
      for (let k = 0; k < 9; k++) {
        const t = at(day, 8 + k * 1.5);
        if (t <= now - 30 * MIN) store.Hydration.push({ startTime: iso(t - MIN), endTime: iso(t), volume: { inMilliliters: 250 }, metadata: meta('com.gizhak.coach') });
      }
    }
    // Workouts: Sunday, Tuesday and Thursday evenings, started on the watch
    if ((dow === 0 || dow === 2 || dow === 4) && !isToday) {
      const s = at(day, 20, 30);
      const minutes = 52 + (i % 3) * 7;
      store.ExerciseSession.push({ startTime: iso(s), endTime: iso(s + minutes * MIN), exerciseType: 70, title: 'אימון כוח', metadata: meta(MI, 1) });
      store.HeartRate.push({
        startTime: iso(s),
        endTime: iso(s + minutes * MIN),
        samples: Array.from({ length: 12 }, (_, k) => ({ time: iso(s + k * 5 * MIN), beatsPerMinute: 105 + ((k * 13) % 40) })),
        metadata: meta(MI, 1),
      });
      store.ActiveCaloriesBurned.push({ startTime: iso(s), endTime: iso(s + minutes * MIN), energy: { inKilocalories: 240 + i * 4 }, metadata: meta(MI, 1) });
    }
  });
}

const timeOf = (r: Rec) => Date.parse(r.time ?? r.startTime);
const inRange = (r: Rec, f: any) => {
  const s = Date.parse(f?.timeRangeFilter?.startTime ?? '1970-01-01');
  const e = Date.parse(f?.timeRangeFilter?.endTime ?? '2999-01-01');
  const t = Date.parse(r.time ?? r.startTime);
  const end = Date.parse(r.time ?? r.endTime ?? r.startTime);
  return end >= s && t <= e;
};

export const SdkAvailabilityStatus = { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 };
export async function initialize() {
  build(Date.now());
  return true;
}
export async function getSdkStatus() {
  return SdkAvailabilityStatus.SDK_AVAILABLE;
}
const ALL = ['Steps', 'SleepSession', 'Nutrition', 'Weight', 'Hydration', 'ExerciseSession', 'HeartRate', 'RestingHeartRate', 'Distance', 'ActiveCaloriesBurned', 'TotalCaloriesBurned', 'BodyFat'];
export async function getGrantedPermissions() {
  return [
    ...ALL.flatMap((recordType) => [
      { accessType: 'read', recordType },
      { accessType: 'write', recordType },
    ]),
    { accessType: 'read', recordType: 'BackgroundAccessPermission' },
  ];
}
export async function requestPermission() {
  return getGrantedPermissions();
}
export async function readRecords(type: string, filter?: any) {
  build(Date.now());
  const list = (store[type] ?? []).filter((r) => inRange(r, filter)).sort((a, b) => timeOf(a) - timeOf(b));
  if (filter?.ascendingOrder === false) list.reverse();
  return { records: filter?.pageSize ? list.slice(0, filter.pageSize) : list, pageToken: undefined };
}
export async function aggregateRecord(req: any) {
  build(Date.now());
  const list = (store[req.recordType] ?? []).filter((r) => inRange(r, req));
  if (req.recordType === 'Steps') return { COUNT_TOTAL: list.reduce((a, r) => a + r.count, 0) };
  if (req.recordType === 'ActiveCaloriesBurned') return { ACTIVE_CALORIES_TOTAL: { inKilocalories: list.reduce((a, r) => a + r.energy.inKilocalories, 0) } };
  if (req.recordType === 'Distance') return { DISTANCE: { inMeters: list.reduce((a, r) => a + (r.distance?.inMeters ?? 0), 0) } };
  if (req.recordType === 'HeartRate') {
    const bpm = list.flatMap((r) => r.samples.map((s: any) => s.beatsPerMinute));
    return bpm.length ? { BPM_AVG: bpm.reduce((a: number, b: number) => a + b, 0) / bpm.length, BPM_MAX: Math.max(...bpm), BPM_MIN: Math.min(...bpm) } : {};
  }
  return {};
}
export async function insertRecords(records: any[]) {
  build(Date.now());
  return records.map((r) => {
    const id = `demo-${++seq}`;
    const copy = { ...r, metadata: { id, dataOrigin: 'com.gizhak.coach', recordingMethod: 1 } };
    if (r.recordType === 'Hydration') copy.volume = { inMilliliters: r.volume?.value ?? 250 };
    if (r.recordType === 'Weight') copy.weight = { inKilograms: r.weight?.value ?? r.weight?.inKilograms };
    (store[r.recordType] ??= []).push(copy);
    return id;
  });
}
export async function deleteRecordsByUuids(type: string, ids: string[]) {
  store[type] = (store[type] ?? []).filter((r) => !ids.includes(r.metadata?.id));
}
export function openHealthConnectSettings() {}
export function openHealthConnectDataManagement() {}
export async function requestExerciseRoute() {
  return null;
}
export async function revokeAllPermissions() {}
