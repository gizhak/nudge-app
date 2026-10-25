// Wi-Fi places: arriving and leaving by the networks around the phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wifiNow } from '../../modules/night-guard';
import { gymGuess, matchPlace, Net, teach, WifiPrints } from './wifiMatch';
import { loadPendingExits, loadPlaceState, PlaceId, savePendingExits } from './store';

const PRINTS = 'wifi.prints.v1';
const LAST = 'wifi.last.v1';
const GUESS = 'wifi.guess.v1';
const LOST = 'wifi.lost.v1';

/** A place whose Wi-Fi stopped being seen, and since when: the sharpest sign of leaving it */
export async function loadWifiLost(): Promise<{ place: PlaceId; at: number } | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOST)) ?? 'null');
  } catch {
    return null;
  }
}
export async function clearWifiLost(): Promise<void> {
  await AsyncStorage.removeItem(LOST).catch(() => undefined);
}
/** Networks he said are not his gym: never asked about again */
const NOT_GYM = 'wifi.notGym.v1';

export async function loadNotGym(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(NOT_GYM)) ?? '[]');
  } catch {
    return [];
  }
}

export async function loadPrints(): Promise<WifiPrints> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PRINTS)) ?? '{}');
  } catch {
    return {};
  }
}
const savePrints = (p: WifiPrints) => AsyncStorage.setItem(PRINTS, JSON.stringify(p));

/** "This is the network of this place": saves what the phone sees right now. */
export async function teachHere(place: PlaceId): Promise<{ ok: boolean; reason?: string; names: string[] }> {
  const w = wifiNow(true);
  if (!w.ok) return { ok: false, reason: w.reason, names: [] };
  const prints = await loadPrints();
  prints[place] = teach(prints[place], w.connected, w.nearby);
  await savePrints(prints);
  await AsyncStorage.removeItem(GUESS);
  return { ok: true, names: namesOf(prints[place]!, [w.connected ?? null, ...w.nearby].filter(Boolean) as Net[]) };
}

/** Adds or removes one network seen now, picked from the list. */
export async function toggleNet(place: PlaceId, n: Net) {
  const prints = await loadPrints();
  const p = prints[place] ?? { ssids: [], bssids: [] };
  if (p.bssids.includes(n.bssid)) {
    p.bssids = p.bssids.filter((b) => b !== n.bssid);
    if (n.ssid) p.ssids = p.ssids.filter((s) => s !== n.ssid);
  } else {
    p.bssids = [...p.bssids, n.bssid];
  }
  prints[place] = p;
  await savePrints(prints);
}

export async function forgetWifi(place: PlaceId) {
  const prints = await loadPrints();
  delete prints[place];
  await savePrints(prints);
}

/** Names to show for a place: saved names, plus names of saved routers the phone sees now. */
export function namesOf(p: { ssids: string[]; bssids: string[] }, seen: Net[]): string[] {
  const names = new Set(p.ssids);
  for (const n of seen) if (n.ssid && p.bssids.includes(n.bssid)) names.add(n.ssid);
  return [...names];
}

export interface Guess {
  ssid: string;
  bssids: string[];
  at: number;
}

export async function loadGuess(now = Date.now()): Promise<Guess | null> {
  try {
    const g: Guess | null = JSON.parse((await AsyncStorage.getItem(GUESS)) ?? 'null');
    return g && now - g.at < 30 * 60000 ? g : null;
  } catch {
    return null;
  }
}

/** "Yes, this is my gym": the guessed networks become the gym's. */
export async function acceptGuess(): Promise<boolean> {
  const g = await loadGuess();
  if (!g) return false;
  const prints = await loadPrints();
  const gym = prints.gym ?? { ssids: [], bssids: [] };
  prints.gym = { ssids: gym.ssids, bssids: [...new Set([...gym.bssids, ...g.bssids])] };
  await savePrints(prints);
  await AsyncStorage.removeItem(GUESS);
  return true;
}

export async function dropGuess() {
  await AsyncStorage.removeItem(GUESS);
}

/** "No, this is not my gym": that network is never guessed again */
export async function rejectGuess(): Promise<void> {
  // Even a guess older than its half hour: he is answering about that network
  const raw = await AsyncStorage.getItem(GUESS).catch(() => null);
  let ssid: string | null = null;
  try {
    ssid = raw ? JSON.parse(raw).ssid ?? null : null;
  } catch {
    ssid = null;
  }
  if (ssid) {
    const list = await loadNotGym();
    if (!list.includes(ssid)) await AsyncStorage.setItem(NOT_GYM, JSON.stringify([...list, ssid].slice(-50)));
  }
  await AsyncStorage.removeItem(GUESS);
}

