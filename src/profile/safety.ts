// What the coach is willing to plan for whom. Under 18, or already under a healthy weight for the
// height, there is no calorie deficit: the plan becomes keeping the weight, with strength and habits.
import type { Goal, Profile } from './profile';

import { t } from '../i18n';
export const ADULT_AGE = 18;
export const HEALTHY_BMI = 18.5;

export function bmiOf(weightKg: number, heightCm: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** The lowest healthy weight for this height, rounded up to half a kilogram */
export function minHealthyKg(heightCm: number): number | null {
  if (!(heightCm > 0)) return null;
  const m = heightCm / 100;
  return Math.ceil(HEALTHY_BMI * m * m * 2) / 2;
}

export type DeficitBlock = 'minor' | 'underweight' | null;

/** Why a deficit is off for this profile, or null when it is fine */
export function deficitBlock(p: Pick<Profile, 'age' | 'weightKg' | 'heightCm'>): DeficitBlock {
  if (p.age > 0 && p.age < ADULT_AGE) return 'minor';
  const bmi = bmiOf(p.weightKg, p.heightCm);
  if (bmi !== null && bmi < HEALTHY_BMI) return 'underweight';
  return null;
}

/** Goals that eat less than maintenance */
export const DEFICIT_GOALS: Goal[] = ['lose', 'recomp'];

/** The goal the coach actually plans by: a deficit goal turns into keeping the weight when blocked */
export function safeGoal(p: Pick<Profile, 'goal' | 'age' | 'weightKg' | 'heightCm'>): Goal {
  return deficitBlock(p) && DEFICIT_GOALS.includes(p.goal) ? 'maintain' : p.goal;
}

export function blockText(b: DeficitBlock): string | null {
  if (b === 'minor') return t('מתחת לגיל 18 המאמן לא מתכנן ירידה במשקל. אפשר לעבוד על כוח, כושר והרגלי אוכל טובים.', 'Under 18 the coach does not plan weight loss. You can work on strength, fitness and good eating habits.');
  if (b === 'underweight') return t('לפי הגובה והמשקל שלך, ירידה במשקל לא מומלצת. המאמן יעבוד איתך על כוח, אוכל מלא והרגלים.', 'By your height and weight, losing weight is not recommended. The coach will work with you on strength, whole food and habits.');
  return null;
}
