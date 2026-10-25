// Pure: turns today's raw message log into a short, readable journal.
import type { SentMessage } from './store';

const baseOf = (id: string) => id.split('@')[0];
const isMeal = (id: string) => /^meal_\d+$/.test(id);
const isStatus = (id: string) => /^status_\d+$/.test(id);

export interface JournalEntry {
  key: string;
  title: string;
  body: string;
  at: number;
  /** How many times this topic was sent today */
  count: number;
  /** Food feedback: every meal message, newest first */
  items?: SentMessage[];
}

/**
 * One line per topic, newest first. A topic sent several times shows only its
 * latest message with a counter; all food feedback becomes one expandable line.
 */
export function journal(log: SentMessage[]): JournalEntry[] {
  const sorted = [...log].sort((a, b) => b.at - a.at);
  const groups = new Map<string, JournalEntry>();
  for (const m of sorted) {
    const key = isMeal(m.id) ? 'food' : isStatus(m.id) ? 'status' : baseOf(m.id);
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.items?.push(m);
      continue;
    }
    groups.set(key, { key, title: m.title, body: m.body, at: m.at, count: 1, items: key === 'food' ? [m] : undefined });
  }
  const out = [...groups.values()];
  for (const g of out) {
    if (g.key === 'food' && g.count > 1) {
      g.title = `אוכל: ${g.count} משובים`;
      g.body = `האחרון: ${g.items![0].body}`;
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The coach's latest nudge, if it is still fresh: shown on the "now" card. */
export function freshNudge(log: SentMessage[], now: Date, maxAgeMin = 60): SentMessage | null {
  const recent = log
    .filter((m) => !isMeal(m.id) && !isStatus(m.id) && now.getTime() - m.at <= maxAgeMin * 60000 && m.at <= now.getTime())
    .sort((a, b) => b.at - a.at);
  return recent[0] ?? null;
}