/** Where the Wi-Fi says he is right now, or null. */
/**
 * Is the phone on the place's own network right now? Only the connected network counts: the list of
 * routers around can be minutes old (taken at home, read on the street). 'gone' only when the place's
 * network name is known and the phone's Wi-Fi is on; a place with no saved name is 'unknown'.
 */
export async function wifiAt(place: PlaceId): Promise<'here' | 'gone' | 'unknown'> {
  const w = wifiNow(false);
  if (!w.ok) return 'unknown';
  const pr = (await loadPrints())[place];
  if (!pr) return 'unknown';
  const c = w.connected;
  if (c && (pr.bssids.includes(c.bssid) || (c.ssid && pr.ssids.includes(c.ssid)))) return 'here';
  return pr.ssids.length ? 'gone' : 'unknown';
}

/**
 * Learns the network the phone is connected to as the place's own, once the place is sure (a long stay,
 * a precise location inside it). Without this, home was known only by location, and a walk 70 m away
 * looked like home.
 */
export async function learnConnected(place: PlaceId): Promise<boolean> {
  const w = wifiNow(false);
  const c = w.ok ? w.connected : null;
  if (!c?.ssid) return false;
  const prints = await loadPrints();
  const pr = prints[place] ?? { ssids: [], bssids: [] };
  if (pr.ssids.includes(c.ssid) && pr.bssids.includes(c.bssid)) return false;
  // A network already saved for another place is not this one's
  if (Object.entries(prints).some(([k, v]) => k !== place && v && (v.ssids.includes(c.ssid!) || v.bssids.includes(c.bssid)))) return false;
  prints[place] = { ssids: [...new Set([...pr.ssids, c.ssid])], bssids: [...new Set([...pr.bssids, c.bssid])].slice(-40) };
  await savePrints(prints);
  return true;
}

export async function wifiPlaceNow(): Promise<PlaceId | null> {
  const w = wifiNow(false);
  if (!w.ok) return null;
  // Connected network only: the nearby list can be a scan from minutes ago, somewhere else
  return matchPlace(w.connected, [], await loadPrints())?.place ?? null;
}

/**
 * Looks at the Wi-Fi and turns a change into a place event: a new place is an arrival at once,
 * a place no longer seen is a leave that still has to be confirmed (a router restarting is not leaving).
 * Returns the arrival, if any, for the caller to run the coach with.
 */
export async function wifiCheck(now = Date.now()): Promise<{ type: 'enter'; place: PlaceId; via: string } | null> {
  const w = wifiNow(true);
  if (!w.ok) return null;
  const prints = await loadPrints();
  const hit = matchPlace(w.connected, w.nearby, prints);
  let last: { place: PlaceId | null; at: number } = { place: null, at: 0 };
  try {
    last = JSON.parse((await AsyncStorage.getItem(LAST)) ?? 'null') ?? last;
  } catch {
    // first time
  }
  await AsyncStorage.setItem(LAST, JSON.stringify({ place: hit?.place ?? null, at: now }));

  // A gym-looking network, strong, not saved yet: ask once
  if (!hit) {
    const g = gymGuess(w.nearby, prints, await loadNotGym());
    if (g?.ssid && !(await loadGuess(now))) {
      const sameName = w.nearby.filter((n) => n.ssid === g.ssid && n.rssi >= -75).map((n) => n.bssid);
      await AsyncStorage.setItem(GUESS, JSON.stringify({ ssid: g.ssid, bssids: sameName, at: now }));
    }
  }

  const pending = await loadPendingExits();
  if (last.place && last.place !== hit?.place) {
    const state = await loadPlaceState();
    if (state.place === last.place && !pending[last.place]) {
      pending[last.place] = now;
      await savePendingExits(pending);
    }
    if (state.place === last.place) await AsyncStorage.setItem(LOST, JSON.stringify({ place: last.place, at: now }));
  }
  if (!hit) return null;
  const lost = await loadWifiLost();
  if (lost?.place === hit.place) await clearWifiLost();
  if (pending[hit.place]) {
    // Back before the leave was confirmed: nothing happened
    delete pending[hit.place];
    await savePendingExits(pending);
  }
  const state = await loadPlaceState();
  return state.place === hit.place ? null : { type: 'enter', place: hit.place, via: 'Wi-Fi' };
}
