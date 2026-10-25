// Going out tonight: what is planned, when, and what the coach says about it. Pure.

export type OutingKind = 'restaurant' | 'bar' | 'party' | 'family' | 'event' | 'other';

export interface OutingPlan {
  /** Minutes after midnight */
  leaveAt: number;
  /** Minutes after midnight; before noon means after midnight */
  returnAt: number;
  kind: OutingKind;
}

export const OUTING_KINDS: { key: OutingKind; label: string }[] = [
  { key: 'restaurant', label: 'מסעדה' },
  { key: 'bar', label: 'בר' },
  { key: 'party', label: 'מסיבה' },
  { key: 'family', label: 'ארוחה משפחתית' },
  { key: 'event', label: 'אירוע או חתונה' },
  { key: 'other', label: 'משהו אחר' },
];

export const OUTING_LABEL = Object.fromEntries(OUTING_KINDS.map((k) => [k.key, k.label])) as Record<OutingKind, string>;

/** What to do about food and drink, by kind of evening. */
export const OUTING_TIP: Record<OutingKind, string> = {
  restaurant: 'משהו קטן עם חלבון לפני, כדי לא להגיע רעב. במסעדה, שלח לי את התפריט ואגיד מה להזמין.',
  bar: 'עד שני משקאות, וכוס מים ביניהם. מנשנושי הבר, בוטנים עדיפים על צ\'יפס.',
  party: 'ארוחה עם חלבון לפני שיוצאים. כוס מים על כל משקה, ובסוף הלילה בלי פיצה ושווארמה.',
  family: 'צלחת אחת: חצי ירקות, רבע חלבון, רבע פחמימה. בלי סיבוב שני.',
  event: 'אל תגיע רעב. במזנון: חלבון וסלט, ומנה עיקרית אחת. מהקינוח, ביס אחד.',
  other: 'ארוחה עם חלבון לפני, ומים לאורך הערב.',
};

/** Minutes counted from the evening's midnight, so 00:30 after an evening is 24:30. */
export const nightMinutes = (m: number) => (m < 12 * 60 ? m + 1440 : m);

/** Sleep nags stay quiet until half an hour after the planned return. */
export const graceEnd = (p: OutingPlan) => nightMinutes(p.returnAt) + 30;

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
