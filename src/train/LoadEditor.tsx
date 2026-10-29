// "המשקל שלי" in the exercise window: the weight he lifts in this move, set once.
// Kilograms or pounds per move; a barbell's total includes the bar, with what goes on each side.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, FONT, T } from "../ui/theme";
import {
  BARS,
  kindOf,
  Load,
  loadKey,
  loadText,
  perSide,
  setLoad,
  startLoad,
  stepOf,
  Unit,
} from "./loads";

import { ROW, SIDE_END, t } from '../i18n';
type Draft = Pick<Load, "kind" | "unit" | "value" | "bar">;

const HINT: Record<Load["kind"], string> = {
  barbell: t("המשקל הכולל, כולל המוט", 'The total weight, the bar included'),
  dumbbell: t("המשקל של משקולת אחת", 'The weight of one dumbbell'),
  machine: t("המשקל שמופיע על המכונה, בפלטה שהפין נמצא בה", 'The weight shown on the machine, on the plate the pin is in'),
  body: t("רק המשקל שמוסיפים. 0 זה משקל גוף בלבד", 'Only the weight you add. 0 is bodyweight alone'),
};

const toUnit = (v: number, from: Unit, to: Unit) => {
  if (from === to) return v;
  return to === "lb"
    ? Math.round((v * 2.2046) / 5) * 5
    : Math.round(v / 2.2046 / 2.5) * 2.5;
};

export default function LoadEditor({
  name,
  load,
  onSaved,
  onEditing,
}: {
  name: string;
  load: Load | undefined;
  onSaved: () => void;
  onEditing?: (on: boolean) => void;
}) {
  const kind = kindOf(name);
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState<Draft | null>(null);

  useEffect(() => {
    setEdit(false);
    setD(null);
  }, [name]);
  useEffect(() => {
    onEditing?.(edit);
  }, [edit, onEditing]);

  if (!kind) return null;
  const open = () => {
    setD(
      load
        ? { kind: load.kind, unit: load.unit, value: load.value, bar: load.bar }
        : startLoad(kind),
    );
    setEdit(true);
  };

  if (!edit || !d) {
    return (
      <Pressable
        onPress={open}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      >
        <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>
          {t('המשקל שלי', 'My weight')}
        </Text>
        <View style={{ flex: 1, alignItems: SIDE_END }}>
          {load ? (
            <>
              <Text style={[T.bold, { fontSize: 17 }]}>{loadText(load)}</Text>
              {load.kind === "barbell" && (
                <Text style={[T.muted, { fontSize: 12 }]}>{perSide(load)}</Text>
              )}
            </>
          ) : (
            <Text style={[T.bold, { fontSize: 15, color: C.signal }]}>
              {t('להגדיר', 'Set')}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  const step = stepOf(d.kind, d.unit);
  const setUnit = (u: Unit) =>
    setD({
      ...d,
      unit: u,
      value: toUnit(d.value, d.unit, u),
      bar:
        d.kind === "barbell"
          ? (BARS[u][BARS[d.unit].indexOf(d.bar ?? BARS[d.unit][0])] ??
            BARS[u][0])
          : undefined,
    });
  const add = (n: number) => {
    const v = Math.round((d.value + n) * 10) / 10;
    const min =
      d.kind === "body" ? 0 : d.kind === "barbell" ? (d.bar ?? 0) : step;
    setD({ ...d, value: Math.max(min, v) });
  };
  const save = async () => {
    await setLoad(loadKey(name), d);
    setEdit(false);
    onSaved();
  };

  return (
    <View style={s.panel}>
      <Text style={[T.bold, { fontSize: 14 }]}>{t('המשקל שלי', 'My weight')}</Text>
      <View style={s.seg}>
        {(["kg", "lb"] as Unit[]).map((u) => (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={[s.segBtn, d.unit === u && s.segOn]}
          >
            <Text
              style={[
                T.bold,
                { fontSize: 13, color: d.unit === u ? "#fff" : C.ink },
              ]}
            >
              {u === "kg" ? t("קילוגרם", 'Kilograms') : t("ליברות", 'Pounds')}
            </Text>
          </Pressable>
        ))}
      </View>
      {d.kind === "barbell" && (
        <View style={{ gap: 6 }}>
          <Text style={[T.muted, { fontSize: 12 }]}>{t('משקל המוט', 'Bar weight')}</Text>
          <View style={s.seg}>
            {BARS[d.unit].map((b) => (
              <Pressable
                key={b}
                onPress={() =>
                  setD({ ...d, bar: b, value: Math.max(d.value, b) })
                }
                style={[s.segBtn, d.bar === b && s.segOn]}
              >
                <Text
                  style={[
                    T.bold,
                    { fontSize: 13, color: d.bar === b ? "#fff" : C.ink },
                  ]}
                >
                  {b}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Text style={[T.muted, { fontSize: 12 }]}>{HINT[d.kind]}</Text>
      <View style={s.stepper}>
        <Pressable
          onPress={() => add(step)}
          style={s.stepBtn}
          hitSlop={6}
          accessibilityLabel={t("להוסיף", 'Add')}
        >
          <Text style={[T.bold, { fontSize: 20 }]}>+</Text>
        </Pressable>
        <Text
          style={[
            T.bold,
            {
              fontSize: 22,
              fontFamily: FONT.black,
              minWidth: 110,
              textAlign: "center",
            },
          ]}
        >
          {loadText(d)}
        </Text>
        <Pressable
          onPress={() => add(-step)}
          style={s.stepBtn}
          hitSlop={6}
          accessibilityLabel={t("להוריד", 'Take off')}
        >
          <Text style={[T.bold, { fontSize: 20 }]}>−</Text>
        </Pressable>
      </View>
      {d.kind === "barbell" && (
        <Text style={[T.muted, { fontSize: 12, textAlign: "center" }]}>
          {perSide(d)}
        </Text>
      )}
      <View style={{ flexDirection: ROW, gap: 8 }}>
        <Pressable
          onPress={save}
          style={({ pressed }) => [s.save, pressed && { opacity: 0.85 }]}
        >
          <Text
            style={[
              T.bold,
              { color: "#fff", fontSize: 15, textAlign: "center" },
            ]}
          >
            {t('לשמור', 'Save')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setEdit(false)}
          style={({ pressed }) => [s.cancel, pressed && { opacity: 0.85 }]}
        >
          <Text style={[T.bold, { fontSize: 15, textAlign: "center" }]}>
            {t('ביטול', 'Cancel')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: ROW,
    alignItems: "center",
    gap: 12,
    backgroundColor: C.bg,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  panel: { backgroundColor: C.bg, borderRadius: 16, padding: 12, gap: 8 },
  seg: {
    flexDirection: ROW,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 10,
  },
  segOn: { backgroundColor: C.ink },
  stepper: {
    flexDirection: ROW,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  save: {
    flex: 1,
    backgroundColor: C.ink,
    borderRadius: 12,
    paddingVertical: 11,
  },
  cancel: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 11,
  },
});
