import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { looksLikeMenu, openLens } from '../apps/lens';
import { GOALS, caloriesFor } from '../config/goals';
import { adviseMenu, Dish, MenuAdvice } from '../nutrition/menu';
import { loadAndApply } from '../profile/bootstrap';
import { Card, PrimaryButton } from '../ui/components';
import { C, FONT, T } from '../ui/theme';

/** Paste a restaurant menu, get the dishes that fit the goal and the ones to skip. */
export default function MenuAdvisor({ kcal, protein, initialText }: { kcal: number; protein: number; initialText?: string }) {
  const [text, setText] = useState(initialText ?? '');
  const [advice, setAdvice] = useState<MenuAdvice | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const analyze = async (menu = text) => {
    setNote(null);
    if (menu.trim().length < 5) {
      setNote('אין טקסט לנתח. הדבק את התפריט קודם.');
      return;
    }
    const { profile } = await loadAndApply();
    const result = adviseMenu(menu, {
      hour: new Date().getHours(),
      proteinLeft: Math.max(0, GOALS.proteinG - protein),
      kcalLeft: caloriesFor(new Date()) - kcal,
      vegetarian: profile.diet.includes('vegetarian'),
    });
    setAdvice(result);
    if (!result.total) setNote('לא זיהיתי מנות בטקסט. כל מנה צריכה להיות בשורה נפרדת.');
  };

  // After "photograph menu": when he comes back from Lens with the text copied, analyze it at once
  const lensAt = useRef(0);
  const lastClip = useRef('');
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (st) => {
      if (st !== 'active' || Date.now() - lensAt.current > 10 * 60 * 1000) return;
      const clip = await Clipboard.getStringAsync().catch(() => '');
      if (clip && clip !== lastClip.current && looksLikeMenu(clip)) {
        lastClip.current = clip;
        lensAt.current = 0;
        setText(clip);
        analyze(clip);
      }
    });
    return () => sub.remove();
  }, []);

  // Opened from another app's Share sheet
  useEffect(() => {
    if (initialText && initialText.trim()) {
      setText(initialText);
      analyze(initialText);
    }
  }, [initialText]);

  const photograph = async () => {
    setNote(null);
    lensAt.current = Date.now();
    lastClip.current = await Clipboard.getStringAsync().catch(() => '');
    if (!(await openLens())) {
      lensAt.current = 0;
      setNote('לא הצלחתי לפתוח את Google Lens. פתח אותו בעצמך, העתק את הטקסט וחזור לכאן.');
    }
  };

  const paste = async () => {
    const clip = await Clipboard.getStringAsync().catch(() => '');
    if (!clip.trim()) {
      setNote('הלוח ריק. העתק קודם את טקסט התפריט.');
      return;
    }
    setText(clip);
    analyze(clip);
  };

  return (
    <Card title="מה להזמין במסעדה">
      <Text style={[T.base, s.help]}>
        צלם את התפריט, ב Google Lens בחר "טקסט" ואז "העתק", וחזור לכאן. הניתוח מתחיל לבד. אפשר גם לשתף טקסט ל Nudge מכל אפליקציה.
      </Text>
      <PrimaryButton label="צלם תפריט" onPress={photograph} />
      <Pressable onPress={paste} style={s.secondary}>
        <Text style={[T.bold, { textAlign: 'center', color: C.ink }]}>הדבק תפריט שכבר העתקת</Text>
      </Pressable>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder="או הקלד כאן, מנה בכל שורה"
        placeholderTextColor={C.muted}
        style={s.input}
        textAlignVertical="top"
      />
      {text.trim().length > 0 && (
        <Pressable onPress={() => analyze()} style={s.secondary}>
          <Text style={[T.bold, { textAlign: 'center', color: C.ink }]}>נתח שוב</Text>
        </Pressable>
      )}
      {note && <Text style={[T.bold, { color: C.warn, fontSize: 14 }]}>{note}</Text>}

      {advice && advice.total > 0 && (
        <View style={{ gap: 10 }}>
          <Section title="מומלץ" color={C.accent} dishes={advice.best} empty="אין מנה שמתאימה באמת למטרה." />
          <Section title="עדיף לוותר" color={C.bad} dishes={advice.avoid} empty="אין מנה בעייתית במיוחד." />
          {advice.tips.map((t) => (
            <Text key={t} style={[T.base, s.tip]}>
              {t}
            </Text>
          ))}
          <Text style={[T.muted, { fontSize: 12 }]}>
            נבדקו {advice.total} שורות, {advice.unknown} לא זוהו. הדירוג לפי מרכיבים ושיטת הכנה, בלי גודל מנה. אחרי האוכל, צלם ב Zepp.
          </Text>
        </View>
      )}
    </Card>
  );
}

function Section({ title, color, dishes, empty }: { title: string; color: string; dishes: Dish[]; empty: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[T.bold, { fontSize: 16, color }]}>{title}</Text>
      {dishes.length === 0 ? (
        <Text style={[T.muted, { fontSize: 14 }]}>{empty}</Text>
      ) : (
        dishes.map((d) => (
          <View key={d.name} style={[s.dish, { borderRightColor: color }]}>
            <Text style={[T.bold, { fontSize: 15 }]}>{d.name}</Text>
            <Text style={[T.muted, { fontSize: 13 }]}>{d.reasons.join(', ')}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  help: { fontSize: 14, lineHeight: 21 },
  input: {
    minHeight: 90,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: C.track,
    borderRadius: 12,
    padding: 10,
    fontFamily: FONT.regular,
    fontSize: 14,
    textAlign: 'right',
    color: C.ink,
  },
  secondary: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, paddingVertical: 10 },
  dish: { borderRightWidth: 4, paddingRight: 10, gap: 2 },
  tip: { fontSize: 14, lineHeight: 21 },
});
