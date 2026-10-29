import { Ionicons } from '@expo/vector-icons';
import { firstTime } from '../ui/once';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { openApp } from '../apps/zepp';
import { APPS, AppInfo, foodApp } from '../setup/devices';
import { loadProfile } from '../profile/profile';
import { loadPrefs } from '../coach/store';
import { judgeInPlate, plateMeal, plates, SlotId, SLOTS, slotBudgets, slotOf } from '../nutrition/meals';
import { GOALS, caloriesFor } from '../config/goals';
import { Meal, readMeals, readProteinByDay } from '../health/history';
import { hideMeal, unhideMeal } from '../health/hiddenMeals';
import { openHealthConnectDataManagement } from 'react-native-health-connect';
import { setupHealthConnect } from '../health/permissions';
import { Bar, Card, GrowNumber, MiniBars, OpenRow, RowsCard, Screen } from '../ui/components';
import { DoubleRing } from '../ui/tiles';
import { C, FONT, fmt, T } from '../ui/theme';
import MenuAdvisor from './MenuAdvisor';
import DietMenuScreen from './DietMenu';
import { DietMenu, looksLikeDiet } from '../diet/parse';
import { checkMeal, loadMenu, menuMealOf } from '../diet/store';
import Craving from './Craving';
import { Sheet } from '../ui/Sheet';

import { END, ROW } from '../i18n';
const DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const POLL_MS = 15_000;
const WAIT_LIMIT_MS = 5 * 60_000;

// Last data shown, so switching back to this tab does not start empty and jump
const foodCache: { meals: Meal[]; week: { date: Date; protein: number }[] } = { meals: [], week: [] };

