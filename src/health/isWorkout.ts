// What counts as a workout: what he started on the watch himself.
// Watches log walks on their own (to the car, with the dog); counting them made the app
// say "you trained today" on a rest day.

const WALK = 79;
const HIKING = 37;
const WHEELCHAIR = 82;
/** Health Connect: the session was detected by the watch, not started by him */
const AUTOMATICALLY_RECORDED = 2;
/** Health Connect: he started it himself on the watch */
const ACTIVELY_RECORDED = 1;
const MIN = 60000;

type SessionLike = { startTime: string; endTime: string; exerciseType?: number; metadata?: { recordingMethod?: number } };

export function isWorkout(r: SessionLike): boolean {
  const minutes = (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / MIN;
  if (minutes < 10) return false;
  // He presses start on the watch when he trains: that counts, whatever the sport, a walk too.
  // What the watch noticed by itself does not.
  const how = r.metadata?.recordingMethod;
  if (how === ACTIVELY_RECORDED) return true;
  // What the watch noticed by itself counts only when it is no walk and long enough to be training:
  // a gym session the watch caught without him pressing start is still a workout
  if (how === AUTOMATICALLY_RECORDED) return r.exerciseType !== WALK && r.exerciseType !== HIKING && r.exerciseType !== WHEELCHAIR && minutes >= 20;
  // The app did not say how it was recorded: a walk is not a workout, however long
  return r.exerciseType !== WALK && r.exerciseType !== HIKING && r.exerciseType !== WHEELCHAIR;
}

export const workoutsOnly = <R extends SessionLike>(records: R[] | undefined | null): R[] => (records ?? []).filter(isWorkout);
