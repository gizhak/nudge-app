// "התפריט שלי": a dietitian's menu, photographed with Google Lens, read here, checked by him, saved.
// Three views: getting the text in, reviewing what was read (every number can be fixed), and the
// saved menu. Saving makes the menu's totals the day's targets; the coach never changes the menu.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openLens } from '../apps/lens';
import { DietMenu, MenuItem, MenuMeal, menuTotals, optionKcal, optionProtein, parseDiet, parseItem, slotTitle } from '../diet/parse';
import { clearMenu, loadMenu, saveMenu } from '../diet/store';
import type { SlotId } from '../nutrition/meals';
import { C, FONT, fmt, T } from '../ui/theme';

import { ROW, SIDE_START, START, t as tr } from '../i18n';
const SLOT_ORDER: SlotId[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'night'];
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** "\\" and "|" read as "/" on screen */
const pretty = (x: string) => x.replace(/\s*[\\|]\s*/g, ' / ');

export default function DietMenuScreen({ open, onClose, initialText, onSaved }: { open: boolean; onClose: () => void; initialText?: string; onSaved?: () => void }) {
  const [saved, setSaved] = useState<DietMenu | null>(null);
  const [draft, setDraft] = useState<DietMenu | null>(null);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    loadMenu().then(setSaved).catch(() => undefined);
    setNote(null);
    setEdit(null);
  }, [open]);

  const read = (text: string) => {
    const d = parseDiet(text);
    if (!d.meals.length) {
      setNote(tr('לא זיהיתי ארוחות בטקסט. צריך כותרות כמו "ארוחת בוקר" ושורה לכל מאכל.', 'No meals found in the text. It needs headers like "Breakfast" and a line for each food.'));
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
    if (!ok) setNote(tr('לא הצלחתי לפתוח את Google Lens. צלם את התפריט ב Lens, העתק את הטקסט, והדבק כאן.', 'Could not open Google Lens. Photograph the menu in Lens, copy the text, and paste it here.'));
  };
  const fromClipboard = async () => {
    const clip = await Clipboard.getStringAsync().catch(() => '');
    if (clip.trim()) read(clip);
    else setNote(tr('אין טקסט בזיכרון. העתק את התפריט קודם.', 'Nothing on the clipboard. Copy the menu first.'));
  };

  /** The option shown for a meal on this screen: its default, which tapping a tab also sets */
  const optOf = (m: MenuMeal) => Math.min(m.options.length - 1, m.pick);
  const patchMeal = (mi: number, f: (m: MenuMeal) => MenuMeal | null) => {
    if (!draft) return;
    const meals = draft.meals.map((m, k) => (k === mi ? f(m) : m)).filter((m): m is MenuMeal => !!m && m.options.length > 0);
    setDraft({ ...draft, meals });
  };
  const setItem = (mi: number, ii: number, patch: Partial<MenuItem> | null) =>
    patchMeal(mi, (m) => {
      const oi = optOf(m);
      const options = m.options
        .map((o, k) => (k !== oi ? o : { ...o, items: patch === null ? o.items.filter((_, j) => j !== ii) : o.items.map((x, j) => (j === ii ? { ...x, ...patch, known: true } : x)) }))
        .filter((o) => o.items.length);
      return { ...m, options, pick: Math.min(m.pick, Math.max(0, options.length - 1)) };
    });
  const setPickTab = (mi: number, oi: number) => patchMeal(mi, (m) => ({ ...m, pick: oi }));
  const setSlot = (mi: number, slot: SlotId) => {
    if (!draft) return;
    const meals = draft.meals.map((m, k) => (k === mi ? { ...m, slot, title: slotTitle(slot) } : m));
    meals.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    setDraft({ ...draft, meals });
  };
  const addLine = (mi: number) => {
    const t = adding[mi]?.trim();
    if (!draft || !t) return;
    patchMeal(mi, (m) => ({ ...m, options: m.options.map((o, k) => (k === optOf(m) ? { ...o, items: [...o.items, parseItem(t)] } : o)) }));
    setAdding({ ...adding, [mi]: '' });
  };
  const setRule = (k: 'useWater' | 'useCups', v: boolean) => {
    if (draft) setDraft({ ...draft, rules: { ...draft.rules, [k]: v } });
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
          <Pressable onPress={close} style={s.x} hitSlop={8} accessibilityLabel={tr("סגור", 'Close')}>
            <Ionicons name="close" size={22} color={C.ink} />
          </Pressable>
          <Text style={[T.bold, { fontSize: 22, flex: 1 }]}>{view === 'review' ? tr('בדיקת התפריט', 'Check the menu') : tr('התפריט שלי', 'My menu')}</Text>
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {view === 'intake' && (
            <>
              <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>
                {tr('יש לך תפריט מדיאטנית? צלם אותו, ואני אקרא את הארוחות והכמויות. אחרי בדיקה שלך, התפריט יקבע את היעד היומי, ובכל ארוחה תראה מה בתפריט מול מה שאכלת.', 'Have a menu from a dietitian? Photograph it, and I will read the meals and amounts. After you check it, the menu sets the daily goal, and each meal shows what the menu says against what you ate.')}
              </Text>
              <Pressable onPress={lens} style={({ pressed }) => [s.dark, pressed && { opacity: 0.85 }]}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={[T.bold, { color: '#fff', fontSize: 16 }]}>{tr('לצלם עם Google Lens', 'Photograph with Google Lens')}</Text>
              </Pressable>
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('ב Lens: בוחרים "טקסט", מסמנים הכל, מעתיקים, וחוזרים לכאן. הקריאה מתחילה לבד.', 'In Lens: choose "Text", select all, copy, and come back here. Reading starts on its own.')}</Text>
              <Pressable onPress={fromClipboard} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('כבר העתקתי, להדביק', 'I already copied it, paste')}</Text>
              </Pressable>
              <TextInput value={paste} onChangeText={setPaste} placeholder={tr("או להקליד או להדביק כאן את התפריט", 'Or type or paste the menu here')} placeholderTextColor={C.muted} multiline style={s.area} />
              {paste.trim().length > 10 && (
                <Pressable onPress={() => read(paste)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                  <Text style={[T.bold, { fontSize: 15 }]}>{tr('לקרוא את הטקסט', 'Read the text')}</Text>
                </Pressable>
              )}
            </>
          )}

          {note && <Text style={[T.bold, { fontSize: 14, color: C.warn, lineHeight: 21 }]}>{note}</Text>}

          {view === 'review' && draft && totals && (
            <>
              <Found menu={draft} />
              <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
                {tr('"1:" ו "2:" הן אפשרויות, לא דברים שאוכלים יחד. הקלוריות הן הערכה שלי לפי טבלה. לחיצה על שורה מאפשרת לתקן, ושורות בכתום לא זיהיתי.', '"1:" and "2:" are options, not foods eaten together. Calories are my estimate from a table. Tap a line to fix it; orange lines I could not read.')}
              </Text>
              {draft.meals.map((m, mi) => (
                <MealCard
                  key={m.slot + mi}
                  meal={m}
                  edit={edit}
                  idPrefix={`${mi}`}
                  onTab={(oi) => setPickTab(mi, oi)}
                  onEdit={(id) => setEdit(edit === id ? null : id)}
                  onItem={(ii, p) => setItem(mi, ii, p)}
                  footer={
                    <>
                      {moving === mi ? (
                        <View style={{ gap: 6, flexDirection: ROW, flexWrap: 'wrap' }}>
                          {SLOT_ORDER.map((sl) => (
                            <Pressable key={sl} onPress={() => { setSlot(mi, sl); setMoving(null); }} style={[s.chip, m.slot === sl && s.chipOn]}>
                              <Text style={[T.bold, { fontSize: 12, color: m.slot === sl ? '#fff' : C.muted }]}>{slotTitle(sl)}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <Pressable onPress={() => setMoving(mi)} hitSlop={6} style={{ alignSelf: SIDE_START }}>
                          <Text style={[T.bold, { fontSize: 12.5, color: C.muted, textDecorationLine: 'underline' }]}>{tr('לא הארוחה הנכונה? להעביר', 'Wrong meal? Move it')}</Text>
                        </Pressable>
                      )}
                      <View style={s.addRow}>
                        <TextInput value={adding[mi] ?? ''} onChangeText={(t) => setAdding({ ...adding, [mi]: t })} placeholder={tr("להוסיף שורה, למשל 2 ביצים", 'Add a line, e.g. 2 eggs')} placeholderTextColor={C.muted} style={s.addInput} onSubmitEditing={() => addLine(mi)} />
                        <Pressable onPress={() => addLine(mi)} hitSlop={6} accessibilityLabel={tr("להוסיף", 'Add')}>
                          <Ionicons name="add-circle" size={28} color={C.ink} />
                        </Pressable>
                      </View>
                    </>
                  }
                />
              ))}
              <Extras menu={draft} />
              {(draft.rules.waterL || draft.rules.cupsBefore) && (
                <View style={s.meal}>
                  <Text style={[T.bold, { fontSize: 17 }]}>{tr('כללים מהתפריט', 'Rules from the menu')}</Text>
                  {!!draft.rules.waterL && (
                    <View style={s.rule}>
                      <Text style={[T.base, { fontSize: 14, flex: 1 }]}>{tr(`${draft.rules.waterL} ליטר מים ביום, כיעד המים שלך`, `${draft.rules.waterL} liters of water a day, as your water goal`)}</Text>
                      <Switch value={draft.rules.useWater} onValueChange={(v) => setRule('useWater', v)} trackColor={{ true: C.good, false: '#D6CFC5' }} thumbColor="#fff" />
                    </View>
                  )}
                  {!!draft.rules.cupsBefore && (
                    <View style={s.rule}>
                      <Text style={[T.base, { fontSize: 14, flex: 1 }]}>{tr(`${draft.rules.cupsBefore === 1 ? 'כוס מים' : `${draft.rules.cupsBefore} כוסות מים`} לפני כל ארוחה, בתזכורת`, `${draft.rules.cupsBefore === 1 ? 'A cup' : `${draft.rules.cupsBefore} cups`} of water before each meal, in the reminder`)}</Text>
                      <Switch value={draft.rules.useCups} onValueChange={(v) => setRule('useCups', v)} trackColor={{ true: C.good, false: '#D6CFC5' }} thumbColor="#fff" />
                    </View>
                  )}
                </View>
              )}
              {draft.ignored.length > 0 && (
                <View style={s.meal}>
                  <Pressable onPress={() => setShowIgnored(!showIgnored)} hitSlop={6}>
                    <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>
                      {tr(`לא חלק מהתפריט, הוסר (${draft.ignored.length} שורות)`, `Not part of the menu, left out (${draft.ignored.length} lines)`)} {showIgnored ? '▴' : '▾'}
                    </Text>
                  </Pressable>
                  {showIgnored && draft.ignored.map((x, k) => <Text key={k} style={[T.muted, { fontSize: 12.5, lineHeight: 18 }]} numberOfLines={2}>{x}</Text>)}
                </View>
              )}
              <Pressable onPress={save} style={({ pressed }) => [s.dark, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { color: '#fff', fontSize: 16 }]}>{tr('לשמור את התפריט', 'Save the menu')}</Text>
              </Pressable>
              <Pressable onPress={() => setDraft(null)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('ביטול', 'Cancel')}</Text>
              </Pressable>
            </>
          )}

          {view === 'saved' && saved && totals && (
            <>
              {fresh && (
                <Text style={[T.bold, { fontSize: 15, color: C.good, lineHeight: 22 }]}>
                  {tr('נשמר. מעכשיו היעד היומי הוא', 'Saved. From now the daily goal is')} {fmt(totals.kcal)} {tr('קלוריות ו', 'calories and')} {totals.protein} {tr('גרם חלבון, לפי התפריט.', 'grams of protein, by the menu.')}
                </Text>
              )}
              {saved.meals.map((m, mi) => (
                <MealCard key={m.slot + mi} meal={m} idPrefix={`s${mi}`} onTab={(oi) => setSaved({ ...saved, meals: saved.meals.map((x, k) => (k === mi ? { ...x, pick: oi } : x)) })} readOnly />
              ))}
              <Extras menu={saved} />
              <View style={s.total}>
                <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>{tr('היעד היומי לפי התפריט', 'Daily goal by the menu')}</Text>
                <Text style={[T.bold, { fontSize: 22, fontFamily: FONT.black }]}>
                  {fmt(totals.kcal)} {tr('קלוריות ·', 'calories ·')} {totals.protein} {tr('ג\' חלבון', 'g protein')}
                </Text>
                <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('לפי ברירת המחדל של כל ארוחה. החלפה של ארוחה ליום אחד נעשית במסך התזונה.', 'By each meal\'s default. To swap a meal for one day, use the Food screen.')}</Text>
                <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('כל עוד יש תפריט, המאמן לא מציע לשנות קלוריות. את התפריט משנה רק הדיאטנית.', 'As long as there is a menu, the coach does not suggest changing calories. Only the dietitian changes the menu.')}</Text>
              </View>
              <Pressable onPress={() => setDraft(saved)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('לתקן', 'Fix')}</Text>
              </Pressable>
              <Pressable onPress={() => setSaved(null)} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('תפריט חדש', 'New menu')}</Text>
              </Pressable>
              <Pressable onPress={remove} style={({ pressed }) => [s.light, pressed && { opacity: 0.85 }]}>
                <Text style={[T.bold, { fontSize: 15, color: C.warn }]}>{tr('להסיר את התפריט', 'Remove the menu')}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** "What I found": the day by each meal's default option, the range over all options, and what else */
function Found({ menu }: { menu: DietMenu }) {
  const t = menuTotals(menu);
  const bits = [
    tr(`${menu.meals.length} ארוחות`, `${menu.meals.length} meals`),
    menu.rules.waterL ? tr(`${menu.rules.waterL} ליטר מים`, `${menu.rules.waterL} liters of water`) : null,
    t.unknown ? tr(`${t.unknown} שורות לא זוהו`, `${t.unknown} lines not recognized`) : null,
  ].filter(Boolean);
  return (
    <View style={s.found}>
      <Text style={[T.bold, { fontSize: 15, color: '#F4F1EC' }]}>{tr('מה מצאתי בתפריט', 'What I found in the menu')}</Text>
      <Text style={{ fontFamily: FONT.black, fontSize: 26, color: '#fff' }}>{tr(`${fmt(t.kcal)} קל' ליום`, `${fmt(t.kcal)} kcal a day`)}</Text>
      {t.hi > t.lo && <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: '#BDB4AA' }}>{tr(`לפי האפשרות הראשונה של כל ארוחה. כל האפשרויות: בין ${fmt(t.lo)} ל ${fmt(t.hi)}.`, `By each meal's first option. Across all options: ${fmt(t.lo)} to ${fmt(t.hi)}.`)}</Text>}
      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: '#BDB4AA' }}>{bits.join(' · ')}</Text>
    </View>
  );
}

