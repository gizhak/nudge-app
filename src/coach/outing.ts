// Going out tonight: what is planned, when, and what the coach says about it. Pure.

import { t } from '../i18n';
export type OutingKind = 'restaurant' | 'bar' | 'party' | 'family' | 'event' | 'other';

export interface OutingPlan {
  /** Minutes after midnight */
  leaveAt: number;
  /** Minutes after midnight; before noon means after midnight */
  returnAt: number;
  kind: OutingKind;
}

export const OUTING_KINDS: { key: OutingKind; label: string }[] = [
  { key: 'restaurant', label: t('מסעדה', 'Restaurant') },
  { key: 'bar', label: t('בר', 'Bar') },
  { key: 'party', label: t('מסיבה', 'Party') },
  { key: 'family', label: t('ארוחה משפחתית', 'Family meal') },
  { key: 'event', label: t('אירוע או חתונה', 'Event or wedding') },
  { key: 'other', label: t('משהו אחר', 'Something else') },
];

export const OUTING_LABEL = Object.fromEntries(OUTING_KINDS.map((k) => [k.key, k.label])) as Record<OutingKind, string>;

/** What to do about food and drink, by kind of evening. */
export const OUTING_TIP: Record<OutingKind, string> = {
  restaurant: t('משהו קטן עם חלבון לפני, כדי לא להגיע רעב. במסעדה, שלח לי את התפריט ואגיד מה להזמין.', 'Something small with protein before, so you don\'t arrive hungry. At the restaurant, send me the menu and I will tell you what to order.'),
  bar: t('עד שני משקאות, וכוס מים ביניהם. מנשנושי הבר, בוטנים עדיפים על צ\'יפס.', 'Up to two drinks, and a glass of water between them. Of the bar snacks, peanuts beat fries.'),
  party: t('ארוחה עם חלבון לפני שיוצאים. כוס מים על כל משקה, ובסוף הלילה בלי פיצה ושווארמה.', 'A meal with protein before you go out. A glass of water for every drink, and at the end of the night no pizza or shawarma.'),
  family: t('צלחת אחת: חצי ירקות, רבע חלבון, רבע פחמימה. בלי סיבוב שני.', 'One plate: half vegetables, a quarter protein, a quarter carbs. No second round.'),
  event: t('אל תגיע רעב. במזנון: חלבון וסלט, ומנה עיקרית אחת. מהקינוח, ביס אחד.', 'Don\'t arrive hungry. At the buffet: protein and salad, and one main course. Of dessert, one bite.'),
  other: t('ארוחה עם חלבון לפני, ומים לאורך הערב.', 'A meal with protein before, and water through the evening.'),
};

/** Minutes counted from the evening's midnight, so 00:30 after an evening is 24:30. */
export const nightMinutes = (m: number) => (m < 12 * 60 ? m + 1440 : m);

/** Sleep nags stay quiet until half an hour after the planned return. */
export const graceEnd = (p: OutingPlan) => nightMinutes(p.returnAt) + 30;

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
