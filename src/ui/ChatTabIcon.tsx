// The chat tab: the coach's bubble with how many messages wait unseen, swinging once when the count grows.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, FONT } from './theme';

export default function ChatTabIcon({ on, name, count, ring }: { on: boolean; name: React.ComponentProps<typeof Ionicons>['name']; count: number; ring: number }) {
  const swing = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(count ? 1 : 0)).current;

  useEffect(() => {
    if (!ring) return;
    swing.setValue(0);
    const step = (to: number, ms: number) => Animated.timing(swing, { toValue: to, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    Animated.sequence([step(1, 110), step(-0.85, 150), step(0.6, 140), step(-0.4, 130), step(0.2, 120), step(0, 110)]).start();
  }, [ring, swing]);

  useEffect(() => {
    if (count > 0) {
      pop.setValue(0.4);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    } else pop.setValue(0);
  }, [count, pop]);

  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] });
  return (
    <View>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name={name} size={22} color={on ? '#fff' : count ? C.ink : C.muted} />
      </Animated.View>
      {count > 0 && (
        <Animated.View style={[s.badge, { transform: [{ scale: pop }] }]}>
          <Text style={s.num}>{count > 9 ? '9+' : count}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: C.signal,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: { color: '#fff', fontSize: 11, fontFamily: FONT.black, lineHeight: 13 },
});
