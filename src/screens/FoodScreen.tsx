import { Ionicons } from '@expo/vector-icons';
import { firstTime } from '../ui/once';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { openApp } from '../apps/zepp';
import { APPS, AppInfo, foodApp } from '../setup/devices';
import { loadProfile } from '../profile/profile';
import { loadPrefs, loadSkipped, markSkipped } from '../coach/store';
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
import { DietMenu, looksLikeDiet, MenuMeal, menuTotals, optionKcal, optionProtein } from '../diet/parse';
import { mealSlot } from '../diet/match';
import { adoptEatenOptions, checkMeal, lighterOption, loadMenu, menuMealOf, setPick, todayPicks, swapMeals } from '../diet/store';
import Craving from './Craving';
import { Sheet } from '../ui/Sheet';

import { END, ROW, t as tr, LOCALE } from '../i18n';
const DAY_SHORT = [tr('א', 'S'), tr('ב', 'M'), tr('ג', 'T'), tr('ד', 'W'), tr('ה', 'T'), tr('ו', 'F'), tr('ש', 'S')];
const POLL_MS = 15_000;
const WAIT_LIMIT_MS = 5 * 60_000;

// Last data shown, so switching back to this tab does not start empty and jump
const foodCache: { meals: Meal[]; week: { date: Date; protein: number }[] } = { meals: [], week: [] };

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** "\\" and "|" read as "/" on screen */
const alt = (x: string) => x.replace(/\s*[\\|]\s*/g, ' / ');

/** The menu meal in a line: today's option, each food with up to two of its alternatives, and what else there is */
/** "בעוד שעה ו 45 ד'" up to three hours ahead, then the hour itself */
function untilText(nowMin: number, from: number): string {
  const d = (from - nowMin + 1440) % 1440;
  if (d > 180) return tr(`ב ${hhmm(from)}`, `At ${hhmm(from)}`);
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (!h) return tr(`בעוד ${m} ד'`, `In ${m} min`);
  const hh = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return tr(m ? `בעוד ${hh} ו ${m} ד'` : `בעוד ${hh}`, m ? `In ${h} h ${m} min` : `In ${h} h`);
}

