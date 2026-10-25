// Two photos per exercise, start and end, from the open free-exercise-db (public-domain claim, but the photos look
// like bodybuilding.com originals: fine for testing, replace with a licensed set before a public release).
// Each Hebrew name is matched by hand and every pair was checked by eye. Generated; edit the map, not this file.
/* eslint-disable @typescript-eslint/no-require-imports */
export interface Pics { a: number; b?: number }

const P: Record<string, Pics> = {
  "Ab_Roller": { a: require('../../assets/exercises/ab_roller_0.jpg'), b: require('../../assets/exercises/ab_roller_1.jpg') },
  "Barbell_Bench_Press_-_Medium_Grip": { a: require('../../assets/exercises/barbell_bench_press_medium_grip_0.jpg'), b: require('../../assets/exercises/barbell_bench_press_medium_grip_1.jpg') },
  "Barbell_Curl": { a: require('../../assets/exercises/barbell_curl_0.jpg'), b: require('../../assets/exercises/barbell_curl_1.jpg') },
  "Barbell_Hip_Thrust": { a: require('../../assets/exercises/barbell_hip_thrust_0.jpg'), b: require('../../assets/exercises/barbell_hip_thrust_1.jpg') },
  "Barbell_Incline_Bench_Press_-_Medium_Grip": { a: require('../../assets/exercises/barbell_incline_bench_press_medium_grip_0.jpg'), b: require('../../assets/exercises/barbell_incline_bench_press_medium_grip_1.jpg') },
  "Barbell_Shoulder_Press": { a: require('../../assets/exercises/barbell_shoulder_press_0.jpg'), b: require('../../assets/exercises/barbell_shoulder_press_1.jpg') },
  "Barbell_Squat": { a: require('../../assets/exercises/barbell_squat_0.jpg'), b: require('../../assets/exercises/barbell_squat_1.jpg') },
  "Bent_Over_Barbell_Row": { a: require('../../assets/exercises/bent_over_barbell_row_0.jpg'), b: require('../../assets/exercises/bent_over_barbell_row_1.jpg') },
  "Bodyweight_Squat": { a: require('../../assets/exercises/bodyweight_squat_0.jpg'), b: require('../../assets/exercises/bodyweight_squat_1.jpg') },
  "Bodyweight_Walking_Lunge": { a: require('../../assets/exercises/bodyweight_walking_lunge_0.jpg'), b: require('../../assets/exercises/bodyweight_walking_lunge_1.jpg') },
  "Butt_Lift_Bridge": { a: require('../../assets/exercises/butt_lift_bridge_0.jpg'), b: require('../../assets/exercises/butt_lift_bridge_1.jpg') },
  "Butterfly": { a: require('../../assets/exercises/butterfly_0.jpg'), b: require('../../assets/exercises/butterfly_1.jpg') },
  "Cable_Crossover": { a: require('../../assets/exercises/cable_crossover_0.jpg'), b: require('../../assets/exercises/cable_crossover_1.jpg') },
  "Cable_Crunch": { a: require('../../assets/exercises/cable_crunch_0.jpg'), b: require('../../assets/exercises/cable_crunch_1.jpg') },
  "Cable_Rear_Delt_Fly": { a: require('../../assets/exercises/cable_rear_delt_fly_0.jpg'), b: require('../../assets/exercises/cable_rear_delt_fly_1.jpg') },
  "Cable_Rope_Overhead_Triceps_Extension": { a: require('../../assets/exercises/cable_rope_overhead_triceps_extension_0.jpg'), b: require('../../assets/exercises/cable_rope_overhead_triceps_extension_1.jpg') },
  "Close-Grip_Barbell_Bench_Press": { a: require('../../assets/exercises/close_grip_barbell_bench_press_0.jpg'), b: require('../../assets/exercises/close_grip_barbell_bench_press_1.jpg') },
  "Close-Grip_Front_Lat_Pulldown": { a: require('../../assets/exercises/close_grip_front_lat_pulldown_0.jpg'), b: require('../../assets/exercises/close_grip_front_lat_pulldown_1.jpg') },
  "Dips_-_Triceps_Version": { a: require('../../assets/exercises/dips_triceps_version_0.jpg'), b: require('../../assets/exercises/dips_triceps_version_1.jpg') },
  "Dumbbell_Bench_Press": { a: require('../../assets/exercises/dumbbell_bench_press_0.jpg'), b: require('../../assets/exercises/dumbbell_bench_press_1.jpg') },
  "Dumbbell_Bicep_Curl": { a: require('../../assets/exercises/dumbbell_bicep_curl_0.jpg'), b: require('../../assets/exercises/dumbbell_bicep_curl_1.jpg') },
  "Dumbbell_Floor_Press": { a: require('../../assets/exercises/dumbbell_floor_press_0.jpg'), b: require('../../assets/exercises/dumbbell_floor_press_1.jpg') },
  "Dumbbell_Flyes": { a: require('../../assets/exercises/dumbbell_flyes_0.jpg'), b: require('../../assets/exercises/dumbbell_flyes_1.jpg') },
  "Dumbbell_Lunges": { a: require('../../assets/exercises/dumbbell_lunges_0.jpg'), b: require('../../assets/exercises/dumbbell_lunges_1.jpg') },
  "Dumbbell_Shoulder_Press": { a: require('../../assets/exercises/dumbbell_shoulder_press_0.jpg'), b: require('../../assets/exercises/dumbbell_shoulder_press_1.jpg') },
  "Face_Pull": { a: require('../../assets/exercises/face_pull_0.jpg'), b: require('../../assets/exercises/face_pull_1.jpg') },
  "Flat_Bench_Lying_Leg_Raise": { a: require('../../assets/exercises/flat_bench_lying_leg_raise_0.jpg'), b: require('../../assets/exercises/flat_bench_lying_leg_raise_1.jpg') },
  "Goblet_Squat": { a: require('../../assets/exercises/goblet_squat_0.jpg'), b: require('../../assets/exercises/goblet_squat_1.jpg') },
  "Hammer_Curls": { a: require('../../assets/exercises/hammer_curls_0.jpg'), b: require('../../assets/exercises/hammer_curls_1.jpg') },
  "Hanging_Leg_Raise": { a: require('../../assets/exercises/hanging_leg_raise_0.jpg'), b: require('../../assets/exercises/hanging_leg_raise_1.jpg') },
  "Incline_Dumbbell_Curl": { a: require('../../assets/exercises/incline_dumbbell_curl_0.jpg'), b: require('../../assets/exercises/incline_dumbbell_curl_1.jpg') },
  "Incline_Dumbbell_Press": { a: require('../../assets/exercises/incline_dumbbell_press_0.jpg'), b: require('../../assets/exercises/incline_dumbbell_press_1.jpg') },
  "Inverted_Row": { a: require('../../assets/exercises/inverted_row_0.jpg'), b: require('../../assets/exercises/inverted_row_1.jpg') },
  "Leg_Extensions": { a: require('../../assets/exercises/leg_extensions_0.jpg'), b: require('../../assets/exercises/leg_extensions_1.jpg') },
  "Leg_Press": { a: require('../../assets/exercises/leg_press_0.jpg'), b: require('../../assets/exercises/leg_press_1.jpg') },
  "Leverage_Chest_Press": { a: require('../../assets/exercises/leverage_chest_press_0.jpg'), b: require('../../assets/exercises/leverage_chest_press_1.jpg') },
  "Lying_Leg_Curls": { a: require('../../assets/exercises/lying_leg_curls_0.jpg'), b: require('../../assets/exercises/lying_leg_curls_1.jpg') },
  "One-Arm_Dumbbell_Row": { a: require('../../assets/exercises/one_arm_dumbbell_row_0.jpg'), b: require('../../assets/exercises/one_arm_dumbbell_row_1.jpg') },
  "Plank": { a: require('../../assets/exercises/plank_1.jpg') },
  "Pullups": { a: require('../../assets/exercises/pullups_0.jpg'), b: require('../../assets/exercises/pullups_1.jpg') },
  "Push-Ups_-_Close_Triceps_Position": { a: require('../../assets/exercises/push_ups_close_triceps_position_0.jpg'), b: require('../../assets/exercises/push_ups_close_triceps_position_1.jpg') },
  "Pushups": { a: require('../../assets/exercises/pushups_0.jpg'), b: require('../../assets/exercises/pushups_1.jpg') },
  "Romanian_Deadlift": { a: require('../../assets/exercises/romanian_deadlift_0.jpg'), b: require('../../assets/exercises/romanian_deadlift_1.jpg') },
  "Seated_Cable_Rows": { a: require('../../assets/exercises/seated_cable_rows_0.jpg'), b: require('../../assets/exercises/seated_cable_rows_1.jpg') },
  "Seated_Calf_Raise": { a: require('../../assets/exercises/seated_calf_raise_0.jpg'), b: require('../../assets/exercises/seated_calf_raise_1.jpg') },
  "Side_Bridge": { a: require('../../assets/exercises/side_bridge_0.jpg'), b: require('../../assets/exercises/side_bridge_1.jpg') },
  "Side_Lateral_Raise": { a: require('../../assets/exercises/side_lateral_raise_0.jpg'), b: require('../../assets/exercises/side_lateral_raise_1.jpg') },
  "Split_Squat_with_Dumbbells": { a: require('../../assets/exercises/split_squat_with_dumbbells_0.jpg'), b: require('../../assets/exercises/split_squat_with_dumbbells_1.jpg') },
  "Standing_Calf_Raises": { a: require('../../assets/exercises/standing_calf_raises_0.jpg'), b: require('../../assets/exercises/standing_calf_raises_1.jpg') },
  "Standing_Dumbbell_Triceps_Extension": { a: require('../../assets/exercises/standing_dumbbell_triceps_extension_0.jpg'), b: require('../../assets/exercises/standing_dumbbell_triceps_extension_1.jpg') },
  "Stiff-Legged_Dumbbell_Deadlift": { a: require('../../assets/exercises/stiff_legged_dumbbell_deadlift_0.jpg'), b: require('../../assets/exercises/stiff_legged_dumbbell_deadlift_1.jpg') },
  "Superman": { a: require('../../assets/exercises/superman_0.jpg'), b: require('../../assets/exercises/superman_1.jpg') },
  "Triceps_Pushdown": { a: require('../../assets/exercises/triceps_pushdown_0.jpg'), b: require('../../assets/exercises/triceps_pushdown_1.jpg') },
  "Triceps_Pushdown_-_Rope_Attachment": { a: require('../../assets/exercises/triceps_pushdown_rope_attachment_0.jpg'), b: require('../../assets/exercises/triceps_pushdown_rope_attachment_1.jpg') },
  "Wide-Grip_Lat_Pulldown": { a: require('../../assets/exercises/wide_grip_lat_pulldown_0.jpg'), b: require('../../assets/exercises/wide_grip_lat_pulldown_1.jpg') },
};

