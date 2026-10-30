import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, FONT, T } from './theme';

import { ROW, START, t as tr } from '../i18n';
export function Choice<K extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  /** undefined: not answered yet, nothing selected */
  value: K | undefined;
  onChange: (k: K) => void;
}) {
  return (
    <View style={s.wrap}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={String(o.key)} onPress={() => onChange(o.key)} style={[s.chip, on && s.chipOn]}>
            <Text style={[T.bold, s.chipText, { color: on ? '#fff' : C.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Multi<K extends string>({
  options,
  values,
  onChange,
}: {
  options: { key: K; label: string }[];
  values: K[];
  onChange: (v: K[]) => void;
}) {
  return (
    <View style={s.wrap}>
      {options.map((o) => {
        const on = values.includes(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(on ? values.filter((v) => v !== o.key) : [...values, o.key])}
            style={[s.chip, on && s.chipOn]}
          >
            <Text style={[T.bold, s.chipText, { color: on ? '#fff' : C.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NumberField({
  label,
  unit,
  value,
  onChange,
  optional,
  error,
  onLayoutY,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  optional?: boolean;
  /** Shown right under the field, with a red edge on the box */
  error?: string | null;
  /** Where the field sits in its scroll view, to scroll to it on an error */
  onLayoutY?: (y: number) => void;
}) {
  return (
    <View style={s.field} onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}>
      <Text style={[T.bold, s.label]}>
        {label}
        {optional ? <Text style={T.muted}> {tr('(לא חובה)', '(optional)')}</Text> : null}
      </Text>
      <View style={s.numRow}>
        <TextInput
          value={value === undefined || value === 0 ? '' : String(value)}
          onChangeText={(t) => {
            const clean = t.replace(',', '.').replace(/[^0-9.]/g, '');
            onChange(clean === '' ? undefined : Number(clean));
          }}
          keyboardType="decimal-pad"
          style={[s.num, error ? { borderWidth: 1.5, borderColor: C.bad } : null]}
        />
        <Text style={[T.muted, { fontSize: 15 }]}>{unit}</Text>
      </View>
      {error ? <Text style={[T.bold, { color: C.bad, fontSize: 14 }]}>{error}</Text> : null}
    </View>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function TimeStepper({ value, onChange, step = 15 }: { value: number; onChange: (m: number) => void; step?: number }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={() => onChange((value + step) % 1440)} style={s.stepBtn} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 18 }]}>+</Text>
      </Pressable>
      <Text style={[T.bold, { fontSize: 17, minWidth: 56, textAlign: 'center' }]}>{hhmm(value)}</Text>
      <Pressable onPress={() => onChange((value - step + 1440) % 1440)} style={s.stepBtn} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 18 }]}>−</Text>
      </Pressable>
    </View>
  );
}

/** Free text in his own words. */
export function TextField({ value, onChange, placeholder }: { value: string | undefined; onChange: (t: string) => void; placeholder?: string }) {
  return (
    <TextInput
      value={value ?? ''}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.muted}
      multiline
      style={[s.num, { width: '100%', textAlign: START, fontSize: 16, minHeight: 56, paddingHorizontal: 12 }]}
    />
  );
}

export function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[T.bold, s.label]}>{title}</Text>
      {hint ? <Text style={[T.muted, { fontSize: 13 }]}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: C.track, backgroundColor: C.card, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 15, textAlign: 'center' },
  field: { gap: 6 },
  label: { fontSize: 16 },
  numRow: { flexDirection: ROW, alignItems: 'center', gap: 10 },
  num: {
    width: 110,
    borderWidth: 1,
    borderColor: C.track,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingVertical: 10,
    fontSize: 18,
    textAlign: 'center',
    color: C.ink,
    fontFamily: FONT.regular,
  },
  stepper: { flexDirection: ROW, alignItems: 'center', gap: 6 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
});
