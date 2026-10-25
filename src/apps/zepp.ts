import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';

export const ZEPP_PACKAGE = 'com.huami.watch.hmwatchmanager';

/** Opens Zepp; if it is not installed (or hidden), opens its Play Store page instead. Returns false on the fallback. */
export async function openZepp(): Promise<boolean> {
  try {
    IntentLauncher.openApplication(ZEPP_PACKAGE);
    return true;
  } catch {
    await Linking.openURL(`market://details?id=${ZEPP_PACKAGE}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${ZEPP_PACKAGE}`),
    );
    return false;
  }
}

export const MI_FITNESS_PACKAGE = 'com.xiaomi.wearable';

/** Opens Mi Fitness so it syncs the watch. */
export async function openMiFitness(): Promise<boolean> {
  try {
    IntentLauncher.openApplication(MI_FITNESS_PACKAGE);
    return true;
  } catch {
    await Linking.openURL(`market://details?id=${MI_FITNESS_PACKAGE}`).catch(() => {});
    return false;
  }
}

/** Opens any installed app by package; if missing, its Play Store page. Returns false on the fallback. */
export async function openApp(pkg: string): Promise<boolean> {
  try {
    IntentLauncher.openApplication(pkg);
    return true;
  } catch {
    await openStore(pkg);
    return false;
  }
}

export async function openStore(pkg: string) {
  await Linking.openURL(`market://details?id=${pkg}`).catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`));
}
