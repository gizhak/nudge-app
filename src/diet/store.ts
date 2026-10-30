// The saved menu, the targets it sets, and how each meal of the day compares to it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyDerived, derive } from '../profile/derive';
import { loadProfile, saveProfile } from '../profile/profile';
import type { SlotId } from '../nutrition/meals';
import { DietMenu, mealKcal, mealProtein, MenuMeal, menuTotals } from './parse';

import { t as tr } from '../i18n';
const KEY = 'diet.menu.v1';

export async function loadMenu(): Promise<DietMenu | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
  } catch {
    return null;
  }
}

/** Saves the menu and makes its totals the day's calories and protein */
export async function saveMenu(menu: DietMenu) {
  await AsyncStorage.setItem(KEY, JSON.stringify(menu));
  const t = menuTotals(menu);
  const profile = await loadProfile();
  const next = { ...profile, menuTargets: { kcal: t.kcal, protein: t.protein } };
  await saveProfile(next);
  applyDerived(derive(next));
}

/** Back to the app's own targets */
export async function clearMenu() {
  await AsyncStorage.removeItem(KEY);
  const profile = await loadProfile();
  const { menuTargets: _drop, ...rest } = profile;
  await saveProfile(rest);
  applyDerived(derive(rest));
}

export const menuMealOf = (menu: DietMenu | null, slot: SlotId): MenuMeal | undefined => menu?.meals.find((m) => m.slot === slot);

export interface MealCheck {
  chip: string;
  tone: 'good' | 'off' | 'later' | 'none';
  /** What the menu says, short */
  plan: string;
}

/** A meal against its menu meal: on plan, off by how much, skipped, or still to come */
export function checkMeal(m: MenuMeal, eaten: { kcal: number; protein: number; count: number }, state: 'past' | 'now' | 'future'): MealCheck {
  const plan = m.items.map((x) => x.text.split(/\s+או\s+/)[0]).join(', ');
  const kcal = mealKcal(m);
  const protein = mealProtein(m);
  if (!eaten.count) return state === 'past' ? { chip: tr('לא נרשמה', 'Not logged'), tone: 'off', plan } : { chip: tr('בהמשך', 'Later'), tone: 'later', plan };
  const over = eaten.kcal - kcal;
  if (over > Math.max(120, kcal * 0.25)) return { chip: tr(`${Math.round(over)} מעל`, `${Math.round(over)} over`), tone: 'off', plan };
  if (protein >= 10 && eaten.protein < protein * 0.75) return { chip: tr(`חסרים ${Math.round(protein - eaten.protein)} ג' חלבון`, `${Math.round(protein - eaten.protein)} g protein missing`), tone: 'off', plan };
  if (state === 'past' && eaten.kcal < kcal * 0.5) return { chip: tr('פחות מהתפריט', 'Less than the menu'), tone: 'off', plan };
  return { chip: tr('לפי התפריט', 'By the menu'), tone: 'good', plan };
}
