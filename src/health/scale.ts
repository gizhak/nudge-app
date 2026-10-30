// What the smart scale passes on to Health Connect, grouped by weigh-in, with sanity checks.
// Used to check the connection: compare the rows with the same weigh-ins in Zepp.
import { getGrantedPermissions, readRecords } from 'react-native-health-connect';

import { t as tr } from '../i18n';
const DAY = 24 * 3600 * 1000;

export const BODY_TYPES = ['BodyFat', 'LeanBodyMass', 'BoneMass', 'BodyWaterMass', 'BasalMetabolicRate'] as const;
export type BodyType = (typeof BODY_TYPES)[number] | 'Weight';

export const BODY_TITLES: Record<BodyType, string> = {
  Weight: tr('משקל', 'Weight'),
  BodyFat: tr('אחוז שומן', 'Body fat'),
  LeanBodyMass: tr('מסה רזה', 'Lean mass'),
  BoneMass: tr('מסת עצם', 'Bone mass'),
  BodyWaterMass: tr('מים בגוף', 'Body water'),
  BasalMetabolicRate: tr('חילוף חומרים במנוחה', 'Resting metabolism'),
};

export interface WeighIn {
  time: Date;
  source?: string;
  weight?: number;
  fatPct?: number;
  leanKg?: number;
  boneKg?: number;
  waterKg?: number;
  bmr?: number;
  /** Values that do not add up, in plain words */
  issues: string[];
}

export interface ScaleCheck {
  /** Per type: no permission, permission but nothing in 30 days, or how many records */
  status: Record<BodyType, 'denied' | 'empty' | number>;
  weighIns: WeighIn[];
}

const valueOf = (type: BodyType, r: any): number | undefined => {
  switch (type) {
    case 'Weight':
      return r.weight?.inKilograms;
    case 'BodyFat':
      return r.percentage?.value ?? r.percentage;
    case 'BasalMetabolicRate':
      return r.basalMetabolicRate?.inKilocaloriesPerDay;
    default:
      return r.mass?.inKilograms;
  }
};

const FIELD: Record<BodyType, keyof WeighIn> = {
  Weight: 'weight',
  BodyFat: 'fatPct',
  LeanBodyMass: 'leanKg',
  BoneMass: 'boneKg',
  BodyWaterMass: 'waterKg',
  BasalMetabolicRate: 'bmr',
};

/** Pure: plausibility checks for one weigh-in. */
export function checkWeighIn(w: WeighIn): string[] {
  const out: string[] = [];
  if (w.fatPct != null && (w.fatPct < 3 || w.fatPct > 60)) out.push(tr(`אחוז שומן ${w.fatPct.toFixed(1)} לא סביר`, `Body fat ${w.fatPct.toFixed(1)} is not plausible`));
  if (w.weight != null) {
    if (w.leanKg != null && w.leanKg >= w.weight) out.push(tr('מסה רזה גדולה מהמשקל', 'Lean mass is larger than the weight'));
    if (w.fatPct != null && w.leanKg != null) {
      const sum = (w.weight * w.fatPct) / 100 + w.leanKg;
      if (Math.abs(sum - w.weight) > 1.5) out.push(tr(`שומן ומסה רזה לא מסתכמים למשקל (${sum.toFixed(1)} מול ${w.weight.toFixed(1)})`, `Fat and lean mass do not add up to the weight (${sum.toFixed(1)} vs ${w.weight.toFixed(1)})`));
    }
    if (w.waterKg != null) {
      const pct = (w.waterKg / w.weight) * 100;
      if (pct < 35 || pct > 75) out.push(tr(`מים ${pct.toFixed(0)}% מהמשקל, לא סביר`, `Water ${pct.toFixed(0)}% of the weight, not plausible`));
    }
    if (w.boneKg != null && (w.boneKg < 1.2 || w.boneKg > 6)) out.push(tr(`מסת עצם ${w.boneKg.toFixed(1)} ק"ג לא סבירה`, `Bone mass ${w.boneKg.toFixed(1)} kg is not plausible`));
  }
  if (w.bmr != null && (w.bmr < 900 || w.bmr > 3500)) out.push(tr(`חילוף חומרים ${Math.round(w.bmr)} לא סביר`, `Metabolism ${Math.round(w.bmr)} is not plausible`));
  return out;
}

/** Pure: records of several types into weigh-ins. Values within 3 minutes of each other belong together. */
export function groupWeighIns(byType: Partial<Record<BodyType, any[]>>): WeighIn[] {
  const rows: WeighIn[] = [];
  const all: { type: BodyType; r: any; t: number }[] = [];
  for (const [type, recs] of Object.entries(byType) as [BodyType, any[]][]) for (const r of recs ?? []) all.push({ type, r, t: new Date(r.time).getTime() });
  all.sort((a, b) => a.t - b.t);
  for (const { type, r, t } of all) {
    const v = valueOf(type, r);
    if (v == null || !Number.isFinite(v)) continue;
    let row = rows.find((w) => Math.abs(w.time.getTime() - t) <= 3 * 60000 && (w as any)[FIELD[type]] == null);
    if (!row) {
      row = { time: new Date(t), source: r.metadata?.dataOrigin, issues: [] };
      rows.push(row);
    }
    (row as any)[FIELD[type]] = v;
  }
  for (const w of rows) w.issues = checkWeighIn(w);
  return rows.sort((a, b) => b.time.getTime() - a.time.getTime());
}

export async function readScaleCheck(days = 30, now = new Date()): Promise<ScaleCheck> {
  const granted = new Set(
    (await getGrantedPermissions().catch(() => [] as any[])).filter((p: any) => p.accessType === 'read').map((p: any) => p.recordType),
  );
  const types: BodyType[] = ['Weight', ...BODY_TYPES];
  const filter = { timeRangeFilter: { operator: 'between' as const, startTime: new Date(now.getTime() - days * DAY).toISOString(), endTime: now.toISOString() } };
  const status = {} as ScaleCheck['status'];
  const byType: Partial<Record<BodyType, any[]>> = {};
  await Promise.all(
    types.map(async (t) => {
      if (!granted.has(t)) {
        status[t] = 'denied';
        return;
      }
      try {
        const { records }: any = await readRecords(t as any, filter);
        byType[t] = records ?? [];
        status[t] = records?.length ? records.length : 'empty';
      } catch {
        status[t] = 'denied';
      }
    }),
  );
  return { status, weighIns: groupWeighIns(byType) };
}
