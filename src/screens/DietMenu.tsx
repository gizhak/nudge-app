// "התפריט שלי": a dietitian's menu, photographed with Google Lens, read here, checked by him, saved.
// Three views: getting the text in, reviewing what was read (every number can be fixed), and the
// saved menu. Saving makes the menu's totals the day's targets; the coach never changes the menu.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openLens } from '../apps/lens';
import { DietMenu, MenuItem, mealKcal, mealProtein, menuTotals, parseDiet, parseItem, slotTitle } from '../diet/parse';
import { clearMenu, loadMenu, saveMenu } from '../diet/store';
import type { SlotId } from '../nutrition/meals';
import { C, FONT, fmt, T } from '../ui/theme';

import { ROW, START } from '../i18n';
const SLOT_ORDER: SlotId[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'night'];

export default function DietMenuScreen({ open, onClose, initialText, onSaved }: { open: boolean; onClose: () => void; initialText?: string; onSaved?: () => void }) {
  const [saved, setSaved] = useState<DietMenu | null>(null);
  const [draft, setDraft] = useState<DietMenu | null>(null);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadMenu().then(setSaved).catch(() => undefined);
    setNote(null);
    setEdit(null);
  }, [open]);

  const read = (text: string) => {
    const d = parseDiet(text);
    if (!d.meals.length) {
      setNote('לא זיהיתי ארוחות בטקסט. צריך כותרות כמו "ארוחת בוקר" ושורה לכל מאכל.');
      return;
    }
    setNote(null);
    setDraft(d);
  };

  // Shared into the app as a menu
  useEffect(() => {
    if (open && initialText?.trim()) read(initialText);
  }, [open, initialText]);

  // Back from Lens with the text copied: read it at once
  const lensAt = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (st) => {
      if (st !== 'active' || !lensAt.current || Date.now() - lensAt.current > 10 * 60000) return;
      const clip = await Clipboard.getStringAsync().catch(() => '');
      if (clip && clip.trim().length > 20) {
        lensAt.current = 0;
        read(clip);
      }
    });
    return () => sub.remove();
  }, []);

  const lens = async () => {
    lensAt.current = Date.now();
    const ok = await openLens();
    if (!ok) setNote('לא הצלחתי לפתוח את Google Lens. צלם את התפריט ב Lens, העתק את הטקסט, והדבק כאן.');
  };
  const fromClipboard = async () => {
    const clip = await Clipboard.getStringAsync().catch(() => '');
    if (clip.trim()) read(clip);
    else setNote('אין טקסט בזיכרון. העתק את התפריט קודם.');
  };

  const setItem = (mi: number, ii: number, patch: Partial<MenuItem> | null) => {
    if (!draft) return;
    const meals = draft.meals.map((m, k) =>
      k !== mi ? m : { ...m, items: patch === null ? m.items.filter((_, j) => j !== ii) : m.items.map((x, j) => (j === ii ? { ...x, ...patch, known: true } : x)) },
    );
    setDraft({ ...draft, meals: meals.filter((m) => m.items.length) });
  };
  const setSlot = (mi: number, slot: SlotId) => {
    if (!draft) return;
    const meals = draft.meals.map((m, k) => (k === mi ? { ...m, slot, title: slotTitle(slot) } : m));
    meals.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    setDraft({ ...draft, meals });
  };
  const addLine = (mi: number) => {
    const t = adding[mi]?.trim();
    if (!draft || !t) return;
    setDraft({ ...draft, meals: draft.meals.map((m, k) => (k === mi ? { ...m, items: [...m.items, parseItem(t)] } : m)) });
    setAdding({ ...adding, [mi]: '' });
  };
  const save = async () => {
    if (!draft) return;
    await saveMenu(draft);
    setSaved(draft);
    setDraft(null);
    setFresh(true);
    onSaved?.();
  };
  const remove = async () => {
    await clearMenu();
    setSaved(null);
    onSaved?.();
  };

  const close = () => {
    setDraft(null);
    setFresh(false);
    onClose();
  };

  const view = draft ? 'review' : saved ? 'saved' : 'intake';
  const totals = draft ? menuTotals(draft) : saved ? menuTotals(saved) : null;

  return (
    <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={s.root}>
        <View style={s.head}>
          <Pressable onPress={close} style={s.x} hitSlop={8} accessibilityLabel="סגור">
            <Ionicons name="close" size={22} color={C.ink} />
          </Pressable>
          <Text style={[T.bold, { fontSize: 22, flex: 1 }]}>{view === 'review' ? 'בדיקת התפריט' : 'התפריט שלי'}</Text>
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {view === 'intake' && (
            <>
              <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>
                יש לך תפריט מדיאטנית? צלם אותו, ואני אקרא את הארוחות והכמויות. אחרי בדיקה שלך, התפריט יקבע את היעד היומי, ובכל ארוחה תראה מה בתפריט מול מה שאכלת.
              </Text>
              <Pressable onPress={lens} style={({ pressed }) => [s.dark, pressed && { opacity: 0.85 }]}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={[T.bold, { color: '#fff', fontSize: 16 }]}>לצלם עם Google Lens</Text>
              </Pressable>
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>ב Lens: בוחרים "טקסט", מסמנים הכל, מעתיקים, וחוזרים לכאן. הקריאה מתחילה לבד.</Text>
              <Pressable onPress={fromClipboard} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>כבר העתקתי, להדביק</Text>
              </Pressable>
              <TextInput value={paste} onChangeText={setPaste} placeholder="או להקליד או להדביק כאן את התפריט" placeholderTextColor={C.muted} multiline style={s.area} />
              {paste.trim().length > 10 && (
                <Pressable onPress={() => read(paste)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                  <Text style={[T.bold, { fontSize: 15 }]}>לקרוא את הטקסט</Text>
                </Pressable>
              )}
            </>
          )}

          {note && <Text style={[T.bold, { fontSize: 14, color: C.warn, lineHeight: 21 }]}>{note}</Text>}

          {view === 'review' && draft && totals && (
            <>
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
                הקלוריות והחלבון הם הערכה שלי לפי טבלה, לא חלק מהתפריט. לחיצה על שורה מאפשרת לתקן. שורות בכתום לא זיהיתי, ותצטרך למלא אותן או למחוק.
              </Text>
              {draft.meals.map((m, mi) => (
                <View key={m.slot + mi} style={s.meal}>
                  <View style={s.mealHead}>
                    <Text style={[T.bold, { fontSize: 17 }]}>{m.title}</Text>
                    <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>
                      {fmt(mealKcal(m))} קל' · {fmt(mealProtein(m))} ג' חלבון
                    </Text>
                  </View>
                  <View style={{ gap: 6, flexDirection: ROW, flexWrap: 'wrap' }}>
                    {SLOT_ORDER.map((sl) => (
                      <Pressable key={sl} onPress={() => setSlot(mi, sl)} style={[s.chip, m.slot === sl && s.chipOn]}>
                        <Text style={[T.bold, { fontSize: 12, color: m.slot === sl ? '#fff' : C.muted }]}>{slotTitle(sl)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {m.items.map((x, ii) => {
                    const id = `${mi}:${ii}`;
                    return (
                      <View key={id} style={[s.item, !x.known && s.unknown]}>
                        <Pressable onPress={() => setEdit(edit === id ? null : id)} style={{ gap: 2 }}>
                          <Text style={[T.base, { fontSize: 15, lineHeight: 21 }]}>{x.text}</Text>
                          <Text style={[T.bold, { fontSize: 12, color: x.known ? C.muted : C.signal }]}>
                            {x.known ? `${fmt(x.kcal)} קל' · ${x.protein} ג' חלבון${x.free ? ' · חופשי' : ''}` : 'לא זיהיתי. לחץ כדי למלא'}
                          </Text>
                        </Pressable>
                        {edit === id && (
                          <View style={s.editRow}>
                            <Num label="קלוריות" value={x.kcal} onChange={(v) => setItem(mi, ii, { kcal: v })} />
                            <Num label="חלבון, גרם" value={x.protein} onChange={(v) => setItem(mi, ii, { protein: v })} />
                            <Pressable onPress={() => setItem(mi, ii, null)} style={s.del} hitSlop={6} accessibilityLabel="למחוק שורה">
                              <Ionicons name="trash-outline" size={18} color={C.warn} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                  <View style={s.addRow}>
                    <TextInput value={adding[mi] ?? ''} onChangeText={(t) => setAdding({ ...adding, [mi]: t })} placeholder="להוסיף שורה, למשל 2 ביצים" placeholderTextColor={C.muted} style={s.addInput} onSubmitEditing={() => addLine(mi)} />
                    <Pressable onPress={() => addLine(mi)} hitSlop={6} accessibilityLabel="להוסיף">
                      <Ionicons name="add-circle" size={28} color={C.ink} />
                    </Pressable>
                  </View>
                </View>
              ))}
              <View style={s.total}>
                <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>סך הכל ביום</Text>
                <Text style={[T.bold, { fontSize: 22, fontFamily: FONT.black }]}>
                  {fmt(totals.kcal)} קלוריות · {totals.protein} ג' חלבון
                </Text>
                {totals.unknown > 0 && <Text style={[T.bold, { fontSize: 13, color: C.signal }]}>{totals.unknown} שורות עוד לא מולאו, והן לא נספרות.</Text>}
              </View>
              <Pressable onPress={save} style={({ pressed }) => [s.dark, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { color: '#fff', fontSize: 16 }]}>לשמור את התפריט</Text>
              </Pressable>
              <Pressable onPress={() => setDraft(null)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>ביטול</Text>
              </Pressable>
            </>
          )}

          {view === 'saved' && saved && totals && (
            <>
              {fresh && (
                <Text style={[T.bold, { fontSize: 15, color: C.good, lineHeight: 22 }]}>
                  נשמר. מעכשיו היעד היומי הוא {fmt(totals.kcal)} קלוריות ו {totals.protein} גרם חלבון, לפי התפריט.
                </Text>
              )}
              {saved.meals.map((m, mi) => (
                <View key={m.slot + mi} style={s.meal}>
                  <View style={s.mealHead}>
                    <Text style={[T.bold, { fontSize: 17 }]}>{m.title}</Text>
                    <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>
                      {fmt(mealKcal(m))} קל' · {fmt(mealProtein(m))} ג'
                    </Text>
                  </View>
                  {m.items.map((x, ii) => (
                    <Text key={ii} style={[T.base, { fontSize: 15, lineHeight: 22 }]}>
                      {x.text}
                    </Text>
                  ))}
                </View>
              ))}
              <View style={s.total}>
                <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>היעד היומי לפי התפריט</Text>
                <Text style={[T.bold, { fontSize: 22, fontFamily: FONT.black }]}>
                  {fmt(totals.kcal)} קלוריות · {totals.protein} ג' חלבון
                </Text>
                <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>כל עוד יש תפריט, המאמן לא מציע לשנות קלוריות. את התפריט משנה רק הדיאטנית.</Text>
              </View>
              <Pressable onPress={() => setDraft(saved)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>לתקן</Text>
              </Pressable>
              <Pressable onPress={() => setSaved(null)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>תפריט חדש</Text>
              </Pressable>
              <Pressable onPress={remove} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15, color: C.warn }]}>להסיר את התפריט</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [t, setT] = useState(String(value || ''));
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[T.muted, { fontSize: 11 }]}>{label}</Text>
      <TextInput
        value={t}
        onChangeText={(v) => {
          setT(v);
          const n = Number(v.replace(',', '.'));
          if (Number.isFinite(n)) onChange(n);
        }}
        keyboardType="numeric"
        style={s.num}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 44 },
  head: { flexDirection: ROW, alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  x: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  dark: { flexDirection: ROW, gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink, borderRadius: 16, paddingVertical: 14 },
  light: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 13 },
  area: { backgroundColor: '#fff', borderRadius: 16, minHeight: 120, padding: 12, textAlign: START, textAlignVertical: 'top', fontSize: 15, fontFamily: T.base.fontFamily, color: C.ink },
  meal: { backgroundColor: '#fff', borderRadius: 20, padding: 14, gap: 8 },
  mealHead: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: C.bg },
  chipOn: { backgroundColor: C.ink },
  item: { borderTopWidth: 1, borderTopColor: '#EFEAE3', paddingTop: 8, gap: 6 },
  unknown: { backgroundColor: '#FFF6F1', borderRadius: 10, paddingHorizontal: 8, paddingBottom: 6, borderTopWidth: 0 },
  editRow: { flexDirection: ROW, alignItems: 'flex-end', gap: 8 },
  num: { backgroundColor: C.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, fontSize: 16, textAlign: START, fontFamily: T.base.fontFamily, color: C.ink },
  del: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: ROW, alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#EFEAE3', paddingTop: 8 },
  addInput: { flex: 1, fontSize: 14, textAlign: START, fontFamily: T.base.fontFamily, color: C.ink, paddingVertical: 4 },
  total: { backgroundColor: '#fff', borderRadius: 20, padding: 14, gap: 4 },
});