/** One meal: its window, a tab per option, and the option's foods with their alternatives */
function MealCard({ meal: m, idPrefix, edit, onTab, onEdit, onItem, footer, readOnly }: { meal: MenuMeal; idPrefix: string; edit?: string | null; onTab: (oi: number) => void; onEdit?: (id: string) => void; onItem?: (ii: number, p: Partial<MenuItem> | null) => void; footer?: React.ReactNode; readOnly?: boolean }) {
  const oi = Math.min(m.options.length - 1, m.pick);
  const o = m.options[oi];
  return (
    <View style={s.meal}>
      <View style={s.mealHead}>
        <Text style={[T.bold, { fontSize: 17 }]}>{m.title}</Text>
        {m.from != null && <Text style={[T.muted, { fontSize: 13 }]}>{tr(`${hhmm(m.from)} עד ${hhmm(m.to ?? m.from)}`, `${hhmm(m.from)} to ${hhmm(m.to ?? m.from)}`)}</Text>}
      </View>
      {m.options.length > 1 && (
        <View style={s.seg}>
          {m.options.map((x, k) => (
            <Pressable key={k} onPress={() => onTab(k)} style={[s.segBtn, k === oi && s.segOn]}>
              <Text style={[T.bold, { fontSize: 13, color: k === oi ? '#fff' : C.ink }]} numberOfLines={1}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {o.items.map((x, ii) => {
        const id = `${idPrefix}:${oi}:${ii}`;
        return (
          <View key={id} style={[s.item, !x.known && s.unknown]}>
            <Pressable onPress={() => !readOnly && onEdit?.(id)} style={{ gap: 4 }} disabled={readOnly}>
              <View style={s.mealHead}>
                <Text style={[T.base, { fontSize: 15, lineHeight: 21, flex: 1 }]}>{x.alts?.length ? tr(`${pretty(x.text)}, או`, `${pretty(x.text)}, or`) : pretty(x.text)}</Text>
                <Text style={[T.bold, { fontSize: 12, color: x.known ? C.muted : C.signal }]}>
                  {x.known ? tr(`${fmt(x.kcal)} קל' · ${x.protein} ג'${x.free ? ' · חופשי' : ''}`, `${fmt(x.kcal)} kcal · ${x.protein} g${x.free ? ' · free' : ''}`) : tr('לא זיהיתי', 'Not read')}
                </Text>
              </View>
              {!!x.alts?.length && (
                <View style={s.chips}>
                  {x.alts.map((a, k) => (
                    <View key={k} style={s.alt}>
                      <Text style={[T.base, { fontSize: 12.5, color: a.known ? C.ink : C.signal }]}>{pretty(a.text)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
            {!readOnly && edit === id && onItem && (
              <View style={s.editRow}>
                <Num label={tr("קלוריות", 'Calories')} value={x.kcal} onChange={(v) => onItem(ii, { kcal: v })} />
                <Num label={tr("חלבון, גרם", 'Protein, grams')} value={x.protein} onChange={(v) => onItem(ii, { protein: v })} />
                <Pressable onPress={() => onItem(ii, null)} style={s.del} hitSlop={6} accessibilityLabel={tr("למחוק שורה", 'Delete line')}>
                  <Ionicons name="trash-outline" size={18} color={C.warn} />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
      <View style={s.sum}>
        <Text style={[T.muted, { fontSize: 13 }]}>{o.shared ? tr(`${o.label}, גם בארוחה אחרת`, `${o.label}, also another meal`) : m.options.length > 1 ? tr(`סה"כ ${o.label}`, `${o.label} total`) : tr('סה"כ', 'Total')}</Text>
        <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>{tr(`${fmt(optionKcal(o))} קל' · ${Math.round(optionProtein(o))} ג' חלבון`, `${fmt(optionKcal(o))} kcal · ${Math.round(optionProtein(o))} g protein`)}</Text>
      </View>
      {footer}
    </View>
  );
}

/** Free additions and sandwich ideas: listed, never counted in the day */
function Extras({ menu }: { menu: DietMenu }) {
  return (
    <>
      {menu.extras.length > 0 && (
        <View style={s.meal}>
          <View style={s.mealHead}>
            <Text style={[T.bold, { fontSize: 17 }]}>{tr('תוספות ואפשרויות', 'Additions and options')}</Text>
            <Text style={[T.muted, { fontSize: 13 }]}>{tr('לא נכנסות לסכום', 'Not counted in the day')}</Text>
          </View>
          <View style={s.chips}>
            {menu.extras.map((x, k) => (
              <View key={k} style={s.alt}>
                <Text style={[T.base, { fontSize: 12.5 }]}>{x}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {menu.sandwiches.length > 0 && (
        <View style={s.meal}>
          <View style={s.mealHead}>
            <Text style={[T.bold, { fontSize: 17 }]}>{tr('כריכים', 'Sandwiches')}</Text>
            <Text style={[T.muted, { fontSize: 13 }]}>{tr('במקום ארוחה', 'Instead of a meal')}</Text>
          </View>
          {menu.sandwiches.map((x, k) => (
            <Text key={k} style={[T.base, { fontSize: 14, lineHeight: 20 }]}>{pretty(x)}</Text>
          ))}
        </View>
      )}
    </>
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
  found: { backgroundColor: C.ink, borderRadius: 20, padding: 16, gap: 4 },
  seg: { flexDirection: ROW, backgroundColor: C.bg, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, paddingHorizontal: 4 },
  segOn: { backgroundColor: C.ink },
  chips: { flexDirection: ROW, flexWrap: 'wrap', gap: 5 },
  alt: { backgroundColor: C.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  sum: { flexDirection: ROW, justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: '#EFEAE3', borderStyle: 'dashed', paddingTop: 8 },
  rule: { flexDirection: ROW, alignItems: 'center', gap: 10 },
});
