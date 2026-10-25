// Pure water math, no I/O.

export const CUP_ML = 250;

/** Daily target: about 35 ml per kg, rounded to whole cups, plus two cups on a training day. */
export function waterTarget(weightKg: number, trainingDay: boolean): number {
  const base = Math.round((weightKg * 35) / CUP_ML) * CUP_ML;
  return Math.max(1500, base) + (trainingDay ? 2 * CUP_ML : 0);
}

/**
 * How much should have been drunk by now, spreading the target evenly
 * from an hour after waking to two hours before bed.
 */
export function waterExpectedByNow(target: number, minuteOfDay: number, wakeTime: number, bedTime: number): number {
  const start = wakeTime + 60;
  let end = bedTime - 120;
  if (end <= start) end += 1440;
  let m = minuteOfDay;
  if (m < wakeTime) m += 1440;
  const f = Math.max(0, Math.min(1, (m - start) / (end - start)));
  return Math.round(target * f);
}

/** Behind on water: the same line for the red dot in the app and for the coach's nag. */
export const WATER_SLACK_ML = 250;
export const waterBehind = (ml: number, expected: number) => ml < expected - WATER_SLACK_ML;

export const cups = (ml: number) => Math.round((ml / CUP_ML) * 10) / 10;

/** What he drinks from: a 250 ml cup, a bottle of 500, 750 or 1000 ml, or sips counted one by one (30 ml each). */
export type Container = 30 | 250 | 500 | 750 | 1000;

/** One sip, about 30 ml: between a small and a full mouthful. */
export const SIP_ML = 30;

export const CONTAINERS: { key: Container; label: string }[] = [
  { key: 250, label: 'כוס' },
  { key: 500, label: 'בקבוק חצי ליטר' },
  { key: 750, label: 'בקבוק 750' },
  { key: 1000, label: 'בקבוק ליטר' },
  { key: 30, label: 'לגימות' },
];

/** 2250 ml becomes 2.3 */
export const liters = (ml: number) => Math.round(ml / 100) / 10;

export const sips = (ml: number) => Math.round(ml / SIP_ML);

/** Amount in the unit he thinks in: cups, sips, or liters for bottle drinkers. */
export function waterText(ml: number, container: Container = 250): string {
  if (container === 250) return `${cups(ml)} כוסות`;
  if (container === 30) return `${liters(ml)} ליטר (${sips(ml)} לגימות)`;
  return `${liters(ml)} ליטר`;
}

/** "X of Y" in his unit. */
export function waterProgress(ml: number, target: number, container: Container = 250): string {
  if (container === 250) return `${cups(ml)} מתוך ${cups(target)} כוסות`;
  if (container === 30) return `${liters(ml)} מתוך ${liters(target)} ליטר (${sips(ml)} לגימות)`;
  return `${liters(ml)} מתוך ${liters(target)} ליטר`;
}

/** What to drink now, in his unit: "a glass of water", "8 sips", "half a bottle". */
export function drinkNow(ml: number, container: Container = 250): string {
  if (container === 250) return ml <= CUP_ML ? 'כוס מים' : `${cups(ml)} כוסות מים`;
  if (container === 30) return `${sips(ml)} לגימות`;
  if (ml >= container) return 'בקבוק שלם';
  if (ml >= container / 2) return 'חצי בקבוק';
  return 'כמה לגימות טובות מהבקבוק';
}

/** Buttons for logging water: a cup, or a quarter, half or whole bottle. */
export function waterButtons(container: Container = 250): { label: string; ml: number }[] {
  if (container === 250) return [{ label: 'שתיתי כוס', ml: 250 }];
  if (container === 30) return [{ label: 'לגימה', ml: SIP_ML }];
  return [
    { label: 'רבע', ml: container / 4 },
    { label: 'חצי', ml: container / 2 },
    { label: 'בקבוק', ml: container },
  ];
}
