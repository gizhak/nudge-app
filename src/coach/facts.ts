// What the data says right now about each task, built the same way for the background
// coach and for the screens.
import { slotOf } from '../nutrition/meals';
import { waterExpectedByNow } from '../nutrition/water';
import type { Facts } from './followup';
import type { Situation } from './situation';

export function factsFrom(
  sit: Situation,
  now: Date,
  prefs: { wakeTime: number; bedTime: number },
  unlogged: string[] = [],
  gymToday = false,
): Facts {
  return {
    weighedToday: sit.hcOk ? sit.weighedToday : undefined,
    waterMl: sit.waterMl,
    waterExpected: waterExpectedByNow(sit.waterTarget, now.getHours() * 60 + now.getMinutes(), prefs.wakeTime, prefs.bedTime),
    mealSlotsDone: [...sit.meals.map((x) => slotOf(x.time)), ...unlogged],
    workedOutToday: sit.workedOutToday || gymToday,
    stepsFresh: !!sit.lastStepsAt && now.getTime() - sit.lastStepsAt.getTime() < 4 * 3600 * 1000,
    sleepKnown: sit.today ? sit.today.sleepMinutes !== null : undefined,
    hcOk: sit.hcOk,
    meals: sit.meals.length,
  };
}
