import { format, parseISO } from 'date-fns';
import type { GenerateRequest, ItineraryResponse, TripCreate } from '../types/models';

/** An itinerary together with the request that produced it. */
export interface GeneratedTrip {
  request: GenerateRequest;
  result: ItineraryResponse;
}

/** What the planner form currently holds. */
export interface TripForm {
  destination: string;
  startDate: Date;
  endDate: Date;
  /** Comma-separated, as typed. */
  interests: string;
}

export function parseInterests(text: string): string[] {
  return text
    .split(',')
    .map((interest) => interest.trim())
    .filter(Boolean);
}

export function buildGenerateRequest(form: TripForm): GenerateRequest {
  return {
    destination: form.destination,
    start_date: format(form.startDate, 'yyyy-MM-dd'),
    end_date: format(form.endDate, 'yyyy-MM-dd'),
    interests: parseInterests(form.interests),
  };
}

/**
 * The trip to save for a generated itinerary. Destination, dates and interests
 * come from the request that produced it, never from the form, which may have
 * been edited since.
 */
export function tripToSave({ request, result }: GeneratedTrip): TripCreate {
  return {
    destination: request.destination,
    start_date: request.start_date,
    end_date: request.end_date,
    interests: request.interests,
    itinerary_data: result.itinerary,
  };
}

export function sameRequest(a: GenerateRequest, b: GenerateRequest): boolean {
  return (
    a.destination.trim() === b.destination.trim() &&
    a.start_date === b.start_date &&
    a.end_date === b.end_date &&
    a.interests.length === b.interests.length &&
    a.interests.every((interest, index) => interest === b.interests[index])
  );
}

/** "Mar 01, 2027 – Mar 03, 2027" for the dates of a request. */
export function describeDates(request: Pick<GenerateRequest, 'start_date' | 'end_date'>): string {
  // parseISO reads a date-only string as local time, so the day never shifts.
  const start = format(parseISO(request.start_date), 'MMM dd, yyyy');
  const end = format(parseISO(request.end_date), 'MMM dd, yyyy');
  return `${start} – ${end}`;
}
