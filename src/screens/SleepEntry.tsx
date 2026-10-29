// A night the watch missed, entered by hand: when he went to bed and when he woke up. Both start
// from a guess (the phone's unlocks, or his usual times); the app works out the hours.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { guessNight, NightGuess } from '../sleep/guess';
import { ManualNight, saveManual } from '../sleep/manual';
import { Sheet } from '../ui/Sheet';
import { Question, TimeStepper } from '../ui/inputs';
import { C, FONT, T } from '../ui/theme';

import { SIDE_START, t as tr } from '../i18n';
const MIN = 60000;
const dayStart = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const minuteOf = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
/** Bedtime after noon belongs to the evening before the morning */
const bedAt = (d0: number, m: number) => (m >= 12 * 60 ? d0 - (1440 - m) * MIN : d0 + m * MIN);

export function hoursText(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return tr(`${m} דקות`, `${m} minutes`);
  const hs = h === 1 ? tr('שעה', 'an hour') : h === 2 ? tr('שעתיים', 'two hours') : tr(`${h} שעות`, `${h} hours`);
  return m ? tr(`${hs} ו ${m} דקות`, `${hs} and ${m} minutes`) : hs;
}

export default function SleepEntry({ open, morning, onClose, onSaved }: { open: boolean; morning: number; onClose: () => void; onSaved: (n: ManualNight) => void }) {
  const [g, setG] = useState<NightGuess | null>(null);
  const [bed, setBed] = useState(23 * 60);
  const [wake, setWake] = useState(7 * 60);
  const d0 = dayStart(morning);

  useEffect(() => {
    if (!open) return;
    guessNight(morning)
      .then((x) => {
        setG(x);
        setBed(minuteOf(x.bed));
        setWake(minuteOf(x.wake));
      })
      .catch(() => undefined);
  }, [open, morning]);

  const bedT = bedAt(d0, bed);
  const wakeT = d0 + wake * MIN;
  const min = Math.round((wakeT - bedT) / MIN);
  const ok = min >= 60 && min <= 16 * 60;

  const save = async () => {
    if (!ok) return;
    const n = await saveManual(bedT, wakeT);
    onSaved(n);
  };

  return (
    <Sheet open={open} onClose={onClose} title={tr("הלילה, בהזנה ידנית", 'Last night, entered by hand')}>
      <Question title={tr("מתי הלכת לישון?", 'When did you go to sleep?')}>
        <TimeStepper value={bed} step={15} onChange={setBed} />
      </Question>
      <Question title={tr("מתי קמת?", 'When did you get up?')} hint={g?.from === 'phone' ? tr('לפי הפעם הראשונה שפתחת את הטלפון בבוקר. בדרך כלל קמים קצת לפני.', 'By the first time you unlocked the phone in the morning. People usually get up a little before.') : undefined}>
        <TimeStepper value={wake} step={15} onChange={setWake} />
      </Question>
      <View style={s.total}>
        <Text style={[T.muted, { fontSize: 13 }]}>{tr('יוצא', 'Comes to')}</Text>
        <Text style={[T.bold, { fontSize: 22, fontFamily: FONT.black }]}>{ok ? hoursText(min) : tr('השעות לא מסתדרות', 'The hours do not add up')}</Text>
      </View>
      {g && (
        <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>
          {g.from === 'phone' ? tr('התחלתי מהזמן הארוך ביותר בלילה שבו הטלפון לא נפתח. תקן אם צריך.', 'I started from the longest stretch of the night when the phone was not opened. Fix it if needed.') : tr('התחלתי מהשעות הרגילות שלך. תקן לפי מה שהיה.', 'I started from your usual hours. Fix it to what really happened.')} {tr('הלילה יישמר באפליקציה בלבד, ויסומן כהזנה ידנית.', 'The night is kept in the app only, and marked as entered by hand.')}
        </Text>
      )}
      <Pressable onPress={save} disabled={!ok} style={({ pressed }) => [s.save, !ok && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
        <Text style={[T.bold, { color: '#fff', fontSize: 16, textAlign: 'center' }]}>{tr('לשמור', 'Save')}</Text>
      </Pressable>
    </Sheet>
  );
}

const s = StyleSheet.create({
  total: { backgroundColor: C.bg, borderRadius: 16, padding: 12, gap: 2, alignItems: SIDE_START },
  save: { backgroundColor: C.ink, borderRadius: 14, paddingVertical: 13 },
});
