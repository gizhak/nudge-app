// Pure: where tapping a notification takes him. The place where the missing thing gets fixed.

export type RouteTab = 'today' | 'train' | 'food' | 'progress' | 'settings';

export interface Route {
  tab: RouteTab;
  /** Open the weight field with the keyboard up */
  focus?: 'weigh' | 'checkpoint' | 'report' | 'run' | 'craving' | 'workout' | 'waist';
  /** Something outside the tabs */
  open?: 'readiness' | 'activityApp';
}

const base = (topic: string) => topic.split('@')[0];

export function routeFor(topic: string | undefined | null): Route {
  if (!topic) return { tab: 'today' };
  const t = base(topic);
  if (t === 'weigh_in' || t === 'weigh_reminder') return { tab: 'progress', focus: 'weigh' };
  if (t === 'weekly_summary' || t === 'weekly_report') return { tab: 'progress', focus: 'report' };
  if (t === 'weigh_tomorrow') return { tab: 'progress' };
  if (t === 'checkpoint_due') return { tab: 'progress', focus: 'checkpoint' };
  if (t === 'waist_week') return { tab: 'progress', focus: 'waist' };
  if (t === 'run') return { tab: 'train', focus: 'run' };
  // A missed workout opens today's workout: done, another hour, another day
  if (t === 'missed_workout') return { tab: 'train', focus: 'workout' };
  if (t === 'craving_evening') return { tab: 'food', focus: 'craving' };
  if (t === 'hc_broken') return { tab: 'today', open: 'readiness' };
  if (t === 'sync_steps' || t === 'sync_sleep') return { tab: 'today', open: 'activityApp' };
  if (/^(workout_|missed_workout|week_behind|long_break|outing_workout|home_before_workout|gym_arrive)/.test(t)) return { tab: 'train' };
  if (/^(meal_|food_none|protein_evening|leave_office_protein|pre_workout_snack|evening_|weekend_guard|outing_prep)/.test(t)) return { tab: 'food' };
  return { tab: 'today' };
}
