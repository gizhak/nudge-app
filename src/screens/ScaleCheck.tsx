import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BODY_TITLES, BODY_TYPES, BodyType, readScaleCheck, ScaleCheck, WeighIn } from '../health/scale';
import { requestHealthPermissions } from '../health/permissions';
import { sourceLabel } from '../config/sources';
import { Sheet } from '../ui/Sheet';
import { C, fmt, T } from '../ui/theme';

import { ROW, LOCALE, t as tr } from '../i18n';
const when = (d: Date) =>
  `${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' })} ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;

function Row({ w }: { w: WeighIn }) {
  const parts = [
    w.weight != null && tr(`${fmt(w.weight, 1)} ק"ג`, `${fmt(w.weight, 1)} kg`),
    w.fatPct != null && tr(`שומן ${fmt(w.fatPct, 1)}%`, `fat ${fmt(w.fatPct, 1)}%`),
    w.leanKg != null && tr(`רזה ${fmt(w.leanKg, 1)}`, `lean ${fmt(w.leanKg, 1)}`),
    w.waterKg != null && tr(`מים ${fmt(w.waterKg, 1)}`, `water ${fmt(w.waterKg, 1)}`),
    w.boneKg != null && tr(`עצם ${fmt(w.boneKg, 1)}`, `bone ${fmt(w.boneKg, 1)}`),
    w.bmr != null && `BMR ${fmt(w.bmr)}`,
  ].filter(Boolean);
  return (
    <View style={s.row}>
      <Text style={[T.muted, { fontSize: 12 }]}>
        {when(w.time)} · {sourceLabel(w.source)}
      </Text>
      <Text style={[T.bold, { fontSize: 14 }]}>{parts.join(' · ')}</Text>
      {w.issues.map((i) => (
        <Text key={i} style={[T.bold, { fontSize: 12, color: C.warn }]}>
          {i}
        </Text>
      ))}
    </View>
  );
}

/** Shows exactly what the smart scale sends, to compare with the same weigh-ins in Zepp. */
export function ScaleCheckSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ScaleCheck | null>(null);
  const load = () => {
    setData(null);
    readScaleCheck().then(setData, () => setData({ status: {} as ScaleCheck['status'], weighIns: [] }));
  };
  useEffect(() => {
    if (open) load();
  }, [open]);

  const types: BodyType[] = ['Weight', ...BODY_TYPES];
  const denied = data ? types.filter((t) => data.status[t] === 'denied') : [];
  const arriving = data ? types.filter((t) => typeof data.status[t] === 'number') : [];
  const fromScale = data?.weighIns.filter((w) => w.source !== 'com.gizhak.coach') ?? [];
  const issues = fromScale.filter((w) => w.issues.length).length;

  return (
    <Sheet open={open} onClose={onClose} title={tr("בדיקת המשקל החכם", 'Smart scale check')}>
      {!data ? (
        <ActivityIndicator color={C.accent} />
      ) : (
        <>
          <View style={{ gap: 6 }}>
            {types.map((t) => {
              const st = data.status[t];
              const ok = typeof st === 'number';
              return (
                <View key={t} style={s.status}>
                  <Text style={[T.base, { fontSize: 14, flex: 1 }]}>{BODY_TITLES[t]}</Text>
                  <Text style={[T.bold, { fontSize: 13, color: ok ? C.accent : st === 'denied' ? C.warn : C.muted }]}>
                    {ok ? tr(`מגיע (${st} ב 30 יום)`, `Arriving (${st} in 30 days)`) : st === 'denied' ? tr('אין הרשאה', 'No permission') : tr('לא מגיע', 'Not arriving')}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
            {arriving.length <= 1
              ? tr('מהמשקל מגיע רק המשקל עצמו. אחוז השומן ושאר הנתונים נשארים ב Zepp ולא עוברים ל Health Connect, ולכן המאמן יעריך אותם ממדידות סרט.', 'Only the weight itself comes from the scale. Body fat and the other numbers stay in Zepp and do not reach Health Connect, so the coach will estimate them from tape measurements.')
              : tr(`מגיעים ${arriving.length} סוגי נתונים. השווה את השורות למטה עם אותן שקילות ב Zepp: אם המספרים זהים, החיבור תקין.`, `${arriving.length} kinds of data arrive. Compare the rows below with the same weigh-ins in Zepp: if the numbers match, the connection is fine.`)}
            {issues ? tr(` ${issues} שקילות עם ערכים שלא מסתדרים, מסומנות בכתום.`, ` ${issues} weigh-ins with values that do not add up, marked in orange.`) : ''}
          </Text>

          {denied.length > 0 && (
            <Pressable
              onPress={async () => {
                await requestHealthPermissions();
                load();
              }}
              style={s.btn}
            >
              <Text style={[T.bold, { fontSize: 14, textAlign: 'center' }]}>{tr('אשר גישה ל', 'Allow access to ')}{denied.map((t) => BODY_TITLES[t]).join(', ')}</Text>
            </Pressable>
          )}

          {fromScale.length ? (
            <View style={{ gap: 8 }}>
              <Text style={[T.bold, { fontSize: 15 }]}>{tr('שקילות אחרונות', 'Recent weigh-ins')}</Text>
              {fromScale.slice(0, 8).map((w) => (
                <Row key={w.time.getTime()} w={w} />
              ))}
            </View>
          ) : (
            <Text style={[T.muted, { fontSize: 14 }]}>{tr('אין שקילות מהמשקל ב 30 הימים האחרונים.', 'No weigh-ins from the scale in the last 30 days.')}</Text>
          )}
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  status: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  row: { gap: 2, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  btn: { paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.track },
});
