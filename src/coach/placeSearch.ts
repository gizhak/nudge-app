import * as Location from 'expo-location';

export interface PlaceResult {
  latitude: number;
  longitude: number;
  label: string;
  source: 'phone' | 'osm';
}

/** Meters between two points (equirectangular approximation, fine at city scale). */
function distance(a: PlaceResult, b: PlaceResult) {
  const k = Math.PI / 180;
  const x = (b.longitude - a.longitude) * k * Math.cos(((a.latitude + b.latitude) / 2) * k);
  const y = (b.latitude - a.latitude) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

const shorten = (displayName: string) => displayName.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3).join(', ');

/** OpenStreetMap search: understands business and place names, free, no key. One request per search. */
async function searchOsm(query: string): Promise<PlaceResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=he&countrycodes=il&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'User-Agent': 'CoachApp/0.1 (personal fitness app)' } });
  if (!res.ok) return [];
  const rows: any[] = await res.json();
  return rows.map((r) => ({
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    label: shorten(r.display_name ?? ''),
    source: 'osm' as const,
  }));
}

async function searchPhone(query: string, describe: (lat: number, lon: number) => Promise<string>): Promise<PlaceResult[]> {
  const hits = await Location.geocodeAsync(query);
  return Promise.all(
    hits.slice(0, 3).map(async (h) => ({
      latitude: h.latitude,
      longitude: h.longitude,
      label: await describe(h.latitude, h.longitude),
      source: 'phone' as const,
    })),
  );
}

/** Searches both sources, drops near duplicates, keeps up to 6 results. */
export async function searchPlaces(
  query: string,
  describe: (lat: number, lon: number) => Promise<string>,
): Promise<PlaceResult[]> {
  const [osm, phone] = await Promise.all([
    searchOsm(query).catch(() => [] as PlaceResult[]),
    searchPhone(query, describe).catch(() => [] as PlaceResult[]),
  ]);
  const out: PlaceResult[] = [];
  for (const r of [...osm, ...phone]) {
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    if (out.some((o) => distance(o, r) < 60)) continue;
    out.push(r);
  }
  return out.slice(0, 6);
}
