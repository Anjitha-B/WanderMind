// Names for the API shapes the pages use. The shapes themselves are generated
// from the backend's OpenAPI schema into ./api.ts.
import type { components } from './api';

type Schemas = components['schemas'];

export type DayPlan = Schemas['DayPlan'];
export type ItineraryResponse = Schemas['ItineraryResponse'];
export type GenerateRequest = Schemas['GenerateRequest'];
export type Trip = Schemas['Trip'];
export type TripList = Schemas['TripList'];
export type TripCreate = Schemas['TripCreate'];
export type TripUpdate = Schemas['TripUpdate'];

/**
 * The editable columns of public.profiles. The profile page talks to Supabase
 * directly, so this is not in the OpenAPI schema; it mirrors the migration in
 * supabase/migrations.
 */
export interface ProfileFields {
  firstname: string | null;
  lastname: string | null;
  date_of_birth: string | null;
  home_country: string | null;
  preferred_currency: string | null;
  preferences: string | null;
}

export const PROFILE_COLUMNS =
  'firstname,lastname,date_of_birth,home_country,preferred_currency,preferences';

/** An inline message shown next to the action it reports on. */
export interface Status {
  type: 'success' | 'error';
  text: string;
}
