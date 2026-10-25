// The car: while the phone is connected to it the coach stays silent, and the moment a
// drive ends it says what it held back. Connecting and disconnecting near a saved place
// count as leaving and arriving there, faster than location alone.
import * as Location from 'expo-location';
import { carState, takeCarEvents } from '../../modules/night-guard';
import { loadPlaces, PlaceId } from './store';

/** A "connected" that never got its disconnect must not silence the coach forever. */
const MAX_DRIVE_MS = 3 * 3600 * 1000;

export function isDriving(now = Date.now(), arrivedAt?: number): boolean {
  const s = carState();
  // Arrived somewhere after the car connected: the disconnect was missed, he is not driving
  if (arrivedAt && arrivedAt > s.since) return false;
  return !!s.address && s.connected && now - s.since < MAX_DRIVE_MS;
}

const R = 6371000;
function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The saved place the phone is at, with some slack for parking further away. */
/**
 * Where the phone is now, from a fresh fix: ok is false when no fix came (then nothing can be
 * concluded), place is null when the fix is far from every saved place.
 */
/**
 * Where the phone is now. With stillAt, first whether it is still at that place. tight: the place's Wi-Fi
 * is already gone, so the location only has to rule out the yard or the parking lot (70 m, at most 40 m slack)
 * instead of the usual circle, which is wide enough that a walk around the block still counted as home.
 */
export async function placeCheck(stillAt?: PlaceId | null, tight = false): Promise<{ ok: boolean; place: PlaceId | null; meters?: number; accuracy?: number }> {
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 20000)),
    ]);
    const acc = pos?.coords.accuracy ?? 0;
    if (!pos || acc > 150) return { ok: false, place: null, accuracy: acc || undefined };
    const places = await loadPlaces();
    // Still at the place he was at: inside its circle, with the fix's own error (at most 80 m) as slack.
    // Arriving elsewhere: the looser arrival rule, parking a little further away included.
    if (stillAt && places[stillAt]) {
      const p = places[stillAt]!;
      const d = meters(pos.coords, p);
      const limit = tight ? 70 + Math.min(acc, 40) : Math.max(p.radius, 120) + Math.min(acc, 80);
      if (d <= limit) return { ok: true, place: stillAt, meters: Math.round(d), accuracy: Math.round(acc) };
    }
    let best: { id: PlaceId; d: number } | null = null;
    for (const [id, p] of Object.entries(places) as [PlaceId, NonNullable<(typeof places)[PlaceId]>][]) {
      if (!p || id === stillAt) continue;
      const d = meters(pos.coords, p);
      if (d <= Math.max(p.radius, 150) + 250 && (!best || d < best.d)) best = { id, d };
    }
    const dStill = stillAt && places[stillAt] ? Math.round(meters(pos.coords, places[stillAt]!)) : undefined;
    return { ok: true, place: best?.id ?? null, meters: dStill, accuracy: Math.round(acc) };
  } catch {
    return { ok: false, place: null };
  }
}

export async function placeHere(): Promise<PlaceId | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 3 * 60 * 1000 });
    const pos =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((r) => setTimeout(() => r(null), 15000)),
      ]));
    if (!pos) return null;
    const places = await loadPlaces();
    let best: { id: PlaceId; d: number } | null = null;
    for (const [id, p] of Object.entries(places) as [PlaceId, NonNullable<(typeof places)[PlaceId]>][]) {
      if (!p) continue;
      const d = meters(pos.coords, p);
      if (d <= Math.max(p.radius, 150) + 250 && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  } catch {
    return null;
  }
}

/** Pending car events as place events: connect means leaving, disconnect means arriving. */
export async function carPlaceEvents(): Promise<{ type: 'enter' | 'exit'; place: PlaceId | null; at: number }[]> {
  const events = takeCarEvents();
  if (!events.length) return [];
  // Only the latest one has a meaningful location now; older ones are just state
  const place = await placeHere();
  return events.map((e, i) => ({
    type: e.type === 'connect' ? 'exit' : 'enter',
    place: i === events.length - 1 ? place : null,
    at: e.at,
  }));
}
