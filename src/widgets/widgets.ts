// The home screen widgets: the app works out what they show and hands it over; the widgets only draw.
// Water: today's total and a button that logs a cup (written to Health Connect here, as soon as the
// app can run). Food: what is left today and the next meal, from the menu when there is one.
import { returnWidgetCups, setWidgetData, takeWidgetCups } from '../../modules/night-guard';
import { caloriesFor, GOALS } from '../config/goals';
import { readMeals } from '../health/history';
import { addWater } from '../health/water';
import { readSituation } from '../coach/situation';
import { loadPrefs, loadSkipped } from '../coach/store';
import { loadMenu, mealLeft, todayPicks } from '../diet/store';
import { checkMeal, swapMeals } from '../diet/store';
import { mealSlot } from '../diet/match';
import { pickedOption } from '../diet/parse';
import { SlotId, SLOTS, slotBudgets } from '../nutrition/meals';
import { CUP_ML } from '../nutrition/water';
import { loadProfile } from '../profile/profile';
import { ZEPP_PACKAGE } from '../apps/zepp';
import { RTL, t as tr } from '../i18n';

const num = (n: number) => Math.round(n).toLocaleString('en-US');
const hhmm = (m: number) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortTitle = (s: string) => s.replace(/^ארוחת\s+/, '');

/** "עוף או סלמון, ברוקולי, 100 גרם אורז": each item with its first alternative */
function planLine(items: { text: string; alts?: { text: string }[]; free?: boolean }[]): string {
  return items
    .filter((it) => !it.free)
    .map((it) => (it.alts?.[0] ? tr(`${it.text} או ${it.alts[0].text}`, `${it.text} or ${it.alts[0].text}`) : it.text))
    .join(', ');
}

async function foodPart(now: Date) {
  const meals = await readMeals(now).catch(() => []);
  const kcal = meals.reduce((a, m) => a + m.kcal, 0);
  const protein = meals.reduce((a, m) => a + m.protein, 0);
  const target = caloriesFor(now);
  const left = target - kcal;
  const proteinLeft = GOALS.proteinG - protein;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let nextLabel = '';
  let nextText = '';
  let isNow = false;
  const menu = await loadMenu().catch(() => null);
  if (menu) {
    const picks: Partial<Record<SlotId, number>> = await todayPicks(now).catch(() => ({}));
    const skipped: string[] = await loadSkipped().catch(() => [] as string[]);
    const times = meals.map((m) => m.time);
    const inside = menu.meals.find((m) => m.from != null && m.to != null && nowMin >= m.from && nowMin < m.to && !skipped.includes(m.slot));
    const ate = inside ? meals.filter((m) => mealSlot(menu, m.time, times) === inside.slot) : [];
    if (inside && inside.to != null) {
      isNow = true;
      nextLabel = tr(`עכשיו · ${shortTitle(inside.title)} עד ${hhmm(inside.to)}`, `Now · ${inside.title} until ${hhmm(inside.to)}`);
      const check = ate.length ? checkMeal(inside, { kcal: ate.reduce((a, m) => a + m.kcal, 0), protein: ate.reduce((a, m) => a + m.protein, 0), count: ate.length, names: ate.map((m) => m.name) }, 'now', picks[inside.slot], swapMeals(menu, inside.slot)) : null;
      const rest = check?.tone === 'good' ? mealLeft(inside, ate.map((m) => m.name), picks[inside.slot]) : null;
      nextText = !ate.length
        ? planLine(pickedOption(inside, picks[inside.slot]).items)
        : rest
          ? tr(`עוד אפשר: ${rest.short}`, `Still to eat: ${rest.short}`)
          : check?.chip ?? '';
    }
    if (!isNow) {
      const next = menu.meals.filter((m) => m.from != null && m.from > nowMin && !skipped.includes(m.slot)).sort((a, b) => a.from! - b.from!)[0];
      if (next) {
        nextLabel = tr(`הבאה · ${shortTitle(next.title)} ${hhmm(next.from!)}${next.to != null ? ` עד ${hhmm(next.to)}` : ''}`, `Next · ${next.title} ${hhmm(next.from!)}${next.to != null ? ` to ${hhmm(next.to)}` : ''}`);
        nextText = planLine(pickedOption(next, picks[next.slot]).items);
      } else nextLabel = tr('אין עוד ארוחות היום בתפריט', 'No more meals on the menu today');
    }
  } else {
    const prefs = await loadPrefs().catch(() => null);
    const slots = prefs?.mealSlots ?? ['breakfast', 'lunch', 'dinner'];
    const budgets = slotBudgets(target, slots);
    const next = SLOTS.filter((s) => slots.includes(s.id) && s.remindAt > nowMin).sort((a, b) => a.remindAt - b.remindAt)[0];
    if (next) {
      nextLabel = tr(`הבאה · ${shortTitle(next.label)} בסביבות ${hhmm(next.remindAt)}`, `Next · ${next.label} around ${hhmm(next.remindAt)}`);
      nextText = tr(`בערך ${num(budgets[next.id])} קל'`, `About ${num(budgets[next.id])} kcal`);
    } else nextLabel = tr('אין עוד ארוחות מתוכננות היום', 'No more meals planned today');
  }
  return {
    left: num(Math.abs(left)),
    leftSub: left >= 0 ? tr(`קלוריות נשארו מתוך ${num(target)}`, `calories left of ${num(target)}`) : tr(`קלוריות מעל היעד של ${num(target)}`, `calories over the ${num(target)} goal`),
    protein: proteinLeft > 0 ? tr(`${num(proteinLeft)} ג'`, `${num(proteinLeft)} g`) : '✓',
    proteinSub: proteinLeft > 0 ? tr('חלבון חסר', 'protein to go') : tr('חלבון ביעד', 'protein done'),
    nextLabel,
    nextText,
    now: isNow,
  };
}