const BY_NAME: Record<string, string> = {
  "פלאנק": "Plank",
  "לאנג׳ים": "Bodyweight_Walking_Lunge",
  "לאנג׳ים עם משקולות": "Dumbbell_Lunges",
  "סקוואט": "Barbell_Squat",
  "סקוואטים": "Bodyweight_Squat",
  "סקוואט במשקל גוף": "Bodyweight_Squat",
  "סקוואט בולגרי": "Split_Squat_with_Dumbbells",
  "גובלט סקוואט": "Goblet_Squat",
  "לחיצת כתפיים במשקולות": "Dumbbell_Shoulder_Press",
  "לחיצת כתפיים": "Dumbbell_Shoulder_Press",
  "לחיצת חזה במוט": "Barbell_Bench_Press_-_Medium_Grip",
  "דדליפט רומני": "Romanian_Deadlift",
  "דדליפט רומני במשקולות": "Stiff-Legged_Dumbbell_Deadlift",
  "שכיבות סמיכה": "Pushups",
  "שכיבות סמיכה צרות": "Push-Ups_-_Close_Triceps_Position",
  "לחיצת חזה בשיפוע במשקולות": "Incline_Dumbbell_Press",
  "חתירה במוט": "Bent_Over_Barbell_Row",
  "תאומים": "Standing_Calf_Raises",
  "פשיטת מרפקים בכבל": "Triceps_Pushdown",
  "מתח": "Pullups",
  "פולי עליון": "Wide-Grip_Lat_Pulldown",
  "לחיצת רגליים": "Leg_Press",
  "כפיפת מרפקים במוט": "Barbell_Curl",
  "כפיפת מרפקים": "Dumbbell_Bicep_Curl",
  "פרפר בכבלים": "Cable_Crossover",
  "פלאנק צד": "Side_Bridge",
  "פייס פול": "Face_Pull",
  "כפיפת פטישים": "Hammer_Curls",
  "כפיפת ברכיים במכונה": "Lying_Leg_Curls",
  "חתירה בכבל בישיבה": "Seated_Cable_Rows",
  "חתירה בכבל": "Seated_Cable_Rows",
  "הרחקה לצדדים": "Side_Lateral_Raise",
  "גשר ישבן": "Butt_Lift_Bridge",
  "פשיטת מרפקים מעל הראש": "Standing_Dumbbell_Triceps_Extension",
  "סופרמן": "Superman",
  "מקבילים": "Dips_-_Triceps_Version",
  "לחיצת חזה צרה": "Close-Grip_Barbell_Bench_Press",
  "לחיצת חזה במשקולות על הרצפה": "Dumbbell_Floor_Press",
  "כפיפות בטן בכבל": "Cable_Crunch",
  "חתירה הפוכה מתחת לשולחן": "Inverted_Row",
  "חתירה במשקולת": "One-Arm_Dumbbell_Row",
  "הרמות רגליים בשכיבה": "Flat_Bench_Lying_Leg_Raise",
  "הרמות ברכיים בתלייה": "Hanging_Leg_Raise",
  "גלגל בטן": "Ab_Roller",
  "לחיצת חזה במשקולות": "Dumbbell_Bench_Press",
  "מכונת לחיצת חזה": "Leverage_Chest_Press",
  "לחיצת חזה בשיפוע במוט": "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "פרפר במשקולות": "Dumbbell_Flyes",
  "מכונת פרפר": "Butterfly",
  "פשיטת מרפקים בחבל": "Triceps_Pushdown_-_Rope_Attachment",
  "פשיטה מעל הראש בחבל": "Cable_Rope_Overhead_Triceps_Extension",
  "פולי עליון אחיזה צרה": "Close-Grip_Front_Lat_Pulldown",
  "כפיפת מרפקים בשיפוע": "Incline_Dumbbell_Curl",
  "לחיצת כתפיים במוט": "Barbell_Shoulder_Press",
  "פרפר אחורי בכבל": "Cable_Rear_Delt_Fly",
  "פשיטת ברכיים במכונה": "Leg_Extensions",
  "היפ תראסט": "Barbell_Hip_Thrust",
  "תאומים בישיבה": "Seated_Calf_Raise",
};

/** The photos for one exercise name, or none (cardio, or a move not matched yet) */
export function picsOf(name: string): Pics | null {
  const id = BY_NAME[name.trim()];
  return id ? P[id] ?? null : null;
}

/** "מקבילים או לחיצת חזה צרה" is two moves: each with its own photos */
export function choicesOf(name: string): string[] {
  const parts = name.split(' או ').map((x) => x.trim());
  return parts.length > 1 && parts.every((p) => picsOf(p)) ? parts : [name];
}

/** True when tapping the exercise shows how it is done */
export function hasHow(name: string): boolean {
  return choicesOf(name).some((n) => !!picsOf(n));
}
