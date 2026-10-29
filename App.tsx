import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import Splash from './src/ui/Splash';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ComponentProps, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { lookNow } from './src/coach/look';
import { markSeen, unreadCount } from './src/coach/unread';
import ChatTabIcon from './src/ui/ChatTabIcon';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { handleNotificationAction, startCoach } from './src/coach/tasks';
import * as Notifications from 'expo-notifications';
import { applyReminders, ensurePermission } from './src/notifications/schedule';
import { loadSettings } from './src/notifications/settings';
import { loadAndApply } from './src/profile/bootstrap';
import { loadProfile, Profile } from './src/profile/profile';
import { Route, routeFor } from './src/notifications/route';
import { activityApp } from './src/setup/devices';
import { openApp } from './src/apps/zepp';
import Onboarding from './src/screens/Onboarding';
import MyFile from './src/screens/MyFile';
import SetupWizard from './src/screens/SetupWizard';
import { onSharedText, takeInitialSharedText } from './modules/night-guard';
import ReadinessScreen from './src/screens/ReadinessScreen';
import { runReadiness } from './src/setup/readiness';
import FoodScreen from './src/screens/FoodScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatScreen from './src/screens/ChatScreen';
import { GearContext } from './src/ui/gear';
import TodayScreen from './src/screens/TodayScreen';
import TrainScreen from './src/screens/TrainScreen';
import { C, FONT } from './src/ui/theme';

import { ROW } from './src/i18n';
type Tab = 'today' | 'train' | 'food' | 'progress' | 'settings';
type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: 'today', label: 'היום', icon: 'home-outline', iconOn: 'home' },
  { key: 'train', label: 'אימון', icon: 'barbell-outline', iconOn: 'barbell' },
  { key: 'food', label: 'תזונה', icon: 'restaurant-outline', iconOn: 'restaurant' },
  { key: 'progress', label: 'התקדמות', icon: 'trending-up-outline', iconOn: 'trending-up' },
  { key: 'settings', label: 'המאמן', icon: 'chatbubble-ellipses-outline', iconOn: 'chatbubble-ellipses' },
];

/** The app under the opening animation, which stays until the profile is loaded. */
export default function App() {
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AppInner onReady={() => setReady(true)} />
      {shown && <Splash ready={ready} onDone={() => setShown(false)} />}
    </View>
  );
}

