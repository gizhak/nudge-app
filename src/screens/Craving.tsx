import { useEffect, useState } from 'react';
import { readMealsSince } from '../health/history';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { advise, CravingKind, findFood, Food, FOODS, KIND_LABEL, personalFoods } from '../nutrition/cravings';
import { C, FONT, T } from '../ui/theme';

import { ROW, SIDE_END, START, t } from '../i18n';
const KINDS: CravingKind[] = ['sweet', 'salty', 'cold', 'savory', 'drink'];

/** "I feel like something": pick or type it, and the coach says whether now is the time, and what instead. */
export default function Craving({ kcalLeft, proteinLeft, bedTime }: { kcalLeft: number; proteinLeft: number; bedTime: number }) {
  const [kind, setKind] = useState<CravingKind | null>(null);
  const [text, setText] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  // What he logged in the last 90 days: his foods, with his portions
  const [mine, setMine] = useState<Food[]>([]);
  /** What fits now first; off keeps the list in its usual order */
  const [fitFirst, setFitFirst] = useState(true);
  useEffect(() => {
    readMealsSince(90)
      .then((items) => setMine(personalFoods(items)))
      .catch(() => undefined);
  }, []);

  const found = text.trim() ? findFood(text, mine).slice(0, 25) : [];
  const list = text.trim()
    ? found
    : kind
      ? [...mine.filter((f) => f.kinds.includes(kind)).slice(0, 8), ...FOODS.filter((f) => f.kinds.includes(kind)).sort((a, b) => a.kcal - b.kcal)]
      : [];
  // Every item judged for right now: black fits, a tag for a small portion, red with what instead
  const ctx = { now: new Date(), kcalLeft, proteinLeft, bedTime };
  const RANK = { go: 0, small: 1, swap: 2 } as const;
  const judged = list.map((f, i) => ({ f, i, a: advise(f, ctx, mine) }));
  if (fitFirst) judged.sort((x, y) => RANK[x.a.call] - RANK[y.a.call] || x.i - y.i);

  if (food) {
    const a = advise(food, { now: new Date(), kcalLeft, proteinLeft, bedTime }, mine);
    const color = a.call === 'go' ? C.ink : a.call === 'small' ? C.warn : C.signal;
    return (
      <View style={{ gap: 12 }}>
        <View style={[s.verdict, { borderColor: color }]}>
          <Text style={[T.bold, { fontSize: 20, color }]}>{a.title}</Text>
          {a.lines.map((l) => (
            <Text key={l} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
              {l}
            </Text>
          ))}
        </View>
        {a.swaps.length > 0 && (
          <View style={{ gap: 6 }}>
            {a.swaps.map((f) => (
              <Pressable key={f.id} onPress={() => setFood(f)} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[T.bold, { fontSize: 15 }]}>{f.name}</Text>
                  <Text style={[T.muted, { fontSize: 12 }]}>
                    {f.portion} {t('· חלבון', '· protein')} {Math.round(f.protein)} {t('· סוכר', '· sugar')} {Math.round(f.sugar)}
                  </Text>
                </View>
                <Text style={[T.bold, { fontSize: 15 }]}>{f.kcal}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable onPress={() => setFood(null)} hitSlop={8}>
          <Text style={[T.bold, { fontSize: 14, color: C.muted, textDecorationLine: 'underline' }]}>{t('משהו אחר', 'Something else')}</Text>
        </Pressable>
        <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{t('הערכים הם הערכה למנה רגילה. אם אכלת, רשום כרגיל באפליקציית האוכל.', 'Values are an estimate for a normal portion. If you ate it, log it as usual in the food app.')}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t("מה בא לך? למשל גלידה", 'What do you feel like? e.g. ice cream')}
        placeholderTextColor={C.muted}
        style={s.input}
      />
      {!text.trim() && (
        <View style={s.kinds}>
          {KINDS.map((k) => (
            <Pressable key={k} onPress={() => setKind(k === kind ? null : k)} style={[s.kind, kind === k && s.kindOn]}>
              <Text style={[T.bold, { fontSize: 14, color: kind === k ? '#fff' : C.ink }]}>{KIND_LABEL[k]}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {text.trim() && !found.length && (
        <Text style={[T.muted, { fontSize: 14, lineHeight: 21 }]}>
          {t('לא מכיר את "', 'Don\'t know "')}{text.trim()}{t('". נסה מילה אחרת, או צלם ב Zepp: מה שתרשום שם יופיע כאן בפעם הבאה.', '". Try another word, or snap it in Zepp: what you log there will show up here next time.')}
        </Text>
      )}
      {judged.length > 1 && (
        <View style={s.sortRow}>
          <Text style={[T.muted, { fontSize: 13, flex: 1 }]}>
            {judged.filter((j) => j.a.call !== 'swap').length} {t('מתאימים עכשיו,', 'fit right now,')} {judged.filter((j) => j.a.call === 'swap').length} {t('לא', 'not')}
          </Text>
          <Pressable onPress={() => setFitFirst(!fitFirst)} style={[s.sort, fitFirst && s.kindOn]} hitSlop={6}>
            <Text style={[T.bold, { fontSize: 13, color: fitFirst ? '#fff' : C.ink }]}>{t('מה מתאים קודם', 'What fits first')}</Text>
          </Pressable>
        </View>
      )}
      {judged.map(({ f, a }) => {
        const no = a.call === 'swap';
        const alt = no ? a.swaps[0] : undefined;
        return (
          <Pressable key={f.id} onPress={() => setFood(f)} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[T.bold, { fontSize: 15, color: no ? C.bad : C.ink }]}>{f.name}</Text>
              <Text style={[T.muted, { fontSize: 12 }]}>{f.mine ? t(`שלך · ${f.portion}`, `Yours · ${f.portion}`) : f.portion}</Text>
              {alt && (
                <Text style={[T.base, { fontSize: 12, color: C.ink }]} numberOfLines={1}>
                  {t('במקום:', 'Instead:')} {alt.name}, {alt.kcal} {t('קלוריות', 'calories')}
                </Text>
              )}
            </View>
            <View style={{ alignItems: SIDE_END, gap: 2 }}>
              <Text style={[T.bold, { fontSize: 15, color: no ? C.bad : C.ink }]}>{f.kcal}</Text>
              {no ? <Text style={[T.bold, { fontSize: 11, color: C.bad }]}>{t('לא עכשיו', 'Not now')}</Text> : a.call === 'small' ? <Text style={[T.bold, { fontSize: 11, color: C.warn }]}>{t('מנה קטנה', 'Small portion')}</Text> : null}
            </View>
          </Pressable>
        );
      })}
      {!text.trim() && !kind && <Text style={[T.muted, { fontSize: 13 }]}>{t('בחר כיוון או כתוב מה בא לך, ואגיד לך אם עכשיו זה הזמן, ומה במקום.', 'Pick a direction or type what you feel like, and I will tell you if now is the time, and what to have instead.')}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 1, borderColor: C.track, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlign: START, fontFamily: FONT.regular, color: C.ink, backgroundColor: C.card },
  kinds: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  kind: { borderWidth: 1, borderColor: C.track, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.card },
  kindOn: { backgroundColor: C.ink, borderColor: C.ink },
  sortRow: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  sort: { borderWidth: 1, borderColor: C.track, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.card },
  item: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  verdict: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 8 },
});