let running: Promise<void> | null = null;
let again = false;

/** Works out what the widgets show and redraws them; calls that come while one runs are folded into one more */
export function pushWidgets(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      const now = new Date();
      const profile = await loadProfile().catch(() => null);
      const sit = await readSituation(now, profile?.weightKg ?? 80).catch(() => null);
      const food = await foodPart(now).catch(() => null);
      setWidgetData({
        day: dayKey(now),
        rtl: RTL,
        zeppPackage: ZEPP_PACKAGE,
        water: { ml: Math.round(sit?.waterMl ?? 0), targetMl: Math.round(sit?.waterTarget ?? 2500), cupMl: CUP_ML },
        food: food ?? {},
        text: {
          water: tr('מים', 'Water'),
          of: tr("מתוך %s ל'", 'of %s L'),
          addCup: tr('+ כוס', '+ Cup'),
          added: tr('נרשם, %s מ"ל', 'Logged, %s ml'),
          food: tr('אוכל היום', 'Food today'),
          zepp: tr('צלם ב Zepp', 'Snap in Zepp'),
          check: tr('בדוק', 'Check'),
          openApp: tr('פתח את Nudge לעדכון', 'Open Nudge to update'),
        },
      });
    } finally {
      running = null;
      if (again) {
        again = false;
        pushWidgets();
      }
    }
  })();
  return running;
}

/** Writes the cups tapped on the widget to Health Connect; what fails goes back to wait for the next run */
export async function flushWidgetCups(): Promise<number> {
  const n = takeWidgetCups();
  let done = 0;
  for (let i = 0; i < n; i++) {
    try {
      await addWater(CUP_ML, new Date());
      done++;
    } catch {
      break;
    }
  }
  returnWidgetCups(n - done);
  return done;
}

/** Both, in order: what the app runs when it wakes up for any reason */
export async function syncWidgets() {
  await flushWidgetCups().catch(() => 0);
  await pushWidgets().catch(() => undefined);
}
