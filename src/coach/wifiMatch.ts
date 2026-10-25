// Pure: which saved place the Wi-Fi around the phone points to.
import type { PlaceId } from './store';

export interface Net {
  ssid: string | null;
  bssid: string;
  rssi: number;
}

export interface WifiPrint {
  /** Network names: the connected network matches by name (a mesh has many routers with one name) */
  ssids: string[];
  /** Routers seen strongly at the place */
  bssids: string[];
}

export type WifiPrints = Partial<Record<PlaceId, WifiPrint>>;

/** About "3 bars": strong enough to mean inside, not walking past. */
export const STRONG = -70;

const SPOTS: PlaceId[] = ['home', 'office', 'gym'];

/** The connected network decides first; otherwise a strong router seen before at a place. */
export function matchPlace(connected: Net | null | undefined, nearby: Net[], prints: WifiPrints): { place: PlaceId; how: 'connected' | 'nearby' } | null {
  if (connected) {
    for (const p of SPOTS) {
      const pr = prints[p];
      if (pr && (pr.bssids.includes(connected.bssid) || (connected.ssid && pr.ssids.includes(connected.ssid)))) return { place: p, how: 'connected' };
    }
  }
  let best: { place: PlaceId; rssi: number } | null = null;
  for (const n of nearby) {
    if (n.rssi < STRONG) continue;
    for (const p of SPOTS) {
      const pr = prints[p];
      if (pr && pr.bssids.includes(n.bssid) && (!best || n.rssi > best.rssi)) best = { place: p, rssi: n.rssi };
    }
  }
  return best ? { place: best.place, how: 'nearby' } : null;
}

/** What "this is the network here" saves: the connected network, and every strong router around. */
export function teach(print: WifiPrint | undefined, connected: Net | null | undefined, nearby: Net[]): WifiPrint {
  const ssids = new Set(print?.ssids ?? []);
  const bssids = new Set(print?.bssids ?? []);
  if (connected) {
    if (connected.ssid) ssids.add(connected.ssid);
    bssids.add(connected.bssid);
  }
  for (const n of nearby) if (n.rssi >= STRONG && n.bssid) bssids.add(n.bssid);
  return { ssids: [...ssids], bssids: [...bssids].slice(-40) };
}

// "studio" and a bare "fit" are left out: every design studio and outfit shop matched them
const GYM_WORDS = /(gym|fitness|sport|crossfit|holmes|pilates|כושר|ספורט|הולמס)/i;

/** A strong network whose name says gym, at a place not saved yet: worth asking once. */
export function gymGuess(nearby: Net[], prints: WifiPrints, notGym: string[] = []): Net | null {
  if (prints.gym?.bssids.length) return null;
  const known = new Set(Object.values(prints).flatMap((p) => p?.bssids ?? []));
  return (
    nearby
      .filter((n) => n.rssi >= STRONG && n.ssid && GYM_WORDS.test(n.ssid) && !known.has(n.bssid) && !notGym.includes(n.ssid))
      .sort((a, b) => b.rssi - a.rssi)[0] ?? null
  );
}

/** Signal strength as bars, 0 to 4, the way the phone shows it. */
export const bars = (rssi: number) => (rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -78 ? 2 : rssi >= -88 ? 1 : 0);
