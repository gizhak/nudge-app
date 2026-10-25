// Web demo only: in place of src/coach/tasks, which registers Android background tasks.
// Seeds a made-up person on first open, then runs the real coach once so its messages show.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import { Heebo_400Regular, Heebo_700Bold, Heebo_800ExtraBold } from '@expo-google-fonts/heebo';
import { runCoach } from '../src/coach/engine';
import { addWater } from '../src/health/water';

export const GEOFENCE_TASK = 'coach-geofence';
export const COACH_TASK = 'coach-periodic';
export const RESPONSE_TASK = 'coach-notification-response';

// The demo starts like a new user: the welcome page and the questionnaire. The made-up data
// is then shaped around his answers (see healthConnect.ts).
export function seedDemo(): Promise<void> {
  return Promise.resolve();
}

// On the phone the fonts are built into the app; on the web they load here
Font.loadAsync({ Heebo_400Regular, Heebo_700Bold, Heebo_800ExtraBold }).catch(() => undefined);

export async function handleNotificationAction() {}
export async function confirmExits() {}
export async function runCarEvents() {}
export async function verifyPlace() {}
export type PlaceCheckNote = { at: number; place: string; result: 'stay' | 'left' | 'moved' | 'unknown'; how: string };
export async function loadPlaceCheck(): Promise<PlaceCheckNote | null> {
  return null;
}

export interface CoachStatus {
  backgroundLocation: boolean;
  geofencing: boolean;
  periodic: boolean;
  places: number;
  nightGuard: boolean;
}

let ranFor = '';
export async function startCoach(): Promise<CoachStatus> {
  // Once the questionnaire is done: a few sips this morning, then the coach's run of now
  const raw = await AsyncStorage.getItem('coach.profile.v1').catch(() => null);
  const p = raw ? JSON.parse(raw) : null;
  if (p?.completed && ranFor !== raw) {
    ranFor = raw!;
    if (!(await AsyncStorage.getItem('demo.ran'))) {
      await AsyncStorage.setItem('demo.ran', '1');
      await addWater(250, new Date(Date.now() - 50 * 60000)).catch(() => undefined);
    }
    await runCoach(undefined, new Date(), { manual: true }).catch(() => []);
  }
  return { backgroundLocation: true, geofencing: true, periodic: true, places: 2, nightGuard: true };
}
