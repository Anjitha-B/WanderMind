-- Runs on every environment, including live. Never changes or deletes rows.

-- 1. SECURITY DEFINER functions: empty search_path, every reference qualified.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id);
    RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_profile_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    new.modified_at = pg_catalog.now();
    RETURN new;
END;
$$;

-- 2. CHECK constraints. These also cover writes that skip FastAPI and go straight
-- to PostgREST with a user token.
--
-- CASE guards jsonb_array_length: Postgres does not guarantee AND ordering, and
-- the function raises on non-arrays instead of returning false.
--
-- NOT VALID enforces new writes straight away without scanning existing rows.
ALTER TABLE public.itineraries
    ADD CONSTRAINT itineraries_data_is_array
        CHECK (jsonb_typeof(itinerary_data) = 'array') NOT VALID,
    ADD CONSTRAINT itineraries_data_day_count
        CHECK (CASE WHEN jsonb_typeof(itinerary_data) = 'array'
                    THEN jsonb_array_length(itinerary_data) BETWEEN 1 AND 30
                    ELSE false END) NOT VALID,
    ADD CONSTRAINT itineraries_data_size
        CHECK (pg_column_size(itinerary_data) <= 65536) NOT VALID,
    ADD CONSTRAINT itineraries_destination_length
        CHECK (char_length(destination) <= 100) NOT VALID,
    ADD CONSTRAINT itineraries_interests_count
        CHECK (interests IS NULL
               OR CASE WHEN jsonb_typeof(interests) = 'array'
                       THEN jsonb_array_length(interests) <= 10
                       ELSE false END) NOT VALID;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_firstname_length
        CHECK (char_length(firstname) <= 100) NOT VALID,
    ADD CONSTRAINT profiles_lastname_length
        CHECK (char_length(lastname) <= 100) NOT VALID,
    ADD CONSTRAINT profiles_home_country_length
        CHECK (char_length(home_country) <= 100) NOT VALID,
    ADD CONSTRAINT profiles_preferred_currency_length
        CHECK (char_length(preferred_currency) <= 10) NOT VALID,
    ADD CONSTRAINT profiles_preferrences_length
        CHECK (char_length(preferrences) <= 2000) NOT VALID;

-- 3. Validate each constraint only if no existing row breaks it. A constraint with
-- violations stays NOT VALID: enforced for new writes, existing rows left alone.
DO $$
DECLARE
    c record;
    violations bigint;
BEGIN
    FOR c IN
        SELECT conname, conrelid::regclass AS tbl, pg_get_expr(conbin, conrelid) AS expr
        FROM pg_constraint
        WHERE conrelid IN ('public.itineraries'::regclass, 'public.profiles'::regclass)
          AND contype = 'c'
          AND NOT convalidated
    LOOP
        EXECUTE format('SELECT count(*) FROM %s WHERE NOT (%s)', c.tbl, c.expr)
            INTO violations;
        IF violations = 0 THEN
            EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname);
        ELSE
            RAISE WARNING 'Constraint % left NOT VALID: % existing row(s) violate it',
                c.conname, violations;
        END IF;
    END LOOP;
END;
$$;
