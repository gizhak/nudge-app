// "I am actually at...": he corrects where the coach thinks he is. The change runs through the
// coach like any arrival or leave (a gym stay counts, the arrival message comes), and the
// networks seen here are taught to that place, so next time it is recognized by itself.
import { runCoach } from './engine';
import { loadPlaceState, PlaceId } from './store';
import { teachHere } from './wifi';

export async function setPlaceByHand(to: PlaceId | null): Promise<void> {
  const st = await loadPlaceState();
  const from = st.place;
  if (from === to) return;
  if (from) await runCoach({ type: 'exit', place: from, via: 'ידני' }).catch(() => []);
  if (to) {
    await teachHere(to).catch(() => undefined);
    await runCoach({ type: 'enter', place: to, via: 'ידני' }).catch(() => []);
  }
}
