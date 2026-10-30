import { useLocationConsent } from '../setup/LocationConsent';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { openHealthConnectDataManagement, openHealthConnectSettings } from 'react-native-health-connect';
import { openZepp } from '../apps/zepp';
import { startCoach } from '../coach/tasks';
import { requestHealthPermissions } from '../health/permissions';
import { ensurePermission } from '../notifications/schedule';
import {
  ActionKey,
  APP_PACKAGE,
  CheckItem,
  CheckStatus,
  confirmBattery,
  HC_PACKAGE,
  IntentLauncher,
  Readiness,
  runReadiness,
} from '../setup/readiness';
import { Card, PrimaryButton, Screen } from '../ui/components';
import { C, T } from '../ui/theme';

import { ROW } from '../i18n';
const COLOR: Record<CheckStatus, string> = { ok: C.accent, warn: C.warn, error: C.bad, manual: C.warn };
const LABEL: Record<CheckStatus, string> = { ok: 'תקין', warn: 'לבדוק', error: 'חסר', manual: 'ידני' };

const store = (pkg: string) =>
  Linking.openURL(`market://details?id=${pkg}`).catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`));

export default function ReadinessScreen({
  onContinue,
  onGoCoach,
  onOpenWizard,
  onEditProfile,
  continueLabel,
}: {
  onContinue?: () => void;
  onGoCoach?: () => void;
  onOpenWizard?: () => void;
  onEditProfile?: () => void;
  continueLabel?: string;
}) {
  const [result, setResult] = useState<Readiness | null>(null);
  const [running, setRunning] = useState(false);
  const [askConsent, consentSheet] = useLocationConsent();

  const check = useCallback(async () => {
    setRunning(true);
    try {
      setResult(await runReadiness());
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    check();
    // Coming back from a settings screen: check again
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  const act = async (key: ActionKey) => {
    try {
      switch (key) {
        case 'install_hc':
          return store(HC_PACKAGE);
        case 'request_hc':
          await requestHealthPermissions();
          break;
        case 'open_hc':
          return openHealthConnectSettings();
        case 'open_hc_data':
          return openHealthConnectDataManagement();
        case 'install_zepp':
          return store('com.huami.watch.hmwatchmanager');
        case 'install_watch_app':
          return store('com.xiaomi.wearable');
        case 'open_zepp':
          return openZepp();
        case 'request_notifications':
          if (!(await ensurePermission())) await Linking.openSettings();
          break;
        case 'request_location': {
          if (!(await askConsent())) break;
          const fg = await Location.requestForegroundPermissionsAsync();
          const bg = fg.granted ? await Location.requestBackgroundPermissionsAsync() : null;
          if (!bg?.granted) await Linking.openSettings();
          await startCoach();
          break;
        }
        case 'go_coach':
          return onGoCoach?.();
        case 'start_coach':
          await startCoach();
          break;
        case 'battery':
          try {
            await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
              data: `package:${APP_PACKAGE}`,
            });
          } catch {
            await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
              data: `package:${APP_PACKAGE}`,
            });
          }
          break;
        case 'confirm_battery':
          await confirmBattery();
          break;
        case 'edit_profile':
          return onEditProfile?.();
        case 'open_wizard':
          return onOpenWizard?.();
      }
    } catch {
      // A settings screen that does not exist on this phone: fall back to the app's settings page
      await Linking.openSettings().catch(() => undefined);
    }
    check();
  };

  const groups = result ? [...new Set(result.items.map((i) => i.group))] : [];
  const ready = result && result.errors === 0;

  return (
    <Screen title="בדיקת מוכנות" refreshing={running} onRefresh={check}>
      {!result ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
      ) : (
        <>
          <Card>
            <Text style={[T.bold, { fontSize: 20, color: ready ? C.accent : C.bad }]}>
              {ready ? 'מוכן לעבודה' : `${result.errors} דברים לתקן`}
            </Text>
            <Text style={[T.muted, { fontSize: 14 }]}>
              {ready
                ? result.warnings
                  ? `יש ${result.warnings} דברים שכדאי לבדוק, אבל הם לא חוסמים.`
                  : 'כל החיבורים, ההרשאות והנתונים תקינים.'
                : 'בלי התיקונים האלה חלק מהמאמן לא יעבוד. כל שורה כוללת כפתור לתיקון.'}
            </Text>
          </Card>
          {groups.map((g) => (
            <Card key={g} title={g}>
              {result.items
                .filter((i) => i.group === g)
                .map((i) => (
                  <Item key={i.id} item={i} onAction={act} />
                ))}
            </Card>
          ))}
          {onOpenWizard && (
            <Pressable onPress={onOpenWizard} style={s.wizard}>
              <Text style={[T.bold, { textAlign: 'center', fontSize: 15 }]}>אשף החיבורים: מה להתקין ואיך לחבר</Text>
            </Pressable>
          )}
          {onContinue && <PrimaryButton label={continueLabel ?? 'המשך'} onPress={onContinue} />}
        </>
      )}
      {consentSheet}
    </Screen>
  );
}

function Item({ item, onAction }: { item: CheckItem; onAction: (k: ActionKey) => void }) {
  return (
    <View style={s.item}>
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: COLOR[item.status] }]} />
        <Text style={[T.bold, { fontSize: 15, flex: 1 }]}>{item.title}</Text>
        <Text style={[T.bold, { fontSize: 13, color: COLOR[item.status] }]}>{LABEL[item.status]}</Text>
      </View>
      <Text style={[T.muted, s.detail]}>{item.detail}</Text>
      {item.actions && (
        <View style={s.actions}>
          {item.actions.map((a) => (
            <Pressable key={a.key} onPress={() => onAction(a.key)} style={s.btn}>
              <Text style={[T.bold, { fontSize: 14, color: C.accent }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wizard: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, paddingVertical: 12, backgroundColor: C.card },
  item: { gap: 4, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.track },
  head: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  detail: { fontSize: 13, lineHeight: 19, marginRight: 18 },
  actions: { flexDirection: ROW, gap: 8, marginRight: 18, marginTop: 4 },
  btn: { borderWidth: 1.5, borderColor: C.accent, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 },
});
