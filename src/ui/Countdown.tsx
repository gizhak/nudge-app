// Time left to the next workout, live, in a ring that closes as the time comes near.
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C, FONT } from './theme';
import { useGrow } from './tabEnter';

import { t as tr } from '../i18n';
const ACircle = Animated.createAnimatedComponent(Circle);
/** The ring counts the last 12 hours before the workout */
const WINDOW_MS = 12 * 3600_000;
const SIZE = 84;
const STROKE = 7;

const two = (n: number) => String(n).padStart(2, '0');

export function countdownText(ms: number): { big: string; small: string } {
  if (ms <= 0) return { big: tr('עכשיו', 'Now'), small: tr('זמן אימון', 'Workout time') };
  const mins = Math.floor(ms / 60_000);
  if (mins >= 24 * 60) {
    const days = Math.round(mins / (24 * 60));
    return { big: String(days), small: days === 1 ? tr('יום לאימון', 'day to workout') : tr('ימים לאימון', 'days to workout') };
  }
  // Hours as a number of hours: "12:52" reads like a clock time
  if (mins >= 3 * 60) return { big: String(Math.round(mins / 60)), small: tr('שעות לאימון', 'hours to workout') };
  if (mins >= 60) return { big: `${Math.floor(mins / 60)}:${two(mins % 60)}`, small: tr('שעות לאימון', 'hours to workout') };
  const secs = Math.floor(ms / 1000);
  return { big: `${Math.floor(secs / 60)}:${two(secs % 60)}`, small: tr('דקות לאימון', 'minutes to workout') };
}

export default function Countdown({ at }: { at: Date }) {
  const [now, setNow] = useState(Date.now());
  const left = at.getTime() - now;
  // Every second in the last hour, otherwise twice a minute
  const every = left < 3600_000 ? 1000 : 30_000;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);

  const passed = Math.max(0, Math.min(1, 1 - left / WINDOW_MS));
  const grow = useGrow(passed, { duration: 900, delay: 150 });
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const dash = grow.interpolate({ inputRange: [0, 1], outputRange: [`0 ${circ}`, `${circ} ${circ}`] });
  const t = countdownText(left);

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke="#3A3733" strokeWidth={STROKE} fill="none" />
        {passed > 0 && (
          <ACircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={C.signal}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={dash as any}
            transform={`translate(${SIZE} 0) scale(-1 1) rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.big}>{t.big}</Text>
        <Text style={s.small}>{t.small}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  big: { fontFamily: FONT.black, fontSize: 19, lineHeight: 22, color: '#fff', writingDirection: 'ltr' },
  small: { fontFamily: FONT.regular, fontSize: 10, color: '#B8B1A7' },
});
