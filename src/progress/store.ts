// Checkpoints and their photos. Photos are copied into the app's private storage: other apps
// cannot see them, they are not in the gallery and not in the backup file.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { Checkpoint, sorted } from './journey';

const KEY = 'progress.checkpoints.v1';
const CONSENT = 'progress.photoConsent.v1';
const DIR = () => `${FS.documentDirectory}progress/`;

export async function loadCheckpoints(): Promise<Checkpoint[]> {
  try {
    return sorted(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'));
  } catch {
    return [];
  }
}

async function save(list: Checkpoint[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(sorted(list)));
}

/** Copies a picked photo into private storage and returns the new path. */
export async function keepPhoto(sourceUri: string, name: string): Promise<string> {
  await FS.makeDirectoryAsync(DIR(), { intermediates: true }).catch(() => undefined);
  const to = `${DIR()}${name}.jpg`;
  await FS.deleteAsync(to, { idempotent: true }).catch(() => undefined);
  await FS.copyAsync({ from: sourceUri, to });
  return to;
}

export async function addCheckpoint(c: Checkpoint) {
  const list = await loadCheckpoints();
  await save([...list.filter((x) => x.id !== c.id), c]);
}

/** Removes a checkpoint and its photos from the phone. */
export async function deleteCheckpoint(id: string) {
  const list = await loadCheckpoints();
  const c = list.find((x) => x.id === id);
  for (const p of [c?.front, c?.side, c?.back]) if (p) await FS.deleteAsync(p, { idempotent: true }).catch(() => undefined);
  await save(list.filter((x) => x.id !== id));
}

/** Removes photo files that a checkpoint no longer uses. */
export async function dropPhotos(paths: (string | undefined)[]) {
  for (const p of paths) if (p) await FS.deleteAsync(p, { idempotent: true }).catch(() => undefined);
}

export const photoConsentGiven = async () => (await AsyncStorage.getItem(CONSENT)) === 'yes';
export const givePhotoConsent = () => AsyncStorage.setItem(CONSENT, 'yes');
