// Pure: one record per meal. Some food apps save an edit as a new record and leave the old one
// in Health Connect, so the same meal shows twice (or the old version wins). Keep the newest.

const modified = (r: any) => {
  const t = r?.metadata?.lastModifiedTime;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

const keyOf = (r: any) => {
  const origin = r?.metadata?.dataOrigin ?? '';
  // The app's own id for the meal survives an edit: the strongest signal there is
  // ...but some apps give the same id to a food each time it is eaten (the same breakfast on
  // Monday and on Wednesday), so the day is part of it: an edit stays on its day, another day is another meal
  if (r?.metadata?.clientRecordId) {
    const d = new Date(r?.startTime);
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    return `c|${origin}|${r.metadata.clientRecordId}|${day}`;
  }
  // Otherwise the same app, the same minute and the same name is the same meal
  const minute = Math.floor(new Date(r?.startTime).getTime() / 60000);
  return `n|${origin}|${minute}|${(r?.name ?? '').trim()}`;
};

export function dedupeNutrition<R>(records: R[]): R[] {
  const best = new Map<string, any>();
  for (const r of records as any[]) {
    const k = keyOf(r);
    const prev = best.get(k);
    if (!prev) {
      best.set(k, r);
      continue;
    }
    const pv = prev?.metadata?.clientRecordVersion ?? 0;
    const rv = r?.metadata?.clientRecordVersion ?? 0;
    if (rv > pv || (rv === pv && modified(r) >= modified(prev))) best.set(k, r);
  }
  return [...best.values()];
}

/** The same meal across its copies and edits: what a hidden meal is remembered by too. */
export const mealKey = (r: any): string => keyOf(r);

/** A stable id for one meal record: Health Connect's own id, or the dedupe key. */
export const mealId = (r: any): string => r?.metadata?.id || keyOf(r);