export default function FoodScreen({ sharedMenu, openCraving = 0 }: { sharedMenu?: string; openCraving?: number }) {
  const [meals, setMeals] = useState<Meal[]>(foodCache.meals);
  const [week, setWeek] = useState<{ date: Date; protein: number }[]>(foodCache.week);
  const [loading, setLoading] = useState(false);
  // Waiting for a meal logged in Zepp to sync through Health Connect
  const [waiting, setWaiting] = useState<{ since: number; baseline: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean; undo?: string; undoKey?: string } | null>(null);
  const mealsRef = useRef(0);
  const [slots, setSlots] = useState<SlotId[]>(['breakfast', 'lunch', 'dinner']);
  const [bedTime, setBedTime] = useState(23 * 60 + 30);
  const [craving, setCraving] = useState(0);
  useEffect(() => {
    if (firstTime('craving', openCraving)) setCraving((n) => n + 1);
  }, [openCraving]);
  const [cravingOpen, setCravingOpen] = useState(false);
  useEffect(() => {
    if (craving) setCravingOpen(true);
  }, [craving]);
  const [open, setOpen] = useState<string | null>(null);
  const [slotOpen, setSlotOpen] = useState<SlotId | null>(null);
  const [weekOpen, setWeekOpen] = useState(false);
  // A shared text is a dietitian's menu or a restaurant's: each has its own place
  const sharedDiet = !!sharedMenu && looksLikeDiet(sharedMenu);
  const [menuOpen, setMenuOpen] = useState(!!sharedMenu && !sharedDiet);
  const [dietOpen, setDietOpen] = useState(sharedDiet);
  const [diet, setDiet] = useState<DietMenu | null>(null);
  useEffect(() => {
    if (!sharedMenu) return;
    if (looksLikeDiet(sharedMenu)) setDietOpen(true);
    else setMenuOpen(true);
  }, [sharedMenu]);
  const [app, setApp] = useState<AppInfo | null>(APPS.zepp);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const setup = await setupHealthConnect();
      if (!setup.ok) return;
      loadMenu().then(setDiet).catch(() => undefined);
      const [m, w, prefs] = await Promise.all([readMeals(), readProteinByDay(7), loadPrefs()]);
      setSlots(prefs.mealSlots);
      setBedTime(prefs.bedTime);
      const profile = await loadProfile();
      setApp(profile.foodApp === 'other' ? null : foodApp(profile.foodApp));
      setMeals((foodCache.meals = m));
      setWeek((foodCache.week = w));
      mealsRef.current = m.length;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back from Zepp: refresh right away
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  // Keep polling until the new meal shows up, or give up after a few minutes
  useEffect(() => {
    if (!waiting) return;
    if (meals.length > waiting.baseline) {
      const added = meals[meals.length - 1];
      setNotice({ text: `נקלט: ${added.name}, ${fmt(added.kcal)} קלוריות`, ok: true });
      setWaiting(null);
      return;
    }
    if (Date.now() - waiting.since > WAIT_LIMIT_MS) {
      setNotice({
        text: `הארוחה עוד לא הגיעה מ ${app?.name ?? 'אפליקציית האוכל'}. פתח אותו לכמה שניות כדי שיסנכרן, ואז משוך למטה לרענון.`,
        ok: false,
      });
      setWaiting(null);
      return;
    }
    const t = setTimeout(load, POLL_MS);
    return () => clearTimeout(t);
  }, [waiting, meals, load]);

  // Pull to refresh: always say what happened, so it never looks like nothing was done
  const refresh = async () => {
    const before = mealsRef.current;
    setNotice(null);
    await load();
    const added = mealsRef.current - before;
    const at = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const name = app?.name ?? 'אפליקציית האוכל';
    setNotice(
      added > 0
        ? { text: `עודכן ב${at}: ${added === 1 ? 'ארוחה חדשה נקלטה' : `${added} ארוחות חדשות נקלטו`}.`, ok: true }
        : { text: `עודכן ב${at}: אין ארוחה חדשה מ ${name}. ${name} מעביר נתונים רק כשהוא מסנכרן; פתח אותו לכמה שניות וחזור לכאן.`, ok: false },
    );
  };

  const logInZepp = async () => {
    setNotice(null);
    if (!app) return;
    const opened = await openApp(app.pkg);
    if (opened) setWaiting({ since: Date.now(), baseline: mealsRef.current });
    else setNotice({ text: `${app.name} לא מותקן. נפתח עמוד ההתקנה שלו.`, ok: false });
  };

  // A meal deleted in the food app that Health Connect still holds: leave it out here,
  // in the totals and for the coach. Undo is offered right away, in case of a wrong tap.
  const hide = async (m: Meal) => {
    setOpen(null);
    await hideMeal(m.id, Date.now(), m.key);
    setNotice({ text: `${m.name} הוסתרה ולא נספרת יותר.`, ok: true, undo: m.id, undoKey: m.key });
    load();
  };
  const undoHide = async (id: string, key?: string) => {
    setNotice(null);
    await unhideMeal(id, key);
    load();
  };

  const kcal = meals.reduce((a, m) => a + m.kcal, 0);
  const protein = meals.reduce((a, m) => a + m.protein, 0);
  const daysOnTarget = week.filter((d) => d.protein >= GOALS.proteinG).length;
  const target = caloriesFor(new Date());
  const budgets = slotBudgets(target, slots);
  const carbs = meals.reduce((a, m) => a + m.carbs, 0);
  const fat = meals.reduce((a, m) => a + m.fat, 0);

  return (
    <Screen title="תזונה" enter="food" refreshing={loading} onRefresh={refresh}>
      {/* What is left today: one number, then the three macros */}
      {(() => {
        const left = target - kcal;
        // Fat about 30% of the calories, carbs the rest after protein: a guide for the bars
        const fatT = Math.round((target * 0.3) / 9);
        const carbT = Math.max(0, Math.round((target - GOALS.proteinG * 4 - fatT * 9) / 4));
        const macro = (label: string, v: number, t: number, color: string) => (
          <View key={label} style={s.macro}>
            <Text style={[T.muted, s.macroLabel]}>{label}</Text>
            <View style={{ flex: 1 }}>
              <Bar value={v} max={t} color={color} height={8} />
            </View>
            <Text style={[T.base, s.macroVal]}>
              {fmt(v)} / {fmt(t)}
            </Text>
          </View>
        );
        return (
          <Card>
            <View style={{ flexDirection: ROW, alignItems: 'center', gap: 18 }}>
              <DoubleRing outer={{ value: kcal, max: target, color: left < 0 ? C.warn : C.kcal }} inner={{ value: protein, max: GOALS.proteinG, color: C.protein }} />
              <View style={{ flex: 1, gap: 10 }}>
                <View>
                  <Text style={[T.bold, { fontSize: 32, lineHeight: 38 }, left < 0 && { color: C.warn }]}><GrowNumber value={Math.abs(left)} format={(n) => fmt(Math.round(n))} /></Text>
                  <Text style={[T.muted, { fontSize: 13 }]}>{left >= 0 ? 'קלוריות נשארו' : 'קלוריות מעל היעד'}</Text>
                  <Text style={[T.muted, { fontSize: 12 }]}>מתוך {fmt(target)} להיום</Text>
                </View>
                <View>
                  <Text style={[T.bold, { fontSize: 22, lineHeight: 28, color: C.protein }]}>
                    {protein >= GOALS.proteinG ? 'ביעד' : <><GrowNumber value={GOALS.proteinG - protein} format={(n) => fmt(Math.round(n))} delay={180} /> ג'</>}
                  </Text>
                  <Text style={[T.muted, { fontSize: 13 }]}>{protein >= GOALS.proteinG ? `חלבון, ${fmt(protein)} ג'` : 'חלבון חסר'}</Text>
                </View>
              </View>
            </View>
            <Text style={[T.muted, { fontSize: 12 }]}>
              פחמימות {fmt(carbs)} מתוך {fmt(carbT)} · שומן {fmt(fat)} מתוך {fmt(fatT)}
            </Text>
          </Card>
        );
      })()}

      <View style={s.actions}>
        {app && (
          <Pressable onPress={logInZepp} style={({ pressed }) => [s.actTile, { backgroundColor: C.ink }, pressed && { opacity: 0.85 }]}>
            <Ionicons name="camera-outline" size={24} color="#fff" />
            <Text style={[T.bold, { color: '#fff', fontSize: 14, textAlign: 'center' }]}>{app.name === 'Zepp' ? 'צלם ב Zepp' : `רשום ב ${app.name}`}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setCraving((n) => n + 1)} style={({ pressed }) => [s.actTile, pressed && { opacity: 0.85 }]}>
          <Ionicons name="heart-outline" size={24} color={C.signal} />
          <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>בא לי</Text>
        </Pressable>
        <Pressable onPress={() => setMenuOpen((v) => !v)} style={({ pressed }) => [s.actTile, menuOpen && { backgroundColor: C.ink }, pressed && { opacity: 0.85 }]}>
          <Ionicons name={menuOpen ? 'close' : 'restaurant-outline'} size={24} color={menuOpen ? '#fff' : C.kcal} />
          <Text style={[T.bold, { fontSize: 14, textAlign: 'center', color: menuOpen ? '#fff' : C.ink }]}>{menuOpen ? 'סגור' : 'מסעדה'}</Text>
        </Pressable>
        <Pressable onPress={() => setDietOpen(true)} style={({ pressed }) => [s.actTile, pressed && { opacity: 0.85 }]}>
          <Ionicons name="document-text-outline" size={24} color={C.good} />
          <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>התפריט שלי</Text>
        </Pressable>
      </View>
      {menuOpen && <MenuAdvisor kcal={kcal} protein={protein} initialText={sharedDiet ? undefined : sharedMenu} />}
      {waiting && (
        <View style={s.waiting}>
          <ActivityIndicator color={C.accent} />
          <Text style={[T.muted, { fontSize: 14, flex: 1 }]}>מחכה שהארוחה תגיע מ {app?.name ?? 'אפליקציית האוכל'}. זה לוקח בדרך כלל עד כמה דקות.</Text>
        </View>
      )}
      {notice && (
        <View style={s.row}>
          <Text style={[T.bold, { fontSize: 14, flex: 1, color: notice.ok ? C.accent : C.warn }]}>{notice.text}</Text>
          {notice.undo && (
            <Pressable onPress={() => undoHide(notice.undo!, notice.undoKey)} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 14, color: C.ink, textDecorationLine: 'underline' }]}>בטל</Text>
            </Pressable>
          )}
        </View>
      )}


      <RowsCard>
        {SLOTS.filter((slot) => slots.includes(slot.id) || meals.some((m) => slotOf(m.time) === slot.id) || !!menuMealOf(diet, slot.id)).map((slot, idx) => {
          const inSlot = meals.filter((m) => slotOf(m.time) === slot.id);
          const slotKcal = inSlot.reduce((a, m) => a + m.kcal, 0);
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          const passed = slot.from < slot.to ? nowMin >= slot.to : false;
          const at = inSlot[0]?.time.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
          // With a dietitian's menu: what it says for this meal, and how the meal compares
          const mm = menuMealOf(diet, slot.id);
          const started = slot.from < slot.to ? nowMin >= slot.from : nowMin >= slot.from || nowMin < slot.to;
          const check = mm ? checkMeal(mm, { kcal: slotKcal, protein: inSlot.reduce((a, m) => a + m.protein, 0), count: inSlot.length }, passed ? 'past' : started ? 'now' : 'future') : null;
          return (
            <OpenRow
              key={slot.id}
              first={idx === 0}
              title={inSlot.length ? `${slot.label} · ${fmt(slotKcal)}` : slot.label}
              sub={inSlot.length ? `${at} · ${inSlot.map((m) => m.name).join(', ')}` : passed ? 'לא נרשמה' : 'בהמשך'}
              dot={!inSlot.length && passed}
              note={check ? `בתפריט: ${check.plan}` : undefined}
              right={
                check ? (
                  <Text style={[T.bold, { fontSize: 12, color: check.tone === 'good' ? C.good : check.tone === 'off' ? C.warn : C.muted }]}>{check.chip}</Text>
                ) : undefined
              }
              onPress={() => (inSlot.length === 1 ? setOpen(inSlot[0].id) : inSlot.length ? setSlotOpen(slot.id) : logInZepp())}
            />
          );
        })}
      </RowsCard>

      <RowsCard>
        <OpenRow first title="חלבון ב 7 ימים" sub={`${daysOnTarget} ימים ביעד`} onPress={() => setWeekOpen(true)} />
      </RowsCard>

      <Sheet open={weekOpen} onClose={() => setWeekOpen(false)} title="חלבון ב 7 ימים">
        <MiniBars values={week.map((d) => d.protein)} labels={week.map((d) => DAY_SHORT[d.date.getDay()])} target={GOALS.proteinG} />
        <Text style={[T.muted, { fontSize: 13 }]}>הקו הוא היעד, {GOALS.proteinG} גרם ביום.</Text>
      </Sheet>

      <DietMenuScreen open={dietOpen} onClose={() => setDietOpen(false)} initialText={sharedDiet ? sharedMenu : undefined} onSaved={() => loadMenu().then(setDiet).catch(() => undefined)} />

      <Sheet open={cravingOpen} onClose={() => setCravingOpen(false)} title="בא לי משהו">
        {craving > 0 && <Craving key={craving} kcalLeft={target - kcal} proteinLeft={GOALS.proteinG - protein} bedTime={bedTime} />}
      </Sheet>

      <Sheet open={slotOpen !== null} onClose={() => setSlotOpen(null)} title={slotOpen ? SLOTS.find((x) => x.id === slotOpen)?.label : undefined}>
        {slotOpen &&
          meals
            .filter((m) => slotOf(m.time) === slotOpen)
            .map((m) => {
              const v = judgeInPlate(m, meals, budgets[slotOpen]);
              const plate = plates(meals).find((p) => p.includes(m))!;
              const first = plate.length > 1 && plate[0] === m;
              const tot = plateMeal(plate);
              return (
                <View key={m.id}>
                {first && (
                  <View style={[s.row, { paddingTop: 10 }]}>
                    <Text style={[T.bold, { fontSize: 13, flex: 1 }]}>
                      יחד, מנה אחת: {fmt(tot.kcal)} קלוריות · חלבון {fmt(tot.protein)}
                    </Text>
                    <Text style={[s.chip, { color: v.good ? C.accent : C.signal, borderColor: v.good ? C.accent : C.signal }]}>{v.label}</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => {
                    setSlotOpen(null);
                    setTimeout(() => setOpen(m.id), 320);
                  }}
                  style={s.meal}
                >
                  <View style={s.row}>
                    <Text style={[T.bold, s.text, { flex: 1 }]} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={[T.bold, s.text]}>{fmt(m.kcal)}</Text>
                  </View>
                  <View style={s.row}>
                    <Text style={[T.muted, { fontSize: 13 }]}>
                      {m.time.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} · חלבון {fmt(m.protein)} · פחמ' {fmt(m.carbs)} · שומן {fmt(m.fat)}
                    </Text>
                    {plate.length === 1 && (
                      <Text style={[s.chip, { color: v.good ? C.accent : C.signal, borderColor: v.good ? C.accent : C.signal }]}>{v.label}</Text>
                    )}
                  </View>
                </Pressable>
                </View>
              );
            })}
      </Sheet>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={meals.find((m) => m.id === open)?.name}>
        {(() => {
          const m = meals.find((x) => x.id === open);
          if (!m) return null;
          const v = judgeInPlate(m, meals, budgets[slotOf(m.time)]);
          const plate = plates(meals).find((p) => p.includes(m))!;
          return (
            <>
              <Card>
                <View style={s.row}>
                  <Text style={[T.bold, { fontSize: 22 }]}>{fmt(m.kcal)} קלוריות</Text>
                  <Text style={[s.chip, { color: v.good ? C.accent : C.signal, borderColor: v.good ? C.accent : C.signal }]}>{v.label}</Text>
                </View>
                <Text style={[T.muted, { fontSize: 14 }]}>
                  חלבון {fmt(m.protein)} · פחמ' {fmt(m.carbs)} · שומן {fmt(m.fat)}
                  {m.sugar != null ? ` · סוכר ${fmt(m.sugar)}` : ''}
                </Text>
              </Card>
              {plate.length > 1 && (
                <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                  נאכל יחד עם {plate.filter((x) => x !== m).map((x) => x.name).join(', ')}, ולכן נבדק כמנה אחת.
                </Text>
              )}
              <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{v.message}</Text>
              <View style={s.removeBox}>
                <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                  מחקת את הארוחה ב {app?.name ?? 'אפליקציית האוכל'} והיא עדיין כאן? {app?.name ?? 'האפליקציה'} לא תמיד מעביר מחיקה ל Health Connect. אפשר להסתיר אותה כאן, או למחוק אותה ב Health Connect עצמו.
                </Text>
                <View style={s.removeRow}>
                  <Pressable onPress={() => hide(m)} style={s.removeBtn}>
                    <Text style={[T.bold, { fontSize: 14, color: C.warn, textAlign: 'center' }]}>הסתר מ Nudge</Text>
                  </Pressable>
                  <Pressable onPress={() => openHealthConnectDataManagement()} style={s.removeBtn}>
                    <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>פתח Health Connect</Text>
                  </Pressable>
                </View>
              </View>
            </>
          );
        })()}
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: ROW, gap: 10 },
  actTile: { flex: 1, height: 92, borderRadius: 24, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', gap: 6 },
  primary: { flex: 1.7, backgroundColor: C.ink, borderRadius: 18, paddingVertical: 15 },
  secondary: { flex: 1, borderWidth: 0, borderColor: C.card, borderRadius: 18, paddingVertical: 15, backgroundColor: C.card },
  secondaryOn: { backgroundColor: C.ink, borderColor: C.ink },
  leftRow: { flexDirection: ROW, alignItems: 'baseline', gap: 8 },
  leftNum: { fontSize: 40, lineHeight: 46 },
  macro: { flexDirection: ROW, alignItems: 'center', gap: 10 },
  macroLabel: { width: 62, fontSize: 13 },
  macroVal: { width: 72, fontSize: 13, textAlign: END },
  menuBtn: { borderWidth: 1.5, borderColor: C.accent, borderRadius: 14, paddingVertical: 12, backgroundColor: C.card },
  row: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  text: { fontSize: 15 },
  removeBox: { gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  removeRow: { flexDirection: ROW, gap: 10 },
  removeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.track },
  meal: { gap: 3, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  chip: { fontFamily: FONT.bold, fontSize: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 1 },
  waiting: { flexDirection: ROW, alignItems: 'center', gap: 10 },
});
