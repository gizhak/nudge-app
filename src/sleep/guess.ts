// A first guess of a night the watch missed, from the phone: the longest stretch without an unlock
// between the evening and noon is the night. Without unlocks, the usual bed and wake times.
import { phoneUnlocks } from '../../modules/night-guard';
import { loadPlaceState, loadPrefs } from '../coach/store';

const H = 3600000;
const round5 = (t: number) => Math.round(t / 300000) * 300000;

export interface NightGuess {
  bed: number;
  wake: number;
  /** Where the guess came from, said to him so he knows how much to trust it */
  from: 'phone' | 'usual';
}

/** The night that ended on the morning of `morning` (any time that day) */
export async function guessNight(morning: number, unlocks = phoneUnlocks()): Promise<NightGuess> {
  const day = new Date(morning);
  day.setHours(0, 0, 0, 0);
  const d0 = day.getTime();
  const from = d0 - 4 * H; // 20:00 the evening before
  const to = d0 + 12 * H; // noon
  const xs = unlocks.filter((t) => t >= from && t <= to).sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap >= 3 * H && (!best || gap > best[1] - best[0])) best = [xs[i - 1], xs[i]];
  }
  if (best) return { bed: round5(best[0]), wake: round5(best[1]), from: 'phone' };

  const prefs = await loadPrefs();
  const bed = prefs.bedTime >= 12 * 60 ? d0 - (1440 - prefs.bedTime) * 60000 : d0 + prefs.bedTime * 60000;
  let wake = d0 + prefs.wakeTime * 60000;
  // Out of the house before the usual wake time: he was up by then
  const place = await loadPlaceState().catch(() => null);
  if (place && place.place !== 'home' && place.since > d0 + 4 * H && place.since < wake) wake = place.since;
  return { bed: round5(bed), wake: round5(wake), from: 'usual' };
}
