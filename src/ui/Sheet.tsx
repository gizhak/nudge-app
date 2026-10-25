import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Keyboard, Modal, PanResponder, PanResponderGestureState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, T } from './theme';

const SCREEN = Dimensions.get('window').height;
const HALF = SCREEN * 0.55;
const FULL = SCREEN * 0.88;
const OPEN_MS = 380;
const CLOSE_MS = 240;
/** Extra panel below the screen edge, so pulling past the top never shows a gap */
const OVER = 60;

/**
 * A drawer from the bottom, opened like a curtain. It opens to the height of its content,
 * at most about half the screen. Drag the handle up to spread it out (never past what the
 * content needs). Swipe down to close, from the handle or from anywhere on the content
 * when it is scrolled to the top. Longer content scrolls inside.
 *
 * Movement is a translate on the native driver: smooth even while the JS thread is busy.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [contentH, setContentH] = useState<number | null>(null);
  const [atFull, setAtFull] = useState(false);
  const gripH = useRef(56);
  const scrollY = useRef(0);
  const start = useRef(0);
  const opened = useRef(false);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // What the content needs, and the two resting heights
  const natural = contentH === null ? null : gripH.current + contentH + 24;
  const half = natural === null ? HALF : Math.min(natural, HALF);
  const full = natural === null ? FULL : Math.min(natural, FULL);
  const panelH = full;
  // Offset down from fully shown: 0 shows the whole panel, panelH hides it
  const y = useRef(new Animated.Value(SCREEN)).current;
  const g = useRef({ half, full, panelH });
  g.current = { half, full, panelH };

  const offsetFor = (visible: number) => g.current.panelH - visible;

  // The keyboard covers the bottom of the screen and the drawer with it: lift the drawer above it.
  // When the window itself shrank for the keyboard, only the part it did not cover.
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!mounted) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const shrunk = Math.max(0, SCREEN - Dimensions.get('window').height);
      const by = Math.max(0, e.endCoordinates.height - shrunk);
      Animated.timing(lift, { toValue: -by, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(lift, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
    return () => {
      show.remove();
      hide.remove();
      lift.setValue(0);
    };
  }, [mounted]);

  const settle = (visible: number, vy = 0) => {
    setAtFull(visible > g.current.half + 1);
    Animated.spring(y, { toValue: offsetFor(visible), velocity: vy, damping: 26, stiffness: 260, mass: 0.9, useNativeDriver: true }).start();
  };

  const hideThen = (done: () => void) => {
    closing.current = true;
    Animated.timing(y, { toValue: g.current.panelH + OVER, duration: CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(done);
  };

  const close = () => {
    if (closing.current) return;
    hideThen(() => {
      setMounted(false);
      onCloseRef.current();
    });
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      opened.current = false;
      closing.current = false;
      setContentH(null);
      setAtFull(false);
      scrollY.current = 0;
      y.setValue(SCREEN);
    } else if (mounted && !closing.current) {
      hideThen(() => setMounted(false));
    }
  }, [open]);

  // Open once the content is measured, to exactly what it needs (up to half the screen)
  useEffect(() => {
    if (open && mounted && contentH !== null && !opened.current) {
      opened.current = true;
      y.setValue(panelH + OVER);
      Animated.timing(y, { toValue: offsetFor(half), duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [contentH, mounted, open]);

  // Content that loads after opening (the journal, for example): stay at the same resting place
  useEffect(() => {
    if (!opened.current || !open || closing.current) return;
    settle(atFull ? full : half);
  }, [half, full]);

  const onGrant = () => {
    y.stopAnimation((v) => (start.current = v));
  };
  const onMove = (_: unknown, gs: PanResponderGestureState) => {
    const want = start.current + gs.dy;
    // Past what the content needs it gives a little, like a curtain at the end of its rail
    y.setValue(want >= 0 ? want : -Math.min(OVER - 10, -want * 0.25));
  };
  const onRelease = (_: unknown, gs: PanResponderGestureState) => {
    const { half: hf, full: fl, panelH: ph } = g.current;
    const visible = ph - (start.current + gs.dy);
    const flickDown = gs.vy > 0.45 && gs.dy > 12;
    if (flickDown || visible < hf - Math.min(110, hf * 0.3)) return close();
    const up = fl > hf + 20 && (gs.vy < -0.45 || visible > (hf + fl) / 2);
    settle(up ? fl : hf, gs.vy);
  };

  // The handle: drag either way
  const gripPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 2,
      onPanResponderGrant: onGrant,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
      onPanResponderTerminate: onRelease,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // The content: a clear downward swipe while scrolled to the top moves the drawer.
  // Taps and scrolling are left alone.
  const bodyPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gs) => scrollY.current <= 0 && gs.dy > 8 && gs.dy > Math.abs(gs.dx) * 1.5,
      onPanResponderGrant: onGrant,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
      onPanResponderTerminate: onRelease,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  if (!mounted) return null;

  const backdrop = y.interpolate({ inputRange: [Math.max(0, panelH - half), panelH + 1], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View style={[s.panel, { height: panelH + OVER, bottom: -OVER, transform: [{ translateY: Animated.add(y, lift) }] }]}>
        <View {...gripPan.panHandlers} style={s.grip} onLayout={(e) => (gripH.current = e.nativeEvent.layout.height)}>
          <View style={s.handle} />
          {title ? <Text style={[T.bold, s.title]}>{title}</Text> : null}
        </View>
        <View style={{ flex: 1, marginBottom: OVER }} {...bodyPan.panHandlers}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
            overScrollMode="never"
          >
            <View style={s.inner} onLayout={(e) => setContentH(e.nativeEvent.layout.height + 24)}>
              {children}
            </View>
            {/* At the half position the bottom of the panel is below the screen: room to scroll to the end */}
            {!atFull && full > half + 1 ? <View style={{ height: full - half }} /> : null}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(17,17,17,0.35)' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  grip: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 10, gap: 10 },
  handle: { alignSelf: 'center', width: 52, height: 6, borderRadius: 3, backgroundColor: C.muted, opacity: 0.45 },
  title: { fontSize: 18 },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  inner: { gap: 12 },
});
