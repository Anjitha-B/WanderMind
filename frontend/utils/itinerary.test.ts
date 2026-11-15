import type { DayPlan } from '../types/models';
import { addActivity, NEW_ACTIVITY_TEXT, removeActivity, updateActivity } from './itinerary';

function sample(): DayPlan[] {
  return [
    { day: 1, activities: ['Tram 28', 'Alfama'] },
    { day: 2, activities: ['Belém'] },
  ];
}

/** Freezes every level, so any in-place mutation throws. */
function frozen(): DayPlan[] {
  const days = sample();
  days.forEach((day) => {
    Object.freeze(day.activities);
    Object.freeze(day);
  });
  return Object.freeze(days) as DayPlan[];
}

describe('itinerary edits', () => {
  it('updateActivity changes one activity', () => {
    expect(updateActivity(frozen(), 0, 1, 'Fado')).toEqual([
      { day: 1, activities: ['Tram 28', 'Fado'] },
      { day: 2, activities: ['Belém'] },
    ]);
  });

  it('removeActivity removes one activity', () => {
    expect(removeActivity(frozen(), 0, 0)).toEqual([
      { day: 1, activities: ['Alfama'] },
      { day: 2, activities: ['Belém'] },
    ]);
  });

  it('addActivity appends the placeholder to one day', () => {
    expect(addActivity(frozen(), 1)[1]?.activities).toEqual(['Belém', NEW_ACTIVITY_TEXT]);
  });

  it.each([
    ['updateActivity', (days: DayPlan[]) => updateActivity(days, 0, 0, 'x')],
    ['removeActivity', (days: DayPlan[]) => removeActivity(days, 0, 0)],
    ['addActivity', (days: DayPlan[]) => addActivity(days, 0)],
  ])('%s leaves its input untouched and copies only the changed day', (_name, edit) => {
    const before = frozen();
    const after = edit(before);

    expect(before).toEqual(sample());
    expect(after).not.toBe(before);
    expect(after[0]).not.toBe(before[0]);
    expect(after[0]?.activities).not.toBe(before[0]?.activities);
    // The untouched day is shared, not copied.
    expect(after[1]).toBe(before[1]);
  });
});