function menuNote(mm: MenuMeal, pick?: number): string {
  const k = Math.min(mm.options.length - 1, pick ?? mm.pick);
  const o = mm.options[k];
  const items = o.items.map((it) => {
    if (!it.known) return tr('שורה שלא נקראה', 'an unread line');
    const ch = [it.text, ...(it.alts ?? []).map((a) => a.text)].map(alt);
    return ch.length > 3 ? tr(`${ch.slice(0, 2).join(' / ')} ועוד ${ch.length - 2}`, `${ch.slice(0, 2).join(' / ')} and ${ch.length - 2} more`) : ch.join(' / ');
  });
  const others = mm.options.filter((_, i) => i !== k);
  const more = !others.length ? '' : others.length === 1 ? tr(` · ועוד: ${others[0].label}`, ` · also: ${others[0].label}`) : tr(` · ועוד ${others.length} אפשרויות`, ` · ${others.length} more options`);
  return `${mm.options.length > 1 ? `${o.label}: ` : ''}${items.join(', ')}${more}`;
}

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
  // With a menu, a meal eaten a little after its hours still belongs to it
  const slotOfMeal = (d: Date) => mealSlot(diet, d, meals.map((x) => x.time));
  // Today's option for each meal of the menu, and the meal whose options are open
  const [picks, setPicks] = useState<Partial<Record<SlotId, number>>>({});
  const [swap, setSwap] = useState<SlotId | null>(null);
  const [swapTo, setSwapTo] = useState(0);
  const [swapAlways, setSwapAlways] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState<SlotId | null>(null);
  const [mealTab, setMealTab] = useState(0);
  const openMenuMeal = (slot: SlotId) => {
    const mm = menuMealOf(diet, slot);
    setMealTab(Math.min((mm?.options.length ?? 1) - 1, picks[slot] ?? mm?.pick ?? 0));
    setMealOpen(slot);
  };
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
      const [m, w, prefs] = await Promise.all([readMeals(), readProteinByDay(7), loadPrefs()]);
      // The menu, with today's picks following what was eaten
      const menu = await loadMenu().catch(() => null);
      setDiet(menu);
      const pk = await todayPicks().catch(() => ({}));
      setPicks(menu ? await adoptEatenOptions(menu, pk, m).catch(() => pk) : pk);
      setSkipped(await loadSkipped().catch(() => []));
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
      setNotice({ text: tr(`נקלט: ${added.name}, ${fmt(added.kcal)} קלוריות`, `Logged: ${added.name}, ${fmt(added.kcal)} calories`), ok: true });
      setWaiting(null);
      return;
    }
    if (Date.now() - waiting.since > WAIT_LIMIT_MS) {
      setNotice({
        text: tr(`הארוחה עוד לא הגיעה מ ${app?.name ?? 'אפליקציית האוכל'}. פתח אותו לכמה שניות כדי שיסנכרן, ואז משוך למטה לרענון.`, `The meal has not arrived from ${app?.name ?? 'the food app'} yet. Open it for a few seconds so it syncs, then pull down to refresh.`),
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
    const at = new Date().toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    const name = app?.name ?? tr('אפליקציית האוכל', 'the food app');
    setNotice(
      added > 0
        ? { text: tr(`עודכן ב${at}: ${added === 1 ? 'ארוחה חדשה נקלטה' : `${added} ארוחות חדשות נקלטו`}.`, `Updated at ${at}: ${added === 1 ? 'a new meal came in' : `${added} new meals came in`}.`), ok: true }
        : { text: tr(`עודכן ב${at}: אין ארוחה חדשה מ ${name}. ${name} מעביר נתונים רק כשהוא מסנכרן; פתח אותו לכמה שניות וחזור לכאן.`, `Updated at ${at}: no new meal from ${name}. ${name} only passes data on when it syncs; open it for a few seconds and come back.`), ok: false },
    );
  };

  const logInZepp = async () => {
    setNotice(null);
    if (!app) return;
    const opened = await openApp(app.pkg);
    if (opened) setWaiting({ since: Date.now(), baseline: mealsRef.current });
    else setNotice({ text: tr(`${app.name} לא מותקן. נפתח עמוד ההתקנה שלו.`, `${app.name} is not installed. Opening its install page.`), ok: false });
  };

  // A meal deleted in the food app that Health Connect still holds: leave it out here,
  // in the totals and for the coach. Undo is offered right away, in case of a wrong tap.
  const hide = async (m: Meal) => {
    setOpen(null);
    await hideMeal(m.id, Date.now(), m.key);
    setNotice({ text: tr(`${m.name} הוסתרה ולא נספרת יותר.`, `${m.name} is hidden and no longer counts.`), ok: true, undo: m.id, undoKey: m.key });
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
    <Screen title={tr("תזונה", 'Food')} enter="food" refreshing={loading} onRefresh={refresh}>
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
                  <Text style={[T.muted, { fontSize: 13 }]}>{left >= 0 ? tr('קלוריות נשארו', 'calories left') : tr('קלוריות מעל היעד', 'calories over the goal')}</Text>
                  <Text style={[T.muted, { fontSize: 12 }]}>{tr('מתוך', 'of')} {fmt(target)} {tr('להיום', 'today')}</Text>
                </View>
                <View>
                  <Text style={[T.bold, { fontSize: 22, lineHeight: 28, color: C.protein }]}>
                    {protein >= GOALS.proteinG ? tr('ביעד', 'On target') : <><GrowNumber value={GOALS.proteinG - protein} format={(n) => fmt(Math.round(n))} delay={180} /> {tr('ג\'', 'g')}</>}
                  </Text>
                  <Text style={[T.muted, { fontSize: 13 }]}>{protein >= GOALS.proteinG ? tr(`חלבון, ${fmt(protein)} ג'`, `protein, ${fmt(protein)} g`) : tr('חלבון חסר', 'protein to go')}</Text>
                </View>
              </View>
            </View>
            <Text style={[T.muted, { fontSize: 12 }]}>
              {tr('פחמימות', 'Carbs')} {fmt(carbs)} {tr('מתוך', 'of')} {fmt(carbT)} {tr('· שומן', '· Fat')} {fmt(fat)} {tr('מתוך', 'of')} {fmt(fatT)}
            </Text>
          </Card>
        );
      })()}

      <View style={s.actions}>
        {app && (
          <Pressable onPress={logInZepp} style={({ pressed }) => [s.actTile, { backgroundColor: C.ink }, pressed && { opacity: 0.85 }]}>
            <Ionicons name="camera-outline" size={24} color="#fff" />
            <Text style={[T.bold, { color: '#fff', fontSize: 14, textAlign: 'center' }]}>{app.name === 'Zepp' ? tr('צלם ב Zepp', 'Snap in Zepp') : tr(`רשום ב ${app.name}`, `Log in ${app.name}`)}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setCraving((n) => n + 1)} style={({ pressed }) => [s.actTile, pressed && { opacity: 0.85 }]}>
          <Ionicons name="heart-outline" size={24} color={C.signal} />
          <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>{tr('בא לי', 'Craving')}</Text>
        </Pressable>
        <Pressable onPress={() => setMenuOpen((v) => !v)} style={({ pressed }) => [s.actTile, menuOpen && { backgroundColor: C.ink }, pressed && { opacity: 0.85 }]}>
          <Ionicons name={menuOpen ? 'close' : 'restaurant-outline'} size={24} color={menuOpen ? '#fff' : C.kcal} />
          <Text style={[T.bold, { fontSize: 14, textAlign: 'center', color: menuOpen ? '#fff' : C.ink }]}>{menuOpen ? tr('סגור', 'Close') : tr('מסעדה', 'Restaurant')}</Text>
        </Pressable>
        <Pressable onPress={() => setDietOpen(true)} style={({ pressed }) => [s.actTile, pressed && { opacity: 0.85 }]}>
          <Ionicons name="document-text-outline" size={24} color={C.good} />
          <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>{tr('התפריט שלי', 'My menu')}</Text>
        </Pressable>
      </View>
      {menuOpen && <MenuAdvisor kcal={kcal} protein={protein} initialText={sharedDiet ? undefined : sharedMenu} />}
      {waiting && (
        <View style={s.waiting}>
          <ActivityIndicator color={C.accent} />
          <Text style={[T.muted, { fontSize: 14, flex: 1 }]}>{tr('מחכה שהארוחה תגיע מ', 'Waiting for the meal to arrive from')} {app?.name ?? tr('אפליקציית האוכל', 'the food app')}{tr('. זה לוקח בדרך כלל עד כמה דקות.', '. This usually takes up to a few minutes.')}</Text>
        </View>
      )}
      {notice && (
        <View style={s.row}>
          <Text style={[T.bold, { fontSize: 14, flex: 1, color: notice.ok ? C.accent : C.warn }]}>{notice.text}</Text>
          {notice.undo && (
            <Pressable onPress={() => undoHide(notice.undo!, notice.undoKey)} hitSlop={8}>
              <Text style={[T.bold, { fontSize: 14, color: C.ink, textDecorationLine: 'underline' }]}>{tr('בטל', 'Undo')}</Text>
            </Pressable>
          )}
        </View>
      )}


      <RowsCard>
        {SLOTS.filter((slot) => (slots.includes(slot.id) || (diet ? !!menuMealOf(diet, slot.id) : false)) || meals.some((m) => slotOfMeal(m.time) === slot.id)).map((slot, idx) => {
          const inSlot = meals.filter((m) => slotOfMeal(m.time) === slot.id);
          const slotKcal = inSlot.reduce((a, m) => a + m.kcal, 0);
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          const at = inSlot[0]?.time.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
          // With a dietitian's menu: what it says for this meal, and how the meal compares; its own hours when it has them
          const mm = menuMealOf(diet, slot.id);
          const from = mm?.from ?? slot.from;
          const to = mm?.to ?? slot.to;
          const passed = from < to ? nowMin >= to : false;
          const started = from < to ? nowMin >= from : nowMin >= from || nowMin < to;
          const check = mm ? checkMeal(mm, { kcal: slotKcal, protein: inSlot.reduce((a, m) => a + m.protein, 0), count: inSlot.length, names: inSlot.map((m) => m.name) }, passed ? 'past' : started ? 'now' : 'future', picks[slot.id], swapMeals(diet, slot.id)) : null;
          const canSwap = !!mm && mm.options.length > 1 && !inSlot.length && !skipped.includes(slot.id);
          const isSkipped = skipped.includes(slot.id) && !inSlot.length;
          // Its time came and nothing was logged: he can say he skipped it
          const canSkip = !inSlot.length && !isSkipped && (passed || started);
          // Nothing logged yet: how long until it, or that its time is now
          const when = inSlot.length || isSkipped || passed ? null : started ? (mm ? { text: tr('עוד לא נרשמה', 'Not logged yet'), warn: true } : null) : { text: mm ? untilText(nowMin, from) : tr(`בסביבות ${hhmm(slot.remindAt)}`, `Around ${hhmm(slot.remindAt)}`), warn: false };
          return (
            <OpenRow
              key={slot.id}
              first={idx === 0}
              title={inSlot.length ? `${slot.label} · ${fmt(slotKcal)}` : slot.label}
              sub={inSlot.length ? `${at} · ${inSlot.map((m) => m.name).join(', ')}` : isSkipped ? tr('דילגת', 'Skipped') : passed ? tr('לא נרשמה', 'Not logged') : undefined}
              badge={mm?.from != null && mm.to != null ? (started && !passed && !inSlot.length ? tr(`עכשיו · עד ${hhmm(mm.to)}`, `Now · until ${hhmm(mm.to)}`) : tr(`${hhmm(mm.from)} עד ${hhmm(mm.to)}`, `${hhmm(mm.from)} to ${hhmm(mm.to)}`)) : undefined}
              badgeOn={!!mm && started && !passed && !inSlot.length && !isSkipped}
              dot={!inSlot.length && passed && !isSkipped}
              note={mm ? menuNote(mm, picks[slot.id]) : diet && !inSlot.length && !passed ? tr('לא בתפריט. מהתוספות החופשיות, אם רעב.', 'Not on the menu. From the free additions, if hungry.') : undefined}
              right={
                check || canSkip || isSkipped || when ? (
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {when ? (
                      <Text style={[T.bold, { fontSize: 12, color: when.warn ? C.warn : C.muted }]}>{when.text}</Text>
                    ) : (
                      check && !isSkipped && <Text style={[T.bold, { fontSize: 12, color: check.tone === 'good' ? C.good : check.tone === 'off' ? C.warn : C.muted }]}>{check.chip}</Text>
                    )}
                    {(canSkip || isSkipped) && (
                      <Pressable
                        hitSlop={8}
                        onPress={async () => {
                          await markSkipped(slot.id, new Date(), isSkipped).catch(() => undefined);
                          setSkipped(await loadSkipped());
                        }}
                      >
                        <Text style={[T.bold, { fontSize: 12.5, color: C.muted, textDecorationLine: 'underline' }]}>{isSkipped ? tr('בטל דילוג', 'Undo skip') : tr('דילגתי', 'I skipped it')}</Text>
                      </Pressable>
                    )}
                    {canSwap && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          setSwap(slot.id);
                          setSwapTo(Math.min(mm!.options.length - 1, picks[slot.id] ?? mm!.pick));
                          setSwapAlways(false);
                        }}
                      >
                        <Text style={[T.bold, { fontSize: 12.5, color: C.ink, textDecorationLine: 'underline' }]}>{tr('להחליף', 'Swap')}</Text>
                      </Pressable>
                    )}
                  </View>
                ) : undefined
              }
              onPress={() => (inSlot.length === 1 ? setOpen(inSlot[0].id) : inSlot.length ? setSlotOpen(slot.id) : mm ? openMenuMeal(slot.id) : logInZepp())}
            />
          );
        })}
      </RowsCard>
      {diet && (
        <Text style={[T.muted, { fontSize: 13, paddingHorizontal: 6 }]}>
          {tr(`היעד היום לפי התפריט: ${fmt(menuTotals(diet, picks).kcal)} קל' · ${menuTotals(diet, picks).protein} ג' חלבון`, `Today's goal by the menu: ${fmt(menuTotals(diet, picks).kcal)} kcal · ${menuTotals(diet, picks).protein} g protein`)}
        </Text>
      )}

      {diet && (diet.extras.length > 0 || diet.sandwiches.length > 0 || !!diet.rules.waterL) && (
        <Pressable onPress={() => setMoreOpen(true)} style={({ pressed }) => [s.moreCard, pressed && { opacity: 0.8 }]}>
          <View style={{ flexDirection: ROW, justifyContent: 'space-between' }}>
            <Text style={[T.bold, { fontSize: 15 }]}>{tr('עוד בתפריט', 'More in the menu')}</Text>
            <Text style={[T.muted, { fontSize: 13 }]}>{tr('לא נספר ביעד', 'Not counted in the goal')}</Text>
          </View>
          <View style={s.chipRow}>
            {diet.extras.length > 0 && <Text style={s.pill}>{tr(`תוספות חופשיות · ${diet.extras.length}`, `Free additions · ${diet.extras.length}`)}</Text>}
            {diet.sandwiches.length > 0 && <Text style={s.pill}>{tr(`כריכים · ${diet.sandwiches.length}`, `Sandwiches · ${diet.sandwiches.length}`)}</Text>}
            {!!diet.rules.waterL && <Text style={s.pill}>{tr(`${diet.rules.waterL} ליטר מים`, `${diet.rules.waterL} liters of water`)}</Text>}
            {!!diet.rules.cupsBefore && <Text style={s.pill}>{tr(`${diet.rules.cupsBefore} כוסות לפני ארוחה`, `${diet.rules.cupsBefore} cups before a meal`)}</Text>}
          </View>
        </Pressable>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={tr('עוד בתפריט', 'More in the menu')}>
        {diet && (
          <View style={{ gap: 12 }}>
            {diet.extras.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('תוספות חופשיות', 'Free additions')}</Text>
                <View style={s.chipRow}>{diet.extras.map((x, k) => <Text key={k} style={s.pill}>{x}</Text>)}</View>
              </View>
            )}
            {diet.sandwiches.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('כריכים, במקום ארוחה', 'Sandwiches, instead of a meal')}</Text>
                {diet.sandwiches.map((x, k) => <Text key={k} style={[T.base, { fontSize: 14, lineHeight: 20 }]}>{alt(x)}</Text>)}
              </View>
            )}
            {(!!diet.rules.waterL || !!diet.rules.cupsBefore) && (
              <View style={{ gap: 4 }}>
                <Text style={[T.bold, { fontSize: 15 }]}>{tr('מים', 'Water')}</Text>
                {!!diet.rules.waterL && <Text style={[T.base, { fontSize: 14 }]}>{tr(`${diet.rules.waterL} ליטר ביום`, `${diet.rules.waterL} liters a day`)}</Text>}
                {!!diet.rules.cupsBefore && <Text style={[T.base, { fontSize: 14 }]}>{tr(`${diet.rules.cupsBefore} כוסות לפני כל ארוחה`, `${diet.rules.cupsBefore} cups before each meal`)}</Text>}
              </View>
            )}
          </View>
        )}
      </Sheet>

      <Sheet open={!!mealOpen} onClose={() => setMealOpen(null)} title={mealOpen ? menuMealOf(diet, mealOpen)?.title ?? '' : ''}>
        {mealOpen && diet && (() => {
          const mm = menuMealOf(diet, mealOpen)!;
          const today = Math.min(mm.options.length - 1, picks[mealOpen] ?? mm.pick);
          const o = mm.options[Math.min(mm.options.length - 1, mealTab)];
          return (
            <View style={{ gap: 9 }}>
              {mm.from != null && <Text style={[T.muted, { fontSize: 13 }]}>{tr(`${hhmm(mm.from)} עד ${hhmm(mm.to ?? mm.from)}`, `${hhmm(mm.from)} to ${hhmm(mm.to ?? mm.from)}`)}</Text>}
              {mm.options.length > 1 && (
                <View style={s.seg}>
                  {mm.options.map((x, k) => (
                    <Pressable key={k} onPress={() => setMealTab(k)} style={[s.segBtn, mealTab === k && { backgroundColor: C.ink }]}>
                      <Text style={[T.bold, { fontSize: 13, color: mealTab === k ? '#fff' : C.ink }]} numberOfLines={1}>{k === today ? tr(`${x.label} · היום`, `${x.label} · today`) : x.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {o.items.map((it, k) => (
                <View key={k} style={s.menuItem}>
                  <View style={{ flexDirection: ROW, justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[T.base, { fontSize: 14.5, flex: 1, color: it.known ? C.ink : C.warn }]}>{it.known ? (it.alts?.length ? tr(`${alt(it.text)}, או`, `${alt(it.text)}, or`) : alt(it.text)) : tr('שורה שלא נקראה. אפשר לתקן ב"התפריט שלי".', 'A line that was not read. Fix it in "My menu".')}</Text>
                    {it.known && <Text style={[T.muted, { fontSize: 12.5 }]}>{tr(`${Math.round(it.kcal)} קל'`, `${Math.round(it.kcal)} kcal`)}</Text>}
                  </View>
                  {!!it.alts?.length && <View style={s.chipRow}>{it.alts.map((a, j) => <Text key={j} style={s.pill}>{alt(a.text)}</Text>)}</View>}
                </View>
              ))}
              <View style={{ flexDirection: ROW, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#ECE6DD', paddingTop: 7 }}>
                <Text style={[T.muted, { fontSize: 13 }]}>{tr('סה"כ', 'Total')}</Text>
                <Text style={[T.muted, { fontSize: 13 }]}>{tr(`${fmt(optionKcal(o))} קל' · ${Math.round(optionProtein(o))} ג' חלבון`, `${fmt(optionKcal(o))} kcal · ${Math.round(optionProtein(o))} g protein`)}</Text>
              </View>
              {mealTab !== today && (
                <Pressable
                  onPress={async () => {
                    await setPick(mealOpen, mealTab, false).catch(() => undefined);
                    setPicks(await todayPicks());
                  }}
                  style={({ pressed }) => [s.swapBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={[T.bold, { color: '#fff', fontSize: 15, textAlign: 'center' }]}>{tr(`היום: ${o.label}`, `Today: ${o.label}`)}</Text>
                </Pressable>
              )}
              <View style={{ flexDirection: ROW, gap: 8 }}>
                <Pressable onPress={() => { setMealOpen(null); logInZepp(); }} style={({ pressed }) => [s.swapBtn, { flex: 1 }, mealTab !== today && { backgroundColor: C.bg }, pressed && { opacity: 0.85 }]}>
                  <Text style={[T.bold, { color: mealTab !== today ? C.ink : '#fff', fontSize: 15, textAlign: 'center' }]}>{tr('לצלם ב Zepp', 'Snap it in Zepp')}</Text>
                </Pressable>
                {!skipped.includes(mealOpen) && (
                  <Pressable
                    onPress={async () => {
                      await markSkipped(mealOpen).catch(() => undefined);
                      setSkipped(await loadSkipped());
                      setMealOpen(null);
                    }}
                    style={({ pressed }) => [s.swapBtn, { flex: 1, backgroundColor: C.bg }, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[T.bold, { color: C.ink, fontSize: 15, textAlign: 'center' }]}>{tr('דילגתי', 'I skipped it')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })()}
      </Sheet>

      <Sheet open={!!swap} onClose={() => setSwap(null)} title={swap ? tr(`${menuMealOf(diet, swap)?.title ?? ''}, מה היום?`, `${menuMealOf(diet, swap)?.title ?? ''}, what today?`) : ''}>
        {swap && diet && (() => {
          const mm = menuMealOf(diet, swap)!;
          // Eaten past the plan already today: the lighter option is the one to suggest
          const plannedSoFar = diet.meals.filter((m) => meals.some((x) => slotOfMeal(x.time) === m.slot)).reduce((a, m) => a + optionKcal(m.options[Math.min(m.options.length - 1, picks[m.slot] ?? m.pick)]), 0);
          const eatenSoFar = meals.reduce((a, m) => a + m.kcal, 0);
          const light = eatenSoFar - plannedSoFar > 150 ? lighterOption(mm, picks[swap]) : null;
          return (
            <View style={{ gap: 8 }}>
              {mm.options.map((o, k) => (
                <Pressable key={k} onPress={() => setSwapTo(k)} style={[s.choice, swapTo === k && { borderColor: C.ink }]}>
                  <View style={{ flexDirection: ROW, justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[T.bold, { fontSize: 15 }]}>{o.label}</Text>
                    <Text style={[T.muted, { fontSize: 13 }]}>{tr(`${fmt(optionKcal(o))} קל' · ${Math.round(optionProtein(o))} ג'`, `${fmt(optionKcal(o))} kcal · ${Math.round(optionProtein(o))} g`)}</Text>
                  </View>
                  <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]} numberOfLines={2}>{o.items.map((x) => x.text.replace(/\s*[\\|/]\s*/g, ' / ')).join(', ')}</Text>
                  {light?.option === k && <Text style={[T.bold, { fontSize: 12, color: C.good }]}>{tr('מתאים היום: אכלת היום יותר מהתכנון', 'Fits today: you ate more than planned today')}</Text>}
                </Pressable>
              ))}
              <View style={s.seg}>
                {[false, true].map((al) => (
                  <Pressable key={String(al)} onPress={() => setSwapAlways(al)} style={[s.segBtn, swapAlways === al && { backgroundColor: C.ink }]}>
                    <Text style={[T.bold, { fontSize: 13, color: swapAlways === al ? '#fff' : C.ink }]}>{al ? tr('מעכשיו תמיד', 'From now on') : tr('רק היום', 'Today only')}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={async () => {
                  await setPick(swap, swapTo, swapAlways).catch(() => undefined);
                  setPicks(await todayPicks());
                  setDiet(await loadMenu());
                  setSwap(null);
                }}
                style={({ pressed }) => [s.swapBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={[T.bold, { color: '#fff', fontSize: 15, textAlign: 'center' }]}>{tr(`לבחור ${mm.options[swapTo]?.label ?? ''}`, `Choose ${mm.options[swapTo]?.label ?? ''}`)}</Text>
              </Pressable>
            </View>
          );
        })()}
      </Sheet>

      <RowsCard>
        <OpenRow first title={tr("חלבון ב 7 ימים", 'Protein over 7 days')} sub={tr(`${daysOnTarget} ימים ביעד`, `${daysOnTarget} days on target`)} onPress={() => setWeekOpen(true)} />
      </RowsCard>

      <Sheet open={weekOpen} onClose={() => setWeekOpen(false)} title={tr("חלבון ב 7 ימים", 'Protein over 7 days')}>
        <MiniBars values={week.map((d) => d.protein)} labels={week.map((d) => DAY_SHORT[d.date.getDay()])} target={GOALS.proteinG} />
        <Text style={[T.muted, { fontSize: 13 }]}>{tr('הקו הוא היעד,', 'The line is the goal,')} {GOALS.proteinG} {tr('גרם ביום.', 'grams a day.')}</Text>
      </Sheet>

      <DietMenuScreen open={dietOpen} onClose={() => setDietOpen(false)} initialText={sharedDiet ? sharedMenu : undefined} onSaved={() => loadMenu().then(setDiet).catch(() => undefined)} />

      <Sheet open={cravingOpen} onClose={() => setCravingOpen(false)} title={tr("בא לי משהו", 'I feel like something')}>
        {craving > 0 && <Craving key={craving} kcalLeft={target - kcal} proteinLeft={GOALS.proteinG - protein} bedTime={bedTime} />}
      </Sheet>

      <Sheet open={slotOpen !== null} onClose={() => setSlotOpen(null)} title={slotOpen ? SLOTS.find((x) => x.id === slotOpen)?.label : undefined}>
        {slotOpen &&
          meals
            .filter((m) => slotOfMeal(m.time) === slotOpen)
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
                      {tr('יחד, מנה אחת:', 'Together, as one meal:')} {fmt(tot.kcal)} {tr('קלוריות · חלבון', 'calories · protein')} {fmt(tot.protein)}
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
                      {m.time.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} {tr('· חלבון', '· protein')} {fmt(m.protein)} {tr('· פחמ\'', '· carbs')} {fmt(m.carbs)} {tr('· שומן', '· fat')} {fmt(m.fat)}
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
                  <Text style={[T.bold, { fontSize: 22 }]}>{fmt(m.kcal)} {tr('קלוריות', 'calories')}</Text>
                  <Text style={[s.chip, { color: v.good ? C.accent : C.signal, borderColor: v.good ? C.accent : C.signal }]}>{v.label}</Text>
                </View>
                <Text style={[T.muted, { fontSize: 14 }]}>
                  {tr('חלבון', 'protein')} {fmt(m.protein)} {tr('· פחמ\'', '· carbs')} {fmt(m.carbs)} {tr('· שומן', '· fat')} {fmt(m.fat)}
                  {m.sugar != null ? tr(` · סוכר ${fmt(m.sugar)}`, ` · sugar ${fmt(m.sugar)}`) : ''}
                </Text>
              </Card>
              {plate.length > 1 && (
                <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                  {tr('נאכל יחד עם', 'Eaten together with')} {plate.filter((x) => x !== m).map((x) => x.name).join(', ')}{tr(', ולכן נבדק כמנה אחת.', ', so it was judged as one meal.')}
                </Text>
              )}
              <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{v.message}</Text>
              <View style={s.removeBox}>
                <Text style={[T.muted, { fontSize: 13, lineHeight: 19 }]}>
                  {tr('מחקת את הארוחה ב', 'Deleted the meal in')} {app?.name ?? tr('אפליקציית האוכל', 'the food app')} {tr('והיא עדיין כאן?', 'and it is still here?')} {app?.name ?? tr('האפליקציה', 'The app')} {tr('לא תמיד מעביר מחיקה ל Health Connect. אפשר להסתיר אותה כאן, או למחוק אותה ב Health Connect עצמו.', 'does not always pass a deletion on to Health Connect. You can hide it here, or delete it in Health Connect itself.')}
                </Text>
                <View style={s.removeRow}>
                  <Pressable onPress={() => hide(m)} style={s.removeBtn}>
                    <Text style={[T.bold, { fontSize: 14, color: C.warn, textAlign: 'center' }]}>{tr('הסתר מ Nudge', 'Hide in Nudge')}</Text>
                  </Pressable>
                  <Pressable onPress={() => openHealthConnectDataManagement()} style={s.removeBtn}>
                    <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>{tr('פתח Health Connect', 'Open Health Connect')}</Text>
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
  choice: { borderWidth: 1.5, borderColor: '#ECE6DD', borderRadius: 14, padding: 12, gap: 3 },
  seg: { flexDirection: ROW, backgroundColor: C.bg, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  swapBtn: { backgroundColor: C.ink, borderRadius: 14, paddingVertical: 13 },
  moreCard: { backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 8 },
  chipRow: { flexDirection: ROW, flexWrap: 'wrap', gap: 5 },
  pill: { fontSize: 12.5, fontFamily: T.base.fontFamily, color: C.ink, backgroundColor: C.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, overflow: 'hidden' },
  menuItem: { gap: 5, borderTopWidth: 1, borderTopColor: '#ECE6DD', paddingTop: 8 },
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
