// The app's language and the layout direction that comes with it. Hebrew is the default and stays
// exactly as it was; English is chosen in settings and takes effect from the next start, because
// the styles are made once, when the app starts.
//
// Text is written in place, both languages side by side: t('ארוחת בוקר', 'Breakfast'). A text
// with no English yet shows in Hebrew, so nothing is ever blank.
import { appLang } from '../../modules/night-guard';

export type Lang = 'he' | 'en';

export const LANG: Lang = appLang() === 'en' ? 'en' : 'he';
export const RTL = LANG === 'he';

/** A row in reading order: right to left in Hebrew */
export const ROW = (RTL ? 'row-reverse' : 'row') as 'row-reverse' | 'row';
/** Text aligned to where reading starts, and to where it ends */
export const START = (RTL ? 'right' : 'left') as 'right' | 'left';
export const END = (RTL ? 'left' : 'right') as 'left' | 'right';
/** Across a column (alignItems, alignSelf): the reading start side, and the end side */
export const SIDE_START = (RTL ? 'flex-end' : 'flex-start') as 'flex-end' | 'flex-start';
export const SIDE_END = (RTL ? 'flex-start' : 'flex-end') as 'flex-start' | 'flex-end';
/** Arrows: "go on / open" points the way reading goes; "back" the other way */
export const CHEVRON_ON = (RTL ? 'chevron-back' : 'chevron-forward') as 'chevron-back' | 'chevron-forward';
export const CHEVRON_BACK = (RTL ? 'chevron-forward' : 'chevron-back') as 'chevron-forward' | 'chevron-back';
/** Dates and numbers */
export const LOCALE = RTL ? 'he-IL' : 'en-US';

/** The text in the app's language; Hebrew when there is no English yet */
export function t(he: string, en?: string): string {
  return LANG === 'en' && en != null ? en : he;
}
