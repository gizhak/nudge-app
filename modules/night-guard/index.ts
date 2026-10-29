import { requireOptionalNativeModule } from 'expo';

export interface NightGuardConfig {
  enabled: boolean;
  /** Minutes after midnight */
  bedTime: number;
  wakeTime: number;
  /** How long after bedtime unlocks count as "still awake" */
  windowMinutes: number;
  /** Second button on the night message; empty hides it */
  interruptLabel: string;
}

interface NativeNightGuard {
  configure(config: NightGuardConfig): boolean;
  ack(night: string, baby: boolean): void;
  setGraceUntil(epochMs: number): void;
  takeInitialSharedText(): string | null;
  addListener(event: 'onSharedText', cb: (e: { text: string }) => void): { remove: () => void };
  getUnlocks(): number[];
  getLang?(): string | null;
  setLang?(lang: string): boolean;
  reload?(): boolean;
  getState(): { ack: string | null; babyNights: string[]; lastAlert: number };
  listPairedDevices(): PairedDevice[] | null;
  setCar(address: string, name: string): void;
  getCarState(): CarState;
  takeCarEvents(): CarEvent[];
  wifiNow(scan: boolean): WifiNow;
}

export interface PairedDevice {
  name: string;
  address: string;
}

export interface CarState {
  address: string | null;
  name: string | null;
  connected: boolean;
  /** When the last connect or disconnect happened, ms */
  since: number;
}

export interface CarEvent {
  type: 'connect' | 'disconnect';
  at: number;
}

const native = requireOptionalNativeModule<NativeNightGuard>('NightGuard');

/** True when the native part is in this build (not in Expo Go or old builds). */
export const nightGuardAvailable = !!native;

export function configureNightGuard(config: NightGuardConfig): boolean {
  try {
    return native ? native.configure(config) : false;
  } catch {
    return false;
  }
}

export function ackNightNative(night: string, baby: boolean) {
  try {
    native?.ack(night, baby);
  } catch {
    // best effort
  }
}

export function nightGuardState(): { ack: string | null; babyNights: string[] } {
  try {
    return native ? native.getState() : { ack: null, babyNights: [] };
  } catch {
    return { ack: null, babyNights: [] };
  }
}

/** No night messages before this moment (going out tonight). 0 clears it. */
export function setNightGrace(epochMs: number) {
  try {
    native?.setGraceUntil(epochMs);
  } catch {
    // best effort
  }
}

/** Text the app was opened with from another app's Share sheet, read once. */
export function takeInitialSharedText(): string | null {
  try {
    return native?.takeInitialSharedText() ?? null;
  } catch {
    return null;
  }
}

/** Text shared into the app while it is already running. */
export function onSharedText(cb: (text: string) => void): () => void {
  try {
    const sub = native?.addListener('onSharedText', (e) => cb(e.text));
    return () => sub?.remove();
  } catch {
    return () => undefined;
  }
}

// ---------- The car (Bluetooth) ----------

/** Paired Bluetooth devices; null when the "nearby devices" permission is missing. */
export function listPairedDevices(): PairedDevice[] | null {
  try {
    return native ? native.listPairedDevices() : [];
  } catch {
    return null;
  }
}

/** Picks the car; an empty address turns the feature off. */
export function setCar(address: string, name: string) {
  try {
    native?.setCar(address, name);
  } catch {
    // best effort
  }
}

export function carState(): CarState {
  try {
    return native ? native.getCarState() : { address: null, name: null, connected: false, since: 0 };
  } catch {
    return { address: null, name: null, connected: false, since: 0 };
  }
}

/** Connect and disconnect events not handled yet; reading them clears them. */
export function takeCarEvents(): CarEvent[] {
  try {
    return native ? native.takeCarEvents() : [];
  } catch {
    return [];
  }
}

// ---------- Wi-Fi ----------

export interface WifiNet {
  ssid: string | null;
  bssid: string;
  /** dBm: about -50 is next to the router, -70 is "3 bars", -85 is barely there */
  rssi: number;
}

export interface WifiNow {
  ok: boolean;
  /** wifi_off, permission (location off or not allowed), no_wifi, no_native */
  reason?: string;
  connected?: WifiNet | null;
  nearby: WifiNet[];
}

/** The network the phone is on and the ones around it. `scan` asks Android for a fresh scan. */
export function wifiNow(scan = false): WifiNow {
  try {
    return native ? native.wifiNow(scan) : { ok: false, reason: 'no_native', nearby: [] };
  } catch {
    return { ok: false, reason: 'permission', nearby: [] };
  }
}

/** Unlock times of the last three days, ms; empty on builds without it */
export function phoneUnlocks(): number[] {
  try {
    return native?.getUnlocks ? native.getUnlocks() : [];
  } catch {
    return [];
  }
}

/** The language chosen in the app; null when never chosen (or on a build without it) */
export function appLang(): string | null {
  try {
    if (native?.getLang) return native.getLang();
    // The browser preview: a stored choice, for testing
    return (globalThis as any).localStorage?.getItem('nudge.lang') ?? null;
  } catch {
    return null;
  }
}

export function setAppLang(lang: string): boolean {
  try {
    if (native?.setLang) return native.setLang(lang);
    (globalThis as any).localStorage?.setItem('nudge.lang', lang);
    return true;
  } catch {
    return false;
  }
}

/** Starts the app's screens again (a new language); false when it cannot, then he reopens the app */
export function reloadApp(): boolean {
  try {
    if (native?.reload) return native.reload();
    const loc = (globalThis as any).location;
    if (loc?.reload) {
      loc.reload();
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}
