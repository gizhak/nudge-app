// Every move the user can pick, by muscle group and by the least equipment it needs.
// A session's checklist shows the groups of its recommended moves, and in each group every move
// the training place allows. Picks are kept per split, place and session, so switching back keeps them.
import type { Exercise } from '../config/goals';

import { t } from '../i18n';
export type Group = 'chest' | 'triceps' | 'back' | 'biceps' | 'shoulders' | 'legs' | 'hams' | 'calves' | 'core';
/** body: nothing needed. equip: dumbbells or a band at home. gym: bars, cables, machines */
export type Gear = 'body' | 'equip' | 'gym';

export const GROUP_NAME: Record<Group, string> = {
  chest: t('חזה', 'Chest'),
  triceps: t('יד אחורית', 'Triceps'),
  back: t('גב', 'Back'),
  biceps: t('יד קדמית', 'Biceps'),
  shoulders: t('כתפיים', 'Shoulders'),
  legs: t('רגליים', 'Legs'),
  hams: t('ירך אחורית וישבן', 'Hamstrings and glutes'),
  calves: t('תאומים', 'Calves'),
  core: t('בטן וגב תחתון', 'Abs and lower back'),
};

export interface Move {
  name: string;
  group: Group;
  gear: Gear;
  sets: number;
  reps: string;
}

const m = (name: string, group: Group, gear: Gear, sets: number, reps: string): Move => ({ name, group, gear, sets, reps });

export const MOVES: Move[] = [
  m('לחיצת חזה במוט', 'chest', 'gym', 4, '6 עד 8'),
  m('לחיצת חזה במשקולות', 'chest', 'gym', 4, '8 עד 10'),
  m('מכונת לחיצת חזה', 'chest', 'gym', 3, '10 עד 12'),
  m('לחיצת חזה בשיפוע במשקולות', 'chest', 'gym', 3, '8 עד 10'),
  m('לחיצת חזה בשיפוע במוט', 'chest', 'gym', 3, '8 עד 10'),
  m('פרפר בכבלים', 'chest', 'gym', 3, '12'),
  m('פרפר במשקולות', 'chest', 'gym', 3, '12'),
  m('מכונת פרפר', 'chest', 'gym', 3, '12'),
  m('לחיצת חזה במשקולות על הרצפה', 'chest', 'equip', 3, '10'),
  m('שכיבות סמיכה', 'chest', 'body', 3, '10'),

  m('מקבילים', 'triceps', 'gym', 3, '8 עד 10'),
  m('לחיצת חזה צרה', 'triceps', 'gym', 3, '8 עד 10'),
  m('פשיטת מרפקים בכבל', 'triceps', 'gym', 3, '12'),
  m('פשיטת מרפקים בחבל', 'triceps', 'gym', 3, '12'),
  m('פשיטה מעל הראש בחבל', 'triceps', 'gym', 2, '12'),
  m('פשיטת מרפקים מעל הראש', 'triceps', 'equip', 2, '12'),
  m('שכיבות סמיכה צרות', 'triceps', 'body', 3, '8'),

  m('מתח', 'back', 'gym', 4, '6 עד 8'),
  m('פולי עליון', 'back', 'gym', 3, '10'),
  m('פולי עליון אחיזה צרה', 'back', 'gym', 3, '10'),
  m('חתירה במוט', 'back', 'gym', 4, '8'),
  m('חתירה בכבל בישיבה', 'back', 'gym', 3, '10'),
  m('חתירה בכבל', 'back', 'gym', 3, '10'),
  m('פייס פול', 'back', 'gym', 3, '15'),
  m('חתירה במשקולת', 'back', 'equip', 3, '10 לכל יד'),
  m('חתירה עם גומייה', 'back', 'equip', 3, '12'),
  m('חתירה הפוכה מתחת לשולחן', 'back', 'body', 3, '10'),

  m('כפיפת מרפקים במוט', 'biceps', 'gym', 3, '10'),
  m('כפיפת מרפקים בשיפוע', 'biceps', 'gym', 3, '12'),
  m('כפיפת מרפקים', 'biceps', 'equip', 2, '12'),
  m('כפיפת פטישים', 'biceps', 'equip', 3, '12'),

  m('לחיצת כתפיים במשקולות', 'shoulders', 'gym', 3, '8 עד 10'),
  m('לחיצת כתפיים במוט', 'shoulders', 'gym', 3, '8'),
  m('פרפר אחורי בכבל', 'shoulders', 'gym', 3, '15'),
  m('לחיצת כתפיים', 'shoulders', 'equip', 3, '10'),
  m('הרחקה לצדדים', 'shoulders', 'equip', 3, '12 עד 15'),

  m('סקוואט', 'legs', 'gym', 4, '6 עד 8'),
  m('לחיצת רגליים', 'legs', 'gym', 3, '10'),
  m('פשיטת ברכיים במכונה', 'legs', 'gym', 3, '12'),
  m('גובלט סקוואט', 'legs', 'equip', 3, '10'),
  m('לאנג׳ים עם משקולות', 'legs', 'equip', 3, '10 לכל רגל'),
  m('לאנג׳ים', 'legs', 'body', 3, '10 לכל רגל'),
  m('סקוואט בולגרי', 'legs', 'body', 3, '8 לכל רגל'),
  m('סקוואט במשקל גוף', 'legs', 'body', 3, '15'),

  m('דדליפט רומני', 'hams', 'gym', 3, '8'),
  m('כפיפת ברכיים במכונה', 'hams', 'gym', 3, '12'),
  m('היפ תראסט', 'hams', 'gym', 3, '10'),
  m('דדליפט רומני במשקולות', 'hams', 'equip', 3, '10'),
  m('גשר ישבן', 'hams', 'body', 3, '15'),

  m('תאומים', 'calves', 'gym', 3, '15'),
  m('תאומים בישיבה', 'calves', 'gym', 3, '15'),

  m('פלאנק', 'core', 'body', 3, '40 שניות'),
  m('פלאנק צד', 'core', 'body', 2, '30 שניות'),
  m('סופרמן', 'core', 'body', 3, '12'),
  m('הרמות ברכיים בתלייה', 'core', 'gym', 3, '12'),
  m('כפיפות בטן בכבל', 'core', 'gym', 3, '15'),
  m('גלגל בטן', 'core', 'equip', 3, '10'),
];

