import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState as RNAppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, SdkAvailabilityStatus } from 'react-native-health-connect';
import { openApp, openStore } from '../apps/zepp';
import { requestHealthPermissions } from '../health/permissions';
import { FoodAppKind, loadProfile, saveProfile, WatchKind } from '../profile/profile';
import { appState, AppState, phoneStepsFlowing } from '../setup/connection';
import { activityApp, AppInfo, capabilities, FOOD_APPS, foodApp, HEALTH_CONNECT_PKG, WATCHES } from '../setup/devices';
import { Card, PrimaryButton, Screen } from '../ui/components';
import { Choice } from '../ui/inputs';
import CarPicker from './CarPicker';
import { C, T } from '../ui/theme';

import { ROW } from '../i18n';
type Status = 'ok' | 'todo' | 'info';

interface Row {
  key: string;
  title: string;
  status: Status;
  detail: string;
  actions: { label: string; run: () => void }[];
}

/**
 * Asks what the user has, then lists exactly what to install and connect,
 * and checks each one by the data that actually arrives.
 */
export default function SetupWizard({ onDone }: { onDone: () => void }) {
  const [watch, setWatch] = useState<WatchKind | undefined>(undefined);
  const [food, setFood] = useState<FoodAppKind | undefined>(undefined);
  const [step, setStep] = useState<'ask' | 'connect'>('ask');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setWatch(p.watch);
      setFood(p.foodApp);
    });
  }, []);

  const check = useCallback(async () => {
    if (step !== 'connect') return;
    setChecking(true);
    const out: Row[] = [];

    // 1. Health Connect itself
    let hcOk = false;
    try {
      const sdk = await getSdkStatus();
      if (sdk !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        out.push({
          key: 'hc',
          title: 'Health Connect',
          status: 'todo',
          detail: 'המרכז שדרכו כל האפליקציות מעבירות נתונים. צריך להתקין או לעדכן.',
          actions: [{ label: 'התקן', run: () => openStore(HEALTH_CONNECT_PKG) }],
        });
      } else {
        await initialize();
        const granted = new Set((await getGrantedPermissions()).map((p) => `${p.accessType}:${p.recordType}`));
        hcOk = ['Steps', 'SleepSession', 'Nutrition', 'Weight'].every((t) => granted.has(`read:${t}`));
        out.push({
          key: 'hc',
          title: 'Health Connect',
          status: hcOk ? 'ok' : 'todo',
          detail: hcOk ? 'מותקן, וההרשאות ל Nudge אושרו.' : 'צריך לאשר ל Nudge לקרוא צעדים, שינה, אוכל ומשקל.',
          actions: hcOk ? [] : [{ label: 'אשר הרשאות', run: async () => { await requestHealthPermissions(); check(); } }],
        });
      }
    } catch {
      out.push({ key: 'hc', title: 'Health Connect', status: 'todo', detail: 'לא מגיב. נסה לפתוח אותו פעם אחת.', actions: [{ label: 'פתח', run: () => openHealthConnectSettings() }] });
    }

    // 2. Activity and sleep: the watch app, or the phone itself
    const act = activityApp(watch);
    if (act) out.push(await appRow('activity', `${act.name}: צעדים, שינה ודופק`, act, ['Steps', 'SleepSession', 'HeartRate'], hcOk));
    else if (watch === 'other') {
      // A watch not on the list: judge by whether steps actually arrive, and say exactly what to do
      const flowing = hcOk && (await phoneStepsFlowing());
      out.push({
        key: 'activity',
        title: 'השעון שלך',
        status: flowing ? 'ok' : 'todo',
        detail: flowing
          ? 'צעדים מגיעים. אם השעון רושם גם שינה ודופק, הם יופיעו כאן אחרי לילה אחד.'
          : '1. פתח את האפליקציה של השעון.\n2. חפש בהגדרות שלה Health Connect או שיתוף נתונים.\n3. אשר צעדים, שינה ודופק.\nאם אין שם אפשרות כזו, השעון לא יכול לשתף נתונים, והטלפון יספור צעדים במקומו.',
        actions: flowing
          ? []
          : [
              { label: 'הגדרות Health Connect', run: () => openHealthConnectSettings() },
              { label: 'השעון ברשימה בכל זאת', run: () => setStep('ask') },
            ],
      });
    } else {
      const steps = hcOk && (await phoneStepsFlowing());
      out.push({
        key: 'activity',
        title: 'צעדים מהטלפון',
        status: steps ? 'ok' : 'todo',
        detail: steps
          ? 'הטלפון סופר צעדים ומעביר אותם.'
          : 'באנדרואיד 14 ומעלה Health Connect סופר צעדים לבד. אם לא מגיעים צעדים, הפעל את זה בהגדרות שלו.',
        actions: steps ? [] : [{ label: 'הגדרות Health Connect', run: () => openHealthConnectSettings() }],
      });
    }

    // 3. Food
    const fa = foodApp(food);
    if (food === 'other') {
      out.push({
        key: 'food',
        title: 'אפליקציית האוכל שלך',
        status: 'info',
        detail: 'ודא שהיא כותבת ארוחות ל Health Connect. אם אחרי ארוחה אחת לא מופיע כלום במסך התזונה, עדיף לעבור ל Zepp.',
        actions: [],
      });
    } else if (fa) {
      const row = await appRow('food', `${fa.name}: אוכל`, fa, ['Nutrition'], hcOk);
      if (row.status === 'todo' && row.detail.startsWith('מותקן')) row.detail += ' אחרי החיבור, רשום ארוחה אחת כדי לראות שהיא מגיעה.';
      if (food === 'none') row.detail = 'בלי אפליקציית אוכל אין תזונה. Zepp חינמית, עובדת בלי שעון, ומזהה מנה מצילום. ' + row.detail;
      out.push(row);
    }

    setRows(out);
    setChecking(false);
  }, [step, watch, food]);

  useEffect(() => {
    check();
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, [check]);

  if (step === 'ask') {
    return (
      <Screen title="נחבר את הנתונים">
        <Text style={[T.base, { fontSize: 15, lineHeight: 22 }]}>
          המאמן לומד ממה שהשעון והטלפון מודדים, וממה שאתה אוכל. שתי שאלות, ואז אגיד בדיוק מה להתקין ואיך לחבר.
        </Text>
        <Card title="איזה שעון יש לך?">
          <Choice options={WATCHES} value={watch} onChange={setWatch} />
        </Card>
        <Card title="באיזו אפליקציה אתה רושם אוכל?">
          <Choice options={FOOD_APPS} value={food} onChange={setFood} />
        </Card>
        <PrimaryButton
          label="המשך"
          onPress={async () => {
            if (!watch || !food) return;
            const p = await loadProfile();
            await saveProfile({ ...p, watch, foodApp: food });
            setStep('connect');
          }}
        />
        {(!watch || !food) && <Text style={[T.muted, { fontSize: 13 }]}>בחר תשובה לשתי השאלות.</Text>}
      </Screen>
    );
  }

  const cap = capabilities(watch, food);
  const allOk = rows?.every((r) => r.status !== 'todo');

  return (
    <Screen title="מה להתקין ולחבר" refreshing={checking} onRefresh={check}>
      {!rows ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
      ) : (
        <>
          <Text style={[T.muted, { fontSize: 13 }]}>אחרי כל שלב חזור לכאן. הבדיקה מתעדכנת לבד.</Text>
          {rows.map((r) => (
            <Card key={r.key}>
              <View style={s.head}>
                <View style={[s.dot, { backgroundColor: r.status === 'ok' ? C.ink : r.status === 'todo' ? C.signal : C.data }]} />
                <Text style={[T.bold, { fontSize: 16, flex: 1 }]}>{r.title}</Text>
                <Text style={[T.bold, { fontSize: 13, color: r.status === 'todo' ? C.signal : C.muted }]}>
                  {r.status === 'ok' ? 'מחובר' : r.status === 'todo' ? 'לטפל' : 'לבדוק'}
                </Text>
              </View>
              <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{r.detail}</Text>
              {r.actions.length > 0 && (
                <View style={s.actions}>
                  {r.actions.map((a) => (
                    <Pressable key={a.label} style={s.btn} onPress={a.run}>
                      <Text style={[T.bold, { color: '#fff', fontSize: 14 }]}>{a.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>
          ))}

          <Card title="נוהג עם Bluetooth ברכב? (לא חובה)">
            <CarPicker compact />
          </Card>

          <Card title="מה המאמן יוכל לעשות">
            <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>יעבוד: {cap.works.join(', ')}.</Text>
            {cap.missing.length > 0 && <Text style={[T.muted, { fontSize: 14, lineHeight: 21 }]}>לא יעבוד: {cap.missing.join('; ')}.</Text>}
          </Card>

          <PrimaryButton label={allOk ? 'סיום' : 'סיים בינתיים'} onPress={onDone} />
          <Pressable onPress={() => setStep('ask')}>
            <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>שינוי תשובות</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

async function appRow(key: string, title: string, app: AppInfo, types: Parameters<typeof appState>[1], hcOk: boolean): Promise<Row> {
  const state: AppState = await appState(app.pkg, types);
  if (state === 'missing') {
    return {
      key,
      title,
      status: 'todo',
      detail: `צריך להתקין את ${app.name}, להתחבר עם החשבון שלך, ואז לחבר אותה ל Health Connect.`,
      actions: [{ label: 'התקן', run: () => openStore(app.pkg) }],
    };
  }
  if (state === 'installed') {
    return {
      key,
      title,
      status: 'todo',
      detail: `מותקן, אבל עוד לא מגיעים ממנו נתונים. ${app.connect}${hcOk ? '' : ' קודם אשר את ההרשאות ל Health Connect למעלה.'}`,
      actions: [{ label: `פתח את ${app.name}`, run: () => openApp(app.pkg) }],
    };
  }
  return { key, title, status: 'ok', detail: 'מחובר, ונתונים מגיעים.', actions: [] };
}

const s = StyleSheet.create({
  head: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: ROW, gap: 10, flexWrap: 'wrap' },
  btn: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
});
