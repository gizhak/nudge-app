// Pure water math, no I/O.

import { t } from '../i18n';
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
  { key: 250, label: t('כוס', 'Glass') },
  { key: 500, label: t('בקבוק חצי ליטר', 'Half-liter bottle') },
  { key: 750, label: t('בקבוק 750', '750 bottle') },
  { key: 1000, label: t('בקבוק ליטר', 'Liter bottle') },
  { key: 30, label: t('לגימות', 'Sips') },
];

/** 2250 ml becomes 2.3 */
export const liters = (ml: number) => Math.round(ml / 100) / 10;

export const sips = (ml: number) => Math.round(ml / SIP_ML);

/** Amount in the unit he thinks in: cups, sips, or liters for bottle drinkers. */
export function waterText(ml: number, container: Container = 250): string {
  if (container === 250) return t(`${cups(ml)} כוסות`, `${cups(ml)} glasses`);
  if (container === 30) return t(`${liters(ml)} ליטר (${sips(ml)} לגימות)`, `${liters(ml)} L (${sips(ml)} sips)`);
  return t(`${liters(ml)} ליטר`, `${liters(ml)} L`);
}

/** "X of Y" in his unit. */
export function waterProgress(ml: number, target: number, container: Container = 250): string {
  if (container === 250) return t(`${cups(ml)} מתוך ${cups(target)} כוסות`, `${cups(ml)} of ${cups(target)} glasses`);
  if (container === 30) return t(`${liters(ml)} מתוך ${liters(target)} ליטר (${sips(ml)} לגימות)`, `${liters(ml)} of ${liters(target)} L (${sips(ml)} sips)`);
  return t(`${liters(ml)} מתוך ${liters(target)} ליטר`, `${liters(ml)} of ${liters(target)} L`);
}

/** What to drink now, in his unit: "a glass of water", "8 sips", "half a bottle". */
export function drinkNow(ml: number, container: Container = 250): string {
  if (container === 250) return ml <= CUP_ML ? t('כוס מים', 'A glass of water') : t(`${cups(ml)} כוסות מים`, `${cups(ml)} glasses of water`);
  if (container === 30) return t(`${sips(ml)} לגימות`, `${sips(ml)} sips`);
  if (ml >= container) return t('בקבוק שלם', 'A whole bottle');
  if (ml >= container / 2) return t('חצי בקבוק', 'Half a bottle');
  return t('כמה לגימות טובות מהבקבוק', 'A few good sips from the bottle');
}

/** Buttons for logging water: a cup, or a quarter, half or whole bottle. */
export function waterButtons(container: Container = 250): { label: string; ml: number }[] {
  if (container === 250) return [{ label: t('שתיתי כוס', 'I drank a glass'), ml: 250 }];
  if (container === 30) return [{ label: t('לגימה', 'Sip'), ml: SIP_ML }];
  return [
    { label: t('רבע', 'Quarter'), ml: container / 4 },
    { label: t('חצי', 'Half'), ml: container / 2 },
    { label: t('בקבוק', 'Bottle'), ml: container },
  ];
}
