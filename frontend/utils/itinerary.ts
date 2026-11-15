import type { DayPlan } from '../types/models';

export const NEW_ACTIVITY_TEXT = 'New custom activity...';

// Each helper returns a new array and new objects along the changed path, and
// leaves its input untouched, so React state is never mutated in place.

function mapDay(
  days: readonly DayPlan[],
  dayIndex: number,
  change: (activities: readonly string[]) => string[],
): DayPlan[] {
  return days.map((day, index) =>
    index === dayIndex ? { ...day, activities: change(day.activities) } : day,
  );
}

export function updateActivity(
  days: readonly DayPlan[],
  dayIndex: number,
  activityIndex: number,
  value: string,
): DayPlan[] {
  return mapDay(days, dayIndex, (activities) =>
    activities.map((activity, index) => (index === activityIndex ? value : activity)),
  );
}

export function removeActivity(
  days: readonly DayPlan[],
  dayIndex: number,
  activityIndex: number,
): DayPlan[] {
  return mapDay(days, dayIndex, (activities) =>
    activities.filter((_, index) => index !== activityIndex),
  );
}

export function addActivity(days: readonly DayPlan[], dayIndex: number): DayPlan[] {
  return mapDay(days, dayIndex, (activities) => [...activities, NEW_ACTIVITY_TEXT]);
}
