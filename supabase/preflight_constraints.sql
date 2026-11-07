-- Read-only. Counts existing rows that would break each new constraint.
-- Run it in the Supabase SQL Editor, before applying the second migration.
-- Column names match the live schema pulled on 2026-11-07.
SELECT 'itineraries_data_is_array' AS check_name, count(*) AS violations
  FROM public.itineraries WHERE jsonb_typeof(itinerary_data) <> 'array'
UNION ALL SELECT 'itineraries_data_day_count', count(*)
  FROM public.itineraries
  WHERE NOT CASE WHEN jsonb_typeof(itinerary_data) = 'array'
                 THEN jsonb_array_length(itinerary_data) BETWEEN 1 AND 30
                 ELSE false END
UNION ALL SELECT 'itineraries_data_size', count(*)
  FROM public.itineraries WHERE pg_column_size(itinerary_data) > 65536
UNION ALL SELECT 'itineraries_destination_length', count(*)
  FROM public.itineraries WHERE char_length(destination) > 100
UNION ALL SELECT 'itineraries_interests_count', count(*)
  FROM public.itineraries
  WHERE NOT (interests IS NULL
             OR CASE WHEN jsonb_typeof(interests) = 'array'
                     THEN jsonb_array_length(interests) <= 10
                     ELSE false END)
UNION ALL SELECT 'profiles_firstname_length', count(*)
  FROM public.profiles WHERE char_length(firstname) > 100
UNION ALL SELECT 'profiles_lastname_length', count(*)
  FROM public.profiles WHERE char_length(lastname) > 100
UNION ALL SELECT 'profiles_home_country_length', count(*)
  FROM public.profiles WHERE char_length(home_country) > 100
UNION ALL SELECT 'profiles_preferred_currency_length', count(*)
  FROM public.profiles WHERE char_length(preferred_currency) > 10
UNION ALL SELECT 'profiles_preferences_length', count(*)
  FROM public.profiles WHERE char_length(preferences) > 2000;
