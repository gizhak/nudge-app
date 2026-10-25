import { StyleSheet } from 'react-native';

export const C = {
  bg: '#F4F1EC',
  card: '#FFFFFF',
  ink: '#1B1A18',
  muted: '#6B655D',
  track: '#F1ECE4',
  /** Primary actions and "done" states: dark, no decoration */
  accent: '#1B1A18',
  /** The one warm color: what still needs doing, and the action that does it */
  signal: '#E8613C',
  protein: '#E8613C',
  /** Neutral data series */
  data: '#8C8780',
  warn: '#B45309',
  bad: '#E5401F',
  // One color per topic, used only on the data mark (a ring, a bar, an icon), never on surfaces
  kcal: '#C97F1B',
  water: '#2F6FB0',
  good: '#3E7A55',
  sleep: '#5B5BA8',
};

// Hebrew font bundled with the app (see expo-font in app.json). System fonts on some phones
// have no real bold weight: Android fakes it but measures the regular width, which clips
// the end of bold Hebrew text. A real bold face, and no fontWeight, avoids that.
export const FONT = { regular: 'Heebo_400Regular', bold: 'Heebo_700Bold', black: 'Heebo_800ExtraBold' };

export const T = StyleSheet.create({
  base: { color: C.ink, textAlign: 'right', fontFamily: FONT.regular },
  bold: { color: C.ink, textAlign: 'right', fontFamily: FONT.bold },
  muted: { color: C.muted, textAlign: 'right', fontFamily: FONT.regular },
});

export const fmt = (n: number, digits = 0) => n.toLocaleString('he-IL', { maximumFractionDigits: digits });
