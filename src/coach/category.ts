import { baseId } from './rules';

/** Which buttons a message gets. Repeating nags get "got it"; water also "I drank". */
export function categoryFor(id: string): string | undefined {
  const base = baseId(id);
  if (base === 'go_to_sleep') return 'night';
  if (base === 'wifi_guess') return 'gym_guess';
  if (base === 'water' || base === 'water_morning') return 'water';
  if (/^meal_reminder_/.test(base)) return 'meal';
  if (base === 'workout_today' || base === 'workout_now' || base === 'outing_workout' || base === 'missed_workout') return 'workout';
  if (/^(meal|status)_\d+$/.test(id)) return undefined; // feedback, nothing to silence
  return 'nag';
}