function AppInner({ onReady }: { onReady: () => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Android back closes the settings instead of leaving the app
  useEffect(() => {
    if (!settingsOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSettingsOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [settingsOpen]);
  const [wizardOpen, setWizardOpen] = useState(false);
  /** A menu shared into the app from another app */
  const [sharedMenu, setSharedMenu] = useState<string | undefined>(undefined);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  useEffect(() => {
    const open = (text: string) => {
      setSharedMenu(text);
      setTab('food');
    };
    const first = takeInitialSharedText();
    if (first) open(first);
    return onSharedText(open);
  }, []);
  /** One section of the questionnaire, opened from My File */
  const [editStep, setEditStep] = useState<number | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessTick, setReadinessTick] = useState(0);
  // Bumped after the questionnaire so every screen re-reads the new plan
  const [version, setVersion] = useState(0);

  // Load the profile first: it decides the plan that reminders and the coach use
  const boot = async () => {
    const { profile: p } = await loadAndApply();
    setProfile(p);
    try {
      if (await ensurePermission()) await applyReminders(await loadSettings());
      await startCoach();
    } catch {
      // Reminders are best effort; the coach screen reports problems
    }
    // Silent health check of every connection; the home screen shows a banner on failures
    runReadiness()
      .then(() => setReadinessTick((t) => t + 1))
      .catch(() => undefined);
  };

  useEffect(() => {
    boot();
  }, []);

  // A tap on a notification leads to the place where that thing gets done
  const handled = useRef(new Set<string>());
  const [weighTick, setWeighTick] = useState(0);
  const [waistTick, setWaistTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  // Coach messages not seen yet: a count on the chat tab, and one swing when it grows or he comes back to it
  const [unread, setUnread] = useState(0);
  const [ring, setRing] = useState(0);
  const unreadRef = useRef(0);
  const tabRef = useRef<string>('today');
  const refreshUnread = (cameBack: boolean) => {
    if (tabRef.current === 'settings') {
      markSeen().catch(() => 0);
      unreadRef.current = 0;
      setUnread(0);
      return;
    }
    unreadCount()
      .then((n) => {
        if (n > unreadRef.current || (cameBack && n > 0)) setRing((r) => r + 1);
        unreadRef.current = n;
        setUnread(n);
      })
      .catch(() => undefined);
  };
  useEffect(() => {
    tabRef.current = tab;
    if (tab === 'settings') {
      markSeen().catch(() => 0);
      unreadRef.current = 0;
      setUnread(0);
    }
  }, [tab]);
  useEffect(() => {
    refreshUnread(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTick]);
  const [checkpointTick, setCheckpointTick] = useState(0);
  const [reportTick, setReportTick] = useState(0);
  const [runTick, setRunTick] = useState(0);
  const [cravingTick, setCravingTick] = useState(0);
  /** Takes him where a message points: a tab, and something opened in it. */
  const goRoute = (route: Route) => {
    setRescheduleOpen(false);
    setSettingsOpen(false);
    setTab(route.tab);
    if (route.focus === 'weigh') setWeighTick((t) => t + 1);
    if (route.focus === 'checkpoint') setCheckpointTick((t) => t + 1);
    if (route.focus === 'report') setReportTick((t) => t + 1);
    if (route.focus === 'run') setRunTick((t) => t + 1);
    if (route.focus === 'craving') setCravingTick((t) => t + 1);
    if (route.focus === 'workout') setRescheduleOpen(true);
    if (route.focus === 'waist') setWaistTick((t) => t + 1);
    if (route.open === 'readiness') setReadinessOpen(true);
    if (route.open === 'activityApp') {
      loadProfile()
        .then((p) => {
          const a = activityApp(p.watch);
          if (a) openApp(a.pkg);
        })
        .catch(() => undefined);
    }
  };

  const onResponse = (r: Notifications.NotificationResponse) => {
    const id = `${r.notification.request.identifier}:${r.actionIdentifier}`;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    const data = r.notification.request.content.data as Record<string, unknown> | undefined;
    if (r.actionIdentifier === 'reschedule') {
      Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => undefined);
      setTab('train');
      setRescheduleOpen(true);
      return;
    }
    // A button pressed in the shade ("I drank") shows on the open screen right away
    handleNotificationAction(r.actionIdentifier, data, r.notification.request.identifier)
      .catch(() => undefined)
      .finally(() => setDataTick((t) => t + 1));
    if (r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    goRoute(routeFor(typeof data?.topic === 'string' ? data.topic : null));
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    // The app was closed and opened by the tap
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (r) {
          onResponse(r);
          Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => sub.remove();
  }, []);


  useEffect(() => {
    if (profile) onReady();
  }, [profile, onReady]);

  // Opening the app runs the coach: a meal logged in Zepp a minute ago gets its answer now, not at the
  // next background run (Android does not tell us when another app writes a meal)
  useEffect(() => {
    if (!profile?.completed) return;
    const look = () =>
      lookNow().then((n) => {
        if (n > 0) setDataTick((t) => t + 1);
        refreshUnread(true);
      });
    look();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && look());
    // Messages from background runs while the app is open
    const id = setInterval(() => refreshUnread(false), 30_000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [profile?.completed]);

  // The opening animation covers this while the profile loads
  if (!profile) return <View style={s.root} />;

  if (editStep !== null && profile.completed) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <Onboarding
            key={editStep}
            initial={profile}
            startStep={editStep}
            single
            onCancel={() => setEditStep(null)}
            onDone={async () => {
              setEditStep(null);
              await boot();
              setVersion((v) => v + 1);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (fileOpen && profile.completed && !editing) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <MyFile
            profile={profile}
            onEdit={(step) => setEditStep(step)}
            onRedoAll={() => {
              setFileOpen(false);
              setEditing(true);
            }}
            onClose={() => setFileOpen(false)}
            onReload={async () => {
              await boot();
              setVersion((v) => v + 1);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!profile.completed || editing) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <Onboarding
            initial={profile}
            onCancel={profile.completed ? () => setEditing(false) : undefined}
            onDone={async () => {
              setEditing(false);
              await boot();
              setVersion((v) => v + 1);
              setTab('today');
              setWizardOpen(true);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (wizardOpen && profile.completed) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <SetupWizard
            onDone={async () => {
              setWizardOpen(false);
              await boot();
              setVersion((v) => v + 1);
              setReadinessOpen(true);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (readinessOpen) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <ReadinessScreen
            continueLabel="סיום"
            onContinue={() => {
              setReadinessOpen(false);
              setReadinessTick((t) => t + 1);
            }}
            onGoCoach={() => {
              setReadinessOpen(false);
              setTab('settings');
            }}
            onEditProfile={() => {
              setReadinessOpen(false);
              setEditing(true);
            }}
            onOpenWizard={() => {
              setReadinessOpen(false);
              setWizardOpen(true);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        {settingsOpen ? (
          <View style={{ flex: 1 }}>
            <SettingsScreen
              onEditProfile={() => setFileOpen(true)}
              onOpenReadiness={() => setReadinessOpen(true)}
              onEditSchedule={() => setEditStep(3)}
              onClose={() => setSettingsOpen(false)}
            />
          </View>
        ) : (
        <GearContext.Provider value={() => setSettingsOpen(true)}>
        <View style={{ flex: 1 }} key={version}>
          {tab === 'today' && <TodayScreen onOpenTraining={() => setTab('train')} onReschedule={() => { setTab('train'); setRescheduleOpen(true); }} onOpenProgress={() => setTab('progress')} onOpenFood={() => setTab('food')} onOpenReadiness={() => setReadinessOpen(true)} onOpenCoach={() => setTab('settings')} readinessTick={readinessTick} dataTick={dataTick} />}
          {tab === 'train' && <TrainScreen openReschedule={rescheduleOpen} onEditDays={() => setEditStep(3)} openRun={runTick} />}
          {tab === 'food' && <FoodScreen sharedMenu={sharedMenu} openCraving={cravingTick} />}
          {tab === 'progress' && <ProgressScreen focusWeigh={weighTick} openCheckpoint={checkpointTick} openReport={reportTick} focusWaist={waistTick} />}
          {tab === 'settings' && <ChatScreen onRoute={goRoute} tick={dataTick} />}
          {/* Content fades into the ground above the tab bar instead of being cut off */}
          {tab !== 'settings' && <BottomFade />}
        </View>
        </GearContext.Provider>
        )}
        <View style={s.bar}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  // A tab tapped from the settings goes to that tab
                  setSettingsOpen(false);
                  setTab(t.key);
                  setRescheduleOpen(false);
                }}
                style={[s.tab, on && s.tabOn]}
                accessibilityRole="tab"
                accessibilityLabel={t.key === 'settings' && unread && !on ? `${t.label}, ${unread} הודעות שלא נקראו` : t.label}
                accessibilityState={{ selected: on }}
              >
                {t.key === 'settings' ? (
                  <ChatTabIcon on={on} name={on ? t.iconOn : t.icon} count={on ? 0 : unread} ring={ring} />
                ) : (
                  <Ionicons name={on ? t.iconOn : t.icon} size={22} color={on ? '#fff' : C.muted} />
                )}
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/** A strip that goes from clear to the page color, so scrolling content melts away above the bar. */
function BottomFade() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 36 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bg} stopOpacity="0" />
            <Stop offset="1" stopColor={C.bg} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  // A floating bar of icons: the active one on a dark tile, no labels
  bar: {
    flexDirection: ROW,
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 26,
    height: 64,
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  tab: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.ink },
});
