import AsyncStorage from '@react-native-async-storage/async-storage';

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'recomp' | 'gain' | 'maintain';
export type Pace = 'moderate' | 'fast';
export type Experience = 'beginner' | 'returning' | 'regular';
export type Pain = 'knees' | 'back' | 'shoulders';
export type TrainPlace = 'gym' | 'home' | 'outdoor';
export type WorkMode = 'office' | 'home' | 'hybrid';
export type Diet = 'vegetarian' | 'kosher' | 'no_dairy';
export type Tone = 'direct' | 'encouraging';

export interface WorkoutSlot {
  /** 0 = Sunday ... 6 = Saturday */
  day: number;
  /** Minutes after midnight */
  time: number;
  /** The session on this day, when he set it in the week planner; otherwise the plan's rotation */
  session?: string;
}

export type WeekendStyle = 'same' | 'normal' | 'flex';
export type Kids = 'none' | 'baby' | 'young' | 'older';
export type Relationship = 'single' | 'partner' | 'separated';
export type Chronic = 'bp' | 'diabetes' | 'heart';
export type StopReason = 'work' | 'family' | 'injury' | 'motivation' | 'never';
export type WorkLoad = 'desk' | 'mixed' | 'physical';
export type HardTime = 'evening' | 'stress' | 'boredom' | 'weekend';
export type SplitKind = 'full' | 'split3' | 'ppl' | 'upper_lower';
export type WatchKind = 'xiaomi' | 'amazfit' | 'samsung' | 'garmin' | 'fitbit' | 'none' | 'other';
export type FoodAppKind = 'zepp' | 'samsung' | 'other' | 'none';

/** The words for a broken night, by who is at home. */
export function interruptLabels(kids: Kids): { button: string; night: string; question: string } {
  if (kids === 'baby') return { button: 'התינוק העיר אותי', night: 'לילה עם התינוק', question: 'הלילה נקטע בגלל התינוק?' };
  if (kids === 'young') return { button: 'הילדים העירו אותי', night: 'לילה עם הילדים', question: 'הלילה נקטע בגלל הילדים?' };
  return { button: 'התעוררתי באמצע הלילה', night: 'לילה עם התעוררויות', question: 'התעוררת באמצע הלילה?' };
}

/** Whether to offer the broken night button at all. */
export const expectsBrokenNights = (p: { kids: Kids; nightWakeups: boolean }) => p.kids === 'baby' || p.kids === 'young' || p.nightWakeups;

export interface Profile {
  completed: boolean;
  // File fields added later: undefined means "not answered yet", shown as a gap in My File
  /** What the coach calls him */
  name?: string;
  /** One sentence in his own words: why now */
  whyNow?: string;
  chronic?: Chronic[];
  stopReason?: StopReason;
  workLoad?: WorkLoad;
  shiftWork?: boolean;
  relationship?: Relationship;
  /** Days the kids are with him (0 = Sunday), for separated parents */
  kidsDays?: number[];
  hardTimes?: HardTime[];
  watch?: WatchKind;
  foodApp?: FoodAppKind;
  /** How the week's workouts are divided. Undefined: full body */
  split?: SplitKind;
  /** Jump rope intervals at the end of every workout */
  rope?: boolean;
  /** Two abs exercises at the end of every workout */
  abs?: boolean;
  /** Moves the user picked, per split, place and session (see train/library pickKey). None: the recommendation */
  picks?: Record<string, string[]>;
  schema?: number;
  // 1. About you
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  waistCm?: number;
  // 2. Goal
  goal: Goal;
  pace: Pace;
  targetWeightKg?: number;
  // 3. Experience and limits
  experience: Experience;
  pains: Pain[];
  medicalLimit: boolean;
  // 4. Schedule
  workMode: WorkMode;
  workStart: number;
  workEnd: number;
  slots: WorkoutSlot[];
  /** Days off work and routine (0 = Sunday). Undefined: from the phone's time zone */
  weekendDays?: number[];
  /** same: the weekend is like any day; normal: later hours; flex: a weekly calorie budget, more on the weekend */
  weekendStyle?: WeekendStyle;
  sessionMinutes: 30 | 45 | 60;
  trainPlace: TrainPlace;
  homeEquipment: boolean;
  // 5. Routine
  wakeTime: number;
  bedTime: number;
  nightWakeups: boolean;
  /** Who lives at home: decides how the coach reads a broken night */
  kids: Kids;
  naps: boolean;
  mealsPerDay: 3 | 4 | 5;
  diet: Diet[];
  // 6. Coach
  tone: Tone;
  level: 'quiet' | 'normal' | 'close' | 'drill';
}

/**
 * The owner's values. Used once, to fill fields that were added to the app after
 * his profile was saved, so switching the defaults to neutral does not change his.
 */
export const OWNER_PROFILE: Profile = {
  completed: false,
  sex: 'male',
  age: 46,
  heightCm: 177,
  weightKg: 81,
  goal: 'recomp',
  pace: 'moderate',
  experience: 'returning',
  pains: [],
  medicalLimit: false,
  workMode: 'office',
  workStart: 7 * 60 + 30,
  workEnd: 17 * 60 + 30,
  slots: [
    { day: 0, time: 20 * 60 + 30 },
    { day: 3, time: 20 * 60 + 30 },
    { day: 5, time: 8 * 60 },
  ],
  sessionMinutes: 45,
  trainPlace: 'gym',
  homeEquipment: false,
  wakeTime: 6 * 60 + 30,
  bedTime: 23 * 60 + 30,
  nightWakeups: true,
  kids: 'baby',
  watch: 'xiaomi',
  foodApp: 'zepp',
  naps: false,
  mealsPerDay: 3,
  diet: [],
  tone: 'direct',
  level: 'normal',
};

/** A new user starts empty: numbers must be filled in, choices are neutral. */
export const DEFAULT_PROFILE: Profile = {
  completed: false,
  sex: 'male',
  age: 0,
  heightCm: 0,
  weightKg: 0,
  goal: 'lose',
  pace: 'moderate',
  experience: 'beginner',
  pains: [],
  medicalLimit: false,
  workMode: 'office',
  workStart: 8 * 60,
  workEnd: 17 * 60,
  slots: [],
  sessionMinutes: 45,
  trainPlace: 'gym',
  homeEquipment: false,
  wakeTime: 7 * 60,
  bedTime: 23 * 60,
  nightWakeups: false,
  kids: 'none',
  naps: false,
  mealsPerDay: 3,
  diet: [],
  tone: 'direct',
  level: 'normal',
};

const KEY = 'coach.profile.v1';
const SCHEMA = 2;

/**
 * Profiles saved before the neutral defaults existed are missing fields that were
 * silently filled from the owner's values. Write those values in, once.
 */
export function migrateProfile(saved: any): { profile: Profile; changed: boolean } {
  if (!saved?.completed || saved.schema >= SCHEMA) return { profile: { ...DEFAULT_PROFILE, ...saved }, changed: false };
  const filled: any = { ...saved };
  for (const [k, v] of Object.entries(OWNER_PROFILE)) if (filled[k] === undefined) filled[k] = v;
  filled.schema = SCHEMA;
  return { profile: filled, changed: true };
}

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    const { profile, changed } = migrateProfile(JSON.parse(raw));
    if (changed) await AsyncStorage.setItem(KEY, JSON.stringify(profile));
    return profile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(p: Profile) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...p, schema: SCHEMA }));
}
