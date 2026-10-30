// The settings gear, on top of every screen. The app supplies what it opens.
import { createContext, useContext } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './theme';

import { t } from '../i18n';
export const GearContext = createContext<(() => void) | null>(null);

export function Gear() {
  const open = useContext(GearContext);
  if (!open) return null;
  return (
    <Pressable onPress={open} style={({ pressed }) => [s.gear, pressed && { opacity: 0.7 }]} accessibilityLabel={t("הגדרות", 'Settings')} hitSlop={6}>
      <Ionicons name="settings-outline" size={20} color={C.ink} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  gear: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
});
