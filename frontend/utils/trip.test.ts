import type { GenerateRequest } from '../types/models';
import {
  buildGenerateRequest,
  describeDates,
  parseInterests,
  sameRequest,
  tripToSave,
  type GeneratedTrip,
} from './trip';

const REQUEST: GenerateRequest = {
  destination: 'Lisbon',
  start_date: '2027-03-01',
  end_date: '2027-03-03',
  interests: ['food', 'trams'],
};

const GENERATED: GeneratedTrip = {
  request: REQUEST,
  result: {
    destination: 'Lisbon',
    itinerary: [{ day: 1, activities: ['Tram 28'] }],
  },
};

describe('buildGenerateRequest', () => {
  it('formats local dates and splits interests', () => {
    expect(
      buildGenerateRequest({
        destination: 'Lisbon',
        startDate: new Date(2027, 2, 1),
        endDate: new Date(2027, 2, 3, 23, 59),
        interests: ' food, trams ,,',
      }),
    ).toEqual(REQUEST);
  });
});

describe('parseInterests', () => {
  it('trims entries and drops empty ones', () => {
    expect(parseInterests(' a , ,b,')).toEqual(['a', 'b']);
    expect(parseInterests('')).toEqual([]);
  });
});

describe('tripToSave', () => {
  it('takes destination, dates and interests from the request and days from the result', () => {
    expect(tripToSave(GENERATED)).toEqual({
      destination: 'Lisbon',
      start_date: '2027-03-01',
      end_date: '2027-03-03',
      interests: ['food', 'trams'],
      itinerary_data: [{ day: 1, activities: ['Tram 28'] }],
    });
  });
});

describe('sameRequest', () => {
  it('is true for equal requests, ignoring spaces around the destination', () => {
    expect(sameRequest(REQUEST, { ...REQUEST, destination: ' Lisbon ' })).toBe(true);
  });

  it.each<[string, Partial<GenerateRequest>]>([
    ['destination', { destination: 'Porto' }],
    ['start date', { start_date: '2027-03-02' }],
    ['end date', { end_date: '2027-03-04' }],
    ['an interest', { interests: ['food', 'museums'] }],
    ['the number of interests', { interests: ['food'] }],
  ])('is false when %s differs', (_name, change) => {
    expect(sameRequest(REQUEST, { ...REQUEST, ...change })).toBe(false);
  });
});

describe('describeDates', () => {
  it('shows the calendar days of the request without a timezone shift', () => {
    expect(describeDates(REQUEST)).toBe('Mar 01, 2027 – Mar 03, 2027');
  });
});