const BY_NAME = new Map(MOVES.map((x) => [x.name, x]));

/** The move behind a name; "X או Y" counts as X */
export function moveOf(name: string): Move | undefined {
  return BY_NAME.get(name) ?? BY_NAME.get(name.split(' או ')[0].trim());
}

/** What the place allows: the gym has everything, home has what is there */
export function gearFor(place: 'gym' | 'home' | 'outdoor', homeEquipment?: boolean): Gear[] {
  if (place === 'gym') return ['body', 'equip', 'gym'];
  return homeEquipment ? ['body', 'equip'] : ['body'];
}

/** Minutes a move takes with rest: about two a set, plus setting up */
export const minutesOf = (e: Pick<Exercise, 'sets'>) => e.sets * 2 + 1;

/** The key picks are kept under */
export const pickKey = (split: string, place: string, session: string) => `${split}:${place}:${session}`;

export interface Checklist {
  groups: { group: Group; name: string; moves: (Move & { rec: boolean })[] }[];
}

/**
 * The checklist for one session: the groups of its recommended moves, in their order, and in each
 * group every move the gear allows. A recommended move keeps the session's own sets and reps.
 */
export function checklistOf(recommended: Exercise[], gear: Gear[]): Checklist {
  const recByName = new Map<string, Exercise>();
  const order: Group[] = [];
  for (const e of recommended) {
    const mv = moveOf(e.name);
    if (!mv) continue;
    recByName.set(mv.name, e);
    if (!order.includes(mv.group)) order.push(mv.group);
  }
  return {
    groups: order.map((g) => ({
      group: g,
      name: GROUP_NAME[g],
      moves: MOVES.filter((x) => x.group === g && (gear.includes(x.gear) || recByName.has(x.name))).map((x) => {
        const r = recByName.get(x.name);
        return { ...x, sets: r?.sets ?? x.sets, reps: r?.reps ?? x.reps, rec: !!r };
      }),
    })),
  };
}

/** Picked names back into exercises, in the checklist's order (groups as recommended) */
export function exercisesOf(picked: string[], list: Checklist): Exercise[] {
  const set = new Set(picked);
  return list.groups.flatMap((g) => g.moves.filter((x) => set.has(x.name)).map((x) => ({ name: x.name, sets: x.sets, reps: x.reps })));
}

/** The recommended picks: the session's moves, "X או Y" as X */
export function recommendedPicks(recommended: Exercise[]): string[] {
  return recommended.map((e) => moveOf(e.name)?.name).filter((x): x is string => !!x);
}
