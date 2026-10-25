import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';

/**
 * Opens Google Lens on the camera. Lens lives inside the Google app on most phones;
 * the deep link and the package names differ between versions, so try them in order.
 */
export async function openLens(): Promise<boolean> {
  try {
    await Linking.openURL('googleapp://lens');
    return true;
  } catch {
    // fall through
  }
  for (const pkg of ['com.google.ar.lens', 'com.google.android.googlequicksearchbox']) {
    try {
      IntentLauncher.openApplication(pkg);
      return true;
    } catch {
      // try the next one
    }
  }
  return false;
}

/** Enough lines with letters to be a menu, not a link or a phone number. */
export function looksLikeMenu(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => /[א-תa-zA-Z]{3,}/.test(l));
  return lines.length >= 3;
}
