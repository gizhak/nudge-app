// Coach messages he has not seen yet: everything sent since he last opened the chat.
// The chat tab shows the count and swings once when it grows.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadLog } from './store';

const SEEN = 'chat.seenAt.v1';

export async function loadSeenAt(): Promise<number> {
  try {
    return Number((await AsyncStorage.getItem(SEEN)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Opening the chat: everything until now is seen. Returns when it was last seen before, to mark what is new. */
export async function markSeen(now = Date.now()): Promise<number> {
  const before = await loadSeenAt();
  await AsyncStorage.setItem(SEEN, String(now)).catch(() => undefined);
  return before;
}

/** How many messages came after the last look at the chat; the first run counts only today's */
export async function unreadCount(now = Date.now()): Promise<number> {
  const seen = await loadSeenAt();
  const day0 = new Date(now);
  day0.setHours(0, 0, 0, 0);
  const since = Math.max(seen, seen ? 0 : day0.getTime());
  return (await loadLog()).filter((m) => m.at > since && m.at <= now).length;
}
