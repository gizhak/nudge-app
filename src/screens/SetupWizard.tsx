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

import { ROW, t as tr } from '../i18n';
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
          detail: tr('המרכז שדרכו כל האפליקציות מעבירות נתונים. צריך להתקין או לעדכן.', 'The hub all apps pass data through. It needs to be installed or updated.'),
          actions: [{ label: tr('התקן', 'Install'), run: () => openStore(HEALTH_CONNECT_PKG) }],
        });
      } else {
        await initialize();
        const granted = new Set((await getGrantedPermissions()).map((p) => `${p.accessType}:${p.recordType}`));
        hcOk = ['Steps', 'SleepSession', 'Nutrition', 'Weight'].every((t) => granted.has(`read:${t}`));
        out.push({
          key: 'hc',
          title: 'Health Connect',
          status: hcOk ? 'ok' : 'todo',
          detail: hcOk ? tr('מותקן, וההרשאות ל Nudge אושרו.', 'Installed, and Nudge\'s permissions are approved.') : tr('צריך לאשר ל Nudge לקרוא צעדים, שינה, אוכל ומשקל.', 'Nudge needs permission to read steps, sleep, food and weight.'),
          actions: hcOk ? [] : [{ label: tr('אשר הרשאות', 'Approve permissions'), run: async () => { await requestHealthPermissions(); check(); } }],
        });
      }
    } catch {
      out.push({ key: 'hc', title: 'Health Connect', status: 'todo', detail: tr('לא מגיב. נסה לפתוח אותו פעם אחת.', 'Not responding. Try opening it once.'), actions: [{ label: tr('פתח', 'Open'), run: () => openHealthConnectSettings() }] });
    }

    // 2. Activity and sleep: the watch app, or the phone itself
    const act = activityApp(watch);
    if (act) out.push(await appRow('activity', tr(`${act.name}: צעדים, שינה ודופק`, `${act.name}: steps, sleep and heart rate`), act, ['Steps', 'SleepSession', 'HeartRate'], hcOk));
    else if (watch === 'other') {
      // A watch not on the list: judge by whether steps actually arrive, and say exactly what to do
      const flowing = hcOk && (await phoneStepsFlowing());
      out.push({
        key: 'activity',
        title: tr('השעון שלך', 'Your watch'),
        status: flowing ? 'ok' : 'todo',
        detail: flowing
          ? tr('צעדים מגיעים. אם השעון רושם גם שינה ודופק, הם יופיעו כאן אחרי לילה אחד.', 'Steps are coming in. If the watch also records sleep and heart rate, they will show here after one night.')
          : tr('1. פתח את האפליקציה של השעון.\n2. חפש בהגדרות שלה Health Connect או שיתוף נתונים.\n3. אשר צעדים, שינה ודופק.\nאם אין שם אפשרות כזו, השעון לא יכול לשתף נתונים, והטלפון יספור צעדים במקומו.', '1. Open the watch app.\n2. Look in its settings for Health Connect or data sharing.\n3. Allow steps, sleep and heart rate.\nIf there is no such option, the watch cannot share data, and the phone will count steps instead.'),
        actions: flowing
          ? []
          : [
              { label: tr('הגדרות Health Connect', 'Health Connect settings'), run: () => openHealthConnectSettings() },
              { label: tr('השעון ברשימה בכל זאת', 'The watch is in the list anyway'), run: () => setStep('ask') },
            ],
      });
    } else {
      const steps = hcOk && (await phoneStepsFlowing());
      out.push({
        key: 'activity',
        title: tr('צעדים מהטלפון', 'Steps from the phone'),
        status: steps ? 'ok' : 'todo',
        detail: steps
          ? tr('הטלפון סופר צעדים ומעביר אותם.', 'The phone counts steps and passes them on.')
          : tr('באנדרואיד 14 ומעלה Health Connect סופר צעדים לבד. אם לא מגיעים צעדים, הפעל את זה בהגדרות שלו.', 'On Android 14 and up Health Connect counts steps by itself. If no steps come in, turn it on in its settings.'),
        actions: steps ? [] : [{ label: tr('הגדרות Health Connect', 'Health Connect settings'), run: () => openHealthConnectSettings() }],
      });
    }

    // 3. Food
    const fa = foodApp(food);
    if (food === 'other') {
      out.push({
        key: 'food',
        title: tr('אפליקציית האוכל שלך', 'Your food app'),
        status: 'info',
        detail: tr('ודא שהיא כותבת ארוחות ל Health Connect. אם אחרי ארוחה אחת לא מופיע כלום במסך התזונה, עדיף לעבור ל Zepp.', 'Make sure it writes meals to Health Connect. If after one meal nothing shows on the nutrition screen, better switch to Zepp.'),
        actions: [],
      });
    } else if (fa) {
      const row = await appRow('food', tr(`${fa.name}: אוכל`, `${fa.name}: food`), fa, ['Nutrition'], hcOk);
      if (row.status === 'todo' && (row.detail.startsWith('מותקן') || row.detail.startsWith('Installed'))) row.detail += tr(' אחרי החיבור, רשום ארוחה אחת כדי לראות שהיא מגיעה.', ' After connecting, log one meal to see that it arrives.');
      if (food === 'none') row.detail = tr('בלי אפליקציית אוכל אין תזונה. Zepp חינמית, עובדת בלי שעון, ומזהה מנה מצילום. ', 'Without a food app there is no nutrition. Zepp is free, works without a watch, and recognizes a dish from a photo. ') + row.detail;
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
      <Screen title={tr("נחבר את הנתונים", 'Let\'s connect your data')}>
        <Text style={[T.base, { fontSize: 15, lineHeight: 22 }]}>
          {tr('המאמן לומד ממה שהשעון והטלפון מודדים, וממה שאתה אוכל. שתי שאלות, ואז אגיד בדיוק מה להתקין ואיך לחבר.', 'The coach learns from what your watch and phone measure, and from what you eat. Two questions, and then I will tell you exactly what to install and how to connect it.')}
        </Text>
        <Card title={tr("איזה שעון יש לך?", 'Which watch do you have?')}>
          <Choice options={WATCHES} value={watch} onChange={setWatch} />
        </Card>
        <Card title={tr("באיזו אפליקציה אתה רושם אוכל?", 'Which app do you log food in?')}>
          <Choice options={FOOD_APPS} value={food} onChange={setFood} />
        </Card>
        <PrimaryButton
          label={tr("המשך", 'Continue')}
          onPress={async () => {
            if (!watch || !food) return;
            const p = await loadProfile();
            await saveProfile({ ...p, watch, foodApp: food });
            setStep('connect');
          }}
        />
        {(!watch || !food) && <Text style={[T.muted, { fontSize: 13 }]}>{tr('בחר תשובה לשתי השאלות.', 'Choose an answer to both questions.')}</Text>}
      </Screen>
    );
  }

  const cap = capabilities(watch, food);
  const allOk = rows?.every((r) => r.status !== 'todo');

  return (
    <Screen title={tr("מה להתקין ולחבר", 'What to install and connect')} refreshing={checking} onRefresh={check}>
      {!rows ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
      ) : (
        <>
          <Text style={[T.muted, { fontSize: 13 }]}>{tr('אחרי כל שלב חזור לכאן. הבדיקה מתעדכנת לבד.', 'After each step come back here. The check updates by itself.')}</Text>
          {rows.map((r) => (
            <Card key={r.key}>
              <View style={s.head}>
                <View style={[s.dot, { backgroundColor: r.status === 'ok' ? C.ink : r.status === 'todo' ? C.signal : C.data }]} />
                <Text style={[T.bold, { fontSize: 16, flex: 1 }]}>{r.title}</Text>
                <Text style={[T.bold, { fontSize: 13, color: r.status === 'todo' ? C.signal : C.muted }]}>
                  {r.status === 'ok' ? tr('מחובר', 'Connected') : r.status === 'todo' ? tr('לטפל', 'Fix') : tr('לבדוק', 'Check')}
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

          <Card title={tr("נוהג עם Bluetooth ברכב? (לא חובה)", 'Drive with Bluetooth in the car? (optional)')}>
            <CarPicker compact />
          </Card>

          <Card title={tr("מה המאמן יוכל לעשות", 'What the coach will be able to do')}>
            <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{tr('יעבוד:', 'Will work:')} {cap.works.join(', ')}.</Text>
            {cap.missing.length > 0 && <Text style={[T.muted, { fontSize: 14, lineHeight: 21 }]}>{tr('לא יעבוד:', 'Will not work:')} {cap.missing.join('; ')}.</Text>}
          </Card>

          <PrimaryButton label={allOk ? tr('סיום', 'Done') : tr('סיים בינתיים', 'Finish for now')} onPress={onDone} />
          <Pressable onPress={() => setStep('ask')}>
            <Text style={[T.bold, { fontSize: 14, color: C.muted, textAlign: 'center' }]}>{tr('שינוי תשובות', 'Change answers')}</Text>
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
      detail: tr(`צריך להתקין את ${app.name}, להתחבר עם החשבון שלך, ואז לחבר אותה ל Health Connect.`, `Install ${app.name}, sign in with your account, and then connect it to Health Connect.`),
      actions: [{ label: tr('התקן', 'Install'), run: () => openStore(app.pkg) }],
    };
  }
  if (state === 'installed') {
    return {
      key,
      title,
      status: 'todo',
      detail: tr(`מותקן, אבל עוד לא מגיעים ממנו נתונים. ${app.connect}${hcOk ? '' : ' קודם אשר את ההרשאות ל Health Connect למעלה.'}`, `Installed, but no data is coming from it yet. ${app.connect}${hcOk ? '' : ' First approve the Health Connect permissions above.'}`),
      actions: [{ label: tr(`פתח את ${app.name}`, `Open ${app.name}`), run: () => openApp(app.pkg) }],
    };
  }
  return { key, title, status: 'ok', detail: tr('מחובר, ונתונים מגיעים.', 'Connected, and data is coming in.'), actions: [] };
}

const s = StyleSheet.create({
  head: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: ROW, gap: 10, flexWrap: 'wrap' },
  btn: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
});
