import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { BODY_TYPES } from './scale';

export const RECORD_TYPES = [
  'Steps',
  'ActiveCaloriesBurned',
  'Nutrition',
  'Weight',
  'SleepSession',
  'HeartRate',
  'RestingHeartRate',
  'ExerciseSession',
  'Distance',
  'Hydration',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

const PERMISSIONS = [
  ...RECORD_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })),
  // Smart scale body composition: optional, never reported as missing
  ...BODY_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })),
  { accessType: 'write' as const, recordType: 'Weight' as const },
  { accessType: 'write' as const, recordType: 'Hydration' as const },
  { accessType: 'read' as const, recordType: 'BackgroundAccessPermission' as const },
];

export type SetupResult = { ok: true; missing: RecordType[] } | { ok: false; reason: string };

let pending: Promise<SetupResult> | null = null;

/** Checks availability, initializes and requests access once per app session; screens share the result. */
export function setupHealthConnect(): Promise<SetupResult> {
  if (!pending) {
    pending = doSetup().catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}

async function doSetup(): Promise<SetupResult> {
  const status = await getSdkStatus();
  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    pending = null;
    return { ok: false, reason: 'Health Connect לא זמין במכשיר, או שדרוש עדכון' };
  }
  if (!(await initialize())) {
    pending = null;
    return { ok: false, reason: 'האתחול של Health Connect נכשל' };
  }
  await requestPermission(PERMISSIONS);
  const granted = await getGrantedPermissions();
  const readable = new Set(granted.filter((p) => p.accessType === 'read').map((p) => p.recordType));
  return { ok: true, missing: RECORD_TYPES.filter((t) => !readable.has(t)) };
}

/** Shows the Health Connect permission dialog again, e.g. from the readiness screen. */
export async function requestHealthPermissions(): Promise<void> {
  pending = null;
  await initialize();
  await requestPermission(PERMISSIONS);
}
